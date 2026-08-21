#!/usr/bin/env node
/**
 * Iron Software Design System — one subject, one name.
 *
 * `FooterBar` and `Footer` gave the 1%-for-the-Planet mark
 * `alt="1% For The Planet"`. `ProductFlyout`, three lines of the same repo,
 * gave it `alt="1% for the Planet"` — which is the organisation's own styling,
 * confirmed against onepercentfortheplanet.org: lower-case "for the", capital
 * "Planet", nothing else capitalised. So a screen reader met the same partner
 * twice under two names on one page.
 *
 * Found by an alt-text SWEEP in the consuming room, not by reading: 169 images
 * walked, every one carrying an alt, none reading as a filename, every shared
 * alt legitimate EXCEPT that pair. It is trivial to fix and trivial to keep
 * missing, which is why it gets a gate instead of a correction.
 *
 * THE RULE IS ABOUT CASE, NOT ABOUT FILENAMES, and that is deliberate. The
 * obvious gate — "the same src must carry the same alt" — cannot be written
 * here: `Footer.astro` renders `src={src(donateImgSrc)}`, a PROP, so the
 * filename does not exist until a consumer supplies one. Keying on the alt
 * text itself needs no resolution and states the actual defect: two spellings
 * of one name, differing only in capitalisation. Two genuinely different images
 * do not get alts that differ only in case.
 *
 * Pure Node, no browser and no node_modules, so unlike the two gates added
 * beside it this one can live in `npm run check`.
 *
 * Run:  node scripts/check-alt-text.mjs [--self-test]
 * Exit: 0 = every subject has one spelling · 1 = one has two
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELF_TEST = process.argv.includes('--self-test');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

const ROOTS = ['astro-components', 'docs', 'playground/src'];
const EXT = new Set(['.astro', '.html']);

function files() {
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (EXT.has(extname(name))) out.push(p);
    }
  };
  for (const r of ROOTS) walk(join(ROOT, r));
  return out.sort();
}

/**
 * Every alt in a file, with its line.
 *
 * Only DOUBLE-quoted alts are read, which is what every alt in this repo uses.
 * A single-quoted matcher is what an apostrophe defeats — the trap that once
 * made a parser here count eleven of something as six — and an alt is prose, so
 * apostrophes are the normal case. Anything not matched is not silently
 * ignored: `unquoted()` below reports it so the blind spot is visible rather
 * than assumed empty.
 */
function altsIn(src) {
  const out = [];
  for (const m of src.matchAll(/\balt="([^"]*)"/g)) {
    out.push({ text: m[1], line: src.slice(0, m.index).split('\n').length });
  }
  return out;
}

/** alt= written any other way, so the reader's blind spot is a number, not a guess. */
function unquoted(src) {
  let n = 0;
  for (const m of src.matchAll(/\balt=(?!")/g)) n++;
  return n;
}

/** Two spellings of one subject: identical once case is removed, different before. */
function caseClashes(entries) {
  const byFold = new Map();
  for (const e of entries) {
    const key = e.text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key) continue;
    if (!byFold.has(key)) byFold.set(key, new Map());
    const spellings = byFold.get(key);
    if (!spellings.has(e.text)) spellings.set(e.text, []);
    spellings.get(e.text).push(e);
  }
  const out = [];
  for (const [key, spellings] of byFold) {
    if (spellings.size > 1) out.push({ key, spellings });
  }
  return out;
}

/**
 * Five rows. The CONTROL rows are the ones that make the first row mean
 * anything: a detector that flagged every repeated alt would pass "finds the
 * planted clash" and be useless.
 */
function selfTest() {
  const mk = (pairs) => pairs.map(([text, line]) => ({ text, line, file: 'fixture' }));

  const planted = caseClashes(mk([['1% For The Planet', 1], ['1% for the Planet', 2]]));
  const same = caseClashes(mk([['1% for the Planet', 1], ['1% for the Planet', 2]]));
  const different = caseClashes(mk([['Iron Software logo', 1], ['NuGet downloads', 2]]));

  // The apostrophe trap: an alt containing one must still be read whole.
  const apostrophe = altsIn(`<img alt="Iron Software's mark" src="a.png">`);
  // …and a template literal in the same file must not swallow the next alt.
  const literal = altsIn('<img alt={`${x}`} src="a.png"><img alt="Real alt" src="b.png">');

  const real = files().flatMap((f) => altsIn(readFileSync(f, 'utf8')));

  const rows = [
    ['two spellings of one subject are reported', planted.length === 1,
     planted.length ? [...planted[0].spellings.keys()].join(' / ') : 'nothing reported'],
    ['…the SAME spelling twice is not — this is not a duplicate detector', same.length === 0,
     `${same.length} finding(s)`],
    ['…and two genuinely different alts are not', different.length === 0,
     `${different.length} finding(s)`],
    ["an alt containing an apostrophe is read whole", apostrophe.length === 1 && apostrophe[0].text === "Iron Software's mark",
     apostrophe.length ? `"${apostrophe[0].text}"` : 'not read'],
    ['a template-literal alt does not swallow the next one', literal.length === 1 && literal[0].text === 'Real alt',
     literal.map((a) => `"${a.text}"`).join(', ') || 'none'],
    ['the sweep reads a real corpus, not an empty one', real.length > 20, `${real.length} alts`],
  ];

  let bad = 0;
  for (const [label, ok, detail] of rows) {
    console.log(`  ${ok ? green('✔') : red('✖')}  ${label}   ${dim(detail)}`);
    if (!ok) bad++;
  }
  return { bad, total: rows.length };
}

if (SELF_TEST) {
  const { bad, total } = selfTest();
  if (bad) {
    console.error(red(`\n✖  ${bad} of ${total} self-test rows failed — this checker does not do what it claims.\n`));
    process.exit(1);
  }
  console.log(green(`\n✔  ${total}/${total} — the clash detector fires, both controls stay quiet, and the reader survives an apostrophe\n`));
  process.exit(0);
}

// ── the check ────────────────────────────────────────────────────────────────

const all = [];
let blind = 0;
const list = files();
for (const f of list) {
  const src = readFileSync(f, 'utf8');
  blind += unquoted(src);
  for (const a of altsIn(src)) all.push({ ...a, file: relative(ROOT, f) });
}

const clashes = caseClashes(all);

if (clashes.length) {
  console.error(red(`\n✖  ${clashes.length} subject(s) are spelled two ways across this repo\n`));
  for (const c of clashes) {
    for (const [text, uses] of c.spellings) {
      console.error(`  ${bold(`alt="${text}"`)}  ${dim(`×${uses.length}`)}`);
      for (const u of uses) console.error(`    ${dim(`${u.file}:${u.line}`)}`);
    }
    console.error('');
  }
  console.error(`  A screen reader meets one subject under two names. Pick the spelling its`);
  console.error(`  OWNER uses — "1% for the Planet" is the organisation's own, lower-case`);
  console.error(`  "for the" — and use it everywhere, sources and docs pages alike.\n`);
  process.exit(1);
}

console.log(green(`\n✔  every subject is spelled one way — ${all.length} alt texts across ${list.length} files`) +
            (blind ? dim(`  (${blind} alt= not double-quoted, unread)`) : '') + '\n');
