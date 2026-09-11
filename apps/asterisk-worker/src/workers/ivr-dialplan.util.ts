import {
  IVRDialPlan,
  IVRMenuOption,
  RecordDefaults,
  ResolvedRecordSpec,
} from './types/ivr.types';

/**
 * Pure helpers for walking a (possibly nested) IVR dialplan.
 *
 * A caller's position in the tree is a `path` of digits taken from the root:
 * `[]` is the main menu, `[1]` is the sub-menu under main's option 1, `[1, 2]`
 * the sub-menu under that option's option 2, and so on.
 */

/** Options of the menu at `path`, or `[]` if the path doesn't resolve. */
export function getMenuOptions(
  dialPlan: IVRDialPlan | null,
  path: number[],
): IVRMenuOption[] {
  let options = dialPlan?.main?.options ?? [];
  for (const digit of path) {
    const option = findOption(options, digit);
    if (!option) return [];
    options = option.options ?? [];
  }
  return options;
}

/** Prompt of the menu at `path` — `main.prompt` for the root. */
export function getPromptForPath(
  dialPlan: IVRDialPlan | null,
  path: number[],
): string | undefined {
  if (path.length === 0) return dialPlan?.main?.prompt;

  let options = dialPlan?.main?.options ?? [];
  let option: IVRMenuOption | undefined;
  for (const digit of path) {
    option = findOption(options, digit);
    if (!option) return undefined;
    options = option.options ?? [];
  }
  return option?.prompt;
}

/** Match a DTMF digit against a menu's options. Tolerates numeric or string digits. */
export function findOption(
  options: IVRMenuOption[],
  digit: number | string,
): IVRMenuOption | undefined {
  const wanted = Number(digit);
  if (Number.isNaN(wanted)) return undefined;
  return options.find((option) => Number(option.digit) === wanted);
}

export function hasChildren(option: IVRMenuOption): boolean {
  return (option.options?.length ?? 0) > 0;
}

/** `[1, 2]` -> `'1.2'`, for logs and for reporting which node was selected. */
export function pathLabel(path: number[]): string {
  return path.join('.');
}

/**
 * Turn a prepared prompt (`sound:/var/lib/asterisk/sounds/<hash>.wav`) into the
 * media string ARI expects. Anchored so a hash containing `.wav` mid-string is
 * left alone.
 */
export function toMedia(prompt: string): string {
  return prompt.replace(/\.wav$/i, '');
}

/**
 * Resolve an option's record settings, or `null` if it isn't a record node.
 *
 * A node records when it carries `record: { … }` (unless `enabled` is
 * explicitly false) or the shorthand `action: 'record'`. Everything the
 * dialplan leaves out comes from the env defaults, and `maxDurationSeconds` is
 * clamped so a long message can't outlive the channel reaper's TTL.
 */
export function getRecordSpec(
  option: IVRMenuOption | undefined,
  defaults: RecordDefaults,
): ResolvedRecordSpec | null {
  if (!option) return null;

  const record = option.record;
  const enabledByShorthand = option.action?.toLowerCase() === 'record';

  if (!record && !enabledByShorthand) return null;
  if (record?.enabled === false) return null;

  const requested = record?.maxDurationSeconds ?? defaults.maxDurationSeconds;
  const maxDurationSeconds = clampDuration(
    requested,
    defaults.maxDurationSeconds,
    defaults.maxDurationCeilingSeconds,
  );

  const maxSilenceSeconds = nonNegative(
    record?.maxSilenceSeconds,
    defaults.maxSilenceSeconds,
  );

  return {
    maxDurationSeconds,
    maxSilenceSeconds,
    beep: record?.beep ?? defaults.beep,
    terminateOn: record?.terminateOn || defaults.terminateOn,
    thanksMedia: record?.prompt ? toMedia(record.prompt) : undefined,
  };
}

/** 0 means "no limit" to ARI, which the reaper would cut short — treat it as the ceiling. */
function clampDuration(
  requested: number,
  fallback: number,
  ceiling: number,
): number {
  const value =
    typeof requested === 'number' && Number.isFinite(requested) && requested > 0
      ? requested
      : requested === 0
        ? ceiling
        : fallback;
  return Math.min(value, ceiling);
}

function nonNegative(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}
