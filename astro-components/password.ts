/**
 * The password rule, in one place: PasswordChecklist renders from it on the
 * server and re-checks with it in the browser, and a form's own submit handler
 * (or a server endpoint written in TS) can import the same function rather than
 * restate the rule. The backend has to agree with it, or a password the
 * checklist ticks gets refused on submit.
 *
 * The rule is NIST SP 800-63B-4 (final, July 2025), adopted by Ball 2026-11-17:
 * at least 15 characters, and nothing else.
 *
 *  · 15 is the minimum for a password used as the ONLY factor; 800-63B-4 allows
 *    8 only inside multi-factor authentication. A form behind MFA may pass a
 *    lower `minLength`; nothing here knows whether it is.
 *  · NO composition rule. 800-63B-4 says verifiers SHALL NOT require a mix of
 *    character types. The rule this replaced (Ball, 2026-09-21: 12 characters
 *    AND 3 of lowercase/uppercase/number/special) is exactly that, and it is
 *    what produces `Summer2026!`. Every character is allowed — spaces, Thai,
 *    emoji — and every one counts.
 *  · LENGTH counts code points (`[...value].length`), not UTF-16 units — as
 *    800-63B-4 counts them, and as the person typing sees them. `.length` would
 *    count most emoji as two and pass a 14-character password.
 *
 * What this function cannot do, and 800-63B-4 also requires (SHALL) of the
 * backend: compare the password against a blocklist of breached and commonly
 * used passwords. That needs the list, so it lives on the server.
 */

export const PASSWORD_MIN_LENGTH = 15;

export interface PasswordResult {
  /** Characters, counted as code points. */
  length: number;
  ok: boolean;
}

export function checkPassword(value: string, minLength: number = PASSWORD_MIN_LENGTH): PasswordResult {
  const length = [...value].length;
  return { length, ok: length >= minLength };
}

/** One sentence for a screen reader and for `setCustomValidity`. */
export function passwordSummary(r: PasswordResult, minLength: number = PASSWORD_MIN_LENGTH): string {
  if (r.ok) return 'Password meets the requirement.';
  const n = minLength - r.length;
  return `Password needs ${n} more character${n === 1 ? '' : 's'}.`;
}
