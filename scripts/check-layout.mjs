#!/usr/bin/env node
/**
 * Iron Software Design System — docs layout sweep
 *
 * WHY THIS EXISTS, and why `check-overflow.mjs` was not enough.
 *
 * On 2026-08-14 Ball opened four docs pages and found four faults. Three were
 * mine, shipped the day before with `npm run check` green, `overflow` green at
 * 19 components × 9 widths, and `audit` green on 31 pages. Every gate this repo
 * owns was passing and the pages were visibly broken. The reason is structural,
 * not bad luck:
 *
 *   · `check-overflow.mjs` only ever looks inside `[data-demo]` roots on the
 *     nineteen `component-*.html` pages. The FOUNDATION pages — typography,
 *     borders, opacity, spacing, colours — carry the most hand-written markup
 *     in the repo and were swept by nothing.
 *   · `state-diff.mjs` compares against a git ref, so brand-new content has no
 *     previous state to differ from. Everything added yesterday was invisible
 *     to it by construction.
 *   · `preview.mjs --all` judges colour and images, not geometry.
 *
 * So this sweeps every docs page and asserts four things about the boxes. Each
 * is ABSOLUTE — it needs no previous rendering to compare against, which is the
 * whole point, because the faults it exists for arrive with new content.
 *
 *   H-SCROLL   the document is wider than the viewport
 *   OVERLAP    two unrelated in-flow boxes paint on top of each other
 *   ESCAPES    a box sticks out of its container's padding box
 *   WORD       a text run cannot fit its box even broken at every space
 *
 * The four are not interchangeable, and the real faults are why each is here:
 *
 *   OVERLAP — the 1.5px border card on `04-borders.html` had been nested INSIDE
 *   the 1px card by a bad insertion. It rendered 199×241 across two neighbours
 *   instead of 266×165 in the grid. Note what that is NOT: it never left any
 *   container, so nothing about overflow could see it, and the neighbours it
 *   painted over are not its siblings — it is their nephew. A sibling-only
 *   comparison, which is the obvious way to write this, misses the exact fault
 *   that motivated writing it. Unrelated pairs, or it is theatre.
 *
 *   ESCAPES — the component-roles table on `02-typography.html` went to 1028px
 *   inside a 760px box, because `white-space: nowrap` met a cell listing four
 *   token names.
 *
 *   WORD — `--font-size-title-lg` in a 90px cell. This one overflows NOTHING:
 *   the text wraps, the box stays put, `scrollWidth === clientWidth`, and the
 *   page is still wrong. "Not overflowing" is not "fitting", and the difference
 *   is measured here by asking each word for its own width via a Range rather
 *   than by any threshold. A word wider than the content box it sits in had to
 *   be broken mid-token or hung outside; either way nobody chose it — unless
 *   they did, which is what the `overflow-wrap` skip below is for.
 *
 * ARMING. Per CLAUDE.md, a check that cannot fail on the machine that wrote it
 * is not a check. Every page here is armed before it is believed: a token must
 * resolve, the docs font must genuinely render (measured as a differential, so
 * a local Montserrat install cannot answer for the page), and then all four
 * detectors are FAULT-INJECTED into the live page — an overlapping box, an
 * escaping box and an unfittable word are added, each must be SEEN, and each
 * must stop being seen when removed. A page that will not arm exits non-zero
 * instead of reporting the pass it did not earn.
 *
 * Run:        node scripts/check-layout.mjs
 *             node scripts/check-layout.mjs 04-borders --widths 1440
 * Self-test:  node scripts/check-layout.mjs --self-test
 *
 * Needs Google Chrome (`channel: 'chrome'`), same as the other three harnesses,
 * and touches the network never — `installOfflineGuard` fails the run if it is
 * asked to.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

import { serveFonts, useLocalFonts, installOfflineGuard, fontsAvailable, LOCAL_FONT_HREF } from './lib/local-fonts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

function fail(msg) {
  console.error(red(`\n✖  ${msg}\n`));
  process.exit(1);
}

/* ── 0. layouts that are a decision, not a regression ─────────────────────── */

/**
 * Keyed `<page>|<kind>|<element>`, the same shape `check-overflow.mjs` uses and
 * for the same reason: an element's classes survive a copy edit, its text does
 * not.
 *
 * Anti-rot, identical to `preview.mjs`, `check-contrast.mjs` and the overflow
 * sweep: an entry that never fires during a FULL run is reported as stale and
 * exits non-zero. An excuse for a layout that has since been fixed is a lie
 * that gets believed by the next person to read it.
 */
const KNOWN = new Map([
  [
    'homepage.html|overlap|img.avatar',
    'The customer avatar stack. `.avatar-stack .avatar` carries ' +
      '`margin-left: calc(var(--space-micro) * -1)` and a 2px border in the page background colour, ' +
      'which is the whole visual device — faces tucked behind each other with a ring between them. ' +
      'The overlap the sweep measures (4×48px at desktop, 10×40px at 375) is exactly that negative ' +
      'margin plus the two borders, and it is the ONLY overlap on the page that is drawn on purpose. ' +
      'Confirmed by reading the rule, not by assuming: an avatar stack that had genuinely broken ' +
      'would overlap by a different amount than the margin declares.',
  ],
]);

/* ── 1. arguments ─────────────────────────────────────────────────────────── */

/**
 * Four widths, not the overflow sweep's nine. That sweep is hunting a breakpoint
 * set below the width its content needs, which is a narrow-end bug and needs the
 * resolution. These four faults were all at desktop width in hand-written tables
 * and card grids, so this samples both ends and the two the docs CSS actually
 * has breakpoints at. Nine widths × 31 pages would triple the runtime of the
 * `render` job to look twice at the same table.
 */
const DEFAULT_WIDTHS = [375, 768, 1280, 1440];

const argv = process.argv.slice(2);
const SELF_TEST = argv.includes('--self-test');
const takesValue = new Set(['--widths']);
const opts = { widths: DEFAULT_WIDTHS };
const targets = [];

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--self-test') continue;
  if (takesValue.has(a)) {
    const v = argv[++i];
    if (v === undefined) fail(`${a} needs a value.`);
    if (a === '--widths') {
      opts.widths = v.split(',').map((s) => Number(s.trim())).filter(Boolean);
      if (!opts.widths.length) fail('--widths got no usable numbers.');
    }
    continue;
  }
  if (a.startsWith('-')) fail(`unknown option ${a}`);
  targets.push(a);
}

const WIDTHS = opts.widths;

/* ── 2. the pages ─────────────────────────────────────────────────────────── */

/**
 * Every docs page, not a curated list. A curated list is a list someone has to
 * remember to add to, and the pages that broke were pages that had just been
 * written. `readdirSync` cannot forget.
 */
function docsPages() {
  return readdirSync(DOCS).filter((f) => f.endsWith('.html')).sort();
}

const PAGES = targets.length
  ? targets.map((t) => (t.endsWith('.html') ? t : `${t}.html`))
  : docsPages();

if (!SELF_TEST) {
  for (const p of PAGES) {
    if (!existsSync(join(DOCS, p))) fail(`no such docs page: ${p}`);
  }
}

/* The docs body font, read from the pages themselves rather than named here.
   Same majority vote as the overflow sweep, and for the same reason: a constant
   written into this file is a constant nothing checks. */
function readDocsBodyFont() {
  const tally = new Map();
  for (const f of docsPages()) {
    const m = readFileSync(join(DOCS, f), 'utf8').match(/\bbody\s*\{[^}]*?font-family:\s*([^;}]+)/);
    if (m) {
      const stack = m[1].trim().replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ');
      tally.set(stack, (tally.get(stack) ?? 0) + 1);
    }
  }
  if (!tally.size) {
    fail('no `body { font-family }` found on any docs page.\n' +
         '   That rule is what this sweep mirrors; without it there is nothing to match.');
  }
  const [stack, n] = [...tally].sort((a, b) => b[1] - a[1])[0];
  const total = [...tally.values()].reduce((a, b) => a + b, 0);
  if (n !== total) console.log(yellow(`  note: docs pages disagree on the body font — using the majority (${n}/${total}): ${stack}`));
  return stack;
}

const DOCS_BODY_FONT = readDocsBodyFont();
const WANT_FAMILY = DOCS_BODY_FONT.split(',')[0].trim().replace(/^['"]|['"]$/g, '');

/* ── 3. the self-test fixture ─────────────────────────────────────────────── */

/**
 * One fixture, four planted faults and a clean control for each. It is served
 * with the local font link so the arming has a real family to find — a fixture
 * that fails to arm would make every detector below look like it passed for a
 * reason that has nothing to do with the detector.
 *
 * The planted faults are the real ones, reduced:
 *   · `#plant-overlap` is a nephew painting across its uncle, exactly the
 *     borders card. It is NOT a sibling of what it covers — a fixture whose
 *     overlap is sibling-to-sibling would pass against a detector that has the
 *     bug this one is written to rule out.
 *   · `#plant-escape` is a 900px table in a 300px box.
 *   · `#plant-word` is a 90px cell holding one 20-character token name, which
 *     is the typography cell to the character.
 */
const fixture = ({ overlap = false, escape = false, word = false, hscroll = false, font = true } = {}) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>layout self-test</title>
<!-- The real token sheet, over the same server the docs pages are served by.
     A fixture that defines its own tokens would arm on a variable this repo
     does not ship, which is an arming check that cannot fail. -->
<link rel="stylesheet" href="/tokens.css">
<style>
  body { ${font ? `font-family: ${DOCS_BODY_FONT};` : ''} margin: 0; padding: 20px; }
  .grid { display: flex; gap: 20px; align-items: flex-start; }
  .card { width: 200px; border: 1px solid #ccc; padding: 10px; box-sizing: border-box; }
  .box { width: 300px; border: 1px solid #ccc; overflow: visible; }
  table { border-collapse: collapse; }
  td { border: 1px solid #ddd; padding: 4px; }
  .narrow td:first-child { width: 90px; }
  /* The nephew: absolutely sized and pulled left so it lands across the cards
     to its right, while remaining a normal-flow block for the detector. */
  #plant-overlap { width: 380px; height: 120px; background: #fee; margin-right: -200px; }
</style></head><body>

  <!-- clean control: three cards side by side, nothing touching -->
  <div class="grid" id="clean-grid">
    <div class="card">alpha</div>
    <div class="card">beta</div>
    <div class="card">gamma</div>
  </div>

  ${overlap ? `<!-- OVERLAP: the offender lives inside the FIRST card, so what it
       covers is its uncle, not its sibling -->
  <div class="grid" id="fault-overlap">
    <div class="card">one<div id="plant-overlap">nephew</div></div>
    <div class="card">two</div>
    <div class="card">three</div>
  </div>` : ''}

  ${escape ? `<!-- ESCAPES: 900px of table in a 300px box. Narrow enough that it
       does NOT also widen the document — the h-scroll plant below is separate
       on purpose, so neither detector can pass on the other's fault. -->
  <div class="box" id="fault-escape">
    <table id="plant-escape"><tr><td style="width:900px">wide</td></tr></table>
  </div>` : ''}
  <div class="box" id="clean-box">
    <table><tr><td style="width:200px">fits</td></tr></table>
  </div>

  ${word ? `<!-- WORD: one 20-character token name in a 90px cell -->
  <table class="narrow" id="fault-word">
    <tr><td id="plant-word">--font-size-title-lg</td><td>fine</td></tr>
  </table>` : ''}
  <table class="narrow" id="clean-word">
    <tr><td>--sp-md</td><td>fine</td></tr>
  </table>

  ${hscroll ? `<!-- H-SCROLL: a child of <body>, so escapes() skips it (it does not
       measure against the body) and only the document-level detector can see
       it. 2400px is past every width this sweep runs at. -->
  <div id="plant-hscroll" style="width:2400px;height:20px;background:#eee;">wide</div>` : ''}

</body></html>`;

/**
 * The three fixtures the self-test compares. They are the SAME page with the
 * faults switched on and off, not three hand-written documents — a "clean
 * control" that differs from the faulty one in any other way proves nothing
 * about the detector, only about the two documents.
 */
const SELF_TEST_HTML = fixture({ overlap: true, escape: true, word: true, hscroll: true });
const SELF_TEST_CLEAN_HTML = fixture();
/* No font-family at all, so the arming's REFUSAL case is reachable. Without it
   `uses` could only ever be observed true — the unfalsifiable shape that let
   ten components be measured in Times. */
const SELF_TEST_NOFONT_HTML = fixture({ font: false });

/* ── 4. the server ────────────────────────────────────────────────────────── */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json; charset=utf-8',
};

const FIXTURES = {
  '/__self-test.html': () => SELF_TEST_HTML,
  '/__self-test-nofont.html': () => SELF_TEST_NOFONT_HTML,
  '/__self-test-clean.html': () => SELF_TEST_CLEAN_HTML,
};

async function startServer() {
  const server = createServer(async (req, res) => {
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
    catch { res.writeHead(400).end('bad escape in URL'); return; }

    const font = await serveFonts(path);
    if (font) {
      res.writeHead(200, { 'content-type': font.type }).end(font.body);
      return;
    }

    if (FIXTURES[path]) {
      /* useLocalFonts, not a hand-written link: the fixture has to be served
         through the same rewrite the docs pages get, or the self-test would be
         proving something about a page shape that never ships. */
      res.writeHead(200, { 'content-type': MIME['.html'] }).end(useLocalFonts(FIXTURES[path]()));
      return;
    }

    const file = join(DOCS, normalize(path === '/' ? '/index.html' : path));
    if (!file.startsWith(DOCS)) { res.writeHead(403).end('outside docs/'); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(extname(file) === '.html' ? useLocalFonts(body.toString('utf8')) : body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end(`not found: ${path}`);
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

/* ── 5. the probe, as it runs inside the page ─────────────────────────────── */

const IN_PAGE = `
function elName(el) {
  const id = el.id ? '#' + el.id : '';
  const cls = (el.getAttribute('class') || '').split(/\\s+/).filter(Boolean);
  return el.tagName.toLowerCase() + id + cls.map((c) => '.' + c).join('');
}
function elLabel(el) {
  const txt = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 34);
  return elName(el) + (txt ? ' “' + txt + '”' : '');
}

/* Anything under an absolutely positioned subtree is out of normal flow by
   design — tooltips, dropdown panels, the skip link. Overlapping is what they
   are FOR, so measuring them would produce findings nobody would ever act on,
   and a gate whose findings are always dismissed is a gate that gets deleted. */
function outOfFlow(el) {
  for (let p = el; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.position === 'absolute' || cs.position === 'fixed' || cs.position === 'sticky') return true;
    if (cs.float !== 'none') return true;
  }
  return false;
}
/* NOT in the list above: \`transform\`. The first version of this file skipped
   any element carrying one, on the reasoning that a transform is always
   deliberate. That exemption swallowed a live fault the same day — the Tooltip
   Variants bubbles were \`position: relative\` with \`bottom: calc(100% + 10px)\`
   and \`transform: translateX(-50%)\`, and they hung 99px above their cards,
   across the section heading. Every one of them was skipped for carrying the
   transform that was HALF THE BUG.
   A transform being deliberate says nothing about where it lands. What is
   painted is what is measured; anything genuinely intended goes in KNOWN, where
   it has to be written down and defended. */

function insideXScroller(el) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p);
    if (/auto|scroll/.test(o.overflowX)) return true;
  }
  return false;
}

function clipped(el) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p);
    /* Both axes, to match the two-axis test in escapes(). A parent that clips
       vertically hides a vertical escape just as completely. */
    if (/hidden|clip|auto|scroll/.test(o.overflowX + ' ' + o.overflowY + ' ' + o.overflow)) return true;
  }
  return false;
}

/* A box worth comparing: laid out as a block-ish thing, in flow, with real
   size. Inline runs are excluded deliberately — two inline boxes on the same
   line legitimately share space, and including them turns every paragraph into
   a finding. */
function boxes() {
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (!/^(block|flex|grid|list-item|table|flow-root|table-row|table-cell)/.test(cs.display)) continue;
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
    if (outOfFlow(el)) continue;
    if (insideXScroller(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    /* The index is the element's identity for REPORTING. Its class list is not:
       a docs page has thirty <td class="token"> and grouping the findings by
       name folded thirty different cells into one line that printed "375" thirty
       times. KNOWN still keys on the name, which survives an edit; the display
       keys on this, which is unique within a render. */
    out.push({ el, r, i: out.length });
  }
  return out;
}

function related(a, b) {
  return a === b || a.contains(b) || b.contains(a);
}

/* Two boxes paint on each other. Both axes must genuinely intersect by more
   than a pixel: adjacent cards share an edge coordinate constantly, and a
   half-pixel from a fractional layout is not an overlap anyone can see. */
function overlaps(candidates) {
  const out = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const A = candidates[i], B = candidates[j];
      if (related(A.el, B.el)) continue;
      const dx = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left);
      const dy = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
      /* Two pixels, not one. A text box's rect comes from the font's ascent and
         descent, not from its line-height, so a label centred inside a 12px bar
         reports 13px and "overlaps" its neighbour by a pixel that no one can
         see. The threshold keeps a refusal case in every direction — the faults
         this detector was written for missed by 94px, 40px and 22px, and the
         gap label above still failed at 4px before it was fixed. */
      if (dx <= 2 || dy <= 2) continue;
      out.push({
        kind: 'overlap',
        uid: 'o' + A.i + '-' + B.i,
        el: elName(A.el),
        label: elLabel(A.el),
        other: elLabel(B.el),
        by: Math.round(dx) + '×' + Math.round(dy) + 'px',
        amount: Math.round(dx * dy),
      });
    }
  }
  return out;
}

/* A box sticking out of its container's PADDING box. Same rule the overflow
   sweep uses, and for the same reason: a hanging indent lives in the parent's
   padding on purpose and is not a fault. */
function escapes(candidates) {
  const out = [];
  for (const { el, r, i } of candidates) {
    const parent = el.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) continue;
    if (clipped(el)) continue;
    const pcs = getComputedStyle(parent);
    const pr = parent.getBoundingClientRect();
    if (pr.width < 2) continue;
    const left = pr.left + (parseFloat(pcs.borderLeftWidth) || 0);
    const right = pr.right - (parseFloat(pcs.borderRightWidth) || 0);
    const top = pr.top + (parseFloat(pcs.borderTopWidth) || 0);
    const bottom = pr.bottom - (parseFloat(pcs.borderBottomWidth) || 0);

    /* BOTH axes. The x-only version of this missed the Tooltip bubbles
       completely: they were the right width and 99px too high. Vertical escape
       is the rarer half in a document that scrolls downward, which is exactly
       why nothing else in this repo would ever have reported it. */
    const dx = Math.max(r.right - right, left - r.left);
    const dy = Math.max(r.bottom - bottom, top - r.top);
    const by = Math.max(dx, dy);
    if (by > 0.5) {
      out.push({
        kind: 'escapes',
        uid: 'e' + i,
        el: elName(el),
        label: elLabel(el),
        other: elLabel(parent) + (dy > dx ? ' (vertically)' : ''),
        by: Math.round(by) + 'px',
        amount: Math.round(by),
      });
    }
  }
  return out;
}

/* The widest single word in an element, measured with a Range so it is the
   browser's own shaping and not an estimate. Only direct text children count —
   asking a container for its words would attribute a descendant's long token to
   an ancestor that never had to fit it. */
function widestWord(el) {
  let widest = 0, word = '';
  for (const node of el.childNodes) {
    if (node.nodeType !== 3) continue;
    const text = node.textContent;
    const re = /\\S+/g;
    let m;
    while ((m = re.exec(text))) {
      const range = document.createRange();
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const rects = range.getClientRects();
      /* A word already broken across lines reports several rects; its unbroken
         width is the sum, which is exactly the number we need — the width it
         WOULD have wanted. */
      let w = 0;
      for (const r of rects) w += r.width;
      if (w > widest) { widest = w; word = m[0]; }
      range.detach();
    }
  }
  return { width: widest, word };
}

/* A text run that cannot fit its own content box even broken at every space.
   Deliberately skipped when the author has said breaking mid-word is fine
   (\`overflow-wrap\`/\`word-break\`), when the box scrolls, or when the text is
   allowed to spill (\`white-space: nowrap\` is caught by escapes() instead, as
   a box that overflows, which is a truer description of what it does). */
function unfittableWords(candidates) {
  const out = [];
  for (const { el, r, i } of candidates) {
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    const cs = getComputedStyle(el);
    if (/break-word|anywhere|break-all/.test(cs.overflowWrap + ' ' + cs.wordBreak)) continue;
    if (/nowrap|pre$/.test(cs.whiteSpace)) continue;
    if (insideXScroller(el)) continue;
    /* An author who wrote \`text-overflow: ellipsis\` has already answered this
       detector's question: they know the text may not fit and have chosen to
       cut it VISIBLY. That is the opposite of the silent clip this exists to
       find — FileUpload truncates a long filename to an ellipsis on purpose,
       and reporting it would be reporting a feature. */
    if (cs.textOverflow === 'ellipsis') continue;
    /* clientWidth, NOT getBoundingClientRect().width minus the computed border.
       Under \`border-collapse: collapse\` a cell's border is shared with its
       neighbour, so subtracting the full computed width takes a pixel off each
       side that the cell never actually gave up — the content box read ~2px
       narrower than it is, and every table cell whose text exactly fills it
       became a finding. The docs are full of collapsed tables, so that is not
       an edge case, it is most of the population. clientWidth is the browser's
       own padding box and gets the collapsed case right.

       It is integer-rounded, which is what the half-pixel below absorbs. That
       tolerance still has a refusal case: the fault this detector exists for
       missed by 51px, and anything a reader would call "does not fit" misses by
       more than a rounding. */
    const inner = el.clientWidth
      - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    if (inner < 2) continue;
    const { width, word } = widestWord(el);
    if (width > inner + 0.5) {
      out.push({
        kind: 'word',
        uid: 'w' + i,
        el: elName(el),
        label: elLabel(el),
        other: '“' + word + '” needs ' + Math.round(width) + 'px',
        by: Math.round(width - inner) + 'px',
        amount: Math.round(width - inner),
      });
    }
  }
  return out;
}

function hScroll() {
  const doc = document.documentElement;
  const by = doc.scrollWidth - doc.clientWidth;
  if (by <= 1) return [];
  /* Which element reaches furthest right. Without this the finding is "the page
     is 40px too wide" and the next person has to bisect the DOM by hand. */
  let worst = null, worstRight = -Infinity;
  const limit = doc.clientWidth;
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.right > worstRight) { worstRight = r.right; worst = el; }
  }
  return [{
    kind: 'hscroll',
    uid: 'h',
    el: worst ? elName(worst) : 'document',
    label: worst ? elLabel(worst) : 'document',
    other: 'reaches ' + Math.round(worstRight) + 'px in a ' + limit + 'px viewport',
    by: by + 'px',
    amount: by,
  }];
}

function findings() {
  const candidates = boxes();
  return {
    counted: candidates.length,
    found: [].concat(hScroll(), overlaps(candidates), escapes(candidates), unfittableWords(candidates)),
  };
}

/* ── arming ──────────────────────────────────────────────────────────────── */

function assertStyled() {
  const token = getComputedStyle(document.documentElement).getPropertyValue('--spacing-md').trim();
  return { token, boxes: boxes().length };
}

/* Same differential the overflow sweep uses: the family in a pair against a
   generic, twice. A local install cannot make this say yes about a page that
   does not use the family, and a missing @font-face cannot be hidden by one
   generic agreeing by coincidence. */
async function familyAvailable(family) {
  const S = 'MWmw@1il0Oo handgloves 0123456789';
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
  const w = { mono: mk('monospace'), monoF: mk(q + ',monospace'), serif: mk('serif'), serifF: mk(q + ',serif') };
  return { ok: w.monoF !== w.mono && w.serifF !== w.serif, w };
}

async function assertFont(want) {
  const seen = new Set();
  for (const el of document.body.querySelectorAll('*')) {
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    seen.add(getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, ''));
  }
  const avail = await familyAvailable(want);
  /* Proves the availability probe discriminates at all: a detector that reports
     "present" for a family that cannot exist is reporting nothing. */
  const fake = await familyAvailable('__no_such_family_' + Math.random().toString(36).slice(2));
  return {
    families: [...seen].sort(),
    uses: seen.has(want),
    available: avail.ok,
    discriminates: !fake.ok,
    widths: avail.w,
  };
}

/**
 * The part that makes the numbers above worth reading. Three faults are added
 * to the LIVE page — not to a fixture — each must be seen, and the page must go
 * back to its original finding count when they are removed.
 *
 * The overlap plant is a nephew, deliberately: it is appended inside an
 * existing box and sized to cross that box's siblings. If the detector only
 * compared siblings this would go unseen, and that is the single most likely
 * way for this file to rot into something that always passes.
 */
function armDetectors() {
  const before = findings().found.length;
  const PLANT = '__layout-plant';

  const mk = (css, text) => {
    const d = document.createElement('div');
    d.className = PLANT;
    d.style.cssText = css;
    if (text) d.textContent = text;
    return d;
  };

  /* Every plant is appended to <body> and is COMPLETE IN ITSELF, carrying the
     neighbour it is supposed to cross rather than borrowing one from the page.
     The first version of this borrowed: it found the biggest in-flow block and
     hung a wide box off it. On the self-test fixture that worked, and on every
     real docs page it armed nothing — the block it picked was full-width, so
     there was nothing beside it to overlap, and a clipping ancestor made the
     escape plant unmeasurable by the very rule that makes escapes() correct.
     Both readings would have been "this page cannot be armed", which is at
     least honest, but it would have made the gate unrunnable rather than wrong.
     Appending to <body> also puts the plants outside every clipping ancestor
     the page has, so the arming tests the DETECTOR and not the page's CSS. */
  const run = (node, kind) => {
    document.body.appendChild(node);
    const saw = findings().found.some((f) => f.kind === kind && f.el.includes(PLANT));
    node.remove();
    return saw;
  };

  /* OVERLAP: uncle/nephew, not siblings. 'a' holds a child three times its own
     width; 'b' sits beside it in the flex row, so the child crosses 'b' — an
     element it is not related to. If this detector ever regresses to comparing
     siblings only, this is the plant that stops going green. */
  const overlapWrap = mk('display:flex;gap:20px;width:640px;height:120px;');
  const a = mk('width:200px;height:100px;');
  a.appendChild(mk('width:400px;height:60px;background:#f00;'));
  const b = mk('width:200px;height:100px;background:#00f;');
  overlapWrap.append(a, b);
  const sawOverlap = run(overlapWrap, 'overlap');

  /* ESCAPES: 600px of child in a 200px parent that does not clip. */
  const escWrap = mk('width:200px;height:40px;');
  escWrap.appendChild(mk('width:600px;height:24px;background:#0f0;'));
  const sawEscape = run(escWrap, 'escapes');

  /* WORD: one 60-character token in a 40px box that is allowed to wrap and
     still cannot, because there is no space in it to wrap at. */
  const sawWord = run(
    mk('width:40px;overflow-wrap:normal;word-break:normal;white-space:normal;font-size:16px;', '--' + 'x'.repeat(60)),
    'word',
  );

  const after = findings().found.length;
  return {
    armed: sawOverlap && sawEscape && sawWord && after === before,
    sawOverlap, sawEscape, sawWord,
    clearsDown: after === before,
    before, after,
  };
}
`;

/* ── 6. one page at one width ─────────────────────────────────────────────── */

async function sweepPage(context, origin, url, width, { arm = true } = {}) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 1200 });
  const failures = [];
  page.on('pageerror', (e) => failures.push(String(e)));
  await page.goto(`${origin}${url}`, { waitUntil: 'load' });
  /* Fonts settle before anything is measured. Every detector here is a width
     comparison, and a width measured against a fallback face is a number about
     a page nobody will ever see. */
  await page.evaluate(() => document.fonts.ready);
  await page.addScriptTag({ content: IN_PAGE });

  const styled = await page.evaluate(() => assertStyled());
  const font = await page.evaluate((w) => assertFont(w), WANT_FAMILY);
  const armed = arm ? await page.evaluate(() => armDetectors()) : { armed: true, skipped: true };
  const out = await page.evaluate(() => findings());

  await page.close();
  return { styled, font, armed, ...out, pageErrors: failures };
}

/* ── 7. self-test ─────────────────────────────────────────────────────────── */

async function selfTest(context, origin) {
  const rows = [];
  const faulty = await sweepPage(context, origin, '/__self-test.html', 1000);
  const clean = await sweepPage(context, origin, '/__self-test-clean.html', 1000);
  const nofont = await sweepPage(context, origin, '/__self-test-nofont.html', 1000, { arm: false });

  const kinds = (r) => new Set(r.found.map((f) => f.kind));
  const fk = kinds(faulty), ck = kinds(clean);

  /* Each detector, twice: it SEES the planted fault, and it does NOT see one in
     the control. Only the pair distinguishes a detector from a rubber stamp. */
  rows.push(['overlap: the planted nephew is seen', fk.has('overlap')]);
  rows.push(['overlap: the clean fixture has none', !ck.has('overlap')]);
  rows.push(['escapes: the 900px table in a 300px box is seen', fk.has('escapes')]);
  rows.push(['escapes: the clean fixture has none', !ck.has('escapes')]);
  rows.push(['word: the 20-char token in a 90px cell is seen', fk.has('word')]);
  rows.push(['word: the clean fixture has none', !ck.has('word')]);

  /* The overlap finding must name a pair that is NOT sibling-to-sibling, which
     is the specific bug this detector was written to avoid having. */
  const ov = faulty.found.find((f) => f.kind === 'overlap');
  rows.push(['overlap: the pair found is uncle/nephew, not siblings',
    !!ov && /plant-overlap/.test(ov.label + ov.other)]);

  rows.push(['hscroll: the 2400px block past the viewport is seen', fk.has('hscroll')]);
  rows.push(['hscroll: the clean fixture has none', !ck.has('hscroll')]);

  rows.push(['the fixture is served with a local font link', useLocalFonts(SELF_TEST_HTML).includes(LOCAL_FONT_HREF)]);
  rows.push(['arming: a token resolves on the fixture', faulty.styled.token !== '']);
  rows.push(['arming: boxes() finds something to measure', faulty.styled.boxes > 0]);
  rows.push([`arming: the docs family (${WANT_FAMILY}) renders`, faulty.font.available]);
  rows.push(['arming: the family probe can say no', faulty.font.discriminates]);
  rows.push(['arming: the fixture text USES the docs family', faulty.font.uses]);
  /* The refusal case. Without a fixture that has no font-family, "uses" could
     only ever be observed true — the exact unfalsifiable shape that let ten
     components be measured in Times. */
  rows.push(['arming: a fixture with NO font rule is refused', !nofont.font.uses]);
  rows.push(['arming: all three detectors were fault-injected and seen', faulty.armed.armed === true]);
  rows.push(['arming: the injected faults clear back down', faulty.armed.clearsDown === true]);
  rows.push(['no page errors on the fixture', faulty.pageErrors.length === 0]);

  const bad = rows.filter(([, ok]) => !ok);
  console.log(`\n${bold('layout self-test')}  ${dim(`${rows.length} checks`)}\n`);
  for (const [what, ok] of rows) console.log(`  ${ok ? green('✔') : red('✖')}  ${what}`);
  if (bad.length) {
    console.log(red(`\n✖  ${bad.length}/${rows.length} failed — the sweep's readings mean nothing until these pass.\n`));
    /* Full findings, not just their kinds. A self-test that fails and then
       prints too little to diagnose itself sends you back to the browser by
       hand, which is where all four of these faults came from. */
    const show = (f) => `${f.kind} ${f.label} — ${f.other} (by ${f.by})`;
    console.log(dim(`  faulty fixture:\n${faulty.found.map((f) => '    ' + show(f)).join('\n')}`));
    console.log(dim(`  clean fixture:\n${clean.found.map((f) => '    ' + show(f)).join('\n') || '    (none)'}`));
    console.log(dim(`  arming: ${JSON.stringify(faulty.armed)}`));
    console.log(dim(`  font:   ${JSON.stringify(faulty.font.widths)}\n`));
    return false;
  }
  console.log(green(`\n✔  ${rows.length}/${rows.length} — every detector was shown a fault and shown a clean control.\n`));
  return true;
}

/* ── 8. run ───────────────────────────────────────────────────────────────── */

if (!fontsAvailable()) {
  fail('vendor/fonts is missing or incomplete.\n' +
       `   Run ${bold('npm run vendor:fonts')}. This sweep measures text and refuses to guess at it.`);
}

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { fail('playwright-core is not installed. Run `npm ci` at the repo root.'); }

const { server, origin } = await startServer();

let browser;
try {
  browser = await chromium.launch({ channel: 'chrome' });
} catch (e) {
  server.close();
  fail(`could not launch Chrome (channel: 'chrome').\n   ${e.message.split('\n')[0]}`);
}

const context = await browser.newContext({ viewport: { width: WIDTHS[WIDTHS.length - 1], height: 1200 } });
const escaped = await installOfflineGuard(context, origin);

let ok = true;
try {
  if (SELF_TEST) {
    ok = await selfTest(context, origin);
  } else {
    const started = Date.now();
    const hits = [];
    const fired = new Set();
    let armFailures = 0, measured = 0, boxesSeen = 0;

    for (const file of PAGES) {
      const perPage = [];
      for (const width of WIDTHS) {
        const r = await sweepPage(context, origin, `/${file}`, width);
        measured++;
        boxesSeen += r.counted;

        if (!r.styled.token || !r.font.available || !r.font.discriminates || !r.font.uses || !r.armed.armed) {
          armFailures++;
          console.log(red(`  ✖  ${file} @ ${width}px did not arm`) +
            dim(` — token:${r.styled.token || '<none>'} usesFont:${r.font.uses} fontAvail:${r.font.available} ` +
                `discriminates:${r.font.discriminates} armed:${JSON.stringify(r.armed)}`));
          continue;
        }

        for (const f of r.found) {
          const key = `${file}|${f.kind}|${f.el}`;
          if (KNOWN.has(key)) { fired.add(key); continue; }
          perPage.push({ ...f, width, key, group: `${f.kind}|${f.uid}` });
        }
      }
      if (perPage.length) {
        hits.push([file, perPage]);
        console.log(`\n  ${red('✖')} ${bold(file)}`);
        /* Collapsed by element: the same broken card reports at all four widths
           and printing it four times buries the second fault below the fold. */
        const byKey = new Map();
        for (const f of perPage) {
          const g = byKey.get(f.group) ?? { ...f, widths: [] };
          g.widths.push(f.width);
          if (f.amount > g.amount) { g.by = f.by; g.amount = f.amount; g.other = f.other; }
          byKey.set(f.group, g);
        }
        for (const f of byKey.values()) {
          const tag = { hscroll: 'H-SCROLL', overlap: 'OVERLAP ', escapes: 'ESCAPES ', word: 'WORD    ' }[f.kind];
          console.log(`     ${yellow(tag)} ${f.label}`);
          console.log(`              ${dim(f.kind === 'overlap' ? 'across ' : f.kind === 'escapes' ? 'out of ' : '')}${f.other}`);
          console.log(`              ${dim(`by ${f.by} at ${f.widths.join(', ')}px`)}`);
        }
      } else {
        console.log(`  ${green('✔')} ${file}`);
      }
    }

    const secs = ((Date.now() - started) / 1000).toFixed(0);
    console.log(dim(`\n  ${measured} renders, ${boxesSeen.toLocaleString()} boxes measured, ${secs}s`));

    /* Anti-rot, and only on a full run: a KNOWN entry that never fired is an
       excuse for something that is no longer happening. */
    const fullRun = !targets.length && WIDTHS.length === DEFAULT_WIDTHS.length;
    const stale = fullRun ? [...KNOWN.keys()].filter((k) => !fired.has(k)) : [];

    if (armFailures) {
      console.log(red(`\n✖  ${armFailures} render(s) refused to arm. Nothing above them is a reading.\n`));
      ok = false;
    }
    if (stale.length) {
      console.log(red(`\n✖  ${stale.length} KNOWN entr${stale.length === 1 ? 'y' : 'ies'} never fired:`));
      for (const k of stale) console.log(`     ${k}`);
      console.log(dim('   Delete it, or find out why the layout it excuses stopped happening.\n'));
      ok = false;
    }
    if (hits.length) {
      const n = hits.reduce((a, [, f]) => a + f.length, 0);
      console.log(red(`\n✖  ${n} layout fault(s) on ${hits.length} page(s).\n`));
      ok = false;
    } else if (ok) {
      console.log(green(`\n✔  ${PAGES.length} pages × ${WIDTHS.length} widths — nothing overlaps, escapes, or fails to fit.\n`));
    }
  }
} finally {
  if (escaped?.length) {
    console.log(red(`\n✖  ${escaped.length} request(s) left the offline guard:`));
    for (const u of escaped.slice(0, 10)) console.log(`     ${u}`);
    ok = false;
  }
  await browser.close();
  server.close();
}

process.exit(ok ? 0 : 1);
