/**
 * Shared class strings for the two choice controls, Checkbox and Radio.
 *
 * They are twins and the code already said so before this file existed — the
 * `.rdo-card` rule carried the comment "same reasoning as .cbx-card, and the two
 * must stay twins". Everything except the indicator itself is identical: the row,
 * the visually-hidden input, the label and description, the card wrapper, and the
 * disabled treatment. The difference is a square that fills and ticks against a
 * ring that thickens and fills a dot.
 *
 * The evidence is the same as `field.ts`: one commit before this one, both files
 * had their label size changed from `--font-size-label` to `--font-size-label-lg`
 * in lockstep, and no gate could have caught one being missed — `check:parity`
 * matches each component against ITS OWN docs page, so two components drifting
 * apart from each other is the shape it cannot see.
 *
 * ── ADDING TO THIS FILE ─────────────────────────────────────────────────────
 *
 * Two scripts must know about a shared module or its classes are invisible:
 * `build-utilities.mjs` (`SHARED_TS`) compiles them, and
 * `check-component-vars.mjs` validates them. Both lists name this file. Neither
 * is optional — see the note at the top of `field.ts`.
 *
 * ── WHY `group-has-[:checked]:` AND NOT `peer-checked:` ─────────────────────
 *
 * The tick and the dot are DESCENDANTS of the box, not siblings of the input, so
 * `peer-*` cannot reach them: a peer variant only matches a later sibling of the
 * peer. Driving every checked-state rule from `group-has-[:checked]` on the
 * <label> keeps one mechanism for the whole component instead of two.
 *
 * Worth knowing when testing: Chrome does not reliably re-evaluate `:has()` when
 * `input.checked` is set by SCRIPT. It is correct for real clicks and for the
 * keyboard, and `state-diff` drives real input for exactly this reason — but a
 * test that assigns `.checked = true` will see the box not update.
 */

/** The <label> wrapping everything. `group` is what the checked state keys off. */
export const choiceRow = 'group inline-flex items-start gap-xs select-none';

/** Visually hidden, still focusable, still in the tab order. */
export const choiceInput = 'absolute w-px h-px opacity-0 pointer-events-none';

/** Shared by the checkbox box and the radio ring. Shape and size are added per component. */
export const choiceControl = [
  'shrink-0 mt-px inline-flex items-center justify-center',
  'bg-bg-base border',
  'transition-[background-color,border-color,border-width,box-shadow] duration-[var(--duration-fast)]',
  'group-has-[:focus-visible]:shadow-focus-blue',
].join(' ');

/** Box / ring diameter. Figma ships SM 16 · MD 20 · LG 24. */
export const choiceSize = {
  sm: 'size-[var(--size-box-sm)]',
  md: 'size-[var(--size-box-md)]',
  lg: 'size-[var(--size-box-lg)]',
} as const;

/** Label and description column. */
export const choiceText = 'flex flex-col gap-micro';

/**
 * Figma binds `Typography/Label text LG` here — 16/20/500 — not the 14px label
 * ramp. It is the reason that style exists; see reference-figma-form-field-nodes.
 */
export const choiceLabel = 'text-label-lg font-medium text-text-body leading-5';
export const choiceDesc = 'text-caption text-text-muted leading-5 max-w-[360px]';

/**
 * The card wrapper. No max-width on purpose: the card takes the width of its
 * slot so it fills a grid cell instead of leaving a gap, and standalone it still
 * shrinks to fit because the row is inline-flex and the description caps itself.
 */
export const choiceCard = [
  /* `bg-bg-card` is not decoration. Figma fills the default card with
     `surface/card`; this left it transparent, which looks identical on the white
     docs pages and wrong the moment a card sits on a shaded band or in dark
     mode, where it would show the section through itself. Found by measuring the
     card against the node rather than by looking at it — 2026-08-06. */
  'border border-border rounded-lg p-sm bg-bg-card',
  'transition-[border-color,background-color] duration-[var(--duration-fast)]',
  'hover:border-border-strong',
  'has-[:checked]:border-border-selected has-[:checked]:bg-bg-card-alt',
].join(' ');

export const choiceDisabled = 'cursor-not-allowed opacity-50';
export const choiceEnabled = 'cursor-pointer';
