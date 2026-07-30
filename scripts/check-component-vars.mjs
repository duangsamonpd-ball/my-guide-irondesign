#!/usr/bin/env node
/**
 * Iron Software Design System — component variable resolution check
 *
 * Our components read design tokens as plain CSS variables inside their own
 * <style> blocks, not as utility classes. Tailwind's scanner cannot see those,
 * so a token it decides to drop is invisible until something renders wrong.
 *
 * This takes the *compiled* stylesheet and asserts that every `var(--…)` the
 * components reference is actually defined in it.
 *
 * Run:  npx @tailwindcss/cli -i tailwind/theme.css -o /tmp/out.css
 *       node scripts/check-component-vars.mjs /tmp/out.css
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const compiledPath = process.argv[2];

if (!compiledPath) {
  console.error('usage: node scripts/check-component-vars.mjs <compiled.css>');
  process.exit(2);
}

const compiled = readFileSync(compiledPath, 'utf8');
const defined = new Set([...compiled.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

const COMPONENTS = join(ROOT, 'astro-components/components');
/** @type {Map<string, string[]>} variable → components that use it */
const used = new Map();

for (const file of readdirSync(COMPONENTS).filter((f) => f.endsWith('.astro'))) {
  const src = readFileSync(join(COMPONENTS, file), 'utf8');
  // A component may declare its own custom properties in its <style> block;
  // those resolve locally and never need to come from the theme, so don't
  // count them as usages that the compiled CSS has to satisfy.
  const localDefs = new Set([...src.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  for (const [, name] of src.matchAll(/var\((--[\w-]+)/g)) {
    if (localDefs.has(name)) continue;
    if (!used.has(name)) used.set(name, []);
    const list = used.get(name);
    if (!list.includes(file)) list.push(file);
  }
}

const missing = [...used.keys()].filter((v) => !defined.has(v)).sort();

if (missing.length) {
  console.error(`\n\x1b[31m✖  ${missing.length} variable${missing.length > 1 ? 's' : ''} used by components but not defined in the compiled CSS\x1b[0m\n`);
  for (const v of missing) {
    console.error(`    \x1b[31m✖\x1b[0m ${v}`);
    console.error(`        used by ${used.get(v).join(', ')}`);
  }
  console.error(`\n  Tailwind drops theme tokens no utility references. tailwind/theme.css uses`);
  console.error(`  \`@theme static\` to prevent exactly this — check that it is still there.\n`);
  process.exit(1);
}

/* ── docs pages must satisfy their own variables ─────────────────────────── */

/**
 * Each docs/component-*.html is standalone — no stylesheet link, just an inline
 * <style> and a hand-kept :root re-declaring the tokens that page happens to
 * need. So the compiled theme proves nothing about them: a component can start
 * reading a new token, the docs page can copy the rule across, and the variable
 * behind it is simply never declared. `var(--x)` with no declaration and no
 * fallback makes the whole property invalid, and the browser drops it —
 * silently, which is how three pages ended up rendering with no border at all
 * and a hover colour that never applied.
 *
 * Only CSS is scanned: <style> bodies and inline style="" attributes. The token
 * pages print `var(--name)` as copyable prose, and that is not a usage.
 */
const DOCS = join(ROOT, 'docs');
const docErrors = [];
let docsChecked = 0;

for (const file of readdirSync(DOCS).filter((f) => f.startsWith('component-') && f.endsWith('.html'))) {
  const src = readFileSync(join(DOCS, file), 'utf8');
  const css = [
    ...[...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]),
    ...[...src.matchAll(/\sstyle="([^"]*)"/gi)].map((m) => m[1]),
  ].join('\n');

  // A page may declare tokens itself, link a local stylesheet, or both. Remote
  // hrefs (the webfont) are ignored — nothing here declares custom properties.
  const declared = new Set([...src.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  for (const [, href] of src.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/gi)) {
    if (/^https?:/i.test(href)) continue;
    let linked;
    try {
      linked = readFileSync(join(DOCS, href), 'utf8');
    } catch {
      docErrors.push({ file, name: `(links ${href}, which does not exist)` });
      continue;
    }
    for (const [, n] of linked.matchAll(/(--[\w-]+)\s*:/g)) declared.add(n);
  }
  const seen = new Set();
  // `var(--x, fallback)` still renders without --x, so only the bare form counts.
  for (const [, name, next] of css.matchAll(/var\((--[\w-]+)\s*(,?)/g)) {
    if (next === ',' || declared.has(name) || seen.has(name)) continue;
    seen.add(name);
    docErrors.push({ file, name });
  }
  docsChecked++;
}

if (docErrors.length) {
  console.error(`\n\x1b[31m✖  ${docErrors.length} variable${docErrors.length > 1 ? 's' : ''} used in a docs page's CSS but never declared there\x1b[0m\n`);
  const byFile = new Map();
  for (const e of docErrors) (byFile.get(e.file) ?? byFile.set(e.file, []).get(e.file)).push(e.name);
  for (const [file, names] of byFile) {
    console.error(`    \x1b[1mdocs/${file}\x1b[0m`);
    for (const n of names) console.error(`      \x1b[31m✖\x1b[0m ${n}`);
  }
  console.error(`\n  These pages carry their own :root — add the token there with the same value`);
  console.error(`  it has in tailwind/tokens.css, or the property using it is dropped outright.\n`);
  process.exit(1);
}

console.log(`\n\x1b[32m✔  All ${used.size} component variables resolve in ${basename(compiledPath)}\x1b[0m`);
console.log(`\x1b[32m✔  ${docsChecked} docs pages resolve every variable their CSS uses\x1b[0m\n`);
