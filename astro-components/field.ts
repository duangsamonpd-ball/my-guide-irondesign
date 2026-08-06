/**
 * Shared class strings for the form-field shell.
 *
 * Input and Textarea render the same field: a wrapper, a label, a control, and
 * one message slot that is either a hint or an error. Only the control differs
 * — `<input>` is a fixed 44px row, `<textarea>` is a resizable box — and even
 * their state classes were byte-identical.
 *
 * That duplication was not theoretical. On 2026-08-06 the same five values were
 * edited in both files in lockstep, one commit after another: inline padding
 * 16 → 12, the hint ramp to Caption SM, the hint colour to `text-support`, the
 * label colour to `text-heading`, and `leading-7`. Five chances to change one
 * and forget the other, and no gate would have seen it — `check:parity` matches
 * each component against ITS OWN docs page, so two components drifting apart
 * from each other is exactly the shape it cannot report. The 6px form-field gap
 * (`f2796e2`) had already gone wrong that way once.
 *
 * So the values that must agree live here, and the ones that legitimately
 * differ stay inline in each component, where they read as the difference.
 *
 * ── THE TRAP, if you add to this file ───────────────────────────────────────
 *
 * `build-utilities.mjs` compiles docs/utilities.css by pointing Tailwind at the
 * components. Its `@source` glob was `*.astro` only, so a class string moved
 * into a `.ts` file would have stopped being compiled — the utility silently
 * missing from the stylesheet the 32 docs pages link, with the class still in
 * their markup. The glob now covers `.ts` as well, and `check:component-vars`
 * validates this file's strings alongside the components'. Both had to change
 * for this file to be safe to write in; neither is optional.
 */

/** The `<div>` around label, control and message. */
export const fieldShell = 'flex flex-col gap-xs w-full max-w-[340px]';

/** Figma binds Typography/Label text — Montserrat Medium, size/sm, leading/5. */
export const fieldLabel = 'text-label font-medium text-text-heading leading-5';

/** The required marker. Drawn in no Figma node; a code-only affordance. */
export const fieldRequiredMark = 'text-danger';

/** Caption SM — size/xs, weight/medium, leading/4, tracking/wide. */
const caption = 'text-caption-sm font-medium leading-4 tracking-caption-sm';
export const fieldHint = `${caption} text-text-support`;
export const fieldError = `${caption} text-danger`;

/**
 * Everything the two controls share. Box sizing is deliberately absent: Input
 * adds `h-[var(--size-input)] px-sm`, Textarea `min-h-[86px] p-sm resize-y`.
 *
 * `leading-7` is Typography/Body's leading/7, and it is why the field text
 * matches Select's trigger and its menu rows.
 */
export const fieldControl = [
  'w-full rounded-md font-sans text-body leading-7 text-text-body',
  'bg-bg-base border outline-none',
  'transition-[border-color,box-shadow] duration-[var(--duration-fast)]',
  'placeholder:text-text-placeholder',
  'disabled:bg-bg-disabled disabled:text-text-disabled disabled:cursor-not-allowed',
].join(' ');

/**
 * Border and focus ring, written as two whole branches rather than layered.
 *
 * The rules these replace were decided by SPECIFICITY, not order: `.input.error`
 * and `.input:hover` were equal with error later in the file, so an errored
 * field never took the hover border and its focus ring was always the
 * danger-coloured one. As two sets of equal-weight utilities that would have
 * come down to whichever Tailwind emitted last, which is not a thing to rely on.
 */
export const fieldBorder = (error: boolean): string =>
  error
    ? 'border-danger focus:border-danger focus:shadow-focus-magenta'
    : 'border-border hover:border-border-strong focus:border-secondary focus:shadow-focus-blue';

/**
 * A stable id for the label's `for`. Prefers what the caller gave, falls back to
 * `name`, and only then invents one — unchanged from what both components did
 * inline, including the `Math.random()`, so nothing about rendering moves.
 */
export const fieldId = (id: string | undefined, name: string | undefined, prefix: string): string =>
  id ?? name ?? `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
