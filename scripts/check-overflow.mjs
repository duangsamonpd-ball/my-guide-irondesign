#!/usr/bin/env node
/**
 * Iron Software Design System — per-element overflow sweep
 *
 * The gap this closes. Every responsive bug found in this system has been the
 * same one: a media query that hides, stacks or reflows content sits at a round
 * number, while the width its content actually stops fitting at is a measured
 * number higher up. Between the two is a band where the content is still on
 * screen and already too wide. Six of them have been fixed — Footer at 641–952
 * (`3a0198a`), TopNav at 721–944 and 1101–1259 (`deb78df`), FooterBar at
 * 1024–1252, 1024–1179 and 1024–1059 (`1cc5efd`) — and every one shipped past
 * the whole gate set.
 *
 * They survive because of how they fail. The tell is `flex: 1 0 0;
 * min-width: 0`: flex takes a child BELOW its own content before it lets it
 * stick out, so the symptom is text drawn on top of text, or a card sliding
 * under its neighbour, which reads as a rendering fault rather than a layout
 * one. Where an ancestor is `overflow: hidden` it is worse — the excess is cut
 * with no scrollbar, and `document.scrollWidth` stays clean the whole time.
 * That is why the check has to be per element. A per-document one sees nothing.
 *
 *   node scripts/check-overflow.mjs                     every component
 *   node scripts/check-overflow.mjs topnav footerbar    just these
 *   node scripts/check-overflow.mjs --widths 1024,1152  just these widths
 *   node scripts/check-overflow.mjs --json
 *   node scripts/check-overflow.mjs --self-test         prove the classifier
 *
 * Exit code is non-zero when anything leaves its box. It runs in CI as of
 * 2026-08-12, in the `render` job — that job already installs and builds the
 * playground this reads, and ubuntu-latest ships the Chrome `channel: 'chrome'`
 * resolves to. It stays out of `npm run check`, which is kept runnable anywhere
 * Node runs, as `preview.mjs` and `state-diff.mjs` are.
 *
 * FIVE THINGS IT HAS TO DO THAT THE OBVIOUS VERSION GETS WRONG. Every one of
 * them produced a confident, wrong answer first.
 *
 *  1. THE PAGE HAS TO BE STYLED, AND IT HAS TO PROVE IT.
 *     `playground/dist/demos/*.html` carries only Astro's scoped CSS — no
 *     Tailwind utilities, no tokens — so the converted components render
 *     unstyled there and every reading is of a different page than the one that
 *     ships. Worse, the readings still move with width, so a "does it respond to
 *     the page" self-test passes cleanly. What caught it was an internal
 *     contradiction: a container reporting 1424px wide under a max-width of
 *     1280. Hence `assertStyled` below, which refuses to measure until a token
 *     resolves and a utility has computed through.
 *
 *  2. THE FAULT INJECTION HAS TO BE UNFITTABLE BY CONSTRUCTION.
 *     A 300px widener pushed into a wrapping flex row simply wraps. It fits, so
 *     the detector correctly sees nothing — and "0 overflows seen" then reads as
 *     a blind detector. The widener here is 4000px, which nothing can absorb.
 *
 *  3. THE PADDING BOX IS THE BOUNDARY, NOT THE CONTENT BOX.
 *     Footer's product rows use a -26px hanging indent that lives in the
 *     parent's padding on purpose. Against a content box that is a finding;
 *     against a padding box it is what it is, a design detail.
 *
 *  4. LEAVING A BOX IS NOT ALWAYS A BUG, AND CUT IS NOT THE SAME AS SPILLS.
 *     Absolute positioning, a transform, and a parent that scrolls on x are all
 *     legitimate ways to sit outside a parent, and are skipped. What is left is
 *     split by whether an ancestor actually clips: CUT is the silent kind that
 *     hid the Footer and FooterBar bugs, SPILLS is at least visible.
 *
 *  5. THE FONT HAS TO BE THE ONE THAT SHIPS, AND THE CHECK FOR IT HAS TO BE
 *     ABLE TO FAIL WHERE IT WAS WRITTEN.
 *     This armed itself with `document.fonts.check('700 16px Montserrat')` until
 *     2026-08-12. On a machine with Montserrat installed that is true for every
 *     page whatever it renders, so the condition could not fail here; the first
 *     Linux run split the pages 9/10 purely on which ones draw bold text, since
 *     Chrome fetches only the faces a page uses. Behind it, INJECT was missing
 *     the `body { font-family }` every docs page carries, so ten components were
 *     measured in the UA default — Montserrat is 20–26% WIDER, meaning the sweep
 *     under-read text by a fifth in the direction that hides overflow. The stack
 *     is now read out of the docs pages and `assertFont` checks what the page
 *     actually renders in, against two fixtures: one it must refuse, one it must
 *     accept.
 *
 * The one systematic false positive left is a deliberate negative margin, which
 * any per-element check reads as an overflow. Those live in KNOWN below, and an
 * entry that never fires fails the run, so the list cannot rot.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize, basename } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const DIST = join(ROOT, 'playground/dist');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/* ── 0. overflows that are a decision, not a regression ───────────────────── */

/**
 * Keyed on `<page>|<tag><classes>`, which is stable in a way the element's text
 * is not.
 *
 * Same anti-rot rule as `preview.mjs` and `check-contrast.mjs`: an entry that
 * never fires anywhere in a run is reported as stale and exits non-zero, so a
 * negative margin that gets removed cannot leave its excuse behind.
 */
const KNOWN = new Map([
  [
    'footerbar|button.fb-menu-link.fb-tools-trigger',
    'A deliberate `margin: 0 calc(var(--spacing-xs) * -1)` in the footer-md layout, so the open ' +
      'Free-tools tab does not paint tight against its neighbour once the menu wraps and the links ' +
      'lose their padding. It leaves the <li> by exactly that 8px and nothing clips it. ' +
      'Confirmed present on HEAD by stashing 1cc5efd and re-running, so it is not a regression.',
  ],
]);

/* ── 1. arguments ─────────────────────────────────────────────────────────── */

const DEFAULT_WIDTHS = [320, 375, 414, 768, 900, 1024, 1152, 1280, 1440];

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
  if (opts.widths.some((w) => !Number.isFinite(w) || w < 240)) fail(`--widths must be viewport widths, got ${opts.widths.join(',')}`);
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

/* The KNOWN list's anti-rot rule only means anything on a run that could have
   fired every entry. On a filtered run an entry is silent because its page or
   its width was not asked for, which is not the same as the overflow being
   gone — and failing on it would make `check-overflow.mjs badge` exit 1 while
   reporting nothing wrong. */
const fullRun = opts.pages.length === 0 && opts.widths === DEFAULT_WIDTHS;

if (!existsSync(join(DIST, 'demos'))) {
  fail('playground/dist/demos is missing — run `npm --prefix playground run build` first.\n' +
       '   This reads the built demos, not the .astro sources, because the question is what a browser does.');
}

/* ── 2. the page under test ───────────────────────────────────────────────── */

/**
 * The body font stack read OUT of the docs pages rather than restated here, so
 * the harness cannot drift from the page it is standing in for. Every component
 * page carries the same one-line rule; a majority vote across all of them means
 * one hand-edited page cannot quietly move the sweep's measurements, and a stack
 * that cannot be found at all stops the run instead of measuring the wrong font.
 */
function readDocsBodyFont() {
  const tally = new Map();
  for (const f of readdirSync(DOCS).filter((f) => f.startsWith('component-') && f.endsWith('.html'))) {
    const m = readFileSync(join(DOCS, f), 'utf8').match(/\bbody\s*\{[^}]*?font-family:\s*([^;}]+)/);
    /* Normalised before the vote: two pages spell the same stack
       `'Montserrat',sans-serif` and the rest `'Montserrat', sans-serif`, which
       is a formatting difference and not a disagreement. Comparing raw strings
       reported 17/19 and would have cried wolf on every run. */
    if (m) {
      const stack = m[1].trim().replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ');
      tally.set(stack, (tally.get(stack) ?? 0) + 1);
    }
  }
  if (!tally.size) fail('no `body { font-family }` found on any docs/component-*.html page.\n' +
                        '   That rule is what the sweep mirrors; without it there is nothing to match.');
  const [stack, n] = [...tally].sort((a, b) => b[1] - a[1])[0];
  const total = [...tally.values()].reduce((a, b) => a + b, 0);
  if (n !== total) {
    console.log(yellow(`  note: docs pages disagree on the body font — using the majority (${n}/${total}): ${stack}`));
  }
  return stack;
}
const DOCS_BODY_FONT = readDocsBodyFont();

/* The first family in that stack, unquoted — the one every demo text run is
   expected to actually render in. */
const WANT_FAMILY = DOCS_BODY_FONT.split(',')[0].trim().replace(/^['"]|['"]$/g, '');

/* Families a demo may render in besides the docs body stack. Deliberately a
   short allow-list rather than a "not the UA default" test: what the default
   resolves to is platform-specific (Times here, something else on the runner),
   so naming what IS wanted travels and naming what is not does not. */
const ALLOWED_FAMILIES = [WANT_FAMILY, 'Roboto Mono'];

/**
 * The built demo, plus the stylesheets a docs page loads. The demo's own
 * <link> to Astro's scoped CSS is left alone — both are needed, because eight
 * components still ship scoped CSS and eleven are utilities only.
 *
 * docs.css contributes exactly one rule, its global reset. The rest of it is
 * page chrome, and the docs page's fixed-width preview frame is the specific
 * thing a width sweep must not measure inside.
 */
const FONT_LINK =
  '<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=Roboto+Mono:wght@400&display=swap" rel="stylesheet">';

const INJECT =
  FONT_LINK +
  '<link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/utilities.css">' +
  '<style>* { margin: 0; padding: 0; box-sizing: border-box; }</style>' +
  /* The line every docs page carries and this harness did not. Without it any
     demo text with no font class of its own inherits the UA default instead —
     measured 2026-08-12 as Times on ten of nineteen components, and Montserrat
     is 20–26% wider than that, so the sweep was under-measuring text by a fifth
     in the direction that hides overflow. Kept byte-identical to the docs
     pages' own rule; assertFont() below is what stops it silently going away. */
  `<style>body { font-family: ${DOCS_BODY_FONT}; }</style>`;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json',
};

/**
 * The fixture behind --self-test. Every row has an answer known before the
 * browser runs, and each one is a way this classifier could be wrong rather
 * than merely broken — the difference between a probe that fails loudly and one
 * that reports the opposite of the truth.
 */
const SELF_TEST_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>check-overflow.mjs self-test</title>
<style>
  /* The same custom property assertStyled looks for on a real page: the fixture
     has to satisfy the styled-page guard the way a demo does, or the guard is
     not the one being tested. */
  :root { --spacing-md: 16px; }
  .box { width: 200px; }
</style></head><body>
<div data-demo="self-test">
  <div id="cut" class="box" style="overflow:hidden"><div><div id="cut-child" style="width:320px">clipped by an ancestor</div></div></div>
  <div id="spill" class="box"><div id="spill-child" style="width:320px">leaves the box, nothing clips it</div></div>
  <div id="hang" class="box" style="padding-left:26px"><div id="hang-child" style="margin-left:-26px">hanging indent, inside the padding</div></div>
  <div id="scroll" class="box" style="overflow-x:auto"><div id="scroll-child" style="width:320px">wider, but the parent scrolls</div></div>
  <div id="abs" class="box" style="position:relative"><div id="abs-child" style="position:absolute;left:400px;width:100px">absolutely placed outside</div></div>
  <div id="tf" class="box"><div id="tf-child" style="transform:translateX(400px);width:100px">moved by a transform</div></div>
  <div id="ok" class="box"><div id="ok-child" style="width:100px">fits</div></div>
</div>
</body></html>`;

async function startServer() {
  const server = createServer(async (req, res) => {
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
    catch { res.writeHead(400).end('bad escape in URL'); return; }

    /* Two spellings of the same fixture. The bare one has no font-family at all,
       so its text falls to the UA default exactly as the demo pages did before
       2026-08-12 — that is the state assertFont has to REFUSE. The -font one
       adds the docs rule and nothing else, and is the state it has to accept.
       One fixture could only ever show one of the two answers. */
    if (path === '/__self-test.html' || path === '/__self-test-font.html') {
      /* The webfont link comes with it: on a machine with no local Montserrat
         the family has to arrive over the network or the "accept" case would
         fail for a reason that has nothing to do with the check. */
      const html = path === '/__self-test-font.html'
        ? SELF_TEST_HTML.replace('</head>', `${FONT_LINK}<style>body { font-family: ${DOCS_BODY_FONT}; }</style></head>`)
        : SELF_TEST_HTML;
      res.writeHead(200, { 'content-type': MIME['.html'] }).end(html);
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
       `assets/logo-g2.svg`, relative to wherever it is mounted — so anything
       ending in /assets/<file> maps back to whichever root has it. */
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

/* ── 3. the probe, as it runs inside the page ─────────────────────────────── */

const IN_PAGE = `
function elName(el) {
  const cls = (el.getAttribute('class') || '').split(/\\s+/).filter(Boolean);
  return el.tagName.toLowerCase() + cls.map((c) => '.' + c).join('');
}
function elLabel(el) {
  const txt = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 34);
  return elName(el) + (txt ? ' “' + txt + '”' : '');
}

/* The nearest ancestor that actually clips. Its presence is the whole
   difference between a bug someone can see and one nothing reveals. */
function clippingAncestor(el, stopAt) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p);
    if (/hidden|clip/.test(o.overflowX) || /hidden|clip/.test(o.overflow)) return elLabel(p);
    if (p === stopAt) break;
  }
  return null;
}

function insideXScroller(el) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(p).overflowX)) return true;
  }
  return false;
}

function overflows() {
  const out = [];
  for (const root of document.querySelectorAll('[data-demo]')) {
    for (const el of root.querySelectorAll('*')) {
      const parent = el.parentElement;
      if (!parent || !root.contains(parent)) continue;
      const cs = getComputedStyle(el);
      if (cs.position === 'absolute' || cs.position === 'fixed') continue;
      if (cs.transform !== 'none') continue;
      if (insideXScroller(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;

      /* The PADDING box, not the content box: a hanging indent lives in the
         parent's padding on purpose and is not an overflow. */
      const pcs = getComputedStyle(parent);
      const pr = parent.getBoundingClientRect();
      const left = pr.left + (parseFloat(pcs.borderLeftWidth) || 0);
      const right = pr.right - (parseFloat(pcs.borderRightWidth) || 0);
      const by = Math.max(r.right - right, left - r.left);
      if (by > 0.5) {
        out.push({
          demo: root.getAttribute('data-demo'),
          el: elLabel(el), key: elName(el), parent: elLabel(parent),
          by: Math.round(by * 100) / 100,
          cut: clippingAncestor(el, root),
          nowrap: cs.whiteSpace === 'nowrap',
        });
      }
    }
  }
  out.sort((a, b) => b.by - a.by);
  return out;
}

/* Refuses to measure an unstyled page. A token that does not resolve and a
   utility that never computed both read as "no overflow", which is the most
   expensive wrong answer this can give. */
function assertStyled() {
  const rootStyle = getComputedStyle(document.documentElement);
  const token = rootStyle.getPropertyValue('--spacing-md').trim();
  const demo = document.querySelector('[data-demo]');
  return { token, roots: document.querySelectorAll('[data-demo]').length, hasDemo: !!demo };
}

/* Is a family REALLY there, or is the browser quietly substituting? Measured as
   a differential, never as an absolute: the same string in "<family>, monospace"
   against plain "monospace", and again against serif. If the family is missing
   both pairs come out identical, and one generic agreeing by coincidence cannot
   carry the vote. 64px so a one-pixel rounding cannot decide it. */
async function familyAvailable(family) {
  const S = 'MWmw@1il0Oo handgloves 0123456789';
  /* Ask for exactly the face AND the characters about to be measured, and wait.
     Without this the probe carries the same bug it exists to catch: it names a
     weight of its own, and a page that renders no text at that weight never
     causes the face to be fetched, so the span measures a fallback and the
     family reads as missing. Passing S as the second argument also pins the
     unicode subset, since Google Fonts splits each weight into several.
     A family with no @font-face at all resolves here with an empty list, which
     is the answer the differential below then reports correctly. */
  try { await document.fonts.load('400 64px "' + family + '"', S); } catch (e) { /* absent */ }
  const mk = (ff) => {
    const s = document.createElement('span');
    s.style.cssText = 'position:absolute;left:-9999px;top:-9999px;white-space:pre;font-size:64px;font-weight:400;font-family:' + ff;
    s.textContent = S;
    document.body.appendChild(s);
    const w = s.getBoundingClientRect().width;
    s.remove();
    return w;
  };
  const q = '"' + family + '"';
  /* The widths travel with the verdict: when this fails on a machine nobody can
     open, "not rendering" is a claim and these four numbers are the evidence. */
  const w = { mono: mk('monospace'), monoF: mk(q + ',monospace'), serif: mk('serif'), serifF: mk(q + ',serif') };
  return { ok: w.monoF !== w.mono && w.serifF !== w.serif, w };
}

/* The check that replaced document.fonts.check('700 16px Montserrat').
   That one asked whether a 700-weight face existed ANYWHERE — a question the
   local Montserrat install answers "yes" to on a designer's Mac without the page
   using it, and which ten of nineteen demo pages answer "no" to on a clean
   machine purely because they render no bold text. It could not fail here and
   fired for the wrong reason there.

   This asks the question that actually matters instead: does the text in the
   demo resolve to a family we chose, and is that family genuinely rendering?
   Both halves are falsifiable — see the two self-test fixtures. */
async function assertFont(want, allowed) {
  const seen = new Set();
  for (const root of document.querySelectorAll('[data-demo]')) {
    for (const el of root.querySelectorAll('*')) {
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!hasText) continue;
      /* Judge the same population overflows() measures. An <option> carries text
         and computes to the UA's Arial, but it is painted by the platform inside
         the native popup and has no box in the page — overflows() skips it for
         having no size, so holding the font check to a stricter population than
         the thing it is arming would refuse a page over text nobody can see. */
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const first = getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
      seen.add(first);
    }
  }
  const families = [...seen].sort();
  const unexpected = families.filter((f) => !allowed.includes(f));
  const avail = await familyAvailable(want);
  /* Proves the availability probe discriminates at all. A detector that says
     "present" for a family that cannot exist is saying "present" about nothing. */
  const fake = await familyAvailable('__no_such_family_' + Math.random().toString(36).slice(2));
  const available = avail.ok, discriminates = !fake.ok;
  return { ok: families.length > 0 && unexpected.length === 0 && available && discriminates,
           families, unexpected, available, discriminates, widths: avail.w };
}

/* The injected widener has to be unfittable by construction — see note 2 in the
   header. 4000px cannot be wrapped, shrunk or absorbed by anything here.
   Judged on the WORST overflow, never on the count: widening an element that
   already clips a child makes the child fit, so one finding leaves as another
   arrives and a count-based check reads a working detector as a blind one. That
   is not hypothetical — it is what the fixture below does. */
function armCheck() {
  const root = document.querySelector('[data-demo]');
  if (!root) return { ok: false, why: 'no [data-demo] root' };
  const victim = root.querySelector('*');
  if (!victim) return { ok: false, why: 'demo root is empty' };
  const worst = (list) => list.reduce((m, f) => Math.max(m, f.by), 0);
  const before = worst(overflows());
  const prev = victim.getAttribute('style') || '';
  victim.setAttribute('style', prev + ';min-width:4000px');
  const during = worst(overflows());
  victim.setAttribute('style', prev);
  const after = worst(overflows());
  /* 1000 is far past anything a real layout produces and far under the 4000
     injected, so it cannot be met by accident or missed by rounding. */
  return { ok: during > 1000 && after === before, before, during, after };
}
`;

/* ── 4. drive the browser ─────────────────────────────────────────────────── */

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  fail('playwright-core is not installed — run `npm install`');
}

const { server, origin } = await startServer();

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

/* ── 4a. --self-test: check the classifier before believing a reading ─────── */

if (opts['self-test']) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto(`${origin}/__self-test.html`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.addScriptTag({ content: IN_PAGE });
  const found = await page.evaluate(() => overflows());
  const armed = await page.evaluate(() => armCheck());
  const styled = await page.evaluate(() => assertStyled());
  /* This fixture has no font-family, so its text is in the UA default — the
     exact state that went unnoticed for as long as the check asked whether a
     face existed rather than what the page rendered. */
  const fontOff = await page.evaluate(async ([w, a]) => {
    await document.fonts.ready; return await assertFont(w, a);
  }, [WANT_FAMILY, ALLOWED_FAMILIES]);

  const fontPage = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await fontPage.goto(`${origin}/__self-test-font.html`, { waitUntil: 'networkidle' }).catch(() => {});
  await fontPage.addScriptTag({ content: IN_PAGE });
  const fontOn = await fontPage.evaluate(async ([w, a]) => {
    await document.fonts.ready; return await assertFont(w, a);
  }, [WANT_FAMILY, ALLOWED_FAMILIES]);

  await browser.close();
  server.close();

  /* The fixture's ids sit on the parents, so each row is matched on the child's
     own text — which is written to say what the answer should be. */
  const row = (text) => found.find((f) => f.el.includes(text));

  const cases = [
    ['an element clipped by an ancestor is found', !!row('clipped by an ancestor')],
    ['…and classified CUT, not SPILLS', row('clipped by an ancestor')?.cut != null],
    ['an element that leaves its box visibly is found', !!row('leaves the box')],
    ['…and classified SPILLS, not CUT', row('leaves the box')?.cut == null],
    ['a hanging indent inside the parent padding is NOT a finding', !row('hanging indent')],
    ['a child of an x-scrolling parent is NOT a finding', !row('the parent scrolls')],
    ['an absolutely placed child is NOT a finding', !row('absolutely placed')],
    ['a transformed child is NOT a finding', !row('moved by a transform')],
    ['an element that fits is NOT a finding', !row('fits')],
    ['exactly two findings, no more', found.length === 2],
    ['the 320px overflow measures 120px against a 200px box', Math.abs((row('leaves the box')?.by ?? 0) - 120) < 0.5],
    ['the arming check sees an unfittable widener', armed.ok === true],
    ['…judged on the worst overflow, which a count would have missed here', armed.during > 1000],
    ['…and the page returns to baseline when it is removed', armed.after === armed.before],
    ['assertStyled reads a resolved token', styled.token !== ''],
    ['assertStyled counts the demo roots', styled.roots === 1],
    [`assertFont REFUSES a page whose text is not in ${WANT_FAMILY}`, fontOff.ok === false],
    ['…naming the family it actually fell back to', fontOff.unexpected.length > 0],
    [`assertFont accepts the same page once ${WANT_FAMILY} is applied`, fontOn.ok === true],
    ['…having found text to judge, not an empty page', fontOn.families.length > 0],
    [`${WANT_FAMILY} is really rendering, measured not assumed`, fontOn.available === true],
    ['the family probe calls a nonexistent family absent', fontOn.discriminates === true],
    ['the body font stack was read out of the docs pages', /\S/.test(DOCS_BODY_FONT)],
  ];

  let bad = 0;
  console.log(`\n${bold('check-overflow.mjs self-test')}`);
  for (const [name, ok] of cases) {
    if (!ok) bad++;
    console.log(`  ${ok ? green('✔') : red('✖')} ${name}`);
  }
  console.log(bad
    ? red(`\n✖  ${bad} of ${cases.length} checks failed — the harness itself is wrong\n`)
    : green(`\n✔  all ${cases.length} checks pass — the classifier reports what it claims to\n`));
  process.exit(bad ? 1 : 0);
}

/* ── 4b. the sweep ────────────────────────────────────────────────────────── */

let pages = readdirSync(join(DIST, 'demos')).filter((f) => f.endsWith('.html')).sort();
if (opts.pages.length) {
  const want = new Set(opts.pages.map((p) => p.replace(/\.html$/, '')));
  const missing = [...want].filter((w) => !pages.includes(`${w}.html`));
  if (missing.length) fail(`no demo for: ${missing.join(', ')}\n   have: ${pages.map((p) => basename(p, '.html')).join(', ')}`);
  pages = pages.filter((f) => want.has(basename(f, '.html')));
}

const WIDTHS = opts.widths;
const findings = [];
const rows = [];
let unarmed = 0;

if (!opts.json) {
  console.log(bold(`\n  Overflow sweep — ${pages.length} component(s) × ${WIDTHS.length} widths\n`));
  console.log(dim(`    ${'component'.padEnd(15)}${WIDTHS.map((w) => String(w).padStart(6)).join('')}   armed`));
}

/* ONE context for the whole sweep, so all 19 pages share an HTTP cache and the
   webfont is fetched once instead of nineteen times. browser.newPage() makes a
   fresh isolated context each call, which on the runner meant nineteen
   independent trips to fonts.googleapis.com — and on 2026-08-12 two of them came
   back empty, a different two than the run before. The measurements are
   viewport-only and share no state, so one context is safe as well as faster. */
const context = await browser.newContext({ viewport: { width: WIDTHS[WIDTHS.length - 1], height: 1200 } });

for (const file of pages) {
  const name = basename(file, '.html');
  const page = await context.newPage();
  await page.setViewportSize({ width: WIDTHS[WIDTHS.length - 1], height: 1200 });
  await page.goto(`${origin}/demos/${file}`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.addScriptTag({ content: IN_PAGE });

  const readFont = () => page.evaluate(async ([want, allowed]) => {
    await document.fonts.ready;
    return await assertFont(want, allowed);
  }, [WANT_FAMILY, ALLOWED_FAMILIES]);

  let font = await readFont();
  /* One retry, and only for the network-shaped failure. A webfont that did not
     arrive is a transport problem and says nothing about the layout; a page
     whose text resolves to the wrong FAMILY is a real finding and is not
     retried, because reloading cannot change a stylesheet that never named the
     font. Reloading also warms the shared cache above for the pages after it. */
  if (!font.available && font.discriminates) {
    await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
    await page.addScriptTag({ content: IN_PAGE });
    font = await readFont();
  }
  const styled = await page.evaluate(() => assertStyled());
  const armed = await page.evaluate(() => armCheck());
  const ready = font.ok && styled.token !== '' && styled.roots > 0 && armed.ok;

  const cells = [];
  for (const w of WIDTHS) {
    if (!ready) { cells.push(null); continue; }
    await page.setViewportSize({ width: w, height: 1200 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
    const found = await page.evaluate(() => overflows());
    for (const f of found) findings.push({ page: name, width: w, ...f });
    cells.push(found.length);
  }
  await page.close();

  if (!ready) unarmed++;
  const why = !font.discriminates ? 'the font probe cannot tell a real family from a fake one'
    : !font.available ? `${WANT_FAMILY} is not rendering (mono ${font.widths.monoF}/${font.widths.mono}, serif ${font.widths.serifF}/${font.widths.serif})`
    : font.families.length === 0 ? 'no text inside [data-demo] to check'
    : font.unexpected.length ? `text fell back to ${font.unexpected.join(', ')}`
    : styled.token === '' ? 'tokens did not apply'
    : styled.roots === 0 ? 'no [data-demo] root'
    : `detector blind (${armed.before}/${armed.during}/${armed.after})`;
  rows.push({ name, cells, ready, why });

  if (!opts.json) {
    const cellText = cells.map((n) => (n === null ? dim('     —') : n === 0 ? green('     ·') : red(String(n).padStart(6)))).join('');
    console.log(`    ${name.padEnd(15)}${cellText}   ${ready ? green('yes') : red('NO — ' + why)}`);
  }
}

await browser.close();
server.close();

/* ── 5. report ────────────────────────────────────────────────────────────── */

/* One row per distinct element, carrying every width it fails at. The same
   element at nine widths is one problem, not nine. */
const grouped = new Map();
for (const f of findings) {
  const id = `${f.page}|${f.demo}|${f.key}|${f.parent}`;
  if (!grouped.has(id)) grouped.set(id, { ...f, widths: [], worst: 0 });
  const g = grouped.get(id);
  g.widths.push(f.width);
  if (f.by > g.worst) g.worst = f.by;
}

const seenKnown = new Set();
const live = [];
for (const g of grouped.values()) {
  const k = `${g.page}|${g.key}`;
  if (KNOWN.has(k)) { seenKnown.add(k); g.known = KNOWN.get(k); }
  else live.push(g);
}
live.sort((a, b) => (a.cut === b.cut ? b.worst - a.worst : a.cut ? -1 : 1));
const cut = live.filter((r) => r.cut);
const spills = live.filter((r) => !r.cut);
const stale = fullRun ? [...KNOWN.keys()].filter((k) => !seenKnown.has(k)) : [];

if (opts.json) {
  console.log(JSON.stringify({ widths: WIDTHS, fullRun, rows, cut, spills, known: [...seenKnown], stale }, null, 2));
} else {
  const show = (list, heading, colour) => {
    if (!list.length) return;
    console.log(colour(bold(`\n  ${heading}\n`)));
    for (const r of list) {
      console.log(`    ${bold(r.page)} ${dim('/ demo=' + r.demo)}  ${red(r.worst + 'px')} at ${r.widths.join(', ')}`);
      console.log(`      ${r.el}`);
      console.log(dim(`      out of ${r.parent}`));
      if (r.cut) console.log(dim(`      cut by ${r.cut}`));
      if (r.nowrap) console.log(dim('      white-space: nowrap — it cannot shrink, so it leaves'));
      console.log('');
    }
  };
  show(cut, 'CUT — an ancestor clips this, so there is no scrollbar to show for it', red);
  show(spills, 'SPILLS — leaves the box but nothing clips it; visible, not silent', yellow);

  if (seenKnown.size) {
    console.log(dim(`\n  ${seenKnown.size} known and accepted:`));
    for (const k of seenKnown) console.log(dim(`    ${k}\n      ${KNOWN.get(k)}`));
  }
  if (stale.length) {
    console.log(yellow(`\n  ${stale.length} KNOWN entry(ies) never fired — the excuse outlived the overflow:`));
    for (const k of stale) console.log(yellow(`    ${k}`));
  }
  if (unarmed) console.log(red(`\n  ${unarmed} page(s) reported nothing because the probe could not be armed — that is not a pass.`));

  console.log(
    cut.length || spills.length || stale.length || unarmed
      ? red(bold(`\n✖  ${cut.length} cut, ${spills.length} spilling across ${pages.length} component(s)\n`))
      : green(bold(`\n✔  nothing leaves its box — ${pages.length} component(s) × ${WIDTHS.length} widths\n`))
  );
}

process.exit(cut.length || spills.length || stale.length || unarmed ? 1 : 0);
