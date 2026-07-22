#!/usr/bin/env node
/**
 * Iron Software Design System — generate tailwind/theme.css from tailwind/tokens.css
 *
 *   tokens.w3c.json  →  tailwind/tokens.css  →  tailwind/theme.css
 *   (source of truth)   (hand-authored)         (generated — do not edit)
 *
 * tokens.css stays plain CSS so non-Tailwind projects can `@import` it as-is.
 * theme.css is the Tailwind v4 entry point: same values, registered with `@theme`
 * so utilities generate, plus a `.dark` block wired from the dark tokens.
 *
 * Run:    node scripts/build-theme.mjs
 * Verify: node scripts/build-theme.mjs --check   (fails if theme.css is stale)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'tailwind/tokens.css');
const OUT = join(ROOT, 'tailwind/theme.css');
const CHECK = process.argv.includes('--check');

/* ── parse tokens.css ────────────────────────────────────────────────────── */

/**
 * Only the `:root` block defines tokens. tokens.css also carries a `.dark` block
 * that re-points light names at dark values — reading those as declarations would
 * overwrite half the palette with its dark counterpart.
 */
export function rootBlock(css) {
  const start = css.indexOf(':root {');
  if (start === -1) throw new Error('tokens.css has no :root block');
  const end = css.indexOf('\n}', start);
  return css.slice(start, end);
}

/** @type {{name: string, value: string, comment: string}[]} */
const tokens = [];
for (const line of rootBlock(readFileSync(SRC, 'utf8')).split('\n')) {
  const m = line.match(/^\s*--([\w-]+):\s*([^;]+);\s*(?:\/\*(.*?)\*\/)?/);
  if (m) tokens.push({ name: m[1], value: m[2].trim(), comment: (m[3] ?? '').trim() });
}
const byName = new Map(tokens.map((t) => [t.name, t]));

/* ── routing ─────────────────────────────────────────────────────────────── */

const isPrimitive = (n) => /^(iron-(pink|blue|orange|green|sky|purple|violet|red)|neutral|slate)-\d+$/.test(n);

/**
 * Where each token goes. Tailwind v4 only generates utilities for its own
 * namespaces, and two of ours don't match — `--rounded-*` and `--font-size-*`
 * are registered under Tailwind's `--radius-*` / `--text-*` and aliased back to
 * their original names so components and docs keep working untouched.
 */
const RENAME = { rounded: 'radius', 'font-size': 'text', 'letter-spacing': 'tracking' };

/** Namespaces Tailwind understands, passed through unchanged. */
const PASSTHROUGH = ['color', 'spacing', 'leading', 'font-weight', 'shadow', 'blur', 'breakpoint'];

/** Everything else stays a plain `:root` variable — no utility, but still readable by components. */
function route(name) {
  if (isPrimitive(name)) return { kind: 'primitive' };
  if (['font-sans', 'font-body', 'font-mono'].includes(name)) return { kind: 'theme', themeName: name };

  for (const [from, to] of Object.entries(RENAME)) {
    if (name.startsWith(`${from}-`)) {
      return { kind: 'renamed', themeName: `${to}-${name.slice(from.length + 1)}` };
    }
  }
  for (const ns of PASSTHROUGH) {
    if (name.startsWith(`${ns}-`)) return { kind: 'theme', themeName: name };
  }
  return { kind: 'plain' };
}

/* ── dark mode — map each dark token onto the light token it replaces ─────── */

const DARK_PREFIX = [
  ['color-text-dark-', 'color-text-'],
  ['color-bg-dark-', 'color-bg-'],
  ['color-border-dark-', 'color-border-'],
  ['color-button-dark-', 'color-button-'],
];
/** Bare dark tokens whose light counterpart isn't a simple prefix swap. */
const DARK_EXACT = { 'color-bg-dark': 'color-bg-base', 'color-border-dark': 'color-border' };

function darkTarget(name) {
  if (DARK_EXACT[name]) return DARK_EXACT[name];
  for (const [from, to] of DARK_PREFIX) {
    if (name.startsWith(from)) return to + name.slice(from.length);
  }
  return null;
}

/* ── scale aliases — keep `bg-primary-500`, `bg-danger-100`, … working ────── */

const SCALES = {
  primary: 'iron-pink', secondary: 'iron-blue', success: 'iron-green',
  warning: 'iron-orange', danger: 'iron-red', info: 'iron-blue',
};
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

/* ── emit ────────────────────────────────────────────────────────────────── */

const pad = (s, n) => s + ' '.repeat(Math.max(1, n - s.length));
const withComment = (decl, comment) => (comment ? `${pad(decl, 46)}/* ${comment} */` : decl);

const primitives = [];
const themed = [];
const aliases = [];
const plain = [];
const darks = [];

for (const t of tokens) {
  const r = route(t.name);
  const dark = darkTarget(t.name);

  // Dark tokens re-theme their light counterpart; they are not separate utilities.
  if (dark && byName.has(dark)) {
    darks.push(withComment(`  --${dark}: var(--${t.name});`, t.comment));
  }

  if (r.kind === 'primitive') {
    primitives.push(withComment(`  --${t.name}: ${t.value};`, t.comment));
    themed.push(`  --color-${t.name}: var(--${t.name});`);
  } else if (r.kind === 'theme') {
    themed.push(withComment(`  --${r.themeName}: ${t.value};`, t.comment));
  } else if (r.kind === 'renamed') {
    // Rewrite intra-family references so the value resolves inside @theme.
    const value = t.value.replace(/var\(--([\w-]+)\)/g, (whole, ref) => {
      const rr = route(ref);
      return rr.kind === 'renamed' ? `var(--${rr.themeName})` : whole;
    });
    themed.push(withComment(`  --${r.themeName}: ${value};`, t.comment));
    aliases.push(`  --${t.name}: var(--${r.themeName});`);
  } else {
    plain.push(withComment(`  --${t.name}: ${t.value};`, t.comment));
  }
}

for (const [alias, scale] of Object.entries(SCALES)) {
  for (const step of STEPS) themed.push(`  --color-${alias}-${step}: var(--${scale}-${step});`);
}

const section = (n, title) =>
  `/* ═══════════════════════════════════════════════════════════════════════════\n   ${n}. ${title}\n   ═══════════════════════════════════════════════════════════════════════════ */`;

const out = `/**
 * Iron Software Design System — Tailwind v4 theme
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  GENERATED FILE — DO NOT EDIT                                            ║
 * ║  Edit tailwind/tokens.css, then run: node scripts/build-theme.mjs        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Tailwind v4 is CSS-first — this file replaces tailwind.config.js entirely.
 *
 *   import "@iron-software/design-system/tailwind/theme.css";
 *
 * Not using Tailwind? Import tailwind/tokens.css instead — same values, plain CSS.
 *
 * Two deliberate choices, both because our components read tokens as plain CSS
 * variables inside their own <style> blocks rather than as utility classes:
 *
 *   \`@theme\` (not \`@theme inline\`)  — inline never emits --color-* to :root,
 *      which would leave every component resolving to nothing.
 *   \`static\`  — without it Tailwind tree-shakes any token no utility references,
 *      and it cannot see var(--color-text-body) inside an .astro <style> block.
 *
 * Together: utilities generate, var(--color-*) resolves, and dark mode is a swap.
 */

@import "tailwindcss";

/* Class-based dark mode: <html class="dark"> */
@custom-variant dark (&:where(.dark, .dark *));


${section(1, 'PRIMITIVES — raw palette, never consume directly in components')}

:root {
${primitives.join('\n')}
}


${section(2, 'THEME — registered with Tailwind, so utilities generate')}

/* \`static\` emits every token even when no utility references it. Our components
   read them as plain CSS variables, which Tailwind's scanner cannot see. */
@theme static {
${themed.join('\n')}
}


${section(3, 'ALIASES — original token names, kept so nothing has to change')}

/* Tailwind owns the --radius-*, --text-* and --tracking-* namespaces, so those
   families are registered under its names above and mirrored back here. */
:root {
${aliases.join('\n')}
}


${section(4, 'PLAIN TOKENS — no Tailwind namespace, read directly by components')}

:root {
${plain.join('\n')}
}


${section(5, 'DARK THEME — a swap at the semantic layer, nothing else changes')}

/* Values come from the dark tokens already defined in tokens.css. Components
   are untouched: they read the same --color-* names in both themes. */
.dark {
${darks.join('\n')}
}
`;

if (CHECK) {
  const current = readFileSync(OUT, 'utf8');
  if (current !== out) {
    console.error('\n\x1b[31m✖  tailwind/theme.css is stale\x1b[0m');
    console.error('   tokens.css changed without regenerating. Run:\n');
    console.error('     node scripts/build-theme.mjs\n');
    process.exit(1);
  }
  console.log('\x1b[32m✔  tailwind/theme.css is up to date with tokens.css\x1b[0m');
} else {
  writeFileSync(OUT, out);
  const n = primitives.length + themed.length + aliases.length + plain.length;
  console.log(`\x1b[32m✔  Wrote tailwind/theme.css\x1b[0m — ${n} declarations, ${darks.length} dark overrides`);
}
