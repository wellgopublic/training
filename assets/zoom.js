/* ============================================================
   zoom.js - tap an image to open it big, then zoom, pan and draw.

   Add this one line before </body> on any page that has images:
     <script src="../../assets/zoom.js" defer></script>

   It binds itself to every  .imgwrap img  and  .hero img  and
   injects its own CSS, so pages need nothing else.

   Controls: wheel / pinch / +- buttons = zoom
             drag = pan,  double click = toggle zoom
             pencil button = draw on top of the picture
             Esc or backdrop or X = close

   Draw mode: the round button opens a palette - eight colours and
             a slider for the line width. Then drag on the picture
             with ペン (draw) or 消す (erase). Shift+drag still pans
             and two fingers still pinch / move, so you can zoom in
             on a landmark and keep drawing.
   Strokes are kept per image while the tab is open, so closing
   and re-opening the same picture brings the marks back.
   Nothing is written to the PNG - the file itself never changes.

   The picture and the canvas sit in .zv-frame, and the frame is
   sized in JS (fitFrame) instead of by CSS max-width, so the two
   always line up exactly - that is what keeps a drawn line under
   the finger at every zoom level.

   Save this file as UTF-8 (no BOM), same as the HTML pages.
   A .js over file:// has no charset header, so the browser falls
   back to the page's charset - the pages all declare UTF-8, so the
   Japanese text below decodes correctly.
   ============================================================ */
(function () {
  'use strict';

  var SEL = '.imgwrap img, .hero img';
  var MIN = 1;
  var MAX = 6;
  var STEP = 1.35;
  var MAXDIM = 2400;          /* canvas 長辺の上限。大きい絵でも重くしない */

  var HINT_VIEW = 'スクロールで拡大　ドラッグで移動　Esc で閉じる';

  /* 色えらび。はじめの2つは筋肉ページの --origin / --insert と同じ色 */
  var SWATCHES = [
    '#e5326b', '#0e9bd6', '#22c55e', '#f5b301',
    '#a855f7', '#ff6a00', '#ffffff', '#111111'
  ];
  var WMIN = 1, WMAX = 20, WDEF = 3;   /* 線の太さ。絵の大きさに合わせて倍される */

  /* ---------- styles ---------- */
  var CSS = [
    '.zoomable{cursor:zoom-in}',
    '.zv{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;display:none;',
    'background:rgba(4,16,34,.93);opacity:0;transition:opacity .2s ease}',
    '.zv.on{display:block}.zv.show{opacity:1}',
    '.zv-stage{position:absolute;top:0;left:0;right:0;bottom:0;overflow:hidden;touch-action:none;',
    'display:flex;align-items:center;justify-content:center;cursor:grab}',
    '.zv-stage.drag{cursor:grabbing}',
    '.zv-frame{position:relative;flex:none;line-height:0;transform-origin:center center;',
    'will-change:transform;border-radius:10px;box-shadow:0 30px 80px -30px rgba(0,0,0,.85)}',
    '.zv-img{display:block;width:100%;height:100%;border-radius:10px;',
    '-webkit-user-select:none;user-select:none;-webkit-user-drag:none}',
    '.zv-cv{position:absolute;left:0;top:0;width:100%;height:100%;border-radius:10px;',
    'pointer-events:none;touch-action:none}',
    '.zv.pen .zv-cv{pointer-events:auto;cursor:crosshair}',
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
    '.zv-pen.on,.zv-pen.on:hover{background:#004aad;color:#fff}',
    '.zv-pct{font-family:"Outfit",sans-serif;font-weight:700;font-size:12px;color:#004aad;',
    'min-width:52px;text-align:center;letter-spacing:.04em;-webkit-user-select:none;user-select:none}',
    '.zv-x{position:absolute;top:16px;right:16px;width:42px;height:42px;background:#fff;',
    'font-size:22px;box-shadow:0 10px 26px -10px rgba(0,0,0,.6)}',
    /* ---- ペンの道具箱 ---- */
    '.zv-tools{position:absolute;left:50%;bottom:68px;transform:translateX(-50%);display:none;',
    'align-items:center;justify-content:center;flex-wrap:wrap;gap:5px;background:#fff;',
    'border-radius:22px;padding:6px 8px;max-width:calc(100vw - 24px);',
    'box-shadow:0 14px 34px -12px rgba(0,0,0,.6)}',
    '.zv.pen .zv-tools{display:flex}',
    '.zv-tools button{font-family:"Zen Kaku Gothic New","Noto Sans JP",sans-serif;font-weight:700;',
    'border:0;cursor:pointer;line-height:1;padding:0;',
    'transition:box-shadow .15s ease,background .15s ease}',
    /* いまの色。押すと下のパレットがひらく */
    '.zv-color{width:36px;height:36px;border-radius:50%;background:rgba(0,74,173,.08);',
    'display:flex;align-items:center;justify-content:center;flex:none}',
    '.zv-color.on{background:#004aad}',
    '.zv-color i{display:block;width:20px;height:20px;border-radius:50%;',
    'box-shadow:inset 0 0 0 2px rgba(255,255,255,.92),0 0 0 1px rgba(0,0,0,.2)}',
    /* .zv-tools button より弱いと padding:0 に負けるので、同じ強さで書く */
    '.zv-tools .zv-t,.zv-tools .zv-act{height:36px;padding:0 14px;border-radius:999px;',
    'background:rgba(0,74,173,.08);color:#004aad;font-size:12px;white-space:nowrap}',
    '.zv-tools .zv-t.on{background:#004aad;color:#fff}',
    '.zv-tools .zv-act{font-size:15px}',
    '.zv-sep{width:1px;height:22px;background:rgba(0,74,173,.18);margin:0 3px;flex:none}',
    /* ---- 色と太さのパレット ---- */
    '.zv-pop{display:none;position:absolute;left:50%;bottom:calc(100% + 9px);',
    'transform:translateX(-50%);background:#fff;border-radius:18px;padding:11px;',
    'box-shadow:0 16px 38px -12px rgba(0,0,0,.6)}',
    '.zv-pop.on{display:block}',
    '.zv-sw{display:grid;grid-template-columns:repeat(4,42px);gap:9px;justify-content:center}',
    '.zv-sw button{width:42px;height:42px;border-radius:50%;',
    'box-shadow:inset 0 0 0 1px rgba(0,0,0,.22)}',
    '.zv-sw button.on{box-shadow:inset 0 0 0 2px #fff,0 0 0 3px #004aad}',
    '.zv-size{display:flex;align-items:center;gap:11px;margin-top:11px;padding-top:11px;',
    'border-top:1px solid rgba(0,74,173,.14)}',
    '.zv-prev{width:38px;height:38px;flex:none;display:flex;align-items:center;justify-content:center;',
    'background:rgba(0,74,173,.07);border-radius:12px}',
    '.zv-prev i{display:block;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.2)}',
    '.zv-size input{flex:1;min-width:120px;accent-color:#004aad;height:38px}',
    '.zv-hint{position:absolute;left:50%;bottom:70px;transform:translateX(-50%);color:rgba(255,255,255,.8);',
    'font-family:"Noto Sans JP",sans-serif;font-size:11.5px;white-space:nowrap;pointer-events:none;',
    'background:rgba(4,16,34,.72);padding:5px 15px;border-radius:999px;transition:opacity .3s ease}',
    '.zv.pen .zv-hint{display:none}',
    '@media(max-width:620px){.zv-cap{font-size:13px;padding:14px 58px}.zv-hint{display:none}',
    '.zv-tools{bottom:64px;gap:4px;padding:5px 6px}',
    '.zv-color{width:32px;height:32px}.zv-color i{width:18px;height:18px}',
    '.zv-tools .zv-t,.zv-tools .zv-act{height:32px;padding:0 11px;font-size:11px}',
    '.zv-sw{grid-template-columns:repeat(4,38px);gap:8px}',
    '.zv-sw button{width:38px;height:38px}.zv-size input{min-width:96px}}'
  ].join('');

  /* ---------- overlay ---------- */
  var v, stage, frame, img, cvs, ctx, cap, pct, bIn, bOut, bReset, bPen, hint, tools;
  var pop, dot, prev, range, bColor;
  var scale = 1, tx = 0, ty = 0, opener = null, hintTimer = null;

  /* ---------- 書きこみの状態 ---------- */
  var penOn = false;
  var tool = 'pen';                 /* pen / er */
  var color = SWATCHES[0];
  var penW = WDEF;
  var strokes = [];                 /* いま開いている絵の線 */
  var store = {};                   /* src ごとに線をおぼえておく */
  var cur = null;                   /* 描いている途中の線 */
  var unit = 1;                     /* 絵の大きさに合わせた太さの基準 */
  var rafId = 0, toId = 0;

  var PENCIL =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  function build() {
    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);

    v = document.createElement('div');
    v.className = 'zv';
    v.setAttribute('role', 'dialog');
    v.setAttribute('aria-modal', 'true');
    var MINUS = '−', RESET = '↺', TIMES = '×', UNDO = '↶';

    var swatches = '', i;
    for (i = 0; i < SWATCHES.length; i++) {
      swatches +=
        '<button type="button" class="zv-s' + (i === 0 ? ' on' : '') + '" data-c="' + SWATCHES[i] +
        '" style="background:' + SWATCHES[i] + '" aria-label="色 ' + SWATCHES[i] + '"></button>';
    }

    v.innerHTML =
      '<div class="zv-stage"><div class="zv-frame">' +
        '<img class="zv-img" alt="">' +
        '<canvas class="zv-cv"></canvas>' +
      '</div></div>' +
      '<div class="zv-cap"></div>' +
      '<div class="zv-hint">' + HINT_VIEW + '</div>' +
      '<div class="zv-tools">' +
        '<button type="button" class="zv-color" aria-label="色と太さをえらぶ" aria-expanded="false">' +
          '<i></i></button>' +
        '<i class="zv-sep"></i>' +
        '<button type="button" class="zv-t on" data-t="pen">ペン</button>' +
        '<button type="button" class="zv-t" data-t="er">消す</button>' +
        '<i class="zv-sep"></i>' +
        '<button type="button" class="zv-act zv-undo" aria-label="ひとつ戻す">' + UNDO + '</button>' +
        '<button type="button" class="zv-act zv-clear">全消し</button>' +
        '<div class="zv-pop">' +
          '<div class="zv-sw">' + swatches + '</div>' +
          '<div class="zv-size"><span class="zv-prev"><i></i></span>' +
            '<input type="range" min="' + WMIN + '" max="' + WMAX + '" step="1" value="' + WDEF +
            '" aria-label="線の太さ"></div>' +
        '</div>' +
      '</div>' +
      '<div class="zv-bar">' +
        '<button class="zv-out" type="button" aria-label="zoom out">' + MINUS + '</button>' +
        '<span class="zv-pct">100%</span>' +
        '<button class="zv-in" type="button" aria-label="zoom in">+</button>' +
        '<button class="zv-reset" type="button" aria-label="reset">' + RESET + '</button>' +
        '<button class="zv-pen" type="button" aria-label="ペンで書く" aria-pressed="false">' + PENCIL + '</button>' +
      '</div>' +
      '<button class="zv-x" type="button" aria-label="close">' + TIMES + '</button>';
    document.body.appendChild(v);

    stage = v.querySelector('.zv-stage');
    frame = v.querySelector('.zv-frame');
    img = v.querySelector('.zv-img');
    cvs = v.querySelector('.zv-cv');
    ctx = cvs.getContext('2d');
    cap = v.querySelector('.zv-cap');
    pct = v.querySelector('.zv-pct');
    hint = v.querySelector('.zv-hint');
    tools = v.querySelector('.zv-tools');
    pop = v.querySelector('.zv-pop');
    bColor = v.querySelector('.zv-color');
    dot = bColor.querySelector('i');
    prev = v.querySelector('.zv-prev i');
    range = v.querySelector('.zv-size input');
    bIn = v.querySelector('.zv-in');
    bOut = v.querySelector('.zv-out');
    bReset = v.querySelector('.zv-reset');
    bPen = v.querySelector('.zv-pen');

    bIn.addEventListener('click', function () { zoomAt(scale * STEP); });
    bOut.addEventListener('click', function () { zoomAt(scale / STEP); });
    bReset.addEventListener('click', reset);
    bPen.addEventListener('click', function () { setPen(!penOn); });
    v.querySelector('.zv-x').addEventListener('click', close);

    tools.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      if (b.classList.contains('zv-color')) {
        setPop(!pop.classList.contains('on'));
      } else if (b.classList.contains('zv-s')) {
        color = b.getAttribute('data-c');
        pick(pop.querySelectorAll('.zv-s'), b);
        if (tool === 'er') setTool('pen');     /* 色を選んだら消しゴムは解除 */
        showColor();
      } else if (b.classList.contains('zv-t')) {
        setTool(b.getAttribute('data-t'));
      } else if (b.classList.contains('zv-undo')) {
        strokes.pop(); redraw();
      } else if (b.classList.contains('zv-clear')) {
        strokes.length = 0; redraw();
      }
    });

    range.addEventListener('input', function () {
      penW = Math.max(WMIN, Math.min(WMAX, parseInt(range.value, 10) || WDEF));
      showColor();
    });

    /* click the empty area (not the picture) to close.
       moved != 0 means the click is the tail of a drag - ignore it.
       ペン中は閉じない。書いた線がいきなり消えないようにするため */
    stage.addEventListener('click', function (e) {
      if (e.target === stage && !moved && !penOn) close();
    });

    img.addEventListener('load', function () { fitFrame(); sizeCanvas(); apply(); });
    window.addEventListener('resize', function () {
      if (!v.classList.contains('on')) return;
      fitFrame(); apply();
    });

    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('dblclick', onDbl);
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    document.addEventListener('keydown', onKey);

    showColor();
  }

  function pick(list, on) {
    for (var i = 0; i < list.length; i++) list[i].classList.toggle('on', list[i] === on);
  }

  /* 絵が画面に収まる大きさを出して、枠にそのまま入れる。
     枠＝絵＝canvas が同じ大きさになるので、線がずれない */
  function fitFrame() {
    var nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh) return;
    var narrow = window.innerWidth <= 620;
    var maxW = window.innerWidth * (narrow ? 0.96 : 0.92);
    var maxH = window.innerHeight * (narrow ? 0.76 : 0.80);
    var k = Math.min(maxW / nw, maxH / nh, 1);   /* 元より大きくはしない */
    frame.style.width = Math.round(nw * k) + 'px';
    frame.style.height = Math.round(nh * k) + 'px';
  }

  /* ---------- transform ---------- */
  function apply() {
    var r = frame.getBoundingClientRect();
    var w = r.width / scale, h = r.height / scale;   /* size at 100% */
    var slack = 60;
    var maxX = Math.max(0, (w * scale - window.innerWidth) / 2) + slack;
    var maxY = Math.max(0, (h * scale - window.innerHeight) / 2) + slack;
    tx = Math.max(-maxX, Math.min(maxX, tx));
    ty = Math.max(-maxY, Math.min(maxY, ty));

    frame.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
    pct.textContent = Math.round(scale * 100) + '%';
    bIn.disabled = scale >= MAX - 0.001;
    bOut.disabled = scale <= MIN + 0.001;
    stage.style.cursor = penOn ? 'default' : (scale > 1 ? 'grab' : 'zoom-in');
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

  /* ---------- 書きこみ ---------- */
  function setPen(on) {
    penOn = !!on;
    v.classList.toggle('pen', penOn);
    bPen.classList.toggle('on', penOn);
    bPen.setAttribute('aria-pressed', String(penOn));
    if (!penOn) setPop(false);
    showColor();
    apply();
  }

  function setTool(t) {
    tool = t;
    pick(tools.querySelectorAll('.zv-t'), tools.querySelector('.zv-t[data-t="' + t + '"]'));
  }

  function setPop(on) {
    pop.classList.toggle('on', !!on);
    bColor.classList.toggle('on', !!on);
    bColor.setAttribute('aria-expanded', String(!!on));
  }

  /* ボタンの丸と、パレットの中の点に、いまの色と太さを出す */
  function showColor() {
    dot.style.background = color;
    var d = Math.max(4, Math.min(30, Math.round(penW * 1.5)));
    prev.style.width = d + 'px';
    prev.style.height = d + 'px';
    prev.style.background = color;
  }

  /* canvas は絵の元の大きさで持つ。拡大しても線がギザギザにならない */
  function sizeCanvas() {
    var nw = img.naturalWidth || 1000;
    var nh = img.naturalHeight || 1000;
    var k = Math.min(1, MAXDIM / Math.max(nw, nh));
    var w = Math.max(1, Math.round(nw * k));
    var h = Math.max(1, Math.round(nh * k));
    if (cvs.width !== w || cvs.height !== h) { cvs.width = w; cvs.height = h; }
    unit = Math.max(w, h) / 1000;
    redraw();
  }

  function widthOf(t) {
    /* 消しゴムは細すぎると使いにくいので下限をつける */
    if (t === 'er') return Math.max(penW, 6) * unit;
    return penW * unit;
  }

  /* 画面の座標を canvas の座標になおす。
     拡大・移動のぶんは getBoundingClientRect がすでに含んでいる */
  function toCanvas(e) {
    var r = cvs.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return [
      (e.clientX - r.left) / r.width * cvs.width,
      (e.clientY - r.top) / r.height * cvs.height
    ];
  }

  function startStroke(e) {
    var p = toCanvas(e);
    if (!p) return null;
    var s = { t: tool, c: color, w: widthOf(tool), a: 1, p: [p] };
    strokes.push(s);
    queueRedraw();
    return s;
  }

  function addPoint(e) {
    if (!cur) return;
    var p = toCanvas(e);
    if (!p) return;
    var q = cur.p[cur.p.length - 1];
    if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) < unit * 0.6) return;
    cur.p.push(p);
    queueRedraw();
  }

  /* 描き直しは1フレームにまとめる。
     requestAnimationFrame は裏のタブや省電力中に止まることがあるので、
     タイマーの保険も同時にかけて、線が出ないまま固まらないようにする */
  function queueRedraw() {
    if (rafId || toId) return;
    rafId = requestAnimationFrame(flush);
    toId = setTimeout(flush, 60);
  }

  function flush() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (toId) { clearTimeout(toId); toId = 0; }
    redraw();
  }

  function redraw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    for (var i = 0; i < strokes.length; i++) drawStroke(strokes[i]);
  }

  function drawStroke(s) {
    var g = ctx, p = s.p, i;
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = s.w;
    if (s.t === 'er') {
      g.globalCompositeOperation = 'destination-out';
      g.strokeStyle = '#000';
      g.fillStyle = '#000';
    } else {
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = (s.a == null ? 1 : s.a);
      g.strokeStyle = s.c;
      g.fillStyle = s.c;
    }
    g.beginPath();
    if (p.length < 2) {
      g.arc(p[0][0], p[0][1], s.w / 2, 0, Math.PI * 2);
      g.fill();
    } else {
      g.moveTo(p[0][0], p[0][1]);
      for (i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]);
      g.stroke();
    }
    g.restore();
  }

  /* ---------- input ---------- */
  function onWheel(e) {
    e.preventDefault();
    zoomAt(scale * (e.deltaY < 0 ? 1.16 : 1 / 1.16), e.clientX, e.clientY);
    fadeHint();
  }

  function onDbl(e) {
    if (penOn) return;                 /* 書いている途中に拡大が飛ばないように */
    e.preventDefault();
    if (scale > 1.05) reset(); else zoomAt(2.5, e.clientX, e.clientY);
  }

  var pts = {}, last = null, pinch = 0, mid = null, moved = 0;

  /* 指が離れた直後などは失敗することがある。落ちないように包む */
  function capture(id) {
    try { stage.setPointerCapture(id); } catch (err) { }
  }

  function onDown(e) {
    var first = !Object.keys(pts).length;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pts);

    if (ids.length === 1) {
      /* ペン: 絵の上を1本指／マウスでなぞると線になる。
         Shift を押しながらなら今までどおり移動 */
      if (first && penOn && !e.shiftKey && e.target === cvs) {
        e.preventDefault();
        setPop(false);                 /* 書きはじめたらパレットは閉じる */
        cur = startStroke(e);
        if (cur) {
          capture(e.pointerId);
          fadeHint();
          return;
        }
      }
      last = { x: e.clientX, y: e.clientY };
      moved = 0;
      if (scale > 1) stage.classList.add('drag');
      capture(e.pointerId);
    } else if (ids.length === 2) {
      /* 2本目の指が乗ったら、書きかけの線は取り消して拡大・移動にうつる */
      if (cur) { strokes.pop(); cur = null; redraw(); }
      var a0 = pts[ids[0]], b0 = pts[ids[1]];
      pinch = dist(a0, b0);
      mid = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
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
      var m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinch > 0) zoomAt(scale * (d / pinch), m.x, m.y);
      if (mid) { tx += m.x - mid.x; ty += m.y - mid.y; apply(); }
      pinch = d; mid = m;
      return;
    }
    if (cur) { addPoint(e); return; }
    if (last) {
      var dx = e.clientX - last.x, dy = e.clientY - last.y;
      moved += Math.abs(dx) + Math.abs(dy);
      if (scale > 1) { tx += dx; ty += dy; apply(); }
      last = { x: e.clientX, y: e.clientY };
    }
  }

  function onUp(e) {
    delete pts[e.pointerId];
    if (Object.keys(pts).length < 2) { pinch = 0; mid = null; }
    if (!Object.keys(pts).length) { last = null; cur = null; stage.classList.remove('drag'); }
    if (moved < 6) moved = 0;                       /* a real click, not a drag */
    else setTimeout(function () { moved = 0; }, 0); /* let the click fire first */
  }

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function onKey(e) {
    if (!v || !v.classList.contains('on')) return;
    if (e.key === 'Escape') {
      /* ペン中の Esc はまずペンをやめる。いきなり閉じて線が消えないように */
      if (penOn) setPen(false); else close();
    }
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
    strokes = store[src] || (store[src] = []);
    cur = null;
    img.src = src;
    img.alt = alt || '';
    cap.textContent = alt || '';
    cap.style.display = alt ? '' : 'none';
    scale = 1; tx = 0; ty = 0; pts = {}; pinch = 0; mid = null; last = null;
    hint.style.opacity = '';
    if (img.complete && img.naturalWidth) { fitFrame(); sizeCanvas(); }
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
    setPen(false);
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
