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
  for (const [, name] of src.matchAll(/var\((--[\w-]+)/g)) {
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

console.log(`\n\x1b[32m✔  All ${used.size} component variables resolve in ${basename(compiledPath)}\x1b[0m\n`);
