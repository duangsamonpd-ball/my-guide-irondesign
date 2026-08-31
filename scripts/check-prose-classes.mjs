#!/usr/bin/env node
/**
 * Iron Software Design System — what does a CONSUMER's Tailwind compile out of
 * our prose?
 *
 * Tailwind extracts class candidates from the whole file. Not the markup — the
 * FILE, comments included. This package's comments are long, and every one of
 * them is scanned by every consumer that follows the README and points
 * `@source` at `components/*.astro`.
 *
 * This repo could not see that, and the reason is the interesting half.
 * `build-utilities.mjs` copies each component into a scan directory through a
 * `strip()` that removes `<style>` blocks and block comments first — a
 * sensible thing to do when the question is "which utilities does our markup
 * use", and the exact thing that made our instrument read a DIFFERENT INPUT
 * from the one a consumer reads. Measured 2026-08-21, compiling both ways over
 * the same 22 sources: 449 selectors raw against 420 stripped. Twenty-nine
 * rules that every consumer ships and this repo never sees, 2,975 bytes, 4.0%
 * of the stylesheet.
 *
 * Most of those twenty-nine are harmless and unavoidable. They are ENGLISH
 * WORDS that happen to be utility names — `container`, `table`, `visible`,
 * `filter`, `fixed`, `shadow`, `ring`, `transition`, `contents`. You cannot
 * write documentation without them, and dead CSS for a class nothing wears
 * costs bytes and nothing else.
 *
 * ONE of them was not harmless, and it is the shape this gate exists for:
 *
 *     .bg-[url(assets/Rainbow.svg)] { background-image: url(assets/Rainbow.svg) }
 *
 * A RELATIVE url in a compiled rule is a path the consumer's bundler must
 * resolve, from a stylesheet whose location has nothing to do with ours. It
 * cannot, so every build of both pages in the consuming room printed
 * `assets/Rainbow.svg referenced in assets/Rainbow.svg didn't resolve at build
 * time`. Nothing wore the class — the band moved to the `rainbowSrc` prop on
 * 2026-08-18 — but the string stayed in the doc comment that explains why, and
 * the comment kept compiling the bug it was describing. A warning that
 * describes a bug already fixed is the kind that teaches people to ignore
 * warnings.
 *
 * WHY THIS GATES RELATIVE URLS AND NOT PROSE IN GENERAL. Failing on all
 * twenty-nine would mean writing comments that avoid the word "container", and
 * the comments are worth more than the bytes. Failing on none would mean the
 * trap comes straight back the next time someone quotes a class to explain it.
 * The relative url is the line between dead weight and a broken consumer build,
 * so that is the line. The other twenty-eight are printed, not enforced.
 *
 * The suggested fix — writing the path as `assets/…` — does NOT work, and was
 * tested rather than assumed: Tailwind still compiles the candidate and still
 * emits `background-image: url(assets/…)`, swapping one unresolvable path for
 * another. The candidate has to stop being a candidate, not the path stop being
 * a path.
 *
 * SCOPE is everything `astro-components/` ships, not just the .astro files.
 * `components.json` and `README.md` carried the same string, and a consumer who
 * points `@source` at the package directory rather than at `components/*.astro`
 * compiles those too.
 *
 * Run:  node scripts/check-prose-classes.mjs [--self-test]
 * Exit: 0 = nothing a consumer compiles carries a relative url · 1 = something does
 *
 * Needs node_modules (the Tailwind CLI), so it belongs in the render job.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(ROOT, 'astro-components');
const TMP = join(ROOT, 'node_modules/.tmp');
const CLI = join(ROOT, 'node_modules/.bin/tailwindcss');
const THEME = join(ROOT, 'tailwind/theme.css');
const SELF_TEST = process.argv.includes('--self-test');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/** The same anchor build-utilities.mjs uses; if it moves, both must move. */
const ANCHOR = '@import "tailwindcss";';

/** Text a consumer could point `@source` at. Not `.astro/` — that is Astro's types dir. */
const SCANNABLE = new Set(['.astro', '.ts', '.md', '.json']);

function shippedFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (SCANNABLE.has(extname(name))) out.push(p);
    }
  };
  walk(PKG);
  return out.sort();
}

/**
 * Compile a set of files exactly as a consumer would — RAW, nothing stripped —
 * and return every emitted rule as {selector, body}.
 */
function compile(tag, files) {
  const dir = join(TMP, `prose-${tag}`);
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) rmSync(join(dir, f), { recursive: true });

  // Flatten into one directory so two @source globs cover everything; a name
  // collision would silently drop a file, so the prefix keeps them distinct.
  let n = 0;
  for (const f of files) {
    const flat = `${String(n++).padStart(3, '0')}-${relative(PKG, f).replace(/[\\/]/g, '_')}`;
    writeFileSync(join(dir, flat), readFileSync(f, 'utf8'));
  }

  const theme = readFileSync(THEME, 'utf8');
  if (!theme.includes(ANCHOR)) {
    console.error(red(`\n✖  tailwind/theme.css no longer contains \`${ANCHOR}\``));
    console.error(`  This script builds its compiler input by replacing that line, exactly as`);
    console.error(`  build-utilities.mjs does. Update ANCHOR in both.\n`);
    process.exit(1);
  }
  const inCss = join(TMP, `prose-${tag}.in.css`);
  const outCss = join(TMP, `prose-${tag}.out.css`);
  writeFileSync(inCss, theme.replace(ANCHOR, [
    '@layer theme, base, components, utilities;',
    '@import "tailwindcss/theme.css" layer(theme);',
    '@import "tailwindcss/utilities.css" source(none);',
    `@source "${dir}/*";`,
  ].join('\n')));

  try {
    execFileSync(CLI, ['-i', inCss, '-o', outCss], { stdio: 'pipe' });
  } catch (err) {
    console.error(red(`\n✖  tailwindcss failed to compile the package sources\n`));
    console.error(String(err.stderr || err.stdout || err.message));
    process.exit(1);
  }

  /* THE SECOND PASS, and it is the consumer's rather than ours. Tailwind only
     PARSES the CSS it emitted when it optimizes, so `--minify` is what turns a
     value the parser rejects into a printed diagnostic. Without it the pass
     above writes the broken declaration out and exits 0, which is exactly how
     two of them sat in this package's own comments from 2026-08-28 to
     2026-08-31 with every gate green. The exit code is 0 either way — the
     issues go to stdout — so this reads the output rather than the status. */
  const minCss = `${outCss}.min.css`;
  /* spawnSync, not execFileSync, and that is the whole reason this reads both
     streams: the CLI prints its issues to STDERR and still exits 0, so a run
     that only kept stdout saw an empty string and reported a clean package.
     Caught by the planted self-test row, which is what it is for. */
  const run = spawnSync(CLI, ['-i', inCss, '-o', minCss, '--minify'],
                        { encoding: 'utf8' });
  const out = String(run.stdout || '') + String(run.stderr || '');
  const issues = parseIssues(out);
  if (run.status !== 0 && !issues.length) {
    console.error(red(`\n✖  tailwindcss failed to optimize the package sources\n`));
    console.error(out || String(run.error?.message ?? ''));
    process.exit(1);
  }

  const css = readFileSync(outCss, 'utf8');
  const rules = [];
  for (const m of css.matchAll(/(\.[^\s{,][^{,\n]*?)\s*\{([^}]*)\}/g)) {
    rules.push({ selector: m[1].trim(), body: m[2] });
  }
  return { rules, bytes: css.length, issues, minBytes: statSync(minCss).size };
}

/**
 * One finding per `^--` caret the optimizer prints, with the selector taken
 * from the nearest quoted rule above it.
 *
 * The first version split the output on `Issue #N:` and found nothing, because
 * THAT HEADER ONLY APPEARS WHEN THERE IS MORE THAN ONE. A single warning is
 * printed under "Found 1 warning while optimizing generated CSS:" with no
 * numbered header at all — so the parser was keyed to a shape that only exists
 * once the package is broken in two places, and read a package broken in one
 * as clean. The caret is in every form of the message; the header is not.
 */
function parseIssues(out) {
  const lines = String(out).replace(/\x1b\[[0-9;]*m/g, '').split('\n');
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const caret = lines[i].match(/\^--\s*(.+?)\s*$/);
    if (!caret) continue;
    let selector = '(unknown selector)';
    for (let j = i - 1; j >= 0 && j > i - 8; j--) {
      const sel = lines[j].match(/(\.[^\s{]+)\s*\{/);
      if (sel) { selector = sel[1]; break; }
    }
    found.push({ selector, message: caret[1] });
  }
  return found;
}

/** A url() a consumer's bundler has to resolve against a location that is not ours. */
function relativeUrls(rules) {
  const out = [];
  for (const r of rules) {
    for (const m of r.body.matchAll(/url\(\s*['"]?([^'")]+)/g)) {
      const u = m[1].trim();
      if (!/^(https?:|data:|\/|#)/.test(u)) out.push({ selector: r.selector, url: u });
    }
  }
  return out;
}

/**
 * Which file the CANDIDATE was written in, so a finding names somewhere to go.
 *
 * Searching for the url instead of the candidate was the first version, and it
 * named two files that were innocent: `/_astro/assets/Rainbow.svg` appears in
 * the prose of both README.md and components.json as part of the STORY, and it
 * contains the offending path as a substring while being absolute and harmless.
 * A finding that points at the wrong file sends someone to edit correct prose.
 */
function sourcesOf(selector, files) {
  const candidate = selector.replace(/^\./, '').replace(/\\(.)/g, '$1');
  return files.filter((f) => readFileSync(f, 'utf8').includes(candidate)).map((f) => relative(ROOT, f));
}

/**
 * Five rows. Two of them are the ones that matter, and neither looks at the
 * repo's own sources: a PLANTED comment must be reported, and the same path
 * written absolute must not. Without the second, a detector that flagged every
 * url() would pass the first and look correct.
 *
 * The VACUITY row is the guard against the failure this checker is most likely
 * to have. An empty stylesheet contains no relative urls, so a compile that
 * silently produced nothing would report "0 findings" and read as good news.
 */
function selfTest() {
  const rows = [];
  const dir = join(TMP, 'prose-fixtures');
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) rmSync(join(dir, f), { recursive: true });

  const write = (name, body) => { const p = join(dir, name); writeFileSync(p, body); return p; };

  const planted = write('planted.astro',
    `---\n/**\n * Prose explaining the utility \`bg-[url(assets/Planted.svg)]\`.\n */\n---\n<div></div>\n`);
  const absolute = write('absolute.astro',
    `---\n/**\n * Prose explaining the utility \`bg-[url(/assets/Planted.svg)]\`.\n */\n---\n<div></div>\n`);
  const quiet = write('quiet.astro',
    `---\n/**\n * Prose with no class candidate in it whatsoever.\n */\n---\n<div></div>\n`);

  const p = compile('plant', [planted]);
  const a = compile('abs', [absolute]);
  const q = compile('quiet', [quiet]);

  const pf = relativeUrls(p.rules);
  rows.push([`a class quoted in a COMMENT is compiled, and reported`,
             pf.length === 1 && pf[0].url === 'assets/Planted.svg',
             pf.length ? pf[0].url : 'nothing reported']);

  const af = relativeUrls(a.rules);
  rows.push([`…and the same path written ABSOLUTE is not — the rule is about resolution, not url()`,
             af.length === 0 && a.rules.some((r) => /Planted/.test(r.selector)),
             `${af.length} finding(s), rule ${a.rules.some((r) => /Planted/.test(r.selector)) ? 'emitted' : 'MISSING'}`]);

  rows.push([`prose with no candidate yields nothing`, relativeUrls(q.rules).length === 0,
             `${relativeUrls(q.rules).length} finding(s)`]);

  /* The new refusal, and its CONTROL. A shorthand in a comment must be reported;
     the same utility written out ONE TOKEN PER NAME must not, or the rule would
     read "never quote an arbitrary value" rather than "never quote one that
     does not parse". The control is the half that keeps this usable. */
  const broken = write('broken.astro',
    `---\n/**\n * Every height is a token: \`h-[var(--size-x-lg|md|sm)]\`.\n */\n---\n<div></div>\n`);
  const sound = write('sound.astro',
    `---\n/**\n * Every height is a token: \`h-[var(--size-x-lg)]\`.\n */\n---\n<div></div>\n`);

  const b = compile('broken', [broken]);
  const s = compile('sound', [sound]);

  rows.push([`a pipe shorthand quoted in a COMMENT does not parse, and is reported`,
             b.issues.length === 1 && /Delim/.test(b.issues[0].message) &&
               /size-x-lg/.test(b.issues[0].selector),
             b.issues.length ? `${b.issues[0].selector} — ${b.issues[0].message}` : 'nothing reported']);

  rows.push([`…and the same utility spelled out ONE token per name is not — the rule is about parsing, not about arbitrary values`,
             s.issues.length === 0 && s.rules.some((r) => /size-x-lg/.test(r.selector)),
             `${s.issues.length} issue(s), rule ${s.rules.some((r) => /size-x-lg/.test(r.selector)) ? 'emitted' : 'MISSING'}`]);

  // Vacuity: the real compile must produce a real stylesheet, not an empty one.
  const files = shippedFiles();
  const real = compile('vacuity', files);
  rows.push([`the real compile produces a populated stylesheet, not an empty one`,
             real.rules.length > 100 && real.bytes > 10000,
             `${real.rules.length} rules, ${real.bytes} bytes`]);

  /* The same vacuity guard for the SECOND pass. An optimizer run that emitted
     nothing would report no issues, which reads exactly like a clean package. */
  rows.push([`…and so does the optimizer pass the new refusal reads`,
             real.minBytes > 5000, `${real.minBytes} bytes minified`]);

  // Scope: the walker must actually reach the subject.
  const hasFooter = files.some((f) => f.endsWith('components/Footer.astro'));
  const hasJson = files.some((f) => f.endsWith('components.json'));
  const hasReadme = files.some((f) => f.endsWith('README.md'));
  rows.push([`the walker reaches .astro, .json and .md alike — all three carried this string`,
             hasFooter && hasJson && hasReadme,
             `${files.length} files · Footer ${hasFooter ? '✓' : '✗'} · components.json ${hasJson ? '✓' : '✗'} · README ${hasReadme ? '✓' : '✗'}`]);

  let bad = 0;
  for (const [label, ok, detail] of rows) {
    console.log(`  ${ok ? green('✔') : red('✖')}  ${label}   ${dim(detail)}`);
    if (!ok) bad++;
  }
  return { bad, total: rows.length };
}

if (!existsSync(CLI)) {
  console.error(red(`\n✖  ${relative(ROOT, CLI)} is missing — run npm ci.\n`));
  console.error(`  This gate compiles the package the way a consumer does; without the CLI it`);
  console.error(`  cannot, and a checker that skips is worse than none.\n`);
  process.exit(1);
}

if (SELF_TEST) {
  const { bad, total } = selfTest();
  if (bad) {
    console.error(red(`\n✖  ${bad} of ${total} self-test rows failed — this checker does not do what it claims.\n`));
    process.exit(1);
  }
  console.log(green(`\n✔  ${total}/${total} — comments are scanned, absolute paths are spared, and the compile is not empty\n`));
  process.exit(0);
}

// ── the check ────────────────────────────────────────────────────────────────

const files = shippedFiles();
const raw = compile('raw', files);
const findings = relativeUrls(raw.rules);

if (findings.length) {
  console.error(red(`\n✖  ${findings.length} rule(s) a consumer compiles from this package carry a RELATIVE url\n`));
  for (const f of findings) {
    console.error(`  ${bold(f.selector)}`);
    console.error(`    ${dim(`→ url(${f.url})`)}`);
    const where = sourcesOf(f.selector, files);
    for (const w of where) console.error(`    ${dim(`written in ${w}`)}`);
  }
  console.error(`\n  Tailwind extracts candidates from the whole file, COMMENTS INCLUDED, and a`);
  console.error(`  consumer's bundler resolves that path against ITS stylesheet, not ours. This`);
  console.error(`  is the "didn't resolve at build time" warning in every consumer build.`);
  console.error(`\n  Writing the path as \`assets/…\` does NOT fix it — the candidate still`);
  console.error(`  compiles, to url(assets/…). Break the CANDIDATE: describe the utility in`);
  console.error(`  words instead of spelling it, as Footer.astro's rainbowSrc doc now does.\n`);
  process.exit(1);
}

if (raw.issues.length) {
  console.error(red(`\n✖  ${raw.issues.length} rule(s) a consumer compiles from this package do not PARSE\n`));
  for (const f of raw.issues) {
    console.error(`  ${bold(f.selector)}`);
    console.error(`    ${dim(f.message)}`);
    for (const w of sourcesOf(f.selector, files)) console.error(`    ${dim(`written in ${w}`)}`);
  }
  console.error(`\n  Tailwind extracts candidates from the whole file, COMMENTS INCLUDED, so a`);
  console.error(`  class quoted to EXPLAIN it is compiled like one that is worn. These reach the`);
  console.error(`  consumer as a build warning and a rule the browser discards.`);
  console.error(`\n  Break the candidate rather than the value: write the names out — one token`);
  console.error(`  per name — instead of folding them into an \`a|b|c\` shorthand.\n`);
  process.exit(1);
}

// Context, deliberately not enforced — see the header.
console.log(green(`\n✔  nothing this package ships compiles to a relative url, and every rule it does compile parses`) +
            dim(`  — ${files.length} files, ${raw.rules.length} rules compile out of them`) + '\n');
