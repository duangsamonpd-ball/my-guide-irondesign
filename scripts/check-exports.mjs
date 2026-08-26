#!/usr/bin/env node
/**
 * Iron Software Design System — barrel & exports-map check
 *
 * `astro-components/index.ts` is hand-kept, and so are the `exports` maps in the
 * two package.json files. Nothing else notices when they fall behind: adding a
 * component without exporting it only fails later, as a `[MISSING_EXPORT]` in
 * whatever app consumes the library, and a stale `exports` target only fails
 * when someone imports that specific path.
 *
 * This asserts six things:
 *   1. every components/*.astro is re-exported from the barrel
 *   2. every barrel export resolves to a file that exists
 *   3. barrel exports stay alphabetical (the file says they are)
 *   4. every `exports` target in either package.json exists on disk
 *   5. every component has a `### `Name.astro`` section in the package README
 *   6. the README's "N components ported" heading matches what is on disk
 *
 * 5 and 6 were added 2026-08-03. The README is the only hand-kept surface here
 * that nothing watched: `FooterBar` shipped and then went through four more
 * commits without ever being documented, while the heading still read "17
 * components ported". Every other kind of drift in this repo has a gate —
 * check:parity for CSS, check:render for markup, this file for the barrel — so
 * prose was the one place a component could go missing quietly.
 *
 * It also warns — without failing — when a component has no docs/component-*.html,
 * since `check:parity` silently skips those and the gap is easy to miss.
 *
 * Run:  node scripts/check-exports.mjs
 * Exit: 0 = in sync · 1 = drift found
 *
 * Zero dependencies — plain Node, same as the other checkers.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

import { SHARED_MODULES } from './lib/sources.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG_DIR = join(ROOT, 'astro-components');
const COMPONENTS = join(PKG_DIR, 'components');
const DOCS = join(ROOT, 'docs');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;

const errors = [];
const warnings = [];

/* ── 1 & 2 & 3: the barrel ───────────────────────────────────────────────── */

const components = readdirSync(COMPONENTS)
  .filter((f) => f.endsWith('.astro'))
  .map((f) => basename(f, '.astro'))
  .sort();

const barrelPath = join(PKG_DIR, 'index.ts');
const barrel = readFileSync(barrelPath, 'utf8');

/** name → specifier, in the order they appear in the file */
const exported = [...barrel.matchAll(/export\s*\{\s*default as (\w+)\s*\}\s*from\s*'([^']+)'/g)]
  .map((m) => ({ name: m[1], from: m[2] }));

const exportedNames = exported.map((e) => e.name);

for (const name of components) {
  if (!exportedNames.includes(name)) {
    errors.push({
      where: 'astro-components/index.ts',
      what: `${bold(name)} is not exported`,
      fix: `add:  export { default as ${name} } from './components/${name}.astro';`,
    });
  }
}

for (const { name, from } of exported) {
  const target = join(PKG_DIR, from);
  if (!existsSync(target)) {
    errors.push({
      where: 'astro-components/index.ts',
      what: `${bold(name)} points at ${from}, which does not exist`,
      fix: 'remove the export, or restore the file',
    });
  }
}

const sorted = [...exportedNames].sort();
if (exportedNames.join() !== sorted.join()) {
  const firstBad = exportedNames.findIndex((n, i) => n !== sorted[i]);
  errors.push({
    where: 'astro-components/index.ts',
    what: `exports are not alphabetical — ${bold(exportedNames[firstBad])} should come after ${bold(sorted[firstBad])}`,
    fix: 'the file documents itself as alphabetical; keep it that way so diffs stay small',
  });
}

/* ── 4: exports maps ─────────────────────────────────────────────────────── */

/** Every leaf string in an `exports` value, however it is nested. */
function targets(value) {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(targets);
  return [];
}

for (const rel of ['package.json', 'astro-components/package.json']) {
  const pkgPath = join(ROOT, rel);
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.exports) {
    errors.push({ where: rel, what: 'has no "exports" map', fix: 'add one so consumers can import by package name' });
    continue;
  }
  const base = dirname(pkgPath);
  for (const [subpath, value] of Object.entries(pkg.exports)) {
    for (const target of targets(value)) {
      // A wildcard subpath maps a whole directory; assert the directory is there.
      const probe = target.includes('*') ? target.slice(0, target.indexOf('*')) : target;
      const abs = join(base, probe);
      const ok = existsSync(abs) && (target.includes('*') ? statSync(abs).isDirectory() : statSync(abs).isFile());
      if (!ok) {
        errors.push({
          where: rel,
          what: `"${subpath}" → ${bold(target)} does not exist`,
          fix: 'fix the path, or drop the entry',
        });
      }
    }
  }
}

/* ── 5 & 6: the README ───────────────────────────────────────────────────── */

const readmePath = join(PKG_DIR, 'README.md');
const readme = readFileSync(readmePath, 'utf8');

/* Section headings look like:  ### `Button.astro`  */
const documented = new Set(
  [...readme.matchAll(/^###\s+`(\w+)\.astro`/gm)].map((m) => m[1]),
);

for (const name of components) {
  if (!documented.has(name)) {
    errors.push({
      where: 'astro-components/README.md',
      what: `${bold(name)} has no section`,
      fix: `add:  ### \`${name}.astro\`  — with a usage sample and its props, like the others`,
    });
  }
}

/* The "N components ported" heading is a number people read and trust. */
const ported = readme.match(/^##\s+(\d+)\s+components ported/m);
if (!ported) {
  errors.push({
    where: 'astro-components/README.md',
    what: 'no "## N components ported" heading',
    fix: 'restore it — this check counts against it',
  });
} else if (Number(ported[1]) !== components.length) {
  errors.push({
    where: 'astro-components/README.md',
    what: `heading says ${bold(`${ported[1]} components ported`)}, but ${bold(components.length)} exist on disk`,
    fix: `change the heading to "## ${components.length} components ported" and add the new name to the list under it`,
  });
}

/* ── 7: every OTHER sentence that states the count ───────────────────────── */

/**
 * Check 6 gates one heading. The same number appears in ordinary sentences too,
 * and those drift freely: on 2026-08-05 the root README said "18 components are
 * ported" and this package's own prose said "8 of 18 components take a required
 * prop", both while the gated heading correctly said 19 and 19 files sat on
 * disk. A fact worth gating in one place is worth gating everywhere it is
 * repeated — otherwise the gate protects the sentence nobody was going to get
 * wrong and leaves the two that were.
 *
 * Only "<n> components" is matched, and only where it is a claim about this
 * library. A sentence counting something else says what it counts.
 */
const COUNTED = [
  ['README.md', join(ROOT, 'README.md')],
  ['astro-components/README.md', readmePath],
];

for (const [label, path] of COUNTED) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch { continue; }
  for (const m of text.matchAll(/\b(\d+)\s+components\b/g)) {
    const n = Number(m[1]);
    if (n === components.length) continue;
    /* "8 of 18 components" — the second number is the total, the first is not */
    const line = text.slice(0, m.index).split('\n').length;
    errors.push({
      where: label,
      what: `line ${line} says ${bold(`${n} components`)}, but ${bold(components.length)} exist on disk`,
      fix: `change it to ${components.length}, or reword so it is not a claim about the library's size`,
    });
  }
}

/* ── 8: a converted component has to say it needs Tailwind ───────────────── */

/**
 * A component with no <style> block is styled entirely by utility classes, so
 * copying it into a project that does not run Tailwind — which is exactly what
 * this README told people to do — yields unstyled markup and no error anywhere.
 *
 * That is not a documentation nicety; it is the difference between the package
 * working and not. And it cannot be left to memory: the note went in when Badge
 * was the only converted component and still read "Badge is the first … the rest
 * carry their own CSS" after seven more had followed it.
 *
 * Derivable, so gated: no <style> in the component → its README section has to
 * carry the marker below.
 */
const TAILWIND_MARKER = 'Needs Tailwind';

/** Section body = from this component's heading to the next `###`. */
function sectionOf(name) {
  const start = readme.search(new RegExp(`^###\\s+\`${name}\\.astro\``, 'm'));
  if (start === -1) return null;
  const rest = readme.slice(start + 1);
  const next = rest.search(/^###\s+`/m);
  return next === -1 ? rest : rest.slice(0, next);
}

for (const name of components) {
  const src = readFileSync(join(PKG_DIR, 'components', `${name}.astro`), 'utf8');
  const hasStyle = /<style[^>]*>[\s\S]*\S[\s\S]*<\/style>/i.test(src);
  const section = sectionOf(name);
  if (section === null) continue; // check 5 already reports the missing section
  const claims = section.includes(TAILWIND_MARKER);

  if (!hasStyle && !claims) {
    errors.push({
      where: 'astro-components/README.md',
      what: `${bold(name)} ships no CSS of its own, and its section does not say so`,
      fix: `add a "> **${TAILWIND_MARKER}** …" note to its section — copied into a project without Tailwind it renders unstyled`,
    });
  }
  if (hasStyle && claims) {
    errors.push({
      where: 'astro-components/README.md',
      what: `${bold(name)} still ships its own CSS, but its section claims "${TAILWIND_MARKER}"`,
      fix: 'drop the note — it is not converted yet, so it needs nothing',
    });
  }
}

/* ── 9: a specifier the README tells people to import has to be importable ── */

/**
 * Check 4 walks the exports map and asserts each target exists. It cannot see
 * the opposite drift, which is the one that actually happened: the compiled
 * stylesheet existed, the README told people to link it, and it was reachable
 * by no package name at all — `<link href="…/docs/utilities.css">`, with the
 * ellipsis standing in for "find it yourself". A consuming room hit exactly
 * that on 2026-08-15: every component rendered unstyled, no error anywhere,
 * and the fix was four `@source` lines nobody had written down.
 *
 * So: every `@iron-software/<pkg>/<subpath>` that appears in either README must
 * be a subpath the matching exports map answers.
 */
const PKG_OF = new Map([
  ['@iron-software/design-system', 'package.json'],
  ['@iron-software/astro-components', 'astro-components/package.json'],
]);

const mapsBySpecifier = new Map(
  [...PKG_OF].map(([spec, rel]) => [spec, JSON.parse(readFileSync(join(ROOT, rel), 'utf8')).exports ?? {}]),
);

/** Does an exports map answer this subpath, wildcards included? */
function resolves(map, subpath) {
  if (map[subpath]) return true;
  return Object.keys(map).some((key) => {
    if (!key.includes('*')) return false;
    const [head, tail] = key.split('*');
    return subpath.startsWith(head) && subpath.endsWith(tail) && subpath.length >= head.length + tail.length;
  });
}

for (const [label, path] of COUNTED) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch { continue; }
  for (const m of text.matchAll(/@iron-software\/(design-system|astro-components)(\/[\w./*-]+)?/g)) {
    const spec = `@iron-software/${m[1]}`;
    const subpath = m[2] ? `.${m[2]}` : '.';
    /* `@source` points at a PATH inside node_modules, not at a package
       specifier — Tailwind reads the file, so the exports map never sees it.
       Check 10 below is what keeps those honest. */
    const line = text.slice(0, m.index).split('\n').length;
    const lineText = text.split('\n')[line - 1] ?? '';
    if (lineText.includes('@source')) continue;
    if (!resolves(mapsBySpecifier.get(spec), subpath)) {
      errors.push({
        where: label,
        what: `line ${line} tells people to import ${bold(spec + (m[2] ?? ''))}, which its exports map does not answer`,
        fix: `add "${subpath}" to the exports map in ${PKG_OF.get(spec)}, or stop documenting it`,
      });
    }
  }
}

/* ── 10: the @source block is the compiler's own source set ──────────────── */

/**
 * A consumer running Tailwind compiles this package's classes themselves, and
 * Tailwind only emits what it has scanned. `build-utilities.mjs` already names
 * the exact set that has to be scanned — components/, internal/, and the shared
 * `.ts` files carrying class strings — so the README's `@source` block is
 * derivable from it rather than a thing to remember. CLAUDE.md already warns
 * that a new shared module has to be named; scripts/lib/sources.mjs is now the
 * one place that names it, and this makes the README fail loudly instead of
 * silently shipping classes with no rules.
 */
/* Imported, not regexed out of another script's SOURCE. That worked, but it
   made this the fourth place the list could be got wrong — and a regex over a
   sibling script is a dependency nothing declares. */
const sharedTs = SHARED_MODULES.filter((f) => existsSync(join(PKG_DIR, f)));

const wantSources = ['components/*.astro', 'internal/*.astro', ...sharedTs];
const sourceLines = [...readme.matchAll(/@source\s+"[^"]*@iron-software\/astro-components\/([^"]+)"/g)].map((m) => m[1]);

if (sourceLines.length === 0) {
  errors.push({
    where: 'astro-components/README.md',
    what: 'the Setup section has no `@source` block',
    fix: `a consumer running Tailwind needs one line each for: ${wantSources.join(', ')}`,
  });
} else {
  for (const want of wantSources) {
    if (!sourceLines.includes(want)) {
      errors.push({
        where: 'astro-components/README.md',
        what: `the @source block does not name ${bold(want)}, which build-utilities.mjs compiles`,
        fix: `add:  @source "../../node_modules/@iron-software/astro-components/${want}";`,
      });
    }
  }
  for (const got of sourceLines) {
    if (!wantSources.includes(got)) {
      errors.push({
        where: 'astro-components/README.md',
        what: `the @source block names ${bold(got)}, which build-utilities.mjs does not compile`,
        fix: 'drop the line, or add the path to the build so the two agree',
      });
    }
  }
}

/* ── docs pages (warning only) ───────────────────────────────────────────── */

for (const name of components) {
  const page = join(DOCS, `component-${name.toLowerCase()}.html`);
  if (!existsSync(page)) {
    warnings.push(`${name} has no docs/component-${name.toLowerCase()}.html — check:parity skips it silently`);
  }
}

/* ── report ──────────────────────────────────────────────────────────────── */

if (warnings.length) {
  console.log(`\n${dim(`·  ${warnings.length} component${warnings.length > 1 ? 's' : ''} without a docs page`)}`);
  for (const w of warnings) console.log(dim(`     ${w}`));
}

if (errors.length) {
  console.log(`\n${red(`✖  ${errors.length} export${errors.length > 1 ? 's' : ''} out of sync`)}`);
  const byFile = new Map();
  for (const e of errors) {
    if (!byFile.has(e.where)) byFile.set(e.where, []);
    byFile.get(e.where).push(e);
  }
  for (const [where, items] of byFile) {
    console.log(`\n  ${bold(where)}`);
    for (const { what, fix } of items) {
      console.log(`    ${red('✖')} ${what}`);
      console.log(`      ${dim(fix)}`);
    }
  }
  console.log(`\n  The barrel, the exports maps and the README are all hand-kept — a missing`);
  console.log(`  export otherwise surfaces only as [MISSING_EXPORT] inside a consuming app,`);
  console.log(`  and a missing README section not at all.\n`);
  process.exit(1);
}

console.log(
  `\n\x1b[32m✔  Exports in sync — ${components.length} components exported, ` +
    `all barrel and package.json targets resolve, all documented\x1b[0m\n`,
);
