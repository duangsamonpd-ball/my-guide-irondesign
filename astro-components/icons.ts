/**
 * Shared icon path data for the Astro components.
 *
 * The library inlines icon vectors rather than shipping an icon font or a CDN
 * link, so components stay self-contained (see "Icon strategy" in README.md).
 * Before this module the same paths were retyped in several components — `key`
 * lived in three, `check` in three, `circle-check` and `triangle-exclamation` in
 * two each — which is exactly the kind of copy that drifts.
 *
 * Each entry is a single `d` string plus the viewBox it was authored against.
 * Components keep their own `<svg>` wrapper so per-use classes, sizing and
 * `aria-hidden` stay where they are read.
 *
 *   import { icons } from '../icons';
 *   <svg viewBox={icons.key.viewBox} fill="currentColor"><path d={icons.key.path} /></svg>
 *
 * Deliberately NOT here: Checkbox's tick (stroke-drawn, needs `fill="none"` plus
 * stroke attributes), ProductMenu's CTA glyph (needs `fill-rule="evenodd"`), and
 * the single-use vectors in TopNav / ProductMenu. They are used once, carry
 * attributes this shape does not model, and moving them would buy nothing.
 *
 * To add an icon, follow the extraction note in README.md — don't hand-draw path
 * data.
 */

export interface Icon {
  /** viewBox the path was authored against — always render the pair together. */
  viewBox: string;
  /** Single path `d`. Drawn with `fill="currentColor"` by every caller. */
  path: string;
}

export const icons = {
  /* Font Awesome Free Solid — shared by several components */
  /** file-invoice — FormCard, TrialKeyCard */
  quote: { viewBox: '0 0 384 512', path: 'M64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-277.5c0-17-6.7-33.3-18.7-45.3L258.7 18.7C246.7 6.7 230.5 0 213.5 0L64 0zM325.5 176L232 176c-13.3 0-24-10.7-24-24L208 58.5 325.5 176zM64 384l0-64c0-17.7 14.3-32 32-32l192 0c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32L96 416c-17.7 0-32-14.3-32-32zM88 64l48 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-48 0c-13.3 0-24-10.7-24-24S74.7 64 88 64zm0 96l48 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-48 0c-13.3 0-24-10.7-24-24s10.7-24 24-24z' },
  /** key — Footer, FormCard, TrialKeyCard */
  key: { viewBox: '0 0 512 512', path: 'M336 352c97.2 0 176-78.8 176-176S433.2 0 336 0 160 78.8 160 176c0 18.7 2.9 36.8 8.3 53.7L7 391c-4.5 4.5-7 10.6-7 17l0 80c0 13.3 10.7 24 24 24l80 0c13.3 0 24-10.7 24-24l0-40 40 0c13.3 0 24-10.7 24-24l0-40 40 0c6.4 0 12.5-2.5 17-7l33.3-33.3c16.9 5.4 35 8.3 53.7 8.3zM376 96a40 40 0 1 1 0 80 40 40 0 1 1 0-80z' },
  /**
   * check — no component renders this statically any more. Select did until
   * 2026-08-06, when Figma `911:1688` turned out to draw the tick as an 8x6
   * STROKE, which this module deliberately does not model (see the note above
   * about Checkbox's tick), so it moved inline.
   *
   * Kept, not deleted: `icons` is a public export, and FormCard and TrialKeyCard
   * resolve icons dynamically — `icons[icon]`, `icons[submitIcon]` — so a
   * consumer passing `"check"` reaches this entry and no grep would show it.
   */
  check: { viewBox: '0 0 448 512', path: 'M434.8 70.1c14.3 10.4 17.5 30.4 7.1 44.7l-256 352c-5.5 7.6-14 12.3-23.4 13.1s-18.5-2.7-25.1-9.3l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l101.5 101.5 234-321.7c10.4-14.3 30.4-17.5 44.7-7.1z' },
  /** circle-check — FileUpload, Notice */
  circleCheck: { viewBox: '0 0 512 512', path: 'M256 512a256 256 0 1 1 0-512 256 256 0 1 1 0 512zM374 145.7c-10.7-7.8-25.7-5.4-33.5 5.3L221.1 315.2 169 263.1c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l72 72c5 5 11.8 7.5 18.8 7s13.4-4.1 17.5-9.8L379.3 179.2c7.8-10.7 5.4-25.7-5.3-33.5z' },
  /** triangle-exclamation — FileUpload, Notice */
  triangleExclamation: { viewBox: '0 0 512 512', path: 'M256 0c14.7 0 28.2 8.1 35.2 21l216 400c6.7 12.4 6.4 27.4-.8 39.5S486.1 480 472 480L40 480c-14.1 0-27.2-7.4-34.4-19.5s-7.5-27.1-.8-39.5l216-400c7-12.9 20.5-21 35.2-21zm0 352a32 32 0 1 0 0 64 32 32 0 1 0 0-64zm0-192c-18.2 0-32.7 15.5-31.4 33.7l7.4 104c.9 12.5 11.4 22.3 23.9 22.3 12.6 0 23-9.7 23.9-22.3l7.4-104c1.3-18.2-13.1-33.7-31.4-33.7z' },

  /* Font Awesome Free Solid — one component each, kept here so a whole icon map lives in one place */
  /** cloud-arrow-up — FileUpload */
  cloudArrowUp: { viewBox: '0 0 576 512', path: 'M144 480c-79.5 0-144-64.5-144-144 0-63.4 41-117.2 97.9-136.5-1.3-7.7-1.9-15.5-1.9-23.5 0-79.5 64.5-144 144-144 55.4 0 103.5 31.3 127.6 77.1 14.2-8.3 30.8-13.1 48.4-13.1 53 0 96 43 96 96 0 15.7-3.8 30.6-10.5 43.7 44 20.3 74.5 64.7 74.5 116.3 0 70.7-57.3 128-128 128l-304 0zM305 191c-9.4-9.4-24.6-9.4-33.9 0l-72 72c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l31-31 0 102.1c0 13.3 10.7 24 24 24s24-10.7 24-24l0-102.1 31 31c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-72-72z' },
  /** circle-info — Notice */
  circleInfo: { viewBox: '0 0 512 512', path: 'M256 512a256 256 0 1 0 0-512 256 256 0 1 0 0 512zM224 160a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zm-8 64l48 0c13.3 0 24 10.7 24 24l0 88 8 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l24 0 0-64-24 0c-13.3 0-24-10.7-24-24s10.7-24 24-24z' },
  /** circle-exclamation — Notice */
  circleExclamation: { viewBox: '0 0 512 512', path: 'M256 512a256 256 0 1 1 0-512 256 256 0 1 1 0 512zm0-192a32 32 0 1 0 0 64 32 32 0 1 0 0-64zm0-192c-18.2 0-32.7 15.5-31.4 33.7l7.4 104c.9 12.6 11.4 22.3 23.9 22.3 12.6 0 23-9.7 23.9-22.3l7.4-104c1.3-18.2-13.1-33.7-31.4-33.7z' },
  /** circle-xmark — Notice */
  circleXmark: { viewBox: '0 0 512 512', path: 'M256 512a256 256 0 1 0 0-512 256 256 0 1 0 0 512zM167 167c9.4-9.4 24.6-9.4 33.9 0l55 55 55-55c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-55 55 55 55c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-55-55-55 55c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l55-55-55-55c-9.4-9.4-9.4-24.6 0-33.9z' },

  /* FooterBar's Free tools panel. Figma types these four as *text* in
     `Font Awesome 7 Pro: Solid` rather than drawing them (nodes 880:1082,
     880:1101, 880:1112, 880:1125), so there is nothing to export — but all four
     codepoints are in the Free tier at the same code points, and Free Solid 7.3.1
     is byte-identical to the nine icons already above. Same glyphs, no Pro. */
  /** arrows-rotate (U+F021) — FooterBar, "PDF Converters" */
  arrowsRotate: { viewBox: '0 0 512 512', path: 'M65.9 228.5c13.3-93 93.4-164.5 190.1-164.5 53 0 101 21.5 135.8 56.2 .2 .2 .4 .4 .6 .6l7.6 7.2-47.9 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l128 0c17.7 0 32-14.3 32-32l0-128c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 53.4-11.3-10.7C390.5 28.6 326.5 0 256 0 127 0 20.3 95.4 2.6 219.5 .1 237 12.2 253.2 29.7 255.7s33.7-9.7 36.2-27.1zm443.5 64c2.5-17.5-9.7-33.7-27.1-36.2s-33.7 9.7-36.2 27.1c-13.3 93-93.4 164.5-190.1 164.5-53 0-101-21.5-135.8-56.2-.2-.2-.4-.4-.6-.6l-7.6-7.2 47.9 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L32 320c-8.5 0-16.7 3.4-22.7 9.5S-.1 343.7 0 352.3l1 127c.1 17.7 14.6 31.9 32.3 31.7S65.2 496.4 65 478.7l-.4-51.5 10.7 10.1c46.3 46.1 110.2 74.7 180.7 74.7 129 0 235.7-95.4 253.4-219.5z' },
  /** pen-to-square (U+F044) — FooterBar, "PDF Editors" */
  penToSquare: { viewBox: '0 0 512 512', path: 'M471.6 21.7c-21.9-21.9-57.3-21.9-79.2 0L368 46.1 465.9 144 490.3 119.6c21.9-21.9 21.9-57.3 0-79.2L471.6 21.7zm-299.2 220c-6.1 6.1-10.8 13.6-13.5 21.9l-29.6 88.8c-2.9 8.6-.6 18.1 5.8 24.6s15.9 8.7 24.6 5.8l88.8-29.6c8.2-2.7 15.7-7.4 21.9-13.5L432 177.9 334.1 80 172.4 241.7zM96 64C43 64 0 107 0 160L0 416c0 53 43 96 96 96l256 0c53 0 96-43 96-96l0-96c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 96c0 17.7-14.3 32-32 32L96 448c-17.7 0-32-14.3-32-32l0-256c0-17.7 14.3-32 32-32l96 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L96 64z' },
  /** wrench (U+F0AD) — FooterBar, "Others". Not square: 576×512 renders 13.5 wide at 12 tall. */
  wrench: { viewBox: '0 0 576 512', path: 'M509.4 98.6c7.6-7.6 20.3-5.7 24.1 4.3 6.8 17.7 10.5 37 10.5 57.1 0 88.4-71.6 160-160 160-17.5 0-34.4-2.8-50.2-8L146.9 498.9c-28.1 28.1-73.7 28.1-101.8 0s-28.1-73.7 0-101.8L232 210.2c-5.2-15.8-8-32.6-8-50.2 0-88.4 71.6-160 160-160 20.1 0 39.4 3.7 57.1 10.5 10 3.8 11.8 16.5 4.3 24.1l-88.7 88.7c-3 3-4.7 7.1-4.7 11.3l0 41.4c0 8.8 7.2 16 16 16l41.4 0c4.2 0 8.3-1.7 11.3-4.7l88.7-88.7z' },
  /** arrow-right (U+F061) — Footer's two CTAs, FormCard, FileUpload. Figma sets
   *  it in FA 7 Pro *Regular*, which is not reachable: free-regular ships 273
   *  icons and this is not one of them (nor is `key`). Solid is the closest
   *  available weight, and it is what `key` beside it already uses. Checked
   *  2026-08-03.
   *
   *  THE ONE CALLER THAT DOES NOT RENDER THE PAIR: TextLink draws this path
   *  rotated -45deg for its external ↗, in a padded viewBox of its own. Free
   *  Solid has no bare north-east arrow to add here, and a rotation needs 633
   *  units of box for 512x384 of ink — the stock 512 would clip the tips. The
   *  transform is the component's, the path stays this module's. */
  arrowRight: { viewBox: '0 0 512 512', path: 'M502.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L402.7 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l370.7 0-105.4 105.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z' },
  /** arrow-down (U+F063) — the download arrow in Button's docs demos, which set
   *  it as the character `↓` until 2026-08-17.
   *
   *  THE REASON FIRST GIVEN FOR THIS WAS WRONG, and the correction is the part
   *  worth keeping. A CDP reading on one element said `.SF NS`, and I concluded
   *  U+2193 was outside the vendored file. Re-tested with the stack and the
   *  weight as the only variables on one page: `↓` resolves to Montserrat under
   *  the token stack, under `'Montserrat', sans-serif` and under `'Montserrat'`
   *  alone, at 400 and at 700, matching its control every time. **U+2193 is in
   *  the font.** One element's reading is not a font's coverage — hold the
   *  variables and re-ask before concluding anything about a face.
   *
   *  Kept anyway, for the arrow it sits beside: `→` U+2192 genuinely is NOT in
   *  the subset (measured 14.19px .SF NS against 16.00px Lucida Grande), so the
   *  two demo arrows are icons together rather than one of each.
   *
   *  Not square: 384x512 renders 12 wide at 16 tall, centred in a square box by
   *  the default preserveAspectRatio. */
  arrowDown: { viewBox: '0 0 384 512', path: 'M169.4 502.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 402.7 224 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 370.7-105.4-105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z' },
  /** xmark (U+F00D) — FooterBar's Free tools close. Bare ×, NOT `circleXmark`. */
  xmark: { viewBox: '0 0 384 512', path: 'M55.1 73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L147.2 256 9.9 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192.5 301.3 329.9 438.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.8 256 375.1 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192.5 210.7 55.1 73.4z' },

  /* Exported from Figma (canvas 231:1473), repeated within ProductMenu */
  /** The nav-bar caret, from Figma's `_Menu Item` / `Product menu`. NOT
   *  `chevronDown`: Figma sets gap:0 between a label and its caret and lets the
   *  caret's own 16x16 box provide the spacing, so the viewBox is offset to
   *  centre the 6.246x3.765 triangle inside 16x16 rather than adding a wrapper.
   *  Shared by TopNav's links and FlyoutMenu's trigger so one bar does not draw
   *  two different carets — which it did until 2026-08-19. */
  caretDown: { viewBox: '-4.8768 -6.1177 16 16', path: 'M2.68376 3.57422L0.183763 1.07422C0.00798182 0.898438 -0.0506119 0.625 0.0470443 0.390625C0.144701 0.15625 0.379076 0 0.632982 0H5.63298C5.88689 0 6.10173 0.15625 6.19939 0.390625C6.29704 0.625 6.23845 0.898438 6.06267 1.07422L3.56267 3.57422C3.32829 3.82812 2.91814 3.82812 2.68376 3.57422Z' },
  /* The three ProductFlyout category headers, OUTLINED OUT OF FIGMA rather than
   * taken from a Font Awesome package — nodes 1021:3346 / 1021:3348 / 1021:3350
   * on `FlyoutMenu-product`. They were `family/icon` text runs in Font Awesome 7
   * PRO (U+E5A0, U+F03E, U+F7D9) until 2026-08-19, which is not redistributable,
   * so the component shipped without them for a day rather than substituting a
   * lookalike. Ball outlined them; these are that export, single-path and 16x16,
   * with Figma's baked #184A73 dropped so callers can use currentColor.
   *
   * Two of the three have Free equivalents (f03e is `image`, f7d9 is
   * `screwdriver-wrench`) and one does not, so all three come from the same
   * export — mixing sources would put two drawing styles in one row of headings. */
  /** file-circle-check (was U+E5A0, Pro) — ProductFlyout, "Document Editing" */
  fileCircleCheck: { viewBox: '0 0 16 16', path: 'M2.75 1H6.85156C7.31641 1 7.75391 1.19141 8.08203 1.51953L10.9805 4.41797C11.3086 4.74609 11.5 5.21094 11.5 5.67578V6.71484C8.79297 6.93359 6.6875 9.17578 6.6875 11.9375C6.6875 13.0859 7.04297 14.1523 7.67188 15H2.75C1.79297 15 1 14.207 1 13.25V2.75C1 1.79297 1.79297 1 2.75 1ZM9.91406 5.8125L6.6875 2.61328V5.15625C6.6875 5.51172 6.98828 5.8125 7.34375 5.8125H9.91406ZM15.875 11.9375C15.875 14.125 14.125 15.875 11.9375 15.875C9.75 15.875 8 14.125 8 11.9375C8 9.75 9.75 8 11.9375 8C14.125 8 15.875 9.75 15.875 11.9375ZM13.4961 10.2695C13.3047 10.1328 13.0312 10.1875 12.8945 10.3789L11.4453 12.375L10.707 11.6367C10.543 11.4727 10.2695 11.4727 10.1055 11.6367C9.91406 11.8008 9.91406 12.0742 10.1055 12.2383L11.1992 13.332C11.2812 13.4414 11.418 13.4688 11.5273 13.4688C11.6641 13.4688 11.7734 13.3867 11.8555 13.2773L13.6055 10.8711C13.7422 10.6797 13.7148 10.4062 13.4961 10.2695Z' },
  /** image (was U+F03E) — ProductFlyout, "Imaging & Recognition" */
  image: { viewBox: '0 0 16 16', path: 'M3.75 2H12.5C13.457 2 14.25 2.79297 14.25 3.75V12.5C14.25 13.457 13.457 14.25 12.5 14.25H3.75C2.79297 14.25 2 13.457 2 12.5V3.75C2 2.79297 2.79297 2 3.75 2ZM5.5 4.1875C4.76172 4.1875 4.1875 4.76172 4.1875 5.5C4.1875 6.23828 4.76172 6.8125 5.5 6.8125C6.23828 6.8125 6.8125 6.23828 6.8125 5.5C6.8125 4.76172 6.23828 4.1875 5.5 4.1875ZM9.4375 7.25C9.21875 7.25 9 7.38672 8.89062 7.57812L7.19531 10.3125L6.48438 9.27344C6.34766 9.10938 6.15625 9 5.9375 9C5.71875 9 5.52734 9.10938 5.39062 9.27344L3.85938 11.4609C3.72266 11.6797 3.72266 11.9258 3.83203 12.1445C3.94141 12.3633 4.16016 12.5 4.40625 12.5H11.8438C12.0898 12.5 12.3086 12.3633 12.418 12.1719C12.5273 11.9531 12.5273 11.707 12.418 11.5156L10.0117 7.57812C9.875 7.35938 9.65625 7.25 9.4375 7.25Z' },
  /** screwdriver-wrench (was U+F7D9) — ProductFlyout, "Utilities" */
  screwdriverWrench: { viewBox: '0 0 16 16', path: 'M1.37999 1.12218C1.51671 0.985458 1.7628 0.958114 1.92686 1.06749L5.18077 3.25499C5.42686 3.39171 5.56358 3.66515 5.56358 3.96593V5.33311L8.05186 7.8214C8.95421 7.41124 10.0753 7.5753 10.8136 8.31358L14.2589 11.7589C14.7784 12.2784 14.7784 13.0987 14.2589 13.6183L12.6183 15.2589C12.0987 15.7784 11.2784 15.7784 10.7589 15.2589L7.31358 11.8136C6.5753 11.0753 6.41124 9.95421 6.8214 9.05186L4.33311 6.56358H2.96593C2.69249 6.56358 2.41905 6.42686 2.25499 6.18077L0.0674893 2.92686C-0.0418857 2.7628 -0.014542 2.51671 0.122177 2.37999L1.37999 1.12218ZM5.34483 9.43468C5.18077 10.4464 5.39952 11.5128 6.05577 12.3605L3.45811 14.9581C2.69249 15.7237 1.43468 15.7237 0.669052 14.9581C-0.0965732 14.1925 -0.0965732 12.9347 0.669052 12.1691L4.3878 8.47765L5.34483 9.43468ZM9.93858 1.31358C10.4855 1.31358 11.0323 1.42296 11.4972 1.61436C11.7706 1.6964 11.8253 2.05186 11.6339 2.27061L10.0753 3.80186C9.99327 3.8839 9.93858 3.99327 9.93858 4.12999V5.25108C9.93858 5.49718 10.13 5.68858 10.3761 5.68858H11.5245C11.6339 5.68858 11.7433 5.6339 11.8253 5.55186L13.3839 4.02061C13.5753 3.80186 13.9308 3.85655 14.0401 4.12999C14.2042 4.62218 14.3136 5.14171 14.3136 5.68858C14.3136 6.86436 13.8487 7.93077 13.0831 8.72374L11.7433 7.3839C10.8409 6.48155 9.61046 6.12608 8.43468 6.34483L6.87608 4.78624V3.82921C6.84874 3.50108 6.76671 3.17296 6.5753 2.87218C7.39561 1.91515 8.59874 1.31358 9.93858 1.31358Z' },
  /** ProductMenu sub-menu chips (×3) */
  graduationCap: { viewBox: '0 0 18 14', path: 'M9.96875 0.1875L17.5312 3.3125C17.8125 3.4375 18 3.6875 18 4C18 4.3125 17.8125 4.59375 17.5312 4.6875L15 5.75V11C15 12.6562 12.3125 14 9 14C5.6875 14 3 12.6562 3 11V5.75L1.5 5.125V13.25C1.5 13.6562 1.15625 14 0.75 14C0.34375 14 0 13.6562 0 13.25V4C0 3.6875 0.1875 3.4375 0.46875 3.3125L8.03125 0.1875C8.34375 0.0625 8.65625 0 9 0C9.34375 0 9.65625 0.0625 9.96875 0.1875ZM4.5 11V11.0312C4.53125 11.0625 4.5625 11.125 4.625 11.1875C4.75 11.375 5 11.5625 5.4375 11.7812C6.28125 12.1875 7.53125 12.5 9 12.5C10.4688 12.5 11.75 12.1875 12.5625 11.7812C13 11.5625 13.25 11.375 13.375 11.1875C13.4375 11.125 13.4688 11.0625 13.5 11.0312C13.5 11.0312 13.5 11.0312 13.5 11V6.34375L9.96875 7.8125C9.65625 7.9375 9.34375 8 9 8C8.65625 8 8.34375 7.9375 8.03125 7.8125L4.5 6.34375V11ZM2.71875 4L8.625 6.4375C8.75 6.46875 8.875 6.5 9 6.5C9.125 6.5 9.28125 6.46875 9.40625 6.4375L15.2812 4L9.40625 1.59375C9.28125 1.53125 9.125 1.5 9 1.5C8.875 1.5 8.75 1.53125 8.625 1.59375L2.71875 4Z' },
  /** ProductMenu top-menu carets (×2) */
  chevronDown: { viewBox: '0 0 16 16', path: 'M6.49609 11.8789L1.24609 6.62891C0.917969 6.27344 0.917969 5.72656 1.24609 5.37109C1.60156 5.04297 2.14844 5.04297 2.50391 5.37109L7.125 10.0195L11.7461 5.37109C12.1016 5.04297 12.6484 5.04297 13.0039 5.37109C13.332 5.72656 13.332 6.27344 13.0039 6.62891L7.75391 11.8789C7.39844 12.207 6.85156 12.207 6.49609 11.8789Z' },
  /** TopNav's narrow-width menu trigger. Not in Figma — the file covers 1440
      desktop only, so there is no drawn hamburger to match. */
  bars: { viewBox: '0 0 448 512', path: 'M0 96C0 78.3 14.3 64 32 64l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 128C14.3 128 0 113.7 0 96zM0 256c0-17.7 14.3-32 32-32l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 288c-17.7 0-32-14.3-32-32zM448 416c0 17.7-14.3 32-32 32L32 448c-17.7 0-32-14.3-32-32s14.3-32 32-32l384 0c17.7 0 32 14.3 32 32z' },
  /** Tooltip's Action-variant leading icon. Font Awesome `buildings`
      (classic/solid, a Pro icon) — outlined out of Figma node 931:5696
      rather than hand-drawn, since the canvas renders it as a font glyph
      and there is no vector to copy. The 16 viewBox carries Figma's own
      14px ink centred in a 16px box, so render it at 16 and the padding
      comes for free. */
  buildings: { viewBox: '0 0 16 16', path: 'M8 0.75H13.25C14.207 0.75 15 1.54297 15 2.5V13C15 13.957 14.207 14.75 13.25 14.75H2.75C1.79297 14.75 1 13.957 1 13V6C1 5.04297 1.79297 4.25 2.75 4.25H6.25V2.5C6.25 1.54297 7.04297 0.75 8 0.75ZM3.625 9.9375V10.8125C3.625 11.0586 3.81641 11.25 4.0625 11.25H4.9375C5.18359 11.25 5.375 11.0586 5.375 10.8125V9.9375C5.375 9.69141 5.18359 9.5 4.9375 9.5H4.0625C3.81641 9.5 3.625 9.69141 3.625 9.9375ZM8.4375 10.375H9.3125C9.55859 10.375 9.75 10.1836 9.75 9.9375V9.0625C9.75 8.81641 9.55859 8.625 9.3125 8.625H8.4375C8.19141 8.625 8 8.81641 8 9.0625V9.9375C8 10.1836 8.19141 10.375 8.4375 10.375ZM11.5 9.9375C11.5 10.1836 11.6914 10.375 11.9375 10.375H12.8125C13.0586 10.375 13.25 10.1836 13.25 9.9375V9.0625C13.25 8.81641 13.0586 8.625 12.8125 8.625H11.9375C11.6914 8.625 11.5 8.81641 11.5 9.0625V9.9375ZM4.0625 6.875C3.81641 6.875 3.625 7.06641 3.625 7.3125V8.1875C3.625 8.43359 3.81641 8.625 4.0625 8.625H4.9375C5.18359 8.625 5.375 8.43359 5.375 8.1875V7.3125C5.375 7.06641 5.18359 6.875 4.9375 6.875H4.0625ZM8 3.8125V4.6875C8 4.93359 8.19141 5.125 8.4375 5.125H9.3125C9.55859 5.125 9.75 4.93359 9.75 4.6875V3.8125C9.75 3.56641 9.55859 3.375 9.3125 3.375H8.4375C8.19141 3.375 8 3.56641 8 3.8125ZM11.9375 3.375C11.6914 3.375 11.5 3.56641 11.5 3.8125V4.6875C11.5 4.93359 11.6914 5.125 11.9375 5.125H12.8125C13.0586 5.125 13.25 4.93359 13.25 4.6875V3.8125C13.25 3.56641 13.0586 3.375 12.8125 3.375H11.9375ZM8 7.3125C8 7.55859 8.19141 7.75 8.4375 7.75H9.3125C9.55859 7.75 9.75 7.55859 9.75 7.3125V6.4375C9.75 6.19141 9.55859 6 9.3125 6H8.4375C8.19141 6 8 6.19141 8 6.4375V7.3125ZM11.9375 7.75H12.8125C13.0586 7.75 13.25 7.55859 13.25 7.3125V6.4375C13.25 6.19141 13.0586 6 12.8125 6H11.9375C11.6914 6 11.5 6.19141 11.5 6.4375V7.3125C11.5 7.55859 11.6914 7.75 11.9375 7.75Z' },
} satisfies Record<string, Icon>;

export type IconName = keyof typeof icons;
