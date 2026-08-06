#!/usr/bin/env node
/**
 * Iron Software Design System — docs code-sample generator
 *
 * The gap this closes: the Code section on every converted component's page was
 * hand-typed, and it described the component as it existed before the Tailwind
 * conversion. Measured 2026-08-06, across the nine converted components: 65 CSS
 * rules naming 58 classes the components no longer emit, and HTML samples to
 * match — `component-badge.html` still told readers to write
 * `class="badge badge--success"`, which has produced unstyled markup since
 * `ba85523`.
 *
 * Nothing caught it, and nothing could have: `check:parity` reads a page's DEMO
 * markup, which `build-demos.mjs` generates and therefore keeps true, and never
 * looked at the prose panes beside it. The same lesson as `989dbb3` — the gate
 * was protecting the one place nobody was going to get wrong.
 *
 * So the sample is derived rather than written. Its source of truth is the
 * ```astro block in that component's section of `astro-components/README.md`,
 * which `check:exports` already requires to exist. Edit the README and the docs
 * page follows; edit neither and `--check` fails.
 *
 * Run:
 *   node scripts/build-code-samples.mjs           write the docs pages
 *   node scripts/build-code-samples.mjs --check   fail if they are not current
 *
 * Only CONVERTED components are handled. One that still ships a <style> block
 * has a truthful CSS pane, and rewriting it would delete real documentation.
 *
 * Zero dependencies — plain Node, same as the other checkers.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENTS = join(ROOT, 'astro-components/components');
const DOCS = join(ROOT, 'docs');
const README = join(ROOT, 'astro-components/README.md');
const CHECK = process.argv.includes('--check');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/** A component is converted when it ships no <style> block — same test as check:parity. */
const isConverted = (file) => !/^\s*<style/m.test(readFileSync(join(COMPONENTS, file), 'utf8'));

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Highlight an Astro snippet with the span classes the pages already style
 * (`.c-tag`, `.c-attr`, `.c-str`, `.c-com`). Deliberately a tokeniser over the
 * ESCAPED text rather than a parser: it only ever adds spans around runs it has
 * already escaped, so it cannot emit markup that changes the page.
 */
function highlight(src) {
  const out = [];
  for (const line of escapeHtml(src).split('\n')) {
    if (/^\s*&lt;!--/.test(line) || /--&gt;\s*$/.test(line.trim())) {
      out.push(`<span class="c-com">${line}</span>`);
      continue;
    }
    /**
     * ONE pass, not four chained ones. Chained `.replace()` calls re-scan the
     * markup the previous call just inserted: the attribute rule matched the
     * `class=` inside a `<span class="c-tag">` and wrapped it, emitting
     * `<span <span class="c-attr">class</span>="c-tag">`. `String.replace` with
     * a single global regex scans the ORIGINAL string only, so nothing this
     * function writes can be matched by it.
     */
    out.push(
      line.replace(
        /(&lt;\/?)([A-Za-z][\w-]*)|(&quot;[^&]*?&quot;)|(\{[^{}]*\})|(\s)([a-zA-Z][\w:-]*)(?==)/g,
        (m, lt, tag, str, expr, sp, attr) => {
          if (tag !== undefined) return `${lt}<span class="c-tag">${tag}</span>`;
          if (str !== undefined) return `<span class="c-str">${str}</span>`;
          if (expr !== undefined) return `<span class="c-str">${expr}</span>`;
          if (attr !== undefined) return `${sp}<span class="c-attr">${attr}</span>`;
          return m;
        },
      ),
    );
  }
  return out.join('\n');
}

/** The ```astro block in a component's README section. */
function readmeSample(name) {
  const md = readFileSync(README, 'utf8');
  const start = md.indexOf(`### \`${name}.astro\``);
  if (start < 0) return null;
  const next = md.indexOf('\n### ', start + 5);
  const section = md.slice(start, next < 0 ? undefined : next);
  const m = section.match(/```astro\n([\s\S]*?)```/);
  if (!m) return null;
  /**
   * The frontmatter fence some sections open with is an import example, not part
   * of the usage, and it names a path that only makes sense in that README. Drop
   * it — the docs page's own Setup link covers importing.
   */
  return m[1].replace(/^---\n[\s\S]*?\n---\n/, '').trimEnd();
}

const SENTINEL = /([ \t]*)<!-- code:astro -->\n[\s\S]*?([ \t]*)<!-- \/code:astro -->/;

const results = [];
const errors = [];

for (const file of readdirSync(COMPONENTS).filter((f) => f.endsWith('.astro'))) {
  const name = basename(file, '.astro');
  if (!isConverted(file)) continue;
  const page = join(DOCS, `component-${name.toLowerCase()}.html`);
  if (!existsSync(page)) continue;

  const src = readFileSync(page, 'utf8');
  if (!SENTINEL.test(src)) {
    errors.push(`${name}: docs/${basename(page)} has no <!-- code:astro --> … <!-- /code:astro --> pair`);
    continue;
  }
  const sample = readmeSample(name);
  if (!sample) {
    errors.push(`${name}: no \`\`\`astro block in its astro-components/README.md section to generate from`);
    continue;
  }

  const body = highlight(sample);
  const next = src.replace(SENTINEL, (_m, indent) => `${indent}<!-- code:astro -->\n${body}\n${indent}<!-- /code:astro -->`);

  const current = src === next;
  results.push({ name, page, lines: sample.split('\n').length, current });
  if (!CHECK && !current) writeFileSync(page, next);
}

if (errors.length) {
  console.error(`\n${red(`✖  ${errors.length} code sample${errors.length > 1 ? 's' : ''} cannot be generated`)}\n`);
  for (const e of errors) console.error(`    ${red('✖')} ${e}`);
  console.error(`\n  Each converted component needs a \`\`\`astro block in its README section and a`);
  console.error(`  <!-- code:astro --> sentinel pair in its docs page's Code section.\n`);
  process.exit(1);
}

const stale = results.filter((r) => !r.current);
if (CHECK && stale.length) {
  console.error(`\n${red(`✖  ${stale.length} code sample${stale.length > 1 ? 's' : ''} out of date`)}\n`);
  for (const r of stale) console.error(`    ${red('✖')} docs/${basename(r.page)} ${dim('— regenerate with `npm run build:code`')}`);
  console.error();
  process.exit(1);
}

const verb = CHECK ? 'current' : 'generated';
console.log(
  `\n${green(`✔  Code samples ${verb}`)} — ${results.length} converted component${results.length > 1 ? 's' : ''}, ` +
    `${results.reduce((a, r) => a + r.lines, 0)} lines from astro-components/README.md\n`,
);
