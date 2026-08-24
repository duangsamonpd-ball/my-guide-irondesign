#!/usr/bin/env node
/**
 * Iron Software Design System — does a component's weight agree with the role
 * its size and leading already name?
 *
 * `check:type-scale` pins every `--text-<step>` to a line-height and every step a
 * role uses to that role. It never looks at WEIGHT — 0 references to
 * `--font-weight-` in the whole file — and that is how Footer's lead paragraph
 * shipped at `font-bold` 700 while wearing `text-xl leading-7`, which is the h4
 * role and h4 is 800. Nothing was red. Figma's own node bound
 * `weight/extrabold`, so the drawing and the token agreed with each other and
 * only the markup disagreed with both. Found by hand on 2026-08-24, which is not
 * a way of finding things.
 *
 * THE PROPERTY, and it does not guess: when a class list NAMES A ROLE on any
 * axis — `text-<role>`, `leading-<role>`, `font-<role>`, `tracking-<role>` — then
 * every other axis it also states must belong to that same role. The element has
 * declared what it is; the rest of the line has to agree.
 *
 * That is the exact tell that found Footer's 10px on 2026-08-24. The product row
 * carried `tracking-h4` beside `text-lg`, so its letter-spacing said h4 while its
 * size said title-lg, and the row was a pixel short in a band that was ten short.
 * Nothing was red, because `check:type-scale` pins sizes to leadings and roles to
 * steps but never reads a component's class list at all.
 *
 * THE RULE IT ALMOST HAD, and why that one is not here. The first version fired
 * whenever a `(step, rung)` pair identified exactly one role — no role name
 * needed. It went red twice on HEAD and one was wrong: `ProductFlyout`'s rail
 * caption is `text-2xs leading-3 font-semibold`, which happens to be the badge-sm
 * pair, and a caption is not a badge. **A size is not a claim about a role.** A
 * role NAME is, which is why that is what this reads.
 *
 * The cost is stated rather than hidden: a line that states no role anywhere is
 * invisible to this gate. Footer's lead paragraph shipped at `font-bold` 700
 * wearing `text-xl leading-7` — h4, which is 800 — and named no role, so this
 * would not have caught it. That one was found by hand and is fixed; the gate
 * that would catch its shape has to guess, and guessing is what produced the
 * false positive above.
 *
 * Run:  node scripts/check-type-weight.mjs [--self-test] [--list]
 * Exit: 0 = every identified pair wears its role's weight · 1 = one does not
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THEME = join(ROOT, 'tailwind/theme.css');
const SELF_TEST = process.argv.includes('--self-test');
const LIST = process.argv.includes('--list');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/**
 * The source files a class string can legitimately live in. Tailwind only scans
 * `.astro` plus the listed `.ts`, so anything else is not compiled and is not
 * this gate's business either — the same boundary `build-utilities.mjs` draws.
 */
/**
 * Deviations that are a DECISION, each with the reasoning that made it one — and
 * an entry that stops firing fails the run, so this list cannot rot into a fence
 * around whatever the tree happens to do.
 *
 * There is exactly one, and the component already argues its own case in a
 * comment above the line. Kept here rather than fixed because "snap the value to
 * its token" has deleted real emphasis in this repo before.
 */
const KNOWN = [{
  file: 'astro-components/components/TrialKeyCard.astro',
  kind: 'weight',
  role: 'title-lg',
  why: 'A mixed-weight headline: the <b> inside carries the emphasis and is 700, so putting `--fw-title-lg` 700 on the whole line would flatten the one distinction the markup exists to make. Deliberate, and documented at the line.',
}];

const DIRS = ['astro-components/components', 'astro-components/internal'];
const SHARED_TS = ['astro-components/field.ts', 'astro-components/choice.ts'];

/** `--name: value;` pairs from a stylesheet, last one wins. */
function declarations(css) {
  const out = new Map();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1].slice(2), m[2].trim());
  return out;
}

/** Follow `var(--a)` chains to a literal. Null on a dangling reference. */
function resolve(vars, name, seen = new Set()) {
  if (seen.has(name) || !vars.has(name)) return null;
  seen.add(name);
  const v = vars.get(name).trim();
  const ref = v.match(/^var\(--([\w-]+)\)$/);
  return ref ? resolve(vars, ref[1], seen) : v;
}

/**
 * Everything the rule is made of, derived from the @theme block.
 *
 *   steps    --text-<step> holding a literal length
 *   rungs    --leading-<n> holding a literal length, keyed by the class name
 *   roles    --text-<role>: var(--text-<step>) + --leading-<role> + --font-weight-<role>
 *   pairs    (step, rung) -> the roles that use it
 */
function model(themeCss) {
  const start = themeCss.indexOf('@theme static {');
  if (start === -1) return null;
  const vars = declarations(themeCss.slice(start));
  const LENGTH = /^-?[\d.]+px$/;

  const steps = new Set([...vars.keys()].filter((n) => /^text-[a-z0-9]+$/.test(n) && LENGTH.test(vars.get(n))));
  const rungs = new Set([...vars.keys()].filter((n) => /^leading-\d+$/.test(n) && LENGTH.test(vars.get(n))));

  const roles = [];
  for (const [name, value] of vars) {
    if (!name.startsWith('text-')) continue;
    const ref = value.match(/^var\(--(text-[a-z0-9]+)\)$/);
    if (!ref || !steps.has(ref[1])) continue;
    const role = name.slice('text-'.length);
    if (steps.has(name)) continue;                       // a step is not a role
    const leadRaw = vars.get(`leading-${role}`);
    const weight = vars.get(`font-weight-${role}`);
    if (!leadRaw || !weight) continue;
    /* the rung is the NAME the leading points at, because that is what a class
       list writes — `leading-7`, not `28px`. */
    const rung = leadRaw.match(/^var\(--(leading-\d+)\)$/)?.[1] ?? null;
    if (!rung) continue;
    roles.push({ role, step: ref[1], rung, weight: weight.trim() });
  }

  const pairs = new Map();
  for (const r of roles) {
    const key = `${r.step}|${r.rung}`;
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push(r);
  }
  /* Weight CLASSES: a role's own `font-<role>`, plus the plain numeric names
     Tailwind supplies. The plain ones are read out of the theme where declared
     and fall back to Tailwind's published numbers where not — a component that
     writes `font-bold` means 700 either way. */
  const TAILWIND = { thin: 100, extralight: 200, light: 300, normal: 400, medium: 500,
                     semibold: 600, bold: 700, extrabold: 800, black: 900 };
  const weightOf = new Map();
  for (const r of roles) weightOf.set(`font-${r.role}`, Number(r.weight));
  for (const [k, v] of Object.entries(TAILWIND)) {
    const declared = vars.get(`font-weight-${k}`);
    weightOf.set(`font-${k}`, declared ? Number(declared.trim()) : v);
  }
  /* A class that NAMES a role, on any of the four axes, mapped to that role.
     This is what makes the rule a reading rather than a guess. */
  const namesRole = new Map();
  for (const r of roles) {
    for (const c of [`text-${r.role}`, `leading-${r.role}`, `font-${r.role}`, `tracking-${r.role}`])
      if (vars.has(c.replace(/^font-/, 'font-weight-').replace(/^tracking-/, 'tracking-'))
          || vars.has(c) || c === `font-${r.role}`) namesRole.set(c, r.role);
  }
  const byRole = new Map(roles.map((r) => [r.role, r]));
  return { steps, rungs, roles, pairs, weightOf, namesRole, byRole, vars };
}

/**
 * Class-bearing strings in one source file, as one blob per element.
 *
 * Splitting on quotes rather than parsing markup is deliberate and enough: the
 * rule needs three classes to CO-OCCUR, and every one of them is written in the
 * same quoted string in this codebase — `class="…"` and each entry of a
 * `class:list={[…]}` array. Comments are stripped first for the reason
 * documented in Footer.astro: Tailwind reads them, so a class named in prose is
 * a real utility, but it is prose and not an element.
 */
function classStrings(src) {
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');
  return [...clean.matchAll(/(['"`])([^'"`\n]*?)\1/g)]
    .map((m) => m[2])
    .filter((s) => /(?:^|\s)(?:text-|leading-|font-)/.test(s));
}

function sourceFiles() {
  const out = [];
  for (const d of DIRS) {
    const abs = join(ROOT, d);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs).filter((f) => f.endsWith('.astro')).sort()) out.push(join(abs, f));
  }
  for (const f of SHARED_TS) if (existsSync(join(ROOT, f))) out.push(join(ROOT, f));
  return out;
}

/**
 * What one class string CLAIMS and what it STATES.
 *
 * `claims` is every role named on any axis. `states` is the step, the rung and
 * the weight it actually writes, whether or not they are role-named. The rule
 * compares the two, and says nothing at all when the string claims nothing.
 */
function reading(str, M) {
  const cls = str.split(/\s+/).filter(Boolean).map((c) => ({ raw: c, bare: c.replace(/^.*:/, '') }));
  const claims = new Set();
  for (const c of cls) if (M.namesRole.has(c.bare)) claims.add(M.namesRole.get(c.bare));
  if (!claims.size) return null;
  const find = (pred) => cls.find((c) => pred(c.bare));
  return {
    claims: [...claims],
    step: find((b) => M.steps.has(b)),
    rung: find((b) => M.rungs.has(b)),
    weight: find((b) => M.weightOf.has(b) && !M.namesRole.has(b)),
  };
}

function scan(M, files) {
  const findings = [];
  const checked = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const str of classStrings(src)) {
      const r = reading(str, M);
      if (!r) continue;
      /* Two role names in one string is a contradiction on its own — and it is
         reported as one rather than picked between. */
      if (r.claims.length > 1) {
        findings.push({ file: relative(ROOT, file), kind: 'two roles',
          detail: `names ${r.claims.map((c) => `\`${c}\``).join(' and ')} in one class list` });
        continue;
      }
      const role = M.byRole.get(r.claims[0]);
      if (!role) continue;
      checked.push({ file, role: role.role });
      if (r.step && r.step.bare !== role.step) findings.push({
        file: relative(ROOT, file), kind: 'size', role: role.role,
        detail: `claims \`${role.role}\` but writes \`${r.step.raw}\` — that role is \`${role.step}\``,
      });
      if (r.rung && r.rung.bare !== role.rung) findings.push({
        file: relative(ROOT, file), kind: 'leading', role: role.role,
        detail: `claims \`${role.role}\` but writes \`${r.rung.raw}\` — that role is \`${role.rung}\``,
      });
      if (r.weight && M.weightOf.get(r.weight.bare) !== Number(role.weight)) findings.push({
        file: relative(ROOT, file), kind: 'weight', role: role.role,
        detail: `claims \`${role.role}\` but writes \`${r.weight.raw}\` (${M.weightOf.get(r.weight.bare)}) — that role is ${role.weight}`,
      });
    }
  }
  return { findings, checked };
}

/* ── self-test ────────────────────────────────────────────────────────────── */

const probe = (M, cls) => scanStrings(M, [cls], '<probe>').findings;
function scanStrings(M, strings, file) {
  const findings = [];
  for (const str of strings) {
    const r = reading(str, M);
    if (!r) continue;
    if (r.claims.length > 1) { findings.push({ file, kind: 'two roles', detail: r.claims.join('+') }); continue; }
    const role = M.byRole.get(r.claims[0]);
    if (!role) continue;
    if (r.step && r.step.bare !== role.step) findings.push({ file, kind: 'size', role: role.role });
    if (r.rung && r.rung.bare !== role.rung) findings.push({ file, kind: 'leading', role: role.role });
    if (r.weight && M.weightOf.get(r.weight.bare) !== Number(role.weight))
      findings.push({ file, kind: 'weight', role: role.role });
  }
  return { findings };
}

if (SELF_TEST) {
  const M = model(readFileSync(THEME, 'utf8'));
  const rows = [];
  rows.push(['the theme yields a step set', !!M && M.steps.size > 3]);
  rows.push(['the theme yields leading rungs', !!M && M.rungs.size > 3]);
  rows.push(['roles carry a step, a rung and a weight', !!M && M.roles.length > 5]);
  rows.push(['role names resolve on all four axes', !!M && ['text-h4', 'leading-h4', 'font-h4', 'tracking-h4'].every((c) => M.namesRole.get(c) === 'h4')]);

  if (M) {
    const h4 = M.byRole.get('h4');
    /* THE ORIGINAL DEFECT, planted: `tracking-h4` beside `text-lg`, which is what
       Footer's product row wore while being a pixel short. */
    rows.push(['the tell that found the 10px is caught',
      probe(M, `text-lg leading-[1.5] font-bold tracking-h4`).some((f) => f.kind === 'size')]);
    /* Each axis on its own, so no one of them is carrying the others. */
    rows.push(['a contradicting LEADING is caught', probe(M, `text-h4 leading-9`).some((f) => f.kind === 'leading')]);
    rows.push(['a contradicting WEIGHT is caught', probe(M, `text-h4 leading-7 font-bold`).some((f) => f.kind === 'weight')]);
    /* And the CONTROL: the same line, correct, must stay clean. A detector that
       flags both is not detecting anything. */
    rows.push(['the same line stated correctly is left alone',
      probe(M, `text-h4 leading-${h4.rung.split('-')[1]} font-h4`).length === 0]);
    /* The false positive the first version shipped: a caption at the badge-sm
       size, naming no role. A SIZE IS NOT A CLAIM. */
    rows.push(['a size that merely matches a role is not claimed',
      probe(M, 'text-2xs leading-3 font-semibold tracking-[0.3px]').length === 0]);
    rows.push(['two role names in one list are reported',
      probe(M, 'text-h4 tracking-h2').some((f) => f.kind === 'two roles')]);
    /* Plumbing: the sweep has to be pointed at files that exist, or it reports a
       clean tree because it read nothing. */
    rows.push(['the source sweep finds components', sourceFiles().length > 10]);
    rows.push(['comments are not read as elements',
      classStrings('{/* text-h4 leading-9 font-bold */}\n<p class="text-sm">x</p>').every((c) => !c.includes('leading-9'))]);
  }

  const pass = rows.filter(([, ok]) => ok).length;
  for (const [what, ok] of rows) console.log(`  ${ok ? green('\u2714') : red('\u2716')}  ${what}`);
  console.log(pass === rows.length
    ? green(bold(`\n\u2714  all ${rows.length} self-test rows hold\n`))
    : red(bold(`\n\u2716  ${rows.length - pass} of ${rows.length} self-test rows failed\n`)));
  process.exit(pass === rows.length ? 0 : 1);
}

/* ── the sweep ────────────────────────────────────────────────────────────── */

const M = model(readFileSync(THEME, 'utf8'));
if (!M) {
  console.log(red('\u2716  no `@theme static {` block in tailwind/theme.css — nothing to derive the rule from'));
  process.exit(1);
}

const files = sourceFiles();
const all = scan(M, files);
const hit = new Set();
const findings = all.findings.filter((f) => {
  const k = KNOWN.findIndex((e) => e.file === f.file && e.kind === f.kind && e.role === f.role);
  if (k === -1) return true;
  hit.add(k);
  return false;
});
const checked = all.checked;

/* An accepted deviation that no longer happens is a line of prose defending
   nothing, and the next one gets waved through beside it. */
const stale = KNOWN.map((e, i) => (hit.has(i) ? null : e)).filter(Boolean);
if (stale.length) {
  console.log(red(bold(`\n\u2716  ${stale.length} accepted deviation(s) no longer fire — remove them or find out what changed\n`)));
  for (const e of stale) console.log(red(`    ${e.file} — ${e.kind} on \`${e.role}\``));
  console.log();
  process.exit(1);
}

if (LIST) {
  console.log(dim(`\n  ${M.roles.length} roles, each with a step, a rung and a weight:\n`));
  for (const r of M.roles) console.log(`    ${r.role.padEnd(12)} ${r.step.padEnd(10)} ${r.rung.padEnd(11)} ${r.weight}`);
  console.log();
}

if (findings.length) {
  console.log(red(bold(`\n\u2716  ${findings.length} class list(s) contradict a role they name\n`)));
  for (const f of findings) console.log(red(`    ${f.file}\n      ${f.detail}`));
  console.log();
  process.exit(1);
}

console.log(green(bold(
  `\n\u2714  ${checked.length} class list(s) name a type role, and every axis each one states agrees with it`)) +
  dim(`\n   across ${files.length} source files, ${M.roles.length} roles derived from tailwind/theme.css` +
      (KNOWN.length ? `; ${KNOWN.length} accepted deviation(s), all still firing` : '') + '\n'));
