// @ts-check
import { defineConfig } from 'astro/config';

/**
 * The playground exists to render components to real HTML, which
 * scripts/build-demos.mjs then extracts and injects into the docs pages.
 * Nothing here is deployed, so the config optimises for a stable, readable
 * build output rather than for shipping.
 *
 *   build.format: 'file'   → dist/demos/badge.html, not dist/demos/badge/index.html
 *   compressHTML: false    → keep Astro's own indentation so extracted markup is legible
 *   inlineStylesheets      → irrelevant to extraction; CSS parity is check:parity's job
 */
export default defineConfig({
  build: { format: 'file' },
  compressHTML: false,
  devToolbar: { enabled: false },
});
