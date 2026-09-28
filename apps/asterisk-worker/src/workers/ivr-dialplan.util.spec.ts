import {
  findOption,
  findPathById,
  getMenuOptions,
  getOptionAtPath,
  getPromptForPath,
  getRecordSpec,
  hasChildren,
  pathLabel,
  resolveJumpTarget,
  toMedia,
  validateDialPlan,
} from './ivr-dialplan.util';
import { IVRDialPlan, IVRMenuOption, RecordDefaults } from './types/ivr.types';

/** One branch nested, the rest terminal leaves with hangup:true. */
const mixedPlan = {
  main: {
    prompt: 'sound:/sounds/main.wav',
    options: [
      {
        digit: 1,
        destination: '',
        prompt: 'sound:/sounds/1.wav',
        hangup: false,
        options: [
          {
            digit: 1,
            destination: '',
            prompt: 'sound:/sounds/1-1.wav',
            hangup: true,
            options: [],
          },
          {
            digit: 2,
            destination: '',
            prompt: 'sound:/sounds/1-2.wav',
            hangup: true,
            options: [],
          },
        ],
      },
      {
        digit: 2,
        destination: '',
        prompt: 'sound:/sounds/2.wav',
        hangup: true,
        options: [],
      },
      {
        digit: 3,
        destination: '',
        prompt: 'sound:/sounds/3.wav',
        hangup: true,
        options: [],
      },
    ],
  },
} as unknown as IVRDialPlan;

/** Every top-level option except 4 opens a sub-menu. */
const nestedPlan = {
  main: {
    prompt: 'sound:/sounds/main.wav',
    options: [
      {
        digit: 1,
        prompt: 'sound:/sounds/1.wav',
        hangup: false,
        options: [
          { digit: 1, prompt: 'sound:/sounds/1-1.wav', hangup: false, options: [] },
          { digit: 2, prompt: 'sound:/sounds/1-2.wav', hangup: false, options: [] },
        ],
      },
      {
        digit: 2,
        prompt: 'sound:/sounds/2.wav',
        hangup: false,
        options: [
          { digit: 1, prompt: 'sound:/sounds/2-1.wav', hangup: false, options: [] },
          { digit: 2, prompt: 'sound:/sounds/2-2.wav', hangup: false, options: [] },
        ],
      },
      {
        digit: 4,
        prompt: 'sound:/sounds/4.wav',
        hangup: true,
        options: [],
      },
    ],
  },
} as unknown as IVRDialPlan;

/** Pre-nesting shape: flat options, no `options` key at all. */
const legacyPlan = {
  main: {
    prompt: 'sound:/sounds/main.wav',
    options: [
      { digit: 1, prompt: 'sound:/sounds/1.wav', hangup: true },
      { digit: 2, prompt: 'sound:/sounds/2.wav', hangup: true },
    ],
  },
} as unknown as IVRDialPlan;

/** Jump targets by path, id and main; an id on main and on a nested node. */
const jumpPlan = {
  main: {
    id: 'home',
    prompt: 'sound:/sounds/main.wav',
    options: [
      { digit: '1', id: 'intro', prompt: 'sound:/sounds/1.wav', jumpTo: '2' },
      {
        digit: 2,
        prompt: 'sound:/sounds/2.wav',
        options: [
          {
            digit: 1,
            id: 'closing',
            prompt: 'sound:/sounds/2-1.wav',
            hangup: true,
          },
        ],
      },
    ],
  },
} as unknown as IVRDialPlan;

/** A dialplan with a playable main around the given options. */
const planOf = (options: unknown[]) =>
  ({
    main: { prompt: 'sound:/sounds/main.wav', options },
  }) as unknown as IVRDialPlan;

describe('getOptionAtPath', () => {
  it('returns a nested option', () => {
    expect(getOptionAtPath(jumpPlan, [2, 1])?.id).toBe('closing');
  });

  it('returns undefined for the root and for a path that does not resolve', () => {
    expect(getOptionAtPath(jumpPlan, [])).toBeUndefined();
    expect(getOptionAtPath(jumpPlan, [2, 9])).toBeUndefined();
  });
});

describe('findPathById', () => {
  it('finds a nested node', () => {
    expect(findPathById(jumpPlan, 'closing')).toEqual([2, 1]);
  });

  it('numbers a node declared with a string digit', () => {
    expect(findPathById(jumpPlan, 'intro')).toEqual([1]);
  });

  it('returns the root for the id on main', () => {
    expect(findPathById(jumpPlan, 'home')).toEqual([]);
  });

  it('returns null for an unknown id', () => {
    expect(findPathById(jumpPlan, 'nope')).toBeNull();
  });
});

describe('resolveJumpTarget', () => {
  it('resolves main', () => {
    expect(resolveJumpTarget(jumpPlan, 'main')).toEqual([]);
  });

  it('resolves a top-level path', () => {
    expect(resolveJumpTarget(jumpPlan, '2')).toEqual([2]);
  });

  it('resolves a nested path', () => {
    expect(resolveJumpTarget(jumpPlan, '2.1')).toEqual([2, 1]);
  });

  it('matches a path against string digits', () => {
    expect(resolveJumpTarget(jumpPlan, '1')).toEqual([1]);
  });

  it('resolves an id', () => {
    expect(resolveJumpTarget(jumpPlan, '#closing')).toEqual([2, 1]);
  });

  it('resolves the id on main', () => {
    expect(resolveJumpTarget(jumpPlan, '#home')).toEqual([]);
  });

  it('tolerates a numeric jumpTo', () => {
    expect(resolveJumpTarget(jumpPlan, 2)).toEqual([2]);
  });

  it.each(['#nope', '2.9', '3', 'two', '2.', '', ' '])(
    'returns null for %p',
    (ref) => {
      expect(resolveJumpTarget(jumpPlan, ref)).toBeNull();
    },
  );

  it('returns null without a dialplan', () => {
    expect(resolveJumpTarget(null, '2')).toBeNull();
  });
});

describe('validateDialPlan', () => {
  it('passes a clean dialplan', () => {
    expect(validateDialPlan(jumpPlan)).toEqual([]);
    expect(validateDialPlan(mixedPlan)).toEqual([]);
  });

  it('flags an unresolvable target', () => {
    const plan = planOf([{ digit: 1, prompt: 'p', jumpTo: '#nope' }]);
    expect(validateDialPlan(plan)).toEqual([
      expect.stringContaining('unresolvable jumpTo "#nope" on node 1'),
    ]);
  });

  it('flags a target with nothing to play', () => {
    const plan = planOf([
      { digit: 1, prompt: 'p', jumpTo: '2' },
      { digit: 2 },
    ]);
    expect(validateDialPlan(plan)).toEqual([
      expect.stringContaining('which has no prompt and is not a record node'),
    ]);
  });

  it('flags jumpTo alongside hangup:true', () => {
    const plan = planOf([
      { digit: 1, prompt: 'p', hangup: true, jumpTo: 'main' },
    ]);
    expect(validateDialPlan(plan)).toEqual([
      'node 1 has both jumpTo and hangup:true — hangup is ignored',
    ]);
  });

  it('flags jumpTo alongside sub-options', () => {
    const plan = planOf([
      {
        digit: 1,
        prompt: 'p',
        jumpTo: 'main',
        options: [{ digit: 1, prompt: 'q' }],
      },
    ]);
    expect(validateDialPlan(plan)).toEqual([
      expect.stringContaining('node 1 has both jumpTo and sub-options'),
    ]);
  });

  it('flags duplicate and reserved ids', () => {
    const plan = planOf([
      { digit: 1, id: 'a', prompt: 'p' },
      { digit: 2, id: 'a', prompt: 'p' },
      { digit: 3, id: '#b', prompt: 'p' },
      { digit: 4, id: 'main', prompt: 'p' },
    ]);
    expect(validateDialPlan(plan)).toEqual([
      'id "a" on node 2 duplicates node 1 — "#a" resolves to 1',
      expect.stringContaining('node 3 has reserved id "#b"'),
      expect.stringContaining('node 4 has reserved id "main"'),
    ]);
  });

  it('flags a jump cycle once', () => {
    const plan = planOf([
      { digit: 1, prompt: 'p', jumpTo: '2' },
      { digit: 2, prompt: 'p', jumpTo: '1' },
    ]);
    expect(validateDialPlan(plan)).toEqual([
      expect.stringContaining('jump cycle 1 -> 2 -> 1'),
    ]);
  });

  it('flags a node that jumps to itself', () => {
    const plan = planOf([{ digit: 1, prompt: 'p', jumpTo: '1' }]);
    expect(validateDialPlan(plan)).toEqual([
      expect.stringContaining('jump cycle 1 -> 1'),
    ]);
  });
});

describe('getMenuOptions', () => {
  it('returns the main options for the root path', () => {
    expect(getMenuOptions(mixedPlan, []).map((o) => o.digit)).toEqual([1, 2, 3]);
    expect(getMenuOptions(nestedPlan, []).map((o) => o.digit)).toEqual([1, 2, 4]);
  });

  it('descends into a sub-menu', () => {
    expect(getMenuOptions(mixedPlan, [1]).map((o) => o.digit)).toEqual([1, 2]);
    expect(getMenuOptions(nestedPlan, [2]).map((o) => o.digit)).toEqual([1, 2]);
  });

  it('returns empty for a leaf', () => {
    expect(getMenuOptions(mixedPlan, [2])).toEqual([]);
    expect(getMenuOptions(nestedPlan, [1, 1])).toEqual([]);
    expect(getMenuOptions(nestedPlan, [4])).toEqual([]);
  });

  it('returns empty for a path that does not resolve', () => {
    expect(getMenuOptions(mixedPlan, [9])).toEqual([]);
    expect(getMenuOptions(mixedPlan, [1, 9])).toEqual([]);
    expect(getMenuOptions(null, [])).toEqual([]);
  });

  it('treats a dialplan with no nesting as all leaves', () => {
    expect(getMenuOptions(legacyPlan, []).map((o) => o.digit)).toEqual([1, 2]);
    expect(getMenuOptions(legacyPlan, [1])).toEqual([]);
  });
});

describe('getPromptForPath', () => {
  it('returns the main prompt at the root', () => {
    expect(getPromptForPath(mixedPlan, [])).toBe('sound:/sounds/main.wav');
  });

  it('returns the prompt of a nested node', () => {
    expect(getPromptForPath(nestedPlan, [1])).toBe('sound:/sounds/1.wav');
    expect(getPromptForPath(nestedPlan, [1, 2])).toBe('sound:/sounds/1-2.wav');
  });

  it('returns undefined for an unresolvable path', () => {
    expect(getPromptForPath(nestedPlan, [9])).toBeUndefined();
    expect(getPromptForPath(nestedPlan, [1, 9])).toBeUndefined();
  });
});

describe('findOption', () => {
  const options = getMenuOptions(nestedPlan, []);

  it('matches a numeric digit against a string keypress', () => {
    expect(findOption(options, '1')?.prompt).toBe('sound:/sounds/1.wav');
  });

  it('matches a dialplan that declares digits as strings', () => {
    const stringDigits = [{ digit: '1', prompt: 'sound:/sounds/s1.wav' }];
    expect(findOption(stringDigits, '1')?.prompt).toBe('sound:/sounds/s1.wav');
    expect(findOption(stringDigits, 1)?.prompt).toBe('sound:/sounds/s1.wav');
  });

  it('returns undefined for an absent digit', () => {
    expect(findOption(options, '3')).toBeUndefined();
  });

  it('returns undefined for a non-numeric keypress', () => {
    expect(findOption(options, '*')).toBeUndefined();
    expect(findOption(options, '#')).toBeUndefined();
  });
});

describe('hasChildren', () => {
  it('distinguishes a sub-menu from a leaf', () => {
    expect(hasChildren(getMenuOptions(nestedPlan, [])[0])).toBe(true);
    expect(hasChildren(getMenuOptions(nestedPlan, [])[2])).toBe(false);
    expect(hasChildren(getMenuOptions(legacyPlan, [])[0])).toBe(false);
  });
});

describe('pathLabel', () => {
  it('renders a path as a dotted label', () => {
    expect(pathLabel([])).toBe('');
    expect(pathLabel([1])).toBe('1');
    expect(pathLabel([1, 2])).toBe('1.2');
  });
});

describe('toMedia', () => {
  it('strips a trailing .wav', () => {
    expect(toMedia('sound:/sounds/abc.wav')).toBe('sound:/sounds/abc');
  });

  it('leaves a .wav inside the name alone', () => {
    expect(toMedia('sound:/sounds/a.wavy.wav')).toBe('sound:/sounds/a.wavy');
    expect(toMedia('sound:/sounds/a.wavb')).toBe('sound:/sounds/a.wavb');
  });

  it('is a no-op when there is no extension', () => {
    expect(toMedia('sound:option-is-invalid')).toBe('sound:option-is-invalid');
  });
});

describe('getRecordSpec', () => {
  const defaults: RecordDefaults = {
    maxDurationSeconds: 60,
    maxSilenceSeconds: 4,
    beep: true,
    terminateOn: '#',
    maxDurationCeilingSeconds: 120,
  };

  const option = (over: Partial<IVRMenuOption> = {}): IVRMenuOption => ({
    digit: 3,
    prompt: 'sound:/sounds/3.wav',
    ...over,
  });

  it('returns null for a plain option', () => {
    expect(getRecordSpec(option(), defaults)).toBeNull();
    expect(getRecordSpec(undefined, defaults)).toBeNull();
  });

  it('fills every field from the defaults for a bare record node', () => {
    expect(getRecordSpec(option({ record: { enabled: true } }), defaults)).toEqual({
      maxDurationSeconds: 60,
      maxSilenceSeconds: 4,
      beep: true,
      terminateOn: '#',
      thanksMedia: undefined,
    });
  });

  it('treats a present record object as enabled', () => {
    expect(getRecordSpec(option({ record: {} }), defaults)).not.toBeNull();
  });

  it('honours an explicit opt-out', () => {
    expect(getRecordSpec(option({ record: { enabled: false } }), defaults)).toBeNull();
  });

  it('accepts the action shorthand', () => {
    expect(getRecordSpec(option({ action: 'record' }), defaults)).not.toBeNull();
    expect(getRecordSpec(option({ action: 'RECORD' }), defaults)).not.toBeNull();
    expect(getRecordSpec(option({ action: 'transfer' }), defaults)).toBeNull();
  });

  it('takes per-node overrides', () => {
    expect(
      getRecordSpec(
        option({
          record: {
            enabled: true,
            maxDurationSeconds: 30,
            maxSilenceSeconds: 2,
            beep: false,
            terminateOn: '*',
          },
        }),
        defaults,
      ),
    ).toEqual({
      maxDurationSeconds: 30,
      maxSilenceSeconds: 2,
      beep: false,
      terminateOn: '*',
      thanksMedia: undefined,
    });
  });

  it('clamps a duration above the ceiling', () => {
    expect(
      getRecordSpec(option({ record: { maxDurationSeconds: 600 } }), defaults)
        .maxDurationSeconds,
    ).toBe(120);
  });

  it("treats ARI's 0 (no limit) as the ceiling, so the reaper can't cut a caller off", () => {
    expect(
      getRecordSpec(option({ record: { maxDurationSeconds: 0 } }), defaults)
        .maxDurationSeconds,
    ).toBe(120);
  });

  it('falls back on a nonsense duration', () => {
    expect(
      getRecordSpec(option({ record: { maxDurationSeconds: -5 } }), defaults)
        .maxDurationSeconds,
    ).toBe(60);
  });

  it('keeps maxSilenceSeconds: 0, which legitimately disables silence detection', () => {
    expect(
      getRecordSpec(option({ record: { maxSilenceSeconds: 0 } }), defaults)
        .maxSilenceSeconds,
    ).toBe(0);
  });

  it('converts the post-record prompt to ARI media', () => {
    expect(
      getRecordSpec(
        option({ record: { prompt: 'sound:/sounds/thanks.wav' } }),
        defaults,
      ).thanksMedia,
    ).toBe('sound:/sounds/thanks');
  });
});
