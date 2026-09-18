/* ============================================================
   comment.js - 座学ページの「コメント」ボタンとポップアップ

   Add this one line before </body> on every 座学 page:
     <script src="../../assets/comment.js" defer></script>

   It puts a コメント button to the right of the
   「← 研修タイムテーブルに戻る」 link and injects its own CSS,
   so pages need nothing else.

   The pop-up lets the instructor pick a date, write a comment
   and sign their name. Comments belong to ONE page only: the key
   is the page's file name, so スクワット's comments never show
   on ダンベルプレス.

   Storage: localStorage of this browser. Nothing is sent to a
   server, so comments stay on the device they were written on.
   Keys start with "wellgo-training:" because every repo under
   wellgopublic.github.io shares one localStorage.

   Written in ES5 (no arrow functions / template strings) to match
   zoom.js and keep older iPad Safari working.

   Save this file as UTF-8 (no BOM), same as the HTML pages.
   ============================================================ */
(function () {
  'use strict';

  var PREFIX = 'wellgo-training:';
  var PAGE = pageId();
  var KEY = PREFIX + 'comments:' + PAGE;
  var NAME_KEY = PREFIX + 'comment-name';     /* 最後に書いた講師名 */
  var WD = ['日', '月', '火', '水', '木', '金', '土'];

  var store = storage();
  var items = load();
  var editing = null;       /* 編集中のコメントの id */
  var draft = null;         /* 編集に入る前に書きかけていた内容 */
  var lastFocus = null;
  var msgTimer = null;
  var scrollLock = '';

  var btn, badge, modal, box, body, form, fDate, fName, fText, bSave, bCancel,
      msg, list, listCount, empty, title;

  /* ---------- styles ---------- */
  var CSS = [
    '.cm-bar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:26px}',
    '.cm-bar .back{margin-bottom:0}',
    '.cm-open{display:inline-flex;align-items:center;gap:7px;font-family:"Noto Sans JP",sans-serif;',
    'font-size:13px;font-weight:700;line-height:1.7;color:var(--a-deep,#004aad);',
    'background:var(--card,#fff);border:1.5px solid var(--line,rgba(0,74,173,.16));border-radius:999px;',
    'padding:8px 16px;box-shadow:var(--shadow,0 18px 40px -28px rgba(0,74,173,.28));cursor:pointer;',
    'transition:border-color .2s ease;-webkit-tap-highlight-color:transparent}',
    '.cm-open:hover{border-color:var(--a,#004aad)}',
    '.cm-open svg{width:15px;height:15px;flex:none}',
    '.cm-badge{font-family:"Outfit",sans-serif;font-weight:700;font-size:11px;line-height:1;color:#fff;',
    'background:var(--a,#004aad);border-radius:999px;padding:3px 7px;min-width:20px;text-align:center}',

    '.cm-modal{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9000;display:flex;',
    'align-items:center;justify-content:center;padding:24px;opacity:0;transition:opacity .18s ease}',
    '.cm-modal.show{opacity:1}',
    '.cm-modal[hidden],.cm-modal [hidden],.cm-open [hidden]{display:none!important}',
    '.cm-back{position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(4,16,34,.55);',
    '-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}',
    /* 高さは画面いっぱいまで伸ばさず 760px で止める。PC で細長い柱にならないように。
       max-height は古い書き方 → min() → dvh の順。使えない書き方は無視されて前のが残る */
    '.cm-box{position:relative;width:100%;max-width:620px;max-height:calc(100vh - 48px);',
    'max-height:min(calc(100vh - 48px),760px);max-height:min(calc(100dvh - 48px),760px);',
    'display:flex;flex-direction:column;background:#fff;',
    'border-radius:22px;box-shadow:0 30px 70px -24px rgba(4,16,34,.6);overflow:hidden;outline:none;',
    'color:var(--ink,#004aad);font-family:"Noto Sans JP",sans-serif;line-height:1.6;',
    'transform:translateY(10px) scale(.985);transition:transform .2s ease}',
    '.cm-modal.show .cm-box{transform:none}',

    '.cm-head{flex:none;display:flex;align-items:flex-start;justify-content:space-between;gap:14px;',
    'padding:20px 22px 15px;border-bottom:1px solid rgba(0,74,173,.12)}',
    '.cm-kicker{font-family:"Outfit",sans-serif;font-weight:700;font-size:11px;letter-spacing:.28em;',
    'color:rgba(0,74,173,.62);text-transform:uppercase;margin-bottom:3px}',
    '.cm-head h2{font-family:"Zen Kaku Gothic New",sans-serif;font-weight:900;font-size:20px;',
    'line-height:1.25;margin:0;color:var(--ink,#004aad);overflow-wrap:anywhere}',
    '.cm-x{flex:none;width:38px;height:38px;border-radius:50%;border:0;background:rgba(0,74,173,.08);',
    'color:#004aad;font-size:21px;line-height:1;cursor:pointer;display:flex;align-items:center;',
    'justify-content:center;padding:0;transition:background .15s ease}',
    '.cm-x:hover{background:rgba(0,74,173,.15)}',

    '.cm-body{overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;',
    'padding:18px 22px 20px}',
    '.cm-warn{font-size:13px;font-weight:700;color:#b42318;background:#fdecea;border-radius:12px;',
    'padding:10px 13px;margin:0 0 12px}',

    '.cm-form{display:flex;flex-direction:column;gap:12px;background:rgba(0,74,173,.04);',
    'border:1.5px solid rgba(0,74,173,.12);border-radius:16px;padding:14px;margin:0}',
    '.cm-form.is-edit{border-color:#004aad;background:rgba(0,74,173,.07)}',
    '.cm-row{display:grid;grid-template-columns:minmax(0,190px) minmax(0,1fr);gap:12px}',
    '.cm-field{display:flex;flex-direction:column;gap:5px;min-width:0;margin:0}',
    '.cm-field>span{font-size:12px;font-weight:700;color:var(--ink,#004aad)}',
    /* 16px 未満だと iPhone / iPad はタップしたときに画面を勝手に拡大する */
    '.cm-field input,.cm-field textarea{font-family:"Noto Sans JP",sans-serif;font-size:16px;',
    'font-weight:500;line-height:1.5;color:var(--ink,#004aad);background:#fff;',
    'border:1.5px solid rgba(0,74,173,.22);border-radius:12px;padding:9px 12px;width:100%;',
    'box-sizing:border-box;min-height:44px;margin:0;-webkit-appearance:none;appearance:none;',
    'transition:border-color .15s ease,box-shadow .15s ease}',
    '.cm-field input[type=date]{display:block;text-align:left}',
    '.cm-field input::-webkit-date-and-time-value{text-align:left}',
    '.cm-field textarea{resize:vertical;min-height:108px}',
    '.cm-field input::placeholder,.cm-field textarea::placeholder{color:rgba(0,74,173,.38)}',
    '.cm-field input:focus,.cm-field textarea:focus{outline:none;border-color:#004aad;',
    'box-shadow:0 0 0 3px rgba(0,74,173,.15)}',
    '.cm-field .cm-bad{border-color:#d93025;box-shadow:0 0 0 3px rgba(217,48,37,.13)}',

    '.cm-actions{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px}',
    '.cm-msg{margin-right:auto;font-size:12.5px;font-weight:700;color:#1e8e3e;min-height:1em}',
    '.cm-msg.err{color:#d93025}',
    '.cm-save,.cm-cancel{font-family:"Noto Sans JP",sans-serif;font-size:14px;font-weight:700;',
    'border-radius:12px;padding:10px 22px;min-height:44px;cursor:pointer;',
    'transition:transform .15s ease,background .15s ease}',
    '.cm-save{color:#fff;background:#004aad;border:0}',
    '.cm-save:active,.cm-cancel:active{transform:translateY(1px)}',
    '.cm-save:disabled{opacity:.4;cursor:default}',
    '.cm-cancel{color:#004aad;background:#fff;border:1.5px solid rgba(0,74,173,.22)}',

    '.cm-list-head{display:flex;align-items:center;gap:8px;margin:22px 0 10px;',
    'font-family:"Zen Kaku Gothic New",sans-serif;font-weight:700;font-size:14px}',
    '.cm-list-head::before{content:"";width:6px;height:16px;border-radius:3px;background:#004aad}',
    '.cm-list-head b{font-family:"Outfit",sans-serif;font-size:11px;color:#fff;background:#004aad;',
    'border-radius:999px;padding:3px 8px;line-height:1}',
    '.cm-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}',
    '.cm-item{border:1.5px solid rgba(0,74,173,.12);border-radius:14px;padding:12px 14px;background:#fff}',
    '.cm-item.flash{animation:cmflash 1.4s ease}',
    '@keyframes cmflash{0%{background:rgba(0,74,173,.14)}100%{background:#fff}}',
    '.cm-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-bottom:6px}',
    '.cm-date{font-family:"Outfit","Noto Sans JP",sans-serif;font-weight:700;font-size:13px;',
    'color:#004aad;letter-spacing:.02em}',
    '.cm-name{font-size:12px;font-weight:700;color:#fff;background:#004aad;border-radius:999px;',
    'padding:2px 10px;line-height:1.6}',
    '.cm-text{margin:0;font-size:14px;line-height:1.75;color:var(--ink,#004aad);white-space:pre-wrap;',
    'overflow-wrap:anywhere;word-break:break-word}',
    '.cm-tools{display:flex;justify-content:flex-end;gap:6px;margin-top:8px}',
    '.cm-tools button{font-family:"Noto Sans JP",sans-serif;font-size:12px;font-weight:700;',
    'color:#004aad;background:rgba(0,74,173,.07);border:0;border-radius:999px;padding:6px 13px;',
    'min-height:32px;cursor:pointer}',
    '.cm-tools .cm-del{color:#c62828;background:rgba(198,40,40,.08)}',
    '.cm-empty{font-size:13px;color:rgba(0,74,173,.6);text-align:center;padding:16px 0 6px;margin:0}',
    '.cm-note{font-size:11.5px;color:rgba(0,74,173,.55);text-align:center;margin:18px 0 0}',

    /* スマホでも「戻る」の右にならぶように、2つのボタンを少し小さくする */
    '@media (max-width:480px){',
    '.cm-bar{gap:6px}',
    '.cm-bar .back,.cm-open{font-size:12px;padding:7px 12px;gap:5px}',
    '.cm-open svg{width:14px;height:14px}',
    '.cm-badge{font-size:10px;padding:3px 6px;min-width:18px}',
    '}',

    '@media (max-width:600px){',
    '.cm-modal{padding:12px}',
    '.cm-box{border-radius:18px;max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px)}',
    '.cm-head{padding:16px 16px 12px}',
    '.cm-head h2{font-size:18px}',
    '.cm-body{padding:14px 16px 18px}',
    '.cm-form{padding:12px}',
    '.cm-row{grid-template-columns:minmax(0,1fr)}',
    '.cm-save{flex:1}',
    '}'
  ].join('');

  var BUBBLE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z"/></svg>';

  /* ---------- page / storage ---------- */
  function pageId() {
    var seg = location.pathname.split('/').pop() || 'index';
    try { seg = decodeURIComponent(seg); } catch (e) { }
    return seg.replace(/\.html?$/i, '');
  }

  function storage() {
    try {
      var k = PREFIX + 'test';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return window.localStorage;
    } catch (e) { return null; }       /* プライベートブラウズ等で使えない */
  }

  function load() {
    if (!store) return [];
    try {
      var v = JSON.parse(store.getItem(KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function persist() {
    if (!store) return false;
    try {
      if (items.length) store.setItem(KEY, JSON.stringify(items));
      else store.removeItem(KEY);
      return true;
    } catch (e) { return false; }
  }

  function getName() {
    try { return (store && store.getItem(NAME_KEY)) || ''; } catch (e) { return ''; }
  }

  function setName(n) {
    try { if (store) store.setItem(NAME_KEY, n); } catch (e) { }
  }

  /* ---------- helpers ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* toISOString は UTC なので、朝のうちは前の日になってしまう。端末の日付で作る */
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function fmtDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return s || '';
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return m[1] + '/' + m[2] + '/' + m[3] + '（' + WD[d.getDay()] + '）';
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function byId(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  /* 見出しは h1 から。ふりがな（rt）と「座学」バッジは外す */
  function pageTitle() {
    var h = document.querySelector('h1');
    if (!h) return document.title;
    var c = h.cloneNode(true);
    var junk = c.querySelectorAll('rt, rp, .badge');
    for (var i = 0; i < junk.length; i++) junk[i].parentNode.removeChild(junk[i]);
    return c.textContent.replace(/\s+/g, ' ').trim() || document.title;
  }

  /* ---------- build ---------- */
  function build() {
    var back = document.querySelector('.back');
    if (!back) return false;

    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);

    /* 戻るボタンとコメントボタンを横にならべる */
    var bar = document.createElement('div');
    bar.className = 'cm-bar';
    back.parentNode.insertBefore(bar, back);
    bar.appendChild(back);

    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cm-open';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.innerHTML = BUBBLE + '<span>コメント</span><span class="cm-badge" hidden></span>';
    bar.appendChild(btn);
    badge = btn.querySelector('.cm-badge');

    modal = document.createElement('div');
    modal.className = 'cm-modal';
    modal.hidden = true;
    modal.innerHTML =
      '<div class="cm-back"></div>' +
      '<div class="cm-box" role="dialog" aria-modal="true" aria-labelledby="cm-title" tabindex="-1">' +
        '<div class="cm-head">' +
          '<div><div class="cm-kicker">Comment</div><h2 id="cm-title"></h2></div>' +
          '<button type="button" class="cm-x" aria-label="閉じる">×</button>' +
        '</div>' +
        '<div class="cm-body">' +
          '<p class="cm-warn" hidden>このブラウザではコメントを保存できません。' +
            'プライベートブラウズをやめて、ふつうのタブで開きなおしてください。</p>' +
          '<form class="cm-form" novalidate>' +
            '<div class="cm-row">' +
              '<label class="cm-field"><span>日付</span><input type="date" name="date"></label>' +
              '<label class="cm-field"><span>講師名</span>' +
                '<input type="text" name="name" placeholder="例：山田" autocomplete="name" maxlength="40"></label>' +
            '</div>' +
            '<label class="cm-field"><span>コメント</span>' +
              '<textarea name="text" rows="4" maxlength="2000" ' +
              'placeholder="教えた内容・できたこと・次にやることなど"></textarea></label>' +
            '<div class="cm-actions">' +
              '<span class="cm-msg" role="status" aria-live="polite"></span>' +
              '<button type="button" class="cm-cancel" hidden>やめる</button>' +
              '<button type="submit" class="cm-save">保存する</button>' +
            '</div>' +
          '</form>' +
          '<div class="cm-list-head">これまでのコメント<b>0</b></div>' +
          '<ol class="cm-list"></ol>' +
          '<p class="cm-empty">まだコメントはありません。</p>' +
          '<p class="cm-note">コメントはこの端末のブラウザに保存されます。</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    box = modal.querySelector('.cm-box');
    body = modal.querySelector('.cm-body');
    title = modal.querySelector('#cm-title');
    form = modal.querySelector('.cm-form');
    fDate = form.querySelector('[name="date"]');
    fName = form.querySelector('[name="name"]');
    fText = form.querySelector('[name="text"]');
    bSave = form.querySelector('.cm-save');
    bCancel = form.querySelector('.cm-cancel');
    msg = form.querySelector('.cm-msg');
    list = modal.querySelector('.cm-list');
    listCount = modal.querySelector('.cm-list-head b');
    empty = modal.querySelector('.cm-empty');

    title.textContent = pageTitle();
    fDate.value = today();
    fName.value = getName();

    if (!store) {
      modal.querySelector('.cm-warn').hidden = false;
      bSave.disabled = true;
    }

    btn.addEventListener('click', open);
    modal.querySelector('.cm-x').addEventListener('click', close);
    modal.querySelector('.cm-back').addEventListener('click', close);
    form.addEventListener('submit', onSubmit);
    bCancel.addEventListener('click', function () { endEdit(); });
    list.addEventListener('click', onListClick);
    document.addEventListener('keydown', onKey);

    /* 入れなおしたら赤い枠は消す */
    form.addEventListener('input', function (e) {
      if (e.target.classList) e.target.classList.remove('cm-bad');
    });

    /* 別のタブで書いたときも数をそろえる */
    window.addEventListener('storage', function (e) {
      if (e.key === KEY) { items = load(); render(); }
    });

    render();
    return true;
  }

  /* ---------- render ---------- */
  function sorted() {
    return items.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;     /* 新しい日付が上 */
      return (a.at || '') < (b.at || '') ? 1 : -1;
    });
  }

  function render(flashId) {
    var arr = sorted();
    list.innerHTML = '';
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      var li = document.createElement('li');
      li.className = 'cm-item' + (it.id === flashId ? ' flash' : '');
      li.setAttribute('data-id', it.id);

      var meta = document.createElement('div');
      meta.className = 'cm-meta';
      var d = document.createElement('span');
      d.className = 'cm-date';
      d.textContent = fmtDate(it.date);
      var n = document.createElement('span');
      n.className = 'cm-name';
      n.textContent = it.name;
      meta.appendChild(d);
      meta.appendChild(n);

      var p = document.createElement('p');
      p.className = 'cm-text';
      p.textContent = it.text;                 /* textContent なので HTML は効かない */

      var tools = document.createElement('div');
      tools.className = 'cm-tools';
      tools.innerHTML =
        '<button type="button" class="cm-edit">編集</button>' +
        '<button type="button" class="cm-del">削除</button>';

      li.appendChild(meta);
      li.appendChild(p);
      li.appendChild(tools);
      list.appendChild(li);
    }
    listCount.textContent = String(arr.length);
    empty.hidden = arr.length > 0;
    badge.textContent = String(arr.length);
    badge.hidden = arr.length === 0;
    btn.setAttribute('aria-label', 'コメント（' + arr.length + '件）');
  }

  /* ---------- form ---------- */
  function say(text, isErr) {
    clearTimeout(msgTimer);
    msg.textContent = text;
    msg.classList.toggle('err', !!isErr);
    if (!isErr && text) msgTimer = setTimeout(function () { msg.textContent = ''; }, 2600);
  }

  function bad(field, text) {
    field.classList.add('cm-bad');
    field.focus();
    say(text, true);
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!store) return;
    var date = fDate.value;
    var name = fName.value.replace(/\s+/g, ' ').trim();
    var text = fText.value.replace(/\s+$/, '').replace(/^\s*\n/, '');

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad(fDate, '日付をえらんでください');
    if (!text.trim()) return bad(fText, 'コメントを書いてください');
    if (!name) return bad(fName, '講師名を書いてください');

    var before = JSON.stringify(items);
    var id;
    if (editing) {
      var it = byId(editing);
      if (it) { it.date = date; it.name = name; it.text = text; it.up = new Date().toISOString(); }
      id = editing;
    } else {
      id = newId();
      items.push({ id: id, date: date, name: name, text: text, at: new Date().toISOString() });
    }

    if (!persist()) {
      items = JSON.parse(before);            /* 保存できなかったら元にもどす */
      say('保存できませんでした', true);
      return;
    }

    var wasEdit = !!editing;
    /* 次に開いたとき用に名前をおぼえる。ほかの人のコメントを直しただけのときは変えない */
    if (!wasEdit) setName(name);
    if (wasEdit) endEdit();
    else fText.value = '';
    render(id);
    say(wasEdit ? '更新しました' : '保存しました');
  }

  function onListClick(e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    var li = b.closest('.cm-item');
    var id = li && li.getAttribute('data-id');
    var it = id && byId(id);
    if (!it) return;

    if (b.classList.contains('cm-del')) {
      if (!window.confirm(fmtDate(it.date) + ' ' + it.name + ' のコメントを削除しますか？')) return;
      var before = JSON.stringify(items);
      items = items.filter(function (x) { return x.id !== id; });
      if (!persist()) { items = JSON.parse(before); say('削除できませんでした', true); return; }
      if (editing === id) endEdit();
      render();
      say('削除しました');
    } else if (b.classList.contains('cm-edit')) {
      startEdit(it);
    }
  }

  function startEdit(it) {
    if (!editing) draft = { date: fDate.value, name: fName.value, text: fText.value };
    editing = it.id;
    fDate.value = it.date;
    fName.value = it.name;
    fText.value = it.text;
    form.classList.add('is-edit');
    bSave.textContent = '更新する';
    bCancel.hidden = false;
    say('');
    body.scrollTop = 0;
    fText.focus();
  }

  /* 編集をやめる／更新が終わったとき。編集に入る前の書きかけ（draft）にもどす */
  function endEdit() {
    editing = null;
    form.classList.remove('is-edit');
    bSave.textContent = '保存する';
    bCancel.hidden = true;
    if (draft) {
      fDate.value = draft.date || today();
      fName.value = draft.name || getName();
      fText.value = draft.text;
    } else {
      fText.value = '';
    }
    draft = null;
  }

  /* ---------- open / close ---------- */
  function open() {
    if (!modal.hidden) return;
    lastFocus = document.activeElement;
    items = load();
    render();
    if (!editing && !fText.value) fDate.value = today();   /* 書きかけが無ければ今日にする */
    if (!fName.value) fName.value = getName();

    scrollLock = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    modal.hidden = false;
    void modal.offsetWidth;                  /* 表示してからクラスを付けて、ふわっと出す */
    modal.classList.add('show');
    body.scrollTop = 0;
    box.focus();                             /* 入力欄ではなく箱に。スマホでいきなりキーボードが出ないように */
  }

  function close() {
    if (modal.hidden) return;
    if (editing) endEdit();
    modal.classList.remove('show');
    document.documentElement.style.overflow = scrollLock;
    setTimeout(function () { modal.hidden = true; }, 180);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function onKey(e) {
    if (modal.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    /* Tab で箱の外に出ないようにする */
    var f = box.querySelectorAll('button:not([disabled]):not([hidden]), input, textarea');
    var list2 = [];
    for (var i = 0; i < f.length; i++) if (f[i].offsetParent !== null) list2.push(f[i]);
    if (!list2.length) return;
    var first = list2[0], last = list2[list2.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
