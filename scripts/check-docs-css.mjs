#!/usr/bin/env node
/**
 * Iron Software Design System — docs shell ownership check
 *
 * docs/docs.css holds the chrome every page in docs/ shares. Those rules used to
 * be copied into all 29 pages, and that is exactly how they drifted apart: a fix
 * made on one page never reached the others, so by the time anyone looked there
 * were four versions of `.hamburger` and three of `.sidebar`.
 *
 * This fails if a page declares a selector docs.css already owns. Re-declaring it
 * is how the copies came back last time — change the shared file instead, or, if
 * the page genuinely needs to differ, give it a selector of its own.
 *
 * Run:  node scripts/check-docs-css.mjs
 * Exit: 0 = no page overrides the shell · 1 = someone re-declared one
 *
 * Zero dependencies — plain Node, same as the other checkers.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');

/** Split CSS into top-level rules, tracking brace depth so @media stays whole. */
function rules(css) {
  const out = [];
  let cur = '';
  let depth = 0;
  for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    cur += ch;
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      out.push(cur.trim());
      cur = '';
    }
  }
  return out.filter((r) => r.includes('{'));
}

const selector = (r) => r.slice(0, r.indexOf('{')).replace(/\s+/g, ' ').trim();

const shell = new Set(rules(readFileSync(join(DOCS, 'docs.css'), 'utf8')).map(selector));

const clashes = [];
let checked = 0;

for (const file of readdirSync(DOCS).filter((f) => f.endsWith('.html'))) {
  const src = readFileSync(join(DOCS, file), 'utf8');
  const css = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  for (const s of new Set(rules(css).map(selector))) {
    if (shell.has(s)) clashes.push({ file, selector: s });
  }
  checked++;
}

if (clashes.length) {
  console.error(`\n\x1b[31m✖  ${clashes.length} selector${clashes.length > 1 ? 's' : ''} re-declared in a page that docs/docs.css already owns\x1b[0m\n`);
  const byFile = new Map();
  for (const c of clashes) (byFile.get(c.file) ?? byFile.set(c.file, []).get(c.file)).push(c.selector);
  for (const [file, sels] of byFile) {
    console.error(`    \x1b[1mdocs/${file}\x1b[0m`);
    for (const s of sels) console.error(`      \x1b[31m✖\x1b[0m ${s}`);
  }
  console.error(`\n  Edit docs/docs.css so every page gets the change, or give this page its own`);
  console.error(`  selector if it really needs to differ.\n`);
  process.exit(1);
}

console.log(`\n\x1b[32m✔  ${checked} docs pages leave the ${shell.size} shared shell rules alone\x1b[0m\n`);
