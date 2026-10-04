/* The page: game data import and storage, the main loop, input, audio, saves and the menus. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('screen'), ctx = canvas.getContext('2d', { alpha: false });
  var image = ctx.createImageData(320, 200), pix32 = new Uint32Array(image.data.buffer);
  var engine = null, res = null, running = false, nextTick = 0, pending = [], pendingAt = 0, raf = 0;
  var gameFiles = null;   // {index, data, rsrc}
  var DB = 'mi1-native';

  // ---------- IndexedDB ----------
  function idb() {
    return new Promise(function (resolve, reject) {
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { var db = r.result; db.createObjectStore('files'); db.createObjectStore('saves'); };
      r.onsuccess = function () { resolve(r.result); }; r.onerror = function () { reject(r.error); };
    });
  }
  function dbGet(store, key) { return idb().then(function (db) { return new Promise(function (res, rej) { var t = db.transaction(store).objectStore(store).get(key); t.onsuccess = function () { res(t.result); }; t.onerror = function () { rej(t.error); }; }); }); }
  function dbPut(store, key, val) { return idb().then(function (db) { return new Promise(function (res, rej) { var t = db.transaction(store, 'readwrite'); t.objectStore(store).put(val, key); t.oncomplete = function () { res(); }; t.onerror = function () { rej(t.error); }; }); }); }
  function dbDel(store, key) { return idb().then(function (db) { return new Promise(function (res, rej) { var t = db.transaction(store, 'readwrite'); t.objectStore(store).delete(key); t.oncomplete = function () { res(); }; t.onerror = function () { rej(t.error); }; }); }); }
  function dbAll(store) { return idb().then(function (db) { return new Promise(function (res, rej) { var out = {}, c = db.transaction(store).objectStore(store).openCursor(); c.onsuccess = function () { var cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else res(out); }; c.onerror = function () { rej(c.error); }; }); }); }

  function toast(msg, ms) { var t = $('toast'); t.textContent = msg; t.style.opacity = 1; clearTimeout(t._tm); t._tm = setTimeout(function () { t.style.opacity = 0; }, ms || 1800); }
  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }

  // ---------- game data import ----------
  function readFile(f) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(new Uint8Array(r.result)); }; r.onerror = function () { rej(r.error); }; r.readAsArrayBuffer(f); }); }
  function classify(name, data, isResourceFork) {
    var n = name.toLowerCase().replace(/^.*\//, '');
    if (n === 'monkey1.000') return 'index';
    if (n === 'monkey1.001') return 'data';
    if (isResourceFork) return 'rsrc';
    if (n === 'monkey island.rsrc' || n === '._monkey island' || n === 'monkey island.bin' || n === 'monkey island' || n === 'monkey_island' || n === 'monkey_island.rsrc') return 'rsrc';
    return null;
  }
  async function importFiles(fileList) {
    var found = {}, msg = $('setupMsg'), bar = $('progress');
    show('progress'); msg.textContent = 'Reading…';
    try {
      for (var i = 0; i < fileList.length; i++) {
        var f = fileList[i], data = await readFile(f);
        if (SCUMM.StuffIt.isStuffIt5(data)) {
          var entries = SCUMM.StuffIt.list(data);
          for (var k = 0; k < entries.length; k++) {
            var e = entries[k], kind = classify(e.name, null, e.isResource);
            if (!kind) continue;
            msg.textContent = 'Unpacking ' + e.name + (e.isResource ? ' (resources)' : '') + '…';
            bar.firstElementChild.style.width = (10 + 80 * (k + 1) / entries.length) + '%';
            await new Promise(function (r) { setTimeout(r, 30); });
            found[kind] = SCUMM.StuffIt.extract(data, e);
          }
        } else if (SCUMM.Unzip.isZip(data)) {
          entries = SCUMM.Unzip.list(data);
          for (k = 0; k < entries.length; k++) {
            e = entries[k];
            var zn = e.name, isRsrc = /^\._|\.rsrc$/i.test(zn) || /\/\.rsrc\//i.test(e.path) || /__MACOSX/.test(e.path);
            kind = classify(zn.replace(/^\._/, ''), null, false);
            if (!kind && isRsrc && /monkey.?island/i.test(zn)) kind = 'rsrc';
            if (!kind) continue;
            if (kind === 'rsrc' && found.rsrc && !isRsrc) continue;
            msg.textContent = 'Unpacking ' + e.name + '…';
            found[kind] = await SCUMM.Unzip.extract(data, e);
          }
        } else {
          kind = classify(f.name, data, false);
          if (!kind) { // guess by content
            if (data.length > 16 && String.fromCharCode(data[0] ^ 0x69, data[1] ^ 0x69, data[2] ^ 0x69, data[3] ^ 0x69) === 'LECF') kind = 'data';
            else if (data.length > 16 && String.fromCharCode(data[0] ^ 0x69, data[1] ^ 0x69, data[2] ^ 0x69, data[3] ^ 0x69) === 'RNAM') kind = 'index';
          }
          if (kind) found[kind] = data;
        }
      }
      if (!found.index || !found.data) throw new Error('MONKEY1.000 and MONKEY1.001 were not found in what you chose.');
      // validate
      var test = new SCUMM.Res(found.index, found.data);
      if (!test.rooms[1] || !test.scripts[1]) throw new Error('These files do not look like the Macintosh Monkey Island data.');
      if (found.rsrc) { try { SCUMM.MacSound.parseInstruments(found.rsrc); } catch (e2) { console.warn(e2); found.rsrc = null; } }
      await dbPut('files', 'index', found.index); await dbPut('files', 'data', found.data);
      if (found.rsrc) await dbPut('files', 'rsrc', found.rsrc); else await dbDel('files', 'rsrc');
      gameFiles = found;
      msg.textContent = '';
      hide('progress'); hide('setup');
      $('startMsg').textContent = found.rsrc ? 'Game data ready.' : 'Game data ready (no Macintosh application found, so there will be no music).';
      showStart();
    } catch (e) {
      console.error(e);
      hide('progress');
      msg.textContent = 'Sorry: ' + e.message;
    }
  }
  $('files').addEventListener('change', function (ev) { if (ev.target.files.length) importFiles(ev.target.files); ev.target.value = ''; });

  async function showStart() {
    var saves = await dbAll('saves'), latest = null;
    for (var k in saves) if (!latest || saves[k].time > latest.time) latest = saves[k], latest.key = k;
    if (latest) { show('btnContinue'); $('btnContinue').textContent = 'Continue' + (latest.key === 'auto' ? ' (autosave, ' : ' (') + fmtDate(latest.time) + ')'; $('btnContinue').onclick = function () { startGame(latest); }; } else hide('btnContinue');
    show('start');
  }
  function fmtDate(t) { var d = new Date(t); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

  // ---------- engine ----------
  function createEngine() {
    res = new SCUMM.Res(gameFiles.index, gameFiles.data);
    engine = new SCUMM.Engine(res, {
      bootParam: 0,
      warn: function (s) { console.warn(s); },
      onMenu: function () { openMenu('File'); },
      onPause: function () { pauseGame(); },
      onRestart: function () { if (confirm('Are you sure you want to restart?')) { restartGame(); } },
      onTextSpeed: function (v) { toast('Text speed ' + v + ' of 9'); },
      onMessageDialog: function (text) { toast(text, 3000); }
    });
    if (gameFiles.rsrc) engine.setInstrumentData(gameFiles.rsrc);
    window.__engine = engine;
    engine.sound.player.onStart = audioStart;
    engine.sound.player.onStop = audioStop;
  }
  function startGame(save) {
    hide('start'); hide('setup');
    audioInit();
    if (!engine) createEngine();
    if (save) {
      try { engine.loadState(save.state); } catch (e) { console.error(e); toast('Could not load that save: ' + e.message, 3000); return; }
    } else {
      engine.runBootscript();
    }
    pending = []; nextTick = performance.now();
    if (!running) { running = true; raf = requestAnimationFrame(loop); }
    canvas.focus();
  }
  function restartGame() {
    audioStop();
    engine = null; createEngine(); engine.runBootscript();
    pending = []; nextTick = performance.now();
  }

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (pending.length) {
      while (pending.length && now >= pendingAt) { var f = pending.shift(); present(f.screen, f.rgba, now); pendingAt = now + f.delay * 1000 / 240; }
      if (pending.length) return;
      nextTick = now;
    }
    if (now - nextTick > 400) nextTick = now;   // fell far behind (tab hidden etc.): don't try to catch up
    var steps = 0;
    while (now >= nextTick && steps < 6) {
      var delta = engine.frameDelta();
      try { engine.scummLoop(delta); } catch (e) { crash(e); return; }
      nextTick += delta * 1000 / 60;
      steps++;
      if (engine.restartFlag) { engine.restartFlag = false; restartGame(); return; }
      if (engine.quitFlag) { engine.quitFlag = false; running = false; cancelAnimationFrame(raf); audioStop(); showStart(); return; }
      if (engine.frameQueue.length) {
        pending = engine.frameQueue.slice(); engine.frameQueue.length = 0; pendingAt = now;
        return;
      }
    }
    engine.updatePalette();
    present(engine.screen, engine.rgba, now);
  }
  var lastPal = null;
  function present(screen, rgba, now) {
    if (rgba) lastPal = rgba;
    var pal = lastPal || engine.rgba;
    for (var i = 0; i < 64000; i++) pix32[i] = pal[screen[i]];
    var shake = engine.getShakeOffset(now);
    if (shake) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 320, 200); }
    ctx.putImageData(image, 0, shake);
  }
  function crash(e) {
    console.error(e);
    running = false; cancelAnimationFrame(raf);
    audioStop();
    toast('The game hit an error: ' + e.message, 6000);
    setTimeout(function () { show('start'); $('startMsg').textContent = 'The game stopped with an error (' + e.message + '). You can continue from a save or start again.'; showStart(); }, 500);
  }

  // ---------- layout ----------
  function layout() {
    var st = $('stage'), w = st.clientWidth, portrait = window.innerHeight > window.innerWidth;
    var h = portrait ? window.innerHeight - $('menubar').offsetHeight - $('toolbar').offsetHeight : st.clientHeight;
    var scale = Math.min(w / 320, h / 200);
    if (scale > 1.5 && w >= 640 && h >= 400) scale = Math.max(2, Math.floor(scale * 2) / 2);  // keep crisp multiples on big screens
    canvas.style.width = Math.floor(320 * scale) + 'px'; canvas.style.height = Math.floor(200 * scale) + 'px';
  }
  window.addEventListener('resize', layout); layout();
  if (!('ontouchstart' in window)) canvas.classList.add('arrow');

  // ---------- input ----------
  function gamePos(ev) {
    var r = canvas.getBoundingClientRect();
    var x = (ev.clientX - r.left) * 320 / r.width, y = (ev.clientY - r.top) * 200 / r.height;
    return { x: Math.max(0, Math.min(319, x | 0)), y: Math.max(0, Math.min(199, y | 0)) };
  }
  var touch = null, longTimer = 0;
  canvas.addEventListener('pointerdown', function (ev) {
    if (!engine || !running) return;
    ev.preventDefault();
    var p = gamePos(ev);
    engine.mouseMove(p.x, p.y);
    if (ev.pointerType === 'mouse') {
      engine.mouseButton(ev.button === 2 ? 1 : 0, true);
    } else {
      touch = { id: ev.pointerId, t: performance.now(), x: p.x, y: p.y, long: false };
      clearTimeout(longTimer);
      longTimer = setTimeout(function () { if (touch) { touch.long = true; if (navigator.vibrate) navigator.vibrate(15); engine.mouseButton(1, true); engine.mouseButton(1, false); } }, 450);
    }
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointermove', function (ev) {
    if (!engine || !running) return;
    var p = gamePos(ev);
    engine.mouseMove(p.x, p.y);
    if (touch && (Math.abs(p.x - touch.x) > 6 || Math.abs(p.y - touch.y) > 6)) { clearTimeout(longTimer); touch.moved = true; }
  });
  function pointerEnd(ev) {
    if (!engine || !running) return;
    ev.preventDefault();
    var p = gamePos(ev);
    engine.mouseMove(p.x, p.y);
    if (ev.pointerType === 'mouse') engine.mouseButton(ev.button === 2 ? 1 : 0, false);
    else if (touch) {
      clearTimeout(longTimer);
      if (!touch.long) { engine.mouseButton(0, true); engine.mouseButton(0, false); }
      touch = null;
    }
  }
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', function () { clearTimeout(longTimer); touch = null; });
  canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  canvas.tabIndex = 0;
  window.addEventListener('keydown', function (ev) {
    if (!engine || !running) return;
    if (ev.metaKey || ev.altKey) return;
    var ascii = 0, key = ev.key;
    if (key.length === 1) ascii = key.charCodeAt(0);
    else if (key === 'Escape') ascii = 27;
    else if (key === 'Enter') ascii = 13;
    else if (key === 'Backspace') ascii = 8;
    else if (key === 'Tab') ascii = 9;
    else if (/^F\d+$/.test(key)) ascii = 0;
    else return;
    if (key === 'F5' || key === 'F1') { ev.preventDefault(); openMenu('File'); return; }
    if (ev.ctrlKey && ascii >= 97 && ascii <= 122) { }
    engine.keyDown(key, ascii || 1, ev.ctrlKey);
    if (key === ' ' || key === 'Tab' || key === 'Backspace') ev.preventDefault();
  });
  function sendKey(key, ascii) { if (engine && running) engine.keyDown(key, ascii, false); }
  $('btnEsc').onclick = function () { sendKey('Escape', 27); };
  $('btnDot').onclick = function () { sendKey('.', 46); };
  $('btnVerb').onclick = function () { if (engine && running) { engine.mouseButton(1, true); engine.mouseButton(1, false); } };
  $('btnFull').onclick = function () {
    var el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
    else toast('Add this page to your home screen for full screen.');
  };
  document.addEventListener('visibilitychange', function () {
    if (!engine) return;
    if (document.hidden) { if (audio.ctx) audio.ctx.suspend(); autosave(); }
    else { if (audio.ctx) audio.ctx.resume(); nextTick = performance.now(); }
  });
  function saveRecord(key) {
    var st = engine.saveState(key);
    engine.updatePalette();
    return { state: st, time: Date.now(), room: res.roomNames[engine.currentRoom] || ('room ' + engine.currentRoom), screen: new Uint8Array(engine.screen), rgba: new Uint32Array(engine.rgba) };
  }
  function autosave() {
    if (!engine || !running || engine.currentRoom === 0 || pending.length) return;
    try { dbPut('saves', 'auto', saveRecord('auto')); } catch (e) { console.warn(e); }
  }
  setInterval(autosave, 120000);

  // ---------- audio ----------
  var audio = { ctx: null, src: null, gain: null, buffers: {}, muted: false, curId: 0 };
  function audioInit() {
    if (audio.ctx) { audio.ctx.resume(); return; }
    try {
      audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
      audio.gain = audio.ctx.createGain(); audio.gain.gain.value = audio.muted ? 0 : 0.8; audio.gain.connect(audio.ctx.destination);
    } catch (e) { audio.ctx = null; }
  }
  function audioStart(id, snd) {
    if (!audio.ctx) return;
    audioStop();
    var buf = audio.buffers[id];
    if (!buf) {
      var rate = audio.ctx.sampleRate, pcm = SCUMM.MacSound.render(snd, rate);
      if (!pcm.length) return;
      buf = audio.ctx.createBuffer(1, pcm.length, rate); buf.copyToChannel(pcm, 0);
      audio.buffers[id] = buf;
    }
    var src = audio.ctx.createBufferSource(); src.buffer = buf; src.loop = !!snd.loop; src.connect(audio.gain);
    src.start();
    audio.src = src; audio.curId = id;
  }
  function audioStop() {
    if (audio.src) { try { audio.src.stop(); } catch (e) {} audio.src.disconnect(); audio.src = null; }
    audio.curId = 0;
  }
  function setMuted(m) { audio.muted = m; if (audio.gain) audio.gain.gain.value = m ? 0 : 0.8; try { localStorage.setItem('mi1-muted', m ? '1' : '0'); } catch (e) {} }
  try { audio.muted = localStorage.getItem('mi1-muted') === '1'; } catch (e) {}

  // ---------- pause ----------
  function pauseGame() {
    if (!running) return;
    pauseForMenu();
    $('pauseMsg').textContent = 'Game paused.';
    show('paused');
  }
  $('paused').addEventListener('click', function () { hide('paused'); resumeFromMenu(); });
  window.addEventListener('keydown', function (ev) { if (!$('paused').classList.contains('hidden') && (ev.key === ' ' || ev.key === 'Escape')) { ev.preventDefault(); hide('paused'); resumeFromMenu(); } });

  // ---------- menus ----------
  var menuWasRunning = false;
  function pauseForMenu() { menuWasRunning = running; running = false; cancelAnimationFrame(raf); if (audio.ctx) audio.ctx.suspend(); }
  function resumeFromMenu() { if (menuWasRunning && engine) { running = true; nextTick = performance.now(); raf = requestAnimationFrame(loop); if (audio.ctx) audio.ctx.resume(); } }
  function openMenu(which) {
    if (!engine) return;
    pauseForMenu();
    $('menuTitle').textContent = which;
    var items = which === 'File' ? [
      ['Save game…', function () { closeMenu(false); openSaves(true); }],
      ['Load game…', function () { closeMenu(false); openSaves(false); }],
      ['Restart game', function () { if (confirm('Start the game from the beginning?')) { closeMenu(false); restartGame(); running = true; raf = requestAnimationFrame(loop); } }],
      ['Choose different game files', function () { closeMenu(false); running = false; audioStop(); show('setup'); }]
    ] : [
      [audio.muted ? 'Sound: off (turn on)' : 'Sound: on (turn off)', function () { setMuted(!audio.muted); closeMenu(true); }],
      ['Skip cut-scene (Esc)', function () { closeMenu(true); sendKey('Escape', 27); }],
      ['Controls', function () { alert('Tap: walk / use the verbs and objects. Long press: the default action for what you touched (like a right click).\n"Skip" skips a cut-scene, "Next line" skips the current line of dialogue.\nKeyboard: Esc skips a cut-scene, "." skips a line, F5 opens the File menu, and the verbs have their usual hotkeys.'); }],
      ['About', function () { alert('The Secret of Monkey Island (Macintosh, 1993) running on a JavaScript port of the SCUMM engine, derived from ScummVM (GPL v3).\nThe game data comes from your own copy and never leaves this device.'); }]
    ];
    var box = $('menuItems'); box.innerHTML = '';
    items.forEach(function (it) { var b = document.createElement('button'); b.className = 'btn'; b.style.display = 'block'; b.style.width = '260px'; b.textContent = it[0]; b.onclick = it[1]; box.appendChild(b); });
    show('menu');
  }
  function closeMenu(resume) { hide('menu'); if (resume) resumeFromMenu(); }
  $('mFile').onclick = function () { if ($('menu').classList.contains('hidden')) openMenu('File'); else closeMenu(true); };
  $('mGame').onclick = function () { if ($('menu').classList.contains('hidden')) openMenu('Game'); else closeMenu(true); };
  $('btnMenuClose').onclick = function () { closeMenu(true); };
  $('btnPlay').onclick = function () { startGame(null); };
  $('btnReplace').onclick = function () { hide('start'); show('setup'); };

  // ---------- saves ----------
  var SLOTS = 8;
  async function openSaves(saving) {
    pauseForMenu();
    $('savesTitle').textContent = saving ? 'Save game' : 'Load game';
    var saves = await dbAll('saves'), box = $('slots'); box.innerHTML = '';
    var keys = [];
    if (!saving && saves.auto) keys.push('auto');
    for (var i = 1; i <= SLOTS; i++) keys.push('slot' + i);
    keys.forEach(function (key, idx) {
      var s = saves[key], div = document.createElement('div'); div.className = 'slot' + (s ? '' : ' empty');
      var c = document.createElement('canvas'); c.width = 320; c.height = 200; div.appendChild(c);
      if (s) { var cx = c.getContext('2d'), im = cx.createImageData(320, 200), p32 = new Uint32Array(im.data.buffer); for (var k = 0; k < 64000; k++) p32[k] = s.rgba[s.screen[k]]; cx.putImageData(im, 0, 0); }
      var l = document.createElement('div'); l.className = 'lbl'; l.textContent = s ? (key === 'auto' ? 'Autosave: ' : '') + (s.room || '') + ' — ' + fmtDate(s.time) : 'Slot ' + key.replace('slot', '') + ' (empty)'; div.appendChild(l);
      div.onclick = async function () {
        if (saving) {
          if (s && !confirm('Overwrite this save?')) return;
          await dbPut('saves', key, saveRecord(key));
          hide('saves'); resumeFromMenu(); toast('Game saved.');
        } else if (s) {
          hide('saves');
          try { audioStop(); engine.loadState(s.state); pending = []; } catch (e) { console.error(e); toast('Could not load: ' + e.message, 3000); }
          resumeFromMenu(); toast('Game loaded.');
        }
      };
      box.appendChild(div);
    });
    show('saves');
  }
  $('btnSavesClose').onclick = function () { hide('saves'); resumeFromMenu(); };

  // ---------- startup ----------
  (async function init() {
    try {
      var files = await dbAll('files');
      if (files.index && files.data) { gameFiles = { index: files.index, data: files.data, rsrc: files.rsrc || null }; hide('setup'); showStart(); }
    } catch (e) { console.warn(e); }
  })();
})();
