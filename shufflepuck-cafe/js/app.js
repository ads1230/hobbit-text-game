// Shufflepuck Café — the page: runs the game program, presents the 512x342
// screen on a canvas, feeds it mouse/touch/keyboard input, plays the sounds and
// provides the menu bar and the option dialogs.
'use strict';
(function () {
  var S = SPC.S, F = FLOW;
  var canvas = document.getElementById('screen'), ctx = canvas.getContext('2d');
  var imgData = ctx.createImageData(512, 342);
  var $ = function (id) { return document.getElementById(id); };


  // ------------------------------------------------------------ audio (the Sound Driver's free-form synthesizer)
  var actx = null, buffers = {}, current = null, playing = false;
  function audioInit() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (actx && actx.state === 'suspended') actx.resume(); }
  function samplesFor(id) {
    if (buffers[id]) return buffers[id];
    var b64 = SPC_DATA.sounds[id]; if (!b64 || !actx) return null;
    var s = atob(b64), n = s.length, buf = actx.createBuffer(1, n, 22257), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (s.charCodeAt(i) - 128) / 128;
    buffers[id] = buf; return buf;
  }
  SPC.sfx.play = function (id, num, den) {
    SPC.sfx.stop();
    if (!S.sound || !actx) return;
    var buf = samplesFor(id); if (!buf) return;
    var src = actx.createBufferSource(); src.buffer = buf; src.playbackRate.value = num / den;
    src.connect(actx.destination); src.onended = function () { if (current === src) { playing = false; current = null; } };
    src.start(); current = src; playing = true;
  };
  SPC.sfx.stop = function () { if (current) { try { current.onended = null; current.stop(); } catch (e) {} current = null; } playing = false; };
  SPC.sfx.done = function () { return !playing; };
  SPC.sfx.wall = function () { SPC.sfx.play('wall', 1500, SPC.w16(S.pz) + 1500); };          // L5_0aa4
  SPC.sfx.blocker = function () { SPC.sfx.play('wall', 375, SPC.w16(S.pz) + 1500); };        // F5_0ae0
  SPC.sfx.hit = function () {                                                                 // L5_0caa
    var sp = Math.min(SPC.speedFor(), 250); SPC.sfx.play('hit', 100 - SPC.mapv(sp, 0, 250, -50, 50), 100);
  };
  SPC.sfx.oppHit = function () {                                                              // F5_0d32
    var sp = Math.min(SPC.speedFor(), 350); SPC.sfx.play('hit', 100 - SPC.mapv(sp, 0, 350, -50, 10), 400);
  };
  SPC.sfx.crack = function (sp) { SPC.sfx.play('crack', 300 - SPC.mapv(sp, 0, 350, -100, 150), 200); };   // L5_0b64
  SPC.sfx.bigCrack = function () { SPC.sfx.play('crack', 2, 3); };                           // L5_0c76
  SPC.sfx.crackRate = function (r) { SPC.sfx.play('crack', r, 1); };                         // F5_0dba

  // ------------------------------------------------------------ input
  var mouse = SPC.mouse;
  function canvasPoint(e) {
    var r = canvas.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left) * 512 / r.width), y: Math.floor((e.clientY - r.top) * 342 / r.height) };
  }
  // A mouse puts the paddle under the pointer (the Paddle menu's "Under the Pointer", on by
  // default). Without it the paddle follows the mouse as on the Mac — through the game's
  // draggable box, one unit per pixel — and during a game the pointer is hidden, as the Mac
  // hid its cursor, because the paddle is then the cursor.
  // A finger steers it by dragging anywhere on the screen: the drag moves the paddle by
  // the same distance, so the hand never covers the paddle. A second finger held down
  // anywhere is the mouse button (the "button down" paddle settings).
  var touches = 0, dragId = null, dragX = 0, dragY = 0, accX = 0, accY = 0, TOUCH_GAIN = 1.5;
  var stage = $('stage');
  var prefs = { pointerPaddle: true };
  try { var pj = JSON.parse(localStorage.getItem('spc.prefs')); if (pj && typeof pj === 'object' && 'pointerPaddle' in pj) prefs.pointerPaddle = !!pj.pointerPaddle; } catch (err) {}
  function savePrefs() { try { localStorage.setItem('spc.prefs', JSON.stringify(prefs)); } catch (err) {} }
  function onCanvas(e) { var r = canvas.getBoundingClientRect(); return e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom; }
  function nudge(dx, dy, k) {
    accX = Math.max(-2000, Math.min(2500, accX + dx * k)); accY = Math.max(-2000, Math.min(2300, accY + dy * k));
    mouse.x = Math.round(accX); mouse.y = Math.round(accY);
  }
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') {
      if (e.pointerId === dragId) { var r = canvas.getBoundingClientRect(); nudge(e.clientX - dragX, e.clientY - dragY, 512 / r.width * TOUCH_GAIN); dragX = e.clientX; dragY = e.clientY; }
      return;
    }
    mouse.direct = prefs.pointerPaddle;
    var p = canvasPoint(e); mouse.x = Math.max(0, Math.min(511, p.x)); mouse.y = Math.max(0, Math.min(341, p.y));
  });
  stage.addEventListener('pointerdown', function (e) {
    audioInit(); var p = canvasPoint(e), inside = onCanvas(e);
    if (e.pointerType === 'touch') {
      touches++; mouse.down = touches >= 2; mouse.direct = false;
      if (touches === 1) { dragId = e.pointerId; dragX = e.clientX; dragY = e.clientY; accX = mouse.x; accY = mouse.y; if (inside) F.pushEvent({ type: 'click', x: p.x, y: p.y }); }
    } else if (inside) { mouse.direct = prefs.pointerPaddle; mouse.x = p.x; mouse.y = p.y; mouse.down = true; F.pushEvent({ type: 'click', x: p.x, y: p.y }); }
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  // the cursor as the game shows it: hidden during the title and during play (unless the
  // paddle is under the pointer), shown at the bar and between games
  var cursorShown = null;
  function updateCursor() {
    var show = S.scene === 'bar' || (S.scene === 'table' && !S.running) || prefs.pointerPaddle;
    if (show !== cursorShown) { cursorShown = show; stage.style.cursor = show ? '' : 'none'; canvas.style.cursor = show ? 'crosshair' : 'none'; }
  }
  function up(e) {
    if (e.pointerType === 'touch') { touches = Math.max(0, touches - 1); mouse.down = touches >= 2; if (e.pointerId === dragId) dragId = null; }
    else mouse.down = false;
  }
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  window.addEventListener('keydown', function (e) {
    if (ui.modal) return;
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ' || e.key.length === 1) {
      if ((e.metaKey || e.ctrlKey) && e.key.length === 1) { F.pushEvent({ type: 'key', ch: e.key, cmd: true }); e.preventDefault(); }
      else if (!e.metaKey && !e.ctrlKey && !e.altKey) { F.pushEvent({ type: 'key', ch: e.key, cmd: false }); if (e.key === ' ') e.preventDefault(); }
    }
  });

  // ------------------------------------------------------------ menu bar
  var MENUS = {
    apple: { title: '', items: ['About Shufflepuck…'] },
    file: { title: 'File', items: ['Roster of Champions', '-', 'Quit'] },
    game: { title: 'Game', items: ['New Game', 'New Opponent', '-', 'Sound'] },
    paddle: { title: 'Paddle', items: ['Size…', 'Button Up…', 'Button Down…', '-', 'Tournament Paddle', '-', 'Under the Pointer'] },
    blocker: { title: 'Blocker', items: ['None', 'Small', 'Medium', 'Large', 'Custom…'] },
    droid: { title: 'Droid', items: ['Paddle Size…', 'Paddle Power…', '-', 'Idle…', 'Speed…', 'Return…', 'Serve…'] }
  };
  var bar = $('menubar'), openMenu = null;
  function buildMenus() {
    bar.innerHTML = '';
    Object.keys(MENUS).forEach(function (key) {
      var m = MENUS[key], b = document.createElement('button'); b.className = 'mtitle'; b.dataset.menu = key;
      b.textContent = key === 'apple' ? '\u2630' : m.title;
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); if (openMenu === key) closeMenus(); else showMenu(key, b); });
      bar.appendChild(b);
    });
    var t = document.createElement('span'); t.className = 'title'; t.textContent = 'Shufflepuck Café'; bar.appendChild(t);
  }
  function showMenu(key, btn) {
    closeMenus(); openMenu = key;
    var m = MENUS[key], d = document.createElement('div'); d.className = 'menu'; d.id = 'dropdown';
    d.addEventListener('pointerdown', function (e) { e.stopPropagation(); e.preventDefault(); });   // pressing inside keeps the menu open
    m.items.forEach(function (it, i) {
      var el = document.createElement('div');
      if (it === '-') { el.className = 'sep'; d.appendChild(el); return; }
      el.className = 'item'; el.textContent = it;
      var st = itemState(key, i + 1);
      if (st.checked) el.classList.add('checked'); if (st.disabled) el.classList.add('disabled');
      el.addEventListener('pointerup', function (e) {
        e.stopPropagation(); if (st.disabled) return; closeMenus();
        if (key === 'paddle' && i + 1 === 7) { prefs.pointerPaddle = !prefs.pointerPaddle; savePrefs(); return; }   // a page option, not the game's
        F.pushEvent({ type: 'menu', menu: key, item: i + 1 });
      });
      d.appendChild(el);
    });
    document.body.appendChild(d);
    var r = btn.getBoundingClientRect(); d.style.left = r.left + 'px'; d.style.top = r.bottom + 'px';
    btn.classList.add('open');
  }
  function closeMenus() { var d = $('dropdown'); if (d) d.remove(); openMenu = null; bar.querySelectorAll('.open').forEach(function (b) { b.classList.remove('open'); }); }
  document.addEventListener('pointerdown', closeMenus);
  function itemState(menu, item) {
    var s = { checked: false, disabled: false };
    if (menu === 'game' && item === 4) s.checked = !!S.sound;
    if (menu === 'paddle' && item === 5) s.checked = SPC.paddleIsDefault();
    if (menu === 'paddle' && S.tournament && item !== 7) s.disabled = true;
    if (menu === 'paddle' && item === 7) s.checked = prefs.pointerPaddle;
    if (menu === 'blocker') { var sel = !S.blockerOn ? 1 : S.bHw === 25 ? 2 : S.bHw === 50 ? 3 : S.bHw === 75 ? 4 : 5; s.checked = item === sel; if (S.tournament) s.disabled = true; }
    if (menu === 'game' && (item === 1 || item === 2) && !S.opp) s.disabled = true;
    return s;
  }
  var ui = SCENES.ui;
  ui.menuEnable = function () { var d = bar.querySelector('[data-menu=droid]'); if (d) d.style.display = S.opp === 10 ? '' : 'none'; };
  ui.modal = false;
  F.onSoundChange = function () { $('btnSound').textContent = S.sound ? 'Sound: on' : 'Sound: off'; };

  // ------------------------------------------------------------ dialogs (sliders) and the champion's name
  ui.dialog = function* (title, sliders) {
    var result;
    var ov = $('dialog'); ov.classList.remove('hidden'); ui.modal = true;
    $('dlgTitle').textContent = title;
    var box = $('dlgSliders'); box.innerHTML = '';
    var inputs = sliders.map(function (sl) {
      var row = document.createElement('div'); row.className = 'slider';
      var lab = document.createElement('label'); lab.textContent = sl[0]; row.appendChild(lab);
      var inp = document.createElement('input'); inp.type = 'range'; inp.min = sl[2]; inp.max = sl[3]; inp.value = sl[1]; row.appendChild(inp);
      var val = document.createElement('span'); val.className = 'val'; val.textContent = sl[1]; row.appendChild(val);
      inp.addEventListener('input', function () { val.textContent = inp.value; });
      box.appendChild(row); return inp;
    });
    $('dlgOk').onclick = function () { result = inputs.map(function (i) { return parseInt(i.value, 10); }); };
    $('dlgCancel').onclick = function () { result = false; };
    while (result === undefined) yield 0;
    ov.classList.add('hidden'); ui.modal = false;
    return result || null;
  };
  ui.nameEntry = function* () {
    var result;
    var ov = $('nameDlg'); ov.classList.remove('hidden'); ui.modal = true;
    var inp = $('nameInput'); inp.value = S.playerName === 'Visitor' ? '' : S.playerName; inp.maxLength = 31;
    setTimeout(function () { inp.focus(); }, 50);
    $('nameOk').onclick = function () { result = inp.value.trim(); };
    inp.onkeydown = function (e) { if (e.key === 'Enter') { result = inp.value.trim(); e.preventDefault(); } };
    while (result === undefined) yield 0;
    ov.classList.add('hidden'); ui.modal = false;
    return result;
  };
  ui.quit = function () { $('quit').classList.remove('hidden'); };

  // ------------------------------------------------------------ the runner
  var t0 = performance.now(), lastStep = t0;
  function ticks() { return Math.floor((performance.now() - t0) * 60 / 1000); }
  F.setTicker(ticks); SCENES.setTicker(ticks);
  var gen = SCENES.program(), wake = 0, lastLim = 0, waitLim = 0, finished = false;
  function step() {
    // after a stall (background tab, a long frame) the clock continues from where it stopped
    var now = performance.now(); if (now - lastStep > 250) t0 += now - lastStep - 50; lastStep = now;
    var t = ticks(), budget = 400;
    while (!finished && budget-- > 0) {
      if (waitLim) { if (t - lastLim < waitLim) break; lastLim = t; waitLim = 0; }
      else if (t < wake) break;
      var r;
      try { r = gen.next(); } catch (e) { console.error(e); finished = true; $('err').textContent = String(e && e.stack || e); $('err').classList.remove('hidden'); break; }
      if (r.done) { finished = true; break; }
      var v = r.value;
      if (typeof v === 'number') wake = t + (v > 0 ? v : 1);
      else if (v && v.lim !== undefined) { waitLim = v.lim; if (t - lastLim >= waitLim) { lastLim = t; waitLim = 0; wake = t; } }
      else wake = t + 1;
      t = ticks();
    }
    if (SPC.isDirty()) { QD.present(SPC.screen, ctx, imgData); SPC.setDirty(false); }
    updateCursor();
    requestAnimationFrame(step);
  }
  // ------------------------------------------------------------ layout
  function layout() {
    var vw = window.innerWidth, vh = window.innerHeight - bar.offsetHeight - $('toolbar').offsetHeight;
    var sc = Math.min(vw / 512, vh / 342);
    if (sc > 1 && !document.fullscreenElement) sc = Math.max(1, Math.floor(sc * 2) / 2);
    canvas.style.width = Math.floor(512 * sc) + 'px'; canvas.style.height = Math.floor(342 * sc) + 'px';
  }
  window.addEventListener('resize', layout);
  $('btnFull').addEventListener('click', function () { var el = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen(); setTimeout(layout, 300); });
  $('btnKey').addEventListener('click', function () { F.pushEvent({ type: 'key', ch: ' ', cmd: false }); });
  $('btnSound').addEventListener('click', function () { audioInit(); F.toggleSound(); });
  buildMenus(); ui.menuEnable(); layout(); F.onSoundChange();
  requestAnimationFrame(step);
  window.__spc = { S: S, F: F, SPC: SPC, SCENES: SCENES };
})();
