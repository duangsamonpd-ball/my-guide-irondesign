#!/usr/bin/env node
/**
 * Iron Software Design System — type specimen checker
 *
 * `docs/02-typography.html` draws one live specimen per type role and, beside
 * it, a table stating that role's size, weight, line-height and tracking. The
 * specimen is an INLINE STYLE written by hand. Nothing regenerates it, and no
 * other gate looks at it: `check:type-scale` reads the theme, `check:tokens`
 * reads the token layers, `check:type-weight` reads component class lists. A
 * specimen is the only place in this repo where a type value is written a second
 * time, by hand, next to a claim about itself.
 *
 * It rotted exactly the way that shape rots. Measured 2026-09-01:
 *
 *   · h1-hero rendered `letter-spacing:-0.8px` against a token of 0px — it had
 *     picked up h1's tracking — while its own meta table one line below said
 *     "0px (normal)" and Figma's `Typography/h1-hero` binds `tracking/normal`.
 *     Three sources agreed and the rendered specimen was the odd one out.
 *   · h1-hero and h1 both carried `white-space:nowrap; text-overflow:ellipsis`,
 *     so the only two renderings of those levels in the repo COULD NOT WRAP.
 *     That is why nobody had noticed h1-hero's line-height equals its font size.
 *
 * A specimen that truncates is not a lesser specimen, it is a different claim:
 * the page says "this is how the level looks" while showing how it looks only
 * when the copy is short enough. So `nowrap` is an error here, not a style
 * choice.
 *
 * Run:  node scripts/check-type-specimens.mjs [--self-test]
 * Exit: 0 = every specimen matches its token and can wrap · 1 = it does not
 *
 * Zero dependencies.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELF_TEST = process.argv.includes('--self-test');
const PAGE = 'docs/02-typography.html';

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;

/**
 * The CSS role names the page uses, mapped back to their w3c keys. Same two
 * exceptions the drift checker carries; both files derive the rest.
 */
const CSS_TO_W3C = {
  'title-lg': 'title-large', 'body-lg': 'body-large', 'btn-lg': 'button-large',
  btn: 'button-default', 'btn-sm': 'button-small', nav: 'nav-primary',
  'nav-sub': 'nav-dropdown', 'nav-label': 'nav-group-label', 'badge-sm': 'badge-small',
};

const REM = 16;
const px = (v) => (v == null ? null : /rem\s*$/.test(v) ? parseFloat(v) * REM : parseFloat(v));

function run({ html, w3c }) {
  const findings = [];
  const add = (kind, role, msg) => findings.push({ kind, role, msg });

  const token = (css) => {
    const k = CSS_TO_W3C[css] ?? css;
    return w3c.typography?.scale?.[k] ?? w3c.typography?.ui?.[k];
  };

  /* A specimen block is a `.type-row` up to the end of its meta table: the
     rendered example and the claim about it, together. Reading them as one unit
     is the point — either alone proves nothing. */
  const blocks = [...html.matchAll(/<div class="type-row">([\s\S]*?)<\/table>/g)];
  let checked = 0;

  for (const [, block] of blocks) {
    /* DERIVED, not listed: the role is whichever `--font-size-*` the row's own
       table names. A hand-kept list here would be the second hand-written copy
       this gate exists to abolish. */
    const role = block.match(/--font-size-([\w-]+)</)?.[1];
    if (!role) continue;

    /* The FIRST drawn example in the row, whatever tag carries it. Order is the
       rule, not tag name: a row may draw the level and then a deliberate variant
       beside it — `nav` shows rest, active, rest — and the first one is the level
       the table is making a claim about. Matching on `<div>` alone missed that
       row entirely, and a scratch version of this checker skipped it in silence,
       which is the failure mode this whole gate exists to refuse. */
    const spec = [...block.matchAll(/style="([^"]*font-size:[^"]*)"/g)][0]?.[1];
    if (!spec) { add('NO SPECIMEN', role, 'the row names a token but draws nothing this gate can read'); continue; }

    const t = token(role);
    if (!t?.$value) { add('NO TOKEN', role, `the row names \`--font-size-${role}\` but tokens.w3c.json has no such role`); continue; }

    checked++;
    const v = t.$value;
    const prop = (p) => block.match(new RegExp(`${p}:\\s*([^;"]+)`))?.[1]?.trim() ?? null;
    const got = {
      size: prop('font-size'), weight: prop('font-weight'),
      lh: prop('line-height'), ls: prop('letter-spacing'),
    };

    if (px(got.size) !== px(v.fontSize)) {
      add('SIZE', role, `specimen renders ${got.size} (${px(got.size)}px) · token says ${v.fontSize}`);
    }
    if (got.weight != null && Number(got.weight) !== v.fontWeight) {
      add('WEIGHT', role, `specimen renders ${got.weight} · token says ${v.fontWeight}`);
    }
    if (got.lh != null) {
      const want = v.lineHeight === '1' ? '1' : String(px(v.lineHeight));
      const mine = got.lh === '1' ? '1' : String(px(got.lh));
      if (mine !== want) add('LINE-HEIGHT', role, `specimen renders ${got.lh} · token says ${v.lineHeight}`);
    }
    /* An ABSENT letter-spacing token is CSS `normal` ≈ 0, so it is a drift only
       when the specimen writes something non-zero. Treating absence as a
       mismatch flags every role that correctly declares none. */
    if (got.ls != null) {
      const want = v.letterSpacing === undefined ? 0 : px(v.letterSpacing);
      if (px(got.ls) !== want) {
        add('TRACKING', role, `specimen renders ${got.ls} · token says ${v.letterSpacing ?? 'none, i.e. 0'}`);
      }
    }
    if (/white-space:\s*nowrap/.test(spec)) {
      add('CANNOT WRAP', role, 'the specimen sets `white-space:nowrap`, so it shows this level only while the '
        + 'copy is short enough — the one thing a reader cannot check anywhere else is how it behaves when it is not');
    }
  }

  return { findings, checked, rows: blocks.length };
}

const read = () => ({
  html: readFileSync(join(ROOT, PAGE), 'utf8'),
  w3c: JSON.parse(readFileSync(join(ROOT, 'tokens/tokens.w3c.json'), 'utf8')),
});

/* ── self-test ───────────────────────────────────────────────────────────── */

/**
 * Each fault is planted on the REAL page, one at a time, and the gate must name
 * the ROLE it was planted on — not merely report a problem. A plant that matches
 * nothing fails the row too: that is how a checker takes credit for arming that
 * never happened.
 */
if (SELF_TEST) {
  const base = read();
  const clean = run(base);
  if (clean.findings.length) {
    console.error(red(`\n✖  self-test cannot run — the live page already has ${clean.findings.length} finding(s)\n`));
    for (const f of clean.findings) console.error(`    ${f.kind} ${f.role}: ${f.msg}`);
    process.exit(1);
  }

  const FAULTS = [
    ['TRACKING — h1-hero given h1’s tracking (the real 2026-09-01 fault)',
      [/(<div style="font-size:3rem;[^"]*?)letter-spacing:0px;/, '$1letter-spacing:-0.8px;'], 'h1-hero'],
    ['CANNOT WRAP — the truncation put back',
      [/(<div style="font-size:3rem;[^"]*?letter-spacing:0px;)/, '$1 overflow:hidden; white-space:nowrap; text-overflow:ellipsis;'], 'h1-hero'],
    ['WEIGHT — h2 dropped to semibold',
      [/(<div style="font-size:1\.875rem; )font-weight:800;/, '$1font-weight:600;'], 'h2'],
    ['SIZE — h3 drawn a step small',
      [/(<div style="font-size:)1\.5rem(; font-weight:700; line-height:32px)/, '$11.25rem$2'], 'h3'],
    ['LINE-HEIGHT — h4 off the ladder',
      [/(<div style="font-size:1\.25rem; font-weight:800; )line-height:28px/, '$1line-height:24px'], 'h4'],
    /* The row whose example is a SPAN inside a flex wrapper, and whose second
       and third examples are a deliberate active state. Planting on the FIRST
       one proves the order rule; without it this row was not read at all. */
    ['WEIGHT — the nav row, whose first example is a span',
      [/(<span style="font-size:1rem; )font-weight:500;( line-height:1; color:#171717;">Products)/, '$1font-weight:400;$2'], 'nav'],
    /* Two controls. h1 legitimately renders -0.8px because its token declares
       it, so a gate that flagged every tracking would pass every row above and
       still be useless. And nav's SECOND example is 700 against a token of 500 —
       the active state the row's own table names — which must not be read as
       drift, or a specimen could never show a state at all. */
    ['CONTROL — h1’s own −0.8px tracking must stay clean', null, null],
  ];

  let ok = 0;
  console.log(`\n  ${bold('self-test')} — the live page reports 0 findings across ${clean.checked} specimens\n`);

  for (const [name, patch, role] of FAULTS) {
    let input = base;
    if (patch) {
      const [pattern, replacement] = patch;
      const next = base.html.replace(pattern, replacement);
      if (next === base.html) {
        console.log(`    ${red('✖')} ${name.padEnd(56)} ${red('the plant matched nothing — cannot arm')}`);
        continue;
      }
      input = { ...base, html: next };
    }
    const hits = run(input).findings;
    const kind = name.split(' —')[0];
    const pass = role === null
      ? hits.length === 0
      : hits.some((f) => f.kind === kind && f.role === role);
    if (pass) ok++;
    console.log(`    ${pass ? green('✔') : red('✖')} ${name.padEnd(56)} ${
      role === null ? `${hits.length} finding(s) ${dim('(want 0)')}` : pass ? `${kind} on ${role}` : red(`no ${kind} on ${role}`)}`);
  }

  console.log('');
  if (ok !== FAULTS.length) {
    console.error(red(bold(`✖  ${FAULTS.length - ok} of ${FAULTS.length} cases did not behave — the checker is not proven\n`)));
    process.exit(1);
  }
  console.log(green(bold(`✔  ${FAULTS.length}/${FAULTS.length} — every detector fires on a planted fault, and the control stays clean\n`)));
  process.exit(0);
}

/* ── run ─────────────────────────────────────────────────────────────────── */

const { findings, checked, rows } = run(read());

if (findings.length) {
  console.error(`\n${red(bold(`✖  ${findings.length} specimen problem(s) in ${PAGE}`))}\n`);
  for (const f of findings) {
    console.error(`    ${red('✖')} ${bold(f.role)} ${dim(`[${f.kind}]`)}`);
    console.error(`        ${f.msg}`);
  }
  console.error(`\n  tokens/tokens.w3c.json is the source of truth. Fix the inline style on the page,`);
  console.error(`  not the token — unless the design itself changed in Figma.\n`);
  process.exit(1);
}

console.log(green(`\n✔  ${checked} type specimens match their tokens on size, weight, line-height and tracking, `
  + `and every one of them can wrap ${dim(`(${rows} type-row blocks read)`)}\n`));
