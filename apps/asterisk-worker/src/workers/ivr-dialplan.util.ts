import { IVRDialPlan, IVRMenuOption } from './types/ivr.types';

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
