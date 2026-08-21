#!/usr/bin/env node
/**
 * Iron Software Design System — is the brand artwork painted in this system's colours?
 *
 * `Logo` is the one component that renders real FILES. A token cannot stand in
 * for a logo, so the artwork carries its own hex values and no gate here ever
 * looked at them. On 2026-08-21 the consuming room reported that the ten
 * `kind="element"` illustrations were painted in colours the design system no
 * longer uses. Counted before anything was touched: 46 of 103 fills across the
 * thirteen element files were not values Figma binds in the `Product element`
 * set — and NONE of those 46 appeared anywhere in `tailwind/tokens.css` either.
 * They were not off-ramp choices, they were PRE-RAMP LEFTOVERS.
 *
 * The numbering told the story the report could not. `logo-11-drawing`,
 * `logo-12-securedoc` and `logo-13-freetools` were 100% clean; the ten with
 * lower numbers were not. Two exports, months apart, and only the later one
 * happened after the token pass.
 *
 * WHY THE SCOPE IS "WHAT Logo CAN EMIT" AND NOT "docs/assets". Measured across
 * the whole folder, 83 fills in the partner and product imagery are off-ramp —
 * and they should be. `#f25022` is Microsoft's, `#ff9900` is AWS's. Forcing a
 * third party's mark onto this ramp would be wrong. `Logo` builds its filenames
 * from exactly four prefixes, so those four are the boundary: the artwork this
 * system OWNS must be in this system's colours, and the artwork it merely
 * displays must not be touched.
 *
 * The property held by every file at the moment this was written — 44 files,
 * 172 fills, zero off-ramp — so it is a rule about a correct tree rather than a
 * fence around one bug.
 *
 * Pure Node, no browser and no node_modules, so it runs inside `npm run check`.
 *
 * Run:  node scripts/check-logo-fills.mjs [--self-test]
 * Exit: 0 = every fill is a colour this repo declares · 1 = one is not
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'docs/assets');
const TOKENS = join(ROOT, 'tailwind/tokens.css');
const LOGO = join(ROOT, 'astro-components/components/Logo.astro');
const SELF_TEST = process.argv.includes('--self-test');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/**
 * Artwork this design system OWNS. Four of the five shapes are the filenames
 * Logo.astro builds; the self-test checks it still builds them.
 *
 * `stars-*` joined on 2026-08-21, on Ball's ruling that a review rating is drawn
 * in `brand/accent-1` rather than in each partner's own colour. Measured before
 * adding: all four star files are already on the ramp (#ffffff and #fda509),
 * while `logo-g2.svg` and `logo-capterra.svg` — the OTHER half of the same
 * widget — carry #ff492c and #ff9d28/#68c5ed/#044d80/#e54747, which are G2's and
 * Capterra's. So the line runs through the middle of one component: the stars
 * are ours, the logos are theirs, and only the stars are held to the ramp.
 */
const EMITS = /^(lockup-|wordmark-|mark-|logo-\d+-|stars-)/;

/**
 * #abc and #rrggbbaa both normalise to #rrggbb — tokens.css declares the 6-digit
 * form. The two colour KEYWORDS SVG artwork actually uses are folded in as well:
 * before 2026-08-21 this read hex only, so every `fill="white"` in the wordmarks
 * and the resting stars went unread and the gate reported them clean without
 * having looked. A checker that silently skips a value is worse than one that
 * flags it.
 */
const KEYWORD = { white: '#ffffff', black: '#000000' };

function normalise(hex) {
  if (KEYWORD[hex.toLowerCase()]) return KEYWORD[hex.toLowerCase()];
  let h = hex.slice(1).toLowerCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);
  return '#' + h;
}

/** Every colour tokens.css declares, as a set of #rrggbb. */
function ramp() {
  const css = readFileSync(TOKENS, 'utf8');
  const out = new Set();
  for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) out.add(normalise(m[0]));
  return out;
}

/** Every hex a file paints with, as {hex, count}. */
function fillsOf(src) {
  const seen = new Map();
  for (const m of src.matchAll(/(?:fill|stroke|stop-color)="(#[0-9a-fA-F]{3,8}|white|black)"/gi)) {
    const h = normalise(m[1]);
    seen.set(h, (seen.get(h) ?? 0) + 1);
  }
  return seen;
}

const files = () => readdirSync(ASSETS).filter((f) => f.endsWith('.svg') && EMITS.test(f)).sort();

/**
 * Five rows. The plumbing row is the one that can fail on a machine where the
 * artwork is fine: if Logo grows a fifth kind, this gate would quietly stop
 * covering it while still reporting a clean sweep.
 */
function selfTest() {
  const R = ramp();
  const onRamp = [...R][0];

  const planted = fillsOf(`<svg><path fill="#010203"/><path fill="${onRamp}"/></svg>`);
  const flagged = [...planted.keys()].filter((h) => !R.has(h));
  const spared = [...planted.keys()].filter((h) => R.has(h));

  const shorthand = normalise('#ABC') === '#aabbcc' && normalise('#11223344') === '#112233';

  // Plumbing: Logo.astro must still build filenames with exactly the prefixes above.
  const logo = readFileSync(LOGO, 'utf8');
  const builds = ['`lockup-${', '`wordmark-${', '`mark-${'].every((s) => logo.includes(s));
  const elements = /ELEMENT_FILES[\s\S]*?\{([\s\S]*?)\}/.exec(logo);
  const elementNames = elements ? [...elements[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
  const elementsMatch = elementNames.length > 0 && elementNames.every((n) => EMITS.test(n + '.svg'));

  const list = files();
  let totalFills = 0;
  for (const f of list) totalFills += fillsOf(readFileSync(join(ASSETS, f), 'utf8')).size;

  const rows = [
    ['a fill this repo does not declare is reported', flagged.length === 1 && flagged[0] === '#010203',
     flagged.join(' ') || 'nothing reported'],
    ['…and one it does declare is spared', spared.length === 1 && spared[0] === onRamp, spared.join(' ') || 'none'],
    ['#abc and #rrggbbaa normalise to the 6-digit form tokens.css uses', shorthand,
     `${normalise('#ABC')} · ${normalise('#11223344')}`],
    ['fill="white" is READ, not skipped — it was invisible here until 2026-08-21',
     fillsOf('<svg><path fill="white"/></svg>').has('#ffffff'), 'white → #ffffff'],
    ['Logo.astro still builds every filename this gate knows about', builds && elementsMatch,
     `prefixes ${builds ? 'ok' : 'MOVED'} · ${elementNames.length} element files ${elementsMatch ? 'ok' : 'UNMATCHED'}`],
    ['the sweep reads a real corpus, and the ramp is not empty', list.length > 20 && totalFills > 100 && R.size > 50,
     `${list.length} files · ${totalFills} fills · ${R.size} declared colours`],
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
  console.log(green(`\n✔  ${total}/${total} — the detector fires, spares what it should, and still covers everything Logo emits\n`));
  process.exit(0);
}

// ── the check ────────────────────────────────────────────────────────────────

const R = ramp();
const list = files();
const findings = [];
let counted = 0;

for (const f of list) {
  const fills = fillsOf(readFileSync(join(ASSETS, f), 'utf8'));
  for (const [hex, uses] of fills) {
    counted++;
    if (!R.has(hex)) findings.push({ file: f, hex, uses });
  }
}

if (findings.length) {
  console.error(red(`\n✖  ${findings.length} fill(s) in the brand artwork are colours this repo does not declare\n`));
  const byFile = new Map();
  for (const f of findings) byFile.set(f.file, (byFile.get(f.file) ?? []).concat(f));
  for (const [file, rows] of byFile) {
    console.error(`  ${bold(file)}`);
    for (const r of rows) console.error(`    ${dim(`${r.hex}  ×${r.uses}`)}`);
  }
  console.error(`\n  These files are the artwork the design system OWNS — everything \`Logo\``);
  console.error(`  can emit. A hex here that tokens.css does not declare is either a`);
  console.error(`  pre-ramp leftover or a hand-edit; re-export the variant from Figma's`);
  console.error(`  Product element / New logo sets rather than editing the file.`);
  console.error(`\n  Partner and product imagery in docs/assets is deliberately NOT covered —`);
  console.error(`  a third party's mark is painted in that third party's colours.\n`);
  process.exit(1);
}

console.log(green(`\n✔  every fill in the brand artwork is a colour this repo declares`) +
            dim(`  — ${list.length} files, ${counted} fills, ${R.size} declared colours`) + '\n');
