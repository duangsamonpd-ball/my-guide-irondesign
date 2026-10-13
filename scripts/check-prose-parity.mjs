#!/usr/bin/env node
/**
 * check:prose-parity — a link inside <Prose> looks exactly like
 * <TextLink variant="underline">, in every state and both modes.
 *
 * They are two stylesheets for one look, and that is deliberate: TextLink styles
 * a link by BEING the link, while Prose styles `<a>` tags that Markdown wrote and
 * no component rendered (`Prose.astro` explains why it cannot simply reuse
 * TextLink's CSS). The cost is that a change to one is not a change to the other.
 * On 2026-10-13 the underline look moved — heading text, a solid line, 1px → 2px
 * on hover — and both files were edited by hand, then compared in Chrome. Nothing
 * would have noticed if only one had been edited.
 *
 * How it decides: each file's <style> is read, and for each of the six states
 * (light/dark × rest/hover/focus) the declarations that APPLY are folded in
 * cascade order — specificity, then source order — exactly as the browser would
 * for an element in that state. Then the properties that make up the look are
 * compared, value for value, as written (`var(--color-text-heading)` must equal
 * `var(--color-text-heading)`; resolving tokens is not this gate's question).
 *
 * What is NOT compared, on purpose:
 *   - `transition` — TextLink also transitions `color` and
 *     `text-decoration-color`, because `.tlink` is shared with the plain variant,
 *     whose colour does change. On an underline link neither moves, so the two
 *     render identically.
 *   - anything inside an at-rule (`@media (prefers-reduced-motion)`) — it only
 *     shortens transitions.
 *   - TextLink rules on children (`.tlink .arrow-icon`) or on the plain variant.
 *
 * It arms itself before it reports: every state on both sides must resolve the
 * core properties (colour, line colour, thickness, offset, weight), so a
 * selector pattern that matches nothing fails loudly instead of comparing two
 * empty sets and calling them equal. `--self-test` plants a drift in each
 * direction and refuses to pass unless each is caught.
 *
 * Usage:  node scripts/check-prose-parity.mjs [--self-test]
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEXTLINK = 'astro-components/components/TextLink.astro';
const PROSE = 'astro-components/components/Prose.astro';

/** The properties that ARE the look. Shorthands are expanded into these. */
const LOOK = [
  'color',
  'font-weight',
  'text-decoration-line',
  'text-decoration-style',
  'text-decoration-color',
  'text-decoration-thickness',
  'text-underline-offset',
  'outline-width',
  'outline-style',
  'outline-color',
  'outline-offset',
  'border-radius',
];
/** Every state must resolve these on both sides, or the instrument is mis-aimed. */
const CORE = ['color', 'font-weight', 'text-decoration-line', 'text-decoration-color', 'text-decoration-thickness', 'text-underline-offset'];

const STATES = ['rest', 'hover', 'focus'];
const MODES = ['light', 'dark'];

/* ── a parser just big enough for a component <style> ──────────────────────── */

function styleOf(src, file) {
  const m = src.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!m) throw new Error(`${file}: no <style> block`);
  return m[1];
}

/** Top-level `selector { decls }` rules, in source order. At-rule blocks are skipped whole. */
function parseRules(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open === -1) break;
    const prelude = css.slice(i, open).trim();
    // find the matching close, counting nesting
    let depth = 1, j = open + 1;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const body = css.slice(open + 1, j - 1);
    if (!prelude.startsWith('@')) {
      const decls = {};
      for (const d of body.split(';')) {
        const k = d.indexOf(':');
        if (k === -1) continue;
        decls[d.slice(0, k).trim()] = d.slice(k + 1).trim().replace(/\s+/g, ' ');
      }
      for (const sel of prelude.split(',')) rules.push({ selector: sel.trim().replace(/\s+/g, ' '), decls, order: rules.length });
    }
    i = j;
  }
  return rules;
}

/** Expand the shorthands this look uses into LOOK longhands. */
function expand(decls) {
  const out = {};
  for (const [p, v] of Object.entries(decls)) {
    if (p === 'text-decoration') {
      // `underline` / `none` / `underline <color>` — this repo writes only the line
      const parts = v.split(' ');
      out['text-decoration-line'] = parts[0];
      if (parts.length > 1) throw new Error(`text-decoration shorthand with more than a line ("${v}") — expand it here before trusting the comparison`);
    } else if (p === 'outline') {
      const [w, s, ...c] = v.split(' ');
      out['outline-width'] = w; out['outline-style'] = s; out['outline-color'] = c.join(' ');
    } else out[p] = v;
  }
  return out;
}

/* ── which rules apply to an element in a given state ─────────────────────── */

/**
 * TextLink: a compound of `.tlink` plus any of `.underline` `.dark`, optionally
 * one state pseudo-class. Anything else (`.plain`, a descendant) is not about
 * the underline link itself.
 */
function textlinkMatch(sel) {
  const m = sel.match(/^\.tlink((?:\.(?:underline|dark))*)(:hover|:focus-visible)?$/);
  if (!m) return null;
  return { classes: new Set(m[1].split('.').filter(Boolean)), state: m[2] ? (m[2] === ':hover' ? 'hover' : 'focus') : null, spec: 1 + m[1].split('.').filter(Boolean).length + (m[2] ? 1 : 0) };
}

/** Prose: `.ds-prose[.dark] :where(a[:hover|:focus-visible])` — :where adds nothing. */
function proseMatch(sel) {
  const m = sel.match(/^\.ds-prose(\.dark)? :where\(a(:hover|:focus-visible)?\)$/);
  if (!m) return null;
  return { classes: new Set(m[1] ? ['dark'] : []), state: m[2] ? (m[2] === ':hover' ? 'hover' : 'focus') : null, spec: 1 + (m[1] ? 1 : 0) };
}

function resolve(rules, match, need, mode, state) {
  const target = new Set([...need, ...(mode === 'dark' ? ['dark'] : [])]);
  const applying = [];
  for (const r of rules) {
    const m = match(r.selector);
    if (!m) continue;
    if ([...m.classes].some((c) => !target.has(c))) continue;
    if (m.state && m.state !== state) continue;
    // TextLink's base `.tlink` carries no variant class; a rule must still be ABOUT the underline variant or the base
    applying.push({ ...m, ...r });
  }
  applying.sort((a, b) => a.spec - b.spec || a.order - b.order);
  const out = {};
  for (const r of applying) Object.assign(out, expand(r.decls));
  return { decls: out, rules: applying.length };
}

/* ── the check ─────────────────────────────────────────────────────────────── */

function compare(tlSrc, prSrc) {
  const tl = parseRules(styleOf(tlSrc, TEXTLINK));
  const pr = parseRules(styleOf(prSrc, PROSE));
  const problems = [];
  const table = [];
  for (const mode of MODES) for (const state of STATES) {
    const a = resolve(tl, textlinkMatch, ['underline'], mode, state);
    const b = resolve(pr, proseMatch, [], mode, state);
    const at = `${mode} ${state}`;
    for (const [name, side] of [['TextLink', a], ['Prose', b]]) {
      const missing = CORE.filter((p) => !(p in side.decls));
      if (missing.length) problems.push(`${at}: ${name} resolves no ${missing.join(', ')} — the selector patterns no longer match its CSS, so this gate is not looking at it`);
    }
    for (const p of LOOK) {
      const x = a.decls[p], y = b.decls[p];
      if (x !== y) problems.push(`${at}: ${p} — TextLink ${x ?? '(unset)'} · Prose ${y ?? '(unset)'}`);
    }
    table.push(`${at.padEnd(11)} ${a.rules}+${b.rules} rules · ${LOOK.filter((p) => a.decls[p] !== undefined).length} properties`);
  }
  return { problems, table };
}

const read = (f) => readFileSync(join(ROOT, f), 'utf8');

if (process.argv.includes('--self-test')) {
  const tl = read(TEXTLINK), pr = read(PROSE);
  const cases = [
    ['clean pair passes', tl, pr, 0],
    ['Prose keeps the old 1.5px hover', tl, pr.replace(/(:where\(a:hover\)\s*\{[^}]*?)var\(--border-width-2\)/, '$1var(--border-width-1-5)'), 1],
    ['TextLink drops the dark heading colour', tl.replace('.tlink.underline.dark { color: var(--color-text-dark-heading);', '.tlink.underline.dark { color: var(--color-text-dark-body);'), pr, 1],
    ['Prose underline goes back to 50%', tl, pr.replace(/(\.ds-prose :where\(a\) \{[^}]*?text-decoration-color: )var\(--color-border-selected\)/, '$1color-mix(in srgb, var(--color-border-selected) 50%, transparent)'), 1],
    ['TextLink focus ring loses its offset', tl.replace(/(\.tlink\.underline:focus-visible \{[^}]*?)outline-offset: 3px;/, '$1'), pr, 1],
    ['a selector the pattern cannot read (renamed class) is a failure, not a pass', tl.replace(/\.tlink\.underline \{/, '.tlink.under-line {'), pr, 1],
  ];
  let bad = 0;
  for (const [name, a, b, wantFail] of cases) {
    if (a === tl && b === pr && wantFail) { console.log(`  ✖ ${name}: the plant did not change the source — fix the self-test`); bad++; continue; }
    const { problems } = compare(a, b);
    const ok = wantFail ? problems.length > 0 : problems.length === 0;
    console.log(`  ${ok ? '✔' : '✖'} ${name}${wantFail ? ` → ${problems.length} problem(s)` : ''}`);
    if (!ok) { bad++; for (const p of problems) console.log(`      ${p}`); }
  }
  if (bad) { console.log(`\n✖  check:prose-parity self-test: ${bad} case(s) wrong`); process.exit(1); }
  console.log('\n✔  check:prose-parity self-test: every planted drift is caught');
  process.exit(0);
}

const { problems, table } = compare(read(TEXTLINK), read(PROSE));
for (const t of table) console.log(`  ${t}`);
if (problems.length) {
  console.log(`\n✖  Prose links and TextLink underline disagree (${problems.length}):`);
  for (const p of problems) console.log(`    ${p}`);
  console.log(`\n  ${PROSE} says it is TextLink variant="underline", value for value — move whichever side is behind.`);
  process.exit(1);
}
console.log('\n✔  Prose links match TextLink variant="underline" in all six states');
