#!/usr/bin/env node
/**
 * Iron Software Design System — computed-style diff against a git ref
 *
 * ── THE GAP ────────────────────────────────────────────────────────────────
 *
 * On 2026-10-14 (#5) the role type tokens gained companions, and the question
 * was "did anything a reader sees change?". `state-diff` was the obvious tool and
 * the wrong one: it drives INTERACTIVE elements into states, so on a page with
 * none it reports "nothing was compared". The overflow, layout and audit sweeps
 * ask whether a layout is broken, not whether it moved. A throwaway probe that
 * compared every element's computed styles against HEAD found the answer — 50
 * elements in two cards whose letter-spacing had changed because their class
 * lists had never named the role's tracking — and it found it in minutes.
 *
 * This is that probe, kept. It asks the narrowest version of "what changed":
 * for every element on every docs page, at rest, every computed property, here
 * against a git ref. No pixels, so no antialiasing floor to calibrate; a change
 * is a value that is different, named with the property and both values.
 *
 *   node scripts/style-diff.mjs                       every docs page vs HEAD
 *   node scripts/style-diff.mjs --ref main~3          against another ref
 *   node scripts/style-diff.mjs component-tooltip     only these pages
 *   node scripts/style-diff.mjs --width 375           at another viewport
 *   node scripts/style-diff.mjs --vars                custom properties too
 *   node scripts/style-diff.mjs --self-test           prove the instrument
 *
 * NOT A GATE, for the reason `state-diff` is not one: "this renders the same as
 * a ref" is either vacuous or red for good reasons on a direct-to-main repo.
 * Changing how things look is the work; this tells you exactly what moved.
 *
 * WHAT IT DOES NOT SEE: states (hover, focus, open) — that is `state-diff`;
 * anything a script changes after load beyond what `load` + fonts settle; and
 * layout that moves without any computed value moving (a sibling growing).
 *
 * Elements are paired by document order. A page whose element COUNT differs is
 * reported as a structural change and its pairs are not compared, because
 * pairing by index after an insertion compares neighbours, not twins.
 *
 * Exit: 0 = compared, and nothing differs · 1 = a difference, a structural
 * change, nothing compared, or the network was touched · 2 = usage.
 */

import { serveStatic } from './lib/serve.mjs';
import { readdir, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { useLocalFonts, installOfflineGuard } from './lib/local-fonts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? dflt : args[i + 1];
};
const SELF_TEST = args.includes('--self-test');
/* Custom properties are INPUTS, and they inherit: one new token appears on every
   element of every page that links the theme, and the first run against HEAD~1
   reported 367 elements on one page for exactly that. What renders is the
   standard properties they feed. `--vars` puts them back. */
const VARS = args.includes('--vars');
const REF = opt('ref', 'HEAD');
const WIDTH = Number(opt('width', '1440'));
const MAX = Number(opt('max', '10'));
const only = args.filter((a, i) => !a.startsWith('--') && !['--ref', '--width', '--max'].includes(args[i - 1]));


/** Serve one docs tree, fonts from the vendored copy, Google Fonts links rewritten to it. */
async function serve(dir, fixtures = {}) {
  return serveStatic({
    roots: [dir],
    assets: false,
    fixtures: Object.fromEntries(Object.entries(fixtures).map(([p, f]) => [p, useLocalFonts(f)])),
  });
}

/** Every element under <body>: a short label and its full computed style, in document order. */
const READ = () => {
  /* Two things that differ between two loads of the SAME file, both found by
     the first full run, which flagged five untouched pages:
       · a running animation is read wherever it happens to be — a spinner's
         transform, a stroke-dashoffset mid-draw. Every animation is paused at
         its start, on both sides, before anything is read.
       · a url() computes to an ABSOLUTE url, and the two trees are served from
         two ports. The origin is cut out of every value. */
  for (const a of document.getAnimations()) { a.pause(); a.currentTime = 0; }
  const origin = location.origin;
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    const v = {};
    for (let i = 0; i < cs.length; i++) v[cs[i]] = cs.getPropertyValue(cs[i]).split(origin).join('');
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
    const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
    out.push({ label: el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (txt ? ` “${txt}”` : ''), v });
  }
  return out;
};

async function readPage(context, origin, file) {
  const page = await context.newPage();
  await page.setViewportSize({ width: WIDTH, height: 900 });
  await page.goto(`${origin}/${file}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const els = await page.evaluate(READ);
  await page.close();
  return els;
}

/** One page's differences: [{ label, prop, from, to }], or a structural note. */
function compare(a, b) {
  if (a.length !== b.length) return { structural: `${a.length} elements at the ref, ${b.length} here` };
  const diffs = [];
  for (let i = 0; i < a.length; i++) {
    const keys = new Set([...Object.keys(a[i].v), ...Object.keys(b[i].v)]);
    for (const k of keys) if ((VARS || !k.startsWith('--')) && a[i].v[k] !== b[i].v[k]) diffs.push({ label: b[i].label, prop: k, from: a[i].v[k], to: b[i].v[k] });
  }
  return { diffs, compared: a.length };
}

async function launch() {
  const { chromium } = await import('playwright-core');
  return chromium.launch({ channel: 'chrome' });
}

/* ── self-test ────────────────────────────────────────────────────────────── */

if (SELF_TEST) {
  const BASE = `<!doctype html><html><head><style>.a{letter-spacing:0px}.b{font-weight:400}</style></head>
<body><p class="a">one</p><p class="b">two</p><span>three</span></body></html>`;
  const fixtures = {
    '/same.html': BASE,
    '/moved.html': BASE.replace('.b{font-weight:400}', '.b{font-weight:700}'),
    '/url.html': BASE.replace('.a{letter-spacing:0px}', '.a{letter-spacing:0px;background-image:url(/x.svg)}'),
    '/spin.html': BASE.replace('.b{font-weight:400}', '.b{font-weight:400;animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}'),
    '/var.html': BASE.replace('.a{letter-spacing:0px}', '.a{letter-spacing:0px;--x:1}'),
    '/grown.html': BASE.replace('<span>three</span>', '<span>three</span><i>four</i>'),
    '/empty.html': '<!doctype html><html><body></body></html>',
  };
  const { server, origin } = await serve(ROOT, fixtures);
  const browser = await launch();
  const context = await browser.newContext();
  const escapes = await installOfflineGuard(context, 'http://127.0.0.1:');
  const base = await readPage(context, origin, 'same.html');
  const read = async (f) => compare(base, await readPage(context, origin, f));
  const same = await read('same.html');
  const moved = await read('moved.html');
  const grown = await read('grown.html');
  const varOnly = await read('var.html');
  /* Same fixture from a SECOND server, so the two sides really are on two
     ports, and read twice with time between, so a running animation would
     really be somewhere else. Each must come back identical. */
  const other = await serve(ROOT, fixtures);
  const urlA = await readPage(context, origin, 'url.html');
  const urlB = await readPage(context, other.origin, 'url.html');
  const spinA = await readPage(context, origin, 'spin.html');
  await new Promise((r) => setTimeout(r, 300));
  const spinB = await readPage(context, other.origin, 'spin.html');
  other.close();
  const empty = await readPage(context, origin, 'empty.html');
  await browser.close();
  server.close();

  const rows = [
    ['an identical page has no differences, and compared every element', same.diffs?.length === 0 && same.compared === 3],
    ['one changed declaration is found…', moved.diffs?.length >= 1],
    ['…on the element that changed, naming the property and both values',
      moved.diffs?.some((d) => d.label.startsWith('p.b') && d.prop === 'font-weight' && d.from === '400' && d.to === '700')],
    ['…and on no other element', moved.diffs?.every((d) => d.label.startsWith('p.b'))],
    ['the same url() from two ports is NOT a difference', compare(urlA, urlB).diffs?.length === 0],
    ['…and the url really was read, origin cut out',
      urlA[0]?.v['background-image'] === 'url("/x.svg")'],
    ['a running animation read at two moments is NOT a difference', compare(spinA, spinB).diffs?.length === 0],
    ['a custom property alone is NOT a difference — it renders nothing', varOnly.diffs?.length === 0],
    ['an inserted element is a STRUCTURAL change, not a run of shifted pairs', typeof grown.structural === 'string'],
    ['an empty page reads as zero elements, which the run refuses as nothing compared', empty.length === 0],
    ['the run touched no network', escapes.length === 0],
  ];
  let bad = 0;
  console.log(`\n${bold('style-diff.mjs self-test')}`);
  for (const [name, ok] of rows) { if (!ok) bad++; console.log(`  ${ok ? green('✔') : red('✖')} ${name}`); }
  console.log(bad ? red(`\n✖  ${bad} of ${rows.length} failed — the instrument is wrong\n`) : green(`\n✔  ${rows.length}/${rows.length}\n`));
  process.exit(bad ? 1 : 0);
}

/* ── the diff ─────────────────────────────────────────────────────────────── */

let sha;
try {
  sha = execFileSync('git', ['rev-parse', '--short', REF], { cwd: ROOT, encoding: 'utf8' }).trim();
} catch {
  console.error(red(`\n✖  ${REF} is not a git ref here\n`));
  process.exit(2);
}

/* The ref's docs/ only, via `git archive`: no worktree to leave behind if the
   run dies, and nothing outside docs/ is read. */
const tmp = await mkdtemp(join(tmpdir(), 'style-diff-'));
execFileSync('sh', ['-c', `git archive ${sha} docs | tar -x -C "${tmp}"`], { cwd: ROOT });

const here = join(ROOT, 'docs');
const refDocs = join(tmp, 'docs');
const all = (await readdir(here)).filter((f) => f.endsWith('.html')).sort();
const pages = only.length ? all.filter((f) => only.some((o) => f.includes(o))) : all;
if (!pages.length) {
  console.error(red(`\n✖  no docs page matches ${only.join(', ')}\n`));
  await rm(tmp, { recursive: true, force: true });
  process.exit(2);
}
const refHas = new Set((await readdir(refDocs)).filter((f) => f.endsWith('.html')));

const A = await serve(refDocs);
const B = await serve(here);
const browser = await launch();
const context = await browser.newContext();
/* One guard per origin is not possible on one context, so the guard admits
   both local origins by checking against the shared host prefix. */
const escapes = await installOfflineGuard(context, 'http://127.0.0.1:');

console.log(bold(`\n  Computed styles, ${pages.length} page(s) at ${WIDTH}px — here vs ${REF} (${sha})\n`));
let compared = 0;
let changed = 0;
let failed = false;
for (const file of pages) {
  if (!refHas.has(file)) { console.log(`  ${dim('·')} ${file} ${dim('— new, nothing at the ref to compare')}`); continue; }
  const [a, b] = await Promise.all([readPage(context, A.origin, file), readPage(context, B.origin, file)]);
  const r = compare(a, b);
  if (r.structural) { failed = true; console.log(`  ${red('✖')} ${file} — structure changed: ${r.structural}`); continue; }
  compared += r.compared;
  if (!r.diffs.length) { console.log(`  ${green('✔')} ${file} ${dim(`${r.compared} elements`)}`); continue; }
  failed = true;
  const els = new Set(r.diffs.map((d) => d.label));
  changed += els.size;
  console.log(`  ${red('✖')} ${file} — ${els.size} element(s), ${r.diffs.length} value(s)`);
  for (const d of r.diffs.slice(0, MAX)) console.log(`      ${d.label}\n        ${d.prop}: ${d.from} ${dim('→')} ${d.to}`);
  if (r.diffs.length > MAX) console.log(dim(`      … ${r.diffs.length - MAX} more (--max)`));
}

await browser.close();
A.server.close();
B.server.close();
await rm(tmp, { recursive: true, force: true });

if (escapes.length) {
  console.error(red(`\n✖  the run reached the network: ${[...new Set(escapes)].slice(0, 3).join(', ')}\n`));
  process.exit(1);
}
if (compared === 0) {
  console.error(red(`\n✖  nothing was compared — that is not a pass\n`));
  process.exit(1);
}
console.log(failed
  ? red(`\n✖  ${changed} element(s) render differently from ${REF}\n`)
  : green(`\n✔  ${compared} elements across ${pages.length} page(s) compute identically to ${REF}\n`));
process.exit(failed ? 1 : 0);
