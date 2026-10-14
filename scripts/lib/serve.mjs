/**
 * The one static server every browser harness here uses.
 *
 * Until 2026-10-14 there were seven of them — check-overflow, check-layout,
 * check-figma-size, check-wide, preview, state-diff and style-diff each wrote
 * its own `createServer` with its own MIME table, and they had drifted: five
 * agreed, state-diff's had no `.webp` or `.jpg`, style-diff's had no `.woff2`,
 * and those two were the ones that did not confine a path to its root. Some
 * served their fixture through the font rewrite and some did not. Every probe
 * written that day to answer a one-off question began by copying one of them. Same shape as the per-page CSS copies retired the
 * same morning: a thing written seven times is a thing that is different in
 * seven ways, and nothing checks which difference was meant.
 *
 * What every caller needs, in the order it is tried:
 *
 *   1. A path that will not decode is a 400, not a crash and not a 404 — an
 *      asset committed with a `%` in its name is broken in the browser, and
 *      serving it raw would hide a bug the browser is right about.
 *   2. Vendored fonts (`serveFonts`), so no harness touches the network.
 *   3. FIXTURES, served EXACTLY as given. Not through the font rewrite: the
 *      overflow self-test has a fixture that must render WITHOUT Montserrat so
 *      its font check can be seen to refuse it, and `useLocalFonts` adds a link
 *      to any page that lacks one. A caller wanting fonts on a fixture wraps it.
 *   4. `handle(path)` — the caller's own route, for the one shape that is not a
 *      file on disk (the playground demos with their styles injected).
 *   5. Each root in turn, then each root's `assets/` by basename — a generated
 *      demo asks for `assets/logo.svg` relative to wherever it is mounted.
 *      Nothing outside a root is served.
 *   6. HTML from disk goes through `html` (default `useLocalFonts`): the docs
 *      pages link Google Fonts as they ship, and that link is what made every
 *      harness flaky before the fonts were vendored.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname, sep } from 'node:path';
import { serveFonts, useLocalFonts } from './local-fonts.mjs';

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const inside = (root, file) => file === root || file.startsWith(root.endsWith(sep) ? root : root + sep);

/**
 * @param {object}   o
 * @param {string[]} o.roots      directories to serve, tried in order
 * @param {object}   [o.fixtures] path → html string or () => string, served as given
 * @param {Function} [o.handle]   async (path) => ({ body, type } | null), tried before the roots
 * @param {Function} [o.html]     transform for HTML read from disk; default useLocalFonts
 * @param {boolean}  [o.assets]   fall back to <root>/assets/<basename>; default true
 * @returns {Promise<{ server, origin: string, close: () => void }>}
 */
export async function serveStatic({ roots, fixtures = {}, handle = null, html = useLocalFonts, assets = true }) {
  const server = createServer(async (req, res) => {
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
    catch { res.writeHead(400).end('bad escape in URL'); return; }

    const font = await serveFonts(path);
    if (font) { res.writeHead(200, { 'content-type': font.type }).end(font.body); return; }

    if (Object.hasOwn(fixtures, path)) {
      const f = fixtures[path];
      res.writeHead(200, { 'content-type': MIME['.html'] }).end(typeof f === 'function' ? f() : f);
      return;
    }

    if (handle) {
      const hit = await handle(path);
      if (hit) { res.writeHead(200, { 'content-type': hit.type ?? MIME['.html'] }).end(hit.body); return; }
    }

    const rel = path === '/' ? '/index.html' : path;
    const tries = roots.map((r) => [r, join(r, normalize(rel))]);
    const asset = assets && rel.match(/\/assets\/(.+)$/);
    if (asset) for (const r of roots) tries.push([r, join(r, 'assets', asset[1])]);

    for (const [root, file] of tries) {
      if (!inside(root, file)) continue;
      try {
        const body = await readFile(file);
        const ext = extname(file);
        res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
        res.end(ext === '.html' && html ? html(body.toString('utf8')) : body);
        return;
      } catch { /* next candidate */ }
    }
    res.writeHead(404, { 'content-type': 'text/plain' }).end(`not found: ${path}`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
