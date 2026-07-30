# Playground

A real Astro app whose only job is to **render the design-system components to
HTML** so the demo markup in `docs/component-*.html` can be generated instead of
hand-typed. Nothing here is deployed.

## Why it exists

`npm run check:parity` proves a component's CSS matches its docs page. It says
nothing about the **markup**. Before this existed, every demo in the docs was
hand-written HTML imitating what a component renders — a second copy that drifted
silently. Adding a wrapper element or an `aria-` attribute to a component left
all five gates green while the docs quietly showed stale structure.

The drift was real, not hypothetical. When the first page was migrated, the
hand-written markup said `class="badge solid badge--success"` while the component
actually renders `class="badge badge--success solid"`, and
`docs/component-select.html` carried an `id="sel-demo-val"` on an element the
component gives no id at all.

## How it works

```
playground/src/pages/demos/badge.astro   ← you edit this
        │  astro build
        ▼
playground/dist/demos/badge.html         ← real rendered output (gitignored)
        │  scripts/build-demos.mjs
        ▼
docs/component-badge.html                ← written between <!-- demo:… --> sentinels
```

A demo page is `src/pages/demos/<name>.astro` and maps to
`docs/component-<name>.html` by name. Inside it, each region is a wrapper:

```astro
<div data-demo="preview">
  <Badge intent="success" dot>Active</Badge>
</div>
```

which is written into the matching sentinels in the docs page:

```html
<!-- demo:preview -->
<!-- /demo:preview -->
```

Every region the playground renders must have a sentinel and vice versa — the
script fails on either mismatch, so a demo can't be silently orphaned.

Docs-only layout chrome (`.cell`, `.lbl`, flex rows) goes **inside** the region
in the playground page, so the whole region is generated as one unit.

```bash
npm run build:demos    # from the repo root — render and rewrite the docs pages
npm run check:render   # the gate: fails if the docs are out of date
```

## What the generator normalises

Two kinds of noise in Astro's output must not reach the docs:

- **`data-astro-cid-…` scope attributes.** Every component `<style>` is scoped
  (none use `is:global`), and the hash changes whenever that style block is
  edited — snapshotting it would make the gate fail on unrelated CSS edits.
- **Per-render ids.** `Select` and `Tooltip` mint a `randomUUID()` id
  unconditionally, so they differ on every build; each distinct id is rewritten
  to a stable `<prefix>-demo-<n>`, which fixes its `aria-` and `for` references
  too. `Checkbox`, `Input` and `Textarea` also generate ids, but only as
  `id ?? name ?? random` — pass `name` (or `id`) in the demo and they are stable
  at the source, which is preferable.

The hoisted `<script type="module">` behaviour bundles are **kept**, so a demo in
the docs runs the component's real behaviour. They were stripped at first, on the
assumption that the demos were static previews. That was wrong:
`component-select.html` carried a hand-written reimplementation of the entire
listbox interaction — a fifth copy, which had already drifted (it drove an
`id="…-val"` the component never renders), and `component-tooltip.html` had one
for the hover behaviour. Both have been deleted in favour of the real script.

Scripts are masked out before anything else touches the markup: minified JS lives
on one line and is full of `<` and `>` (`i<n`, `=>`) that the tag scanner would
otherwise read as elements.

Indentation is rebuilt from real tag depth, because Astro indents each
component's output relative to its own source file. Line **breaks** are left
exactly where Astro put them: changing how much whitespace sits between two
inline elements is harmless (HTML collapses it), but adding or removing a break
changes whether there is any, which can shift the rendered layout.

## What is deliberately not generated

Not every component instance in a docs page is a usage demo. Left hand-written
on purpose, and excluded from the gate:

- **Anatomy diagrams** — the component there is distorted with inline overrides
  (`style="font-size:15px"`) that are not props it accepts.
- **Token-reference tables** — documentation prose that happens to contain a
  component.
- **Code panes** — syntax-highlighted snippets. These are a genuine fourth copy
  of the markup and a candidate for generating later, but they are not markup
  the browser renders.
- **State grids and isolated-part illustrations** — Select's States row, its
  "Menu & options" mock and Tooltip's Variants / Placement / Sizes grids are
  built from *partial* markup that isolates one visual state. Select's
  "Open / Focus" cell is a `.sel.open` with a trigger and no `.sel-menu` at all;
  Tooltip's Variants cells are a bare `.tt-bubble force-show` with no trigger,
  no `tabindex` and no aria. Rendering the real component in their place would
  need props that exist only to serve the docs, or would change how the page
  looks.

Coverage is therefore **per region, not per page**: a page can have a generated
Preview and hand-written illustrations below it.

## Status

| Component | Regions generated |
|---|---|
| Badge | 7 — preview, colours, subtle-solid, dark, variants, do, dont |
| TopNav | 3 — default, transparent, trimmed |
| ProductMenu | 2 — default, submenu |
| Select | 1 — preview |
| Tooltip | 1 — preview |

TopNav is the one where the value showed up immediately. Its brand mark grew a
second, full-colour SVG for the hover state, and that artwork had to be pasted
by hand into three separate lockups in the docs page — with nothing to catch a
missed one. Every region on that page is a complete component instance, so all
three are generated and `check:render` now fails the moment the docs and the
component disagree.

The remaining 12 components still have hand-written demo markup and are not
covered by `check:render`; each needs a `src/pages/demos/<name>.astro` and
sentinels added to its docs page.

## Dependency note

`package.json` declares a deliberately mixed pair:

```json
"@iron-software/astro-components": "*",       // workspace member
"@iron-software/design-system": "file:.."     // the ROOT package
```

`file:..` is required — npm workspaces cannot link the root package to its own
workspaces, and asking for `"@iron-software/design-system": "*"` fails with a
registry 404.
