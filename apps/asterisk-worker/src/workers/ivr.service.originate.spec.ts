import { BatchManger } from '@rsconnect/queue';
import { BroadcastStatus, QueueBroadcastLog } from '@rumsan/connect/types';
import { QUEUES } from '@rumsan/connect';
import { ChannelStateManager } from './channel-state.manager';
import { IVRService } from './ivr.service';

const broadcastLog = (): QueueBroadcastLog => ({
  queue: QUEUES.TRANSPORT_VOICE,
  broadcastLogId: 'log-1',
  broadcastId: 'b-1',
  sessionId: 's1',
  attempt: 1,
  status: BroadcastStatus.PENDING,
});

const broadcast = { session: 's1', address: '9800000000' } as never;

describe('IVRService.sendBroadcast originate', () => {
  let batchManager: BatchManger;
  let channels: { originate: jest.Mock; hangup: jest.Mock };
  let channelState: ChannelStateManager;
  let service: IVRService;

  beforeEach(() => {
    jest.useFakeTimers();
    batchManager = new BatchManger({
      confirmReadiness: jest.fn().mockResolvedValue(true),
    } as never);
    channelState = new ChannelStateManager();
    channels = {
      originate: jest.fn(),
      hangup: jest.fn().mockResolvedValue(undefined),
    };
    service = new IVRService(
      batchManager,
      {} as never,
      channelState,
      {} as never,
      {} as never,
    );
    Object.assign(service as unknown as Record<string, unknown>, {
      client: { channels },
      isConnected: true,
    });
  });

  afterEach(() => jest.useRealTimers());

  it('fails a call whose originate never returns, instead of hanging', async () => {
    channels.originate.mockReturnValue(new Promise(() => undefined));

    const sent = service.sendBroadcast(broadcast, broadcastLog());
    const assertion = expect(sent).rejects.toThrow('ORIGINATE_TIMEOUT');
    await jest.advanceTimersByTimeAsync(15_001);
    await assertion;

    const channelId = channels.originate.mock.calls[0][0].channelId;
    expect(channels.hangup).toHaveBeenCalledWith({ channelId });
    // Left for the dispatch loop's _reportFailure to report and drain.
    expect(batchManager.processingBroadcasts.size).toBe(0);
    expect(channelState.hasChannel(channelId)).toBe(false);
  });

  it('monitors the call before the originate reply arrives', async () => {
    let resolve!: () => void;
    channels.originate.mockReturnValue(
      new Promise<void>((r) => (resolve = r)),
    );

    const sent = service.sendBroadcast(broadcast, broadcastLog());
    await Promise.resolve();
    const channelId = channels.originate.mock.calls[0][0].channelId;
    // A Hangup arriving now would find the log.
    expect(batchManager.getLog(channelId)).toBeDefined();

    resolve();
    await sent;
    expect(batchManager.getLog(channelId)).toBeDefined();
  });

  it('does not throw when the Hangup was already reported', async () => {
    let reject!: (e: Error) => void;
    channels.originate.mockReturnValue(
      new Promise((_, r) => (reject = r)),
    );

    const sent = service.sendBroadcast(broadcast, broadcastLog());
    await Promise.resolve();
    const channelId = channels.originate.mock.calls[0][0].channelId;

    // The AMI Hangup handler reports and releases the slot first.
    await batchManager.endMonitoring(channelId);
    reject(new Error('socket hang up'));

    await expect(sent).resolves.toBeUndefined();
  });

  it('rethrows a plain originate failure and releases the slot', async () => {
    channels.originate.mockRejectedValue(new Error('Allocation failed'));

    await expect(
      service.sendBroadcast(broadcast, broadcastLog()),
    ).rejects.toThrow('Allocation failed');
    expect(batchManager.processingBroadcasts.size).toBe(0);
    expect(channels.hangup).not.toHaveBeenCalled();
  });
});
