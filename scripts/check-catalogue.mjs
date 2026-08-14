/**
 * check:catalogue — the docs pages that RESTATE a token value must still agree
 * with tokens.css.
 *
 * Why this exists. Two pages are the reference a consumer actually reads —
 * `docs/08-semantic-guide.html` and `docs/semantic-colors.html` — and between
 * them they write out roughly 150 colour values by hand. Nothing looked at any
 * of them. `check:vars` only asks whether a page's own CSS resolves the
 * variables it uses; `check:tokens` only compares the three token layers to each
 * other. A hex typed into a table cell was outside every gate.
 *
 * On the day this was written the guide was wrong in seven places, including
 * two rows documenting `--color-button-black` and `--color-button-black-hover`,
 * which had not existed since the button tokens were restructured. Four dark
 * values had moved and the tables never followed.
 *
 * Deliberately a CHECKER, not a generator. These tables carry hand-picked
 * presentation — each role badge chooses its own text colour against its own
 * fill — and regenerating them would rewrite a hand-built page to fix a typo.
 * This is the same trade `check:parity` makes for component CSS.
 *
 *   node scripts/check-catalogue.mjs
 *   node scripts/check-catalogue.mjs --self-test   prove each parser can fail
 *
 * Every parser carries a FLOOR. A parser that silently matches nothing reports a
 * clean page, which is exactly the failure that let this drift in the first
 * place, so falling under the floor is an error and not a warning.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELF_TEST = process.argv.includes('--self-test');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/* ── the source of truth ──────────────────────────────────────────────────── */

const tokensCss = readFileSync(join(ROOT, 'tailwind/tokens.css'), 'utf8');
const darkAt = tokensCss.search(/^\s*\.dark\s*\{/m);
if (darkAt < 0) throw new Error('tokens.css has no `.dark {` block — the dark scope cannot be read');
/**
 * theme.css is a fallback, not a peer. Some names the docs quote exist only
 * after generation — `--radius-*` and `--tracking-*` are `--rounded-*` and
 * `--letter-spacing-*` renamed by build-theme.mjs — and a resolver that read
 * tokens.css alone reported them as "not a token", which is indistinguishable
 * from a real finding.
 */
const themeCss = readFileSync(join(ROOT, 'tailwind/theme.css'), 'utf8');
const SCOPE = { light: tokensCss.slice(0, darkAt), dark: tokensCss.slice(darkAt) };

const declared = (scope, name) => {
  const re = new RegExp(`^\\s*${name.replace(/[-]/g, '\\-')}:\\s*([^;]+?)\\s*;`, 'm');
  const m = scope.match(re) ?? themeCss.match(re);
  return m ? m[1] : null;
};

/** Follow var() chains to whatever the property finally holds, units and all. */
function raw(name, mode = 'light') {
  let v = declared(SCOPE[mode], name) ?? declared(SCOPE.light, name);
  for (let i = 0; i < 10; i++) {
    const m = /^var\((--[a-z0-9-]+)\)$/.exec((v ?? '').trim());
    if (!m) break;
    v = declared(SCOPE[mode], m[1]) ?? declared(SCOPE.light, m[1]);
  }
  return v == null ? null : v.trim();
}

/** Resolve a custom property to a hex. Null when it is not one — a length, or absent. */
function resolve(name, mode = 'light') {
  const v = (raw(name, mode) ?? '').toUpperCase();
  return /^#[0-9A-F]{6}$/.test(v) ? v : null;
}

/* ── findings ─────────────────────────────────────────────────────────────── */

const problems = [];
const counts = {};

const record = (page, kind, detail) => problems.push({ page, kind, detail });

/**
 * Compare one restated value. A token the page names but tokens.css does not
 * declare is its own failure — that is how the two `button-black` rows survived.
 */
function expect(page, kind, token, mode, stated, where) {
  const want = resolve(token, mode);
  if (want === null) {
    record(page, kind, `${where}: names \`${token}\`, which tokens.css does not declare`);
    return;
  }
  if (want !== stated.toUpperCase()) {
    record(page, kind, `${where}: says ${stated.toUpperCase()} for \`${token}\` (${mode}) — tokens.css has ${want}`);
  }
}

/** Every component docs page, in a stable order. */
const componentPages = () =>
  readdirSync(join(ROOT, 'docs'))
    .filter((f) => f.startsWith('component-') && f.endsWith('.html'))
    .sort()
    .map((f) => `docs/${f}`);

/* ── parsers ──────────────────────────────────────────────────────────────── */

/**
 * Each entry: a name, the floor it must clear, and a function that walks one
 * page's source. Floors are set below the counts observed when this was written
 * so ordinary editing does not trip them, while deleting a whole shape does.
 */
const PARSERS = [
  {
    name: 'guide/two-mode rows',
    page: 'docs/08-semantic-guide.html',
    floor: 25,
    run(page, src) {
      const re =
        /<tr>\s*<td><span class="role-badge"[^>]*>([^<]+)<\/span><\/td>\s*<td class="td-light">.*?>(#[0-9A-Fa-f]{6})\s*<span[^>]*>([^<]*)<\/span>.*?<\/td>\s*<td class="td-dark">.*?>(#[0-9A-Fa-f]{6})\s*<span[^>]*>([^<]*)<\/span>.*?<\/td>\s*<td><span class="token-pill css"[^>]*>(--[a-z0-9-]+)<\/span><\/td>/gs;
      let n = 0;
      for (const m of src.matchAll(re)) {
        const [, role, lHex, lRamp, dHex, dRamp, token] = m;
        const at = `row "${role.trim()}"`;
        expect(page, this.name, token, 'light', lHex, at);
        expect(page, this.name, token, 'dark', dHex, at);
        // the ramp NAME beside each swatch has to be the ramp that holds it
        for (const [ramp, hex, mode] of [
          [lRamp, lHex, 'light'],
          [dRamp, dHex, 'dark'],
        ]) {
          const key = rampVar(ramp);
          if (!key) continue;
          const v = resolve(key, 'light');
          if (v === null) record(page, this.name, `${at}: cites ramp \`${ramp.trim()}\` (${mode}), which is not a token`);
          else if (v !== hex.toUpperCase())
            record(page, this.name, `${at}: labels ${hex.toUpperCase()} as \`${ramp.trim()}\` (${mode}), but that ramp is ${v}`);
        }
        n++;
      }
      return n;
    },
  },
  {
    name: 'guide/single-value rows',
    page: 'docs/08-semantic-guide.html',
    floor: 8,
    run(page, src) {
      const re =
        /<tr>\s*<td><span class="role-badge"[^>]*>([^<]+)<\/span><\/td>\s*<td><div class="color-dot"><div class="dot" style="background:(#[0-9A-Fa-f]{6});"><\/div>(#[0-9A-Fa-f]{6})<\/div><\/td>\s*<td><span class="token-pill">([a-z0-9-]+)<\/span><\/td>\s*<td><span class="token-pill css"[^>]*>(--[a-z0-9-]+)<\/span><\/td>/gs;
      let n = 0;
      for (const m of src.matchAll(re)) {
        const [, role, swatch, hex, ramp, token] = m;
        const at = `row "${role.trim()}"`;
        if (swatch.toUpperCase() !== hex.toUpperCase())
          record(page, this.name, `${at}: swatch is ${swatch.toUpperCase()} but the label reads ${hex.toUpperCase()}`);
        expect(page, this.name, token, 'light', hex, at);
        const key = rampVar(ramp);
        const v = key && resolve(key, 'light');
        if (key && v === null) record(page, this.name, `${at}: cites ramp \`${ramp}\`, which is not a token`);
        else if (v && v !== hex.toUpperCase())
          record(page, this.name, `${at}: labels ${hex.toUpperCase()} as \`${ramp}\`, but that ramp is ${v}`);
        n++;
      }
      return n;
    },
  },
  {
    name: 'guide/quick-reference items',
    page: 'docs/08-semantic-guide.html',
    floor: 21,
    run(page, src) {
      /**
       * `[^"]*` after the background is load-bearing: six of these swatches
       * carry a `border-color` after it, and a pattern that required the
       * background to close the attribute skipped all six while reporting the
       * other fifteen as clean. That is this gate's own failure mode, so the
       * floor is set at the full count.
       */
      const re =
        /<div class="ref-item"[^>]*>\s*<div class="ref-dot" style="background:\s*(#[0-9A-Fa-f]{6});[^"]*"><\/div>\s*<div class="ref-info"><div class="ref-name">([^<]*)<\/div><div class="ref-token">(--[a-z0-9-]+)(?:\s*·\s*([a-z0-9-]+))?<\/div>/gs;
      let n = 0;
      for (const m of src.matchAll(re)) {
        const [, hex, label, token, ramp] = m;
        const at = `quick reference "${label.trim()}"`;
        expect(page, this.name, token, 'light', hex, at);
        const key = ramp && rampVar(ramp);
        const v = key && resolve(key, 'light');
        if (key && v === null) record(page, this.name, `${at}: cites ramp \`${ramp}\`, which is not a token`);
        else if (v && v !== hex.toUpperCase())
          record(page, this.name, `${at}: labels ${hex.toUpperCase()} as \`${ramp}\`, but that ramp is ${v}`);
        n++;
      }
      return n;
    },
  },
  {
    name: 'guide/code-sample declarations',
    page: 'docs/08-semantic-guide.html',
    floor: 20,
    run(page, src) {
      /**
       * `--color-x: #HEX;  /* ramp-name  ↔  dark: #HEX · note *​/` — three facts
       * per line, all of them checkable: the light value, the ramp it claims to
       * come from, and the dark value where the line quotes one. The `↔ dark:`
       * half is where two of the seven original drifts hid.
       *
       * The `--` prefix is required so `background-color: #E01A59` — a property,
       * not a token — is not read as a declaration of one.
       */
      const re =
        /--<span class="c-key">(color-[a-z0-9-]+)<\/span>:\s*<span class="c-val">(#[0-9A-Fa-f]{6})<\/span>;(?:[^\n]*?<span class="c-comment">\/\*([^*]*)\*\/)?/g;
      let n = 0;
      for (const m of src.matchAll(re)) {
        const token = `--${m[1]}`;
        const hex = m[2];
        const comment = (m[3] ?? '').replace(/&[a-z]+;/g, ' ');
        const at = `code sample \`${token}\``;
        expect(page, this.name, token, 'light', hex, at);

        const darkQuoted = /dark:\s*(#[0-9A-Fa-f]{6})/i.exec(comment);
        if (darkQuoted) expect(page, this.name, token, 'dark', darkQuoted[1], `${at} (↔ dark)`);

        const rampWord = /^\s*([a-z][a-z0-9-]*)/.exec(comment);
        const key = rampWord && rampVar(rampWord[1]);
        const v = key && resolve(key, 'light');
        if (key && v === null) record(page, this.name, `${at}: cites ramp \`${rampWord[1]}\`, which is not a token`);
        else if (v && v !== hex.toUpperCase())
          record(page, this.name, `${at}: labels ${hex.toUpperCase()} as \`${rampWord[1]}\`, but that ramp is ${v}`);
        n++;
      }
      return n;
    },
  },
  {
    name: 'guide/code-sample var comments',
    page: 'docs/08-semantic-guide.html',
    floor: 10,
    run(page, src) {
      /**
       * `--color-x: var(--color-y);  /* #HEX *​/` — the comment states what the
       * line resolves to. Checked against `--color-y` in the LIGHT scope on
       * purpose: the dark-mode examples assign `var(--color-bg-dark)`, and that
       * variable holds its value in the light scope. So this needs no idea of
       * which block a line sits in, which is the part that would have been
       * fragile.
       */
      const re = /<span class="c-str">var\((--[a-z0-9-]+)\)<\/span>;[^\n]*?<span class="c-comment">\/\*\s*([^*]*?)\s*\*\//g;
      let n = 0;
      for (const m of src.matchAll(re)) {
        const token = m[1];
        const comment = m[2];
        const at = `code sample \`var(${token})\``;
        n++;

        /* A hex — the original case. */
        const asHex = /^#[0-9A-Fa-f]{6}/.exec(comment);
        if (asHex) {
          expect(page, this.name, token, 'light', asHex[0], at);
          continue;
        }

        /**
         * A dimension. Checked because three of these were wrong: `--radius-cta`
         * annotated 40px when it aliases the full pill, and `--radius-xs`
         * annotated 4px when it is 2px. rem is normalised so 3.5rem and 56px do
         * not read as drift.
         */
        const asDim = /^(-?[\d.]+)(px|rem)\b/.exec(comment);
        if (asDim) {
          const want = raw(token);
          const px = (v) => {
            const d = /^(-?[\d.]+)(px|rem)$/.exec((v ?? '').trim());
            return d ? parseFloat(d[1]) * (d[2] === 'rem' ? 16 : 1) : null;
          };
          const got = px(want);
          const said = parseFloat(asDim[1]) * (asDim[2] === 'rem' ? 16 : 1);
          if (got === null)
            record(page, this.name, `${at}: annotated ${comment}, but \`${token}\` is ${want ?? 'undeclared'} — not a length`);
          else if (got !== said) record(page, this.name, `${at}: annotated ${comment}, but \`${token}\` is ${want}`);
          continue;
        }

        /**
         * A ramp name. `--color-border-dark` was annotated `violet-500` long
         * after it moved to iron-violet/800 — a label nothing compared.
         */
        const key = rampVar(comment.split(/\s+/)[0]);
        if (!key) continue;
        const rampHex = resolve(key, 'light');
        const tokenHex = resolve(token, 'light');
        if (rampHex === null) record(page, this.name, `${at}: cites ramp \`${comment.split(/\s+/)[0]}\`, which is not a token`);
        else if (tokenHex && rampHex !== tokenHex)
          record(page, this.name, `${at}: labelled \`${comment.split(/\s+/)[0]}\` (${rampHex}), but the token is ${tokenHex}`);
      }
      return n;
    },
  },
  {
    name: 'colors/swatch cards',
    page: 'docs/semantic-colors.html',
    floor: 35,
    run(page, src) {
      const re =
        /<div class="sem-card" onclick="copy\('(#[0-9A-Fa-f]{6})','(--[a-z0-9-]+)'\)">\s*<div class="sem-color" style="background:([^";]+);?"><\/div>\s*<div class="sem-body">\s*<div class="sem-name">([^<]*)<\/div>\s*<div class="sem-hex">([^<]*)<\/div>\s*<div class="sem-token">(--[a-z0-9-]+)<\/div>/gs;
      let n = 0;
      for (const m of src.matchAll(re)) {
        const [, clickHex, clickToken, swatch, label, shownHex, shownToken] = m;
        const at = `card "${label.trim()}"`;
        // the card states the same two facts three times; they must agree
        if (clickToken !== shownToken)
          record(page, this.name, `${at}: copies \`${clickToken}\` but displays \`${shownToken}\``);
        if (shownHex.trim().toUpperCase() !== clickHex.toUpperCase())
          record(page, this.name, `${at}: copies ${clickHex.toUpperCase()} but displays ${shownHex.trim().toUpperCase()}`);
        const sw = swatch.trim().toUpperCase();
        if (/^#[0-9A-F]{6}$/.test(sw) && sw !== clickHex.toUpperCase())
          record(page, this.name, `${at}: swatch paints ${sw} but the card says ${clickHex.toUpperCase()}`);
        expect(page, this.name, shownToken, 'light', clickHex, at);
        n++;
      }
      return n;
    },
  },
  /**
   * The transparency ramps on the opacity page. Fourteen 8-digit hexes typed
   * into a table — the exact shape that put a retired blue on the shadows page
   * and kept it there. The swatch and the stated value are checked separately,
   * because a table can be right in the text and wrong in the colour.
   *
   * Nothing documented these tokens anywhere in docs/ until 2026-08-13.
   */
  {
    name: 'opacity/transparency ramps',
    page: 'docs/05-opacity.html',
    floor: 12,
    run(page, src) {
      /* The ramps were a narrow table until 2026-08-14 and are now rows in the
         same card the opacity scale uses, so the swatch is a `.ramp-fill`
         rather than a `<span>` in a `<td>`. If this regex is ever left behind
         by another restyle it matches nothing, and `floor` below is what turns
         that silence into a failure rather than a clean page. */
      const re = /<div class="scale-bar-label">(transparent-[a-z]+-\d+)<\/div>\s*<div class="scale-bar-track ramp-track"><div class="ramp-fill" style="background:(#[0-9A-Fa-f]{8});"><\/div><\/div>\s*<div class="ramp-hex">(#[0-9A-Fa-f]{8})<\/div>/g;
      let n = 0;
      const seen = new Set();
      for (const m of src.matchAll(re)) {
        const [, label, swatch, stated] = m;
        const token = `--${label}`;
        const want = (raw(token) ?? '').toUpperCase();
        n++;
        seen.add(token);
        if (!want) { record(page, this.name, `names \`${token}\`, which tokens.css does not declare`); continue; }
        if (stated.toUpperCase() !== want) record(page, this.name, `${token}: says ${stated.toUpperCase()} — tokens.css has ${want}`);
        if (swatch.toUpperCase() !== want) record(page, this.name, `${token}: swatch paints ${swatch.toUpperCase()} — tokens.css has ${want}`);
      }
      /* Completeness, the same half the borders parser gained on the same day
         and for the same reason: a ramp that is missing a step is a page that
         is right about everything it shows. */
      for (const m of SCOPE.light.matchAll(/^\s*(--transparent-[\w-]+):/gm)) {
        if (!seen.has(m[1])) record(page, this.name, `${m[1]} is declared in tokens.css but has no row in the ramps`);
      }
      return n;
    },
  },
  /**
   * The borders page, and the first parser here that checks COMPLETENESS rather
   * than only correctness.
   *
   * Every parser above asks "is what the page says true?". None of them can ask
   * "is anything missing?", and on 2026-08-14 that was the whole fault: the
   * Width Visual Scale listed 1, 2, 4 and 8 while tokens.css declares five
   * widths. Nothing on the page was WRONG. `--border-width-1-5` was simply not
   * there, and a reader would conclude the design system has four border
   * widths. The same shape had just been found on the Tooltip page, where three
   * of four variants had cards.
   *
   * So this reads both catalogues on the page — the cards and the scale bars —
   * and holds each to the full set of `--border-width-*` in tokens.css. A token
   * added to tokens.css and not documented here now fails, which is the
   * direction that was previously unguarded.
   */
  {
    name: 'borders/width catalogue',
    page: 'docs/04-borders.html',
    floor: 10,
    run(page, src) {
      /* The set to be complete against, read from tokens.css rather than
         listed here. A hand-written list would need updating by the same person
         who forgot to update the page. */
      const want = new Map();
      for (const m of SCOPE.light.matchAll(/^\s*(--border-width-[\w-]+):\s*([^;]+?)\s*;/gm)) {
        want.set(m[1], m[2]);
      }
      if (!want.size) {
        record(page, this.name, 'tokens.css declares no --border-width-* at all — the parser has nothing to check against');
        return 0;
      }

      let n = 0;
      const seenCards = new Set(), seenScale = new Set();

      /* The cards: `--border-width-1-5` beside a stated value of `1.5px`. */
      const cards = /<div class="width-value">([^<]+)<\/div>\s*<div class="width-token">(--border-width-[\w-]+)<\/div>/g;
      for (const [, stated, token] of src.matchAll(cards)) {
        n++;
        seenCards.add(token);
        const real = want.get(token);
        if (!real) { record(page, this.name, `card names \`${token}\`, which tokens.css does not declare`); continue; }
        if (stated.trim() !== real) record(page, this.name, `${token}: card says ${stated.trim()} — tokens.css has ${real}`);
      }

      /* The scale bars. The bar's own `height` is checked too, not just the
         label beside it: the bar IS the documentation here, and a row that says
         4px over a 2px rule is a picture that lies. */
      const scale = /<div class="scale-bar-label">(border-width-[\w-]+)<\/div>[\s\S]{0,400}?height:\s*([\d.]+)px[\s\S]{0,400}?<div class="scale-bar-px">([^<]+)<\/div>/g;
      for (const [, label, drawn, stated] of src.matchAll(scale)) {
        n++;
        const token = `--${label}`;
        seenScale.add(token);
        const real = want.get(token);
        if (!real) { record(page, this.name, `scale row names \`${token}\`, which tokens.css does not declare`); continue; }
        if (stated.trim() !== real) record(page, this.name, `${token}: scale says ${stated.trim()} — tokens.css has ${real}`);
        if (`${drawn}px` !== real) record(page, this.name, `${token}: scale bar is drawn ${drawn}px — tokens.css has ${real}`);
      }

      /* The half that would have caught Ball's report. */
      for (const token of want.keys()) {
        if (!seenCards.has(token)) record(page, this.name, `${token} is declared in tokens.css but has no width card`);
        if (!seenScale.has(token)) record(page, this.name, `${token} is declared in tokens.css but has no row in the visual scale`);
      }
      return n;
    },
  },
  /**
   * The typography page. Every `.type-row` states a size, a line height, a
   * weight and a tracking, and now names the tokens they come from — until
   * 2026-08-13 it named exactly ONE token out of 107, so a reader could see what
   * the type looked like and not learn which token to reach for.
   *
   * The values were all correct when the names were added; this exists so they
   * stay that way. The shadows page is the reason to bother: it stated
   * `rgba(42,149,213,.25)` for a focus ring years after the token moved to
   * iron-blue-500, and documented `--shadow-focus-red`, which tokens.css has
   * never declared.
   */
  {
    name: 'typography/type rows',
    page: 'docs/02-typography.html',
    floor: 18,
    run(page, src) {
      let n = 0;
      /* The whole meta table, Size through Use for. An earlier version started
         matching at the Tokens row — which sits AFTER Size, Line height, Weight
         and Tracking — so it read the names and none of the values, and its
         planted-error case went 0 → 0. A parser can match and still be blind. */
      for (const m of src.matchAll(/<tr><td>Size<\/td>[\s\S]*?<tr><td>Use for/g)) {
        const tokenCell = m[0].match(/<tr><td>Tokens<\/td><td>(.*?)<\/td><\/tr>/);
        if (!tokenCell) continue;
        const names = [...tokenCell[1].matchAll(/--([a-z0-9-]+)/g)].map((x) => x[1]);
        const cells = Object.fromEntries([...m[0].matchAll(/<tr><td>([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g)].map((x) => [x[1], x[2]]));
        const stated = { 'font-size': cells['Size'], 'line-height': cells['Line height'], fw: cells['Weight'], 'letter-spacing': cells['Tracking'] };
        for (const name of names) {
          const fam = ['font-size', 'line-height', 'letter-spacing', 'fw'].find((f) => name.startsWith(`${f}-`));
          if (!fam) continue;
          const v = raw(`--${name}`);
          if (v === null) { record(page, this.name, `names \`--${name}\`, which tokens.css does not declare`); n++; continue; }
          const px = /^([\d.]+)rem$/.test(v) ? parseFloat(v) * 16 : /^(-?[\d.]+)px$/.test(v) ? parseFloat(v) : parseFloat(v);
          const said = parseFloat((stated[fam] ?? '').replace(/&[a-z]+;/g, ' ').match(/-?[\d.]+/)?.[0] ?? 'NaN');
          n++;
          if (Number.isNaN(said) || Number.isNaN(px)) continue;
          if (Math.abs(px - said) > 0.01 && !(px <= 2 && said <= 2)) {
            record(page, this.name, `row says ${said} for \`--${name}\` — tokens.css resolves it to ${px}`);
          }
        }
      }
      return n;
    },
  },
  /**
   * The Anatomy callouts on every component page. Each `.atag` names a token
   * and, sometimes, restates the length it resolves to — `ring → --size-box
   * (18px)`. Nothing checked those until 2026-08-13, and two of the four were
   * wrong: `--size-box` is `--size-box-md`, which is 20px, and the checkbox and
   * radio pages had both said 18 since they were written.
   *
   * This is the exact shape CLAUDE.md warns about — a number in prose restating
   * a fact the build derives — and it is the reason that file forbids writing
   * counts and token values into it. Unlike the parsers above, this one walks
   * EVERY component page, because the claim is not tied to one document.
   */
  {
    name: 'component/anatomy tags',
    pages: componentPages(),
    floor: 3,
    run(page, src) {
      let n = 0;
      for (const m of src.matchAll(/<b>(--[a-z0-9-]+)<\/b>\s*\(([\d.]+)px\)/g)) {
        const [, token, stated] = m;
        const v = raw(token);
        if (v === null) {
          record(page, this.name, `names \`${token}\`, which tokens.css does not declare`);
          n++;
          continue;
        }
        const px = /^([\d.]+)rem$/.test(v) ? parseFloat(v) * 16 : /^([\d.]+)px$/.test(v) ? parseFloat(v) : null;
        if (px === null) continue; // not a length — nothing to restate
        n++;
        if (Math.abs(px - parseFloat(stated)) > 0.01) {
          record(page, this.name, `says ${stated}px for \`${token}\` — tokens.css resolves it to ${px}px`);
        }
      }
      return n;
    },
  },
];

/**
 * `iron-pink-500`, `neutral-900`, `iron-violet/900` → the matching `--…` ramp
 * variable. Anything without a numeric rung → null, deliberately.
 *
 * These cells cite two different vocabularies. `iron-violet/900` is a rung of a
 * primitive ramp and resolves to a variable; `brand/secondary` is the name of a
 * FIGMA variable, which has no `--brand-secondary` counterpart here and never
 * will. An earlier version of this function converted both and reported twelve
 * confident failures against cells that were correct — the numeric-rung test is
 * what separates them.
 */
function rampVar(name) {
  const css = (name ?? '').trim().replace(/\//g, '-');
  if (!/^[a-z]+(?:-[a-z]+)*-\d+$/.test(css)) return null;
  return `--${css}`;
}

/* ── run ──────────────────────────────────────────────────────────────────── */

const sources = new Map();
const readPage = (rel) => {
  if (!sources.has(rel)) sources.set(rel, readFileSync(join(ROOT, rel), 'utf8'));
  return sources.get(rel);
};

function runAll(overrides = new Map()) {
  problems.length = 0;
  for (const p of PARSERS) {
    /* `pages` (plural) is for a claim that is not tied to one document — the
       Anatomy callouts appear on every component page. */
    const list = p.pages ?? [p.page];
    let n = 0;
    for (const rel of list) n += p.run(rel, overrides.get(rel) ?? readPage(rel));
    counts[p.name] = n;
  }
  const starved = PARSERS.filter((p) => counts[p.name] < p.floor);
  return { starved };
}

if (SELF_TEST) {
  /**
   * Prove every parser can actually fail, by corrupting the ONE value each shape
   * carries and asserting the count of problems rises. A parser that matches
   * nothing passes this repo's other checks silently; this is the only thing
   * that distinguishes "clean" from "blind".
   */
  const base = runAll();
  if (base.starved.length) {
    console.error(red(`\n✖  self-test cannot run — ${base.starved.length} parser(s) are already below their floor\n`));
    for (const p of base.starved) console.error(`    ${p.name}: ${counts[p.name]} < ${p.floor}`);
    process.exit(1);
  }
  const baseline = problems.length;

  // one surgical corruption per parser, applied to an in-memory copy
  const FAULTS = [
    ['guide/two-mode rows', 'docs/08-semantic-guide.html', /(<td class="td-light">.*?>)#[0-9A-Fa-f]{6}/s, '$1#BADBAD'],
    ['guide/single-value rows', 'docs/08-semantic-guide.html', /(<td><div class="color-dot"><div class="dot" style="background:)#[0-9A-Fa-f]{6}/, '$1#BADBAD'],
    ['guide/quick-reference items', 'docs/08-semantic-guide.html', /(<div class="ref-dot" style="background:)#[0-9A-Fa-f]{6}/, '$1#BADBAD'],
    ['guide/code-sample declarations', 'docs/08-semantic-guide.html', /(--<span class="c-key">color-primary<\/span>:\s*<span class="c-val">)#[0-9A-Fa-f]{6}/, '$1#BADBAD'],
    ['guide/code-sample var comments', 'docs/08-semantic-guide.html', /(<span class="c-comment">\/\*\s*)#[0-9A-Fa-f]{6}/, '$1#BADBAD'],
    ['colors/swatch cards', 'docs/semantic-colors.html', /(<div class="sem-card" onclick="copy\(')#[0-9A-Fa-f]{6}/, '$1#BADBAD'],
    /* Planted on the page whose Anatomy callout had been wrong since it was
       written — the parser exists because nothing noticed 18px against a token
       that resolves to 20. */
    ['component/anatomy tags', 'docs/component-radio.html', /(<b>--size-box<\/b> \()[\d.]+px\)/, '$199px)'],
    /* The typography page stated every value correctly on the day its token
       names were added; this proves the parser would notice if one moved. */
    ['typography/type rows', 'docs/02-typography.html', /(<tr><td>Size<\/td><td>)48px/, '$199px'],
    ['opacity/transparency ramps', 'docs/05-opacity.html', /(<div class="ramp-fill" style="background:)#FFFFFF80/, '$1#FFFFFFBB'],
    /* Two entries, because this parser has two halves that fail in opposite
       directions and one plant can only arm one of them. The DELETION is the
       important one: it recreates the exact regression Ball reported, a scale
       that is entirely correct about the four rows it has and silent about the
       fifth. A parser armed only by a corrupted value would have gone on
       passing that page forever. */
    ['borders/width catalogue (a row is deleted)', 'docs/04-borders.html',
      /<div class="scale-bar-row">\s*<div class="scale-bar-label">border-width-1-5<\/div>[\s\S]*?<div class="scale-bar-px">[^<]*<\/div>\s*<\/div>/, ''],
    ['borders/width catalogue (a value is wrong)', 'docs/04-borders.html',
      /(<div class="width-token">--border-width-1-5<\/div>)/, '<div class="width-value">99px</div>$1'],
  ];

  let armed = 0;
  console.log(`\n  ${bold('self-test')} — baseline ${baseline} problem(s)\n`);
  for (const [name, page, pattern, replacement] of FAULTS) {
    const src = readPage(page);
    const broken = src.replace(pattern, replacement);
    if (broken === src) {
      console.error(`    ${red('✖')} ${name.padEnd(30)} the fault pattern matched nothing — cannot arm`);
      continue;
    }
    runAll(new Map([[page, broken]]));
    const caught = problems.length > baseline;
    if (caught) armed++;
    console.log(`    ${caught ? green('✔') : red('✖')} ${name.padEnd(30)} ${baseline} → ${problems.length} problem(s)`);
  }
  console.log('');
  if (armed !== FAULTS.length) {
    console.error(red(bold(`✖  ${FAULTS.length - armed} of ${FAULTS.length} parsers did not react to a planted error\n`)));
    process.exit(1);
  }
  console.log(green(bold(`✔  all ${FAULTS.length} parsers react to a planted error\n`)));
  process.exit(0);
}

const { starved } = runAll();

if (starved.length) {
  console.error(red(bold(`\n✖  ${starved.length} parser(s) matched less than expected — a shape moved, and silence here is not a pass\n`)));
  for (const p of starved) console.error(`    ${red('✖')} ${p.name}: found ${counts[p.name]}, floor is ${p.floor}`);
  console.error(dim('\n  Update the parser to the new markup, then lower or raise the floor deliberately.\n'));
  process.exit(1);
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (problems.length) {
  console.error(red(bold(`\n✖  ${problems.length} catalogue entr${problems.length > 1 ? 'ies' : 'y'} disagree with tokens.css\n`)));
  let last = '';
  for (const p of problems) {
    const head = `${p.page} ${dim('· ' + p.kind)}`;
    if (head !== last) {
      console.error(`  ${bold(basename(p.page))} ${dim('· ' + p.kind)}`);
      last = head;
    }
    console.error(`    ${red('✖')} ${p.detail}`);
  }
  console.error('');
  process.exit(1);
}

console.log(
  green(bold(`\n✔  ${total} catalogue entries across ${new Set(PARSERS.map((p) => p.page)).size} docs pages match tokens.css`)) +
    dim(`\n   ${PARSERS.map((p) => `${p.name} ${counts[p.name]}`).join(' · ')}\n`)
);
