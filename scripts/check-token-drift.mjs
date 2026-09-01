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
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

import { componentSources } from './lib/sources.mjs';

const SELF = fileURLToPath(import.meta.url);
const SELF_TEST = process.argv.includes('--self-test');
const ROOT = join(dirname(SELF), '..');

/**
 * The self-test plants a fault on the REAL files, in a child process, through
 * this one channel. Nothing else reads the three data files directly.
 *
 * A PLANT THAT DOES NOT LAND THROWS. A fault injection that silently matched
 * nothing would make every self-test row pass while proving nothing at all —
 * this repo has been bitten by exactly that, so the miss is a crash, not a skip.
 */
const FAULT = process.env.TOKEN_DRIFT_FAULT ? JSON.parse(process.env.TOKEN_DRIFT_FAULT) : [];

function readSource(file) {
  let text = readFileSync(join(ROOT, file), 'utf8');
  for (const [target, find, replace] of FAULT) {
    if (target !== file) continue;
    if (!text.includes(find)) throw new Error(`planted fault did not land in ${file}: ${find}`);
    text = text.replace(find, replace);
  }
  return text;
}

const W3C = JSON.parse(readSource('tokens/tokens.w3c.json'));

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
  const css = readSource(file).split(/^\.dark\s*\{/m)[0];
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

/**
 * One length → a canonical string. `1.5rem`, `24px` and a bare `24` all read as
 * "24"; `5vw` reads as "5vw" and never as "5".
 *
 * The old normaliser was `parseFloat` with a `rem` special case, which meant a
 * unit it did not know was silently discarded rather than refused — `5vw` and
 * `5px` compared equal. Nothing in this system carries such a unit today
 * (measured: 202 px, 44 rem, 6 unitless, nothing else), so this changes no
 * current verdict; it is here because the fluid work below puts viewport units
 * inside values this function has to read.
 *
 * Only `px`, `rem` and unitless convert. Everything else stays symbolic, which
 * is a refusal to claim an equivalence that depends on context: `em` is a
 * property of its inherited font size and `vw` of the viewport, and this gate
 * has neither.
 */
const LENGTH = /^(-?[\d.]+)([a-z%]*)$/i;

function len(v) {
  const m = String(v).trim().match(LENGTH);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  const unit = m[2].toLowerCase();
  if (unit === '' || unit === 'px') return `${n}`;
  if (unit === 'rem') return `${n * REM}`;
  return `${n}${unit}`;
}

/** Split on TOP-LEVEL commas only, so a nested call keeps its own arguments. */
function splitArgs(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Any dimension, FIXED or FLUID → a canonical string, or null if unreadable.
 *
 * The fluid half exists because of a hole measured on 2026-09-01, and the hole
 * was not that a clamp compared wrong — it was that it did not compare at all.
 * `parseFloat('clamp(32px, 5vw, 48px)')` is NaN, so the old normaliser returned
 * null for BOTH sides of the comparison, and `compare()` asked `null !== null`,
 * which is false. Proven by injection: `clamp(32px, 5vw, 48px)` in the source of
 * truth against `clamp(64px, 9vw, 96px)` in both consumable layers reported
 * "No drift", with the token still inside the checked count — a vacuous pass,
 * not a skip. `compare()` now refuses an unreadable side outright, so even a
 * shape this function has never seen cannot come back as agreement; this makes
 * the shape we DO expect comparable rather than merely refused.
 *
 * Compared structurally, argument by argument, so `clamp(2rem, 5vw, 4rem)` and
 * `clamp(32px, 5vw, 64px)` are the same value written twice and a moved
 * breakpoint is drift.
 */
function px(v) {
  if (v == null) return null;
  if (typeof v === 'number') return String(v);
  const s = String(v).trim();
  const fn = s.match(/^(clamp|min|max)\(([\s\S]*)\)$/i);
  if (!fn) return len(s);
  const args = splitArgs(fn[2]).map(px);
  return args.some((a) => a === null) ? null : `${fn[1].toLowerCase()}(${args.join(',')})`;
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

/** A normaliser that could not read its input. `NaN` counts: `num` returns it. */
const unreadable = (v) => v === null || (typeof v === 'number' && Number.isNaN(v));

/**
 * Compare one token against every layer that should carry it.
 * `names` is the variable name per layer — a string when both use the same one.
 *
 * A NORMALISER THAT CANNOT READ A SIDE IS A REFUSAL, NEVER AN AGREEMENT. This
 * is the `None == None` shape, and it is checked here rather than in each
 * normaliser because it is a property of the comparison: two values the gate
 * cannot read are not thereby equal, whatever they are. Until 2026-09-01 the
 * test was `normalise(raw) !== want` alone, so any value shape nobody had fed
 * this gate yet — a `clamp()` was the one that surfaced it — passed in silence
 * on BOTH sides at once. The token stayed inside the checked count while
 * comparing nothing, which is why the total could not give it away either.
 *
 * So the guarantee is now about shapes rather than about clamp: whatever
 * arrives next that `px`, `num`, `hex` or `shadow` cannot parse comes back as a
 * named error asking for the normaliser to learn it.
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
      continue;
    }

    const got = normalise(raw);
    if (unreadable(want) || unreadable(got)) {
      const side = unreadable(want)
        ? `w3c = ${show(expected)}`
        : `${layer.file} \`--${name}\` = ${show(raw)}`;
      err(family, token, `cannot be compared — ${side} is a shape this gate's normaliser ` +
        `does not read, and two unread values are not agreement. Teach the normaliser the shape.`);
    } else if (got !== want) {
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

// duration — `$value` is a CSS time string, so it compares as-is
{
  const keys = new Set();
  for (const [k, v] of entries(W3C.duration)) {
    keys.add(k);
    compare({ family: 'duration', token: k, expected: v.$value, names: `duration-${k}`, normalise: (t) => String(t).trim() });
  }
  flagExtras('duration', 'duration', keys);
}

// easing — W3C stores a cubicBezier as [x1, y1, x2, y2]; CSS wants the function
{
  const keys = new Set();
  const bezier = (v) => (Array.isArray(v) ? `cubic-bezier(${v.join(', ')})` : String(v).replace(/\s+/g, ' ').trim());
  for (const [k, v] of entries(W3C.easing)) {
    keys.add(k);
    compare({ family: 'easing', token: k, expected: v.$value, names: `ease-${k}`, normalise: bezier });
  }
  flagExtras('easing', 'ease', keys);
}

// shadow
{
  const keys = new Set();
  for (const [k, v] of entries(W3C.shadow)) {
    keys.add(k);
    compare({ family: 'shadow', token: k, expected: v.$value, names: `shadow-${k}`, normalise: shadow });
  }
  flagExtras('shadow', 'shadow', keys);
}

// sizing — names diverge from the w3c keys, but match each other across layers
const SIZING = {
  'box-sm': 'size-box-sm',
  'box-md': 'size-box-md',
  'box-lg': 'size-box-lg',
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
  'badge-small': 'badge-sm',
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
  'semantic.success-strong': 'color-success-strong',
  'semantic.warning': 'color-warning',
  'semantic.warning-hover': 'color-warning-hover',
  'semantic.warning-subtle': 'color-warning-subtle',
  'semantic.warning-strong': 'color-warning-strong',
  'semantic.error': 'color-danger',           // w3c says "error", CSS says "danger"
  'semantic.error-hover': 'color-danger-hover',
  'semantic.error-subtle': 'color-danger-subtle',
  'semantic.error-strong': 'color-danger-strong',
  'semantic.info': 'color-info',
  'semantic.info-hover': 'color-info-hover',
  'semantic.info-subtle': 'color-info-subtle',
  'semantic.info-strong': 'color-info-strong',
  'semantic.important': 'color-important',
  'semantic.important-subtle': 'color-important-subtle',
  'semantic.important-strong': 'color-important-strong',
  'semantic.neutral': 'color-neutral',
  'semantic.neutral-subtle': 'color-neutral-subtle',
  'semantic.neutral-strong': 'color-neutral-strong',

  'semantic-dark.success-subtle': 'color-success-subtle-dark',
  'semantic-dark.success-strong': 'color-success-strong-dark',
  'semantic-dark.warning-subtle': 'color-warning-subtle-dark',
  'semantic-dark.warning-strong': 'color-warning-strong-dark',
  'semantic-dark.error-subtle': 'color-danger-subtle-dark',   // w3c "error", CSS "danger"
  'semantic-dark.error-strong': 'color-danger-strong-dark',
  'semantic-dark.info-subtle': 'color-info-subtle-dark',
  'semantic-dark.info-strong': 'color-info-strong-dark',
  'semantic-dark.important-subtle': 'color-important-subtle-dark',
  'semantic-dark.important-strong': 'color-important-strong-dark',
  'semantic-dark.neutral-subtle': 'color-neutral-subtle-dark',
  'semantic-dark.neutral-strong': 'color-neutral-strong-dark',

  'text.heading': 'color-text-heading',
  'text.heading-alt': 'color-text-heading-alt',
  'text.body': 'color-text-body',
  'text.muted': 'color-text-muted',
  'text.placeholder': 'color-text-placeholder',
  'text.disabled': 'color-text-disabled',
  'text.support': 'color-text-support',
  'text.on-primary': 'color-text-on-primary',
  'text.on-action-hover': 'color-text-on-action-hover',
  'text.on-action-tertiary': 'color-text-on-action-tertiary',
  'text.on-action-tertiary-hover': 'color-text-on-action-tertiary-hover',
  'text.link': 'color-text-link',
  'text.link-hover': 'color-text-link-hover',
  'text.link-menu': 'color-text-link-menu',
  'text.link-menu-hover': 'color-text-link-menu-hover',

  'accent.1': 'color-accent-1',
  'accent.2': 'color-accent-2',
  'accent.3': 'color-accent-3',
  'accent.4': 'color-accent-4',

  'text-dark.heading': 'color-text-dark-heading',
  'text-dark.heading-alt': 'color-text-dark-heading-alt',
  'text-dark.body': 'color-text-dark-body',
  'text-dark.muted': 'color-text-dark-muted',
  'text-dark.placeholder': 'color-text-dark-placeholder',
  'text-dark.disabled': 'color-text-dark-disabled',
  'text-dark.support': 'color-text-dark-support',
  'text-dark.link': 'color-text-dark-link',
  'text-dark.link-hover': 'color-text-dark-link-hover',
  'text-on-dark.heading': 'color-text-on-dark-heading',
  'text-on-dark.body': 'color-text-on-dark-body',
  'text-on-light.heading': 'color-text-on-light-heading',
  'text-on-light.body': 'color-text-on-light-body',

  'surface.background': 'color-bg-base',      // w3c "surface", CSS "bg"
  'surface.background-shade': 'color-bg-shade',
  'surface.card': 'color-bg-card',
  'surface.card-alt': 'color-bg-card-alt',
  'surface.footer': 'color-bg-footer',
  'surface.footer-alt': 'color-bg-footer-alt',
  /* surface.disabled had no entry here and no entry in tokens.w3c.json until
     2026-08-11, so the LIGHT disabled surface was gated by nothing while its
     dark counterpart was — Figma has carried the row all along. */
  'surface.disabled': 'color-bg-disabled',
  'surface.section': 'color-bg-section',
  'surface.section-alt': 'color-bg-section-alt',
  'surface-dark.background': 'color-bg-dark',
  'surface-dark.background-shade': 'color-bg-dark-shade',
  'surface-dark.card': 'color-bg-dark-card',
  'surface-dark.card-alt': 'color-bg-dark-card-alt',
  'surface-dark.disabled': 'color-bg-dark-disabled',
  'surface-dark.section': 'color-bg-dark-section',
  'surface-dark.section-alt': 'color-bg-dark-section-alt',

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

  // transparent/white + transparent/black alpha ramps — 8-digit hex, so they
  // compare as ordinary colours rather than needing an rgba() parser.
  ...Object.fromEntries(
    ['white', 'black'].flatMap((base) =>
      [1, 5, 10, 20, 30, 40, 50].map((stop) => [`transparent.${base}-${stop}`, `transparent-${base}-${stop}`])
    )
  ),
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

/* ── a role-named type token must reach a Tailwind namespace ─────────────── */

/**
 * tokens.css names line-heights and weights by ROLE — `--line-height-caption`,
 * `--fw-btn-lg`. Tailwind only emits a utility for a name sitting in one of its
 * own namespaces, which for these two are `--leading-*` and `--font-weight-*`.
 * A role that never lands there produces NO UTILITY, so a converted component
 * cannot write "the caption's line-height" and reaches for the nearest raw
 * number instead: `leading-4` says 1rem, it does not say caption.
 *
 * This is the half-wired seam the 2026-08-12 audit measured. Sizes travel by
 * role (`text-caption` resolves `--text-caption`, because `font-size-` is in
 * build-theme's RENAME map) while line-height and weight did not, so the same
 * class string names its size semantically and its leading numerically.
 * Before this gate existed: 25 line-height roles and 26 weight roles defined,
 * and **0 of the 11 converted components referenced any of them** — the whole
 * library used one, inside FooterBar, which had not been converted yet.
 *
 * The fix is in the generator, not here: a prefix in build-theme's RENAME map,
 * exactly how `rounded-` reaches `--radius-*` and `font-size-` reaches
 * `--text-*`. Renamed tokens are also aliased back to their original names, so
 * `var(--line-height-caption)` keeps resolving for anything still reading it.
 */
const TYPE_ROLE_NS = [
  { prefix: 'line-height-', themePrefix: 'leading-', utility: (r) => `leading-${r}` },
  { prefix: 'fw-', themePrefix: 'font-weight-', utility: (r) => `font-${r}` },
];
for (const { prefix, themePrefix, utility } of TYPE_ROLE_NS) {
  for (const name of TOKENS.vars.keys()) {
    if (!name.startsWith(prefix)) continue;
    const role = name.slice(prefix.length);
    checks++;
    if (THEME.vars.has(themePrefix + role)) continue;
    err(
      'type namespace',
      name,
      `theme.css has no \`--${themePrefix}${role}\`, so \`${utility(role)}\` is not a utility — ` +
        `the role is unreachable from a converted component and only a raw number can stand in`,
    );
  }
}

/* ── the generated layer must be current ─────────────────────────────────── */

// theme.css is generated from tokens.css; a stale copy is drift by definition.
{
  checks++;
  const stamp = '/**\n * Iron Software Design System — Tailwind v4 theme';
  if (!readSource('tailwind/theme.css').startsWith(stamp)) {
    err('generated', 'theme.css', 'file header is missing — was it hand-edited? run: node scripts/build-theme.mjs');
  }
}

/* ── components must never hardcode a colour ─────────────────────────────── */

/**
 * Three ways a raw colour can reach a component, all of them drift:
 *
 *  · hex — `#abc`, `#aabbcc`, and the 8-digit `#aabbccdd` the transparent ramp
 *    uses. The 8-digit form used to slip through: the old pattern ended in `\b`
 *    after six digits, and the two alpha digits that follow are word characters,
 *    so no boundary was there to match.
 *  · `rgb()` / `rgba()` / `hsl()` / `hsla()`. This was the real blind spot —
 *    twelve of them sat across four components while this gate stayed green,
 *    the same hole that let `--ondark-tint` drift to 4% against Figma's 5%.
 *  · nothing else: `transparent`, `currentColor` and `color-mix()` over a token
 *    are all fine, since they carry no literal channel values.
 *
 * A tint of a semantic colour belongs in `color-mix(in srgb, var(--token) N%,
 * transparent)`, which also follows the token into dark mode — a hardcoded rgba
 * cannot.
 */
const RAW_COLOUR = /#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{2})?)?\b|\b(?:rgba?|hsla?)\([^)]*\)/g;

/**
 * COMMENTS ARE BLANKED FIRST, not stripped — replacing them with spaces of the
 * same shape keeps every line number correct, which is the whole value of the
 * report.
 *
 * A hex inside a comment cannot render. This gate read them anyway, and the way
 * it surfaced is the point: a comment written on 2026-08-06 explaining that
 * `--color-bg-disabled` *is* #F8FAFC — documenting the token, not setting a
 * colour — failed the build. The fix for that would otherwise have been to write
 * a worse comment.
 *
 * `check-component-vars.mjs` already does this and says why: a component that
 * documents its tokens in prose otherwise reports usages it does not have. Same
 * rule, second home.
 */
const blankComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^([ \t]*)\/\/.*$/gm, (m, indent) => indent + ' '.repeat(m.length - indent.length));

/* INTERNAL COMPONENTS TOO, from 2026-08-26. This walked `components/` alone,
   so a raw colour was a build failure in `FooterBar` and invisible in
   `ProductFlyout` — same package, same stylesheet, same dark mode. The hole was
   empty when it was closed (all three internal components measured clean, with
   comments stripped), which is the cheapest possible moment to close one. */
for (const source of componentSources()) {
  const src = blankComments(readFileSync(source.file, 'utf8'));
  src.split('\n').forEach((line, i) => {
    for (const [raw] of line.matchAll(RAW_COLOUR)) {
      checks++;
      err('components', `${source.name}.astro:${i + 1}`, `hardcoded ${raw} — use a semantic token, or color-mix() over one for a tint`);
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

/* ── self-test ───────────────────────────────────────────────────────────── */

/**
 * Per CLAUDE.md: a check that cannot fail on the machine that wrote it is not a
 * check. Each fault below is planted on the REAL token files, one at a time, in
 * a child process, and the gate must name `h1-hero` — not merely exit non-zero,
 * which a crashing script also does.
 *
 * The two CONTROL rows are the point of the exercise. Before 2026-09-01 this
 * gate reported "No drift" for a `clamp()` in the source of truth against a
 * completely different `clamp()` in both consumable layers, because `px()`
 * returned null for each and `null !== null` is false. A fix that simply
 * refused every clamp would turn that row green while breaking the fluid work
 * it exists to allow, so `identical clamps` and `same value, rem vs px` must
 * stay CLEAN while `slope only` fails: together they prove the gate compares
 * fluid values rather than rejecting their shape.
 */
if (SELF_TEST) {
  if (errors.length) {
    console.error(`\n\x1b[31m✖  self-test cannot run — the live tree already has ${errors.length} drift(s)\x1b[0m\n`);
    for (const { family, token, msg } of errors) console.error(`    ${family} ${token}: ${msg}`);
    process.exit(1);
  }

  const W3C_SIZE = '"fontSize": "48px"';
  const TOKENS_SIZE = '--font-size-h1-hero:  var(--font-size-6xl);';
  const THEME_SIZE = '--text-h1-hero: var(--text-6xl);';
  const css = (v) => [
    ['tailwind/tokens.css', TOKENS_SIZE, `--font-size-h1-hero:  ${v};`],
    ['tailwind/theme.css', THEME_SIZE, `--text-h1-hero: ${v};`],
  ];
  const w3c = (v) => [['tokens/tokens.w3c.json', W3C_SIZE, `"fontSize": "${v}"`]];

  const FAULTS = [
    /* The arm. Without this row every row below could be passing because the
       token is not reached at all rather than because the comparison works. */
    ['ARM — a plain px disagreement', css('40px'), true],

    ['FLUID — disagreeing clamps', [...w3c('clamp(32px, 5vw, 48px)'), ...css('clamp(64px, 9vw, 96px)')], true],
    ['FLUID — only the slope differs', [...w3c('clamp(32px, 5vw, 48px)'), ...css('clamp(32px, 6vw, 48px)')], true],
    ['FLUID — identical clamps (control, must stay clean)',
      [...w3c('clamp(32px, 5vw, 48px)'), ...css('clamp(32px, 5vw, 48px)')], false],
    ['FLUID — same value, rem vs px (control, must stay clean)',
      [...w3c('clamp(32px, 5vw, 48px)'), ...css('clamp(2rem, 5vw, 3rem)')], false],

    ['MIXED — fluid in w3c, fixed in the layers', w3c('clamp(32px, 5vw, 48px)'), true],
    ['MIXED — fixed in w3c, fluid in the layers', css('clamp(32px, 5vw, 48px)'), true],

    /* The general rule, not the clamp special case: a shape no normaliser here
       reads must be an error rather than a silent agreement.

       THE SECOND ROW IS THE ONE THAT TESTS THE GUARD. With only one side
       unreadable the comparison is `null !== "48"`, which was already an error
       before the guard existed — that row proves nothing about it. The guard is
       reached only when BOTH sides are unread, which is `null !== null`, false,
       and is exactly the shape the clamp arrived in. */
    ['SHAPE — unreadable on one side', css('calc(3rem + 1px)'), true],
    ['SHAPE — unreadable on BOTH sides (the `null !== null` case)',
      [...w3c('calc(3rem + 1px)'), ...css('calc(3rem + 2px)')], true],
    /* `parseFloat` discarded any unit it did not know, so this pair — 48vw
       against the w3c's 48px — used to compare EQUAL. */
    ['UNIT — a unit that used to be discarded', css('48vw'), true],
  ];

  let failed = 0;
  console.log(`\n  \x1b[1mself-test\x1b[0m — the live tree reports 0 drifts (${checks} tokens)\n`);

  for (const [name, patches, shouldFail] of FAULTS) {
    let status = 0;
    let out = '';
    try {
      out = execFileSync(process.execPath, [SELF], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, TOKEN_DRIFT_FAULT: JSON.stringify(patches) },
      });
    } catch (e) {
      status = e.status ?? 1;
      out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }

    /* A plant that matched nothing crashes readSource. That also exits 1, and
       would otherwise be read as the fault being caught. */
    const landed = !out.includes('planted fault did not land');
    const named = out.includes('h1-hero');
    const ok = landed && (shouldFail ? status !== 0 && named : status === 0 && !named);

    if (!ok) failed++;
    const mark = ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m';
    const verdict = !landed ? 'PLANT DID NOT LAND' : status === 0 ? 'clean' : named ? 'named h1-hero' : `exit ${status}, did not name it`;
    console.log(`    ${mark} ${name.padEnd(52)} ${verdict}`);
  }

  if (failed) {
    console.log(`\n\x1b[31m✖  self-test: ${failed} of ${FAULTS.length} rows wrong\x1b[0m\n`);
    process.exit(1);
  }
  console.log(`\n\x1b[32m✔  self-test: ${FAULTS.length}/${FAULTS.length} — the gate fails where it must and stays clean where it must\x1b[0m\n`);
  process.exit(0);
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
