/**
 * The password rule, in one place: PasswordChecklist renders from it on the
 * server and re-checks with it in the browser, and a form's own submit handler
 * (or a server endpoint written in TS) can import the same function rather than
 * restate the rule.
 *
 * The rule is Ball's, 2026-09-21: at least 12 characters, AND at least 3 of the
 * 4 character types. Two definitions he settled on 2026-11-11, because the
 * backend has to agree with both or a password the checklist ticks gets
 * refused on submit:
 *
 *  · LENGTH counts code points (`[...value].length`), not UTF-16 units. An
 *    emoji is one character to the person typing it; `.length` would count
 *    most of them as two and pass an 11-character password.
 *  · SPECIAL is ASCII punctuation only — the 32 characters
 *    !"#$%&'()*+,-./:;<=>?@[\]^_`{|}~ . A space, a Thai letter or an accented
 *    letter is none of the four types. They are still ALLOWED in a password;
 *    they just do not count towards the 3.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MIN_TYPES = 3;

export interface PasswordType {
  id: 'lower' | 'upper' | 'number' | 'special';
  label: string;
  test: RegExp;
}

export const passwordTypes: readonly PasswordType[] = [
  { id: 'lower', label: 'Lowercase letter', test: /[a-z]/ },
  { id: 'upper', label: 'Uppercase letter', test: /[A-Z]/ },
  { id: 'number', label: 'Number', test: /[0-9]/ },
  /* The four ASCII punctuation ranges: ! to /, : to @, [ to `, { to ~. */
  { id: 'special', label: 'Special character', test: /[!-\/:-@[-`{-~]/ },
];

export interface PasswordResult {
  length: number;
  lengthOk: boolean;
  types: { id: PasswordType['id']; label: string; ok: boolean }[];
  /** How many of the four types the value contains. */
  have: number;
  typesOk: boolean;
  ok: boolean;
}

export function checkPassword(
  value: string,
  minLength: number = PASSWORD_MIN_LENGTH,
  minTypes: number = PASSWORD_MIN_TYPES,
): PasswordResult {
  const length = [...value].length;
  const types = passwordTypes.map((t) => ({ id: t.id, label: t.label, ok: t.test.test(value) }));
  const have = types.filter((t) => t.ok).length;
  const lengthOk = length >= minLength;
  const typesOk = have >= minTypes;
  return { length, lengthOk, types, have, typesOk, ok: lengthOk && typesOk };
}

/** One sentence for a screen reader and for `setCustomValidity`. */
export function passwordSummary(r: PasswordResult, minLength: number, minTypes: number): string {
  if (r.ok) return 'Password meets all requirements.';
  const miss: string[] = [];
  if (!r.lengthOk) {
    const n = minLength - r.length;
    miss.push(`${n} more character${n === 1 ? '' : 's'}`);
  }
  if (!r.typesOk) {
    const n = minTypes - r.have;
    miss.push(`${n} more character type${n === 1 ? '' : 's'}`);
  }
  return `Password needs ${miss.join(' and ')}.`;
}
