#!/usr/bin/env node
/**
 * Iron Software Design System — render harness
 *
 * The gap this closes: every other script in scripts/ reads source text. They
 * prove the layers agree with each other, and they are all happy to stay green
 * on a component that renders wrong. FooterBar shipped twice with a grey box
 * behind every logo, a broken image and a pink wordmark where the design says
 * white, with nine gates passing the whole time.
 *
 * This one opens the docs pages in a real browser and looks at the result:
 *
 *   assets    every <img> is drawn onto a canvas and its painted pixels are
 *             counted. `naturalWidth` is not evidence — it reported all 13
 *             FooterBar logos as fine while 7 of them painted nothing.
 *   contrast  every run of text is composited down its real ancestor chain,
 *             opacity groups included, and measured against WCAG AA. This is
 *             the part check:contrast cannot do: it resolves tokens on paper,
 *             so text dimmed to 60% by an `opacity` rule reads as full strength.
 *   measure   getBoundingClientRect for any selector, to diff against the
 *             numbers in a Figma node tree. Impressions find nothing; the seven
 *             gaps found on FooterBar were all numbers.
 *
 * Run:
 *   node scripts/preview.mjs footerbar              audit one component page
 *   node scripts/preview.mjs --all                  audit every component page
 *   node scripts/preview.mjs footerbar --measure '.fb-menu, .fb-menu-item'
 *   node scripts/preview.mjs footerbar --shot /tmp/fb.png --width 1440
 *   node scripts/preview.mjs footerbar --serve      leave it up to poke by hand
 *
 * Options:
 *   --width <px>     viewport width, default 1440 (the Figma desktop canvas)
 *   --dark           add `.dark` to <html> before auditing
 *   --scope <sel>    what to audit; default is the generated demo regions only
 *   --measure <sel>  print box metrics for every match (comma-separated is fine)
 *   --shot <file>    write a full-page screenshot
 *   --assets         run only the asset probe
 *   --contrast       run only the contrast probe
 *   --serve          serve docs/ and print the URL instead of auditing
 *   --json           machine-readable output
 *
 * Exit code is non-zero when an image paints nothing, a request 404s, or a text
 * run misses its AA bar — so this can be wired into CI the day CI has a Chrome.
 * It is deliberately NOT in `npm run check`: that gate set runs anywhere Node
 * runs, and this needs a browser.
 *
 * Needs Google Chrome installed. `chromium.launch({ channel: 'chrome' })` uses
 * it directly; the browsers Playwright downloads into ~/Library/Caches are a
 * different build line and error out against the npm version we pin.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, basename, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/* ── 0. colour pairs that are a decision, not a regression ────────────────── */

/**
 * Keyed on the composited pair, so one entry covers every place it appears.
 *
 * These warn instead of failing. The rule that keeps the list from rotting is
 * the same one `check-contrast.mjs` uses: an entry that never fails anywhere in
 * a run is reported as stale and exits non-zero, so a pair that gets fixed
 * cannot leave its excuse behind.
 *
 * Ball's call, 2026-08-02, on being shown the measurements: these are the brand
 * colours and they stay. The ratios are recorded here so the number is never
 * argued from memory again — and so the next person reads a decision rather
 * than rediscovering a bug.
 */
const KNOWN = new Map([
  [
    '#2693EC on #FFFFFF',
    'Iron Blue 500, the brand link/accent colour. 3.25:1 on white, 2.96:1 on --color-bg-shade. ' +
      'Already recorded on --color-text-link in tokens.css — pair links with an underline so colour is never the only cue.',
  ],
  [
    '#FFFFFF on #2693EC',
    'The same brand blue as a solid fill (.btn--secondary). 3.25:1. No single label colour clears AA across ' +
      'the state chain — white is 3.25/4.47/6.42 and #171717 is 5.52/4.01/2.79 over default/hover/active — ' +
      'so the fill would have to darken to iron-blue-700 to fix it. Kept as the brand secondary.',
  ],
  [
    '#E01A59 on #260F27',
    'Iron Pink 500 on the violet band. 3.78:1 at 18px (the other three product accents are 8.19–10.55). ' +
      'Passes as large text at 30px, where the bar is 3:1. Kept as the brand primary. ' +
      'The same ruling covers the footer ghost CTA on hover, which this probe does not reach because it ' +
      'only measures the resting state: the label goes pink over --ghost-hover and lands at 3.83:1. ' +
      "Ball's call, 2026-08-03 — it is the DS button behaving normally, and the colour is the brand's.",
  ],
]);

/* ── 1. arguments ─────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const opts = { pages: [], width: 1440, scope: null, measure: null, shot: null };
  const takesValue = new Set(['--width', '--scope', '--measure', '--shot']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (takesValue.has(a)) {
      const v = argv[++i];
      if (v === undefined) fail(`${a} needs a value`);
      if (a === '--width') opts.width = Number(v);
      else opts[a.slice(2)] = v;
    } else if (a.startsWith('--') && a.includes('=')) {
      const [k, ...rest] = a.split('=');
      argv.splice(i--, 1, k, rest.join('='));
    } else if (a.startsWith('--')) {
      opts[a.slice(2)] = true;
    } else {
      opts.pages.push(a);
    }
  }
  if (!Number.isFinite(opts.width) || opts.width < 320) fail(`--width ${opts.width} is not a viewport width`);
  return opts;
}

function fail(msg) {
  console.error(red(`\n✖  ${msg}\n`));
  process.exit(1);
}

const opts = parseArgs(process.argv.slice(2));

/**
 * A page argument may be a component name (`footerbar`), a docs file name
 * (`component-footerbar.html`) or a bare docs page (`homepage`). Resolved
 * against docs/ in that order.
 */
function resolvePage(name) {
  const candidates = [name, `${name}.html`, `component-${name}.html`];
  for (const c of candidates) if (existsSync(join(DOCS, c))) return c;
  fail(`no docs page matches "${name}" — tried ${candidates.join(', ')}`);
}

const pages = opts.all
  ? readdirSync(DOCS).filter((f) => f.startsWith('component-') && f.endsWith('.html')).sort()
  : opts.pages.map(resolvePage);

if (!pages.length && !opts.serve && !opts['self-test']) {
  fail('name a docs page, or pass --all\n   e.g. node scripts/preview.mjs footerbar');
}

/* ── 2. serve docs/ over HTTP ─────────────────────────────────────────────── */

/**
 * `file://` is not good enough. Images inside a file:// page are blocked from
 * being read back off a canvas, so every asset silently measures as empty and
 * the probe below reports the opposite of the truth.
 *
 * The assets fallback exists because a generated demo asks for its images the
 * way the COMPONENT does — `/assets/logo-g2.svg`, relative to wherever the
 * component is mounted in a real site — while the docs page lives one level up
 * from docs/assets. Anything ending in /assets/<file> maps back to docs/assets.
 */
/**
 * The fixture behind --self-test. Every row has an answer known before the
 * browser runs, and each one corresponds to an instrument that has already lied
 * in this project ([[feedback-check-your-own-instruments]]): a file that exists
 * on disk but 404s, an image that loads and paints nothing, and a colour pair
 * whose contrast depends on how opacity groups are composited.
 *
 * The opacity row is the sharp one. `.group` is 50% over white with black
 * behind white text, so the browser paints #FFFFFF on #808080 — 3.98:1. The
 * naive model (multiply every alpha by its cumulative opacity and stack the
 * layers flat) says #BFBFBF on #808080 — 1.9:1. Any refactor of the compositor
 * that reintroduces the shortcut fails here instead of shipping.
 */
const SELF_TEST_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>preview.mjs self-test</title></head><body style="background:#fff">
<!-- demo:self-test -->
<div>
  <img id="missing" src="assets/definitely-not-a-real-file.svg" width="40" height="40" alt="missing">
  <img id="blank" width="40" height="40" alt="blank"
    src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' fill='none'/></svg>">
  <img id="real" src="assets/logo-g2.svg" width="40" height="40" alt="real">
  <img id="hidden-blank" style="display:none" width="40" height="40" alt="hidden blank"
    src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' fill='none'/></svg>">
  <img id="hidden-real" style="display:none" src="assets/logo-g2.svg" width="40" height="40" alt="hidden real">
  <p class="failing" style="color:#999999;background:#fff">grey on white, known 2.85:1</p>
  <p class="passing" style="color:#595959;background:#fff">grey on white, known 7.0:1</p>
  <div class="group" style="opacity:0.5;background:#000"><span style="color:#fff">half-opacity group</span></div>
  <label class="disabled" style="opacity:.5"><input type="checkbox" disabled><span>disabled control</span></label>
  <div style="background-image:linear-gradient(#000,#fff)"><span style="color:#888">over a gradient</span></div>
  <div style="opacity:0"><span style="color:#999">invisible, not low contrast</span></div>
  <div style="opacity:0.02"><span style="color:#999">faint but painted, still a finding</span></div>
</div>
<!-- /demo:self-test -->
</body></html>`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

async function startServer() {
  const server = createServer(async (req, res) => {
    // decodeURIComponent, not the raw path: an asset committed with a `%` in
    // its filename is a broken image in the browser but a real file on disk,
    // and serving it raw would hide a bug the browser is right about.
    let path;
    try {
      path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      res.writeHead(400).end('bad escape in URL');
      return;
    }

    if (path === '/__self-test.html') {
      res.writeHead(200, { 'content-type': MIME['.html'] }).end(SELF_TEST_HTML);
      return;
    }

    const tries = [join(DOCS, normalize(path))];
    const asset = path.match(/\/assets\/(.+)$/);
    if (asset) tries.push(join(DOCS, 'assets', asset[1]));

    for (const file of tries) {
      if (!file.startsWith(DOCS)) continue; // no escaping the docs root
      try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
        res.end(body);
        return;
      } catch { /* try the next candidate */ }
    }
    res.writeHead(404, { 'content-type': 'text/plain' }).end(`not found: ${path}`);
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

/* ── 3. the probes, as they run inside the page ───────────────────────────── */

/**
 * Which elements count as "the component". The generated markup sits between
 * `<!-- demo:name -->` sentinels, so the sentinels are the scope — anything
 * else on the page is docs chrome and not this repo's design work. Pairing the
 * comment nodes is exact where a CSS selector would be a guess.
 */
const IN_PAGE_SCOPE = `
function demoRoots(scopeSel) {
  if (scopeSel) return [...document.querySelectorAll(scopeSel)];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
  const roots = [];
  let open = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.data.trim();
    if (/^demo:[a-z0-9-]+$/.test(text)) { open = { name: text.slice(5), node: n, els: [] }; continue; }
    if (open && text === '/demo:' + open.name) {
      for (let s = open.node.nextSibling; s && s !== n; s = s.nextSibling) {
        if (s.nodeType === 1) open.els.push(s);
      }
      roots.push(...open.els.map((el) => ({ region: open.name, el })));
      open = null;
    }
  }
  if (roots.length) return roots.map((r) => Object.assign(r.el, { __region: r.region }));
  return [...document.querySelectorAll('.canvas, .frame')];
}`;

/** Shared colour helpers: parse, composite, luminance, contrast. */
const IN_PAGE_COLOUR = `
function parseColor(s) {
  const m = String(s).match(/rgba?\\(([^)]+)\\)/);
  if (!m) return { rgb: [0, 0, 0], a: 0 };
  const p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number);
  return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
}
/** Source-over: src on top of dst, both straight (non-premultiplied) alpha. */
function over(src, dst) {
  const a = src.a + dst.a * (1 - src.a);
  if (a === 0) return { rgb: [0, 0, 0], a: 0 };
  const rgb = [0, 1, 2].map((i) => (src.rgb[i] * src.a + dst.rgb[i] * dst.a * (1 - src.a)) / a);
  return { rgb, a };
}
function channel(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
function luminance(rgb) { return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]); }
function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
function hex(rgb) {
  return '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function describe(el) {
  const parts = [];
  for (let n = el; n && n.nodeType === 1 && parts.length < 3; n = n.parentElement) {
    const cls = n.classList.length ? '.' + n.classList[0] : '';
    parts.unshift(n.tagName.toLowerCase() + cls);
    if (n.hasAttribute('data-demo') || n.__region) break;
  }
  return parts.join(' > ');
}`;

/**
 * Contrast, composited rather than resolved.
 *
 * The whole reason this exists: a token pair can pass on paper and fail on
 * screen, because `opacity` is applied to a whole subtree at paint time and no
 * amount of reading tokens.css sees it. FooterBar dims two of its rows to 60%
 * and 75%; those are the interesting ones and the only way to check them is to
 * render the stack.
 *
 * The chain is composited the way the browser does it — each element's own
 * opacity applies to its background AND its descendants as one group — by
 * building the stack twice, with and without the glyph layer, and compositing
 * both over the page canvas. Doing it as a flat list of "page-relative alphas"
 * is the tempting shortcut and it is wrong whenever a background and the text
 * over it sit inside the same dimmed group.
 *
 * Not modelled: background-image, gradients and blend modes. Those elements are
 * reported as unmeasured rather than guessed at, except that a background-image
 * over an opaque background-color (the docs canvas grid) uses the colour and
 * says so.
 */
const IN_PAGE_CONTRAST = `
function auditContrast(scopeSel) {
  const roots = demoRoots(scopeSel);
  const results = [];
  const unmeasured = [];
  const exempt = [];
  const seen = new Set();

  // WCAG 1.4.3 exempts inactive controls by name, which matters here because
  // every disabled state in this system is drawn by dimming the whole control
  // to 50% — exactly the thing this probe is built to notice. Without this the
  // report is 100% correct and 0% useful.
  const DISABLED = ':disabled, [disabled], [aria-disabled="true"], .disabled, .is-disabled';

  // The page canvas underneath everything. Chrome propagates <body>'s
  // background up to it, so read the computed value rather than assuming white.
  const canvasColor = (() => {
    for (const el of [document.body, document.documentElement]) {
      const c = parseColor(getComputedStyle(el).backgroundColor);
      if (c.a === 1) return c;
    }
    return { rgb: [255, 255, 255], a: 1 };
  })();

  for (const root of roots) {
    const els = [root, ...root.querySelectorAll('*')];
    for (const el of els) {
      if (seen.has(el)) continue;
      seen.add(el);

      // Only elements that paint text themselves — a wrapper inherits its
      // colour to children and would double-count every string.
      const text = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join(' ')
        .trim();
      if (!text) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;

      const cs = getComputedStyle(el);
      if (cs.visibility !== 'visible' || cs.display === 'none') continue;
      // Screen-reader-only text is clipped to a pixel and never seen.
      if (cs.clipPath !== 'none' && rect.width <= 2) continue;

      // The ancestor chain, outermost first, so the stack can be built in
      // paint order.
      const chain = [];
      for (let n = el; n; n = n.parentElement) chain.unshift(n);

      let hasImage = false;
      for (const n of chain) {
        const s = getComputedStyle(n);
        if (s.backgroundImage !== 'none' && parseColor(s.backgroundColor).a < 1) hasImage = true;
      }

      // content(i, withText) renders chain[i] and everything below it over
      // transparent, including that element's own opacity.
      const content = (i, withText) => {
        const n = chain[i];
        const s = getComputedStyle(n);
        let acc = over(parseColor(s.backgroundColor), { rgb: [0, 0, 0], a: 0 });
        if (i < chain.length - 1) {
          acc = over(content(i + 1, withText), acc);
        } else if (withText) {
          const c = parseColor(s.color);
          acc = over(c, acc);
        }
        acc.a *= Number(s.opacity);
        return acc;
      };

      const fg = over(content(0, true), canvasColor);
      const bg = over(content(0, false), canvasColor);

      // Text rendered at zero alpha is not low-contrast, it is absent — a panel
      // waiting to animate open, a tooltip before it is summoned. Only an exact
      // zero is skipped: at 0.02 it is faint and unreadable, which is a real
      // finding and stays one.
      const cumulativeOpacity = chain.reduce((p, n) => p * Number(getComputedStyle(n).opacity), 1);
      if (cumulativeOpacity === 0 || parseColor(cs.color).a === 0) continue;

      const size = parseFloat(cs.fontSize);
      const weight = Number(cs.fontWeight) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const bar = large ? 3 : 4.5;
      const r = ratio(fg.rgb, bg.rgb);

      const row = {
        where: describe(el),
        text: text.length > 40 ? text.slice(0, 39) + '…' : text,
        fg: hex(fg.rgb),
        bg: hex(bg.rgb),
        ratio: Math.round(r * 100) / 100,
        bar,
        size,
        weight,
        opacity: Math.round(chain.reduce((p, n) => p * Number(getComputedStyle(n).opacity), 1) * 1000) / 1000,
      };
      if (el.closest(DISABLED)) exempt.push(row);
      else if (hasImage) unmeasured.push(row);
      else results.push(row);
    }
  }
  return { results, unmeasured, exempt, canvas: hex(canvasColor.rgb) };
}`;

/**
 * Assets, by painted pixels.
 *
 * `img.naturalWidth` answers "did the file parse", which an SVG referencing a
 * missing symbol or painting outside its viewBox passes with room to spare.
 * Drawing it and counting non-transparent pixels answers "is anything there".
 */
const IN_PAGE_ASSETS = `
async function auditAssets(scopeSel) {
  const roots = demoRoots(scopeSel);
  const imgs = new Set();
  for (const root of roots) {
    if (root.tagName === 'IMG') imgs.add(root);
    for (const i of root.querySelectorAll('img')) imgs.add(i);
  }

  const out = [];
  for (const img of imgs) {
    const rect = img.getBoundingClientRect();
    const row = {
      src: img.getAttribute('src'),
      where: describe(img),
      natural: [img.naturalWidth, img.naturalHeight],
      box: [Math.round(rect.width * 10) / 10, Math.round(rect.height * 10) / 10],
      complete: img.complete,
      painted: null,
      note: null,
    };

    if (!img.complete || !img.naturalWidth) {
      row.note = 'did not load';
      out.push(row);
      continue;
    }

    // An image with no box is usually a hover-state twin sitting behind
    // display:none — hidden, not broken. Silencing those would also silence a
    // hidden image that really is empty, so instead of skipping it, measure it
    // at its natural size. The file still has to paint; only the placement is
    // unverifiable, and the report says so.
    row.hidden = rect.width < 1 || rect.height < 1;

    // Draw at the size it is actually placed at, capped so a hero image does
    // not cost a megapixel scan.
    const w = Math.min(Math.ceil(row.hidden ? img.naturalWidth : rect.width), 160);
    const h = Math.min(Math.ceil(row.hidden ? img.naturalHeight : rect.height), 160);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    try {
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let lit = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 8) lit++;
      row.painted = Math.round((lit / (w * h)) * 1000) / 10;
    } catch (err) {
      row.note = 'canvas read blocked: ' + err.message;
    }
    out.push(row);
  }
  return out;
}`;

const IN_PAGE_MEASURE = `
function measure(sel) {
  return [...document.querySelectorAll(sel)].map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const round = (n) => Math.round(n * 10) / 10;
    return {
      where: describe(el),
      x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height),
      font: parseFloat(cs.fontSize) + '/' + (cs.lineHeight === 'normal' ? 'normal' : parseFloat(cs.lineHeight)),
      weight: cs.fontWeight,
      family: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
      color: cs.color,
      background: cs.backgroundColor,
      padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(parseFloat).join(' '),
      gap: cs.gap === 'normal' ? '—' : cs.gap,
    };
  });
}`;

const PRELUDE = [IN_PAGE_SCOPE, IN_PAGE_COLOUR, IN_PAGE_CONTRAST, IN_PAGE_ASSETS, IN_PAGE_MEASURE].join('\n');

/* ── 4. drive the browser ─────────────────────────────────────────────────── */

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  fail('playwright-core is not installed — run `npm install`');
}

const { server, origin } = await startServer();

if (opts.serve) {
  console.log(`\n  ${bold('docs/')} is served at ${green(origin)}`);
  for (const p of pages) console.log(`    ${origin}/${p}`);
  console.log(dim('\n  Ctrl-C to stop.\n'));
  await new Promise(() => {});
}

let browser;
try {
  browser = await chromium.launch({ channel: 'chrome' });
} catch (err) {
  server.close();
  fail(
    `could not launch Google Chrome — ${err.message.split('\n')[0]}\n` +
      '   This harness uses the installed Chrome on purpose; the browser build\n' +
      '   Playwright downloads does not match the pinned npm version.'
  );
}

/* ── 4a. --self-test: check the instrument before believing a reading ─────── */

if (opts['self-test']) {
  const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const page = await context.newPage();
  await page.goto(`${origin}/__self-test.html`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.addScriptTag({ content: PRELUDE });
  const assets = await page.evaluate(() => auditAssets(null));
  const contrast = await page.evaluate(() => auditContrast(null));
  await browser.close();
  server.close();

  const img = (id) => assets.find((a) => (a.src ?? '').includes(id));
  const run = (cls) => contrast.results.find((r) => r.where.includes(cls));
  const near = (a, b, tol) => Math.abs(a - b) <= tol;

  const blank = assets.find((a) => (a.src ?? '').startsWith('data:') && !a.hidden);
  const hiddenBlank = assets.find((a) => (a.src ?? '').startsWith('data:') && a.hidden);
  const hiddenReal = assets.find((a) => (a.src ?? '').includes('logo-g2') && a.hidden);
  const cases = [
    ['a 404 image is reported as broken', img('definitely-not-a-real-file')?.note === 'did not load'],
    ['a blank SVG loads', blank?.natural?.[0] > 0],
    ['…and is still caught, by painted pixels', blank?.painted === 0],
    ['a real SVG paints pixels', assets.some((a) => (a.src ?? '').includes('logo-g2') && !a.hidden && a.painted > 0)],
    ['a display:none image is not called broken', hiddenReal?.hidden === true && hiddenReal?.painted > 0],
    ['…but a hidden BLANK one still is', hiddenBlank?.hidden === true && hiddenBlank?.painted === 0],
    ['#999999 on white measures 2.85:1', near(run('p.failing')?.ratio ?? 0, 2.85, 0.02)],
    ['…and is reported as failing AA', (run('p.failing')?.ratio ?? 0) < (run('p.failing')?.bar ?? 0)],
    ['#595959 on white passes AA', (run('p.passing')?.ratio ?? 0) >= 4.5],
    ['an opacity group composites as a group, not as flat alphas', run('span')?.fg === '#FFFFFF' && run('span')?.bg === '#808080'],
    ['…giving 3.98:1, where the flat model says 1.9:1', near(contrast.results.find((r) => r.bg === '#808080')?.ratio ?? 0, 3.98, 0.05)],
    ['a disabled control is exempt, not a failure', contrast.exempt.length === 1 && !contrast.results.some((r) => r.text.includes('disabled control'))],
    ['text over a gradient is unmeasured, not guessed', contrast.unmeasured.length === 1],
    ['text at opacity 0 is skipped as absent', !contrast.results.some((r) => r.text.includes('invisible'))],
    ['…but opacity 0.02 is still measured and fails', (contrast.results.find((r) => r.text.includes('faint'))?.ratio ?? 99) < 4.5],
  ];

  let bad = 0;
  console.log(`\n${bold('preview.mjs self-test')}`);
  for (const [name, ok] of cases) {
    if (!ok) bad++;
    console.log(`  ${ok ? green('✔') : red('✖')} ${name}`);
  }
  console.log(bad ? red(`\n✖  ${bad} of ${cases.length} checks failed — the harness itself is wrong\n`) : green(`\n✔  all ${cases.length} checks pass — the probes report what they claim to\n`));
  process.exit(bad ? 1 : 0);
}

const runAssets = opts.assets || !opts.contrast;
const runContrast = opts.contrast || !opts.assets;

const report = [];
let problems = 0;

for (const pageFile of pages) {
  const context = await browser.newContext({ viewport: { width: opts.width, height: 1000 } });
  const page = await context.newPage();

  const badRequests = [];
  page.on('requestfailed', (r) => badRequests.push({ url: r.url(), why: r.failure()?.errorText ?? 'failed' }));
  page.on('response', (r) => {
    if (r.status() >= 400 && new URL(r.url()).origin === origin) badRequests.push({ url: r.url(), why: `HTTP ${r.status()}` });
  });

  await page.goto(`${origin}/${pageFile}`, { waitUntil: 'networkidle' }).catch(() => {});
  if (opts.dark) await page.evaluate(() => document.documentElement.classList.add('dark'));

  // Webfonts are linked from Google, so an offline run silently falls back to a
  // system face and every measurement shifts. Say so rather than measure a lie.
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return { montserrat: document.fonts.check('700 16px Montserrat') };
  });

  await page.addScriptTag({ content: PRELUDE });

  const entry = { page: pageFile, fonts, badRequests, assets: null, contrast: null, measured: null };

  if (runAssets) entry.assets = await page.evaluate((s) => auditAssets(s), opts.scope);
  if (runContrast) entry.contrast = await page.evaluate((s) => auditContrast(s), opts.scope);
  if (opts.measure) entry.measured = await page.evaluate((s) => measure(s), opts.measure);
  if (opts.shot) {
    await page.screenshot({ path: opts.shot, fullPage: true });
    entry.shot = opts.shot;
  }

  report.push(entry);
  await context.close();
}

await browser.close();
server.close();

/* ── 5. report ────────────────────────────────────────────────────────────── */

if (opts.json) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.some(hasProblem) ? 1 : 0);
}

function hasProblem(entry) {
  const brokenImgs = (entry.assets ?? []).filter(isBroken).length;
  const failedText = (entry.contrast?.results ?? []).filter(
    (r) => r.ratio < r.bar && !KNOWN.has(`${r.fg} on ${r.bg}`)
  ).length;
  return brokenImgs + failedText + entry.badRequests.length > 0;
}

/** Every KNOWN pair that actually turned up below its bar during this run. */
const seenKnown = new Set();

const isBroken = (a) => a.note !== null || a.painted === 0;

for (const entry of report) {
  console.log(`\n${bold(entry.page)} ${dim(`at ${opts.width}px${opts.dark ? ' · dark' : ''}`)}`);

  if (!entry.fonts.montserrat) {
    console.log(yellow('  !  Montserrat did not load — text metrics below are a fallback face, not the design.'));
  }

  for (const r of entry.badRequests) {
    problems++;
    console.log(`  ${red('✖')} request ${r.why}: ${r.url.replace(origin, '')}`);
  }

  if (entry.assets) {
    const broken = entry.assets.filter(isBroken);
    for (const a of broken) {
      problems++;
      console.log(`  ${red('✖')} ${a.src} — ${a.note ?? 'painted nothing'} ${dim(`(${a.where}, box ${a.box.join('×')})`)}`);
    }
    const ok = entry.assets.length - broken.length;
    const hidden = entry.assets.filter((a) => a.hidden && !isBroken(a)).length;
    if (entry.assets.length) {
      console.log(
        `  ${broken.length ? yellow('·') : green('✔')} ${ok}/${entry.assets.length} image${entry.assets.length === 1 ? '' : 's'} paint pixels` +
          (hidden ? dim(`; ${hidden} of them hidden at rest, measured at natural size`) : '')
      );
    }
  }

  if (entry.contrast) {
    const { results, unmeasured, exempt } = entry.contrast;
    const below = results.filter((r) => r.ratio < r.bar);
    const failed = below.filter((r) => !KNOWN.has(`${r.fg} on ${r.bg}`));
    const excused = below.filter((r) => KNOWN.has(`${r.fg} on ${r.bg}`));
    for (const r of excused) seenKnown.add(`${r.fg} on ${r.bg}`);

    // One colour pair used in forty places is one decision, not forty findings.
    // Printed ungrouped, a single grey caption style buried every real result
    // on the page under 44 identical lines.
    const groups = new Map();
    for (const r of failed) {
      const key = `${r.where}|${r.fg}|${r.bg}|${r.size}|${r.weight}`;
      if (!groups.has(key)) groups.set(key, { ...r, count: 0 });
      groups.get(key).count++;
    }

    for (const r of [...groups.values()].sort((a, b) => a.ratio - b.ratio)) {
      problems++;
      const opacity = r.opacity < 1 ? dim(` · opacity ${r.opacity}`) : '';
      const times = r.count > 1 ? dim(` ×${r.count}`) : '';
      console.log(
        `  ${red('✖')} ${r.ratio.toFixed(2)}:1 needs ${r.bar} — ${r.fg} on ${r.bg}${opacity}${times}\n` +
          `      ${dim(r.where)}  ${dim(`${r.size}px/${r.weight}`)}  "${r.text}"`
      );
    }
    for (const pair of new Set(excused.map((r) => `${r.fg} on ${r.bg}`))) {
      const worst = Math.min(...excused.filter((r) => `${r.fg} on ${r.bg}` === pair).map((r) => r.ratio));
      console.log(`  ${yellow('!')} ${worst.toFixed(2)}:1 — ${pair} ${dim('· decided, not a regression')}`);
      console.log(dim(`      ${KNOWN.get(pair)}`));
    }
    if (results.length) {
      console.log(
        `  ${failed.length ? yellow('·') : green('✔')} ${results.length - below.length}/${results.length} text run${results.length === 1 ? '' : 's'} meet WCAG AA` +
          (excused.length ? dim(`; ${excused.length} known exemption(s) above`) : '')
      );
    }
    if (exempt.length) {
      console.log(dim(`  ·  ${exempt.length} run(s) exempt — inside a disabled control (WCAG 1.4.3)`));
    }
    if (unmeasured.length) {
      console.log(dim(`  ·  ${unmeasured.length} run(s) skipped — painted over a background image or gradient`));
    }
    if (!results.length && !unmeasured.length && !exempt.length) {
      console.log(dim('  ·  no text runs in scope — the page may declare no demo regions'));
    }
  }

  if (entry.measured) {
    if (!entry.measured.length) {
      console.log(yellow(`  !  --measure "${opts.measure}" matched nothing`));
    } else {
      // Truncate from the LEFT: the element itself is the tail of the path and
      // is the part being measured, so it is the part that must survive.
      const tail = (s, n) => (s.length <= n ? s.padEnd(n) : '…' + s.slice(s.length - n + 1));
      console.log(dim(`\n  ${'element'.padEnd(40)} ${'x'.padStart(7)} ${'y'.padStart(7)} ${'w'.padStart(7)} ${'h'.padStart(7)}  ${'font/weight'.padEnd(18)} padding`));
      for (const m of entry.measured) {
        console.log(
          `  ${tail(m.where, 40)} ${String(m.x).padStart(7)} ${String(m.y).padStart(7)} ` +
            `${String(m.w).padStart(7)} ${String(m.h).padStart(7)}  ${`${m.font}/${m.weight}`.padEnd(18)} ${m.padding}`
        );
      }
    }
  }

  if (entry.shot) console.log(dim(`  ·  screenshot → ${entry.shot}`));
}

// Anti-rot, and the reason this list is safe to have at all: an exemption that
// no longer describes anything is deleted, not left to accumulate. Only checked
// on a full sweep — a single-page run legitimately never sees most of them.
if (opts.all && runContrast && !opts.scope) {
  const stale = [...KNOWN.keys()].filter((k) => !seenKnown.has(k));
  if (stale.length) {
    problems += stale.length;
    console.log(red(`\n✖  ${stale.length} exemption(s) in KNOWN never came up below AA — delete them`));
    for (const k of stale) console.log(`    ${k}`);
  }
}

console.log(
  problems
    ? red(`\n✖  ${problems} problem${problems === 1 ? '' : 's'} in ${pages.length} page${pages.length === 1 ? '' : 's'}\n`)
    : green(`\n✔  ${pages.length} page${pages.length === 1 ? '' : 's'} render clean at ${opts.width}px\n`)
);

process.exit(problems ? 1 : 0);
