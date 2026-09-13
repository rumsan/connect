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

/**
 * main
 *   1 -> jumps to 2.1
 *   2 -> sub-menu (id: closing)
 *        1 -> leaf, hangup
 *        2 -> record node
 *   3 -> hangup:true, jumps to #closing
 *   4 -> record node, hangup:true, jumps to 2
 *   5 -> jumps to main
 *   6 -> jumps to the record node 2.2
 *   7 <-> 8 jump to each other
 *   9 -> hangup:true, jumps to a node that doesn't exist
 */
const jumpPlan = {
  main: {
    prompt: 'sound:/sounds/main.wav',
    options: [
      { digit: 1, prompt: 'sound:/sounds/one.wav', jumpTo: '2.1' },
      {
        digit: 2,
        id: 'closing',
        prompt: 'sound:/sounds/two.wav',
        options: [
          { digit: 1, prompt: 'sound:/sounds/two-one.wav', hangup: true },
          {
            digit: 2,
            prompt: 'sound:/sounds/speak.wav',
            record: { prompt: 'sound:/sounds/thanks.wav' },
          },
        ],
      },
      {
        digit: 3,
        prompt: 'sound:/sounds/three.wav',
        hangup: true,
        jumpTo: '#closing',
      },
      {
        digit: 4,
        prompt: 'sound:/sounds/leave-a-message.wav',
        hangup: true,
        jumpTo: '2',
        record: { prompt: 'sound:/sounds/thanks.wav' },
      },
      { digit: 5, prompt: 'sound:/sounds/five.wav', jumpTo: 'main' },
      { digit: 6, prompt: 'sound:/sounds/six.wav', jumpTo: '2.2' },
      { digit: 7, prompt: 'sound:/sounds/seven.wav', jumpTo: '8' },
      { digit: 8, prompt: 'sound:/sounds/eight.wav', jumpTo: '7' },
      {
        digit: 9,
        prompt: 'sound:/sounds/nine.wav',
        hangup: true,
        jumpTo: '9.9',
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

  describe('jumpTo', () => {
    let hangup: jest.Mock;

    const lastPlay = () => {
      const calls = playbackService.playPrompt.mock.calls;
      return calls[calls.length - 1];
    };
    /** Runs the latest prompt's onFinished, as PlaybackFinished would. */
    const finishPrompt = async () => {
      await lastPlay()[3].onFinished();
    };

    beforeEach(() => {
      manager.registerChannel({
        channelId,
        ivrDialPlan: jumpPlan,
        sessionId: 'session-1',
        broadcastLogId: 'log-1',
        address: '+9779800000000',
      });
      hangup = jest.fn().mockResolvedValue(undefined);
      (service as unknown as { client: unknown }).client = {
        channels: { hangup },
      };
    });

    it('plays the node, then jumps instead of waiting for input', async () => {
      await service.handleDTMF(channel, '1');

      const [, media, , opts] = lastPlay();
      expect(media).toBe('sound:/sounds/one');
      expect(opts).toEqual({ onFinished: expect.any(Function) });

      await finishPrompt();

      const [, target, , targetOpts] = lastPlay();
      expect(target).toBe('sound:/sounds/two-one');
      expect(targetOpts).toEqual({ immediateHangup: true });
      // 2.1 is a leaf, so the caller sits on its parent menu.
      expect(manager.getMenuPath(channelId)).toEqual([2]);
    });

    it('reports the jump target in the IVR path', async () => {
      await service.handleDTMF(channel, '1');
      await finishPrompt();

      expect(manager.getIvrSelections(channelId)).toEqual(['1', '2.1']);
    });

    it('overrides hangup:true and descends into a sub-menu target by id', async () => {
      await service.handleDTMF(channel, '3');
      expect(lastPlay()[3]).toEqual({ onFinished: expect.any(Function) });

      await finishPrompt();

      expect(lastPlay()[1]).toBe('sound:/sounds/two');
      expect(manager.getMenuPath(channelId)).toEqual([2]);
      expect(hangup).not.toHaveBeenCalled();
    });

    it('jumps to main', async () => {
      manager.setMenuPath(channelId, [2]);
      await service.handleDTMF(channel, '0');
      await service.handleDTMF(channel, '5');
      await finishPrompt();

      expect(lastPlay()[1]).toBe('sound:/sounds/main');
      expect(manager.getMenuPath(channelId)).toEqual([]);
      expect(manager.getIvrSelections(channelId)).toEqual(['5']);
    });

    it('records at a jumped-to record node under its own path', async () => {
      await service.handleDTMF(channel, '6');
      await finishPrompt();

      expect(lastPlay()[1]).toBe('sound:/sounds/speak');
      await finishPrompt();

      const [, , , label, digit] = recordingService.start.mock.calls[0];
      expect(label).toBe('2.2');
      expect(digit).toBe('2');
      expect(manager.getMenuPath(channelId)).toEqual([2]);
    });

    describe('after a recording', () => {
      /** Presses 4, lets its prompt finish, and returns RecordingService's callback. */
      const recordAtFour = async () => {
        await service.handleDTMF(channel, '4');
        await finishPrompt();
        return recordingService.start.mock.calls[0][5] as (
          outcome: 'finished' | 'failed',
        ) => Promise<void>;
      };

      it('plays the thank-you, then jumps instead of hanging up', async () => {
        const afterRecording = await recordAtFour();
        await afterRecording('finished');

        const [, media, , opts] = lastPlay();
        expect(media).toBe('sound:/sounds/thanks');
        expect(opts).toEqual({ onFinished: expect.any(Function) });

        await finishPrompt();

        expect(lastPlay()[1]).toBe('sound:/sounds/two');
        expect(hangup).not.toHaveBeenCalled();
      });

      it('jumps straight away when the recording failed', async () => {
        const afterRecording = await recordAtFour();
        await afterRecording('failed');

        expect(lastPlay()[1]).toBe('sound:/sounds/two');
      });
    });

    it('falls back to hangup when the target does not resolve', async () => {
      await service.handleDTMF(channel, '9');

      expect(lastPlay()[3]).toEqual({ immediateHangup: true });
    });

    it('hangs up a jump loop once the budget is spent', async () => {
      await service.handleDTMF(channel, '7');

      for (let i = 0; i < 10; i++) await finishPrompt();
      expect(hangup).not.toHaveBeenCalled();

      await finishPrompt();
      expect(hangup).toHaveBeenCalledWith({ channelId });
    });

    it('refills the budget on a keypress', async () => {
      await service.handleDTMF(channel, '7');
      for (let i = 0; i < 10; i++) await finishPrompt();

      await service.handleDTMF(channel, '7');
      for (let i = 0; i < 10; i++) await finishPrompt();

      expect(hangup).not.toHaveBeenCalled();
    });
  });
});
