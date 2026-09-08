import { AudioService } from './audio.service';

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
