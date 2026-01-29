import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QUEUES } from '@rumsan/connect';
import { TransportType } from '@rumsan/connect/types';
import type { Queue } from 'bull';

type ScheduledBroadcastPayload = {
  sessionCuid: string;
  transportType: TransportType;
};

@Injectable()
export class RedisZsetSchedulerService {
  constructor(
    @InjectQueue(QUEUES.SCHEDULED) private readonly scheduleQueue: Queue,
    private readonly configService: ConfigService,
  ) {}

  isEnabled() {
    return (
      (this.configService.get<string>('BROADCAST_SCHEDULER') ?? 'bull') ===
      'redis_zset'
    );
  }

  private keyZset() {
    return this.configService.get<string>('BROADCAST_SCHEDULER_ZSET_KEY')
      ? this.configService.get<string>('BROADCAST_SCHEDULER_ZSET_KEY')
      : 'connect:broadcast:schedule:zset';
  }

  private keyPayloadHash() {
    return this.configService.get<string>('BROADCAST_SCHEDULER_PAYLOAD_KEY')
      ? this.configService.get<string>('BROADCAST_SCHEDULER_PAYLOAD_KEY')
      : 'connect:broadcast:schedule:payload';
  }

  private keyProcessingList() {
    return this.configService.get<string>('BROADCAST_SCHEDULER_PROCESSING_KEY')
      ? this.configService.get<string>('BROADCAST_SCHEDULER_PROCESSING_KEY')
      : 'connect:broadcast:schedule:processing';
  }

  /**
   * Schedules a broadcast session for processing at/after `runAtMs`.
   * Uses Redis ZSET score as timestamp, stores payload in a HASH.
   *
   * NOTE: We use `sessionCuid` as the job id, so scheduling the same session
   * again overwrites the timestamp/payload (useful for testing).
   */
  async schedule(
    sessionCuid: string,
    transportType: TransportType,
    runAtMs: number,
  ) {
    const client: any = (this.scheduleQueue as any).client;
    if (!client) {
      throw new Error(
        'Redis client not available from Bull queue (scheduleQueue.client).',
      );
    }

    const id = sessionCuid;
    const payload: ScheduledBroadcastPayload = { sessionCuid, transportType };

    // Store payload then add/update score.
    await client.hset(this.keyPayloadHash(), id, JSON.stringify(payload));
    await client.zadd(this.keyZset(), runAtMs, id);
  }

  /**
   * Atomically claims due job ids: moves them from the due ZSET into a
   * processing LIST (for crash recovery), then returns claimed ids.
   */
  async claimDueIds(nowMs: number, limit: number): Promise<string[]> {
    const client: any = (this.scheduleQueue as any).client;
    const lua = `
local zkey = KEYS[1]
local pkey = KEYS[2]
local now = tonumber(ARGV[1])
local lim = tonumber(ARGV[2])

local ids = redis.call('ZRANGEBYSCORE', zkey, '-inf', now, 'LIMIT', 0, lim)
if (#ids == 0) then
  return ids
end

for i=1,#ids do
  local id = ids[i]
  redis.call('ZREM', zkey, id)
  redis.call('RPUSH', pkey, id)
end

return ids
`;

    const ids: string[] = await client.eval(
      lua,
      2,
      this.keyZset(),
      this.keyProcessingList(),
      nowMs,
      limit,
    );
    return Array.isArray(ids) ? ids : [];
  }

  async getPayload(id: string): Promise<ScheduledBroadcastPayload | null> {
    const client: any = (this.scheduleQueue as any).client;
    const raw = await client.hget(this.keyPayloadHash(), id);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ScheduledBroadcastPayload;
    } catch {
      return null;
    }
  }

  async markProcessed(id: string) {
    const client: any = (this.scheduleQueue as any).client;
    await client.hdel(this.keyPayloadHash(), id);
    // Remove all occurrences (should typically be 1).
    await client.lrem(this.keyProcessingList(), 0, id);
  }

  /**
   * If the process crashed after claiming jobs, `processing` list can contain
   * stuck ids. This re-queues them back into the due ZSET at `nowMs`.
   */
  async requeueStuckProcessing(nowMs: number) {
    const client: any = (this.scheduleQueue as any).client;
    const ids: string[] = await client.lrange(this.keyProcessingList(), 0, -1);
    if (!ids?.length) return 0;

    for (const id of ids) {
      await client.zadd(this.keyZset(), nowMs, id);
    }
    await client.del(this.keyProcessingList());
    return ids.length;
  }
}

