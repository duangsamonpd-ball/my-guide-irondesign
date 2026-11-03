#!/usr/bin/env node
/**
 * check:class-collisions — no class a component owns is also a Tailwind utility.
 *
 * ── WHAT HAPPENED ───────────────────────────────────────────────────────────
 *
 * 2026-11-02, TextLink c61a75e: the new `size` prop put `size-md` / `size-sm` on
 * the link, styled by `.tlink.size-md { font-size; line-height }`. `size-md` is
 * also a Tailwind utility — `width` and `height` from `--spacing-md`. Every
 * consumer's Tailwind scans the component file (README: point `@source` at
 * `components/*.astro`), finds the candidate, and emits the utility. The room's
 * sized links were squashed to a box (`npm run measure` on iron-suite: 4942
 * differences). Fixed in ca6627f as `tlink--md`.
 *
 * NOTHING HERE COULD SEE IT, and this is why the gate has to exist rather than
 * an instrument being pointed somewhere new:
 *   · this repo's own Tailwind emits no utilities for itself — the docs link a
 *     `utilities.css` built from the MARKUP only, with <style> blocks stripped
 *     (build-utilities.mjs note 3), so the colliding rule never reaches a docs
 *     page and every render here looked right;
 *   · `check:parity`, `style-diff` and `audit` all read those docs pages.
 * The only witness was the consuming room, measuring by chance.
 *
 * ── WHAT IT ASKS ────────────────────────────────────────────────────────────
 *
 * Which classes does a component OWN — style itself, or set from its script —
 * and which of them does a consumer's Tailwind turn into a rule?
 *
 *   owned   = every class in a <style> selector (any compound, not just the
 *             first: `.tlink.size-md` owns both, and `.x .hidden` would put a
 *             utility on `.hidden` whatever `.x` is), plus every string handed
 *             to `classList.add/remove/toggle/contains/replace` in a <script>.
 *   emitted = ASKED OF TAILWIND, never of a list — the real CLI, compiling
 *             `tailwind/theme.css` exactly as a consumer imports it, with
 *             detection off and one file wearing every owned class as its only
 *             source. A hand list of utility names would be wrong the day
 *             Tailwind or the theme adds one (`size-md` exists only because the
 *             theme defines `--spacing-md`).
 *
 * A DIFFERENTIAL against a compile with no candidates, because theme.css
 * contributes selectors of its own — `.dark`, the system's dark-mode hook. A
 * component wearing `dark` is not wearing a utility; it is printed, not failed.
 *
 * Classes in MARKUP that no <style> rule targets are not asked about: they are
 * the utilities the component means to use, and this cannot tell those from an
 * accident without knowing intent. Classes a consumer's own theme adds are not
 * asked about either — only this system's theme is known here.
 *
 * ── A COLLISION IS NOT ALWAYS DAMAGE ────────────────────────────────────────
 *
 * The utility lands in `@layer utilities`; Astro's scoped component rules are
 * unlayered and win on every property they set. Damage is a property the
 * utility sets and the component does not — `size-md`'s width and height. So
 * a collision can be measured harmless, and then it is a KNOWN entry keyed to
 * the exact rule Tailwind emits for it. If that rule changes (a Tailwind
 * upgrade, a theme token), the entry no longer matches and the gate fails
 * again, because the measurement was of the old rule. An entry whose class no
 * longer collides fails too: a stale exemption is a hole waiting for a name.
 *
 * Naming rule that avoids all of this: a component modifier is
 * `<block>--<mod>` (`tlink--md`, `pm--fit`), never a bare word.
 *
 * Run:  node scripts/check-class-collisions.mjs [--self-test]
 * Exit: 0 = no owned class is an unexplained utility · 1 = one is, or the
 *       instrument could not prove it was aimed
 *
 * Needs node_modules (the Tailwind CLI), like check:vars.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { componentSources, ROOT } from './lib/sources.mjs';

const SELF_TEST = process.argv.includes('--self-test');
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

const THEME = join(ROOT, 'tailwind/theme.css');
const CLI = join(ROOT, 'node_modules/.bin/tailwindcss');
const TMP = join(ROOT, 'node_modules/.tmp/class-collisions');
const ANCHOR = '@import "tailwindcss";';

/**
 * Collisions measured harmless. Keyed to the rule body Tailwind emits, so a
 * changed rule re-opens the question instead of inheriting the answer.
 */
const KNOWN = {
  underline: {
    body: 'text-decoration-line: underline',
    owner: 'TextLink',
    why:
      "TextLink's `variant=\"underline\"` class. Every element wearing it is `.tlink.underline`, " +
      'whose own unlayered rule sets `text-decoration: underline …`, so the utility only restates it. ' +
      'Measured 2026-11-03 at 1440: the rule injected in `@layer utilities` left all 10 `.tlink.underline` ' +
      'links on the TextLink page and the gallery identical (decoration line, colour, thickness and offset; ' +
      'text colour, weight, outline), while a planted letter-spacing in the same layer moved them.',
  },
};

/* ── what a component owns ─────────────────────────────────────────────── */

/** Selector texts of every rule in a stylesheet, at-rule preludes excluded. */
export function selectorsOf(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  for (const m of clean.matchAll(/(?:^|[{};])\s*([^{};@]+?)\s*\{/g)) out.push(m[1]);
  return out;
}

/** Class names in one selector. Attribute values and strings are not classes. */
export function classesInSelector(sel) {
  const bare = sel.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"|'[^']*'/g, '');
  const out = [];
  for (const m of bare.matchAll(/\.(-?[_a-zA-Z](?:[\w-]|\\.)*)/g)) out.push(m[1].replace(/\\(.)/g, '$1'));
  return out;
}

/** `{ name → Set<'style' | 'script'> }` for one component's source. */
export function ownedClasses(src) {
  const owned = new Map();
  const add = (name, how) => (owned.get(name) ?? owned.set(name, new Set()).get(name)).add(how);
  const styles = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  for (const css of styles) for (const sel of selectorsOf(css)) for (const c of classesInSelector(sel)) add(c, 'style');
  for (const m of src.matchAll(/classList\.(?:add|remove|toggle|contains|replace)\(([^)]*)\)/g)) {
    for (const s of m[1].matchAll(/'([^']+)'|"([^"]+)"|`([^`$]+)`/g)) add(s[1] ?? s[2] ?? s[3], 'script');
  }
  return { owned, styleBlocks: styles.length };
}

/* ── what Tailwind emits ───────────────────────────────────────────────── */

/** `{ class → normalised body }` for every lone-class rule Tailwind emits for `names`. */
function emitted(names, theme) {
  mkdirSync(TMP, { recursive: true });
  const scan = join(TMP, 'scan.html');
  const input = join(TMP, 'in.css');
  const output = join(TMP, 'out.css');
  writeFileSync(scan, `<div class="${names.join(' ')}"></div>`);
  if (!theme.includes(ANCHOR)) throw new Error(`tailwind/theme.css no longer contains \`${ANCHOR}\` — cannot compile it as a consumer does`);
  writeFileSync(input, theme.replace(ANCHOR, `@import "tailwindcss" source(none);\n@source "${scan}";`));
  execFileSync(CLI, ['-i', input, '-o', output], { stdio: 'pipe' });
  const css = readFileSync(output, 'utf8');
  const rules = new Map();
  for (const m of css.matchAll(/^\s*\.((?:[\w-]|\\.)+)\s*\{([^{}]*)\}/gm)) {
    const name = m[1].replace(/\\(.)/g, '$1');
    if (!rules.has(name)) rules.set(name, m[2].replace(/\s+/g, ' ').trim().replace(/;$/, ''));
  }
  return rules;
}

/**
 * The verdict, as data. `owners` is `{ name → [component, …] }`.
 * Baseline and candidate compiles are passed in so the self-test can drive it.
 */
export function judge(owners, base, withAll, known) {
  const collisions = [], themeOwned = [], stale = [], changed = [], exempt = [];
  for (const [name, who] of owners) {
    if (base.has(name)) { themeOwned.push({ name, who }); continue; }
    if (!withAll.has(name)) continue;
    const body = withAll.get(name);
    const k = known[name];
    if (!k) collisions.push({ name, who, body });
    else if (k.body !== body) changed.push({ name, who, body, was: k.body });
    else exempt.push({ name, who, body, why: k.why });
  }
  for (const name of Object.keys(known)) {
    if (!owners.has(name) || base.has(name) || !withAll.has(name)) stale.push(name);
  }
  return { collisions, themeOwned, stale, changed, exempt };
}

/* ── self-test ─────────────────────────────────────────────────────────── */

function selfTest() {
  const theme = readFileSync(THEME, 'utf8');
  const rows = [];
  const row = (label, ok) => rows.push([label, !!ok]);

  const fixture = `
---
const x = 1;
---
<a class="tlink">x</a>
<style>
  /* .flex in a comment is prose */
  .tlink.size-md { font-size: 1rem; margin: .5rem; background: url(a.grid.png); }
  .tlink--md { font-size: 1rem; }
  @media (min-width: 640px) { .wrap .hidden > .cell { display: none; } }
  .a[data-x=".block"]:not(.is-open) { color: red; }
  :global(.dark) .tlink { color: blue; }
  .md\\:flex { color: red; }
</style>
<script>
  el.classList.toggle('pm-menu-open', open);
  el.classList.add("sr-only");
</script>`;
  const { owned, styleBlocks } = ownedClasses(fixture);
  const has = (n) => owned.has(n);
  row('extractor: a modifier joined to its block is owned (`.tlink.size-md` → size-md)', has('size-md'));
  row('…and so is a <block>--<mod> class', has('tlink--md'));
  row('…and a class in a later compound, inside @media (`.wrap .hidden > .cell`)', has('hidden') && has('cell') && has('wrap'));
  row('…and a class inside :not()', has('is-open'));
  row('…and a class a <script> sets through classList, quoted either way', has('pm-menu-open') && has('sr-only'));
  row('…and an escaped class, unescaped (`.md\\:flex` → md:flex)', has('md:flex'));
  row('extractor: a comment is not a selector (`.flex` in /* */)', !has('flex'));
  row('…nor a declaration value (`.5rem`, `url(a.grid.png)`)', !has('5rem') && !has('grid') && !has('png'));
  row('…nor an attribute value (`[data-x=".block"]`)', !has('block'));
  row('…and the style block was found at all', styleBlocks === 1);

  const names = [...owned.keys(), 'flex'];
  const base = emitted([], theme);
  const withAll = emitted(names, theme);
  row('compiler is aimed: a plain utility (`flex`) comes back from the candidate file', withAll.has('flex') && !base.has('flex'));
  row('…and the theme hook `.dark` is in the BASELINE, so it is subtracted, not reported', base.has('dark'));
  row('compiler: `size-md` — the bug that shipped — is a utility under this theme', withAll.has('size-md'));
  row('…and `tlink--md` — the fix — is not', !withAll.has('tlink--md'));

  const owners = new Map([...owned.keys()].map((n) => [n, ['Fixture']]));
  const v = judge(owners, base, withAll, {});
  const found = new Set(v.collisions.map((c) => c.name));
  row('judge: size-md and hidden are reported as collisions', found.has('size-md') && found.has('hidden'));
  row('…sr-only, set only from a script, is reported too', found.has('sr-only'));
  row('…tlink--md and pm-menu-open are not', !found.has('tlink--md') && !found.has('pm-menu-open'));
  row('…dark is reported as theme-owned, not as a collision', v.themeOwned.some((t) => t.name === 'dark') && !found.has('dark'));

  const sizeBody = withAll.get('size-md');
  const ok = judge(owners, base, withAll, { 'size-md': { body: sizeBody } });
  row('KNOWN: an entry matching the emitted rule exempts it', ok.exempt.some((e) => e.name === 'size-md') && !ok.collisions.some((c) => c.name === 'size-md'));
  const moved = judge(owners, base, withAll, { 'size-md': { body: 'width: 0' } });
  row('KNOWN: an entry whose rule Tailwind no longer emits verbatim FAILS as changed', moved.changed.some((c) => c.name === 'size-md'));
  const gone = judge(owners, base, withAll, { 'no-such-class': { body: 'x: y' }, 'tlink--md': { body: 'x: y' } });
  row('KNOWN: an entry for a class nobody owns, or that is no utility, FAILS as stale', gone.stale.includes('no-such-class') && gone.stale.includes('tlink--md'));

  let failed = 0;
  console.log(bold('\n  check:class-collisions — self-test\n'));
  for (const [label, pass] of rows) {
    if (!pass) failed++;
    console.log(`  ${pass ? green('✔') : red('✖')} ${label}`);
  }
  if (failed) {
    console.error(red(`\n✖  ${failed} self-test row(s) failed — the collision check's output is not worth anything\n`));
    process.exit(1);
  }
  console.log(green(`\n✔  all ${rows.length} rows — the extractor and the compiler can each fail\n`));
}

/* ── run ───────────────────────────────────────────────────────────────── */

function main() {
  const theme = readFileSync(THEME, 'utf8');
  const sources = componentSources();
  const owners = new Map();
  const problems = [];
  let fromStyle = 0, fromScript = 0;

  for (const c of sources) {
    const { owned, styleBlocks } = ownedClasses(readFileSync(c.file, 'utf8'));
    const styleOwned = [...owned.values()].filter((h) => h.has('style')).length;
    /* A <style> block that yields no class means the extractor stopped reading
       it, and a component it cannot read is a component it calls clean. */
    if (styleBlocks > 0 && styleOwned === 0) problems.push(`${c.rel}: has ${styleBlocks} <style> block(s) and not one class was read from them`);
    for (const [name, how] of owned) {
      if (how.has('style')) fromStyle++;
      if (how.has('script')) fromScript++;
      (owners.get(name) ?? owners.set(name, []).get(name)).push(c.name);
    }
  }
  if (sources.length === 0) problems.push('no components found — sources.mjs returned nothing');
  if (owners.size < 50) problems.push(`only ${owners.size} owned classes read across ${sources.length} components — the extractor is not reading the styles`);

  const base = emitted([], theme);
  const withAll = emitted([...owners.keys(), 'flex'], theme);
  /* Armed on every run, not only in --self-test: a compiler that has stopped
     reading the candidate file reports no collisions, which reads as good news. */
  if (!withAll.has('flex') || base.has('flex')) problems.push('the compile did not emit `flex` from the candidate file — Tailwind is not reading it, so silence here means nothing');

  const v = judge(owners, base, withAll, KNOWN);

  console.log(bold('\n  check:class-collisions'));
  console.log(dim(`  ${owners.size} classes owned by ${sources.length} components (${fromStyle} from <style>, ${fromScript} from classList) · compiled with tailwind/theme.css as a consumer imports it\n`));

  for (const t of v.themeOwned) {
    console.log(dim(`  · .${t.name} — ${t.who.join(', ')} — emitted by theme.css itself, not a utility (the dark-mode hook); every DS page renders it, so it is not this gate's blind spot`));
  }
  for (const e of v.exempt) {
    console.log(dim(`  · .${e.name} — ${e.who.join(', ')} — known: { ${e.body} }`));
    console.log(dim(`      ${e.why}`));
  }

  for (const c of v.collisions) {
    problems.push(
      `.${c.name} (${c.who.join(', ')}) is also a Tailwind utility: { ${c.body} }\n` +
      `      A consumer's Tailwind scans the component and emits this rule onto every element wearing the class.\n` +
      `      Rename it <block>--<mod> (e.g. \`tlink--md\`). Only if the rule is measured to change nothing on`
      + ` every state, add it to KNOWN with that measurement.`,
    );
  }
  for (const c of v.changed) {
    problems.push(`.${c.name} (${c.who.join(', ')}) is KNOWN as { ${c.was} } but Tailwind now emits { ${c.body} } — the measurement that exempted it was of a different rule; measure again`);
  }
  for (const name of v.stale) {
    problems.push(`KNOWN lists .${name}, which no component owns or which is no longer a utility — delete the entry`);
  }

  if (problems.length) {
    console.error(red(`\n✖  ${problems.length} problem${problems.length > 1 ? 's' : ''}\n`));
    for (const p of problems) console.error(`  ${red('✖')} ${p}\n`);
    process.exit(1);
  }
  console.log(green(`\n✔  no owned class is an unexplained Tailwind utility — ${owners.size} asked, ${v.exempt.length} known, ${v.themeOwned.length} theme hook${v.themeOwned.length === 1 ? '' : 's'}\n`));
}

if (SELF_TEST) selfTest();
else main();
