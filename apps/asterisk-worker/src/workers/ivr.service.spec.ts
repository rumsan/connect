import { Channel } from 'ari-client';
import { ChannelStateManager } from './channel-state.manager';
import { IVRService } from './ivr.service';
import { IVRDialPlan, RecordDefaults } from './types/ivr.types';

const INVALID_PROMPT = 'sound:option-is-invalid';

const recordDefaults: RecordDefaults = {
  maxDurationSeconds: 60,
  maxSilenceSeconds: 4,
  beep: true,
  terminateOn: '#',
  maxDurationCeilingSeconds: 120,
};

/**
 * main
 *   1 -> sub-menu
 *        2 -> leaf
 *   3 -> record node
 */
const dialPlan = {
  main: {
    prompt: 'sound:/sounds/main.wav',
    options: [
      {
        digit: 1,
        prompt: 'sound:/sounds/one.wav',
        options: [{ digit: 2, prompt: 'sound:/sounds/one-two.wav' }],
      },
      {
        digit: 3,
        prompt: 'sound:/sounds/leave-a-message.wav',
        record: { prompt: 'sound:/sounds/thanks.wav' },
      },
    ],
  },
} as unknown as IVRDialPlan;

describe('IVRService.handleDTMF', () => {
  const channelId = 'chan-1';
  const channel = { id: channelId } as Channel;

  let manager: ChannelStateManager;
  let service: IVRService;
  let playbackService: { playPrompt: jest.Mock; playAudio: jest.Mock };
  let recordingService: { defaults: RecordDefaults; start: jest.Mock };

  /** Media args of every playPrompt call, for terser assertions. */
  const played = () => playbackService.playPrompt.mock.calls.map((c) => c[1]);

  beforeEach(() => {
    manager = new ChannelStateManager();
    jest.spyOn(manager, 'stopActivePlayback').mockResolvedValue(undefined);
    jest.spyOn(manager, 'cancelScheduledHangup').mockImplementation(() => {
      /* no timer in tests */
    });

    playbackService = {
      playPrompt: jest.fn().mockResolvedValue(undefined),
      playAudio: jest.fn().mockResolvedValue(undefined),
    };
    recordingService = {
      defaults: recordDefaults,
      start: jest.fn().mockResolvedValue(undefined),
    };

    service = new IVRService(
      {} as never,
      {} as never,
      manager,
      playbackService as never,
      recordingService as never,
    );

    manager.registerChannel({
      channelId,
      ivrDialPlan: dialPlan,
      sessionId: 'session-1',
      broadcastLogId: 'log-1',
      address: '+9779800000000',
    });
  });

  describe('the recording terminator', () => {
    it('is ignored once the recording has already ended', async () => {
      // What the caller hits after a record node: the '#' that ended the
      // recording arrives as ordinary DTMF, by which point RecordingFinished
      // has cleared the in-flight flag.
      expect(manager.isRecording(channelId)).toBe(false);

      await service.handleDTMF(channel, '#');

      expect(played()).not.toContain(INVALID_PROMPT);
      expect(playbackService.playPrompt).not.toHaveBeenCalled();
    });

    it('leaves the post-record prompt playing', async () => {
      await service.handleDTMF(channel, '#');

      // stopActivePlayback would cut the "thanks" prompt off mid-sentence.
      expect(manager.stopActivePlayback).not.toHaveBeenCalled();
    });

    it('is ignored on a plain menu too', async () => {
      manager.setMenuPath(channelId, [1]);

      await service.handleDTMF(channel, '#');

      expect(playbackService.playPrompt).not.toHaveBeenCalled();
      expect(manager.getMenuPath(channelId)).toEqual([1]);
    });
  });

  describe('the mid-recording guard', () => {
    it('honours a recording that was in flight when the digit was pressed', async () => {
      // terminateOn: 'any' — the terminator is a digit that would otherwise
      // select a menu option. The flag is already cleared by the time the
      // queued handler runs, so the captured value is what must win.
      expect(manager.isRecording(channelId)).toBe(false);

      await service.handleDTMF(channel, '1', true);

      expect(playbackService.playPrompt).not.toHaveBeenCalled();
      expect(manager.getMenuPath(channelId)).toEqual([]);
    });

    it('falls back to the live flag when the caller passes nothing', async () => {
      manager.startRecording(channelId, {
        recordingName: 'rec-1',
        path: '3',
      } as never);

      await service.handleDTMF(channel, '1');

      expect(playbackService.playPrompt).not.toHaveBeenCalled();
    });
  });

  describe('ordinary navigation', () => {
    it('still announces a digit that misses an option', async () => {
      await service.handleDTMF(channel, '5');

      expect(played()).toContain(INVALID_PROMPT);
    });

    it('descends into a sub-menu', async () => {
      await service.handleDTMF(channel, '1');

      expect(manager.getMenuPath(channelId)).toEqual([1]);
      expect(played()).toContain('sound:/sounds/one');
    });

    it("'0' resets to the main menu", async () => {
      manager.setMenuPath(channelId, [1]);

      await service.handleDTMF(channel, '0');

      expect(manager.getMenuPath(channelId)).toEqual([]);
      expect(played()).toContain('sound:/sounds/main');
    });

    it("'*' steps one level back", async () => {
      manager.setMenuPath(channelId, [1]);

      await service.handleDTMF(channel, '*');

      expect(manager.getMenuPath(channelId)).toEqual([]);
      expect(played()).toContain('sound:/sounds/main');
    });

    it('starts a recording at a record node', async () => {
      await service.handleDTMF(channel, '3');

      // The prompt plays first; recording begins from its onFinished callback.
      const [, media, , options] = playbackService.playPrompt.mock.calls[0];
      expect(media).toBe('sound:/sounds/leave-a-message');
      expect(recordingService.start).not.toHaveBeenCalled();

      await options.onFinished();
      expect(recordingService.start).toHaveBeenCalled();
    });
  });
});
