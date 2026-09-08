import { VoiceResponse } from '@rumsan/connect/types';
import { ChannelStateManager } from './channel-state.manager';
import { IVRDialPlan } from './types/ivr.types';

const dialPlan = {
  main: { prompt: 'sound:/sounds/main', options: [] },
} as unknown as IVRDialPlan;

const entry = (over: Partial<VoiceResponse> = {}): VoiceResponse => ({
  path: '1.3',
  digit: '3',
  dtmfBefore: ['1', '3'],
  recordingName: 'vr-abc-1_3-1',
  status: 'recording',
  startedAt: new Date().toISOString(),
  workerId: 'w1',
  ariRecordingUrl: 'http://box:8088/ari/recordings/stored/vr-abc-1_3-1/file',
  asteriskFile: '/var/spool/asterisk/recording/vr-abc-1_3-1.wav',
  retainedOnBox: true,
  ...over,
});

describe('ChannelStateManager voice responses', () => {
  let manager: ChannelStateManager;

  const register = (channelId = 'chan-1') => {
    manager.registerChannel({
      channelId,
      ivrDialPlan: dialPlan,
      sessionId: 'sess-1',
      broadcastLogId: 'log-1',
      address: '9800000000',
    });
    return channelId;
  };

  beforeEach(() => {
    manager = new ChannelStateManager();
  });

  it('starts with no recording', () => {
    const id = register();
    expect(manager.isRecording(id)).toBe(false);
    expect(manager.getVoiceResponses(id)).toEqual([]);
  });

  it('tracks a recording in flight', () => {
    const id = register();
    manager.startRecording(id, entry());

    expect(manager.isRecording(id)).toBe(true);
    expect(manager.getVoiceResponses(id)).toHaveLength(1);
    expect(manager.getVoiceResponses(id)[0].recordingName).toBe('vr-abc-1_3-1');
  });

  it('clears the in-flight marker on endRecording', () => {
    const id = register();
    manager.startRecording(id, entry());
    manager.endRecording(id, 'vr-abc-1_3-1');

    expect(manager.isRecording(id)).toBe(false);
    // The response itself survives — only the marker is cleared.
    expect(manager.getVoiceResponses(id)).toHaveLength(1);
  });

  it('ignores endRecording for a recording that is not the active one', () => {
    const id = register();
    manager.startRecording(id, entry());
    manager.endRecording(id, 'some-other-recording');

    expect(manager.isRecording(id)).toBe(true);
  });

  it('bumps lastActivityAt so the reaper leaves a silent caller alone', () => {
    const id = register();
    const before = manager.getState(id).lastActivityAt;
    manager.getState(id).lastActivityAt = before - 60_000;

    manager.startRecording(id, entry());

    expect(manager.getState(id).lastActivityAt).toBeGreaterThan(before - 60_000);
  });

  it('will not schedule a hangup while recording', () => {
    const id = register();
    manager.startRecording(id, entry());

    manager.scheduleHangup(id, 10_000);

    expect(manager.getState(id).hangupTimer).toBeNull();
  });

  it('schedules a hangup again once the recording ends', () => {
    const id = register();
    manager.startRecording(id, entry());
    manager.endRecording(id, 'vr-abc-1_3-1');

    manager.scheduleHangup(id, 10_000);

    expect(manager.getState(id).hangupTimer).not.toBeNull();
    manager.cancelScheduledHangup(id);
  });

  describe('after cleanup', () => {
    it('still serves the responses from the snapshot', async () => {
      const id = register();
      manager.startRecording(id, entry());
      await manager.cleanupChannel(id);

      // AMI Hangup arrives after StasisEnd and must still see the recording.
      expect(manager.getVoiceResponses(id)).toHaveLength(1);
      expect(manager.getVoiceResponses(id)[0].recordingName).toBe(
        'vr-abc-1_3-1',
      );
    });

    it('reflects a status patched by RecordingService on its own reference', async () => {
      const id = register();
      const live = entry();
      manager.startRecording(id, live);
      await manager.cleanupChannel(id);

      // RecordingService holds `live` and mutates it as the upload progresses.
      live.status = 'uploaded';
      live.url = 'https://cdn.example.org/vr.wav';
      live.retainedOnBox = false;

      const [seen] = manager.getVoiceResponses(id);
      expect(seen.status).toBe('uploaded');
      expect(seen.url).toBe('https://cdn.example.org/vr.wav');
      expect(seen.retainedOnBox).toBe(false);
    });

    it('hands a still-running recording to the cleanup callback', async () => {
      const id = register();
      const callback = jest.fn();
      manager.onRecordingCleanup(callback);
      manager.startRecording(id, entry());

      await manager.cleanupChannel(id);

      expect(callback).toHaveBeenCalledTimes(1);
      const [channelId, responses] = callback.mock.calls[0];
      expect(channelId).toBe(id);
      expect(responses[0].recordingName).toBe('vr-abc-1_3-1');
    });

    it('does not call back for a channel that never recorded', async () => {
      const id = register();
      const callback = jest.fn();
      manager.onRecordingCleanup(callback);

      await manager.cleanupChannel(id);

      expect(callback).not.toHaveBeenCalled();
    });

    it('survives a throwing cleanup callback', async () => {
      const id = register();
      manager.onRecordingCleanup(() => {
        throw new Error('boom');
      });
      manager.startRecording(id, entry());

      await expect(manager.cleanupChannel(id)).resolves.toBeUndefined();
      expect(manager.hasChannel(id)).toBe(false);
    });

    it('reports no recording in flight', async () => {
      const id = register();
      manager.startRecording(id, entry());
      await manager.cleanupChannel(id);

      expect(manager.isRecording(id)).toBe(false);
    });
  });

  it('returns nothing once the snapshot is consumed', async () => {
    const id = register();
    manager.startRecording(id, entry());
    await manager.cleanupChannel(id);
    manager.consumePlaybackSnapshot(id);

    expect(manager.getVoiceResponses(id)).toEqual([]);
  });
});
