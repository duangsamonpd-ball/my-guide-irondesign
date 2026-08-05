#!/usr/bin/env node
/**
 * Iron Software Design System — badge contrast check
 *
 * Badge is the one component that paints text directly onto a saturated fill,
 * in twelve combinations (six intents x subtle/solid) across two themes. Nothing
 * else in the repo notices when one of them stops being readable: check:parity
 * only asks whether the docs copy matches, and check:tokens only asks whether
 * the layers agree with each other. Both stayed green the whole time three solid
 * badges were failing WCAG AA.
 *
 * Nothing here is hand-copied. The pairings are derived from Badge.astro's own
 * SUBTLE/SOLID class maps, what those classes compile to in docs/utilities.css,
 * and the colours those resolve to in tailwind/tokens.css — so the check moves
 * whenever the component does.
 *
 * Until 2026-08-05 the pairings came out of Badge's <style> block. The component
 * has no <style> any more, and this was the gate the Tailwind POC broke worst:
 * with nothing to parse it derived 0 pairs of the 12 it expects. Rebuilt against
 * the compiled utilities, it reproduces the same three failures it originally
 * found — 2.17, 1.99 and 3.25:1 — when white is put back on the light fills.
 *
 * Badge text is 12px/700 — under the 18.66px-bold threshold for "large" — so the
 * bar is the full AA 4.5:1.
 *
 * Run:  node scripts/check-contrast.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AA = 4.5;

/**
 * Pairs that do not clear AA and are a design decision rather than a bug — both
 * values coming from Figma, say — so they warn instead of failing. Empty on
 * purpose: the two subtle pairs that lived here were fixed on 2026-07-31 by
 * darkening the -strong step to 800, and this check is what said so. An entry
 * that starts passing is reported as an error, so the list cannot rot.
 */
const KNOWN = new Map([]);

/* ── read the two sources ─────────────────────────────────────────────────── */

const tokensCss = readFileSync(join(ROOT, 'tailwind/tokens.css'), 'utf8');
const badge = readFileSync(join(ROOT, 'astro-components/components/Badge.astro'), 'utf8');

const block = (name) => {
  const m = tokensCss.match(new RegExp(`${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!m) throw new Error(`could not find the ${name} block in tokens.css`);
  const out = new Map();
  for (const line of m[1].split('\n')) {
    const d = line.replace(/\/\*[\s\S]*?\*\//g, '').match(/--([\w-]+)\s*:\s*([^;]+);/);
    if (d) out.set(d[1], d[2].trim());
  }
  return out;
};

const root = block(':root');
const dark = block('\\.dark');

function resolve(value, theme) {
  const table = theme === 'dark' ? new Map([...root, ...dark]) : root;
  let v = value.trim();
  for (let i = 0; i < 12; i++) {
    const m = v.match(/^var\(--([\w-]+)\)$/);
    if (!m) break;
    const next = table.get(m[1]);
    if (next === undefined) return null;
    v = next.trim();
  }
  return /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : null;
}

/* ── contrast ─────────────────────────────────────────────────────────────── */

const channel = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/* ── derive every pair Badge.astro actually paints ────────────────────────── */

/**
 * Badge has no <style> block any more — it is utility classes now. The pairings
 * therefore come from two places instead of one, and neither is hand-copied:
 *
 *   Badge.astro's SUBTLE / SOLID maps   which classes each intent wears
 *   docs/utilities.css                  what those classes resolve to
 *
 * Reading the compiled stylesheet rather than mapping `bg-success-subtle` to
 * `--color-success-subtle` by string surgery is the point: a guessed mapping is
 * a second source of truth that can be wrong while looking right. This one is
 * what Tailwind actually emitted, so if the class stops producing that colour —
 * or stops existing — the pair changes here too.
 */
const utilitiesCss = readFileSync(join(ROOT, 'docs/utilities.css'), 'utf8');

/** class name → { property: value } straight out of the compiled sheet. */
const utility = new Map();
for (const m of utilitiesCss.matchAll(/^\.((?:[\w-]|\\.)+)\s*\{([^}]*)\}/gm)) {
  const decls = {};
  for (const d of m[2].matchAll(/([\w-]+)\s*:\s*([^;]+)/g)) decls[d[1].trim()] = d[2].trim();
  utility.set(m[1].replace(/\\(.)/g, '$1'), decls);
}

/** The object literals in the frontmatter, e.g. success: 'bg-… text-…'. */
function classMap(name) {
  const block = badge.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\}`))?.[1];
  if (!block) throw new Error(`could not find the ${name} map in Badge.astro`);
  const out = new Map();
  for (const m of block.matchAll(/(\w+):\s*'([^']+)'/g)) out.set(m[1], m[2].split(/\s+/));
  return out;
}

const INTENTS = ['success', 'warning', 'danger', 'info', 'important', 'neutral'];
const MAPS = { subtle: classMap('SUBTLE'), solid: classMap('SOLID') };

/** The first class in the list that declares `prop`, as its raw value. */
const from = (classes, prop) => {
  for (const c of classes) {
    const v = utility.get(c)?.[prop];
    if (v) return v;
  }
  return undefined;
};

const pairs = [];
for (const variant of ['subtle', 'solid']) {
  for (const intent of INTENTS) {
    const classes = MAPS[variant].get(intent);
    if (!classes) continue;
    pairs.push({
      variant,
      intent,
      bg: from(classes, 'background-color'),
      fg: from(classes, 'color'),
    });
  }
}

if (pairs.length !== INTENTS.length * 2) {
  console.error(`\n\x1b[31m✖  expected ${INTENTS.length * 2} badge pairs, derived ${pairs.length}\x1b[0m`);
  console.error('   Badge.astro changed shape — update scripts/check-contrast.mjs to match.\n');
  process.exit(1);
}

/* ── check ────────────────────────────────────────────────────────────────── */

const failures = [];
const warnings = [];
const stale = [];
let checked = 0;

for (const theme of ['light', 'dark']) {
  for (const { variant, intent, bg, fg } of pairs) {
    const bgHex = resolve(bg, theme);
    const fgHex = resolve(fg, theme);
    const id = `${variant}/${intent}/${theme}`;

    if (!bgHex || !fgHex) {
      failures.push({ id, note: `could not resolve ${!bgHex ? bg : fg} to a hex` });
      continue;
    }

    checked++;
    const ratio = contrast(fgHex, bgHex);
    const passes = ratio >= AA;
    const known = KNOWN.get(id);

    if (passes && known) stale.push({ id, ratio, known });
    else if (passes) continue;
    else if (known) warnings.push({ id, ratio, bgHex, fgHex, known });
    else failures.push({ id, ratio, bgHex, fgHex });
  }
}

/* ── report ───────────────────────────────────────────────────────────────── */

const show = ({ id, ratio, bgHex, fgHex }) =>
  `    ${id.padEnd(26)} ${fgHex} on ${bgHex}   ${ratio.toFixed(2)}:1`;

if (warnings.length) {
  console.log(`\n\x1b[33m!  ${warnings.length} known badge pair(s) below AA ${AA}:1 — design decision, not a regression\x1b[0m`);
  for (const w of warnings) console.log(`${show(w)}\n      ${w.known}`);
}

if (stale.length) {
  console.error(`\n\x1b[31m✖  ${stale.length} exemption(s) in KNOWN now pass — delete them\x1b[0m`);
  for (const s of stale) console.error(`    ${s.id} is ${s.ratio.toFixed(2)}:1`);
}

if (failures.length) {
  console.error(`\n\x1b[31m✖  ${failures.length} badge pair(s) fail WCAG AA ${AA}:1\x1b[0m\n`);
  for (const f of failures) console.error(f.note ? `    ${f.id}: ${f.note}` : show(f));
  console.error(`\n  Badge text is 12px/700, so it needs the full ${AA}:1 — not the 3:1 large-text bar.`);
  console.error(`  Pick the label colour per intent: the solid fills do not change between`);
  console.error(`  themes, so one colour cannot serve all six.\n`);
}

if (failures.length || stale.length) process.exit(1);

console.log(
  `\n\x1b[32m✔  ${checked - warnings.length} of ${checked} badge colour pairs meet WCAG AA (${AA}:1)` +
    (warnings.length ? `; ${warnings.length} known exemption(s) above` : '') +
    `\x1b[0m\n`
);
