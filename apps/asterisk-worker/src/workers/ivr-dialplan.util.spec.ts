import {
  findOption,
  getMenuOptions,
  getPromptForPath,
  hasChildren,
  pathLabel,
  toMedia,
} from './ivr-dialplan.util';
import { IVRDialPlan } from './types/ivr.types';

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
