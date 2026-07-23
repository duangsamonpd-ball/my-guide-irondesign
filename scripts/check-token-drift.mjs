#!/usr/bin/env node
/**
 * Iron Software Design System — token drift checker
 *
 * `tokens/tokens.w3c.json` is the source of truth. Every value it declares must
 * appear, unchanged, in both consumable layers:
 *
 *   tokens.w3c.json  ──┬──>  tailwind/tokens.css   plain CSS, any project
 *                      └──>  tailwind/theme.css    Tailwind v4 entry (generated)
 *
 * Run:  node scripts/check-token-drift.mjs
 * Exit: 0 = in sync (warnings allowed) · 1 = drift found
 *
 * Zero dependencies — runs on a bare Node install in CI.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const W3C = JSON.parse(readFileSync(join(ROOT, 'tokens/tokens.w3c.json'), 'utf8'));

const errors = [];
const warnings = [];
let checks = 0;

const err = (family, token, msg) => errors.push({ family, token, msg });
const warn = (family, token, msg) => warnings.push({ family, token, msg });

/* ── CSS layers ──────────────────────────────────────────────────────────── */

/**
 * Both files end with a `.dark` block that re-points light token names at dark
 * values. Those are theme overrides, not definitions — parsing them would
 * overwrite half the palette with its dark counterpart.
 */
function parseLayer(file) {
  const css = readFileSync(join(ROOT, file), 'utf8').split(/^\.dark\s*\{/m)[0];
  const vars = new Map();
  for (const [, name, value] of css.matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm)) {
    vars.set(name, value.trim());
  }
  return { file, vars };
}

const TOKENS = parseLayer('tailwind/tokens.css');
const THEME = parseLayer('tailwind/theme.css');
const LAYERS = [TOKENS, THEME];

/** Resolve `var(--a)` chains down to a literal within one layer. */
function resolve(layer, name, seen = new Set()) {
  if (!layer.vars.has(name) || seen.has(name)) return null;
  seen.add(name);
  const raw = layer.vars.get(name);
  const ref = raw.match(/^var\(--([\w-]+)\)$/);
  return ref ? resolve(layer, ref[1], seen) : raw;
}

/* ── value normalisers ───────────────────────────────────────────────────── */

const REM = 16;

/** Any dimension (number, "1.5rem", "24px", "9999px") → px as a number. */
function px(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (s.endsWith('rem')) return parseFloat(s) * REM;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

const num = (v) => (v == null ? null : parseFloat(String(v)));
const hex = (v) => (v == null ? null : String(v).trim().toUpperCase());

/**
 * Shadows → [[offsets…], [colour channels…]], so whitespace and `0` vs `0px`
 * never register as drift while real value changes always do.
 */
function shadow(v) {
  if (v == null) return null;
  if (typeof v === 'object') {
    const c = String(v.color).match(/rgba?\(([^)]+)\)/i);
    return JSON.stringify([
      [v.offsetX, v.offsetY, v.blur, v.spread].map(Number),
      c ? c[1].split(',').map((x) => parseFloat(x)) : [],
    ]);
  }
  const s = String(v);
  const c = s.match(/rgba?\(([^)]+)\)/i);
  const head = c ? s.slice(0, c.index) : s;
  return JSON.stringify([
    (head.match(/-?[\d.]+/g) || []).map(Number),
    c ? c[1].split(',').map((x) => parseFloat(x)) : [],
  ]);
}

/* ── comparison core ─────────────────────────────────────────────────────── */

const show = (v) => {
  if (v == null) return '—';
  // w3c shadows are objects — render them the way CSS would
  if (typeof v === 'object') {
    const d = (n) => (Number(n) === 0 ? '0' : `${n}px`);
    return `${d(v.offsetX)} ${d(v.offsetY)} ${d(v.blur)} ${d(v.spread)} ${v.color}`;
  }
  return String(v);
};

/**
 * Compare one token against every layer that should carry it.
 * `names` is the variable name per layer — a string when both use the same one.
 */
function compare({ family, token, expected, names, normalise, only }) {
  checks++;
  const want = normalise(expected);

  for (const layer of only ?? LAYERS) {
    const name = typeof names === 'string' ? names : names[layer.file];
    if (!name) continue;

    const raw = resolve(layer, name);
    if (raw == null) {
      err(family, token, `missing from ${layer.file} — expected \`--${name}\``);
    } else if (normalise(raw) !== want) {
      err(family, token, `${layer.file} \`--${name}\` = ${show(raw)} · w3c = ${show(expected)}`);
    }
  }
}

/**
 * Flags tokens a layer invented on its own — a variable matching a family's
 * prefix that the source of truth never declared. This is what catches a
 * `--radius-pill` quietly appearing in one layer and nowhere else.
 */
function flagExtras(family, prefix, w3cKeys, { layer = THEME, skip = () => false } = {}) {
  for (const name of layer.vars.keys()) {
    if (!name.startsWith(`${prefix}-`)) continue;
    const key = name.slice(prefix.length + 1);
    if (w3cKeys.has(key) || skip(key)) continue;
    warn(family, key, `\`--${name}\` in ${layer.file} is not in tokens.w3c.json`);
  }
}

const entries = (o) => Object.entries(o ?? {}).filter(([k, v]) => !k.startsWith('_') && v?.$value !== undefined);

/* ── families ────────────────────────────────────────────────────────────── */

/**
 * Tailwind v4 owns the `--radius-*`, `--text-*` and `--tracking-*` namespaces,
 * so theme.css registers those families under Tailwind's names. tokens.css keeps
 * the design system's original names. Everything else matches in both files.
 */
const named = (tokensName, themeName) => ({
  'tailwind/tokens.css': tokensName,
  'tailwind/theme.css': themeName,
});

// spacing · blur — same variable name in both layers
for (const [family, prefix] of [['spacing', 'spacing'], ['blur', 'blur']]) {
  const keys = new Set();
  for (const [k, v] of entries(W3C[family])) {
    keys.add(k);
    compare({ family, token: k, expected: v.$value, names: `${prefix}-${k}`, normalise: px });
  }
  flagExtras(family, prefix, keys);
}

// borderRadius — `--rounded-*` in tokens.css, `--radius-*` in theme.css
{
  const keys = new Set();
  for (const [k, v] of entries(W3C.borderRadius)) {
    keys.add(k);
    compare({
      family: 'borderRadius', token: k, expected: v.$value,
      names: named(`rounded-${k}`, `radius-${k}`), normalise: px,
    });
  }
  flagExtras('borderRadius', 'radius', keys);
  flagExtras('borderRadius', 'rounded', keys, { layer: TOKENS });
}

// borderWidth · opacity — plain variables, same name in both
for (const [family, prefix, norm] of [['borderWidth', 'border-width', px], ['opacity', 'opacity', num]]) {
  for (const [k, v] of entries(W3C[family])) {
    compare({ family, token: k, expected: v.$value, names: `${prefix}-${k}`, normalise: norm });
  }
}

// shadow
{
  const keys = new Set();
  for (const [k, v] of entries(W3C.shadow)) {
    keys.add(k);
    compare({ family: 'shadow', token: k, expected: v.$value, names: `shadow-${k}`, normalise: shadow });
  }
  flagExtras('shadow', 'shadow', keys, { skip: (k) => k === 'tooltip' });
}

// sizing — names diverge from the w3c keys, but match each other across layers
const SIZING = {
  'btn-primary-height': 'size-btn-primary',
  'btn-secondary-height': 'size-btn-secondary',
  'btn-small-height': 'size-btn-small',
  'input-height': 'size-input',
  'nav-height': 'size-nav',
  'touch-min': 'size-touch-min',
  'touch-nav': 'size-touch-nav',
  'container-max': 'size-container-max',
};
for (const [k, v] of entries(W3C.sizing)) {
  const name = SIZING[k];
  if (!name) { warn('sizing', k, 'no mapping defined in this script — add one to SIZING'); continue; }
  compare({ family: 'sizing', token: k, expected: v.$value, names: name, normalise: px });
}

// typography — font sizes (`--font-size-*` / `--text-*`) and weights
for (const [k, v] of entries(W3C.typography?.size)) {
  compare({
    family: 'fontSize', token: k, expected: v.$value,
    names: named(`font-size-${k}`, `text-${k}`), normalise: px,
  });
}
for (const [k, v] of entries(W3C.typography?.['font-weight'])) {
  compare({ family: 'fontWeight', token: k, expected: v.$value, normalise: num, names: `font-weight-${k}` });
}

/**
 * The semantic type scale — h1, body, btn, nav… Each w3c entry is a composite
 * (size + line-height + weight + tracking) that lands in four separate CSS
 * variables. A few names differ, and not every level declares every property.
 */
const TYPE_NAME = {
  'title-large': 'title-lg', 'body-large': 'body-lg', 'button-large': 'btn-lg',
  'button-default': 'btn', 'button-small': 'btn-sm', 'nav-primary': 'nav',
  'nav-dropdown': 'nav-sub', 'nav-group-label': 'nav-label',
};
const TYPE_PROP = [
  ['fontSize', (c) => named(`font-size-${c}`, `text-${c}`), px],
  ['lineHeight', (c) => `line-height-${c}`, px],
  ['fontWeight', (c) => `fw-${c}`, num],
  ['letterSpacing', (c) => named(`letter-spacing-${c}`, `tracking-${c}`), px],
];

for (const group of ['scale', 'ui']) {
  for (const [k, v] of entries(W3C.typography?.[group])) {
    const css = TYPE_NAME[k] ?? k;
    for (const [prop, toNames, normalise] of TYPE_PROP) {
      const expected = v.$value?.[prop];
      if (expected === undefined) continue;             // this level doesn't declare it

      const names = toNames(css);
      const probe = typeof names === 'string' ? names : names['tailwind/tokens.css'];
      if (!TOKENS.vars.has(probe)) {
        warn('typeScale', `${group}.${k}`, `w3c declares ${prop} but there is no \`--${probe}\``);
        continue;
      }
      compare({ family: 'typeScale', token: `${group}.${k}.${prop}`, expected, names, normalise });
    }
  }
}

// colours — w3c group.key → CSS variable name (several names deliberately differ)
const COLORS = {
  'primary.default': 'color-primary',
  'primary.hover': 'color-primary-hover',
  'primary.active': 'color-primary-active',
  'primary.subtle': 'color-primary-subtle',
  'primary.on': 'color-primary-on',
  'secondary.default': 'color-secondary',
  'secondary.hover': 'color-secondary-hover',
  'secondary.active': 'color-secondary-active',
  'secondary.subtle': 'color-secondary-subtle',
  'secondary.on': 'color-secondary-on',

  'semantic.success': 'color-success',
  'semantic.success-hover': 'color-success-hover',
  'semantic.success-subtle': 'color-success-subtle',
  'semantic.warning': 'color-warning',
  'semantic.warning-hover': 'color-warning-hover',
  'semantic.warning-subtle': 'color-warning-subtle',
  'semantic.error': 'color-danger',           // w3c says "error", CSS says "danger"
  'semantic.error-hover': 'color-danger-hover',
  'semantic.error-subtle': 'color-danger-subtle',
  'semantic.info': 'color-info',
  'semantic.info-hover': 'color-info-hover',
  'semantic.info-subtle': 'color-info-subtle',

  'text.heading': 'color-text-heading',
  'text.heading-alt': 'color-text-heading-alt',
  'text.body': 'color-text-body',
  'text.muted': 'color-text-muted',
  'text.disabled': 'color-text-disabled',
  'text.support': 'color-text-support',
  'text.on-primary': 'color-text-on-primary',
  'text.on-action-tertiary': 'color-text-on-action-tertiary',
  'text.on-action-tertiary-hover': 'color-text-on-action-tertiary-hover',
  'text.link': 'color-text-link',
  'text.link-hover': 'color-text-link-hover',

  'accent.1': 'color-accent-1',
  'accent.2': 'color-accent-2',
  'accent.3': 'color-accent-3',
  'accent.4': 'color-accent-4',

  'text-dark.heading': 'color-text-dark-heading',
  'text-dark.heading-alt': 'color-text-dark-heading-alt',
  'text-dark.body': 'color-text-dark-body',
  'text-dark.muted': 'color-text-dark-muted',
  'text-dark.disabled': 'color-text-dark-disabled',
  'text-dark.support': 'color-text-dark-support',
  'text-dark.link': 'color-text-dark-link',
  'text-dark.link-hover': 'color-text-dark-link-hover',
  'text-on-color.heading': 'color-text-on-color-heading',
  'text-on-color.body': 'color-text-on-color-body',

  'surface.background': 'color-bg-base',      // w3c "surface", CSS "bg"
  'surface.background-shade': 'color-bg-shade',
  'surface.card': 'color-bg-card',
  'surface.card-alt': 'color-bg-card-alt',
  'surface-dark.background': 'color-bg-dark',
  'surface-dark.background-shade': 'color-bg-dark-shade',
  'surface-dark.card': 'color-bg-dark-card',
  'surface-dark.card-alt': 'color-bg-dark-card-alt',

  'border.default': 'color-border',
  'border.strong': 'color-border-strong',
  'border.alternative': 'color-border-alt',
  'border.selected': 'color-border-selected',
  'border-dark.default': 'color-border-dark',
  'border-dark.strong': 'color-border-dark-strong',
  'border-dark.alternative': 'color-border-dark-alt',

  'button.primary': 'color-button-primary',
  'button.primary-hover': 'color-button-primary-hover',
  'button.secondary': 'color-button-secondary',
  'button.secondary-hover': 'color-button-secondary-hover',
  'button.tertiary': 'color-button-tertiary',
  'button.tertiary-hover': 'color-button-tertiary-hover',
  'button.outline': 'color-button-outline',
  'button.outline-hover': 'color-button-outline-hover',
  'button-dark.outline': 'color-button-dark-outline',
  'button-dark.outline-hover': 'color-button-dark-outline-hover',
};
for (const [group, tokens] of Object.entries(W3C.color ?? {})) {
  if (group.startsWith('_')) continue;
  for (const [k, v] of entries(tokens)) {
    const path = `${group}.${k}`;
    const name = COLORS[path];
    if (!name) { warn('color', path, 'no mapping defined in this script — add one to COLORS'); continue; }
    compare({ family: 'color', token: path, expected: v.$value, names: name, normalise: hex });
  }
}

// breakpoints — not in w3c; check the two layers agree with each other
for (const name of TOKENS.vars.keys()) {
  if (!name.startsWith('breakpoint-')) continue;
  checks++;
  const a = resolve(TOKENS, name);
  const b = resolve(THEME, name);
  if (b == null) err('breakpoints', name, `tokens.css has \`--${name}\` but theme.css does not`);
  else if (px(a) !== px(b)) err('breakpoints', name, `tokens.css = ${a} · theme.css = ${b}`);
}

/* ── the generated layer must be current ─────────────────────────────────── */

// theme.css is generated from tokens.css; a stale copy is drift by definition.
{
  checks++;
  const stamp = '/**\n * Iron Software Design System — Tailwind v4 theme';
  if (!readFileSync(join(ROOT, 'tailwind/theme.css'), 'utf8').startsWith(stamp)) {
    err('generated', 'theme.css', 'file header is missing — was it hand-edited? run: node scripts/build-theme.mjs');
  }
}

/* ── components must never hardcode a colour ─────────────────────────────── */

const COMPONENTS = join(ROOT, 'astro-components/components');
for (const file of readdirSync(COMPONENTS).filter((f) => f.endsWith('.astro'))) {
  const src = readFileSync(join(COMPONENTS, file), 'utf8');
  src.split('\n').forEach((line, i) => {
    for (const [raw] of line.matchAll(/#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?\b/g)) {
      checks++;
      err('components', `${basename(file)}:${i + 1}`, `hardcoded ${raw} — use a semantic token instead`);
    }
  });
}

/* ── report ──────────────────────────────────────────────────────────────── */

const group = (list) => {
  const by = new Map();
  for (const it of list) (by.get(it.family) ?? by.set(it.family, []).get(it.family)).push(it);
  return by;
};

if (warnings.length) {
  console.log(`\n\x1b[33m⚠  ${warnings.length} warning${warnings.length > 1 ? 's' : ''}\x1b[0m`);
  for (const [family, items] of group(warnings)) {
    console.log(`\n  ${family}`);
    for (const { token, msg } of items) console.log(`    · ${token} — ${msg}`);
  }
}

if (errors.length) {
  console.log(`\n\x1b[31m✖  ${errors.length} drift${errors.length > 1 ? 's' : ''} found\x1b[0m  (${checks} tokens checked)`);
  for (const [family, items] of group(errors)) {
    console.log(`\n  \x1b[1m${family}\x1b[0m`);
    for (const { token, msg } of items) console.log(`    \x1b[31m✖\x1b[0m ${token}\n        ${msg}`);
  }
  console.log(`\n  tokens/tokens.w3c.json is the source of truth — fix the generated layer, not the source,`);
  console.log(`  unless the design itself changed in Figma.\n`);
  process.exit(1);
}

console.log(`\n\x1b[32m✔  No drift — ${checks} tokens in sync across tokens.w3c.json, tokens.css and theme.css\x1b[0m\n`);
