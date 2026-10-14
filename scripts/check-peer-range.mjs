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
 * ── TAILWIND, THE SECOND PEER (#6, 2026-10-14) ─────────────────────────────
 *
 * Every consumer that runs Tailwind compiles `theme.css` and `@source`s these
 * components with ITS OWN Tailwind, and neither package said which. The room
 * that raised it had declared `^4.0.0` and nothing here would have told it.
 * Both packages now carry `tailwindcss` as an OPTIONAL peer — optional because
 * the README offers a pre-compiled stylesheet to consumers without Tailwind.
 *
 * Its floor is held differently from Astro's, because there is no compiler
 * table to consult: the floor must EQUAL the version the lockfile resolves,
 * which is the version CI's `compile` job builds with (`npm ci`, since #7).
 * So the advertised floor is always the one thing that was actually compiled.
 * Bump the lockfile without raising the floor and this goes red, because the
 * floor has stopped being tested; lower it and it goes red for the same
 * reason. Both packages and the README sentence must agree with it.
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

const ROOT_PKG = join(ROOT, 'package.json');
const LOCK = join(ROOT, 'package-lock.json');

/**
 * The full floor of a Tailwind range, as `x.y.z`. Narrower than `floorMajor`
 * on purpose: the floor has to be compared with an exact lockfile version, so
 * a range that does not name all three parts is refused rather than padded.
 */
function floorVersion(range) {
  const m = /^(?:\^|>=|~)?\s*(\d+\.\d+\.\d+)\s*$/.exec(String(range ?? '').trim());
  return m ? m[1] : null;
}

/** What `npm ci` installs for `tailwindcss` at the root. */
function lockedTailwind() {
  const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
  return lock.packages?.['node_modules/tailwindcss']?.version ?? null;
}

/** The README's "**Requires Tailwind x.y.z or newer.**", or null. */
function readmeTailwindFloor() {
  const md = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const m = /\*\*Requires Tailwind (\d+\.\d+\.\d+) or newer\.\*\*/.exec(md);
  return m ? m[1] : null;
}

/**
 * Every way the Tailwind peer can be false, as a list. Empty means: both
 * packages declare it, both mark it optional, both floors equal the locked
 * version, and so does the README.
 */
function tailwindPeerProblems(pkgs, locked, readme) {
  const out = [];
  if (!locked) out.push('package-lock.json resolves no node_modules/tailwindcss — nothing to hold the floor against');
  for (const [name, pkg] of pkgs) {
    const range = pkg.peerDependencies?.tailwindcss;
    if (!range) { out.push(`${name} declares no \`tailwindcss\` peer`); continue; }
    if (pkg.peerDependenciesMeta?.tailwindcss?.optional !== true)
      out.push(`${name}: the \`tailwindcss\` peer is not marked optional — consumers of the pre-compiled CSS do not need it`);
    const floor = floorVersion(range);
    if (!floor) out.push(`${name}: cannot read an x.y.z floor out of \`tailwindcss: ${range}\``);
    else if (locked && floor !== locked)
      out.push(`${name}: floor ${floor} (\`${range}\`) but the lockfile — what CI compiles with — resolves ${locked}`);
  }
  if (!readme) out.push('README.md does not say "**Requires Tailwind x.y.z or newer.**"');
  else if (locked && readme !== locked) out.push(`README.md says Tailwind ${readme}, the lockfile resolves ${locked}`);
  return out;
}

const readPkgs = () => [
  ['package.json', JSON.parse(readFileSync(ROOT_PKG, 'utf8'))],
  ['astro-components/package.json', JSON.parse(readFileSync(PKG, 'utf8'))],
];

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

  // Tailwind. The plumbing row first: the lockfile must name the version that
  // is really installed here, or "the floor equals the lockfile" is a
  // comparison between two files and nothing that ran.
  const locked = lockedTailwind();
  let installedTw = null;
  try { installedTw = JSON.parse(readFileSync(join(ROOT, 'node_modules/tailwindcss/package.json'), 'utf8')).version; } catch {}
  rows.push([`the lockfile's tailwindcss is the one installed`, Boolean(locked) && locked === installedTw,
             `lock ${locked ?? 'none'} · node_modules ${installedTw ?? 'none'}`]);

  const fv = ['^4.3.3', '>=4.3.3', '4.3.3'].every((r) => floorVersion(r) === '4.3.3')
          && ['^4', '4.x', '*', '', undefined].every((r) => floorVersion(r) === null);
  rows.push([`a Tailwind floor is read as x.y.z, and a partial one is refused`, fv, `parse 3/3 · refuse 5/5`]);

  // The detector, against fixtures: a good pair is clean, and each way of
  // being wrong is named. A detector that only ever saw the real files has
  // only ever been asked the question whose answer is "fine".
  const good = { peerDependencies: { tailwindcss: '^4.3.3' }, peerDependenciesMeta: { tailwindcss: { optional: true } } };
  const cases = [
    ['correct', [['a', good]], '4.3.3', 0],
    ['missing peer', [['a', {}]], '4.3.3', 1],
    ['not optional', [['a', { peerDependencies: { tailwindcss: '^4.3.3' } }]], '4.3.3', 1],
    ['floor behind the lockfile', [['a', { ...good, peerDependencies: { tailwindcss: '^4.0.0' } }]], '4.3.3', 1],
    ['README disagrees', [['a', good]], '4.0.0', 1],
  ];
  const verdicts = cases.map(([, pkgs, rd, want]) => tailwindPeerProblems(pkgs, '4.3.3', rd).length === want);
  rows.push([`the Tailwind detector is clean on a good pair and names each fault`, verdicts.every(Boolean),
             cases.map(([n], i) => `${verdicts[i] ? '✓' : '✗'} ${n}`).join(' · ')]);

  const rtf = readmeTailwindFloor();
  rows.push([`the README's stated Tailwind floor is findable in its prose`, rtf !== null,
             rtf === null ? 'no "**Requires Tailwind x.y.z or newer.**" sentence' : `reads ${rtf}`]);

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

const twProblems = tailwindPeerProblems(readPkgs(), lockedTailwind(), readmeTailwindFloor());
if (twProblems.length) {
  console.error(red(`\n✖  the \`tailwindcss\` peer range is not true\n`));
  for (const p of twProblems) console.error(`  ${p}`);
  console.error(`\n  The floor must equal what package-lock.json resolves, because that is the`);
  console.error(`  only Tailwind CI compiles with. Raise or lower it in BOTH package.json files`);
  console.error(`  and the README sentence together.\n`);
  process.exit(1);
}
console.log(green(`✔  tailwindcss peer ^${lockedTailwind()} in both packages, optional, = the lockfile and the README`));

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
