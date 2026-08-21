#!/usr/bin/env node
/**
 * Iron Software Design System — is the advertised Astro peer range TRUE?
 *
 * `astro-components/package.json` tells consumers which Astro versions this
 * package works with. Nothing ever tested that sentence. It said `>=4.0.0` from
 * the day it was written, and on 2026-08-20 both pages in the sibling room hit
 * a HARD BUILD FAILURE at a file they do not own:
 *
 *     [CompilerError] slot[name] must be a static string
 *
 * `TopNav.astro` renders `<slot name={it.flyout} />` — a DYNAMIC slot name.
 * The panel is the consumer's content, so a slot is the right shape; the
 * dynamic NAME is what narrows the range. Three compiler generations ship
 * across the majors the old range claimed, and only the newest accepts it:
 *
 *     Astro 3-5   @astrojs/compiler    2.x   rejects
 *     Astro 6     @astrojs/compiler    4.x   rejects
 *     Astro 7     @astrojs/compiler-rs 0.3.x accepts
 *
 * Measured, not read: all three were run against the real file. The room's
 * report had it as one "older compiler"; it is two, and Astro 6's is a
 * different PACKAGE MAJOR, which is exactly the kind of thing a hand-written
 * range gets wrong.
 *
 * Nothing here could have caught it. The docs build on Astro 7, where the
 * syntax is legal, so every gate stayed green while the sentence was false.
 * A range is a CLAIM ABOUT MACHINES WE DO NOT RUN, and the only honest way to
 * hold one is to compile against the floor it advertises.
 *
 * So: read the declared range, take its floor major, resolve the compiler THAT
 * Astro ships, and compile every component with it. A severity-1 diagnostic is
 * a build failure in a consumer, and it fails here instead.
 *
 * WHAT THIS REFUSES TO DO. It never skips. A range it cannot parse, a floor
 * whose compiler is not installed, a table row that disagrees with the
 * installed Astro — each exits 1 with the reason. A checker that quietly passes
 * when it cannot run is worse than no checker, because it reads as good news.
 *
 * Run:  node scripts/check-peer-range.mjs [--self-test]
 * Exit: 0 = the range is true at its floor · 1 = it is not, or cannot be tested
 *
 * Needs node_modules (the compilers), so it belongs in the render job, not in
 * `npm run check` — that one runs anywhere Node runs and installs nothing.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(ROOT, 'astro-components/package.json');
const SELF_TEST = process.argv.includes('--self-test');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/**
 * Which compiler each Astro major ships. Read off the registry 2026-08-21
 * (`npm view astro@^N.0.0 dependencies`), not remembered.
 *
 * `entry` is the module to import — the two packages disagree, and the older
 * one has no `exports` map pointing at its Node build.
 */
const COMPILER_BY_MAJOR = {
  3: { pkg: '@astrojs/compiler', major: 2, entry: 'dist/node/index.js' },
  4: { pkg: '@astrojs/compiler', major: 2, entry: 'dist/node/index.js' },
  5: { pkg: '@astrojs/compiler', major: 2, entry: 'dist/node/index.js' },
  6: { pkg: '@astrojs/compiler', major: 4, entry: 'dist/node/index.js' },
  7: { pkg: '@astrojs/compiler-rs', major: 0, entry: 'dist/index.mjs' },
};

/**
 * The floor of a semver range, as a major number.
 *
 * Deliberately narrow: it understands the forms a peer range is actually
 * written in and REFUSES everything else. Guessing a floor is how a gate ends
 * up testing a version nobody advertised.
 */
function floorMajor(range) {
  const r = String(range).trim();
  const m =
    /^>=\s*(\d+)/.exec(r) ||          // >=7.0.0
    /^\^\s*(\d+)/.exec(r) ||          // ^7.0.0
    /^~\s*(\d+)/.exec(r) ||           // ~7.1.0
    /^(\d+)(?:\.|\s*$)/.exec(r) ||    // 7.1.6  ·  7
    /^(\d+)\.x/.exec(r);              // 7.x
  return m ? Number(m[1]) : null;
}

/**
 * The floor as the README states it in prose, so the sentence a consumer reads
 * and the range npm enforces cannot say different things. Returns null if the
 * sentence is missing — which is a failure, not a pass.
 */
function readmeFloor() {
  const md = readFileSync(join(ROOT, 'astro-components/README.md'), 'utf8');
  const m = /\*\*Requires Astro (\d+) or newer\.\*\*/.exec(md);
  return m ? Number(m[1]) : null;
}

/** Every component this package publishes. `.astro/` is Astro's types dir, not source. */
function componentFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.astro')) out.push(p);
    }
  };
  walk(join(ROOT, 'astro-components'));
  return out.sort();
}

/**
 * Load the compiler for one Astro major. Throws with the reason — a missing
 * compiler must reach the exit code, never a `continue`.
 */
async function loadCompiler(major) {
  const spec = COMPILER_BY_MAJOR[major];
  if (!spec) throw new Error(`no compiler is recorded for Astro ${major} — extend COMPILER_BY_MAJOR`);
  const dir = join(ROOT, 'node_modules', spec.pkg);
  let installed;
  try {
    installed = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
  } catch {
    throw new Error(`${spec.pkg} is not installed — Astro ${major} needs it; add it as a devDependency`);
  }
  if (Number(installed.split('.')[0]) !== spec.major) {
    throw new Error(
      `${spec.pkg} installed at ${installed}, but Astro ${major} ships ${spec.major}.x — ` +
      `this tree cannot test that floor`,
    );
  }
  const { transform } = await import(join(dir, spec.entry));
  return { transform, label: `${spec.pkg}@${installed}` };
}

/** Severity 1 is Error in Astro's DiagnosticSeverity; anything less does not stop a build. */
async function errorsIn(transform, source, filename) {
  const r = await transform(source, { filename });
  return (r.diagnostics ?? []).filter((d) => d.severity === 1);
}

const DYNAMIC = `---\nconst it = { flyout: 'products' };\n---\n<div><slot name={it.flyout} /></div>\n`;
const STATIC = `---\nconst x = 1;\n---\n<div><slot name="products" /></div>\n`;

/**
 * Seven rows, and only three of them look at a compiler's verdict.
 *
 * The detector rows prove it can fire and can stay quiet, on the oldest
 * compiler generation this tree happens to hold. The PLUMBING row proves the
 * table is aimed at the right packages, and it is the one that can fail on any
 * machine: it asks the installed Astro what it actually depends on and compares
 * that with what the table claims for its major. Without it the table is a
 * belief, and a belief only ever consulted for the major this repo already
 * builds with is a belief nothing tests.
 *
 * The NON-VACUITY row is the one that matters most, because it is the failure
 * this checker could most easily have: a floor whose compiler is absent must
 * exit 1 with a reason. Every "0 problems found" here has to mean the files
 * were read.
 */
async function selfTest() {
  const rows = [];

  // The oldest compiler generation present. Any generation that rejects the
  // syntax proves the detector fires — it does not have to be the floor's.
  let older = null;
  let olderMajor = null;
  for (const major of [6, 5, 4, 3]) {
    const c = await loadCompiler(major).catch(() => null);
    if (c) { older = c; olderMajor = major; break; }
  }
  const seven = await loadCompiler(7).catch((e) => e);

  if (!older) {
    rows.push([`an Astro <=6 compiler is present to test the detector against`, false,
               `no @astrojs/compiler generation in node_modules`]);
  } else {
    const dyn = await errorsIn(older.transform, DYNAMIC, 'probe.astro');
    const ctl = await errorsIn(older.transform, STATIC, 'probe.astro');
    rows.push([
      `a dynamic slot name is REPORTED under ${older.label} (Astro ${olderMajor})`,
      dyn.length === 1 && /static string/.test(dyn[0].text),
      dyn.length ? dyn[0].text : 'no diagnostic',
    ]);
    rows.push([
      `…and a static one is not — the old compiler is not refusing everything`,
      ctl.length === 0,
      `${ctl.length} error(s)`,
    ]);
  }

  if (seven instanceof Error) {
    rows.push([`the Astro 7 compiler is loadable`, false, seven.message]);
  } else {
    const dyn = await errorsIn(seven.transform, DYNAMIC, 'probe.astro');
    rows.push([
      `the SAME dynamic slot is clean under ${seven.label} — a version fact, not a bad fixture`,
      dyn.length === 0,
      `${dyn.length} error(s)`,
    ]);
  }

  // Plumbing: the table must agree with the Astro that is actually installed.
  let plumbing = 'astro is not installed';
  let plumbingOk = false;
  try {
    const astro = JSON.parse(readFileSync(join(ROOT, 'node_modules/astro/package.json'), 'utf8'));
    const major = Number(astro.version.split('.')[0]);
    const spec = COMPILER_BY_MAJOR[major];
    const declared = astro.dependencies?.[spec?.pkg];
    plumbingOk = Boolean(spec && declared);
    plumbing = spec
      ? `astro@${astro.version} → table says ${spec.pkg}, astro declares ${declared ?? 'nothing'}`
      : `astro@${astro.version} has no row`;
  } catch { /* reported by plumbingOk */ }
  rows.push([`the table agrees with the installed astro's own dependency`, plumbingOk, plumbing]);

  // Non-vacuity: an untestable floor must be refused, never skipped. Astro 2 is
  // off the end of the table on purpose — nothing can make it silently pass.
  let refused = false;
  let refusal = 'loaded a compiler for Astro 2, which has no row';
  try {
    await loadCompiler(2);
  } catch (e) {
    refused = true;
    refusal = e.message;
  }
  rows.push([`a floor with no usable compiler is REFUSED, not skipped`, refused, refusal]);

  // The README sentence must be readable at all — a regex that has stopped
  // matching would let the prose drift while this gate reported agreement.
  const rf = readmeFloor();
  rows.push([`the README's stated floor is findable in its prose`, rf !== null,
             rf === null ? 'no "**Requires Astro N or newer.**" sentence' : `reads ${rf}`]);

  // A range the parser cannot read must be refused, not defaulted to something.
  const unparseable = ['*', 'latest', '', 'workspace:*'].every((r) => floorMajor(r) === null);
  const parseable = floorMajor('>=7.0.0') === 7 && floorMajor('^6.1.2') === 6 && floorMajor('7.x') === 7;
  rows.push([`an unreadable range yields no floor, and a readable one yields the right floor`,
             unparseable && parseable, `refuse 4/4 · parse 3/3`]);

  let bad = 0;
  for (const [label, ok, detail] of rows) {
    console.log(`  ${ok ? green('✔') : red('✖')}  ${label}   ${dim(detail)}`);
    if (!ok) bad++;
  }
  return { bad, total: rows.length };
}

if (SELF_TEST) {
  const { bad, total } = await selfTest();
  if (bad) {
    console.error(red(`\n✖  ${bad} of ${total} self-test rows failed — this checker does not do what it claims.\n`));
    process.exit(1);
  }
  console.log(green(`\n✔  ${total}/${total} — the compilers are aimed, the detector fires, the prose is readable, and the range parser refuses what it cannot read\n`));
  process.exit(0);
}

// ── the check ────────────────────────────────────────────────────────────────

const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
const range = pkg.peerDependencies?.astro;

if (!range) {
  console.error(red(`\n✖  astro-components/package.json declares no \`astro\` peer dependency.\n`));
  console.error(`  Consumers have nothing to install against, and this gate has nothing to test.\n`);
  process.exit(1);
}

const floor = floorMajor(range);
if (floor === null) {
  console.error(red(`\n✖  cannot read a floor out of the declared peer range \`astro: ${range}\`.\n`));
  console.error(`  This gate compiles against the LOWEST Astro the package advertises, so an`);
  console.error(`  unreadable range cannot be tested. Write it as \`>=N.0.0\` or \`^N.0.0\`.\n`);
  process.exit(1);
}

const stated = readmeFloor();
if (stated === null) {
  console.error(red(`\n\u2716  astro-components/README.md no longer states an Astro floor.\n`));
  console.error(`  The Setup section carried "**Requires Astro N or newer.**" so that the`);
  console.error(`  sentence a consumer reads could be checked against \`peerDependencies\`.`);
  console.error(`  Restore it, or this gate is holding one end of a comparison with nothing`);
  console.error(`  at the other.\n`);
  process.exit(1);
}
if (stated !== floor) {
  console.error(red(`\n\u2716  the README and package.json advertise different Astro floors\n`));
  console.error(`  ${bold('astro-components/README.md')}   Requires Astro ${stated} or newer`);
  console.error(`  ${bold('astro-components/package.json')} astro: ${range}   ${dim(`(floor ${floor})`)}`);
  console.error(`\n  npm enforces the second; a consumer reads the first.\n`);
  process.exit(1);
}

let compiler;
try {
  compiler = await loadCompiler(floor);
} catch (e) {
  console.error(red(`\n✖  the peer range \`astro: ${range}\` cannot be tested at its floor (Astro ${floor}).\n`));
  console.error(`  ${e.message}\n`);
  process.exit(1);
}

const files = componentFiles();
const failures = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const errs = await errorsIn(compiler.transform, src, file);
  for (const d of errs) {
    failures.push({
      file: relative(ROOT, file),
      line: d.location?.line ?? d.range?.start?.line ?? '?',
      text: d.text,
    });
  }
}

if (failures.length) {
  console.error(red(`\n✖  ${failures.length} component(s) do not compile on Astro ${floor}, which \`astro: ${range}\` advertises\n`));
  for (const f of failures) {
    console.error(`  ${bold(`${f.file}:${f.line}`)}`);
    console.error(`    ${dim(f.text)}`);
  }
  console.error(`\n  Compiled with ${compiler.label} — the compiler Astro ${floor} ships.`);
  console.error(`  This is a HARD BUILD FAILURE in the consumer, at a file the consumer does`);
  console.error(`  not own. Either raise the floor in astro-components/package.json so the`);
  console.error(`  range stops claiming a version that cannot build, or change the component.\n`);
  process.exit(1);
}

console.log(green(`\n✔  all ${files.length} components compile on Astro ${floor} — the floor of \`astro: ${range}\``) + dim(`  (${compiler.label})`) + '\n');
