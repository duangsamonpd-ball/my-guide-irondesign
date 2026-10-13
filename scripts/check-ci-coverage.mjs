#!/usr/bin/env node
/**
 * check:ci-coverage — every gate in `npm run check` also runs in CI.
 *
 * CI does not run `npm run check`. The workflow lists each gate as its own
 * step, with a comment saying why it is there and which job can afford it,
 * which is the right shape for a reader and the wrong shape for a list that
 * must stay complete: a gate added to package.json's `check` chain alone runs on
 * laptops and nowhere else, and nothing says so. Found 2026-10-13, when the
 * gate added that morning (check:prose-parity) turned out never to have run in
 * CI — and neither had five older ones: check:specimens, check:props,
 * check:tables, check:props-table, check:components-css. The workflow even
 * carried a comment about the last time this happened ("Shipped in `npm run
 * check` but never listed here").
 *
 * How it decides: each gate in the `check` chain is read from package.json and
 * reduced to the `node scripts/<file>.mjs` invocations its script runs, each
 * with its `--flags` (`--self-test` and `--check` are different questions of
 * the same file, so both must be present). A gate is covered when the workflow
 * runs it as `npm run <gate>`, or when every one of those invocations appears
 * in some `run:` line with the same flags. Positional arguments are ignored —
 * check:vars reads a compiled stylesheet whose path differs between a laptop
 * and the runner. Commands that are not `node scripts/…` (the tailwindcss
 * compile in check:vars) are the job's setup, not the gate's question.
 *
 * A gate made of nothing this can read is an ERROR, not a pass: it would
 * otherwise be "covered" by having no invocations to look for.
 *
 * Usage:  node scripts/check-ci-coverage.mjs [--self-test]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS = join(ROOT, '.github/workflows');

/** `node scripts/x.mjs a --b --c` → { script: 'scripts/x.mjs', flags: '--b --c' } for every such command. */
function invocations(cmd) {
  const out = [];
  for (const part of cmd.split(/&&|\|\||;/)) {
    const m = part.trim().match(/^node\s+(scripts\/[\w./-]+\.mjs)((?:\s+\S+)*)$/);
    if (!m) continue;
    const flags = m[2].trim().split(/\s+/).filter((a) => a.startsWith('--')).sort().join(' ');
    out.push({ script: m[1], flags });
  }
  return out;
}

/** Every `run:` command in the workflow files, single-line and block form. */
function workflowRuns(text) {
  const runs = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(?:-\s+)?run:\s*(.*)$/);
    if (!m) continue;
    if (m[2] && !/^[|>]/.test(m[2])) { runs.push(m[2].trim()); continue; }
    // block scalar: the indented lines that follow
    const indent = m[1].length;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() && lines[j].match(/^(\s*)/)[1].length <= indent) break;
      if (lines[j].trim()) runs.push(lines[j].trim());
    }
  }
  return runs;
}

function check(pkgText, wfText) {
  const scripts = JSON.parse(pkgText).scripts;
  const gates = [...scripts.check.matchAll(/npm run (check:[\w-]+)/g)].map((m) => m[1]);
  const runs = workflowRuns(wfText);
  const ran = runs.flatMap(invocations);
  const problems = [];
  if (gates.length < 10) problems.push(`found only ${gates.length} gates in package.json's "check" — the chain is not being read`);
  if (runs.length < 10) problems.push(`found only ${runs.length} run: lines in the workflows — they are not being read`);
  for (const g of gates) {
    if (runs.some((r) => new RegExp(`\\bnpm run ${g}(?![\\w:-])`).test(r))) continue;
    const cmd = scripts[g];
    if (!cmd) { problems.push(`${g}: in the "check" chain but not defined in package.json`); continue; }
    const need = invocations(cmd);
    if (!need.length) { problems.push(`${g}: runs no \`node scripts/…\` this gate can recognise ("${cmd}") — run it in CI as \`npm run ${g}\``); continue; }
    const missing = need.filter((n) => !ran.some((r) => r.script === n.script && r.flags === n.flags));
    for (const n of missing) problems.push(`${g}: CI never runs \`node ${n.script}${n.flags ? ' ' + n.flags : ''}\``);
  }
  return { gates, runs, problems };
}

const readWorkflows = () =>
  readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f)).map((f) => readFileSync(join(WORKFLOWS, f), 'utf8')).join('\n');
const pkg = readFileSync(join(ROOT, 'package.json'), 'utf8');
const wf = readWorkflows();

if (process.argv.includes('--self-test')) {
  const p = JSON.parse(pkg);
  const withGate = (name, cmd) => JSON.stringify({ ...p, scripts: { ...p.scripts, [name]: cmd, check: p.scripts.check + ` && npm run ${name}` } });
  const cases = [
    ['a gate only package.json knows about', withGate('check:planted', 'node scripts/planted-gate.mjs'), wf, 1],
    ['the --self-test half missing from CI is caught on its own', withGate('check:planted', 'node scripts/check-component-parity.mjs --self-test && node scripts/check-component-parity.mjs'), wf, 1],
    ['a gate with nothing recognisable is an error, not a pass', withGate('check:planted', 'astro build'), wf, 1],
    ['the same gate run as `npm run …` in CI is covered', withGate('check:planted', 'astro build'), wf + '\n      - run: npm run check:planted\n', 0],
    ['deleting a real gate\'s step is caught', pkg, wf.replace(/^.*run: node scripts\/check-component-parity\.mjs\s*$/m, ''), 1],
    ['an unreadable workflow fails on reach', pkg, '', 1],
  ];
  let bad = 0;
  for (const [name, pk, w, wantFail] of cases) {
    const { problems } = check(pk, w);
    const ok = wantFail ? problems.length > 0 : problems.length === 0;
    console.log(`  ${ok ? '✔' : '✖'} ${name}${wantFail ? ` → ${problems.length} problem(s)` : ''}`);
    if (!ok) { bad++; for (const x of problems) console.log(`      ${x}`); }
  }
  // the real tree must pass for the "covered" case above to mean anything
  if (check(pkg, wf).problems.length) console.log('  (note: the real tree is red, so the clean-case results above start from red — read them against the counts)');
  if (bad) { console.log(`\n✖  check:ci-coverage self-test: ${bad} case(s) wrong`); process.exit(1); }
  console.log('\n✔  check:ci-coverage self-test: every planted gap is caught');
  process.exit(0);
}

const { gates, runs, problems } = check(pkg, wf);
console.log(`  ${gates.length} gates in "check" · ${runs.length} run: lines in the workflows`);
if (problems.length) {
  const named = new Set(problems.map((x) => x.split(':').slice(0, 2).join(':')));
  console.log(`\n✖  ${named.size} gate(s) in \`npm run check\` are not fully run in CI (${problems.length} problem(s)):`);
  for (const x of problems) console.log(`    ${x}`);
  console.log('\n  Add a step to .github/workflows (the zero-dependency job if it imports only node:*),');
  console.log('  self-test first, with a comment saying what it guards.');
  process.exit(1);
}
console.log(`\n✔  every gate in \`npm run check\` also runs in CI`);
