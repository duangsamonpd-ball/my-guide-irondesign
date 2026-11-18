#!/usr/bin/env node
/**
 * check:css-comments — no CSS comment closes before its author meant it to.
 *
 * Why this exists. On 2026-11-18 Notice's tokens were documented as "Badge's
 * dark fills and *\/300 accents" — a wildcard hue, written the way one writes
 * it in prose. In CSS `*\/` ENDS the comment, so everything after it was parsed
 * as CSS, and what the browser does with that text depends on where it lands:
 *
 *   - between rules, it becomes the start of the next rule's SELECTOR, which
 *     is then invalid, so the whole next rule is dropped — `.notice--info`
 *     lost its fill and its accent, in light and dark;
 *   - inside a declaration block, it runs on to the next `;`, swallowing the
 *     next declaration — `--color-notice-info-fill` vanished from `:root` and
 *     from `.dark`.
 *
 * Every gate was green. Nothing here parses CSS strictly: browsers recover
 * from the error silently, Tailwind and Astro pass the text through, and the
 * other four intents rendered correctly, so a page that "looked fine" was one
 * card short. It was found by someone reading the source. The comment was even
 * right; it was the text that ended it that was not.
 *
 * The test is exact rather than heuristic: walking the text the way a CSS
 * tokenizer does, a `*\/` met OUTSIDE a comment or a string is never valid CSS,
 * and a `/*` that never closes swallows the rest of the stylesheet. Both are
 * errors. (This header writes `*\/` with a backslash for the same reason.)
 *
 * SCOPE is every place this repo authors CSS: `tailwind/*.css`, `docs/*.css`,
 * and the `<style>` blocks of every `.astro` file and every docs page. The
 * generated files are scanned too — they carry the comments over, and a copy
 * a consumer loads is as broken as its source.
 *
 *   node scripts/check-css-comments.mjs
 *   node scripts/check-css-comments.mjs --self-test   prove it can fail
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELF_TEST = process.argv.includes('--self-test');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;

/**
 * Walk CSS as a tokenizer would — comments, then strings — and report every
 * `*\/` outside a comment and every unterminated comment. `base` is the line
 * the text starts on in its file, so a `<style>` block reports real lines.
 */
export function scan(css, base = 1) {
  const found = [];
  const lineAt = (i) => base + (css.slice(0, i).match(/\n/g)?.length ?? 0);
  let i = 0;
  let lastComment = null; // start of the comment that closed most recently
  while (i < css.length) {
    const two = css.slice(i, i + 2);
    if (two === '/*') {
      const end = css.indexOf('*/', i + 2);
      if (end < 0) {
        found.push({ line: lineAt(i), message: 'comment never closes — it swallows the rest of the stylesheet' });
        break;
      }
      lastComment = i;
      i = end + 2;
      continue;
    }
    if (two === '*/') {
      const opened = lastComment == null ? '' : ` (the comment opened on line ${lineAt(lastComment)} closed early)`;
      const tail = css.slice(i, css.indexOf('\n', i) < 0 ? undefined : css.indexOf('\n', i)).trim();
      found.push({ line: lineAt(i), message: `\`*/\` outside a comment${opened}: ${tail.slice(0, 60)}` });
      i += 2;
      continue;
    }
    const c = css[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== c && css[j] !== '\n') j += css[j] === '\\' ? 2 : 1;
      i = j + 1;
      continue;
    }
    i++;
  }
  return found;
}

/** The `<style>` blocks of an .astro or .html file, each with the line it starts on. */
function styleBlocks(text) {
  const out = [];
  for (const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) {
    const start = m.index + m[0].indexOf('>') + 1;
    out.push({ css: m[1], base: 1 + (text.slice(0, start).match(/\n/g)?.length ?? 0) });
  }
  return out;
}

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.includes(extname(name))) out.push(p);
  }
  return out;
}

if (SELF_TEST) {
  const cases = [
    ['the Notice comment between rules', '/* fills and */300 accents. */\n.a { color: red; }', 1],
    ['the Notice comment inside a block', ':root {\n  /* Light: */50 and */\n  --x: 1;\n}', 1],
    ['a clean comment', '/* fills and <hue>/300 accents */\n.a { color: red; }', 0],
    ['`*/` inside a string is content', '.a::after { content: "*/"; }', 0],
    ['`/*` inside a string opens nothing', ".a::after { content: '/*'; }\n.b { color: red; }", 0],
    ['an unterminated comment', '.a { color: red; }\n/* never closed\n.b { color: blue; }', 1],
    ['a universal selector is not a closer', '* { margin: 0; }\n.a > * { padding: 0; }', 0],
  ];
  let bad = 0;
  for (const [name, css, want] of cases) {
    const got = scan(css).length;
    const ok = got === want;
    if (!ok) bad++;
    console.log(`${ok ? green('✔') : red('✖')} ${name} ${dim(`(found ${got}, want ${want})`)}`);
  }
  // A line number is part of the answer: it must point at the stray closer.
  const ln = scan('a{}\n\n/* x */y */\n', 1)[0]?.line;
  if (ln !== 3) { bad++; console.log(red(`✖ line number: got ${ln}, want 3`)); }
  else console.log(`${green('✔')} the line reported is the stray closer's`);
  // The extractor must find a <style> block and offset its lines.
  const blocks = styleBlocks('<div/>\n<style is:global>\n.a{}\n/* */9 */\n</style>');
  const blockLn = blocks.length === 1 && scan(blocks[0].css, blocks[0].base)[0]?.line;
  if (blockLn !== 4) { bad++; console.log(red(`✖ <style> line offset: got ${blockLn}, want 4`)); }
  else console.log(`${green('✔')} a <style> block reports its file's line`);
  if (bad) { console.log(red(`\n✖  check:css-comments self-test: ${bad} case(s) wrong`)); process.exit(1); }
  console.log(green('\n✔  check:css-comments self-test: every planted closer is caught'));
  process.exit(0);
}

const sources = [];
for (const f of [...walk(join(ROOT, 'tailwind'), ['.css']), ...walk(join(ROOT, 'docs'), ['.css'])]) {
  sources.push({ file: f, blocks: [{ css: readFileSync(f, 'utf8'), base: 1 }] });
}
for (const f of [
  ...walk(join(ROOT, 'astro-components'), ['.astro']),
  ...walk(join(ROOT, 'playground/src'), ['.astro']),
  ...walk(join(ROOT, 'docs'), ['.html']),
]) {
  const blocks = styleBlocks(readFileSync(f, 'utf8'));
  if (blocks.length) sources.push({ file: f, blocks });
}

/* The floor. A scope that silently matched nothing would report a clean repo,
   so the two files this gate was written for must be in it. */
const rel = (f) => relative(ROOT, f);
for (const must of ['tailwind/tokens.css', 'astro-components/components/Notice.astro']) {
  if (!sources.some((s) => rel(s.file) === must)) {
    console.error(red(`✖  check:css-comments: ${must} was not scanned — the scope is wrong`));
    process.exit(1);
  }
}

let errors = 0;
let blocks = 0;
for (const { file, blocks: bs } of sources) {
  for (const b of bs) {
    blocks++;
    for (const f of scan(b.css, b.base)) {
      errors++;
      console.error(`${red('✖')} ${rel(file)}:${f.line}  ${f.message}`);
    }
  }
}
if (errors) {
  console.error(red(`\n✖  check:css-comments: ${errors} stray comment closer(s). The text after a \`*/\` is parsed as CSS —`));
  console.error(`   between rules it drops the NEXT RULE, inside a block it drops the NEXT DECLARATION.`);
  console.error(`   Reword it (\`<hue>/300\`, not \`*/300\`), then rebuild whatever is generated from it.`);
  process.exit(1);
}
console.log(green(`✔  check:css-comments: ${blocks} stylesheet(s) and <style> block(s) across ${sources.length} files, every comment closes where it means to`));
