/* ============================================================
   zoom.js - tap an image to open it big, then zoom and pan.

   Add this one line before </body> on any page that has images:
     <script src="../../assets/zoom.js" defer></script>

   It binds itself to every  .imgwrap img  and  .hero img  and
   injects its own CSS, so pages need nothing else.

   Controls: wheel / pinch / +- buttons = zoom
             drag = pan,  double click = toggle zoom
             Esc or backdrop or X = close

   Save this file as UTF-8 (no BOM), same as the HTML pages.
   A .js over file:// has no charset header, so the browser falls
   back to the page's charset - the pages all declare UTF-8, so the
   Japanese hint text below decodes correctly.
   ============================================================ */
(function () {
  'use strict';

  var SEL = '.imgwrap img, .hero img';
  var MIN = 1;
  var MAX = 6;
  var STEP = 1.35;

  /* ---------- styles ---------- */
  var CSS = [
    '.zoomable{cursor:zoom-in}',
    '.zv{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;display:none;',
    'background:rgba(4,16,34,.93);opacity:0;transition:opacity .2s ease}',
    '.zv.on{display:block}.zv.show{opacity:1}',
    '.zv-stage{position:absolute;top:0;left:0;right:0;bottom:0;overflow:hidden;touch-action:none;cursor:grab}',
    '.zv-stage.drag{cursor:grabbing}',
    '.zv-img{position:absolute;left:50%;top:50%;max-width:92vw;max-height:80vh;',
    'transform-origin:center center;border-radius:10px;display:block;',
    'box-shadow:0 30px 80px -30px rgba(0,0,0,.85);will-change:transform;',
    '-webkit-user-select:none;user-select:none;-webkit-user-drag:none}',
    '.zv-cap{position:absolute;top:16px;left:50%;transform:translateX(-50%);z-index:2;',
    'max-width:calc(100vw - 150px);padding:6px 17px;border-radius:999px;background:rgba(4,16,34,.72);',
    'font-family:"Zen Kaku Gothic New","Noto Sans JP",sans-serif;font-weight:700;font-size:15px;',
    'color:#fff;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.zv-bar{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);display:flex;',
    'align-items:center;gap:4px;background:#fff;border-radius:999px;padding:5px;',
    'box-shadow:0 14px 34px -12px rgba(0,0,0,.6)}',
    '.zv-bar button,.zv-x{font:inherit;border:0;background:transparent;color:#004aad;cursor:pointer;',
    'width:36px;height:36px;border-radius:50%;font-size:19px;line-height:1;display:flex;',
    'align-items:center;justify-content:center;transition:background .15s ease}',
    '.zv-bar button:hover,.zv-x:hover{background:rgba(0,74,173,.1)}',
    '.zv-bar button:disabled{opacity:.3;cursor:default;background:transparent}',
    '.zv-pct{font-family:"Outfit",sans-serif;font-weight:700;font-size:12px;color:#004aad;',
    'min-width:52px;text-align:center;letter-spacing:.04em;-webkit-user-select:none;user-select:none}',
    '.zv-x{position:absolute;top:16px;right:16px;width:42px;height:42px;background:#fff;',
    'font-size:22px;box-shadow:0 10px 26px -10px rgba(0,0,0,.6)}',
    '.zv-hint{position:absolute;left:50%;bottom:70px;transform:translateX(-50%);color:rgba(255,255,255,.8);',
    'font-family:"Noto Sans JP",sans-serif;font-size:11.5px;white-space:nowrap;pointer-events:none;',
    'background:rgba(4,16,34,.72);padding:5px 15px;border-radius:999px;transition:opacity .3s ease}',
    '@media(max-width:620px){.zv-cap{font-size:13px;padding:14px 58px}.zv-hint{display:none}',
    '.zv-img{max-width:96vw;max-height:76vh}}'
  ].join('');

  /* ---------- build the overlay once ---------- */
  var v, stage, img, cap, pct, bIn, bOut, bReset, hint;
  var scale = 1, tx = 0, ty = 0, opener = null, hintTimer = null;

  function build() {
    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);

    v = document.createElement('div');
    v.className = 'zv';
    v.setAttribute('role', 'dialog');
    v.setAttribute('aria-modal', 'true');
    /* HINT = "scroll to zoom / drag to move / Esc to close" in Japanese */
    var HINT = 'スクロールで拡大　' +
               'ドラッグで移動　Esc で閉じる';
    var MINUS = '−', RESET = '↺', TIMES = '×';

    v.innerHTML =
      '<div class="zv-stage"><img class="zv-img" alt=""></div>' +
      '<div class="zv-cap"></div>' +
      '<div class="zv-hint">' + HINT + '</div>' +
      '<div class="zv-bar">' +
        '<button class="zv-out" type="button" aria-label="zoom out">' + MINUS + '</button>' +
        '<span class="zv-pct">100%</span>' +
        '<button class="zv-in" type="button" aria-label="zoom in">+</button>' +
        '<button class="zv-reset" type="button" aria-label="reset">' + RESET + '</button>' +
      '</div>' +
      '<button class="zv-x" type="button" aria-label="close">' + TIMES + '</button>';
    document.body.appendChild(v);

    stage = v.querySelector('.zv-stage');
    img = v.querySelector('.zv-img');
    cap = v.querySelector('.zv-cap');
    pct = v.querySelector('.zv-pct');
    hint = v.querySelector('.zv-hint');
    bIn = v.querySelector('.zv-in');
    bOut = v.querySelector('.zv-out');
    bReset = v.querySelector('.zv-reset');

    bIn.addEventListener('click', function () { zoomAt(scale * STEP); });
    bOut.addEventListener('click', function () { zoomAt(scale / STEP); });
    bReset.addEventListener('click', reset);
    v.querySelector('.zv-x').addEventListener('click', close);

    /* click the empty area (not the picture) to close.
       moved != 0 means the click is the tail of a drag - ignore it */
    stage.addEventListener('click', function (e) {
      if (e.target === stage && !moved) close();
    });

    img.addEventListener('load', apply);

    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('dblclick', onDbl);
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    document.addEventListener('keydown', onKey);
  }

  /* ---------- transform ---------- */
  function apply() {
    var r = img.getBoundingClientRect();
    var w = r.width / scale, h = r.height / scale;   /* size at 100% */
    var slack = 60;
    var maxX = Math.max(0, (w * scale - window.innerWidth) / 2) + slack;
    var maxY = Math.max(0, (h * scale - window.innerHeight) / 2) + slack;
    tx = Math.max(-maxX, Math.min(maxX, tx));
    ty = Math.max(-maxY, Math.min(maxY, ty));

    img.style.transform =
      'translate(-50%,-50%) translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
    pct.textContent = Math.round(scale * 100) + '%';
    bIn.disabled = scale >= MAX - 0.001;
    bOut.disabled = scale <= MIN + 0.001;
    stage.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
  }

  /* zoom keeping the point under (px,py) in place; centre if omitted */
  function zoomAt(next, px, py) {
    next = Math.max(MIN, Math.min(MAX, next));
    if (next === scale) return;
    if (px == null) { px = window.innerWidth / 2; py = window.innerHeight / 2; }
    var cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    var k = next / scale;
    tx = px - cx - k * (px - cx - tx);
    ty = py - cy - k * (py - cy - ty);
    scale = next;
    if (scale === MIN) { tx = 0; ty = 0; }
    apply();
  }

  function reset() { scale = 1; tx = 0; ty = 0; apply(); }

  /* ---------- input ---------- */
  function onWheel(e) {
    e.preventDefault();
    zoomAt(scale * (e.deltaY < 0 ? 1.16 : 1 / 1.16), e.clientX, e.clientY);
    fadeHint();
  }

  function onDbl(e) {
    e.preventDefault();
    if (scale > 1.05) reset(); else zoomAt(2.5, e.clientX, e.clientY);
  }

  var pts = {}, last = null, pinch = 0, moved = 0;

  function onDown(e) {
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pts);
    if (ids.length === 1) {
      last = { x: e.clientX, y: e.clientY };
      moved = 0;
      if (scale > 1) stage.classList.add('drag');
      stage.setPointerCapture(e.pointerId);
    } else if (ids.length === 2) {
      pinch = dist(pts[ids[0]], pts[ids[1]]);
    }
    fadeHint();
  }

  function onMove(e) {
    if (!pts[e.pointerId]) return;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pts);

    if (ids.length >= 2) {
      var a = pts[ids[0]], b = pts[ids[1]];
      var d = dist(a, b);
      if (pinch > 0) zoomAt(scale * (d / pinch), (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = d;
      return;
    }
    if (last) {
      var dx = e.clientX - last.x, dy = e.clientY - last.y;
      moved += Math.abs(dx) + Math.abs(dy);
      if (scale > 1) { tx += dx; ty += dy; apply(); }
      last = { x: e.clientX, y: e.clientY };
    }
  }

  function onUp(e) {
    delete pts[e.pointerId];
    if (Object.keys(pts).length < 2) pinch = 0;
    if (!Object.keys(pts).length) { last = null; stage.classList.remove('drag'); }
    if (moved < 6) moved = 0;                       /* a real click, not a drag */
    else setTimeout(function () { moved = 0; }, 0); /* let the click fire first */
  }

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function onKey(e) {
    if (!v || !v.classList.contains('on')) return;
    if (e.key === 'Escape') { close(); }
    else if (e.key === '+' || e.key === '=') { zoomAt(scale * STEP); }
    else if (e.key === '-') { zoomAt(scale / STEP); }
    else if (e.key === '0') { reset(); }
    else if (e.key === 'ArrowLeft') { tx += 60; apply(); }
    else if (e.key === 'ArrowRight') { tx -= 60; apply(); }
    else if (e.key === 'ArrowUp') { ty += 60; apply(); }
    else if (e.key === 'ArrowDown') { ty -= 60; apply(); }
    else return;
    e.preventDefault();
  }

  function fadeHint() {
    if (!hint || hint.style.opacity === '0') return;
    hint.style.opacity = '0';
  }

  /* ---------- open / close ---------- */
  var scrollLock = '';

  function open(src, alt, from) {
    if (!v) build();
    opener = from || null;
    img.src = src;
    img.alt = alt || '';
    cap.textContent = alt || '';
    cap.style.display = alt ? '' : 'none';
    scale = 1; tx = 0; ty = 0; pts = {}; pinch = 0; last = null;
    hint.style.opacity = '';
    apply();

    scrollLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    v.classList.add('on');
    requestAnimationFrame(function () { v.classList.add('show'); });
    v.querySelector('.zv-x').focus();

    clearTimeout(hintTimer);
    hintTimer = setTimeout(fadeHint, 4000);
  }

  function close() {
    if (!v || !v.classList.contains('on')) return;
    v.classList.remove('show');
    document.body.style.overflow = scrollLock;
    setTimeout(function () {
      v.classList.remove('on');
      img.removeAttribute('src');
    }, 200);
    if (opener && opener.focus) opener.focus();
    opener = null;
  }

  /* ---------- bind the page images ---------- */
  function bind(el) {
    if (el.dataset.zoomBound) return;
    el.dataset.zoomBound = '1';
    el.classList.add('zoomable');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');

    el.addEventListener('click', function (e) {
      e.preventDefault();
      open(el.currentSrc || el.src, el.getAttribute('alt'), el);
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open(el.currentSrc || el.src, el.getAttribute('alt'), el);
      }
    });
  }

  function scan() {
    var list = document.querySelectorAll(SEL);
    for (var i = 0; i < list.length; i++) bind(list[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
})();
