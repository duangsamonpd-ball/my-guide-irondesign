#!/usr/bin/env node
/**
 * Iron Software Design System — were these variants exported together?
 *
 * `docs/assets/wordmark-iron-*.svg` are four cuts of ONE drawing. The mark and
 * the letterforms are the same artwork; only the colours differ. So their path
 * geometry must be the same too, offset by the row each variant occupies in the
 * Figma frame — and nothing else.
 *
 * That is not a style rule, it is a staleness detector, and it exists because
 * the staleness is otherwise invisible. On 2026-08-21, exporting the wordmark
 * frame to add a fourth variant showed all THREE existing files disagreeing
 * with Figma. The letterforms were 16/15 smaller: the "I" of IRON measured
 * 9.72 x 42.0 where a fresh export gives 10.368 x 44.8. Montserrat's cap height
 * is 0.7em, so 42.0 is 60px text and 44.8 is 64px — and `tokens.css` already
 * said which was current:
 *
 *     --font-size-7xl: 64px;   // Figma size/7xl — was 60 until 2026-08-06
 *
 * The token followed Figma on 2026-08-06. The artwork never did, and shipped
 * fifteen days that way with every gate green, because no gate here had any
 * reason to read a path.
 *
 * WHY NOT ASK FIGMA. Because a gate here must not touch the network — the
 * harnesses in this repo are built so a CDN outage cannot turn a build red —
 * and CI has no Figma credentials. "Is this file current?" is unanswerable
 * offline. "Were these four files made in the same pass?" is answerable, and it
 * is the question that catches the same fault: a partial re-export leaves one
 * variant disagreeing with its siblings.
 *
 * It would have caught the near-miss that produced it. Adding `onhero` alone
 * would have put 64px letterforms beside three files at 60px.
 *
 * THE COMPARISON NEEDS NO PATH PARSER. Two variants of one drawing differ only
 * by a constant y offset, so subtracting their coordinate lists elementwise must
 * yield nothing but 0 and that offset. A re-cut gives arbitrary differences; a
 * size change gives proportional ones. Neither survives.
 *
 * SCOPE IS MEASURED, NOT ASSUMED. The colour and mono MARKS were checked and do
 * NOT share geometry — mono merges shapes, 8 paths against 4 — so they are out.
 * The wordmark families are in, because there the property holds exactly.
 *
 * Run:  node scripts/check-artwork-sync.mjs [--self-test]
 * Exit: 0 = each family was exported in one pass · 1 = one file is out of step
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'docs/assets');
const SELF_TEST = process.argv.includes('--self-test');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/** A family is one Figma variant set exported to several files. */
const FAMILY = /^(wordmark-[a-z]+)-[a-z]+\.svg$/;

/** viewBox y — the row this variant occupies in its Figma frame. */
function originY(svg) {
  const m = /viewBox="[-\d.]+\s+([-\d.]+)/.exec(svg);
  return m ? parseFloat(m[1]) : null;
}

/** Paths by id stem: `IRON_3` and `IRON` are the same path in two exports. */
function pathsOf(svg) {
  const out = new Map();
  for (const m of svg.matchAll(/<path id="([A-Za-z]+)[_0-9]*"[^>]*?\sd="([^"]+)"/g)) {
    const nums = [...m[2].matchAll(/-?\d+(?:\.\d+)?/g)].map((n) => parseFloat(n[0]));
    if (!out.has(m[1])) out.set(m[1], []);
    out.get(m[1]).push(nums);
  }
  return out;
}

/**
 * Coordinates are written to three decimals, so a legitimate offset can be two
 * roundings away from exact. 0.005 covers that and refuses everything else —
 * the fault this gate exists for moves coordinates by 9 to 20 units, four
 * thousand times wider, so the tolerance still has a real refusal case.
 */
const EPS = 0.005;

/**
 * Compare one path between two variants. Returns null when they agree.
 * `dy` is the offset the two rows are expected to differ by.
 */
function compare(a, b, dy) {
  if (a.length !== b.length) return `${a.length} coordinates against ${b.length} — the shape itself differs`;
  const diffs = new Set();
  for (let i = 0; i < a.length; i++) diffs.add(Math.round((b[i] - a[i]) * 1000) / 1000);
  const stray = [...diffs].filter((d) => Math.abs(d) > EPS && Math.abs(d - dy) > EPS);
  if (!stray.length) return null;
  // A single proportional factor is the size-drift case; name it, it is the likely one.
  const ratios = a.map((x, i) => (x === 0 ? null : b[i] / x)).filter((r) => r !== null && Number.isFinite(r));
  const rounded = new Set(ratios.map((r) => Math.round(r * 10000) / 10000));
  const hint = rounded.size <= 2 ? `  (coordinates scale by about ${[...rounded].join(' / ')} — a font-size change)` : '';
  return `${stray.length} offset(s) other than 0 or ${dy}: ${stray.slice(0, 4).join(', ')}${stray.length > 4 ? ' …' : ''}${hint}`;
}

function families() {
  const groups = new Map();
  for (const f of readdirSync(ASSETS)) {
    const m = FAMILY.exec(f);
    if (!m) continue;
    if (!groups.has(m[1])) groups.set(m[1], []);
    groups.get(m[1]).push(f);
  }
  for (const [, list] of groups) list.sort();
  return groups;
}

function scan() {
  const findings = [];
  let compared = 0;
  let skipped = 0;
  for (const [family, list] of families()) {
    if (list.length < 2) continue;
    const loaded = list.map((f) => {
      const svg = readFileSync(join(ASSETS, f), 'utf8');
      return { f, y: originY(svg), paths: pathsOf(svg) };
    });
    const [base, ...rest] = loaded;
    for (const other of rest) {
      if (base.y === null || other.y === null) {
        findings.push({ family, file: other.f, id: '(viewBox)', why: 'no viewBox origin to compare against' });
        continue;
      }
      const dy = other.y - base.y;
      for (const [id, runs] of base.paths) {
        const mine = other.paths.get(id);
        // Not every variant carries every path — `mono` merges the mark into
        // differently-named shapes rather than keeping the eight `Union`s. The
        // claim here is about paths the two variants SHARE, so an absent one is
        // skipped rather than reported. Counted, so a family that shares nothing
        // cannot pass by comparing nothing.
        if (!mine) { skipped++; continue; }
        for (let i = 0; i < Math.min(runs.length, mine.length); i++) {
          compared++;
          const why = compare(runs[i], mine[i], dy);
          if (why) findings.push({ family, file: other.f, id, base: base.f, why });
        }
      }
    }
  }
  return { findings, compared, skipped };
}

function selfTest() {
  const { findings, compared, skipped } = scan();

  // The historical fault, reconstructed: letterforms 16/15 apart.
  const a = [141.235, 309, 267, 150.955];
  const scaled = a.map((n) => Math.round(n * (16 / 15) * 1000) / 1000);
  const shifted = a.map((n) => n + 112);
  const rows = [
    ['a family exported in one pass reports nothing', findings.length === 0, `${findings.length} finding(s)`],
    ['…having actually compared paths, not skipped them', compared >= 6, `${compared} path comparisons`],
    ['a pure row offset is accepted', compare(a, shifted, 112) === null, 'dy=112'],
    ['a 16/15 size change is REJECTED — the fault this exists for', compare(a, scaled, 112) !== null,
     (compare(a, scaled, 112) || '').slice(0, 68)],
    ['a different shape is REJECTED', compare(a, a.concat([1]), 0) !== null, 'length mismatch'],
    ['rounding noise of 0.001 is tolerated…', compare(a, a.map((n) => n + 112.001), 112) === null, 'dy=112 ±0.001'],
    ['…and 0.05 is not — the tolerance can still refuse', compare(a, a.map((n) => n + 112.05), 112) !== null, 'dy=112 ±0.05'],
    ['the families are found at all', [...families().keys()].length >= 2,
     [...families().entries()].map(([k, v]) => `${k}×${v.length}`).join(' · ')],
  ];

  let bad = 0;
  for (const [label, ok, detail] of rows) {
    console.log(`  ${ok ? green('✔') : red('✖')}  ${label}   ${dim(detail)}`);
    if (!ok) bad++;
  }
  return { bad, total: rows.length };
}

if (!existsSync(ASSETS)) {
  console.error(red(`\n✖  ${ASSETS} does not exist.\n`));
  process.exit(1);
}

if (SELF_TEST) {
  const { bad, total } = selfTest();
  if (bad) {
    console.error(red(`\n✖  ${bad} of ${total} self-test rows failed — this checker does not do what it claims.\n`));
    process.exit(1);
  }
  console.log(green(`\n✔  ${total}/${total} — a row offset passes, a size change and a re-cut do not\n`));
  process.exit(0);
}

const { findings, compared, skipped } = scan();

if (findings.length) {
  console.error(red(`\n✖  ${findings.length} path(s) are out of step with their siblings — a partial re-export\n`));
  for (const f of findings) {
    console.error(`  ${bold(`${f.file}`)}  ${dim(`path ${f.id}`)}`);
    console.error(`    ${dim(f.why)}`);
    if (f.base) console.error(`    ${dim(`compared against ${f.base}`)}`);
  }
  console.error(`\n  These files are cuts of ONE Figma drawing, so their geometry may differ only`);
  console.error(`  by the row each variant sits on. Anything else means one was re-exported and`);
  console.error(`  the others were not. Export the whole frame and split it, rather than`);
  console.error(`  fetching a single variant.\n`);
  process.exit(1);
}

const n = [...families()].filter(([, l]) => l.length > 1).length;
console.log(green(`\n✔  every artwork family was exported in one pass`) +
            dim(`  — ${n} families, ${compared} path comparisons` +
                (skipped ? `, ${skipped} path(s) a sibling does not carry` : '')) + '\n');
