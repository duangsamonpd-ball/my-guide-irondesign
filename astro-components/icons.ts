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
  /** check — FormCard, Select, TrialKeyCard */
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

  /* Exported from Figma (canvas 231:1473), repeated within ProductMenu */
  /** ProductMenu sub-menu chips (×3) */
  graduationCap: { viewBox: '0 0 18 14', path: 'M9.96875 0.1875L17.5312 3.3125C17.8125 3.4375 18 3.6875 18 4C18 4.3125 17.8125 4.59375 17.5312 4.6875L15 5.75V11C15 12.6562 12.3125 14 9 14C5.6875 14 3 12.6562 3 11V5.75L1.5 5.125V13.25C1.5 13.6562 1.15625 14 0.75 14C0.34375 14 0 13.6562 0 13.25V4C0 3.6875 0.1875 3.4375 0.46875 3.3125L8.03125 0.1875C8.34375 0.0625 8.65625 0 9 0C9.34375 0 9.65625 0.0625 9.96875 0.1875ZM4.5 11V11.0312C4.53125 11.0625 4.5625 11.125 4.625 11.1875C4.75 11.375 5 11.5625 5.4375 11.7812C6.28125 12.1875 7.53125 12.5 9 12.5C10.4688 12.5 11.75 12.1875 12.5625 11.7812C13 11.5625 13.25 11.375 13.375 11.1875C13.4375 11.125 13.4688 11.0625 13.5 11.0312C13.5 11.0312 13.5 11.0312 13.5 11V6.34375L9.96875 7.8125C9.65625 7.9375 9.34375 8 9 8C8.65625 8 8.34375 7.9375 8.03125 7.8125L4.5 6.34375V11ZM2.71875 4L8.625 6.4375C8.75 6.46875 8.875 6.5 9 6.5C9.125 6.5 9.28125 6.46875 9.40625 6.4375L15.2812 4L9.40625 1.59375C9.28125 1.53125 9.125 1.5 9 1.5C8.875 1.5 8.75 1.53125 8.625 1.59375L2.71875 4Z' },
  /** ProductMenu top-menu carets (×2) */
  chevronDown: { viewBox: '0 0 16 16', path: 'M6.49609 11.8789L1.24609 6.62891C0.917969 6.27344 0.917969 5.72656 1.24609 5.37109C1.60156 5.04297 2.14844 5.04297 2.50391 5.37109L7.125 10.0195L11.7461 5.37109C12.1016 5.04297 12.6484 5.04297 13.0039 5.37109C13.332 5.72656 13.332 6.27344 13.0039 6.62891L7.75391 11.8789C7.39844 12.207 6.85156 12.207 6.49609 11.8789Z' },
} satisfies Record<string, Icon>;

export type IconName = keyof typeof icons;
