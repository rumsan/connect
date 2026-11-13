import { AudioService, AudioUnavailableError } from './audio.service';

/**
 * These lock the coupling between the dialplan schema and prompt preparation.
 *
 * A record node's post-recording prompt is nested at `record.prompt`, and that
 * key name is load-bearing: `extractAudioURLs` has to discover the URL so the
 * audio is uploaded to the box, and `replacePromptsIfMatch` has to rewrite it
 * to the prepared `sound:` path. Rename the key and the audio still uploads but
 * the raw https URL survives into the dialplan, so ARI is handed
 * `sound:https://…` and the caller hears nothing.
 */
describe('AudioService prompt preparation', () => {
  // The constructor only news up an SFTP client — nothing connects.
  const service = new AudioService();

  const planWithRecordNode = () => ({
    main: {
      prompt: 'https://cdn.example.org/main.mp3',
      options: [
        {
          digit: 1,
          destination: 'https://not-audio.example.org/ignore-me',
          prompt: 'https://cdn.example.org/one.mp3',
          hangup: false,
          options: [
            {
              digit: 3,
              prompt: 'https://cdn.example.org/leave-a-message.mp3',
              hangup: true,
              options: [],
              record: {
                enabled: true,
                maxDurationSeconds: 60,
                terminateOn: '#',
                prompt: 'https://cdn.example.org/thank-you.mp3',
              },
            },
          ],
        },
      ],
    },
  });

  describe('extractAudioURLs', () => {
    it('finds the prompt nested inside a record node', async () => {
      const urls = await service.extractAudioURLs(planWithRecordNode());
      expect(urls).toContain('https://cdn.example.org/thank-you.mp3');
    });

    it('finds every prompt in the tree exactly once', async () => {
      const urls = await service.extractAudioURLs(planWithRecordNode());
      expect(urls).toEqual([
        'https://cdn.example.org/main.mp3',
        'https://cdn.example.org/one.mp3',
        'https://cdn.example.org/leave-a-message.mp3',
        'https://cdn.example.org/thank-you.mp3',
      ]);
    });

    it('still skips destination', async () => {
      const urls = await service.extractAudioURLs(planWithRecordNode());
      expect(urls).not.toContain('https://not-audio.example.org/ignore-me');
    });

    it('ignores the non-URL knobs on a record node', async () => {
      const urls = await service.extractAudioURLs({
        record: { enabled: true, terminateOn: '#', maxDurationSeconds: 60 },
      });
      expect(urls).toEqual([]);
    });

    it('ignores jumpTo and id', async () => {
      const urls = await service.extractAudioURLs({
        digit: 1,
        id: 'closing',
        jumpTo: '#closing',
        prompt: 'https://cdn.example.org/one.mp3',
      });
      expect(urls).toEqual(['https://cdn.example.org/one.mp3']);
    });
  });

  describe('replacePromptsIfMatch', () => {
    it('rewrites a record node prompt to the prepared sound path', async () => {
      const plan = planWithRecordNode();
      await service.replacePromptsIfMatch(
        plan,
        'https://cdn.example.org/thank-you.mp3',
        '/var/spool/asterisk/recording/rsconnect/thanks.wav',
      );

      expect(plan.main.options[0].options[0].record.prompt).toBe(
        'sound:/var/spool/asterisk/recording/rsconnect/thanks.wav',
      );
    });

    it('leaves the option prompt beside it untouched', async () => {
      const plan = planWithRecordNode();
      await service.replacePromptsIfMatch(
        plan,
        'https://cdn.example.org/thank-you.mp3',
        '/sounds/thanks.wav',
      );

      expect(plan.main.options[0].options[0].prompt).toBe(
        'https://cdn.example.org/leave-a-message.mp3',
      );
    });

    it('never rewrites destination', async () => {
      const plan = planWithRecordNode();
      await service.replacePromptsIfMatch(
        plan,
        'https://not-audio.example.org/ignore-me',
        '/sounds/nope.wav',
      );

      expect(plan.main.options[0].destination).toBe(
        'https://not-audio.example.org/ignore-me',
      );
    });
  });
});

/**
 * An unreachable audio URL must fail the session (AudioUnavailableError), not
 * leave the worker holding it until the gate timeout. Temporary failures get a
 * few retries first.
 */
describe('AudioService.fetchMedia', () => {
  const service = new AudioService();
  const url = 'https://gw.example.org/ipfs/bafy';
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;

  const res = (status: number, body = '', statusText = '') =>
    new Response(body || null, { status, statusText });

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = realFetch;
  });

  /** Runs fetchMedia to completion through its retry back-off. */
  const run = async () => {
    const result = service.fetchMedia(url).then(
      (r) => ({ ok: r }),
      (err) => ({ err }),
    );
    await jest.runAllTimersAsync();
    return result as Promise<{ ok?: Response; err?: Error }>;
  };

  it('fails at once on a 4xx, with status and body in the reason', async () => {
    fetchMock.mockResolvedValue(res(400, 'invalid gateway token', 'Bad Request'));

    const { err } = await run();

    expect(err).toBeInstanceOf(AudioUnavailableError);
    expect((err as AudioUnavailableError).errorTag).toBe('AUDIO_UNAVAILABLE');
    expect(err.message).toContain(url);
    expect(err.message).toContain('HTTP 400 Bad Request: invalid gateway token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a 5xx and returns the response once it succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(res(502))
      .mockResolvedValueOnce(res(200, 'RIFF'));

    const { ok, err } = await run();

    expect(err).toBeUndefined();
    expect(ok.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retries on a network error', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), {
        cause: { code: 'ENOTFOUND' },
      }),
    );

    const { err } = await run();

    expect(err).toBeInstanceOf(AudioUnavailableError);
    expect(err.message).toContain('ENOTFOUND');
    expect(err.message).toContain('gave up after 3 attempts');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('treats 429 as temporary', async () => {
    fetchMock
      .mockResolvedValueOnce(res(429))
      .mockResolvedValueOnce(res(200, 'RIFF'));

    const { ok } = await run();

    expect(ok.status).toBe(200);
  });
});
