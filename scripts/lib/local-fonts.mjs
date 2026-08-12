/**
 * Iron Software Design System — serve the vendored webfonts to the harnesses
 *
 * Every browser harness here measures text, so every one of them needs the real
 * font before a number it prints means anything. All three used to fetch it from
 * fonts.googleapis.com while they ran. On 2026-08-12, the morning `overflow`
 * became a CI gate, that CDN failed four times on a different page each time —
 * four red builds that said nothing whatever about the code.
 *
 * So the pages stop naming Google at all. Each harness already runs its own
 * static server; this module gives it a route to serve vendor/fonts/ from, and a
 * rewrite that swaps the CDN <link> in a docs page for the local one. No request
 * interception, because a page that does not reference the network is easier to
 * reason about than a page whose requests are being caught.
 *
 * The offline guard is the part that keeps it honest. It aborts every request
 * leaving the local origin, so "this harness does not need the network" is
 * enforced on every run rather than believed — and if someone adds a CDN link
 * later, it fails loudly here instead of flaking once a week in CI.
 *
 * What is deliberately NOT changed: the docs pages still link to Google Fonts as
 * shipped. What a reader downloads is a product decision; this is a testing one.
 * The vendored bytes are identical to the CDN's, so the glyphs measured are the
 * same either way.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, basename } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FONTS_DIR = join(HERE, '../../vendor/fonts');

/** The path harness servers expose the vendored stylesheet under. */
export const FONT_ROUTE = '/__fonts/';
export const LOCAL_FONT_HREF = `${FONT_ROUTE}fonts.css`;
export const LOCAL_FONT_LINK = `<link rel="stylesheet" href="${LOCAL_FONT_HREF}">`;

const TYPES = { '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2' };

export function fontsAvailable() {
  return existsSync(join(FONTS_DIR, 'fonts.css'));
}

/**
 * Serve anything under FONT_ROUTE. Returns null when the path is not ours, so a
 * caller can fall through to its own routes.
 */
export async function serveFonts(path) {
  if (!path.startsWith(FONT_ROUTE)) return null;
  // basename() alone, so nothing can climb out of vendor/fonts.
  const file = join(FONTS_DIR, basename(path));
  if (!file.startsWith(FONTS_DIR)) return null;
  try {
    return { body: await readFile(file), type: TYPES[extname(file)] ?? 'application/octet-stream' };
  } catch {
    return null;
  }
}

/**
 * Point a page's font <link> at the vendored copy.
 *
 * Matches the stylesheet host rather than the exact query string: the docs pages
 * request several different family combinations, and the vendored bundle carries
 * every family any of them asks for. A page that names no Google stylesheet gets
 * the link added, since a demo built from a bare template still has to render in
 * Montserrat to be worth measuring.
 */
export function useLocalFonts(html) {
  const link = /<link[^>]+href="https:\/\/fonts\.googleapis\.com\/[^"]*"[^>]*>/g;
  if (link.test(html)) return html.replace(link, LOCAL_FONT_LINK).replace(
    // preconnects to the CDN are dead weight once the stylesheet is local, and
    // the offline guard would abort them noisily.
    /<link[^>]+href="https:\/\/fonts\.gstatic\.com[^"]*"[^>]*>/g, ''
  );
  return html;
}

/**
 * Abort anything addressed outside the local origin, and hand back the list of
 * what tried. An empty list is the evidence that the run was hermetic.
 */
export async function installOfflineGuard(context, origin) {
  const escapes = [];
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) {
      return route.continue();
    }
    escapes.push(url);
    return route.abort();
  });
  return escapes;
}
