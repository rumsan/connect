import axios from 'axios';
import { EventEmitter } from 'events';
import { ChannelStateManager } from './channel-state.manager';
import { RecordingService } from './recording.service';
import { IVRDialPlan, ResolvedRecordSpec } from './types/ivr.types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const spec: ResolvedRecordSpec = {
  maxDurationSeconds: 60,
  maxSilenceSeconds: 4,
  beep: true,
  terminateOn: '#',
};

const dialPlan = {
  main: { prompt: 'sound:/sounds/main', options: [] },
} as unknown as IVRDialPlan;

/** Stands in for ari-client's LiveRecording resource. */
class FakeLiveRecording extends EventEmitter {
  constructor(public name: string) {
    super();
  }
}

describe('RecordingService', () => {
  let manager: ChannelStateManager;
  let service: RecordingService;
  let storage: {
    configured: boolean;
    buildKey: jest.Mock;
    putPublicObject: jest.Mock;
  };
  let queue: { updateDetailsVoice: jest.Mock };
  let live: FakeLiveRecording;
  let channel: { record: jest.Mock };
  const channelId = 'chan-1';

  /** Runs microtasks and any timers the settle path is waiting on. */
  const flush = async (times = 20) => {
    for (let i = 0; i < times; i++) {
      jest.advanceTimersByTime(5_000);
      await Promise.resolve();
      await Promise.resolve();
    }
  };

  const start = (afterRecording = jest.fn().mockResolvedValue(undefined)) =>
    service.start(
      channel as never,
      channelId,
      spec,
      '1.3',
      '3',
      afterRecording,
    );

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    manager = new ChannelStateManager();
    manager.registerChannel({
      channelId,
      ivrDialPlan: dialPlan,
      sessionId: 'sess-1',
      broadcastLogId: 'log-1',
      address: '9800000000',
    });

    storage = {
      configured: true,
      buildKey: jest.fn().mockReturnValue('voice-responses/sess-1/log-1/vr.wav'),
      putPublicObject: jest.fn().mockResolvedValue({
        url: 'https://cdn.example.org/voice-responses/sess-1/log-1/vr.wav',
        key: 'voice-responses/sess-1/log-1/vr.wav',
        sizeBytes: 1024,
      }),
    };
    queue = { updateDetailsVoice: jest.fn().mockResolvedValue(undefined) };

    service = new RecordingService(
      manager,
      storage as never,
      queue as never,
    );
    service.onModuleInit();

    live = null;
    channel = { record: jest.fn().mockResolvedValue(undefined) };
    service.setClient({
      LiveRecording: (_id: string, values: { name: string }) => {
        live = new FakeLiveRecording(values.name);
        return live;
      },
    } as never);

    mockedAxios.get.mockResolvedValue({ data: Buffer.from('fake audio') });
    mockedAxios.delete.mockResolvedValue({});
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  describe('start', () => {
    it('populates the Asterisk location before any I/O', async () => {
      const entry = await start();

      expect(entry.status).toBe('recording');
      expect(entry.workerId).toBeTruthy();
      expect(entry.ariRecordingUrl).toContain(
        `/ari/recordings/stored/${entry.recordingName}/file`,
      );
      expect(entry.asteriskFile).toContain(`${entry.recordingName}.wav`);
      expect(entry.retainedOnBox).toBe(true);
    });

    it('records the IVR path and the DTMF that led there', async () => {
      manager.recordDtmf(channelId, '1');
      manager.recordDtmf(channelId, '3');

      const entry = await start();

      expect(entry.path).toBe('1.3');
      expect(entry.digit).toBe('3');
      expect(entry.dtmfBefore).toEqual(['1', '3']);
    });

    it('passes the spec through to ARI', async () => {
      await start();

      expect(channel.record).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'wav',
          maxDurationSeconds: 60,
          maxSilenceSeconds: 4,
          beep: true,
          ifExists: 'overwrite',
          terminateOn: '#',
        }),
        live,
      );
    });

    it('marks the channel as recording', async () => {
      await start();
      expect(manager.isRecording(channelId)).toBe(true);
    });

    it('fails the entry rather than throwing when ARI rejects', async () => {
      channel.record.mockRejectedValue(new Error('channel gone'));

      const entry = await start();

      expect(entry.status).toBe('failed');
      expect(entry.error).toContain('channel gone');
      expect(manager.isRecording(channelId)).toBe(false);
    });

    it('fails the entry rather than throwing when there is no ARI client', async () => {
      service.clearClient();

      const entry = await start();

      expect(entry.status).toBe('failed');
      expect(entry.error).toContain('ARI client not available');
    });
  });

  describe('upload', () => {
    it('uploads once RecordingFinished fires', async () => {
      const entry = await start();
      live.emit('RecordingFinished', {}, { duration: 22 });
      await flush();

      expect(storage.putPublicObject).toHaveBeenCalledTimes(1);
      expect(entry.status).toBe('uploaded');
      expect(entry.url).toBe(
        'https://cdn.example.org/voice-responses/sess-1/log-1/vr.wav',
      );
      expect(entry.objectKey).toBe('voice-responses/sess-1/log-1/vr.wav');
      expect(entry.sizeBytes).toBe(1024);
      expect(entry.durationSeconds).toBe(22);
    });

    it('files the object under the worker that captured it', async () => {
      const entry = await start();
      live.emit('RecordingFinished', {}, {});
      await flush();

      expect(storage.buildKey).toHaveBeenCalledWith({
        workerId: entry.workerId,
        sessionId: 'sess-1',
        broadcastLogId: 'log-1',
        recordingName: entry.recordingName,
        format: 'wav',
      });
    });

    it('deletes from the box only after a confirmed upload', async () => {
      const entry = await start();
      live.emit('RecordingFinished', {}, { duration: 3 });
      await flush();

      expect(mockedAxios.delete).toHaveBeenCalledTimes(1);
      expect(entry.retainedOnBox).toBe(false);
    });

    it('keeps the response uploaded when the box delete fails', async () => {
      mockedAxios.delete.mockRejectedValue(new Error('403'));

      const entry = await start();
      live.emit('RecordingFinished', {}, {});
      await flush();

      expect(entry.status).toBe('uploaded');
      expect(entry.retainedOnBox).toBe(true);
    });

    it('clears the recording marker so DTMF works again', async () => {
      await start();
      live.emit('RecordingFinished', {}, {});
      await flush();

      expect(manager.isRecording(channelId)).toBe(false);
    });

    it('runs the post-recording handler', async () => {
      const afterRecording = jest.fn().mockResolvedValue(undefined);
      await start(afterRecording);
      live.emit('RecordingFinished', {}, {});
      await flush();

      expect(afterRecording).toHaveBeenCalledWith('finished');
    });

    it('does not upload twice when cleanup races a late RecordingFinished', async () => {
      const entry = await start();

      // Hangup tears the channel down first...
      service.onChannelCleanup(channelId, [entry]);
      // ...then the event finally arrives.
      live.emit('RecordingFinished', {}, {});
      await flush();

      expect(storage.putPublicObject).toHaveBeenCalledTimes(1);
      expect(entry.status).toBe('uploaded');
    });
  });

  describe('hangup mid-recording', () => {
    it('polls the box and uploads the partial recording', async () => {
      const entry = await start();

      service.onChannelCleanup(channelId, [entry]);
      await flush();

      expect(entry.status).toBe('uploaded');
      expect(storage.putPublicObject).toHaveBeenCalledTimes(1);
    });

    it('fails cleanly when the recording never gets stored', async () => {
      mockedAxios.get.mockRejectedValue(new Error('404'));

      const entry = await start();
      service.onChannelCleanup(channelId, [entry]);
      await flush(40);

      expect(entry.status).toBe('failed');
      expect(entry.error).toContain('RECORDING_NOT_STORED');
      expect(entry.retainedOnBox).toBe(true);
      expect(mockedAxios.delete).not.toHaveBeenCalled();
    });

    it('leaves an already-uploaded response alone', async () => {
      const entry = await start();
      live.emit('RecordingFinished', {}, {});
      await flush();

      service.onChannelCleanup(channelId, [entry]);
      await flush();

      expect(storage.putPublicObject).toHaveBeenCalledTimes(1);
    });
  });

  describe('RecordingFailed', () => {
    it('marks the entry failed and still runs the post-recording handler', async () => {
      const afterRecording = jest.fn().mockResolvedValue(undefined);
      const entry = await start(afterRecording);

      live.emit('RecordingFailed', {}, { cause: 'no space left' });
      await flush();

      expect(entry.status).toBe('failed');
      expect(entry.error).toContain('no space left');
      expect(afterRecording).toHaveBeenCalledWith('failed');
      expect(storage.putPublicObject).not.toHaveBeenCalled();
    });
  });

  describe('the report never depends on storage', () => {
    const attach = (entry: { recordingName: string }) =>
      service.attachReport(channelId, {
        broadcastLogId: 'log-1',
        voiceResponses: [entry as never],
      });

    it('sends the follow-up with the URL on success', async () => {
      const entry = await start();
      attach(entry);
      live.emit('RecordingFinished', {}, {});
      await flush();

      expect(queue.updateDetailsVoice).toHaveBeenCalledTimes(1);
      const payload = queue.updateDetailsVoice.mock.calls[0][0];
      expect(payload.broadcastLogId).toBe('log-1');
      expect(payload.details.voiceResponses).toHaveLength(1);
      expect(payload.details.voiceResponses[0].status).toBe('uploaded');
    });

    it('omits status so the hangup-computed one is not overwritten', async () => {
      const entry = await start();
      attach(entry);
      live.emit('RecordingFinished', {}, {});
      await flush();

      expect(
        queue.updateDetailsVoice.mock.calls[0][0].status,
      ).toBeUndefined();
    });

    it('still sends the follow-up when every upload attempt fails', async () => {
      storage.putPublicObject.mockRejectedValue(new Error('s3 unreachable'));

      const entry = await start();
      attach(entry);
      live.emit('RecordingFinished', {}, {});
      await flush(40);

      expect(queue.updateDetailsVoice).toHaveBeenCalledTimes(1);
      const [reported] =
        queue.updateDetailsVoice.mock.calls[0][0].details.voiceResponses;
      expect(reported.status).toBe('failed');
      expect(reported.error).toContain('UPLOAD_FAILED');
      // The audio is still recoverable from the box.
      expect(reported.retainedOnBox).toBe(true);
      expect(reported.ariRecordingUrl).toContain('/ari/recordings/stored/');
      expect(reported.asteriskFile).toContain('/var/spool/asterisk/recording/');
      expect(mockedAxios.delete).not.toHaveBeenCalled();
    });

    it('retries a failing upload before giving up', async () => {
      storage.putPublicObject
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue({
          url: 'https://cdn.example.org/vr.wav',
          key: 'k',
          sizeBytes: 10,
        });

      const entry = await start();
      attach(entry);
      live.emit('RecordingFinished', {}, {});
      await flush(40);

      expect(storage.putPublicObject).toHaveBeenCalledTimes(2);
      expect(entry.status).toBe('uploaded');
    });

    it('reports without uploading when storage is not configured', async () => {
      storage.configured = false;

      const entry = await start();
      attach(entry);
      live.emit('RecordingFinished', {}, {});
      await flush();

      expect(storage.putPublicObject).not.toHaveBeenCalled();
      const [reported] =
        queue.updateDetailsVoice.mock.calls[0][0].details.voiceResponses;
      expect(reported.status).toBe('failed');
      expect(reported.error).toBe('STORAGE_NOT_CONFIGURED');
      expect(reported.retainedOnBox).toBe(true);
    });

    it('sends the complete array, since the connect-side merge is shallow', async () => {
      const first = await start();
      live.emit('RecordingFinished', {}, {});
      await flush();

      const second = await start();
      service.attachReport(channelId, {
        broadcastLogId: 'log-1',
        voiceResponses: [first as never, second as never],
      });
      live.emit('RecordingFinished', {}, {});
      await flush();

      const reported =
        queue.updateDetailsVoice.mock.calls[0][0].details.voiceResponses;
      expect(reported).toHaveLength(2);
      expect(reported.map((r) => r.recordingName)).toEqual([
        first.recordingName,
        second.recordingName,
      ]);
    });

    it('waits for every recording on the call before reporting', async () => {
      const first = await start();
      const firstLive = live;
      const second = await start();

      service.attachReport(channelId, {
        broadcastLogId: 'log-1',
        voiceResponses: [first as never, second as never],
      });

      firstLive.emit('RecordingFinished', {}, {});
      await flush();
      expect(queue.updateDetailsVoice).not.toHaveBeenCalled();

      live.emit('RecordingFinished', {}, {});
      await flush();
      expect(queue.updateDetailsVoice).toHaveBeenCalledTimes(1);
    });

    it('reports only once', async () => {
      const entry = await start();
      attach(entry);
      live.emit('RecordingFinished', {}, {});
      await flush();
      await flush();

      expect(queue.updateDetailsVoice).toHaveBeenCalledTimes(1);
    });

    it('force-fails and reports when an upload stalls past the TTL', async () => {
      // Never resolves — the upload hangs forever.
      storage.putPublicObject.mockImplementation(() => new Promise(() => {}));

      const entry = await start();
      attach(entry);
      live.emit('RecordingFinished', {}, {});
      await flush(60);

      expect(queue.updateDetailsVoice).toHaveBeenCalledTimes(1);
      const [reported] =
        queue.updateDetailsVoice.mock.calls[0][0].details.voiceResponses;
      expect(reported.status).toBe('failed');
      expect(reported.error).toContain('UPLOAD_TIMEOUT');
    });

    it('swallows a queue publish failure', async () => {
      queue.updateDetailsVoice.mockRejectedValue(new Error('amqp down'));

      const entry = await start();
      attach(entry);
      live.emit('RecordingFinished', {}, {});

      await expect(flush()).resolves.toBeUndefined();
    });
  });
});
