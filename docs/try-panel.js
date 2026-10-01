/*
 * The "Try it" panel — one script for every component page that has one.
 *
 * A page carries a `[data-try-root]` block holding:
 *   · a <script type="application/json" data-try-config> — what can be picked;
 *   · a `<!-- demo:try -->` region of pre-rendered `[data-try]` elements, one per
 *     combination, each keyed by its values joined with spaces in config order;
 *   · `[data-try-controls]`, `[data-try-code]` and `[data-try-figma]` to fill in.
 *
 * Every visible example is rendered by the real component through the demo
 * pipeline; this script only chooses which one is shown and writes the two
 * lines under it — the code a developer writes and the properties a designer
 * sets in Figma. It never builds component markup, so check:render still owns
 * every pixel the panel can show.
 *
 * Config:
 *   {
 *     "component": "Badge",
 *     "label": "Badge",                     // the slot text in the code line
 *     "props": [{
 *       "name": "intent",                   // the prop, or a slot part's id
 *       "values": ["success", …],
 *       "default": "neutral",
 *       "kind": "enum" | "bool" | "slot-before" | "slot-after",
 *       "figma": "intent",                  // Figma property name
 *       "figmaValues": { "true": "On" },    // optional value renames for Figma
 *       "stage": { "ondark": "dark" }       // optional stage class per value
 *     }, …]
 *   }
 */
(function () {
  function init(root) {
    var cfgEl = root.querySelector('[data-try-config]');
    if (!cfgEl) return;
    var cfg = JSON.parse(cfgEl.textContent);
    var state = {};
    cfg.props.forEach(function (p) { state[p.name] = p.default; });

    var controls = root.querySelector('[data-try-controls]');
    cfg.props.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'try-row';
      var k = document.createElement('span');
      k.className = 'try-k';
      k.textContent = p.title || p.name;
      var seg = document.createElement('div');
      seg.className = 'vp-seg';
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', p.title || p.name);
      p.values.forEach(function (v) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'vp-btn';
        b.setAttribute('data-prop', p.name);
        b.setAttribute('data-value', v);
        b.textContent = p.kind === 'bool' || p.kind === 'slot-before' || p.kind === 'slot-after'
          ? (v === 'true' ? 'on' : 'off') : v;
        seg.appendChild(b);
      });
      row.appendChild(k);
      row.appendChild(seg);
      controls.appendChild(row);
    });

    function codeLine() {
      var attrs = [], before = '', after = '';
      cfg.props.forEach(function (p) {
        var v = state[p.name];
        if (p.kind === 'enum' && v !== p.default) attrs.push(p.name + '="' + v + '"');
        if (p.kind === 'bool' && v === 'true') attrs.push(p.name);
        if (p.kind === 'slot-before' && v === 'true') before = '<svg … /> ';
        if (p.kind === 'slot-after' && v === 'true') after = ' <svg … />';
      });
      return '<' + cfg.component + (attrs.length ? ' ' + attrs.join(' ') : '') + '>' + before + cfg.label + after + '</' + cfg.component + '>';
    }

    function figmaLine() {
      return cfg.props.filter(function (p) { return p.figma; }).map(function (p) {
        var v = state[p.name];
        return p.figma + '=' + ((p.figmaValues && p.figmaValues[v]) || v);
      }).join(' · ');
    }

    var stage = root.querySelector('.try-stage');
    function render() {
      var key = cfg.props.map(function (p) { return state[p.name]; }).join(' ');
      root.querySelectorAll('[data-try]').forEach(function (el) { el.hidden = el.getAttribute('data-try') !== key; });
      root.querySelectorAll('[data-prop]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(state[b.getAttribute('data-prop')] === b.getAttribute('data-value')));
      });
      var stageClass = '';
      cfg.props.forEach(function (p) { if (p.stage && p.stage[state[p.name]]) stageClass = p.stage[state[p.name]]; });
      if (stage) stage.setAttribute('data-stage', stageClass);
      root.querySelector('[data-try-code]').textContent = codeLine();
      root.querySelector('[data-try-figma]').textContent = figmaLine();
    }

    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-prop]');
      if (!b || !root.contains(b)) return;
      state[b.getAttribute('data-prop')] = b.getAttribute('data-value');
      render();
    });
    render();
  }

  function initAll() { document.querySelectorAll('[data-try-root]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll);
  else initAll();
})();
