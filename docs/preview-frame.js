/**
 * Iron Software Design System — docs viewport preview
 *
 * The problem this solves: a component's responsive rules key off the VIEWPORT,
 * and every demo frame in these pages is pinned to 1440 by `.frame-scroll > * {
 * min-width }` in docs.css. Narrowing an element therefore proves nothing — the
 * media queries never fire. An iframe is the only box on a page that carries a
 * viewport of its own, so each preview loads its OWN page again with
 * `?frame=<region>` and keeps just that demo region.
 *
 * Same file, same markup, same stylesheet. Nothing is duplicated to make a
 * preview work, which is the whole reason this is one shared script rather than
 * a copy per page — the copies are exactly how the docs chrome drifted before
 * docs.css existed.
 *
 * Markup a page has to provide (see any of the three that use it):
 *
 *   <div class="vp">
 *     <div class="vp-bar">
 *       buttons [data-region="<demo region>"] and [data-w="<px>"], aria-pressed
 *       <output class="vp-w">
 *     </div>
 *     <div class="vp-stage">
 *       <div class="vp-shell" data-vp-layouts="1024:name,768:name,0:name">
 *         <iframe class="vp-frame" data-src>   ← data-src, NOT src; see below
 *         <div class="vp-grip" role="slider">
 *
 * `data-vp-layouts` is a descending list of `minWidth:label`. The label is what
 * the readout names, and naming it is the point of the control: a width on its
 * own does not tell you which layout you are looking at, and the boundary
 * between two of them is exactly where a mistake hides.
 *
 * Three things that are not obvious and were all wrong first time:
 *
 *  · The iframe holds `data-src` until this script promotes it. In `?frame=`
 *    mode the page still parses in FULL before the trim below runs, so a real
 *    `src` makes a preview load a nested copy of itself — a wasted document
 *    fetch that then aborts when the body is replaced, which reads in any
 *    request log exactly like a broken link.
 *  · Height comes from the content wrapper, never `documentElement.scrollHeight`
 *    — inside an iframe that can never report less than the frame's own viewport
 *    height, so an auto-sized frame grows and never shrinks.
 *  · The frame is ringed with a box-shadow, not a border (that part is in
 *    docs.css). `box-sizing: border-box` would take a border's 2px out of the
 *    iframe's own width, and a preview labelled 768 that is really rendering 766
 *    is worse than no preview.
 */
(function () {
  var region = new URLSearchParams(location.search).get('frame');
  var page = location.pathname.split('/').pop() || 'index.html';

  if (region) {
    /* Set before first paint so the page chrome never flashes in the iframe. */
    document.documentElement.classList.add('vp-only');
    onReady(function () { trim(region); });
    return;
  }
  onReady(wire);

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  /* ── inside the iframe: keep one demo region, report our height ─────────── */

  function trim(name) {
    /* Walk the comment pair build-demos.mjs writes rather than guessing at a
       wrapper selector — the same pairing preview.mjs uses to scope its probes.
       (Spelled without angle brackets in this comment on purpose: check:render
       scans the docs pages for that exact shape.) */
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
    var open = null, node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.trim() === 'demo:' + name) { open = node; break; }
    }

    var kept = null;
    if (open) {
      kept = document.createElement('div');
      for (var s = open.nextSibling; s; s = s.nextSibling) {
        if (s.nodeType === Node.COMMENT_NODE && s.nodeValue.trim() === '/demo:' + name) break;
        kept.appendChild(s.cloneNode(true));
      }
      document.body.replaceChildren(kept);
    }

    var post = function () {
      var h = kept ? Math.ceil(kept.getBoundingClientRect().height) : document.documentElement.scrollHeight;
      parent.postMessage({ vpHeight: h }, '*');
    };
    post();
    addEventListener('load', post);
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(post);
      ro.observe(document.documentElement);
      if (kept) ro.observe(kept);
    }
  }

  /* ── on the page itself: wire every preview it declares ─────────────────── */

  function wire() {
    document.querySelectorAll('.vp').forEach(function (root) {
      var shell = root.querySelector('.vp-shell');
      var frame = root.querySelector('.vp-frame');
      var grip = root.querySelector('.vp-grip');
      var out = root.querySelector('.vp-w');
      if (!shell || !frame || !grip) return;

      var marks = (shell.dataset.vpLayouts || '')
        .split(',')
        .map(function (s) {
          var i = s.indexOf(':');
          return i < 0 ? null : { min: parseInt(s.slice(0, i), 10), name: s.slice(i + 1).trim() };
        })
        .filter(function (m) { return m && !isNaN(m.min); })
        .sort(function (a, b) { return b.min - a.min; });

      function layoutAt(w) {
        for (var i = 0; i < marks.length; i++) if (w >= marks[i].min) return marks[i].name;
        return '';
      }

      var MIN = parseInt(shell.dataset.vpMin, 10) || 320;
      /* 1440 is the Figma canvas, and the ceiling has to be a width the DESIGN
         cares about rather than however wide the docs column happens to be.
         Clamping to the container looked tidy and made Product Menu's widest
         layout unreachable: its top threshold is 1180 and the column gives
         1104, so the one state you most want to check could not be shown. The
         stage scrolls for exactly this. */
      var MAX = parseInt(shell.dataset.vpMax, 10) || 1440;
      function maxWidth() { return Math.max(MIN, MAX); }

      function setWidth(w) {
        w = Math.round(Math.min(Math.max(w, MIN), maxWidth()));
        shell.style.width = w + 'px';
        var name = layoutAt(w);
        if (out) out.innerHTML = w + '<span>px</span>' + (name ? ' &nbsp;·&nbsp; <b>' + name + '</b>' : '');
        grip.setAttribute('aria-valuenow', w);
        grip.setAttribute('aria-valuemax', maxWidth());
        grip.setAttribute('aria-valuetext', w + ' pixels' + (name ? ', ' + name : ''));
        root.querySelectorAll('.vp-btn[data-w]').forEach(function (b) {
          b.setAttribute('aria-pressed', String(parseInt(b.dataset.w, 10) === w));
        });
      }

      function show(name) {
        root.querySelectorAll('.vp-btn[data-region]').forEach(function (b) {
          b.setAttribute('aria-pressed', String(b.dataset.region === name));
        });
        frame.src = page + '?frame=' + name;
      }

      addEventListener('message', function (e) {
        if (e.source === frame.contentWindow && e.data && typeof e.data.vpHeight === 'number') {
          frame.style.height = e.data.vpHeight + 'px';
        }
      });

      root.querySelectorAll('.vp-btn[data-w]').forEach(function (b) {
        b.addEventListener('click', function () { setWidth(parseInt(b.dataset.w, 10)); });
      });
      root.querySelectorAll('.vp-btn[data-region]').forEach(function (b) {
        b.addEventListener('click', function () { show(b.dataset.region); });
      });

      /* Pointer events, not mouse: one path covers mouse, trackpad, pen and
         touch, and setPointerCapture is what keeps the drag alive once the
         cursor outruns a 16px handle. */
      grip.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        grip.setPointerCapture(e.pointerId);
        var startX = e.clientX, startW = shell.getBoundingClientRect().width;
        /* The iframe swallows pointer events, so the drag would die the moment
           the cursor crossed back over it. */
        frame.style.pointerEvents = 'none';
        var move = function (ev) { setWidth(startW + (ev.clientX - startX)); };
        var up = function () {
          frame.style.pointerEvents = '';
          grip.removeEventListener('pointermove', move);
          grip.removeEventListener('pointerup', up);
          grip.removeEventListener('pointercancel', up);
        };
        grip.addEventListener('pointermove', move);
        grip.addEventListener('pointerup', up);
        grip.addEventListener('pointercancel', up);
      });

      /* Keyboard matters more here than it looks: dragging to find the exact
         pixel where a layout flips is how you check a breakpoint landed where
         it was meant to, and a mouse cannot do it reliably. */
      grip.addEventListener('keydown', function (e) {
        var step = e.shiftKey ? 1 : 16;
        var w = shell.getBoundingClientRect().width;
        if (e.key === 'ArrowLeft') setWidth(w - step);
        else if (e.key === 'ArrowRight') setWidth(w + step);
        else if (e.key === 'Home') setWidth(MIN);
        else if (e.key === 'End') setWidth(maxWidth());
        else return;
        e.preventDefault();
      });

      var startBtn = root.querySelector('.vp-btn[data-w][aria-pressed="true"]');
      var startRegion = root.querySelector('.vp-btn[data-region][aria-pressed="true"]')
        || root.querySelector('.vp-btn[data-region]');
      setWidth(startBtn ? parseInt(startBtn.dataset.w, 10) : 768);
      if (startRegion) show(startRegion.dataset.region);
    });
  }
})();
