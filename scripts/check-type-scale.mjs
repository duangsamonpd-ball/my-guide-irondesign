#!/usr/bin/env node
/**
 * Iron Software Design System — type-scale pairing check
 *
 * WHY THIS EXISTS. Tailwind v4 emits `text-<step>` as TWO declarations:
 *
 *     font-size:   var(--text-<step>)
 *     line-height: var(--tw-leading, var(--text-<step>--line-height))
 *
 * This theme overrode all fourteen sizes of the numeric ramp and declared none
 * of the paired line-heights, so every numeric size utility shipped OUR px size
 * beside TAILWIND's ratio — a value from a table in someone else's package. Two
 * came out wrong and one came out empty:
 *
 *   --text-base   24px      where body / body-title are 16/28
 *   --text-5xl    40px      where h1 is 40/48 (the step was re-pointed 48 -> 40
 *                           on 2026-08-06; Tailwind's ratio for `5xl` is 1)
 *   --text-2xs    NOTHING   `2xs` is not a Tailwind step, so there was no pair
 *                           to inherit and the utility emitted font-size alone —
 *                           10px text taking its leading from whatever enclosed
 *                           it, which is not a value at all
 *
 * NOT ONE OF THE FIFTEEN GATES COULD SEE IT, and that is structural rather than
 * bad luck: this repo's own Tailwind emits no utilities for itself, and all five
 * components that use one of these classes write an explicit `leading-*` beside
 * it, which sets `--tw-leading` and wins. The wrong half was never on screen
 * here. It reaches consumers, and it reached the ROI calculator, which is where
 * the report came from.
 *
 * WHAT IT ASSERTS, and each is a property of a CORRECT theme rather than the
 * shape of the bug that was found — the distinction that decides whether a gate
 * can catch the NEXT one:
 *
 *   PAIRED    every step of the numeric ramp has a `--text-<step>--line-height`.
 *             Without it Tailwind silently supplies its own, or emits no
 *             line-height at all when the step is not one of its names.
 *   LADDER    each pair is `var(--leading-*)` or the single-line `1`. The form is
 *             checked, not just the value: a bare `calc(1.25 / 0.875)` resolves
 *             to a perfectly reasonable 20px and is still a foreign ratio that
 *             moves the day the step's px size does.
 *   ROLE      where a content or UI role resolves to a step, the pair must
 *             COMPUTE to the leading of one of those roles. Computed, not
 *             compared as text: `1` on the 48px step IS h1-hero's 48px, and
 *             flagging it would be the gate lying about a correct value.
 *   COMPILED  docs/utilities.css carries a pair for every step it carries a size
 *             for. That file inlines the theme variables its utilities reference,
 *             so a token change with NO new class still leaves it stale — which
 *             is exactly how the fix for all of the above got committed with a
 *             stale copy on 2026-08-18. `check:theme` is green on tokens.css and
 *             theme.css alone and says nothing about it.
 *
 * The step set and the role map are DERIVED from the theme, never typed here: a
 * step is a `--text-*` whose value is a literal length, a role is a `--text-*`
 * whose value is `var(--text-<step>)`. Typing either would put a copy of the
 * scale in a file whose job is to check the scale.
 *
 * `--text-2xs` is worth a note, because the tokens.css comment beside it was
 * wrong and this is the correction: 12px is NOT a value nothing pins. The role
 * map derived here says `badge-sm` resolves to `2xs` and carries
 * `--leading-badge-sm: 12px`, from Figma's Typography/UI/badge-small. The value
 * was right; calling it a ruling was not — and the thing that found that out was
 * this file's own role map, five minutes after the commit message claimed
 * otherwise. Deriving the map is what made the claim checkable.
 *
 * WHAT THIS CANNOT DO, stated because a green run should not be read as more
 * than it is: it reads declarations, so it cannot tell you what a browser
 * computes. When a pair is missing entirely, the value a consumer gets comes
 * from Tailwind's own theme, and the only copy of that within reach is whatever
 * the compiled stylesheet happens to have inlined — which is only the steps some
 * utility here references. On the pre-fix tree that meant `text-base` and
 * `text-5xl`, the two steps that were actually rendering wrong, left NO trace in
 * any file: they were found in Chrome. See the `ROLE — via the compiled
 * fallback` case in the self-test for the measured detail.
 *
 * Run:  node scripts/check-type-scale.mjs [--self-test]
 * Exit: 0 = every step paired, on the ladder, and agreeing with its roles
 *       1 = at least one does not, or a self-test fault failed to arm
 *
 * Zero dependencies — plain Node, same as the other checkers.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELF_TEST = process.argv.includes('--self-test');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;

/* ── reading a variable block ─────────────────────────────────────────────── */

/**
 * Every `--name: value;` in a stretch of CSS, first declaration winning.
 *
 * Comments are stripped first. They carry token names and px values all over
 * this repo — the whole paragraph above would parse as declarations otherwise.
 */
function declarations(css) {
  const vars = new Map();
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--([\w-]+):\s*([^;{}]+);/g)) {
    if (!vars.has(m[1])) vars.set(m[1], m[2].trim());
  }
  return vars;
}

/** Follow `var(--a)` chains to a literal. Returns null on a dangling reference. */
function resolve(vars, name, seen = new Set()) {
  if (seen.has(name)) return null;
  seen.add(name);
  const v = vars.get(name);
  if (v === undefined) return null;
  const ref = v.match(/^var\(--([\w-]+)\)$/);
  return ref ? resolve(vars, ref[1], seen) : v;
}

const LENGTH = /^-?[\d.]+px$/;
const px = (v) => (v !== null && LENGTH.test(v) ? parseFloat(v) : null);

/**
 * A step's size as the ENDS OF ITS RANGE — `[min, max]`, equal for a fixed step.
 *
 * Until 2026-09-01 a step was derived as a `--text-*` holding a literal px
 * length, and a fluid one therefore was not a step at all: measured by planting
 * `clamp(32px, 5vw, 48px)` on `--text-6xl`, this gate went from "14 numeric type
 * steps … all 10 that a role uses" to "13 … all 9", exit 0 both times. The step
 * left the check silently and the only tell was a count in the success line.
 * That is worse than the drift checker's vacuous pass, which at least kept the
 * token inside its total.
 *
 * Reading both ends is not bookkeeping: a fixed line-height beside a fluid size
 * holds its ratio at exactly one end, so a pairing this gate judges at one size
 * has to be judged at two.
 */
function ends(value) {
  if (value == null) return null;
  const fixed = px(value);
  if (fixed !== null) return [fixed, fixed];
  const fluid = value.trim().match(/^clamp\(([^,]+),[^,]+,([^)]+)\)$/i);
  if (!fluid) return null;
  const lo = px(fluid[1].trim());
  const hi = px(fluid[2].trim());
  return lo === null || hi === null ? null : [lo, hi];
}

/**
 * A line-height declaration as the browser would compute it, in px.
 * `28px` is 28. `1` is 1 x the font size — the single-line idiom this system
 * already uses for --leading-btn-lg, --leading-btn-sm and --leading-nav.
 */
function computed(value, fontPx) {
  if (value === null) return null;
  if (LENGTH.test(value)) return parseFloat(value);
  if (/^[\d.]+$/.test(value)) return parseFloat(value) * fontPx;
  /* `calc(1.25 / 0.875)` — the shape Tailwind's own pairs take. We never author
     one, and it is read here precisely so that when OURS is missing, the value a
     consumer would actually get can be judged instead of merely reported absent.
     Without this the checker could say "14 steps unpaired" and stay silent about
     which two of them were rendering wrong, which is the difference between a
     gate that names the damage and one that names the omission. */
  const ratio = value.match(/^calc\(\s*([\d.]+)\s*\/\s*([\d.]+)\s*\)$/);
  if (ratio) return (parseFloat(ratio[1]) / parseFloat(ratio[2])) * fontPx;
  return null;
}

/* ── the check ────────────────────────────────────────────────────────────── */

function run({ theme, utilities }) {
  const findings = [];
  const add = (kind, step, msg) => findings.push({ kind, step, msg });

  /* Only the @theme block. The ALIASES and PLAIN sections below it mirror these
     names back for anything reading them as ordinary variables, and a pair
     living ONLY there would never reach a Tailwind utility. */
  const start = theme.indexOf('@theme static {');
  if (start === -1) {
    add('THEME', '—', 'no `@theme static {` block in tailwind/theme.css — nothing to check');
    return { findings, steps: [], roles: new Map() };
  }
  const vars = declarations(theme.slice(start));

  /* DERIVED, not typed: a step is a --text-* holding a size this gate can read
     at both ends — a px literal, or a clamp() between two of them. */
  const steps = [...vars.keys()].filter((n) => /^text-[a-z0-9]+$/.test(n) && ends(vars.get(n)) !== null);

  /* A --text-* whose value we CANNOT read is not silently not-a-step.
     A `var(--text-*)` reference is excluded because that is how a ROLE is
     written — `--text-h1: var(--text-5xl)` — and the roles map below owns it.
     Getting that wrong names all nine roles as unread steps, which is how this
     rule was first written. What is left is a literal this gate cannot parse. */
  const REF = /^var\(--[\w-]+\)$/;
  for (const n of [...vars.keys()].filter(
    (n) => /^text-[a-z0-9]+$/.test(n) && !REF.test(vars.get(n)) && ends(vars.get(n)) === null,
  )) {
    add('UNREAD', n, `\`--${n}: ${vars.get(n)}\` is not a px length or a clamp() of two, so every ` +
      `rule below — the pair, the ladder, the role — would skip this step. A step this gate cannot ` +
      `read must say so rather than leave the ramp one shorter.`);
  }

  /* DERIVED: role -> step, from `--text-<role>: var(--text-<step>)`. */
  const roles = new Map(steps.map((s) => [s, []]));
  for (const [name, value] of vars) {
    if (!name.startsWith('text-')) continue;
    const ref = value.match(/^var\(--(text-[a-z0-9]+)\)$/);
    if (!ref || !roles.has(ref[1])) continue;
    const role = name.slice('text-'.length);
    const leading = vars.has(`leading-${role}`) ? resolve(vars, `leading-${role}`) : null;
    if (leading !== null) roles.get(ref[1]).push({ role, leading });
  }

  const utilVars = declarations(utilities);

  for (const step of steps) {
    const [lo, hi] = ends(vars.get(step));
    const fluid = lo !== hi;
    /* The max end is what a fixed step always was, so every message below reads
       unchanged for the 14 fixed steps this ramp has today. */
    const size = hi;
    const pairName = `${step}--line-height`;
    const declared = vars.get(pairName);

    /* The value a consumer's build actually applies: ours when we declare one,
       otherwise whatever Tailwind's own theme left in the compiled stylesheet.
       Judging the second is what turns "unpaired" into "unpaired AND rendering
       28px as 24". */
    const fallback = utilVars.get(pairName);
    const from = declared !== undefined ? 'theme' : fallback !== undefined ? 'compiled' : null;
    const effective = from === 'theme' ? resolve(vars, pairName) : from === 'compiled' ? resolve(utilVars, pairName) : null;
    const mine = computed(effective, size);

    if (declared === undefined) {
      add('PAIRED', step, `no \`--${pairName}\` — Tailwind supplies its own for a step it knows, ` +
        `and emits no line-height at all for one it does not` +
        (mine !== null ? `. The compiled stylesheet currently applies ${effective} — ${mine}px at ${size}px` : ''));
    } else if (!/^var\(--leading-[\w-]+\)$/.test(declared) && declared !== '1') {
      add('LADDER', step, `\`--${pairName}: ${declared}\` is neither a rung of --leading-* nor the ` +
        `single-line \`1\` — a ratio from outside this system does not follow the step's size`);
    }

    /* A FLUID SIZE WITH A FIXED LEADING HOLDS ITS RATIO AT ONE END ONLY.
       Tailwind emits `text-<step>` as font-size AND its paired line-height, so
       the two travel together in one class; a size that moves between 32 and 48
       against a leading pinned at 48px renders 1.00 at the top of the range and
       1.50 at the bottom, and no viewport in between was designed. The fix is
       not here — it is a fluid `--leading-*` rung moving in lockstep, or the
       single-line `1`, which is a ratio and follows the size for free. */
    if (fluid && effective !== null && LENGTH.test(effective)) {
      const r = (at) => (px(effective) / at).toFixed(2);
      add('FLUID', step, `\`--${step}\` moves between ${lo}px and ${hi}px while ` +
        `\`--${pairName}\` resolves to the fixed ${effective} — that is a ratio of ${r(hi)} at the ` +
        `top of the range and ${r(lo)} at the bottom. A fluid size needs a fluid leading in lockstep, ` +
        `or the single-line \`1\`, which is a ratio and follows on its own.`);
    }

    /* JUDGED AT EVERY END THE STEP HAS. For a fixed step that is one size and
       this is the check it always was; for a fluid one an agreement that holds
       at 48px and breaks at 32px is not an agreement. */
    const rs = roles.get(step);
    if (rs.length) {
      for (const at of fluid ? [hi, lo] : [hi]) {
        const m = computed(effective, at);
        /* NOT `continue`. A line-height shape this gate cannot compute — a
           clamp() against a clamped size needs a viewport model neither of us
           has — would otherwise take the role agreement out of the check
           without saying so, which is the exact fault this pass was opened to
           fix one layer up. `1` and the other ratio forms follow a fluid size
           for free and are the way this system already writes it. */
        if (m === null) {
          if (effective !== null) {
            add('UNREAD', step, `\`--${pairName}\` resolves to \`${effective}\`, which this gate cannot ` +
              `compute at a given size, so the role agreement for this step goes unchecked at ${at}px. ` +
              `A ratio — the single-line \`1\` — follows a fluid size on its own and stays checkable.`);
          }
          continue;
        }
        const want = rs.map((r) => ({ ...r, px: computed(r.leading, at) }));
        if (!want.some((r) => r.px !== null && Math.abs(r.px - m) < 0.01)) {
          add('ROLE', step, `${from === 'compiled' ? 'the compiled stylesheet applies' : 'resolves to'} ` +
            `${m}px at ${at}px, and no role that uses this step pairs it with that: ` +
            `${want.map((r) => `${r.role} ${r.px}px`).join(' · ')}`);
        }
      }
    }

    /* The compiled artefact a consumer installs, not the authored theme. */
    if (utilVars.has(step) && !utilVars.has(pairName)) {
      add('COMPILED', step, `docs/utilities.css carries \`--${step}\` but no \`--${pairName}\` — ` +
        `it was compiled before the pair existed. Run: node scripts/build-utilities.mjs`);
    }
  }

  return { findings, steps, roles };
}

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const live = () => ({ theme: read('tailwind/theme.css'), utilities: read('docs/utilities.css') });

/* ── self-test ────────────────────────────────────────────────────────────── */

/**
 * Per CLAUDE.md: a check that cannot fail on the machine that wrote it is not a
 * check. Each fault below is planted on the REAL theme, one at a time, and the
 * checker must name the step it was planted on — not merely report "a problem".
 * A plant that matches nothing is a failure too: that is how a checker gets
 * credit for arming that never happened.
 */
if (SELF_TEST) {
  const base = live();
  const clean = run(base);
  if (clean.findings.length) {
    console.error(red(`\n✖  self-test cannot run — the live theme already has ${clean.findings.length} finding(s)\n`));
    for (const f of clean.findings) console.error(`    ${f.kind} ${f.step}: ${f.msg}`);
    process.exit(1);
  }

  const FAULTS = [
    ['PAIRED — the pair is deleted', [['theme', /\n[^\n]*--text-base--line-height:[^\n]*/, '']], 'text-base'],
    ['PAIRED — a step Tailwind does not know', [['theme', /\n[^\n]*--text-2xs--line-height:[^\n]*/, '']], 'text-2xs'],
    ['LADDER — a foreign ratio', [['theme',
      /--text-sm--line-height: var\(--leading-5\);/, '--text-sm--line-height: calc(1.25 / 0.875);']], 'text-sm'],
    /* leading-6 is a real rung (24px) that no role of `base` uses, so this arms
       ROLE without arming LADDER — the two must be separable or a green run
       tells you nothing about which held. */
    ['ROLE — a real rung, wrong role', [['theme',
      /--text-base--line-height: var\(--leading-7\);/, '--text-base--line-height: var(--leading-6);']], 'text-base'],
    /* Our pair gone from the theme and Tailwind's own left standing in the
       compiled stylesheet — the case that decides whether the gate can name the
       DAMAGE and not only the omission.
       AND THE LIMIT OF THAT, measured rather than assumed. Pointed at the real
       pre-fix commit `7da3eaa`, the checker reports 23 findings — 14 PAIRED and
       9 COMPILED — and NOT a single ROLE, including on `text-base` and
       `text-5xl`, the two the browser proved were rendering wrong. The reason is
       that Tailwind inlines only the variables some utility actually references,
       and no component here uses `text-base` or `text-5xl`, so their stock pairs
       never reached docs/utilities.css and there was nothing to fall back to. In
       a consuming app that DOES use those classes the value is there and this
       fires. So the fallback is real and partial; PAIRED is the rule that makes
       the state impossible going forward, and this is the belt beside it. */
    ['ROLE — via the compiled fallback', [
      ['theme', /\n[^\n]*--text-base--line-height:[^\n]*/, ''],
      ['utilities', /--text-base--line-height: var\(--leading-7\);/, '--text-base--line-height: calc(1.5 / 1);'],
    ], 'text-base'],
    /* The 48px step paired with `1`. Computed that IS h1-hero's 48px, so this
       must NOT fire: it is the control for the ROLE check, proving it compares
       computed values rather than text. */
    ['ROLE — `1` on the 48px step must stay clean (control)', [['theme',
      /--text-6xl--line-height: var\(--leading-12\);/, '--text-6xl--line-height: 1;']], null],
    ['COMPILED — utilities.css compiled before the pair', [['utilities',
      /--text-5xl--line-height:[^;]*;/, '']], 'text-5xl'],

    /* The 2026-09-01 pass. Planting this clamp on the UNFIXED gate moved the
       success line from "14 numeric type steps … all 10 that a role uses" to
       "13 … all 9" and exited 0 — the step left the check and the count was the
       only tell. These three rows are what makes that state impossible. */
    ['FLUID — a fluid step against a fixed leading', [['theme',
      /--text-6xl: 48px;/, '--text-6xl: clamp(32px, 5vw, 48px);']], 'text-6xl'],
    /* The control, and the thing it demonstrates is the authoring: a ratio
       leading follows the size for free, so the step, its pair AND the role's
       own rung all become `1` and the ramp stays checkable at both ends. A fix
       that merely refused fluid values would fail this row. */
    ['FLUID — fluid step, ratio leading throughout (control)', [
      ['theme', /--text-6xl: 48px;/, '--text-6xl: clamp(32px, 5vw, 48px);'],
      ['theme', /--text-6xl--line-height: var\(--leading-12\);/, '--text-6xl--line-height: 1;'],
      ['theme', /--leading-h1-hero: var\(--leading-12\);/, '--leading-h1-hero: 1;'],
    ], null],
    /* A literal the gate cannot read must be NAMED, not quietly not-a-step. */
    ['UNREAD — a step in a unit this gate does not read', [['theme',
      /--text-6xl: 48px;/, '--text-6xl: 3rem;']], 'text-6xl'],
  ];

  let armed = 0;
  let expected = 0;
  console.log(`\n  ${bold('self-test')} — the live theme reports 0 findings\n`);
  for (const [name, patches, step] of FAULTS) {
    const input = { ...base };
    let landed = true;
    for (const [which, pattern, replacement] of patches) {
      const next = input[which].replace(pattern, replacement);
      if (next === input[which]) landed = false;
      input[which] = next;
    }
    if (!landed) {
      console.error(`    ${red('✖')} ${name.padEnd(46)} a fault pattern matched nothing — cannot arm`);
      expected++;
      continue;
    }
    const hits = run(input).findings;
    if (step === null) {
      expected++;
      const ok = hits.length === 0;
      if (ok) armed++;
      console.log(`    ${ok ? green('✔') : red('✖')} ${name.padEnd(46)} ${hits.length} finding(s) ${dim('(want 0)')}`);
      continue;
    }
    expected++;
    const kind = name.split(' ')[0];
    const ok = hits.some((f) => f.kind === kind && f.step === step);
    if (ok) armed++;
    console.log(`    ${ok ? green('✔') : red('✖')} ${name.padEnd(46)} ${hits.length} finding(s), ` +
      `${ok ? `${kind} on ${step}` : red(`no ${kind} on ${step}`)}`);
  }

  console.log('');
  if (armed !== expected) {
    console.error(red(bold(`✖  ${expected - armed} of ${expected} cases did not behave — the checker is not proven\n`)));
    process.exit(1);
  }
  console.log(green(bold(`✔  ${expected}/${expected} — every detector fires on a planted fault, and the control stays clean\n`)));
  process.exit(0);
}

/* ── run ──────────────────────────────────────────────────────────────────── */

const { findings, steps, roles } = run(live());

if (findings.length) {
  console.error(`\n${red(bold(`✖  ${findings.length} problem(s) in the numeric type scale`))}\n`);
  for (const f of findings) {
    console.error(`    ${red('✖')} ${bold(`--${f.step}`)} ${dim(`[${f.kind}]`)}`);
    console.error(`        ${f.msg}`);
  }
  console.error(`\n  Every step of the ramp needs its paired line-height in tailwind/tokens.css`);
  console.error(`  as \`--font-size-<step>--line-height\`, which build-theme lands on`);
  console.error(`  \`--text-<step>--line-height\` inside @theme. Then regenerate BOTH:\n`);
  console.error(`     node scripts/build-theme.mjs && node scripts/build-utilities.mjs\n`);
  process.exit(1);
}

const withRole = steps.filter((s) => roles.get(s).length).length;
console.log(green(`\n✔  ${steps.length} numeric type steps — each paired, each on the --leading-* ladder ` +
  `or single-line, and all ${withRole} that a role uses agree with it\n`));
