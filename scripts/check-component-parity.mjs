#!/usr/bin/env node
/**
 * Iron Software Design System — component ↔ docs CSS parity check
 *
 * Every `.astro` component that ships CSS in a <style> block reaches its docs
 * page (docs/component-<name>.html) through ONE generated stylesheet,
 * docs/components.css, which build-component-css.mjs writes from those blocks
 * and `check:components-css` holds current.
 *
 * UNTIL 2026-10-14 EACH PAGE CARRIED ITS OWN INLINE COPY, hand-kept "1:1", and
 * this gate asked whether the copy still matched. It did catch drift — and then
 * someone fixed the drift by hand, every time: the ProductMenu gutter drop that
 * morning was three rules typed into the page after the component, in the same
 * session that wrote them. Seven pages carried the copies; TopNav's page carried
 * its copy AND linked components.css, two sources for one rule. All seven now
 * link the generated file, and a computed-style diff of every element on them
 * against the pre-change tree came back identical at 375, 768, 1024 and 1440
 * (`npm run style-diff`).
 *
 * So the question changed. For each component with a <style>:
 *   LINKED   its page links components.css, or it renders unstyled
 *   CARRIED  components.css contains every one of its rules, unchanged
 *   NO COPY  its page does NOT re-declare any of them inline — a second copy
 *            is the thing that drifted, and it would also win on order
 * The page may still add rules of its own for the demo layout; they come after
 * the link, so they can override a component rule but never be the only copy.
 *
 *   astro-components/components/Tooltip.astro   <style> …the source of truth…
 *   docs/components.css                          generated, carries it
 *   docs/component-tooltip.html                  links it, copies nothing
 *
 * Run:  node scripts/check-component-parity.mjs
 * Exit: 0 = in sync · 1 = drift found
 *
 * Zero dependencies — plain Node, same as the token drift checker.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENTS = join(ROOT, 'astro-components/components');
const DOCS = join(ROOT, 'docs');

const errors = [];
const skipped = [];
const converted = [];
const perFile = [];
let rulesChecked = 0;

const UTILITIES = join(DOCS, 'utilities.css');
const BUNDLE = join(DOCS, 'components.css');
const shellCss = readFileSync(join(DOCS, 'docs.css'), 'utf8');

/* ── CSS extraction ──────────────────────────────────────────────────────── */

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** All <style>…</style> bodies in a file, concatenated. */
function styleBlocks(src) {
  return [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
}

/**
 * Split CSS into top-level rules by tracking brace depth, so an `@media { … }`
 * block comes back as one unit with its nested rules intact rather than being
 * torn apart. Components are otherwise flat, so this stays simple.
 */
function topLevelRules(css) {
  const rules = [];
  let cur = '';
  let depth = 0;
  for (const ch of stripComments(css)) {
    cur += ch;
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      rules.push(cur.trim());
      cur = '';
    }
  }
  return rules.filter((r) => r.includes('{'));
}

/** Canonical form so whitespace and trailing-semicolon differences never register. */
const normalise = (rule) =>
  rule
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};:,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();

/* ── mode B: a component that has converted to utility classes ───────────── */

/**
 * Every class name that appears in a `class="…"` attribute in some markup.
 *
 * Entities are decoded first. An arbitrary variant like `[&>svg]:opacity-100`
 * is written into HTML as `[&amp;>svg]:opacity-100` — the browser decodes it and
 * matches the rule, but read as raw text it is a class that exists nowhere.
 */
function classesInMarkup(html) {
  const decode = (s) =>
    s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const out = new Set();
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    for (const c of decode(m[1]).split(/\s+/)) if (c) out.add(c);
  }
  return out;
}

/**
 * A converted component ships no CSS of its own, so the question changes. It is
 * no longer "does the docs page carry the same rules" — there are none to carry.
 * It is: will that page still render the component, and has the CSS it used to
 * need been cleared out?
 *
 * Two failures, both of which happened on the POC branch and neither of which
 * any existing gate saw:
 *
 *  1. The page does not link the compiled utilities, so every demo on it renders
 *     as unstyled text. Worse, the hand-written cells further down the same page
 *     kept working off the old CSS, so it read as half broken rather than broken.
 *  2. The old rules stay behind — 18 of them for Badge — styling class names the
 *     component no longer emits. Dead CSS on a page nobody rereads is how the
 *     next person concludes the component still works that way.
 */
function checkConverted(file, name, docsPath) {
  const page = readFileSync(docsPath, 'utf8');
  const problems = [];

  if (!/<link[^>]+href="utilities\.css"/.test(page)) {
    problems.push(`does not link utilities.css — every demo on it renders unstyled`);
  }

  /**
   * The check that matters most, and the one whose absence bit first. Deleting
   * the component's old rules from the page is only safe if nothing on the page
   * still uses them — and on Badge, seven hand-written elements outside the
   * generated demo regions did: an anatomy example and six token-table swatches.
   * They kept `class="badge badge--success"` while the rules that styled it were
   * removed, so they rendered as bare text on a page that otherwise looked fine.
   *
   * The dead-rule check below cannot see this. It asks whether a RULE has lost
   * its markup; this asks whether MARKUP has lost its rule. Both directions have
   * now happened, on the same page, within an hour of each other.
   */
  /**
   * `\\.` in the pattern is not optional. Tailwind escapes any character that is
   * not valid in an identifier, so `size-1.5` is emitted as `.size-1\.5` — read
   * with a plain `[\w-]+` that comes back as `size-1`, the real class looks
   * undeclared, and this gate reports a class that is right there in the file.
   * It did exactly that the first time it ran.
   */
  const unescape = (s) => s.replace(/\\(.)/g, '$1');
  /**
   * EVERY class in a utilities.css selector, not just the one the rule is named
   * after. A state class that only ever appears second in a compound —
   * `.[&.selected]:text-secondary.selected`, which is how a utility keyed off a
   * class the component's own script toggles compiles — was read as declared
   * nowhere, and this gate reported three of Select's real, styled state hooks
   * (`selected`, `is-placeholder`, `active`) as classes resolving to nothing.
   *
   * Only rule preludes are scanned: the text before `{`. Reading the whole file
   * would pull class-shaped fragments out of declaration VALUES, where every
   * decimal (`0.25rem`) looks like `.25rem`.
   */
  const classesInSelectors = (css) => {
    const out = [];
    for (const [, prelude] of css.matchAll(/^([^{}]*)\{/gm)) {
      for (const m of prelude.matchAll(/\.((?:[a-zA-Z_-]|\\.)(?:[\w-]|\\.)*)/g)) out.push(unescape(m[1]));
    }
    return out;
  };
  const declared = new Set([
    ...classesInSelectors(readFileSync(UTILITIES, 'utf8')),
    ...[...shellCss.matchAll(/\.((?:[\w-]|\\.)+)/g)].map((m) => unescape(m[1])),
    ...[...styleBlocks(page).matchAll(/\.((?:[\w-]|\\.)+)/g)].map((m) => unescape(m[1])),
  ]);
  /**
   * `group` and `peer` are markers, not utilities: they emit no rule of their
   * own and exist so that `group-has-[:checked]:…` and `peer-checked:…` have
   * something to point at. Checkbox is the first component to need either, and
   * they are the only two classes in Tailwind that legitimately resolve to
   * nothing — anything else that resolves nowhere is a mistake.
   *
   * Their NAMED forms are markers too. Select nests one group inside another —
   * the wrapper is `group` for the open state, each option is `group/opt` so its
   * tick can key off the row being selected — and `group/opt` is spelled as a
   * class while emitting nothing, exactly like the bare form.
   */
  const MARKER = /^(group|peer)(\/[\w-]+)?$/;

  /**
   * A class a script looks for is a hook, not a style, and is allowed to resolve
   * to nothing. `docs/preview-frame.js` finds its wrapper with `.vp` — declared
   * nowhere in CSS on purpose, because only `.vp-bar`, `.vp-stage` and the rest
   * are painted. Reported as an unstyled class it looks exactly like a deletion
   * that went too far.
   */
  const scripts = [
    ...[...page.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]),
    ...[...page.matchAll(/<script[^>]+src="([^"]+)"/gi)]
      .filter(([, src]) => !/^https?:/i.test(src))
      .map(([, src]) => { try { return readFileSync(join(DOCS, src), 'utf8'); } catch { return ''; } }),
  ].join('\n');

  const used = classesInMarkup(page);
  const unstyled = [...used].filter(
    (c) => !declared.has(c) && !MARKER.test(c) && !scripts.includes(`'${c}'`) && !scripts.includes(`"${c}"`) && !scripts.includes(`.${c}`),
  );
  if (unstyled.length) {
    problems.push(
      `${unstyled.length} class${unstyled.length > 1 ? 'es' : ''} in its markup resolve nowhere — ` +
        `not in utilities.css, docs.css or the page: ${unstyled.slice(0, 8).join(', ')}` +
        (unstyled.length > 8 ? ', …' : ''),
    );
  }

  /**
   * The CODE SAMPLES, which nothing looked at until 2026-08-06. The checks above
   * read the page's demo markup — generated, and therefore true — while the
   * prose panes beside it still described the component as it was before it
   * converted. Across the nine converted components that was 65 CSS rules naming
   * 58 classes they no longer emit, plus HTML samples telling readers to write
   * `class="badge badge--success"`, unstyled since `ba85523`.
   *
   * Two rules, both derivable. A converted component ships no CSS, so a pane
   * claiming to show its CSS is false by construction; and a sample may only
   * name classes the component actually emits.
   */
  const panes = [...page.matchAll(/<pre[^>]*data-lang="([a-z]+)"[^>]*>([\s\S]*?)<\/pre>/g)];
  const cssPane = panes.find(([, lang]) => lang === 'css');
  if (cssPane) {
    problems.push(
      `its Code section still has a CSS pane — this component ships no CSS, and the ` +
        `token bindings it used to show are the page's own Token Reference table`,
    );
  }
  /**
   * `classesInMarkup` reads `class="…"` attributes only, so it cannot see a class
   * built as `` `notice--${variant}` `` or declared through `class:list`'s object
   * shorthand, `{ invalid, 'rdo-card': card }`. That is safe HERE — a converted
   * component's generated sample is Astro usage and carries no `class=` at all,
   * so there is nothing to compare — but auditing the not-yet-converted pages
   * the same way on 2026-08-06 reported 12 classes as missing and **all twelve
   * were emitted**, every one through one of those two forms. If this check is
   * ever pointed at a component that still ships CSS, teach it both first.
   */
  const emitted = classesInMarkup(readFileSync(join(COMPONENTS, file), 'utf8'));
  const sampleClasses = new Set(
    panes.flatMap(([, , body]) =>
      [...body.replace(/<[^>]*>/g, '').matchAll(/class=(?:&quot;|")([^&"]*)(?:&quot;|")/g)]
        .flatMap((m) => m[1].split(/\s+/))
        .filter(Boolean),
    ),
  );
  const lying = [...sampleClasses].filter((c) => !emitted.has(c) && !declared.has(c));
  if (lying.length) {
    problems.push(
      `${lying.length} class${lying.length > 1 ? 'es' : ''} in its code sample${lying.length > 1 ? 's' : ''} ` +
        `that the component does not emit: ${lying.slice(0, 6).join(', ')}${lying.length > 6 ? ', …' : ''}`,
    );
  }

  const dead = [];
  for (const rule of topLevelRules(styleBlocks(page))) {
    const sel = rule.slice(0, rule.indexOf('{')).replace(/\s+/g, ' ').trim();
    // Only judge selectors built purely from class names; anything with an
    // element, id, attribute or at-rule in it is the page's own chrome.
    if (!/^(\.[\w-]+)+(\s*[,>+~]?\s*(\.[\w-]+)+)*$/.test(sel)) continue;
    const names = [...sel.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
    if (names.every((n) => !used.has(n))) dead.push(sel);
  }
  if (dead.length) {
    problems.push(
      `${dead.length} dead rule${dead.length > 1 ? 's' : ''} for classes its markup no longer uses: ` +
        dead.slice(0, 6).join(', ') + (dead.length > 6 ? ', …' : ''),
    );
  }

  return { file, name, docsPath, problems, utilities: [...used].length };
}

/* ── compare each component against its docs page ────────────────────────── */

const bundleRules = new Set(existsSync(BUNDLE) ? topLevelRules(readFileSync(BUNDLE, 'utf8')).map(normalise) : []);

for (const file of readdirSync(COMPONENTS).filter((f) => f.endsWith('.astro')).sort()) {
  const name = basename(file, '.astro').toLowerCase();
  const docsPath = join(DOCS, `component-${name}.html`);

  if (!existsSync(docsPath)) {
    skipped.push(`${file} — no docs/component-${name}.html (composed component, nothing to mirror)`);
    continue;
  }

  const astroRules = topLevelRules(styleBlocks(readFileSync(join(COMPONENTS, file), 'utf8')));
  const docsRules = new Set(topLevelRules(styleBlocks(readFileSync(docsPath, 'utf8'))).map(normalise));

  /**
   * A component with no <style> is now the EXPECTED end state, not a mistake:
   * the components are converting to Tailwind utility classes (Ball's call
   * 2026-08-05). But the two shapes cannot be checked the same way, and the
   * empty set is a subset of anything — so left alone this gate would not fail
   * on a converted component, it would go SILENT, exactly as it did on the POC
   * branch where 456 rules became 438 and it still printed a tick.
   *
   * So: a component either has scoped CSS and is checked against its docs page
   * as before, or it has none and is checked against the compiled utilities
   * instead. What is not allowed is falling through unchecked.
   */
  if (astroRules.length === 0) {
    converted.push(checkConverted(file, name, docsPath));
    continue;
  }
  perFile.push({ file, count: astroRules.length });

  const page = readFileSync(docsPath, 'utf8');
  if (!/<link[^>]+href="components\.css"/.test(page)) {
    errors.push({ file, name, kind: 'LINKED', selector: 'does not link components.css — its demos render unstyled' });
  }
  for (const rule of astroRules) {
    rulesChecked++;
    const n = normalise(rule);
    const selector = rule.slice(0, rule.indexOf('{')).replace(/\s+/g, ' ').trim();
    if (!bundleRules.has(n)) errors.push({ file, name, kind: 'CARRIED', selector: `${selector} { … } is not in docs/components.css` });
    if (docsRules.has(n)) errors.push({ file, name, kind: 'NO COPY', selector: `${selector} { … } is copied inline on the page` });
  }
}

/* ── every page that WEARS utilities must link them ──────────────────────── */

/**
 * The mode-B check above only looks at a converted component's own docs page.
 * That is not where utility classes stop appearing: a component that composes a
 * converted one inherits its classes when build-demos re-renders it. Converting
 * Input put utility classes into docs/component-formcard.html — a page for a
 * component that still has its own <style>, so nothing checked it, and it did
 * not link utilities.css.
 *
 * So the question is asked of every page instead of every component: if the
 * markup uses a class that ONLY docs/utilities.css declares, the page has to
 * link it.
 */
const utilityOnly = existsSync(UTILITIES)
  ? new Set(
      [...readFileSync(UTILITIES, 'utf8').matchAll(/^\s*\.((?:[\w-]|\\.)+)/gm)]
        .map((m) => m[1].replace(/\\(.)/g, '$1')),
    )
  : new Set();
for (const n of [...shellCss.matchAll(/\.((?:[\w-]|\\.)+)/g)].map((m) => m[1].replace(/\\(.)/g, '$1'))) {
  utilityOnly.delete(n);
}

const unlinked = [];
for (const file of readdirSync(DOCS).filter((f) => f.endsWith('.html'))) {
  const page = readFileSync(join(DOCS, file), 'utf8');
  if (/<link[^>]+href="utilities\.css"/.test(page)) continue;
  const own = new Set([...styleBlocks(page).matchAll(/\.((?:[\w-]|\\.)+)/g)].map((m) => m[1].replace(/\\(.)/g, '$1')));
  const wears = [...classesInMarkup(page)].filter((c) => utilityOnly.has(c) && !own.has(c));
  if (wears.length) unlinked.push({ file, wears });
}

if (unlinked.length) {
  console.log(`\n\x1b[31m✖  ${unlinked.length} docs page(s) use utility classes without linking utilities.css\x1b[0m`);
  for (const { file, wears } of unlinked) {
    console.log(`    \x1b[31m✖\x1b[0m docs/${file} — ${wears.length} class(es), e.g. ${wears.slice(0, 4).join(', ')}`);
  }
  console.log(`\n  A page picks these up by composing a converted component, not only by`);
  console.log(`  being one. Add <link rel="stylesheet" href="utilities.css"> to it.\n`);
  process.exit(1);
}

/* ── report ──────────────────────────────────────────────────────────────── */

if (skipped.length) {
  console.log(`\n\x1b[90m·  skipped ${skipped.length}: ${skipped.map((s) => s.split(' — ')[0]).join(', ')}\x1b[0m`);
}

const broken = converted.filter((c) => c.problems.length);
if (broken.length) {
  console.log(`\n\x1b[31m✖  ${broken.length} converted component${broken.length > 1 ? 's' : ''} left its docs page unable to render it\x1b[0m`);
  for (const { file, name, problems } of broken) {
    console.log(`\n  \x1b[1m${file}\x1b[0m  ↔  docs/component-${name}.html`);
    for (const p of problems) console.log(`    \x1b[31m✖\x1b[0m ${p}`);
  }
  console.log(`\n  A component with no <style> is styled by docs/utilities.css. Link it on the`);
  console.log(`  page, and delete the rules the old markup needed.\n`);
  process.exit(1);
}

/**
 * utilities.css must exist the moment any component depends on it. Without this
 * the whole mode-B branch checks a file that is not there and says nothing.
 */
if (converted.length && !existsSync(UTILITIES)) {
  console.log(`\n\x1b[31m✖  ${converted.length} component(s) rely on docs/utilities.css, which is missing\x1b[0m`);
  console.log(`   Run: node scripts/build-utilities.mjs\n`);
  process.exit(1);
}

if (errors.length) {
  console.log(`\n\x1b[31m✖  ${errors.length} problem${errors.length > 1 ? 's' : ''} with how a component's <style> reaches its docs page\x1b[0m`);
  const byFile = new Map();
  for (const e of errors) (byFile.get(e.file) ?? byFile.set(e.file, []).get(e.file)).push(e);
  for (const [file, items] of byFile) {
    console.log(`\n  \x1b[1m${file}\x1b[0m  ↔  docs/component-${items[0].name}.html`);
    for (const { kind, selector } of items) console.log(`    \x1b[31m✖\x1b[0m [${kind}] ${selector}`);
  }
  console.log(`\n  The <style> block in each .astro is the source of truth, and it reaches the`);
  console.log(`  page through docs/components.css only. Run \`npm run build:components-css\`,`);
  console.log(`  link it from the page, and delete any copy of the component's rules there.\n`);
  process.exit(1);
}

/* The per-component counts are printed so a large drop is visible in a CI log
   even though only a drop to ZERO is an error. A component quietly losing most
   of its CSS is the same failure in slower motion. */
const smallest = [...perFile].sort((a, b) => a.count - b.count)[0];
console.log(
  `\n\x1b[32m✔  Component CSS reaches its pages one way — ${rulesChecked} rules from ${perFile.length} components, all in components.css, linked by every page, copied by none\x1b[0m`,
);
if (smallest) {
  console.log(`\x1b[90m   fewest is ${smallest.file} at ${smallest.count} rules\x1b[0m`);
}
if (converted.length) {
  console.log(
    `\x1b[32m✔  ${converted.length} converted component${converted.length > 1 ? 's' : ''} styled by docs/utilities.css\x1b[0m` +
      `\x1b[90m — ${converted.map((c) => c.file).join(', ')}\x1b[0m`,
  );
}
console.log();
