#!/usr/bin/env node
/**
 * Iron Software Design System — token drift checker
 *
 * `tokens/tokens.w3c.json` is the source of truth. Every value it declares must
 * appear, unchanged, in the two generated layers:
 *
 *   tokens.w3c.json  ──┬──>  tailwind/tokens.css        (CSS custom properties)
 *                      └──>  tailwind/tailwind.config.js (Tailwind theme)
 *
 * Run:  node scripts/check-token-drift.mjs
 * Exit: 0 = in sync (warnings allowed) · 1 = drift found
 *
 * Zero dependencies — runs on a bare Node install in CI.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const W3C = JSON.parse(readFileSync(join(ROOT, 'tokens/tokens.w3c.json'), 'utf8'));
const CSS_SRC = readFileSync(join(ROOT, 'tailwind/tokens.css'), 'utf8');
const CFG = require(join(ROOT, 'tailwind/tailwind.config.js'));
const EXT = CFG.theme.extend;

const errors = [];
const warnings = [];
let checks = 0;

const err = (family, token, msg) => errors.push({ family, token, msg });
const warn = (family, token, msg) => warnings.push({ family, token, msg });

/* ── tokens.css parsing ──────────────────────────────────────────────────── */

/** Every `--name: value;` declaration in tokens.css. */
const CSS_VARS = new Map();
for (const [, name, value] of CSS_SRC.matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm)) {
  CSS_VARS.set(name, value.trim());
}

/** Resolve `var(--a)` chains down to a literal. Returns null if unresolvable. */
function resolveVar(name, seen = new Set()) {
  if (!CSS_VARS.has(name) || seen.has(name)) return null;
  seen.add(name);
  const raw = CSS_VARS.get(name);
  const ref = raw.match(/^var\(--([\w-]+)\)$/);
  return ref ? resolveVar(ref[1], seen) : raw;
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
 * Compare one token across the three layers.
 * `cssName` / `cfgValue` of `undefined` means "this layer doesn't carry it".
 */
function compare({ family, token, expected, cssName, cfgValue, normalise, cfgLabel }) {
  checks++;
  const want = normalise(expected);

  if (cssName !== undefined) {
    const raw = resolveVar(cssName);
    if (raw == null) {
      err(family, token, `missing from tokens.css — expected \`--${cssName}\``);
    } else if (normalise(raw) !== want) {
      err(family, token, `tokens.css \`--${cssName}\` = ${show(raw)} · w3c = ${show(expected)}`);
    }
  }

  if (cfgValue !== undefined) {
    if (cfgValue == null) {
      err(family, token, `missing from tailwind.config.js — expected \`${cfgLabel}\``);
    } else if (normalise(cfgValue) !== want) {
      err(family, token, `config \`${cfgLabel}\` = ${show(cfgValue)} · w3c = ${show(expected)}`);
    }
  }
}

/** Flags tokens a generated layer invented on its own — not in the w3c source. */
function flagExtras(family, w3cKeys, cfgObj, label) {
  if (!cfgObj) return;
  for (const k of Object.keys(cfgObj)) {
    if (!w3cKeys.has(k)) warn(family, k, `\`${label}.${k}\` is not in tokens.w3c.json`);
  }
}

const entries = (o) => Object.entries(o ?? {}).filter(([k, v]) => !k.startsWith('_') && v?.$value !== undefined);

/* ── families ────────────────────────────────────────────────────────────── */

// spacing · borderRadius · blur — identical key names across all three layers
for (const [family, cssPrefix, cfgKey] of [
  ['spacing', 'spacing', 'spacing'],
  ['borderRadius', 'rounded', 'borderRadius'],
  ['blur', 'blur', 'blur'],
]) {
  const keys = new Set();
  for (const [k, v] of entries(W3C[family])) {
    keys.add(k);
    compare({
      family, token: k, expected: v.$value,
      cssName: `${cssPrefix}-${k}`,
      cfgValue: EXT[cfgKey]?.[k] ?? null,
      cfgLabel: `${cfgKey}.${k}`,
      normalise: px,
    });
  }
  flagExtras(family, keys, EXT[cfgKey], cfgKey);
}

// borderWidth — CSS only; Tailwind ships an equivalent default scale
for (const [k, v] of entries(W3C.borderWidth)) {
  compare({ family: 'borderWidth', token: k, expected: v.$value, cssName: `border-width-${k}`, normalise: px });
}

// shadow
{
  const keys = new Set();
  for (const [k, v] of entries(W3C.shadow)) {
    keys.add(k);
    compare({
      family: 'shadow', token: k, expected: v.$value,
      cssName: `shadow-${k}`,
      cfgValue: EXT.boxShadow?.[k] ?? null,
      cfgLabel: `boxShadow.${k}`,
      normalise: shadow,
    });
  }
  flagExtras('shadow', keys, EXT.boxShadow, 'boxShadow');
}

// opacity — CSS carries the full 0–100 scale; config exposes semantic aliases only
for (const [k, v] of entries(W3C.opacity)) {
  compare({ family: 'opacity', token: k, expected: v.$value, cssName: `opacity-${k}`, normalise: num });
}

// sizing — names diverge between layers, so map each one explicitly
const SIZING = {
  'btn-primary-height':   { css: 'size-btn-primary',   cfg: () => EXT.height?.['btn-primary'],     label: 'height.btn-primary' },
  'btn-secondary-height': { css: 'size-btn-secondary', cfg: () => EXT.height?.['btn-secondary'],   label: 'height.btn-secondary' },
  'btn-small-height':     { css: 'size-btn-small',     cfg: () => EXT.height?.['btn-small'],       label: 'height.btn-small' },
  'input-height':         { css: 'size-input',         cfg: () => EXT.height?.input,               label: 'height.input' },
  'nav-height':           { css: 'size-nav',           cfg: () => EXT.height?.nav,                 label: 'height.nav' },
  'touch-min':            { css: 'size-touch-min',     cfg: () => EXT.minHeight?.touch,            label: 'minHeight.touch' },
  'touch-nav':            { css: 'size-touch-nav',     cfg: () => EXT.minHeight?.['touch-nav'],    label: 'minHeight.touch-nav' },
  'container-max':        { css: 'size-container-max', cfg: () => EXT.maxWidth?.container,         label: 'maxWidth.container' },
};
for (const [k, v] of entries(W3C.sizing)) {
  const m = SIZING[k];
  if (!m) { warn('sizing', k, 'no mapping defined in this script — add one to SIZING'); continue; }
  compare({ family: 'sizing', token: k, expected: v.$value, cssName: m.css, cfgValue: m.cfg() ?? null, cfgLabel: m.label, normalise: px });
}

// typography — font sizes and weights
for (const [k, v] of entries(W3C.typography?.size)) {
  compare({
    family: 'fontSize', token: k, expected: v.$value,
    cssName: `font-size-${k}`,
    cfgValue: EXT.fontSize?.[k] ?? null,
    cfgLabel: `fontSize.${k}`,
    normalise: px,
  });
}
for (const [k, v] of entries(W3C.typography?.['font-weight'])) {
  compare({
    family: 'fontWeight', token: k, expected: v.$value,
    cssName: `font-weight-${k}`,
    cfgValue: EXT.fontWeight?.[k] ?? null,
    cfgLabel: `fontWeight.${k}`,
    normalise: num,
  });
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
    const cssName = COLORS[path];
    if (!cssName) { warn('color', path, 'no mapping defined in this script — add one to COLORS'); continue; }
    compare({ family: 'color', token: path, expected: v.$value, cssName, normalise: hex });
  }
}

// breakpoints — not in w3c; check tokens.css and config agree with each other
for (const [k, v] of Object.entries(CFG.theme?.screens ?? {})) {
  checks++;
  const css = resolveVar(`breakpoint-${k}`);
  if (css == null) err('breakpoints', k, `config has \`screens.${k}\` but tokens.css has no \`--breakpoint-${k}\``);
  else if (px(css) !== px(v)) err('breakpoints', k, `tokens.css \`--breakpoint-${k}\` = ${css} · config \`screens.${k}\` = ${v}`);
}

/* ── components must never hardcode a colour ─────────────────────────────── */

const COMPONENTS = join(ROOT, 'astro-components/components');
for (const file of readdirSync(COMPONENTS).filter((f) => f.endsWith('.astro'))) {
  const src = readFileSync(join(COMPONENTS, file), 'utf8');
  src.split('\n').forEach((line, i) => {
    for (const [raw] of line.matchAll(/#[0-9A-Fa-f]{6}\b/g)) {
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
  console.log(`\n[33m⚠  ${warnings.length} warning${warnings.length > 1 ? 's' : ''}[0m`);
  for (const [family, items] of group(warnings)) {
    console.log(`\n  ${family}`);
    for (const { token, msg } of items) console.log(`    · ${token} — ${msg}`);
  }
}

if (errors.length) {
  console.log(`\n[31m✖  ${errors.length} drift${errors.length > 1 ? 's' : ''} found[0m  (${checks} tokens checked)`);
  for (const [family, items] of group(errors)) {
    console.log(`\n  [1m${family}[0m`);
    for (const { token, msg } of items) console.log(`    [31m✖[0m ${token}\n        ${msg}`);
  }
  console.log(`\n  tokens/tokens.w3c.json is the source of truth — fix the generated layer, not the source,`);
  console.log(`  unless the design itself changed in Figma.\n`);
  process.exit(1);
}

console.log(`\n[32m✔  No drift — ${checks} tokens in sync across tokens.w3c.json, tokens.css and tailwind.config.js[0m\n`);
