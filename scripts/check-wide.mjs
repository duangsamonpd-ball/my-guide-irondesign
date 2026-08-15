#!/usr/bin/env node
/**
 * Iron Software Design System — what keeps growing past the canvas
 *
 * Every instrument in this repo stops at 1440. `check-overflow.mjs` sweeps to
 * 1440, `check-layout.mjs` to 1440, `preview.mjs --all` runs at 1440 and only
 * 1440, and every Figma frame is drawn at 1440. So a fault that exists only
 * above the canvas cannot be found here, and the first one was not: on
 * 2026-08-15 the page-experiments room reported FooterBar's review badges
 * sitting left of the partner logos beneath them on a wide monitor — 24 against
 * 240 at 1920, 24 against 560 at 2560 — because `.fb-mid-inner` had no
 * `max-width` while the bands above and below it did.
 *
 * WIDENING THE OVERFLOW SWEEP WOULD NOT HAVE FOUND IT. Nothing overflowed:
 * `.fb-mid-inner` was 1872 wide inside a 1920 parent, comfortably in its box at
 * every width. The fault was two bands that should line up stopping in
 * different places, which no per-element overflow question can ask.
 *
 * What this asks instead: an element wider than `--size-container-max` that
 * PAINTS NOTHING. A full-bleed band with a background is a deliberate thing —
 * the footer bars, the violet rainbow band. A full-bleed wrapper with nothing
 * painted is content that forgot its cap, which is exactly what `.fb-mid-inner`
 * and `.fb-tools-inner` were. Paint also ends the search down a branch, which is
 * what keeps the report to causes: an uncapped wrapper makes every 100%-wide
 * child wide too, and listing all of them buries the one that is wrong.
 *
 *   node scripts/check-wide.mjs                       every component
 *   node scripts/check-wide.mjs footerbar footer      just these
 *   node scripts/check-wide.mjs --widths 1920,3840
 *   node scripts/check-wide.mjs --json
 *   node scripts/check-wide.mjs --self-test           prove the detector
 *
 * NOT A GATE, and that is a decision rather than an omission — Ball's call,
 * 2026-08-15, after the alternative was costed. Promoting it today would ship
 * three exemptions on day one (below), and exemptions written before a real
 * fault exists have hidden live bugs in this repo before: `transform`,
 * X-axis-only and "absolute overlaps by design" each swallowed one on the same
 * afternoon. It earns a gate when it has caught a second real fault, on
 * evidence rather than on the guess that it will. Until then it belongs where
 * `state-diff` sits: run it when you touch how something is laid out.
 *
 * Exit code is non-zero when anything is found that is not in ACCEPTED, when an
 * ACCEPTED entry goes stale, or when a page cannot arm the detector.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize, basename } from 'node:path';

import { LOCAL_FONT_LINK, serveFonts, installOfflineGuard } from './lib/local-fonts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const DIST = join(ROOT, 'playground/dist');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/* ── 0. the three that are not faults ─────────────────────────────────────────
 *
 * Keyed `<page>|<tag><classes>`. Same anti-rot rule as `check-overflow.mjs` and
 * `preview.mjs`: an entry that never fires on a full run is reported stale and
 * exits non-zero, so an excuse cannot outlive the thing it excuses.
 *
 * Each was measured before it was written down. None is "this looked fine".
 */
const ACCEPTED = new Map([
  [
    'button|div.lbl',
    'Playground demo scaffolding, not the component: the caption under each demo cell, written ' +
      'in playground/src/pages/demos/button.astro. It is a block in a full-width demo grid and ' +
      'has no cap because the docs canvas it normally renders in supplies one.',
  ],
  [
    'footerbar|div.fb-tools-clip',
    'The Free-tools reveal clipper. `.fb-tools` above it paints the band background and is meant ' +
      'to be full-bleed; this element exists only to be `overflow: hidden` for the 0fr→1fr ' +
      'disclosure, and the content inside it — `.fb-tools-inner` — carries the cap as of 8ac7610. ' +
      'Capping the clipper instead would stop the gradient at 1440.',
  ],
  [
    'select|div.sel-opt',
    'Select ships no width of its own — Ball dropped the hard-coded `max-width: 280px` on ' +
      "2026-07-31 so the consumer decides. The open menu is `left-0 right-0` on the field, so at " +
      '1920 an unconstrained demo field makes a 1910px option row. Sizing it is the page\'s job.',
  ],
]);

/* ── 1. arguments ─────────────────────────────────────────────────────────── */

const DEFAULT_WIDTHS = [1920, 2560];

function fail(msg) {
  console.error(red(`\n✖  ${msg}\n`));
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { pages: [], widths: DEFAULT_WIDTHS };
  const takesValue = new Set(['--widths', '--pages']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (takesValue.has(a)) {
      const v = argv[++i];
      if (v === undefined) fail(`${a} needs a value`);
      if (a === '--widths') opts.widths = v.split(',').map((n) => Number(n.trim()));
      else opts.pages.push(...v.split(',').map((s) => s.trim()));
    } else if (a.startsWith('--') && a.includes('=')) {
      const [k, ...rest] = a.split('=');
      argv.splice(i--, 1, k, rest.join('='));
    } else if (a.startsWith('--')) {
      opts[a.slice(2)] = true;
    } else {
      opts.pages.push(a);
    }
  }
  if (opts.widths.some((w) => !Number.isFinite(w) || w < 240)) {
    fail(`--widths must be viewport widths, got ${opts.widths.join(',')}`);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const fullRun = opts.pages.length === 0 && opts.widths === DEFAULT_WIDTHS;

if (!opts.selfTest && !opts['self-test'] && !existsSync(join(DIST, 'demos'))) {
  fail('playground/dist/demos is missing — run `npm --prefix playground run build` first.');
}

/* ── 2. the page the harness serves ───────────────────────────────────────── */

/* Identical to the overflow sweep's: a demo page carries only Astro's scoped
   CSS, so without the tokens every var() collapses and `--size-container-max`
   resolves to nothing — which would make EVERY wrapper look uncapped and the
   report all noise. capOf() below refuses rather than guessing when that
   happens. */
const INJECT =
  LOCAL_FONT_LINK +
  '<link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/utilities.css">' +
  '<style>* { margin: 0; padding: 0; box-sizing: border-box; }</style>' +
  "<style>body { font-family: 'Montserrat', sans-serif; }</style>";

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json',
};

/**
 * The fixture behind --self-test. Every row has an answer known before the
 * browser starts, and the two REFUSAL rows are the point: a detector that
 * reports the uncapped wrapper is only worth something if it stays quiet about
 * the capped one beside it and about the painted band around both.
 */
const SELF_TEST_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>check-wide.mjs self-test</title>
<style>
  :root { --size-container-max: 90rem; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  /* The demo root PAINTS on purpose. Without that, a wide painted band is
     skipped for being inside a wide unpainted ancestor, and the fixture cannot
     tell "paint stops the walk" from "paint is ignored" — measured 2026-08-15,
     when disabling the paint test left all ten checks green. */
  [data-demo] { background: #0B0B0B; }
  .band { background: #222; display: flex; justify-content: center; padding: 0 24px; }
  .art  { background-image: linear-gradient(#000, #111); display: flex; justify-content: center; }
  .capped   { width: 100%; max-width: var(--size-container-max); }
  .spacer   { width: 100%; }
  .uncapped { width: 100%; }
</style></head><body>
<div data-demo="self-test">
  <div class="band"><div class="capped" id="capped">capped, must stay quiet</div></div>
  <div class="band"><div class="uncapped" id="uncapped">uncapped, must be reported</div></div>
  <div class="art"><div class="uncapped" id="under-image">uncapped under a background IMAGE band</div></div>
  <div class="band"><div class="uncapped" id="outer"><div class="uncapped" id="inner">nested, only the outer is the cause</div></div></div>
  <div class="band"><div class="spacer" id="empty"></div></div>
  <div class="band"><div class="capped" id="narrow" style="max-width:200px">narrow</div></div>
</div>
</body></html>`;

async function startServer() {
  const server = createServer(async (req, res) => {
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
    catch { res.writeHead(400).end('bad escape in URL'); return; }

    const font = await serveFonts(path);
    if (font) { res.writeHead(200, { 'content-type': font.type }).end(font.body); return; }

    if (path === '/__self-test.html') {
      res.writeHead(200, { 'content-type': MIME['.html'] }).end(SELF_TEST_HTML);
      return;
    }
    if (path.startsWith('/demos/')) {
      try {
        const html = await readFile(join(DIST, normalize(path)), 'utf8');
        res.writeHead(200, { 'content-type': MIME['.html'] }).end(html.replace('<body>', `${INJECT}<body>`));
        return;
      } catch { /* fall through */ }
    }
    /* A generated demo asks for its images the way the COMPONENT does —
       `assets/logo-g2.svg`, relative to wherever it is mounted. */
    const asset = path.match(/\/assets\/(.+)$/);
    const tries = [join(DOCS, normalize(path)), join(DIST, normalize(path))];
    if (asset) tries.push(join(DOCS, 'assets', asset[1]), join(DIST, 'assets', asset[1]));
    for (const file of tries) {
      if (!file.startsWith(DOCS) && !file.startsWith(DIST)) continue;
      try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(body);
        return;
      } catch { /* next candidate */ }
    }
    res.writeHead(404, { 'content-type': 'text/plain' }).end(`not found: ${path}`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

/* ── 3. the detector, as it runs inside the page ──────────────────────────── */

const IN_PAGE = `
function classesOf(el) {
  return (el.getAttribute('class') || '').split(/\\s+/).filter(Boolean);
}

/* Display name: the first three classes and a count. A converted component
   wears a dozen Tailwind utilities and printing all of them hides the finding
   inside its own label. */
function elName(el) {
  const cls = classesOf(el);
  const head = cls.slice(0, 3).map((c) => '.' + c).join('');
  return el.tagName.toLowerCase() + head + (cls.length > 3 ? ' +' + (cls.length - 3) : '');
}

/* Key: the tag and its FIRST class only. In this repo that is the semantic name
   — sel-opt, fb-tools-clip, lbl — and everything after it is a Tailwind
   (no backticks in here: this whole probe is a template literal)
   utility. Keying on the full list would invalidate an ACCEPTED entry the day
   someone changes a colour, which is anti-rot firing on the wrong thing. */
function keyOf(el) {
  const cls = classesOf(el);
  return el.tagName.toLowerCase() + (cls.length ? '.' + cls[0] : '');
}

/* Resolved in the page, never hardcoded here: the cap is a token, and a run
   that cannot resolve it must refuse rather than measure against a number this
   file believes. Returns 0 when the tokens did not load. */
function capOf() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--size-container-max)';
  document.body.appendChild(probe);
  const w = probe.getBoundingClientRect().width;
  probe.remove();
  return Math.round(w);
}

/* Paint is what separates a deliberate full-bleed band from a wrapper that
   forgot its cap — and it is what stops the walk going deeper, so the report
   names causes and not their consequences. */
function paints(el) {
  const s = getComputedStyle(el);
  const bg = s.backgroundColor;
  const transparent = bg === 'transparent' || /rgba\\(0, 0, 0, 0\\)/.test(bg);
  return !transparent || s.backgroundImage !== 'none';
}

function demoOf(el) {
  const root = el.closest('[data-demo]');
  return root ? root.getAttribute('data-demo') : '?';
}

function wide(cap) {
  const out = [];
  for (const el of document.querySelectorAll('[data-demo] *')) {
    const w = el.getBoundingClientRect().width;
    if (w <= cap + 0.5) continue;
    if (paints(el)) continue;
    /* An empty spacer that happens to be full width is not content. */
    if (el.children.length === 0 && !el.textContent.trim()) continue;
    /* Outermost per branch. A wrapper with no cap makes every 100%-wide
       descendant wide as well; the one to fix is the ancestor. */
    const p = el.parentElement;
    if (p && p.closest('[data-demo]') && p.getBoundingClientRect().width > cap + 0.5 && !paints(p)) continue;
    out.push({ key: keyOf(el), name: elName(el), elWidth: Math.round(w * 10) / 10,
               parent: p ? elName(p) : '—', demo: demoOf(el) });
  }
  return out;
}

/* The arming check, and it is falsifiable on any machine: plant a painted band
   holding an uncapped wrapper, assert the detector SEES it and names it, then
   remove it and assert the reading returns to what it was. A detector that
   cannot see a fault it was just handed is not evidence about the page. */
function armCheck(cap) {
  const root = document.querySelector('[data-demo]');
  if (!root) return { ok: false, why: 'no [data-demo] root' };
  const before = wide(cap).length;

  const band = document.createElement('div');
  band.style.cssText = 'background:#123456;display:flex;justify-content:center';
  const child = document.createElement('div');
  child.style.cssText = 'width:100%';
  child.textContent = 'armed';
  child.className = '__arm';
  band.appendChild(child);
  root.appendChild(band);

  const during = wide(cap);
  const saw = during.some((f) => f.key.includes('__arm'));

  band.remove();
  const after = wide(cap).length;

  return { ok: saw && after === before, saw, before, during: during.length, after,
           why: !saw ? 'planted fault not seen' : after !== before ? 'reading did not return to baseline' : '' };
}
`;

/* ── 4. browser ───────────────────────────────────────────────────────────── */

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { fail('playwright-core is not installed — run `npm ci`.'); }

const { server, origin } = await startServer();
let browser;
try { browser = await chromium.launch({ channel: 'chrome' }); }
catch (e) { server.close(); fail(`could not launch Google Chrome (channel: 'chrome')\n   ${e.message}`); }

/* ── 4a. self-test ────────────────────────────────────────────────────────── */

if (opts['self-test'] || opts.selfTest) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1000 } });
  const escaped = await installOfflineGuard(context, origin);
  const page = await context.newPage();
  await page.goto(`${origin}/__self-test.html`, { waitUntil: 'networkidle' });
  await page.addScriptTag({ content: IN_PAGE });

  const cap = await page.evaluate(() => capOf());
  const at = async (w) => {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
    return page.evaluate((c) => wide(c), cap);
  };
  const wide1920 = await at(1920);
  const keys1920 = wide1920.map((f) => f.key).join(' ');
  const wide1280 = await at(1280);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  const armed = await page.evaluate((c) => armCheck(c), cap);

  const checks = [
    ['the cap is read from the page, not from this file', cap === 1440, `${cap}px`],
    ['the uncapped wrapper is reported', keys1920.includes('uncapped'), keys1920 || '(nothing)'],
    ['REFUSAL: the capped wrapper beside it is not', !wide1920.some((f) => f.key === 'div.capped'), ''],
    ['REFUSAL: the painted band around them is not', !wide1920.some((f) => f.key === 'div.band'), ''],
    ['a background IMAGE counts as paint too', !wide1920.some((f) => f.key === 'div.art'), ''],
    ['nesting reports the cause once, not every descendant',
      wide1920.filter((f) => f.key === 'div.uncapped').length === 3, `${wide1920.filter((f) => f.key === 'div.uncapped').length} of 3 expected`],
    ['REFUSAL: an empty full-width spacer is not content',
      !wide1920.some((f) => f.key === 'div.spacer') && wide1920.every((f) => f.elWidth > 0), ''],
    ['REFUSAL: nothing at all below the cap', wide1280.length === 0, `${wide1280.length} at 1280`],
    ['the arming plants a fault and sees it', armed.ok, armed.why || `${armed.before}/${armed.during}/${armed.after}`],
    ['nothing left the local origin', escaped.length === 0, escaped.join(', ')],
  ];

  console.log(bold('\n  check-wide.mjs self-test\n'));
  for (const [label, ok, detail] of checks) {
    console.log(`   ${ok ? green('✔') : red('✖')} ${label.padEnd(52)} ${dim(detail)}`);
  }
  await browser.close();
  server.close();
  const bad = checks.filter(([, ok]) => !ok).length;
  console.log(bad ? red(bold(`\n✖  ${bad} of ${checks.length} self-test checks failed\n`))
                  : green(bold(`\n✔  ${checks.length} self-test checks pass\n`)));
  process.exit(bad ? 1 : 0);
}

/* ── 4b. the sweep ────────────────────────────────────────────────────────── */

let pages = readdirSync(join(DIST, 'demos')).filter((f) => f.endsWith('.html')).sort();
if (opts.pages.length) {
  const want = new Set(opts.pages.map((p) => p.replace(/\.html$/, '')));
  const missing = [...want].filter((w) => !pages.includes(`${w}.html`));
  if (missing.length) fail(`no demo for: ${missing.join(', ')}`);
  pages = pages.filter((f) => want.has(basename(f, '.html')));
}

const WIDTHS = opts.widths;
const findings = [];
const rows = [];
let unarmed = 0;

if (!opts.json) {
  console.log(bold(`\n  Wide sweep — ${pages.length} component(s) × ${WIDTHS.join(', ')}\n`));
  console.log(dim(`    ${'component'.padEnd(15)}${WIDTHS.map((w) => String(w).padStart(7)).join('')}   armed`));
}

/* One context for the whole sweep, so the vendored font is fetched once. */
const context = await browser.newContext({ viewport: { width: WIDTHS[WIDTHS.length - 1], height: 1200 } });
const escapes = await installOfflineGuard(context, origin);

for (const file of pages) {
  const name = basename(file, '.html');
  const page = await context.newPage();
  await page.setViewportSize({ width: WIDTHS[WIDTHS.length - 1], height: 1200 });
  await page.goto(`${origin}/demos/${file}`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.addScriptTag({ content: IN_PAGE });
  await page.evaluate(() => document.fonts.ready);

  const cap = await page.evaluate(() => capOf());
  const armed = cap > 0 ? await page.evaluate((c) => armCheck(c), cap) : { ok: false, why: '' };
  const ready = cap > 0 && armed.ok;

  const cells = [];
  for (const w of WIDTHS) {
    if (!ready) { cells.push(null); continue; }
    await page.setViewportSize({ width: w, height: 1200 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
    const found = await page.evaluate((c) => wide(c), cap);
    for (const f of found) findings.push({ page: name, width: w, ...f });
    cells.push(found.length);
  }
  await page.close();

  if (!ready) unarmed++;
  const why = cap === 0 ? 'tokens did not apply — --size-container-max resolves to nothing' : armed.why;
  rows.push({ name, cells, ready, why, cap });

  if (!opts.json) {
    const cellText = cells.map((n) => (n === null ? dim('      —') : n === 0 ? green('      ·') : yellow(String(n).padStart(7)))).join('');
    console.log(`    ${name.padEnd(15)}${cellText}   ${ready ? green('yes') : red('NO — ' + why)}`);
  }
}

await browser.close();
server.close();

/* ── 5. report ────────────────────────────────────────────────────────────── */

/* One row per distinct element: the same wrapper at two widths is one problem. */
const grouped = new Map();
for (const f of findings) {
  const id = `${f.page}|${f.demo}|${f.key}`;
  if (!grouped.has(id)) grouped.set(id, { ...f, widths: [], widest: 0 });
  const g = grouped.get(id);
  g.widths.push(f.width);            // the VIEWPORT it was seen at
  if (f.elWidth > g.widest) g.widest = f.elWidth;
}

const seen = new Set();
const live = [];
for (const g of grouped.values()) {
  const k = `${g.page}|${g.key}`;
  if (ACCEPTED.has(k)) { seen.add(k); g.accepted = ACCEPTED.get(k); }
  else live.push(g);
}

const stale = fullRun ? [...ACCEPTED.keys()].filter((k) => !seen.has(k)) : [];

if (opts.json) {
  console.log(JSON.stringify({ widths: WIDTHS, fullRun, rows, live, accepted: [...seen], stale, escapes }, null, 2));
} else {
  if (live.length) {
    console.log(red(bold(`\n  ${live.length} element(s) still growing past the canvas:\n`)));
    for (const g of live) {
      console.log(`    ${bold(g.page)} ${dim('· ' + g.demo)}  ${g.name}`);
      console.log(dim(`      ${g.widest}px wide inside ${g.parent} — at viewport ${[...new Set(g.widths)].join(', ')}`));
    }
  }
  if (seen.size) {
    console.log(dim(`\n  ${seen.size} accepted and re-confirmed this run:`));
    for (const k of seen) console.log(dim(`    ${k}\n      ${ACCEPTED.get(k)}`));
  }
  if (stale.length) {
    console.log(red(bold(`\n  ${stale.length} ACCEPTED entr(y/ies) never fired — the excuse outlived the thing:\n`)));
    for (const k of stale) console.log(red(`    ${k}`));
  }
  if (escapes.length) console.log(red(`\n  requests left the local origin: ${escapes.join(', ')}`));
  if (unarmed) console.log(red(`\n  ${unarmed} page(s) could not arm the detector — their columns say nothing.`));

  const bad = live.length || stale.length || unarmed || escapes.length;
  console.log(bad
    ? red(bold(`\n✖  ${live.length} finding(s), ${stale.length} stale, ${unarmed} unarmed\n`))
    : green(bold(`\n✔  nothing grows past ${rows[0]?.cap ?? 1440}px that does not paint — ${pages.length} component(s) × ${WIDTHS.length} widths\n`)));
}

process.exit(live.length || stale.length || unarmed || escapes.length ? 1 : 0);
