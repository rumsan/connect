import { StorageService } from './storage.service';

const BASE_ENV = {
  R2_ACCOUNT_ID: 'acct123',
  R2_BUCKET: 'rsconnect-voice-responses',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_PUBLIC_BASE_URL: 'https://media.example.org',
};

/** Re-imports the module so the env-derived config is re-evaluated. */
const withEnv = (
  env: Record<string, string | undefined>,
  fn: (service: StorageService) => void,
) => {
  const previous = { ...process.env };
  const merged = { ...BASE_ENV, ...env };
  Object.assign(process.env, merged);
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined) delete process.env[key];
  }
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { StorageService: Fresh } = require('./storage.service');
    fn(new Fresh());
  });
  process.env = previous;
};

describe('StorageService.buildKey', () => {
  const key = (over: Record<string, unknown> = {}) => {
    let result: string;
    withEnv({}, (service) => {
      result = service.buildKey({
        workerId: 'w1',
        sessionId: 'sess-abc',
        broadcastLogId: 'log-xyz',
        recordingName: 'vr-chan-1_3-1',
        format: 'wav',
        ...over,
      } as never);
    });
    return result;
  };

  it('groups recordings under the worker that captured them', () => {
    expect(key()).toBe('voice-responses/w1/sess-abc/log-xyz/vr-chan-1_3-1.wav');
  });

  it('keeps two workers apart', () => {
    expect(key({ workerId: 'w2' })).toContain('/w2/');
    expect(key({ workerId: 'w1' })).not.toContain('/w2/');
  });

  it('drops the worker segment when there is no worker id', () => {
    const expected = 'voice-responses/sess-abc/log-xyz/vr-chan-1_3-1.wav';
    expect(key({ workerId: undefined })).toBe(expected);
    expect(key({ workerId: '' })).toBe(expected);
    expect(key({ workerId: '   ' })).toBe(expected);
  });

  it('makes a hostname fallback safe to use as a key segment', () => {
    // workerLabel() falls back to os.hostname() when WORKER_ID is unset.
    expect(key({ workerId: 'MacBook Pro.local' })).toContain(
      '/MacBook-Pro.local/',
    );
    expect(key({ workerId: 'asterisk/worker#1' })).toContain(
      '/asterisk-worker-1/',
    );
  });

  it('never emits a segment that is only punctuation', () => {
    const expected = 'voice-responses/sess-abc/log-xyz/vr-chan-1_3-1.wav';
    expect(key({ workerId: '///' })).toBe(expected);
    expect(key({ workerId: '...' })).toBe(expected);
  });

  it('caps a runaway worker id', () => {
    expect(key({ workerId: 'w'.repeat(200) }).split('/')[1]).toHaveLength(64);
  });

  it('honours the format', () => {
    expect(key({ format: 'gsm' })).toMatch(/\.gsm$/);
  });

  it('honours a custom prefix', () => {
    withEnv({ R2_RECORDING_PREFIX: 'recordings/inbound' }, (service) => {
      expect(
        service.buildKey({
          workerId: 'w1',
          sessionId: 'sess-abc',
          broadcastLogId: 'log-xyz',
          recordingName: 'vr-1',
          format: 'wav',
        }),
      ).toBe('recordings/inbound/w1/sess-abc/log-xyz/vr-1.wav');
    });
  });
});

describe('StorageService.publicUrl', () => {
  it('hangs the key off the configured public hostname', () => {
    withEnv({}, (service) => {
      expect(service.publicUrl('voice-responses/w1/a.wav')).toBe(
        'https://media.example.org/voice-responses/w1/a.wav',
      );
    });
  });

  it('tolerates a trailing slash on the base url', () => {
    withEnv({ R2_PUBLIC_BASE_URL: 'https://media.example.org/' }, (service) => {
      expect(service.publicUrl('a.wav')).toBe('https://media.example.org/a.wav');
    });
  });

  it('works with an r2.dev subdomain', () => {
    withEnv(
      { R2_PUBLIC_BASE_URL: 'https://pub-abc123.r2.dev' },
      (service) => {
        expect(service.publicUrl('voice-responses/a.wav')).toBe(
          'https://pub-abc123.r2.dev/voice-responses/a.wav',
        );
      },
    );
  });
});

describe('StorageService.configured', () => {
  it('is true once every required var is set', () => {
    withEnv({}, (service) => expect(service.configured).toBe(true));
  });

  for (const name of [
    'R2_ACCOUNT_ID',
    'R2_BUCKET',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
  ]) {
    it(`is false without ${name}`, () => {
      withEnv({ [name]: undefined }, (service) => {
        expect(service.configured).toBe(false);
        expect(service.missingConfig).toEqual([name]);
      });
    });
  }

  it('is false without R2_PUBLIC_BASE_URL, because R2 has no per-object ACLs', () => {
    // Uploading to a bucket with no known public hostname would produce a
    // report full of links that 403, and the box copy is deleted on success —
    // so there would be no second copy to recover.
    withEnv({ R2_PUBLIC_BASE_URL: undefined }, (service) => {
      expect(service.configured).toBe(false);
      expect(service.missingConfig).toEqual(['R2_PUBLIC_BASE_URL']);
    });
  });

  it('names every missing var at once', () => {
    withEnv(
      {
        R2_ACCOUNT_ID: undefined,
        R2_BUCKET: undefined,
        R2_ACCESS_KEY_ID: undefined,
        R2_SECRET_ACCESS_KEY: undefined,
        R2_PUBLIC_BASE_URL: undefined,
      },
      (service) => {
        expect(service.missingConfig).toEqual([
          'R2_ACCOUNT_ID',
          'R2_BUCKET',
          'R2_ACCESS_KEY_ID',
          'R2_SECRET_ACCESS_KEY',
          'R2_PUBLIC_BASE_URL',
        ]);
      },
    );
  });
});

describe('StorageService.putPublicObject', () => {
  it('refuses rather than silently dropping the recording when unconfigured', async () => {
    let service: StorageService;
    withEnv({ R2_BUCKET: undefined }, (fresh) => {
      service = fresh;
    });
    service.onModuleInit();

    await expect(
      service.putPublicObject('k', Buffer.from('x'), 'audio/wav'),
    ).rejects.toThrow('STORAGE_NOT_CONFIGURED');
  });
});
