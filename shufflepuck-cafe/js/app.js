// Shufflepuck Café — the page: runs the game program, presents the 512x342
// screen on a canvas, feeds it mouse/touch/keyboard input, plays the sounds and
// provides the menu (a drawer that pauses the game) with the game's options.
'use strict';
(function () {
  var S = SPC.S, F = FLOW, PIDX = SPC.PIDX;
  var canvas = document.getElementById('screen'), ctx = canvas.getContext('2d');
  var imgData = ctx.createImageData(512, 342);
  var $ = function (id) { return document.getElementById(id); };

  // ------------------------------------------------------------ preferences of the page (not the game's own settings)
  var prefs = { pointerPaddle: true, sound: 1 };
  try { var pj = JSON.parse(localStorage.getItem('spc.prefs')); if (pj && typeof pj === 'object') { if ('pointerPaddle' in pj) prefs.pointerPaddle = !!pj.pointerPaddle; if ('sound' in pj) prefs.sound = pj.sound ? 1 : 0; } } catch (err) {}
  function savePrefs() { try { localStorage.setItem('spc.prefs', JSON.stringify(prefs)); } catch (err) {} }
  S.sound = prefs.sound;

  // ------------------------------------------------------------ audio (the Sound Driver's free-form synthesizer)
  var actx = null, buffers = {}, current = null, playing = false;
  function audioInit() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (actx && actx.state === 'suspended' && !paused) actx.resume(); }
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
  // A mouse puts the paddle under the pointer ("Pointer" in the menu, the default). "Mac"
  // is the game's own control: the paddle follows the mouse through the game's draggable
  // box, one unit per pixel, and during a game the pointer is hidden, as the Mac hid its
  // cursor, because the paddle is then the cursor. A finger steers the paddle by dragging
  // anywhere on the screen: the drag moves the paddle by the same distance, so the hand
  // never covers the play. A second finger held down anywhere is the mouse button (the
  // "button down" paddle settings).
  var mouse = SPC.mouse, app = $('app'), stage = $('stage');
  var touches = 0, dragId = null, dragX = 0, dragY = 0, accX = 0, accY = 0, TOUCH_GAIN = 1.5, touched = false;
  function canvasPoint(e) {
    var r = canvas.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left) * 512 / r.width), y: Math.floor((e.clientY - r.top) * 342 / r.height) };
  }
  function onCanvas(e) { var r = canvas.getBoundingClientRect(); return e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom; }
  function nudge(dx, dy, k) {
    accX = Math.max(-2000, Math.min(2500, accX + dx * k)); accY = Math.max(-2000, Math.min(2300, accY + dy * k));
    mouse.x = Math.round(accX); mouse.y = Math.round(accY);
  }
  window.addEventListener('pointermove', function (e) {
    if (paused) return;
    if (e.pointerType === 'touch') {
      if (e.pointerId === dragId) { var r = canvas.getBoundingClientRect(); nudge(e.clientX - dragX, e.clientY - dragY, 512 / r.width * TOUCH_GAIN); dragX = e.clientX; dragY = e.clientY; }
      return;
    }
    mouse.direct = prefs.pointerPaddle;
    var p = canvasPoint(e); mouse.x = Math.max(0, Math.min(511, p.x)); mouse.y = Math.max(0, Math.min(341, p.y));
  });
  app.addEventListener('pointerdown', function (e) {
    audioInit(); if (paused) return;
    var p = canvasPoint(e), inside = onCanvas(e);
    if (e.pointerType === 'touch') {
      if (!touched) { touched = true; layout(); }
      touches++; mouse.down = touches >= 2; mouse.direct = false;
      if (touches === 1) { dragId = e.pointerId; dragX = e.clientX; dragY = e.clientY; accX = mouse.x; accY = mouse.y; if (inside) F.pushEvent({ type: 'click', x: p.x, y: p.y }); }
    } else if (inside) { mouse.direct = prefs.pointerPaddle; mouse.x = p.x; mouse.y = p.y; mouse.down = true; F.pushEvent({ type: 'click', x: p.x, y: p.y }); }
    try { app.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  function up(e) {
    if (e.pointerType === 'touch') { touches = Math.max(0, touches - 1); mouse.down = touches >= 2; if (e.pointerId === dragId) dragId = null; }
    else mouse.down = false;
  }
  app.addEventListener('pointerup', up); app.addEventListener('pointercancel', up);
  app.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  window.addEventListener('blur', function () { touches = 0; dragId = null; mouse.down = false; });
  window.addEventListener('keydown', function (e) {
    if (modal || paused) { if (paused && e.key === 'Escape') closeDrawer(); return; }
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ' || e.key.length === 1) {
      if ((e.metaKey || e.ctrlKey) && e.key.length === 1) { F.pushEvent({ type: 'key', ch: e.key, cmd: true }); e.preventDefault(); }
      else if (!e.metaKey && !e.ctrlKey && !e.altKey) { F.pushEvent({ type: 'key', ch: e.key, cmd: false }); if (e.key === ' ') e.preventDefault(); }
    }
  });
  // the cursor as the game shows it: hidden during the title and during play with the Mac
  // control (the paddle is the cursor), shown at the bar and between games
  var cursorShown = null;
  function updateCursor() {
    var show = S.scene === 'bar' || (S.scene === 'table' && !S.running) || prefs.pointerPaddle || paused;
    if (show !== cursorShown) { cursorShown = show; app.style.cursor = show ? '' : 'none'; canvas.style.cursor = show ? 'crosshair' : 'none'; }
  }

  // ------------------------------------------------------------ the game's dialogs: the champion's name; the rest live in the drawer
  var ui = SCENES.ui, modal = false;
  ui.menuEnable = function () {};
  ui.dialog = function* () { return null; };
  ui.nameEntry = function* () {
    var result;
    var ov = $('nameDlg'); ov.classList.remove('hidden'); modal = true;
    var inp = $('nameInput'); inp.value = S.playerName === 'Visitor' ? '' : S.playerName;
    setTimeout(function () { inp.focus(); }, 50);
    $('nameOk').onclick = function () { result = inp.value.trim(); };
    inp.onkeydown = function (e) { if (e.key === 'Enter') { result = inp.value.trim(); e.preventDefault(); } };
    while (result === undefined) yield 0;
    ov.classList.add('hidden'); modal = false; inp.blur();
    return result;
  };
  ui.quit = function () { $('quit').classList.remove('hidden'); $('corner').hidden = true; };
  $('btnAgain').addEventListener('click', function () { location.reload(); });
  F.onSoundChange = function () { prefs.sound = S.sound ? 1 : 0; savePrefs(); paintSegs(); };

  // ------------------------------------------------------------ the runner (a 60 Hz tick, like the Mac's TickCount)
  var t0 = performance.now(), lastStep = t0, paused = false;
  function ticks() { return Math.floor((performance.now() - t0) * 60 / 1000); }
  F.setTicker(ticks); SCENES.setTicker(ticks);
  var gen = SCENES.program(), wake = 0, lastLim = 0, waitLim = 0, finished = false, firstBar = false;
  function step() {
    // after a stall (background tab, a long frame) or a pause the clock continues from where it stopped
    var now = performance.now();
    if (paused) { t0 += now - lastStep; lastStep = now; requestAnimationFrame(step); return; }
    if (now - lastStep > 250) t0 += now - lastStep - 50;
    lastStep = now;
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
    if (S.scene === 'bar' && !firstBar) { firstBar = true; toast(touched ? 'Tap someone at the bar to play them. Drag anywhere to move the paddle.' : 'Click someone at the bar to play them. The paddle follows the mouse.'); }
    requestAnimationFrame(step);
  }

  // ------------------------------------------------------------ layout: the 512x342 screen scaled to fit; in portrait it sits at the top, the rest is for the thumb
  function layout() {
    var W = window.innerWidth, H = window.innerHeight, portrait = H > W * 0.9;
    app.classList.toggle('portrait', portrait); app.classList.toggle('landscape', !portrait);
    var availW = W - 8, availH = portrait ? H - 60 : H - 8;
    var sc = Math.min(availW / 512, availH / 342);
    if (sc > 1 && !document.fullscreenElement) sc = Math.max(1, Math.floor(sc * 4) / 4);
    stage.style.width = Math.floor(512 * sc) + 'px'; stage.style.height = Math.floor(342 * sc) + 'px';
    $('hint').textContent = portrait && touched ? 'drag anywhere to move the paddle · a second finger is the button' : '';
  }
  window.addEventListener('resize', layout);
  document.addEventListener('fullscreenchange', function () { setTimeout(layout, 100); });

  // ------------------------------------------------------------ toast and the drawer (the game stands still while it is open)
  var toastTimer = 0;
  function toast(text) { var t = $('toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200); }
  var drawer = $('drawer'), scrim = $('scrim');
  function openDrawer() {
    if (paused) return;
    paused = true; touches = 0; dragId = null; mouse.down = false;
    if (actx) actx.suspend();
    readSettings(); updateCursor();
    drawer.classList.add('open'); scrim.classList.add('open');
  }
  function closeDrawer() {
    if (!paused) return;
    drawer.classList.remove('open'); scrim.classList.remove('open');
    paused = false; lastStep = performance.now();
    if (actx && actx.state === 'suspended') actx.resume();
  }
  $('btnMenu').addEventListener('click', function () { audioInit(); openDrawer(); });
  $('btnClose').addEventListener('click', closeDrawer); scrim.addEventListener('click', closeDrawer); $('mResume').addEventListener('click', closeDrawer);
  function sendAndClose(menu, item) { closeDrawer(); F.pushEvent({ type: 'menu', menu: menu, item: item }); }
  $('mNewGame').addEventListener('click', function () { sendAndClose('game', 1); });
  $('mNewOpp').addEventListener('click', function () { sendAndClose('game', 2); });
  $('mRoster').addEventListener('click', function () { sendAndClose('file', 1); });
  $('mAbout').addEventListener('click', function () { sendAndClose('apple', 1); });
  $('mQuit').addEventListener('click', function () { sendAndClose('file', 3); });
  $('mPaddleDefault').addEventListener('click', function () { SPC.paddleDefaults(); readSettings(); toast('The tournament paddle'); });
  $('mFull').addEventListener('click', function () { var el = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen(); closeDrawer(); });

  // sliders: [label, min, max, get, set]
  function sliders(hostId, defs) {
    var host = $(hostId); host.innerHTML = '';
    return defs.map(function (d) {
      var row = document.createElement('div'); row.className = 'setting';
      var lab = document.createElement('div'); lab.className = 'lbl'; lab.textContent = d[0]; row.appendChild(lab);
      var inp = document.createElement('input'); inp.type = 'range'; inp.min = d[1]; inp.max = d[2]; row.appendChild(inp);
      var val = document.createElement('span'); val.className = 'val'; row.appendChild(val);
      inp.addEventListener('input', function () { val.textContent = inp.value; d[4](parseInt(inp.value, 10)); });
      host.appendChild(row);
      return function () { var v = d[3](); inp.value = v; val.textContent = v; };
    });
  }
  var hitDefs = function (arr) {
    return [['Sideways bounce', 0, 100, function () { return arr()[0]; }, function (v) { arr()[0] = v; }],
            ['Forward bounce', 0, 100, function () { return arr()[1]; }, function (v) { arr()[1] = v; }],
            ['Sideways power', 0, 200, function () { return arr()[2]; }, function (v) { arr()[2] = v; }],
            ['Forward power', 0, 200, function () { return arr()[3]; }, function (v) { arr()[3] = v; }]];
  };
  var P = function () { return S.P; };
  var readers = [].concat(
    sliders('paddleSliders', [['Size', 3, 100, function () { return SPC.rdiv(S.plHw * 2, 5); }, function (v) { S.plHw = SPC.tdiv(v * 5, 2); SPC.resetBox(); }]]),
    sliders('upSliders', hitDefs(function () { return S.hitUp; })),
    sliders('downSliders', hitDefs(function () { return S.hitDown; })),
    sliders('blockerSliders', [
      ['Size', 0, 75, function () { return S.bHw; }, function (v) { S.bHw = v; S.blockerOn = v ? 1 : 0; if (v) SPC.buildBlocker(); paintSegs(); }],
      ['Weight', 1, 10, function () { return S.bWeight; }, function (v) { S.bWeight = v; }]]),
    sliders('droidSliders', [
      ['Paddle size', 3, 40, function () { return SPC.rdiv(P()[PIDX.hw] * 2, 5); }, function (v) { P()[PIDX.hw] = SPC.tdiv(v * 5, 2); SPC.buildOppSprites(); }],
      ['Sideways bounce', 0, 100, function () { return P()[0]; }, function (v) { P()[0] = v; }],
      ['Forward bounce', 0, 100, function () { return P()[1]; }, function (v) { P()[1] = v; }],
      ['Sideways power', 0, 200, function () { return P()[2]; }, function (v) { P()[2] = v; }],
      ['Forward power', 0, 200, function () { return P()[3]; }, function (v) { P()[3] = v; }],
      ['Idle: left-right range', 0, 250, function () { return P()[PIDX.idleXMax]; }, function (v) { P()[PIDX.idleXMax] = v; P()[PIDX.idleXMin] = -v; }],
      ['Idle: left-right speed', 0, 100, function () { return P()[PIDX.idleVxMax]; }, function (v) { P()[PIDX.idleVxMax] = v; P()[PIDX.idleVxMin] = v; }],
      ['Idle: front-rear range', 0, 150, function () { return 150 - P()[PIDX.idleZ2]; }, function (v) { P()[PIDX.idleZ1] = v + 150; P()[PIDX.idleZ2] = 150 - v; }],
      ['Idle: front-rear speed', 0, 100, function () { return P()[PIDX.idleVzMax]; }, function (v) { P()[PIDX.idleVzMax] = v; P()[PIDX.idleVzMin] = v; }],
      ['Block speed', 1, 200, function () { return P()[PIDX.retVxMax]; }, function (v) { var p = P(); p[PIDX.retVxMax] = p[PIDX.retVxMin] = p[PIDX.retVzMin] = p[PIDX.retVzMax] = v; }],
      ['Backswing speed', 1, 200, function () { return P()[PIDX.blkVx]; }, function (v) { P()[PIDX.blkVx] = P()[PIDX.blkVz] = v; }],
      ['Return: left-right min', -300, 300, function () { return P()[PIDX.bsXmin]; }, function (v) { P()[PIDX.bsXmin] = Math.min(v, P()[PIDX.bsXmax]); }],
      ['Return: left-right max', -300, 300, function () { return P()[PIDX.bsXmax]; }, function (v) { P()[PIDX.bsXmax] = Math.max(v, P()[PIDX.bsXmin]); }],
      ['Return: front-back min', 0, 300, function () { return P()[PIDX.bsZmin]; }, function (v) { P()[PIDX.bsZmin] = Math.min(v, P()[PIDX.bsZmax]); }],
      ['Return: front-back max', 0, 300, function () { return P()[PIDX.bsZmax]; }, function (v) { P()[PIDX.bsZmax] = Math.max(v, P()[PIDX.bsZmin]); }],
      ['Serve: left-right min', -300, 300, function () { return P()[PIDX.srvX2]; }, function (v) { P()[PIDX.srvX2] = Math.min(v, P()[PIDX.srvX1]); }],
      ['Serve: left-right max', -300, 300, function () { return P()[PIDX.srvX1]; }, function (v) { P()[PIDX.srvX1] = Math.max(v, P()[PIDX.srvX2]); }],
      ['Serve: front-back min', 0, 300, function () { return P()[PIDX.srvZ2]; }, function (v) { P()[PIDX.srvZ2] = Math.min(v, P()[PIDX.srvZ1]); }],
      ['Serve: front-back max', 0, 300, function () { return P()[PIDX.srvZ1]; }, function (v) { P()[PIDX.srvZ1] = Math.max(v, P()[PIDX.srvZ2]); }]]));
  // segmented controls
  var segs = [];
  function seg(id, get, set) {
    var el = $(id);
    function paint() { Array.prototype.forEach.call(el.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.dataset.v === String(get()) ? 'true' : 'false'); }); }
    el.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; set(b.dataset.v); paint(); });
    segs.push(paint);
  }
  function paintSegs() { segs.forEach(function (p) { p(); }); }
  seg('segSound', function () { return S.sound ? 'on' : 'off'; }, function (v) { if ((v === 'on') !== !!S.sound) F.toggleSound(); });
  seg('segMouse', function () { return prefs.pointerPaddle ? 'pointer' : 'mac'; }, function (v) { prefs.pointerPaddle = v === 'pointer'; savePrefs(); });
  seg('segBlocker', function () { return S.blockerOn ? ([25, 50, 75].indexOf(S.bHw) >= 0 ? S.bHw : 'custom') : 0; },
      function (v) { var hw = parseInt(v, 10); S.bHw = hw; S.blockerOn = hw ? 1 : 0; S.bWeight = 5; if (hw) SPC.buildBlocker(); readers.forEach(function (r) { r(); }); });
  function readSettings() {
    readers.forEach(function (r) { r(); }); paintSegs();
    var t = !!S.tournament;
    $('gPaddle').classList.toggle('off', t); $('gBlocker').classList.toggle('off', t);
    $('paddleNote').hidden = !t; $('blockerNote').hidden = !t;
    $('gDroid').hidden = S.opp !== 10;
    var atTable = S.scene === 'table';
    $('mNewGame').disabled = !atTable; $('mNewOpp').disabled = !atTable;
    $('mFull').textContent = document.fullscreenElement ? 'Leave full screen' : 'Full screen';
    $('mFull').hidden = !document.documentElement.requestFullscreen;
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden && actx) actx.suspend(); else if (!document.hidden && actx && !paused) actx.resume(); });

  layout(); paintSegs();
  requestAnimationFrame(step);
  window.__spc = { S: S, F: F, SPC: SPC, SCENES: SCENES, prefs: prefs, openDrawer: openDrawer, closeDrawer: closeDrawer };
})();
