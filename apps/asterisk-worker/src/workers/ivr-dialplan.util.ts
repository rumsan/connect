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

/** `jumpTo` value that targets the root menu. */
export const MAIN_TARGET = 'main';

const DIGIT_PATH = /^\d+(\.\d+)*$/;

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

/** The option at `path`, or `undefined` for the root or a path that doesn't resolve. */
export function getOptionAtPath(
  dialPlan: IVRDialPlan | null,
  path: number[],
): IVRMenuOption | undefined {
  let options = dialPlan?.main?.options ?? [];
  let option: IVRMenuOption | undefined;
  for (const digit of path) {
    option = findOption(options, digit);
    if (!option) return undefined;
    options = option.options ?? [];
  }
  return option;
}

/** Prompt of the menu at `path` — `main.prompt` for the root. */
export function getPromptForPath(
  dialPlan: IVRDialPlan | null,
  path: number[],
): string | undefined {
  if (path.length === 0) return dialPlan?.main?.prompt;
  return getOptionAtPath(dialPlan, path)?.prompt;
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

/** Whether the option records the caller — see `getRecordSpec` for the rules. */
export function isRecordNode(option: IVRMenuOption | undefined): boolean {
  if (!option) return false;
  const enabledByShorthand = option.action?.toLowerCase() === 'record';
  if (!option.record && !enabledByShorthand) return false;
  return option.record?.enabled !== false;
}

/** A record node may have no prompt of its own; every other option needs one. */
export function isPlayableNode(option: IVRMenuOption | undefined): boolean {
  return !!option && (!!option.prompt || isRecordNode(option));
}

/** Whether entering the node at `path` (the root included) does anything. */
export function isPlayableTarget(
  dialPlan: IVRDialPlan | null,
  path: number[],
): boolean {
  if (path.length === 0) return !!dialPlan?.main?.prompt;
  return isPlayableNode(getOptionAtPath(dialPlan, path));
}

export function hasJump(option: IVRMenuOption | undefined): boolean {
  const jumpTo = option?.jumpTo as unknown;
  return (
    (typeof jumpTo === 'string' && jumpTo.trim() !== '') ||
    typeof jumpTo === 'number'
  );
}

/** Path of the node carrying `id` — `[]` for `main` — or `null`. First match wins. */
export function findPathById(
  dialPlan: IVRDialPlan | null,
  id: string,
): number[] | null {
  if (!dialPlan?.main || !id) return null;
  if (dialPlan.main.id === id) return [];

  const walk = (
    options: IVRMenuOption[],
    prefix: number[],
  ): number[] | null => {
    for (const option of options) {
      const path = [...prefix, Number(option.digit)];
      if (option.id === id) return path;
      const found = walk(option.options ?? [], path);
      if (found) return found;
    }
    return null;
  };
  return walk(dialPlan.main.options ?? [], []);
}

/**
 * The only reader of `jumpTo` strings: `"main"` -> `[]`, `"#id"` -> that node's
 * path, `"2.1"` -> `[2, 1]` if the node exists. Anything else is `null`. A new
 * addressing scheme belongs here and nowhere else.
 */
export function resolveJumpTarget(
  dialPlan: IVRDialPlan | null,
  ref: string | number | undefined,
): number[] | null {
  if (!dialPlan?.main || ref === undefined || ref === null) return null;
  const target = String(ref).trim();

  if (target === MAIN_TARGET) return [];
  if (target.startsWith('#')) return findPathById(dialPlan, target.slice(1));
  if (!DIGIT_PATH.test(target)) return null;

  const path = target.split('.').map(Number);
  return getOptionAtPath(dialPlan, path) ? path : null;
}

/**
 * Authoring mistakes a dialplan can carry around jumps and ids, as log-ready
 * sentences. None of them is fatal — the worker falls back safely at call time
 * — so this exists to tell an operator before callers find out.
 */
export function validateDialPlan(dialPlan: IVRDialPlan | null): string[] {
  const warnings: string[] = [];
  if (!dialPlan?.main) return warnings;

  const nodes: Array<{ option: IVRMenuOption; path: number[] }> = [];
  const walk = (options: IVRMenuOption[] | undefined, prefix: number[]) => {
    for (const option of options ?? []) {
      const path = [...prefix, Number(option.digit)];
      nodes.push({ option, path });
      walk(option.options, path);
    }
  };
  walk(dialPlan.main.options, []);

  const idOwners = new Map<string, string>();
  const checkId = (id: unknown, label: string) => {
    if (id === undefined || id === null) return;
    if (typeof id !== 'string' || id.trim() === '') {
      warnings.push(`node ${label} has an empty or non-string id`);
      return;
    }
    if (id.startsWith('#') || id === MAIN_TARGET) {
      warnings.push(
        `node ${label} has reserved id "${id}" — ids must not start with '#' or be '${MAIN_TARGET}'`,
      );
    }
    const owner = idOwners.get(id);
    if (owner !== undefined) {
      warnings.push(
        `id "${id}" on node ${label} duplicates node ${owner} — "#${id}" resolves to ${owner}`,
      );
    } else {
      idOwners.set(id, label);
    }
  };
  checkId(dialPlan.main.id, MAIN_TARGET);
  for (const { option, path } of nodes) checkId(option.id, pathLabel(path));

  for (const { option, path } of nodes) {
    if (!hasJump(option)) continue;
    const label = pathLabel(path);
    const target = resolveJumpTarget(dialPlan, option.jumpTo);

    if (!target) {
      warnings.push(
        `unresolvable jumpTo "${option.jumpTo}" on node ${label} — ignored, the node ${
          option.hangup === true ? 'hangs up' : 'waits for input'
        } instead`,
      );
      continue;
    }
    if (!isPlayableTarget(dialPlan, target)) {
      warnings.push(
        `jumpTo "${option.jumpTo}" on node ${label} targets ${
          pathLabel(target) || MAIN_TARGET
        }, which has no prompt and is not a record node — ignored`,
      );
      continue;
    }
    if (option.hangup === true) {
      warnings.push(
        `node ${label} has both jumpTo and hangup:true — hangup is ignored`,
      );
    }
    if (hasChildren(option)) {
      warnings.push(
        `node ${label} has both jumpTo and sub-options — the sub-options are reachable only by pressing during its prompt`,
      );
    }
  }

  // Follow jumpTo edges from every node; a label seen twice on one walk is a
  // loop a silent caller never leaves. A jump to main ends the walk — main
  // has no jumpTo and waits for input.
  const reportedCycles = new Set<string>();
  for (const { path } of nodes) {
    const visited: string[] = [];
    let current: number[] | null = path;
    while (current && current.length > 0) {
      const label = pathLabel(current);
      const seenAt = visited.indexOf(label);
      if (seenAt !== -1) {
        const cycle = visited.slice(seenAt);
        const key = [...cycle].sort().join(',');
        if (!reportedCycles.has(key)) {
          reportedCycles.add(key);
          warnings.push(
            `jump cycle ${[...cycle, label].join(
              ' -> ',
            )} — a caller who presses nothing loops until IVR_MAX_CONSECUTIVE_JUMPS hangs up`,
          );
        }
        break;
      }
      visited.push(label);
      const option = getOptionAtPath(dialPlan, current);
      current = hasJump(option)
        ? resolveJumpTarget(dialPlan, option?.jumpTo)
        : null;
    }
  }

  return warnings;
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
  if (!isRecordNode(option)) return null;

  const record = option?.record;

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
