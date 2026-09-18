/**
 * Shared class strings for the Table component — and for every table in docs/.
 *
 * Modelled on Flowbite's default table (Ball's reference, 2026-09-18): a
 * rounded, bordered box; a tinted header row in medium weight and sentence
 * case; hairline dividers between body rows; a row header (`<th scope="row">`)
 * set in the heading colour. There is no Figma node yet — the values are the
 * system's tokens chosen to match the reference, and they are listed in the
 * README section so the drawing can be checked against them when it exists.
 *
 * WHY THE STYLING IS DESCENDANT VARIANTS (`[&_th]:…`) AND NOT A <style> BLOCK.
 * `<Table>` takes ordinary `<thead>`/`<tbody>`/`<tr>` markup through its slot,
 * and Astro's scoping stamps only what a component renders itself, so a scoped
 * rule would never reach a slotted cell. `:global()` would, but it is not a real
 * pseudo-class, and a docs page that carried the rule verbatim would have the
 * browser drop it (FormCard pays for that). A descendant variant compiles to an
 * ordinary `.class th { … }` rule that works identically in a consumer's page
 * and in docs/.
 *
 * WHY THE DOCS READ THIS FILE. The docs tables are hand-written HTML, and they
 * used to carry their own look in docs.css and in per-page rules — which is how
 * they came to differ from each other. `build-docs-tables.mjs` stamps these
 * exact strings onto every docs table and `check:tables` fails if one differs,
 * so the docs cannot drift from the component either. Because this is a `.ts`
 * file, it is named in `SHARED_MODULES` (`scripts/lib/sources.mjs`); without
 * that, Tailwind would never see these classes and none would be compiled.
 */

/** The scroll box: rounded border, card fill; a wide table scrolls inside it. */
export const tableWrap = 'relative w-full overflow-x-auto rounded-xl border border-border bg-bg-card';

/** Structure and colour, shared by both sizes. */
const tableBase =
  'w-full border-collapse text-left font-sans text-caption leading-caption text-text-support ' +
  '[&_thead]:bg-bg-section [&_thead_th]:font-medium [&_thead_th]:border-b [&_thead_th]:border-border ' +
  '[&_tbody_tr]:border-b [&_tbody_tr]:border-border [&_tbody_tr:last-child]:border-b-0 ' +
  '[&_tbody_th]:font-medium [&_tbody_th]:text-text-heading [&_tbody_th]:whitespace-nowrap';

/**
 * Cell padding per size. `md` is the reference's 24 across / 16 down with a
 * 12px header; `sm` is for dense reference tables — the docs use it.
 */
const tablePad = {
  md: '[&_th]:px-xl [&_td]:px-xl [&_thead_th]:py-sm [&_tbody_th]:py-md [&_td]:py-md',
  sm: '[&_th]:px-md [&_td]:px-md [&_thead_th]:py-xs [&_tbody_th]:py-sm [&_td]:py-sm',
} as const;

export type TableSize = keyof typeof tablePad;

/** The class list for the `<table>` element at a given size. */
export const tableClass = (size: TableSize = 'md') => `${tableBase} ${tablePad[size]}`;
