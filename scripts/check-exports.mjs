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
 * This asserts four things:
 *   1. every components/*.astro is re-exported from the barrel
 *   2. every barrel export resolves to a file that exists
 *   3. barrel exports stay alphabetical (the file says they are)
 *   4. every `exports` target in either package.json exists on disk
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
  console.log(`\n  The barrel and the exports maps are hand-kept — a missing export otherwise`);
  console.log(`  only surfaces as [MISSING_EXPORT] inside a consuming app.\n`);
  process.exit(1);
}

console.log(
  `\n\x1b[32m✔  Exports in sync — ${components.length} components exported, ` +
    `all barrel and package.json targets resolve\x1b[0m\n`,
);
