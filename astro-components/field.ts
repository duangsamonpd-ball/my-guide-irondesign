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
export const fieldLabel = 'text-label font-label text-text-heading leading-label';

/** The required marker. Drawn in no Figma node; a code-only affordance. */
export const fieldRequiredMark = 'text-danger';

/** Caption SM — size/xs, weight/medium, leading/4, tracking/wide. */
const caption = 'text-caption-sm font-caption-sm leading-caption-sm tracking-caption-sm';
export const fieldHint = `${caption} text-text-support`;
/**
 * The error row: a 12px `circle-exclamation` and the message, both
 * `text/default/danger`, 4px apart (Figma `error` row in `912:1844` and every
 * Error / Error+Focus variant, 2026-09-15). The icon is what stops the error
 * being colour-only (WCAG 1.4.1); it is `aria-hidden`, the message carries the
 * meaning. `flex` not `inline-flex`: the span sits in a flex column, and the
 * row is 16 tall either way — the icon is shorter than Caption SM's leading.
 */
export const fieldError = `${caption} text-text-danger flex items-center gap-micro`;
export const fieldErrorIcon = 'size-[12px] shrink-0';

/**
 * Everything the two controls share. Box sizing is deliberately absent: Input
 * adds `h-[var(--size-input)] px-sm`, Textarea `min-h-[86px] p-sm resize-y`.
 *
 * `leading-7` is Typography/Body's leading/7, and it is why the field text
 * matches Select's trigger and its menu rows.
 */
export const fieldControl = [
  'w-full rounded-md font-sans text-body leading-body text-text-body',
  'bg-bg-input border outline-none',
  /* Hover is the FILL (Figma `912:1826`, `surface/input-hover`); the border stays
     `border/input`. `enabled:` because a disabled field still matches `:hover`. */
  'enabled:hover:bg-bg-input-hover',
  'transition-[border-color,box-shadow,background-color] duration-[var(--duration-fast)]',
  'placeholder:text-text-placeholder',
  'disabled:bg-bg-input-disabled disabled:border-border-input-disabled disabled:text-text-disabled disabled:cursor-not-allowed',
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
/*
 * Focus is 2px in Figma (`912:1834`, `1152:2649`), drawn as an INSIDE stroke that
 * is not part of layout. A 2px CSS border would take a pixel off every side of
 * the content box and move the text on focus, so the border stays 1px and the
 * second pixel is an inset shadow in the same colour, stacked under the ring.
 */
export const fieldBorder = (error: boolean): string =>
  error
    ? 'border-border-input-danger focus:[box-shadow:inset_0_0_0_1px_var(--color-border-input-danger),var(--shadow-focus-danger)]'
    /* `border-focus`, not `secondary`. Figma binds `border/focused` on the field
       nodes (Input `912:1819`, Select's open state `911:1706`), and the ring
       beside it was already on the right token — only the border was borrowing
       the brand blue. Same value, and the same in dark; what changes is that a
       focus colour can now move without moving the brand. */
    : 'border-border-input focus:border-border-focus focus:[box-shadow:inset_0_0_0_1px_var(--color-border-focus),var(--shadow-focus-blue)]';

/**
 * A stable id for the label's `for`. Prefers what the caller gave, falls back to
 * `name`, and only then invents one — unchanged from what both components did
 * inline, including the `Math.random()`, so nothing about rendering moves.
 */
export const fieldId = (id: string | undefined, name: string | undefined, prefix: string): string =>
  id ?? name ?? `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
