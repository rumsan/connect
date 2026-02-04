import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QUEUES } from '@rumsan/connect';
import { TransportType } from '@rumsan/connect/types';
import type { Queue } from 'bull';
import { BROADCAST_CONSTANTS, SchedulerType } from './broadcast.constants';

type ScheduledBroadcastPayload = {
  sessionCuid: string;
  transportType: TransportType;
};

// Type for Redis client from Bull queue
interface RedisClient {
  hset: (key: string, field: string, value: string) => Promise<number>;
  zadd: (key: string, score: number, member: string) => Promise<number>;
  eval: (script: string, numKeys: number, ...args: any[]) => Promise<any>;
  hget: (key: string, field: string) => Promise<string | null>;
  hdel: (key: string, field: string) => Promise<number>;
  lrem: (key: string, count: number, value: string) => Promise<number>;
  lrange: (key: string, start: number, stop: number) => Promise<string[]>;
  del: (key: string) => Promise<number>;
}

@Injectable()
export class RedisZsetSchedulerService {
  constructor(
    @InjectQueue(QUEUES.SCHEDULED) private readonly scheduleQueue: Queue,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Check if Redis ZSET scheduler is enabled via configuration
   * @returns true if BROADCAST_SCHEDULER env var is set to 'redis_zset'
   */
  isEnabled(): boolean {
    return (
      (this.configService.get<string>('BROADCAST_SCHEDULER') ?? SchedulerType.BULL) ===
      SchedulerType.REDIS_ZSET
    );
  }

  /**
   * Get Redis client from Bull queue with type safety
   * @private
   * @throws Error if Redis client is not available
   */
  private getRedisClient(): RedisClient {
    const queue = this.scheduleQueue as any;
    if (!queue.client) {
      throw new Error(
        'Redis client not available from Bull queue. ' +
        'Ensure Bull is configured with Redis connection.',
      );
    }
    return queue.client as RedisClient;
  }

  private keyZset(): string {
    return (
      this.configService.get<string>('BROADCAST_SCHEDULER_ZSET_KEY') ??
      BROADCAST_CONSTANTS.DEFAULT_SCHEDULER_ZSET_KEY
    );
  }

  private keyPayloadHash(): string {
    return (
      this.configService.get<string>('BROADCAST_SCHEDULER_PAYLOAD_KEY') ??
      BROADCAST_CONSTANTS.DEFAULT_SCHEDULER_PAYLOAD_KEY
    );
  }

  private keyProcessingList(): string {
    return (
      this.configService.get<string>('BROADCAST_SCHEDULER_PROCESSING_KEY') ??
      BROADCAST_CONSTANTS.DEFAULT_SCHEDULER_PROCESSING_KEY
    );
  }

  /**
   * Schedules a broadcast session for processing at/after `runAtMs`.
   * Uses Redis ZSET score as timestamp, stores payload in a HASH.
   *
   * NOTE: We use `sessionCuid` as the job id, so scheduling the same session
   * again overwrites the timestamp/payload (useful for testing).
   * 
   * @param sessionCuid - Unique session identifier
   * @param transportType - Type of transport to use for broadcast
   * @param runAtMs - Unix timestamp (milliseconds) when to execute
   */
  async schedule(
    sessionCuid: string,
    transportType: TransportType,
    runAtMs: number,
  ): Promise<void> {
    const client = this.getRedisClient();

    const id = sessionCuid;
    const payload: ScheduledBroadcastPayload = { sessionCuid, transportType };

    // Store payload then add/update score.
    await client.hset(this.keyPayloadHash(), id, JSON.stringify(payload));
    await client.zadd(this.keyZset(), runAtMs, id);
  }

  /**
   * Atomically claims due job ids: moves them from the due ZSET into a
   * processing LIST (for crash recovery), then returns claimed ids.
   * 
   * @param nowMs - Current timestamp in milliseconds
   * @param limit - Maximum number of jobs to claim
   * @returns Array of claimed job IDs
   */
  async claimDueIds(nowMs: number, limit: number): Promise<string[]> {
    const client = this.getRedisClient();
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

  /**
   * Retrieve payload for a scheduled job
   * @param id - Job identifier
   * @returns Payload or null if not found
   */
  async getPayload(id: string): Promise<ScheduledBroadcastPayload | null> {
    const client = this.getRedisClient();
    const raw = await client.hget(this.keyPayloadHash(), id);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ScheduledBroadcastPayload;
    } catch {
      return null;
    }
  }

  /**
   * Mark a job as processed and clean up its data
   * @param id - Job identifier
   */
  async markProcessed(id: string): Promise<void> {
    const client = this.getRedisClient();
    await client.hdel(this.keyPayloadHash(), id);
    // Remove all occurrences (should typically be 1).
    await client.lrem(this.keyProcessingList(), 0, id);
  }

  /**
   * If the process crashed after claiming jobs, `processing` list can contain
   * stuck ids. This re-queues them back into the due ZSET at `nowMs`.
   * 
   * @param nowMs - Current timestamp to use for re-queued jobs
   * @returns Number of jobs re-queued
   */
  async requeueStuckProcessing(nowMs: number): Promise<number> {
    const client = this.getRedisClient();
    const ids: string[] = await client.lrange(this.keyProcessingList(), 0, -1);
    if (!ids?.length) return 0;

    for (const id of ids) {
      await client.zadd(this.keyZset(), nowMs, id);
    }
    await client.del(this.keyProcessingList());
    return ids.length;
  }
}

