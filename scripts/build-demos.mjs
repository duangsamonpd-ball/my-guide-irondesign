#!/usr/bin/env node
/**
 * Iron Software Design System — docs demo markup generator
 *
 * The problem this closes: `check:parity` proves a component's CSS matches its
 * docs page, but the demo MARKUP in docs/component-*.html was hand-typed. A
 * component could change its DOM — a wrapper element, an aria attribute — and
 * every gate would stay green while the docs quietly showed stale structure.
 *
 * So the markup is generated instead. `playground/src/pages/demos/<name>.astro`
 * renders real components inside `<div data-demo="region">` wrappers; this
 * script builds that app, extracts each region from the real HTML output, and
 * writes it into the matching sentinels in `docs/component-<name>.html`:
 *
 *     <!-- demo:preview -->
 *     …generated, do not edit by hand…
 *     <!-- /demo:preview -->
 *
 * Run:
 *   node scripts/build-demos.mjs           write the docs pages
 *   node scripts/build-demos.mjs --check   fail if they are not already current
 *
 * The --check form is the `check:render` gate, and mirrors how build-theme.mjs
 * relates to check:theme.
 *
 * Zero dependencies — plain Node, same as the other checkers.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_PAGES = join(ROOT, 'playground/src/pages/demos');
const DIST = join(ROOT, 'playground/dist/demos');
const DOCS = join(ROOT, 'docs');

const CHECK = process.argv.includes('--check');
const SKIP_BUILD = process.argv.includes('--no-build');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/* ── 1. build the playground ─────────────────────────────────────────────── */

function buildPlayground() {
  if (SKIP_BUILD) return;
  if (!existsSync(join(ROOT, 'playground/node_modules')) && !existsSync(join(ROOT, 'node_modules/astro'))) {
    console.error(red('\n✖  playground dependencies are not installed — run `npm install` at the repo root.\n'));
    process.exit(1);
  }
  try {
    execFileSync('npm', ['run', 'build', '--workspace=@iron-software/playground', '--silent'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    console.error(red('\n✖  the playground failed to build — the components could not be rendered.\n'));
    console.error(String(err.stdout ?? '') + String(err.stderr ?? ''));
    process.exit(1);
  }
}

/* ── 2. pull one <div data-demo="…"> region out of rendered HTML ─────────── */

/** Character ranges covered by HTML comments, so tag scanning can skip them. */
function commentRanges(html) {
  const ranges = [];
  const re = /<!--[\s\S]*?-->/g;
  let m;
  while ((m = re.exec(html))) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

/**
 * Inner HTML of `<div data-demo="name">`, found by tracking <div>/</div> depth
 * so nested divs in a demo don't terminate it early. Comment bodies are skipped
 * because a component's own comment can legitimately contain markup-ish text.
 */
function extractRegion(html, name) {
  const open = new RegExp(`<div[^>]*\\sdata-demo="${name}"[^>]*>`);
  const start = html.match(open);
  if (!start) return null;

  const bodyStart = start.index + start[0].length;
  const comments = commentRanges(html);
  const inComment = (i) => comments.some(([a, b]) => i >= a && i < b);

  const tag = /<div\b|<\/div>/gi;
  tag.lastIndex = bodyStart;
  let depth = 1;
  let m;
  while ((m = tag.exec(html))) {
    if (inComment(m.index)) continue;
    depth += m[0].toLowerCase() === '</div>' ? -1 : 1;
    if (depth === 0) return html.slice(bodyStart, m.index);
  }
  return null;
}

/* ── 3. normalise rendered output into docs-ready markup ─────────────────── */

/**
 * Astro emits two kinds of noise the docs pages must not carry:
 *
 *  · `data-astro-cid-…` scope attributes — every component <style> is scoped,
 *    and the hash changes whenever that style block is edited, so snapshotting
 *    it would make the gate fail on unrelated CSS edits.
 *  · per-render ids — Select (`sel-<8 hex>`) and Tooltip (`tt-<8 hex>`) mint one
 *    unconditionally, so they differ on every build. Each distinct id is mapped
 *    to a stable `<prefix>-demo-<n>`, which also fixes every `aria-` and `for`
 *    reference to it because the whole token is rewritten.
 *
 * The hoisted `<script type="module">` behaviour bundles are KEPT, so a demo in
 * the docs runs the component's real behaviour. They used to be stripped on the
 * assumption that the demos were static previews — which was wrong:
 * component-select.html carried a hand-written reimplementation of the whole
 * listbox interaction, a fifth copy that had already drifted (it referenced an
 * `id="…-val"` the component never renders).
 *
 * Scripts are masked out before anything else touches the markup. Minified JS
 * lives on one line and is full of `<` and `>` (`i<n`, `=>`), which the tag
 * scanner would happily read as elements.
 */
function normalise(html) {
  const scripts = [];
  let out = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (block) => {
    scripts.push(block);
    return `\n__DEMO_SCRIPT_${scripts.length - 1}__\n`;
  });

  // Astro writes the scope marker bare on a static element but as `="true"` on a
  // dynamic <Tag>, so the value has to be optional — matching only the name left
  // a stray `="true"` behind and wrote malformed HTML into the docs.
  out = out.replace(/\s+data-astro-cid-[a-z0-9]+(?:="[^"]*")?/g, '');

  const seen = new Map();
  out = out.replace(/\b([a-z]{2,10})-([0-9a-f]{8})\b/g, (whole, prefix) => {
    if (!seen.has(whole)) seen.set(whole, `${prefix}-demo-${[...seen.keys()].filter((k) => k.startsWith(`${prefix}-`)).length + 1}`);
    return seen.get(whole);
  });

  return reindent(out).flatMap((line) => {
    const placeholder = line.match(/^(\s*)__DEMO_SCRIPT_(\d+)__$/);
    if (!placeholder) return [line];
    const [, indent, index] = placeholder;
    return scripts[Number(index)].split('\n').map((l) => indent + l);
  });
}

const VOID = /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;

/** Net nesting change a line causes, ignoring void and self-closing elements. */
function tagDelta(line) {
  let delta = 0;
  for (const [, slash, name, , selfClose] of line.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    if (selfClose || VOID.test(name)) continue;
    delta += slash ? -1 : 1;
  }
  return delta;
}

/**
 * Re-indent by real tag depth. Astro indents each component's output relative to
 * its own source file, so a nested component arrives less indented than its
 * parent — unreadable once spliced into a docs page.
 *
 * Line BREAKS are left exactly where Astro put them and only the leading
 * whitespace is rewritten. Inserting or removing a break would add or remove
 * whitespace between inline elements and could shift the rendered layout;
 * changing how much whitespace there is cannot, since HTML collapses it.
 * Blank lines (left behind by falsy conditionals) are dropped for the same
 * reason — the neighbouring newlines still separate the elements.
 */
function reindent(html) {
  const out = [];
  let depth = 0;
  for (const raw of html.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const opensWithClose = line.startsWith('</');
    if (opensWithClose) depth = Math.max(0, depth - 1);
    out.push('  '.repeat(depth) + line);
    depth = Math.max(0, depth + tagDelta(line) + (opensWithClose ? 1 : 0));
  }
  // A balanced region must land back on zero. If it doesn't, extraction grabbed
  // the wrong closing tag and splicing it into the docs page would break the
  // surrounding layout — refuse rather than write it.
  if (depth !== 0) throw new Error(`region is unbalanced — ${depth} element(s) left open`);
  return out;
}

/* ── 4. splice regions into the docs page ────────────────────────────────── */

function sentinelRe(name) {
  // The body is lazy and may be empty, so a freshly-added pair of sentinels with
  // nothing between them fills in on the first run.
  return new RegExp(`([ \\t]*)<!-- demo:${name} -->\\n[\\s\\S]*?([ \\t]*)<!-- /demo:${name} -->`);
}

function splice(docs, name, lines) {
  const re = sentinelRe(name);
  const m = docs.match(re);
  if (!m) return null;
  const indent = m[1];
  const body = lines.map((l) => (l ? indent + l : '')).join('\n');
  const out = `${indent}<!-- demo:${name} -->\n${body}\n${indent}<!-- /demo:${name} -->`;
  // A function replacement, not a string: `String.replace` reads `$1`, `$2`, `$&`
  // in a replacement STRING as capture-group references, so any demo containing a
  // dollar followed by a digit — "$29 / month" — silently lost it.
  return docs.replace(re, () => out);
}

/** Region names a docs page declares sentinels for, in document order. */
function docsRegions(docs) {
  return [...docs.matchAll(/<!-- demo:([a-z0-9-]+) -->/g)].map((m) => m[1]);
}

/** Region names a rendered page provides. */
function renderedRegions(html) {
  return [...html.matchAll(/<div[^>]*\sdata-demo="([a-z0-9-]+)"/g)].map((m) => m[1]);
}

/* ── 5. drive it ─────────────────────────────────────────────────────────── */

if (!existsSync(DEMO_PAGES)) {
  console.error(red(`\n✖  no demo pages at playground/src/pages/demos\n`));
  process.exit(1);
}

buildPlayground();

const pages = readdirSync(DEMO_PAGES)
  .filter((f) => f.endsWith('.astro') && !f.startsWith('_') && f !== 'probe.astro')
  .map((f) => basename(f, '.astro'))
  .sort();

const errors = [];
const stale = [];
let regionsDone = 0;
let pagesWritten = 0;

for (const name of pages) {
  const distPath = join(DIST, `${name}.html`);
  const docsPath = join(DOCS, `component-${name}.html`);

  if (!existsSync(distPath)) {
    errors.push(`${name}: playground built no demos/${name}.html`);
    continue;
  }
  if (!existsSync(docsPath)) {
    errors.push(`${name}: no docs/component-${name}.html to write into`);
    continue;
  }

  const rendered = readFileSync(distPath, 'utf8');
  let docs = readFileSync(docsPath, 'utf8');
  const original = docs;

  const provided = renderedRegions(rendered);
  const declared = docsRegions(docs);

  for (const r of provided) {
    if (!declared.includes(r)) errors.push(`${name}: playground renders "${r}" but docs has no <!-- demo:${r} --> sentinel`);
  }
  for (const r of declared) {
    if (!provided.includes(r)) errors.push(`${name}: docs declares <!-- demo:${r} --> but the playground renders no such region`);
  }

  for (const region of provided) {
    if (!declared.includes(region)) continue;
    const raw = extractRegion(rendered, region);
    if (raw === null) {
      errors.push(`${name}/${region}: could not find the closing </div> for the region`);
      continue;
    }
    let lines;
    try {
      lines = normalise(raw);
    } catch (err) {
      errors.push(`${name}/${region}: ${err.message}`);
      continue;
    }

    const next = splice(docs, region, lines);
    if (next === null) {
      errors.push(`${name}/${region}: sentinels are malformed (need <!-- demo:${region} --> … <!-- /demo:${region} --> on their own lines)`);
      continue;
    }
    docs = next;
    regionsDone++;
  }

  if (docs !== original) {
    if (CHECK) {
      stale.push({ name, docsPath, expected: docs, actual: original });
    } else {
      writeFileSync(docsPath, docs);
      pagesWritten++;
    }
  }
}

/* ── 6. report ───────────────────────────────────────────────────────────── */

if (errors.length) {
  console.error(red(`\n✖  ${errors.length} demo wiring problem${errors.length > 1 ? 's' : ''}`));
  for (const e of errors) console.error(`    ${red('✖')} ${e}`);
  console.error('');
  process.exit(1);
}

if (CHECK && stale.length) {
  console.error(red(`\n✖  demo markup in ${stale.length} docs page${stale.length > 1 ? 's' : ''} is stale`));
  for (const { name, expected, actual } of stale) {
    console.error(`\n  ${bold(`docs/component-${name}.html`)}`);
    const a = actual.split('\n');
    const b = expected.split('\n');
    let shown = 0;
    for (let i = 0; i < Math.max(a.length, b.length) && shown < 6; i++) {
      if (a[i] !== b[i]) {
        console.error(`    line ${i + 1}`);
        console.error(`      ${red('in docs')}    ${dim((a[i] ?? '(missing)').trim().slice(0, 100))}`);
        console.error(`      ${green('rendered')}   ${dim((b[i] ?? '(missing)').trim().slice(0, 100))}`);
        shown++;
      }
    }
  }
  console.error(`\n  The components are the source of truth. Run ${bold('npm run build:demos')} to`);
  console.error(`  regenerate the docs demo markup, then commit the result.\n`);
  process.exit(1);
}

const scope = `${regionsDone} region${regionsDone === 1 ? '' : 's'} across ${pages.length} component${pages.length === 1 ? '' : 's'}`;
console.log(
  CHECK
    ? green(`\n✔  Demo markup current — ${scope} match the rendered components\n`)
    : green(`\n✔  Demo markup generated — ${scope}, ${pagesWritten} docs page${pagesWritten === 1 ? '' : 's'} written\n`)
);
