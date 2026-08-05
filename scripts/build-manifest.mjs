#!/usr/bin/env node
/**
 * Iron Software Design System — component manifest generator
 *
 * Writes `astro-components/components.json`: a machine-readable index of every
 * component, its props, their types, defaults and doc comments, the Figma nodes
 * it was built from, and where its docs page lives.
 *
 * Why generate rather than write it: the prop tables in README.md are prose, and
 * prose was the last hand-kept surface in this repo that nothing watched — which
 * is exactly how FooterBar shipped and went four commits undocumented. This
 * reads the components themselves, so it cannot describe a prop that does not
 * exist.
 *
 * Consumers: editor tooling and agents that need the component API without
 * parsing Astro, and anything that wants to diff the surface between versions.
 *
 * Run:   node scripts/build-manifest.mjs
 * Check: node scripts/build-manifest.mjs --check   → exit 1 if stale
 *
 * Zero dependencies. The parsing is deliberately shallow and strict: it handles
 * the one `interface Props` shape every component in this repo uses, and throws
 * rather than guessing if a component ever stops matching it.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENTS = join(ROOT, 'astro-components/components');
const OUT = join(ROOT, 'astro-components/components.json');
const CHECK = process.argv.includes('--check');

/** The frontmatter fence — everything the component computes lives between them. */
function frontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : '';
}

/**
 * Balanced-brace slice of `interface Props { … }`. A regex cannot do this: a
 * prop typed with an inline object literal contains braces of its own.
 */
function propsBlock(fm) {
  const start = fm.search(/interface\s+Props\s*\{/);
  if (start === -1) return null;
  const open = fm.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < fm.length; i++) {
    if (fm[i] === '{') depth++;
    else if (fm[i] === '}' && --depth === 0) return fm.slice(open + 1, i);
  }
  throw new Error('unterminated interface Props');
}

/**
 * Split a destructuring body on its top-level commas.
 *
 * Depth alone is not enough. A default value can be a string containing commas
 * ('205 N. Michigan Ave. Chicago, IL 60611, USA') or a comment containing them,
 * and splitting inside either truncates the default at the first comma — which
 * is exactly what this did on TopNav.address before it tracked quotes.
 */
function splitTopLevel(body) {
  const parts = [];
  let cur = '';
  let depth = 0;
  let quote = null;      // "'" | '"' | '`'
  let comment = null;    // 'line' | 'block'
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    const next = body[i + 1];

    if (comment) {
      cur += ch;
      if (comment === 'line' && ch === '\n') comment = null;
      else if (comment === 'block' && ch === '*' && next === '/') { cur += next; i++; comment = null; }
      continue;
    }
    if (quote) {
      cur += ch;
      if (ch === '\\') { cur += next ?? ''; i++; }
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && next === '/') { comment = 'line'; cur += ch; continue; }
    if (ch === '/' && next === '*') { comment = 'block'; cur += ch; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; cur += ch; continue; }

    if ('{[('.includes(ch)) depth++;
    else if ('}])'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

/** Defaults, read from the `const { … } = Astro.props` destructuring. */
function defaults(fm) {
  const m = fm.match(/const\s*\{([\s\S]*?)\}\s*=\s*Astro\.props/);
  if (!m) return {};
  const out = {};
  const parts = splitTopLevel(m[1]);
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    const eq = p.indexOf('=');
    if (eq === -1) continue;
    // `class: className = 'x'` — the prop is the name before the colon.
    const name = p.slice(0, eq).split(':')[0].trim();
    out[name] = p.slice(eq + 1).trim();
  }
  return out;
}

/** Split the interface body into entries, keeping each one's leading comment. */
function parseProps(body, defs) {
  const props = [];
  let doc = null;
  // One pass, line-aware, so a `/** … */` above a prop stays attached to it.
  const lines = body.split('\n');
  let buffer = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('/*')) {
      buffer = [];
      let l = line;
      while (true) {
        buffer.push(l.replace(/^\/\*\*?|\*\/$|^\*/g, '').trim());
        if (l.includes('*/')) break;
        l = (lines[++i] ?? '').trim();
      }
      doc = buffer.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || null;
      continue;
    }
    if (line.startsWith('//')) { doc = line.replace(/^\/\/\s*/, ''); continue; }

    const m = line.match(/^([A-Za-z_$][\w$]*)(\??):\s*(.+?);?$/);
    if (!m) { doc = null; continue; }
    const [, name, optional, type] = m;
    const entry = { name, type: type.replace(/;$/, '').trim(), required: optional !== '?' };
    if (defs[name] !== undefined) entry.default = defs[name];
    if (doc) entry.description = doc;
    props.push(entry);
    doc = null;
  }
  return props;
}

/* ── build ───────────────────────────────────────────────────────────────── */

const files = readdirSync(COMPONENTS).filter((f) => f.endsWith('.astro')).sort();
const components = [];

for (const file of files) {
  const name = basename(file, '.astro');
  const src = readFileSync(join(COMPONENTS, file), 'utf8');
  const fm = frontmatter(src);
  const body = propsBlock(fm);
  if (body === null) throw new Error(`${file}: no \`interface Props\` — the manifest parser expects one`);

  // Figma node ids, written as `node 507:5349` or `node 776-899` in the header.
  const nodes = [...new Set([...src.matchAll(/node\s+(\d+[:-]\d+)/g)].map((m) => m[1].replace('-', ':')))];
  const docsPage = `docs/component-${name.toLowerCase()}.html`;

  components.push({
    name,
    file: `astro-components/components/${file}`,
    docs: existsSync(join(ROOT, docsPage)) ? docsPage : null,
    interactive: /<script\b/.test(src),
    figmaNodes: nodes,
    props: parseProps(body, defaults(fm)),
  });
}

const manifest = {
  $comment: 'GENERATED by scripts/build-manifest.mjs — do not hand-edit. Run `npm run build:manifest`.',
  name: '@iron-software/astro-components',
  count: components.length,
  components,
};

const next = JSON.stringify(manifest, null, 2) + '\n';
const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;

if (CHECK) {
  if (next !== current) {
    console.log(`\n\x1b[31m✖  astro-components/components.json is stale\x1b[0m`);
    console.log(`\n  Run \x1b[1mnpm run build:manifest\x1b[0m and commit the result.\n`);
    process.exit(1);
  }
  const propCount = components.reduce((n, c) => n + c.props.length, 0);
  console.log(`\n\x1b[32m✔  Manifest current — ${components.length} components, ${propCount} props described from source\x1b[0m\n`);
} else {
  writeFileSync(OUT, next);
  const propCount = components.reduce((n, c) => n + c.props.length, 0);
  console.log(`\n\x1b[32m✔  Manifest written — ${components.length} components, ${propCount} props\x1b[0m\n`);
}
