/**
 * Iron Software Design System — where the components are, asked once
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * `astro-components/` holds components in two folders, and the difference is a
 * PUBLISHING decision, not a structural one:
 *
 *   components/   exported from the barrel, documented, in the manifest's
 *                 public `components` array. `check:exports` requires all three.
 *   internal/     rendered BY those components and reachable through the
 *                 package's `./internal/*` export, but deliberately not in the
 *                 barrel — Ball's ruling, 2026-08-19, on FlyoutMenu.
 *
 * Until 2026-08-26 every script decided for itself which of the two it walked,
 * by writing the paths out again. Four knew about `internal/`; the rest read
 * `components/` alone, so MOVING A FILE INTO `internal/` SILENTLY REMOVED IT
 * FROM THEM. That is not hypothetical: `check:parity` stopped asking about
 * FlyoutMenu the day it moved, its docs page went on serving a copy of the CSS
 * from before the move, and three measurements of that page agreed with each
 * other and with nothing real.
 *
 * The prose was wrong too, and had no way not to be — three components carried
 * a comment saying "Two scripts must know this folder exists" when the answer
 * had become four. A count in prose is a fact nothing checks.
 *
 * So there is one enumerator, and it is derived: everything under
 * `astro-components/` that is a component is returned, with `internal` as DATA
 * rather than as a folder each caller has to remember.
 *
 * ── THE PART THAT MAKES IT A CHECK ─────────────────────────────────────────
 *
 * An `.astro` file under `astro-components/` that is in NEITHER declared folder
 * THROWS. A future third folder, or a component dropped at the package root,
 * cannot quietly be invisible to every gate that uses this — which is the exact
 * failure mode this module was written after.
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, basename } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PKG = join(ROOT, 'astro-components');

/** The two folders, and what being in each one means. */
export const COMPONENT_DIRS = [
  { rel: 'astro-components/components', internal: false },
  { rel: 'astro-components/internal', internal: true },
];

/* Build output and dependencies are not source. `.astro` is Astro's own cache
   directory — it is gitignored, and it is a DIRECTORY whose name ends in
   `.astro`, which a naive `find -name '*.astro'` counts as a component. */
const SKIP = new Set(['node_modules', '.astro', 'dist', '.git']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.astro')) out.push(full);
  }
  return out;
}

/**
 * Every component in the package.
 *
 * Returns `{ name, file, rel, internal }` sorted by folder then name, where
 * `rel` is repo-relative so a caller can print it. Throws on a component that
 * sits outside both declared folders.
 */
export function componentSources() {
  const found = walk(PKG).map((full) => relative(ROOT, full));
  const claimed = [];
  const unclaimed = [];

  for (const rel of found) {
    const dir = COMPONENT_DIRS.find((d) => rel.startsWith(d.rel + '/'));
    if (!dir) { unclaimed.push(rel); continue; }
    claimed.push({
      name: basename(rel, '.astro'),
      file: join(ROOT, rel),
      rel,
      internal: dir.internal,
    });
  }

  if (unclaimed.length) {
    throw new Error(
      `${unclaimed.length} component(s) sit outside every folder scripts/lib/sources.mjs knows about:\n` +
        unclaimed.map((r) => `      ${r}`).join('\n') +
        `\n   Add the folder to COMPONENT_DIRS and say what being in it means, or move the file.\n` +
        `   A component nothing enumerates is a component no gate checks.`,
    );
  }

  /* Code-unit order inside each group, NOT localeCompare: this feeds a
     generated file, and the previous enumerator was `readdirSync().sort()`.
     The two disagree — locale order puts `Textarea` before `TextLink`, code
     units put `TextLink` first — and swapping them would have rewritten the
     manifest with no change of content, which is churn a reviewer has to read
     past. Same order in, same bytes out. */
  return claimed.sort((a, b) =>
    a.internal === b.internal ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : a.internal ? 1 : -1,
  );
}

/** Just the public ones — what the barrel exports and the docs document. */
export const publicSources = () => componentSources().filter((c) => !c.internal);

/** Just the internal ones. */
export const internalSources = () => componentSources().filter((c) => c.internal);

/**
 * Shared `.ts` modules that carry Tailwind CLASS STRINGS, not just types.
 *
 * They are declared here for the same reason the folders are. Tailwind only
 * emits a utility it has SEEN, and it scans `.astro` — so a class string living
 * in a `.ts` file reaches the stylesheet only if a script was told about that
 * file. CLAUDE.md warned that a new shared module "must be named in two
 * scripts". By 2026-08-26 the list `['field.ts', 'choice.ts']` was written out
 * in THREE (`build-utilities`, `check-component-vars`, `check-type-weight`) and
 * derived by regex in a fourth (`check-exports`, which read it out of
 * build-utilities' source). Every one of those was a place to forget.
 *
 * `icons.ts` and `index.ts` are deliberately absent: the first is path data and
 * the second is the barrel. Neither carries a class string, and adding them
 * would make Tailwind scan files that can only produce false positives.
 */
export const SHARED_MODULES = ['field.ts', 'choice.ts'];

/** Absolute paths of the shared modules that actually exist. */
export function sharedModuleFiles() {
  return SHARED_MODULES.map((f) => join(PKG, f)).filter((f) => existsSync(f));
}
