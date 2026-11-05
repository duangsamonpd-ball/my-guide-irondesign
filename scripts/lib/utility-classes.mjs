/**
 * The class names a compiled Tailwind stylesheet emits a rule for.
 *
 * Asked once, here, because it was asked three times with the same regex —
 * `^\s*\.name`, a class at the START of a line — and that regex is a fact about
 * how Tailwind happened to print selectors, not about which classes exist.
 * Tailwind 4.3.4 moved every `group-*` variant from
 *
 *     .group-hover\:x:is(:where(.group):hover *)
 * to
 *     :is(:where(.group):hover .group-hover\:x)
 *
 * — same specificity, same elements — and the line-start regex lost all of them
 * at once. check:component-vars went red on 13 classes Tailwind was still
 * emitting; check:component-parity went quietly blind to the same classes and
 * stayed green, which is the worse of the two.
 *
 * So this reads every class in every selector prelude, wherever it sits, and
 * drops the MARKERS a variant matches against rather than styles: what sits in
 * `:where(...)` (`.group`, `.group/rail`), `:has(...)`, `:not(...)`, and a
 * single-compound `:is(.open)` from an arbitrary `group-[.open]`. A marker is a
 * class the author or a script writes, not one the stylesheet styles; counting
 * it would tell check:component-parity that a page wearing `open` needs
 * utilities.css. The `:is(...)` Tailwind now wraps the whole selector in holds a
 * space, so it is kept and its subject class is read.
 */
export function emittedClasses(css) {
  const out = new Set();
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, prelude] of src.matchAll(/([^{};]+)\{/g)) {
    const sel = prelude.trim();
    if (!sel || sel.startsWith('@')) continue;
    let bare = sel, prev;
    do {
      prev = bare;
      bare = bare
        .replace(/:is\((?:[^()\s\\]|\\.)*\)/g, '')
        .replace(/:(?:where|has|not)\((?:[^()\\]|\\.)*\)/g, '');
    } while (bare !== prev);
    for (const [, name] of bare.matchAll(/(?<![\w\\-])\.((?:[\w-]|\\.)+)/g)) {
      out.add(name.replace(/\\(.)/g, '$1'));
    }
  }
  return out;
}
