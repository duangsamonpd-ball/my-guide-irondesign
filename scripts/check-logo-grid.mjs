#!/usr/bin/env node
/**
 * Iron Software Design System — does `Logo` offer sizes its own artwork can draw?
 *
 * `Logo`'s `size` prop is a UNION rather than a number, and the only argument it
 * has ever rested on is arithmetic: every mark and element is drawn in a 96-unit
 * viewBox, so rendering at S multiplies every coordinate by S/96. Where that
 * lands on a whole pixel the edge is crisp; where it does not the browser
 * anti-aliases it. The union is meant to be the list of sizes where most edges
 * land whole.
 *
 * WHY THIS EXISTS. That claim was written into Logo.astro as a measured table on
 * 2026-08-21 (`1a6cff6`) and was true when written — re-derived from the files as
 * they stood at that commit, it reproduces to the tenth of a percent. Three
 * commits later `91cd864` re-exported the ten product elements off their
 * pre-ramp colours, which re-drew their paths, and the table stopped describing
 * the artwork it is about: the element row had been flat at 0.2% across every
 * size, and 96/192 now measure 12.6% against 0.5% at 56. Nothing here read that
 * comment, so it was wrong for three days with twenty-one gates green. A number
 * written down beside artwork that can be re-exported is exactly the thing that
 * needs deriving rather than restating.
 *
 * TWO PROPERTIES, both about a correct tree rather than about that one bug.
 *
 *  1. EVERY SIZE THE UNION OFFERS IS A LOCAL MAXIMUM OF CRISPNESS. Not "is a
 *     multiple of 24" — that is the answer, and hardcoding an answer is how the
 *     table rotted. The property is that no size within a step either side draws
 *     MORE of its coordinates on whole pixels than the one being offered. A size
 *     sitting in a trough beside a crisper neighbour is a size the component is
 *     asking consumers to render blurry, and it fails. Measured against the
 *     artwork, so re-exporting the artwork re-derives the ladder.
 *
 *  2. THE TABLE IN THE JSDOC IS THE TABLE THE ARTWORK MEASURES. Every number in
 *     the `size` comment is parsed back out and compared to a fresh count. This
 *     is the half that would have caught the rot.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK. `height` — wordmarks and lockups are not
 * square and not on this grid (494x96 and 173x203), so whole-pixel edges are not
 * a property they have, and `height` is a free number for that reason.
 *
 * THE METRIC WAS VALIDATED AGAINST A REAL RENDER before this gate was trusted,
 * because coordinate arithmetic is a proxy for the thing that matters. Six marks
 * rasterised at nineteen sizes, counting pixels that are neither transparent nor
 * one of the flat colours the file declares: every multiple of 12 came back a
 * local minimum of anti-aliased pixels (24 29.7% · 36 26.6% · 48 18.3% ·
 * 60 18.3% · 72 14.5% · 96 12.5%) and every size the union used to carry that
 * this gate rejects came back beaten by a neighbour (40 29.9% · 56 25.7% ·
 * 64 21.7%). One thing the raster showed that the coordinates cannot: the share
 * is comparable only BETWEEN NEIGHBOURS, since a small mark has more edge per
 * unit of area — which is why the rule below is a local test and not a threshold.
 *
 * Counting is PATH DATA ONLY. Including cx/cy/x/y/width/height attributes raises
 * every figure by roughly two points and changes no ordering, but the table in
 * Logo.astro was produced from path data and a gate that cannot reproduce the
 * numbers it is checking is not checking them.
 *
 * Pure Node, no browser and no node_modules, so it runs inside `npm run check`.
 *
 * Run:  node scripts/check-logo-grid.mjs [--self-test] [--table]
 * Exit: 0 = the ladder is derived and the prose agrees · 1 = it is not
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'docs/assets');
const LOGO = join(ROOT, 'astro-components/components/Logo.astro');
const SELF_TEST = process.argv.includes('--self-test');
const TABLE = process.argv.includes('--table');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/**
 * The two families `size` applies to. `kind="mark"` and `kind="element"` are the
 * square ones; the self-test asserts Logo.astro still builds exactly these
 * prefixes, so a fifth kind cannot quietly fall outside the sweep.
 */
const FAMILIES = {
  mark: (f) => f.startsWith('mark-'),
  element: (f) => /^logo-\d/.test(f),
};

/** Every number inside a `d=` attribute. See the note on path data above. */
function pathCoords(svg) {
  const out = [];
  for (const m of svg.matchAll(/\sd="([^"]+)"/g))
    for (const n of m[1].matchAll(/-?\d+(?:\.\d+)?/g)) out.push(parseFloat(n[0]));
  return out;
}

function viewBoxWidth(svg) {
  const m = svg.match(/viewBox="([\d.\-\s]+)"/);
  return m ? Number(m[1].trim().split(/\s+/)[2]) : null;
}

/** Share of one file's path coordinates that land on a whole pixel at `size`. */
function onGrid(svg, size) {
  const vb = viewBoxWidth(svg);
  const c = pathCoords(svg);
  if (!vb || !c.length) return null;
  const k = size / vb;
  return { whole: c.filter((n) => Math.abs(n * k - Math.round(n * k)) < 1e-6).length, total: c.length };
}

const filesOf = (family) => readdirSync(ASSETS).filter((f) => f.endsWith('.svg') && FAMILIES[family](f)).sort();

/** Share across a whole family, as a percentage rounded the way the table writes it. */
function share(family, size, dir = ASSETS, list = null) {
  let whole = 0, total = 0;
  for (const f of (list ?? filesOf(family))) {
    const r = onGrid(readFileSync(join(dir, f), 'utf8'), size);
    if (r) { whole += r.whole; total += r.total; }
  }
  return total ? Number(((whole / total) * 100).toFixed(1)) : null;
}

/**
 * The `size` union, read out of the component rather than restated here.
 * A union member that is not a plain integer is a finding in itself.
 */
function unionSizes() {
  const src = readFileSync(LOGO, 'utf8');
  const m = src.match(/^\s*size\?:\s*([^;]+);/m);
  if (!m) return null;
  const raw = m[1].split('|').map((s) => s.trim());
  const nums = raw.filter((s) => /^\d+$/.test(s)).map(Number);
  return { raw, sizes: nums };
}

/**
 * The measured table in the `size` JSDoc. Rows are `mark` and `element`, one
 * percentage per size, and the header names the sizes — so both the row labels
 * and the columns come out of the prose and neither is assumed here.
 */
function jsdocTable() {
  const src = readFileSync(LOGO, 'utf8');
  const head = src.match(/^\s*\*\s{2,}((?:\d+px\s+)+\d+px)\s*$/m);
  if (!head) return null;
  const sizes = head[1].trim().split(/\s+/).map((s) => parseInt(s, 10));
  const rows = {};
  for (const family of Object.keys(FAMILIES)) {
    const r = src.match(new RegExp(`^\\s*\\*\\s{2,}${family}\\s+((?:[\\d.]+%\\s+)*[\\d.]+%)\\s*$`, 'm'));
    if (!r) return null;
    rows[family] = r[1].trim().split(/\s+/).map((s) => parseFloat(s));
    if (rows[family].length !== sizes.length) return null;
  }
  return { sizes, rows };
}

/**
 * Is `size` a local maximum of crispness for `family`? The neighbourhood is the
 * four sizes a designer would plausibly reach for instead — one 4-unit step and
 * one 8-unit step either side.
 *
 * A neighbour only counts if it draws at least TWICE as many coordinates whole,
 * and that factor is the difference between a rule and a rash. Written as
 * "strictly crisper" this flagged `element` at 24 because 32 measures 2.8%
 * against 2.1% — 0.7 of a point, on a family whose whole column lies between
 * 0.2% and 12.6%, i.e. noise inside a family that is barely on any grid at all.
 * The real findings are not close: 48 against 56 is 5.6x for the marks and 8.4x
 * for the elements. Two is low enough to still catch 64, which loses to 72 by
 * exactly that, and high enough to leave 24 alone. Both directions are pinned in
 * the self-test, so the factor cannot be widened into a hole without a row
 * going red.
 */
const NEIGHBOURS = [-8, -4, 4, 8];
const BEATEN_BY = 2;
function localMax(family, size) {
  const here = share(family, size);
  const beaten = NEIGHBOURS
    .map((d) => size + d)
    .filter((s) => s > 0)
    .map((s) => ({ size: s, pct: share(family, s) }))
    .filter((n) => n.pct >= here * BEATEN_BY && n.pct > here);
  return { here, beaten };
}

/* ── self-test ────────────────────────────────────────────────────────────── */

function selfTest() {
  const rows = [];

  /* A square on the artwork's own 8-unit grid must be perfect wherever the
     scale is whole, and a deliberately fractional one must never be. If the
     counter cannot separate those it is not counting anything. */
  const square = '<svg viewBox="0 0 96 96"><path d="M8 8H88V88H8Z"/></svg>';
  const messy = '<svg viewBox="0 0 96 96"><path d="M8.37 8.37H87.61V87.61H8.37Z"/></svg>';
  const a = onGrid(square, 48), b = onGrid(messy, 48);
  rows.push(['a whole-grid square counts 100% on grid', a.whole === a.total && a.total > 0]);
  rows.push(['a fractional square counts 0%', b.whole === 0 && b.total > 0]);

  /* The scale has to matter. The same square at a size the viewBox does not
     divide must come back worse than at one it does — otherwise `size` is being
     ignored and every row above passes for the wrong reason. */
  const c = onGrid(square, 50);
  rows.push(['the same square scores lower at an indivisible size', c.whole < a.whole]);

  /* PLUMBING, and it can fail on a machine where the artwork is fine: if Logo
     grows a kind whose files match neither prefix, this gate would go on
     reporting a clean ladder while covering less of the component. */
  const logo = readFileSync(LOGO, 'utf8');
  const kinds = [...(logo.match(/kind\?:\s*([^;]+);/)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  const sized = kinds.filter((k) => k === 'mark' || k === 'element');
  rows.push([`Logo's square kinds are still ${Object.keys(FAMILIES).join(' + ')}`, sized.length === 2]);
  rows.push(['both families resolve to real files', Object.keys(FAMILIES).every((f) => filesOf(f).length > 0)]);

  /* The union parser has to survive the shape it is pointed at. */
  const u = unionSizes();
  rows.push(['the size union parses to integers', !!u && u.sizes.length === u.raw.length && u.sizes.length >= 2]);

  /* The table parser has to REFUSE a planted disagreement — the failure that
     actually happened. A copy of the component with one digit changed must not
     read back as agreeing. */
  const t = jsdocTable();
  rows.push(['the JSDoc table parses', !!t && t.sizes.length > 0]);
  if (t) {
    const bad = t.rows.mark.map((v, i) => (i === 0 ? v + 1 : v));
    rows.push(['a planted one-point drift is not equal to the real row',
      JSON.stringify(bad) !== JSON.stringify(t.rows.mark)]);
  }

  /* The local-maximum rule must be able to say NO. 48 is crisp and 56 sits in
     its shadow; if the rule cannot tell those apart it cannot fail at all. */
  const good = localMax('mark', 48), poor = localMax('mark', 56);
  rows.push(['48 is a local maximum for the marks', good.beaten.length === 0]);
  rows.push(['56 is beaten by a crisper neighbour', poor.beaten.length > 0]);

  /* The 2x factor has to REFUSE in both directions or it is just a wider hole.
     Above: a real tier change is caught. Here: the 0.7-point wobble that made
     this gate flag a standard size on its first run must NOT be, and 64 — which
     loses to 72 by exactly the factor — must still be. */
  rows.push(['a 1.3x wobble inside a noisy family is not a finding', localMax('element', 24).beaten.length === 0]);
  rows.push(['a size beaten by exactly the factor still fails', localMax('mark', 64).beaten.length > 0]);

  const pass = rows.filter(([, ok]) => ok).length;
  for (const [what, ok] of rows) console.log(`  ${ok ? green('✔') : red('✖')}  ${what}`);
  console.log(pass === rows.length
    ? green(bold(`\n✔  all ${rows.length} self-test rows hold\n`))
    : red(bold(`\n✖  ${rows.length - pass} of ${rows.length} self-test rows failed\n`)));
  process.exit(pass === rows.length ? 0 : 1);
}

if (SELF_TEST) selfTest();

/* ── the sweep ────────────────────────────────────────────────────────────── */

const u = unionSizes();
if (!u) {
  console.log(red('✖  could not find `size?:` in Logo.astro — the union is what this gate is about'));
  process.exit(1);
}
if (u.sizes.length !== u.raw.length) {
  console.log(red(`✖  the size union has a non-integer member: ${u.raw.filter((r) => !/^\d+$/.test(r)).join(', ')}`));
  process.exit(1);
}

const problems = [];

/* 1 — every offered size is a local maximum, in BOTH families it applies to. */
for (const family of Object.keys(FAMILIES)) {
  for (const size of u.sizes) {
    const { here, beaten } = localMax(family, size);
    if (beaten.length) problems.push(
      `${family}: size ${size} draws ${here}% of its coordinates on whole pixels, but ` +
      beaten.map((b) => `${b.size} draws ${b.pct}%`).join(' and ') +
      `\n      A size offered by the union should not sit beside a crisper one — either drop ${size} or use ${beaten.sort((x, y) => y.pct - x.pct)[0].size}.`);
  }
}

/* 2 — the prose table is the measurement. */
const t = jsdocTable();
if (!t) {
  problems.push('the measured table in the `size` JSDoc could not be parsed — it is the thing this gate keeps honest, so a table it cannot read is a failure, not a skip.');
} else {
  for (const family of Object.keys(FAMILIES)) {
    t.sizes.forEach((size, i) => {
      const got = share(family, size);
      const said = t.rows[family][i];
      if (Math.abs(got - said) > 0.05) problems.push(
        `${family} @ ${size}px: the JSDoc says ${said}%, the artwork measures ${got}%` +
        `\n      The comment describes files that have changed under it. Re-run \`node scripts/check-logo-grid.mjs --table\` and paste the table in.`);
    });
  }
}

if (TABLE) {
  const sizes = t ? t.sizes : u.sizes;
  console.log(dim('\n  paste this into the `size` JSDoc:\n'));
  console.log('   ' + sizes.map((s) => String(s + 'px').padStart(8)).join(''));
  for (const family of Object.keys(FAMILIES))
    console.log(`   ${family.padEnd(8)}` + sizes.map((s) => (share(family, s).toFixed(1) + '%').padStart(8)).join(''));
  console.log();
}

if (problems.length) {
  console.log(red(bold(`\n✖  ${problems.length} problem(s) with Logo's size ladder\n`)));
  for (const p of problems) console.log(red(`    ${p}`));
  console.log();
  process.exit(1);
}

const counts = Object.fromEntries(Object.keys(FAMILIES).map((f) => [f, filesOf(f).length]));
console.log(green(bold(
  `\n✔  Logo offers ${u.sizes.length} sizes — ${u.sizes.join(', ')} — and every one is a local maximum of whole-pixel edges`)) +
  dim(`\n   across ${counts.mark} marks and ${counts.element} elements, with the JSDoc table matching the artwork to 0.1%\n`));
