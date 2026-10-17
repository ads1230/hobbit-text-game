// Shufflepuck Café — the scenes around the game: title and credits, the bar
// (choosing an opponent), the roster of champions, menus and dialogs, and the
// main program.
'use strict';
var SCENES = (function () {
  var S = SPC.S, R = QD.R, tdiv = SPC.tdiv, rnd = SPC.rnd, w16 = SPC.w16;
  var port = SPC.port, back = SPC.back, bg = SPC.bg, screen = SPC.screen, wport = SPC.wport;
  var F = FLOW, SN = OPP.SND;
  var ticks = function () { return 0; };
  var ui = { dialog: null, nameEntry: null, menuEnable: function () {} };   // provided by app.js

  // ------------------------------------------------------------ title (F5_213a, F5_246a, F5_23ae, F5_22c2)
  function* presents() {
    wport.setPort(screen); F.blackScreen(wport); port.setPort(bg); F.blackScreen(port);
    SPC.drawPict(port, 0, 0, 1006);
    yield* F.fadeOut(); yield* F.fadeIn();
  }
  function* title() {
    S.scene = 'title';
    yield* F.fadeOut();
    port.setPort(bg); SPC.drawPict(port, 0, 0, 1005); SPC.drawPict(port, 177, 280, 1020);
    yield* F.fadeIn();
    // F5_23ae: the credits cycle; a click or key skips
    yield { lim: 100 };
    function* names(seq) { for (var i = 0; i < seq.length; i++) { yield { lim: 9 }; wport.setPort(screen); SPC.drawPict(wport, 177, 280, 1020 + seq[i]); SPC.setDirty(true); } yield { lim: 100 }; }
    yield* names([0, 1, 2, 3, 4]);
    if (!F.takeEvent(['click', 'key'])) { yield* names([4, 3, 2, 1, 0]); if (!F.takeEvent(['click', 'key'])) yield* names([0, 1, 2, 3, 4]); }
  }
  function drawBar(p) {                      // F5_22c2 / L5_2348: the bar with the champion's name on the sign
    SPC.drawPict(p, 0, -7, 1007);
    p.moveTo(234, 66);
    var w = QD.stringWidth(SPC.FONTS.la12, S.champion, true);
    p.moveTo(234 - tdiv(w, 2), 66); p.drawString(SPC.FONTS.la12, S.champion, true, QD.srcBic);
  }
  function* zoomToBar() {
    port.setPort(bg); drawBar(port); port.setPort(back); drawBar(port);
    yield* F.zoomIn(R(112, 159, 120, 173));
  }
  function* fadeToBar() {                    // L5_2348
    yield* F.fadeOut(); port.setPort(bg); drawBar(port); yield* F.fadeIn();
  }

  // ------------------------------------------------------------ the bar (F5_634e)
  var barAnim = {};
  function barDraw(left, top, id) { SPC.drawPict(wport, left, top, id); SPC.setDirty(true); }
  // L5_4146 .. L5_4798: seven little animations, each with its own timer
  function barTimers(reset) {
    var t = ticks();
    function anim(key, draw, frames, times, nextLo, nextHi, firstLo, firstHi) {
      var a = barAnim[key] || (barAnim[key] = { at: 0, phase: 0 });
      if (reset) { a.at = t + rnd(0, 120); a.phase = 0; }
      if (t <= a.at) return;
      var d = t - a.at;
      for (var i = 0; i < frames.length; i++) if (a.phase < i + 1 && d >= times[i]) {
        draw(frames[i]); a.phase++;
        if (i === frames.length - 1) { a.at = t + rnd(nextLo, nextHi); a.phase = 0; }
      }
    }
    anim('a', function (n) { barDraw(37, 122, 17016 + n); }, [0, 1, 2, 1, 0], [0, 10, 20, 30, 40], 20, 400);
    anim('b', function (n) { barDraw(64, 122, 17019 + n); }, [0, 1, 2, 3, 2, 1, 0], [0, 10, 20, 30, 40, 50, 60], 20, 400);
    anim('c', function (n) { barDraw(117, 53, 17013 + n); }, [0, 1, 2], [0, 7, 14], 7, 7);
    var e = barAnim.e || (barAnim.e = { at: 0, phase: 0, kind: 0 });
    if (reset) { e.at = t + rnd(0, 120); e.phase = 0; }
    if (t > e.at) {
      var d = t - e.at;
      if (e.phase < 1 && d >= 0) { e.kind = rnd(0, 3); e.phase++; }
      if (e.kind) {
        if (e.phase < 2 && d >= 0) { barDraw(242, 129, 17001); e.phase++; }
        if (e.phase < 3 && d >= 2) { barDraw(242, 129, 17000); e.phase++; }
        if (e.phase < 4 && d >= 4) { barDraw(242, 129, 17001); e.phase++; }
        if (e.phase < 5 && d >= 6) { barDraw(242, 129, 17002); e.at = t + rnd(100, 500); e.phase = 0; }
      } else {
        if (e.phase < 2 && d >= 0) { barDraw(244, 128, 17010); e.phase++; }
        if (e.phase < 3 && d >= 6) { barDraw(244, 128, 17009); e.phase++; }
        if (e.phase < 4 && d >= 30) { barDraw(244, 128, 17010); e.phase++; }
        if (e.phase < 5 && d >= 35) { barDraw(242, 129, 17002); e.at = t + rnd(100, 500); e.phase = 0; }
      }
    }
    anim('f', function (n) { barDraw(365, 326, 17006 + n); }, [0, 1, 2], [0, 150, 170], 100, 500);
    anim('g', function (n) { barDraw(31, 42, 17011 + n); }, [1, 0], [0, 30], 50, 600);
    var h = barAnim.h || (barAnim.h = { at: 0 });
    if (reset) h.at = t + rnd(0, 120);
    if (t > h.at) { barDraw(357, 193, 17003 + rnd(0, 2)); h.at = t + rnd(30, 140); }
  }
  // L5_60a8: which character was clicked
  function barClick(x, y) {
    function inR(l, t, r, b) { return x >= l && x < r && y >= t && y < b; }
    if (inR(70, 190, 95, 250)) S.opp = 1;
    if (inR(227, 116, 291, 292)) S.opp = 7;
    if (inR(346, 313, 458, 342)) S.opp = 2;
    if (inR(11, 37, 67, 124) || inR(0, 124, 22, 231)) S.opp = 6;
    if (inR(23, 124, 86, 176) || inR(23, 176, 70, 281)) S.opp = 4;
    if (inR(135, 169, 209, 212) || inR(104, 211, 227, 289)) S.opp = 5;
    if (inR(320, 175, 434, 266) || inR(320, 255, 374, 287)) S.opp = 3;
    if (inR(434, 134, 512, 255) || inR(419, 255, 512, 313) || inR(458, 312, 512, 342)) S.opp = 8;
    if (inR(360, 13, 512, 110)) S.quit = 1;
    if (inR(97, 58, 161, 124)) { S.opp = 10; return; }
    if (inR(153, 15, 316, 87)) { tournamentOn(); S.opp = 1; }
  }
  function tournamentOn() {                  // L5_2ad6
    S.tournament = 1; SPC.paddleDefaults(); S.blockerOn = 0; S.bHw = 0; ui.menuEnable();
  }
  function* bar() {
    S.scene = 'bar'; S.tournament = 0; ui.menuEnable();
    F.flushEvents(); S.opp = 0;
    if (S.lastResult === 1) { S.lastResult = 0; F.sound(SN.cheer); }
    if (S.lastResult === 2) { S.lastResult = 0; F.sound(SN.boo); }
    barTimers(true);
    while (!S.opp && !S.quit) {
      var e;
      while ((e = F.takeEvent(['key', 'menu']))) {
        if (e.type === 'menu') { yield* menuCommand(e); continue; }
        if (!e.cmd) continue;
        var c = e.ch.toLowerCase();
        if (c === 'q') S.quit = 1;
        if (c === 's') F.toggleSound();
        if (c === 'r') { F.stopSound(); yield* rosterShow(); barTimers(true); }
      }
      if (S.quit) break;
      if (SPC.sfx.done()) { yield 0; F.sound(SN.piano); }     // L5_1fbe
      barTimers(false);
      var ce = F.takeEvent(['click']);
      if (ce) barClick(ce.x, ce.y);
      yield 0;
    }
    F.stopSound();
    if (S.quit) return;
    F.setupOpponent(S.opp);
    yield* F.showTable(S.opp !== 2 && S.opp !== 6);
    if (S.opp === 2) yield* F.visineRise();
    F.flushEvents();
    F.setCmd(2);
  }

  // ------------------------------------------------------------ roster (L5_24a8, F5_24e6)
  function drawRoster() {
    wport.setPort(screen); F.blackScreen(wport); SPC.drawPict(wport, 12, 12, 1040);
    var fnt = SPC.FONTS.la12;
    for (var i = 0; i < 20; i++) {
      var e = S.roster[i]; if (!e || e[1] >= 15) continue;
      var col = i < 10 ? 40 : 258, row = i % 10;
      wport.moveTo(col, 123 + 20 * row);
      wport.drawString(fnt, e[0] + '   - 15/' + e[1], true, QD.srcBic);
    }
    SPC.setDirty(true);
  }
  function* rosterShow() {
    drawRoster(); F.flushEvents();
    while (!F.takeEvent(['click', 'key'])) yield 0;
    F.restoreScreen();
  }
  // L5_28ca: insert the new champion into the roster, sorted by the opponent's points
  function insertChampion(name, pts) {
    var i = 0;
    while (i < 20 && pts > S.roster[i][1]) i++;
    if (i >= 20) return;
    for (var j = 19; j > i; j--) S.roster[j] = S.roster[j - 1].slice();
    S.roster[i] = [name, pts];
    if (i === 0) S.champion = name;
  }
  function* championSequence() {               // L5_2af8
    var name = yield* ui.nameEntry();
    if (name !== null) { S.playerName = name || S.playerName; }
    insertChampion(name || 'Visitor', S.oscore);
    saveRoster();
    drawRoster(); F.flushEvents();
    while (!F.takeEvent(['click', 'key'])) yield 0;
    S.lastResult = 1;
  }
  function saveRoster() { try { localStorage.setItem('spc.roster', JSON.stringify({ champion: S.champion, roster: S.roster })); } catch (e) {} }
  function loadRoster() {
    S.champion = SPC_DATA.champion; S.roster = SPC_DATA.roster.map(function (e) { return e.slice(); });
    try { var j = JSON.parse(localStorage.getItem('spc.roster')); if (j && j.roster && j.roster.length === 20) { S.roster = j.roster; S.champion = j.champion; } } catch (e) {}
  }

  // ------------------------------------------------------------ menus (L2_4162)
  function* menuCommand(e) {
    var m = e.menu, it = e.item;
    if (m === 'apple') yield* about();
    else if (m === 'file') { if (it === 1) yield* rosterShow(); if (it === 3) S.quit = 1; }
    else if (m === 'game') {
      if (it === 1) { if (S.oscore) S.oscore = 15; else if (S.score) S.score = 15; F.setCmd(2); }   // New Game (L2_12be)
      if (it === 2) F.setCmd(3);
      if (it === 4) F.toggleSound();
    } else if (m === 'paddle') {
      if (it === 1) { var v = yield* ui.dialog('Paddle Size', [['Size', SPC.rdiv(S.plHw * 2, 5), 3, 100]]); if (v) { S.plHw = tdiv(v[0] * 5, 2); SPC.resetBox(); } }
      if (it === 2) { v = yield* ui.dialog('Paddle: Button Up', hitSliders(S.hitUp)); if (v) S.hitUp = v.slice(); }
      if (it === 3) { v = yield* ui.dialog('Paddle: Button Down', hitSliders(S.hitDown)); if (v) S.hitDown = v.slice(); }
      if (it === 5) SPC.paddleDefaults();
      ui.menuEnable();
    } else if (m === 'blocker') {
      if (it === 1) { S.blockerOn = 0; S.bHw = 0; }
      if (it >= 2 && it <= 4) { S.blockerOn = 1; S.bHw = 25 * (it - 1); S.bWeight = 5; SPC.buildBlocker(); }
      if (it === 5) { v = yield* ui.dialog('Blocker', [['Size', S.bHw, 0, 75], ['Weight', S.bWeight, 1, 10]]); if (v) { S.bHw = v[0]; S.bWeight = v[1]; S.blockerOn = S.bHw ? 1 : 0; if (S.blockerOn) SPC.buildBlocker(); } }
      ui.menuEnable();
    } else if (m === 'droid') yield* droidMenu(it);
  }
  function hitSliders(p) { return [['Sideways Bounce', p[0], 0, 100], ['Forward Bounce', p[1], 0, 100], ['Sideways Power', p[2], 0, 200], ['Forward Power', p[3], 0, 200]]; }
  function* droidMenu(it) {                   // F5_17e4 .. F5_19f6 (the droid's parameters are the current P[])
    var P = S.P, I = SPC.PIDX, v;
    if (it === 1) { v = yield* ui.dialog('Blocking Paddle', [['Size', SPC.rdiv(P[I.hw] * 2, 5), 3, 40]]); if (v) { P[I.hw] = tdiv(v[0] * 5, 2); SPC.buildOppSprites(); } }
    if (it === 2) { v = yield* ui.dialog('Blocking Paddle', hitSliders([P[0], P[1], P[2], P[3]])); if (v) { P[0] = v[0]; P[1] = v[1]; P[2] = v[2]; P[3] = v[3]; } }
    if (it === 4) {
      v = yield* ui.dialog('Idle', [['Left-Right Range', P[I.idleXMax], 0, 250], ['Left-Right Speed', P[I.idleVxMax], 0, 100], ['Front-Rear Range', 150 - P[I.idleZ2], 0, 150], ['Front-Rear Speed', P[I.idleVzMax], 0, 100]]);
      if (v) { P[I.idleXMax] = v[0]; P[I.idleXMin] = -v[0]; P[I.idleVxMax] = v[1]; P[I.idleVxMin] = v[1]; P[I.idleZ1] = v[2] + 150; P[I.idleZ2] = 150 - v[2]; P[I.idleVzMax] = v[3]; P[I.idleVzMin] = v[3]; }
    }
    if (it === 5) { v = yield* ui.dialog('Speed', [['Block Speed', P[I.retVxMax], 1, 200], ['Backswing Speed', P[I.blkVx], 1, 200]]); if (v) { P[I.retVxMax] = P[I.retVxMin] = P[I.retVzMin] = P[I.retVzMax] = v[0]; P[I.blkVx] = P[I.blkVz] = v[1]; } }
    if (it === 6) {
      v = yield* ui.dialog('Return', [['Left-Right Minimum', P[I.bsXmin], -300, 300], ['Left-Right Maximum', P[I.bsXmax], -300, 300], ['Front-Back Minimum', P[I.bsZmin], 0, 300], ['Front-Back Maximum', P[I.bsZmax], 0, 300]]);
      if (v) { P[I.bsXmin] = Math.min(v[0], v[1]); P[I.bsXmax] = Math.max(v[0], v[1]); P[I.bsZmin] = Math.min(v[2], v[3]); P[I.bsZmax] = Math.max(v[2], v[3]); }
    }
    if (it === 7) {
      v = yield* ui.dialog('Serve', [['Left-Right Minimum', P[I.srvX2], -300, 300], ['Left-Right Maximum', P[I.srvX1], -300, 300], ['Front-Back Minimum', P[I.srvZ2], 0, 300], ['Front-Back Maximum', P[I.srvZ1], 0, 300]]);
      if (v) { P[I.srvX2] = Math.min(v[0], v[1]); P[I.srvX1] = Math.max(v[0], v[1]); P[I.srvZ2] = Math.min(v[2], v[3]); P[I.srvZ1] = Math.max(v[2], v[3]); }
    }
  }
  function* about() {                          // L2_36da: the credits with the flickering neon sign
    // a dBoxProc window the size of picture 23, centred; the neon "Cafe" flickers inside it
    var pic = SPC.pict(23), w = pic.width, h = pic.height, l = tdiv(512 - w, 2), t = tdiv(342 - h, 2);
    var fr = R(l - 8, t - 8, l + w + 8, t + h + 8);
    var saved = new QD.Bitmap(fr.r - fr.l, fr.b - fr.t); QD.copyBits(screen, fr, saved, R(0, 0, saved.width, saved.height), 0);
    wport.setPort(screen);
    wport.penPattern(QD.WHITE); wport.mode(QD.patCopy); wport.paintRect(fr);
    wport.penPattern(QD.BLACK); wport.pen(1, 1); wport.frameRect(fr);
    wport.pen(2, 2); wport.frameRect(R(fr.l + 3, fr.t + 3, fr.r - 3, fr.b - 3));
    SPC.drawPict(wport, l, t, 23); SPC.setDirty(true);
    F.flushEvents();
    while (!F.takeEvent(['click', 'key'])) { yield { lim: 1 }; SPC.drawPict(wport, l + 224, t + 20, 19 + rnd(0, 3)); SPC.setDirty(true); }
    QD.copyBits(saved, R(0, 0, saved.width, saved.height), screen, fr, 0); SPC.setDirty(true);
    F.flushEvents();
  }

  // ------------------------------------------------------------ at the table: the main loop (F2_3a0a)
  function* tableLoop() {
    S.scene = 'table';
    for (;;) {
      var c = F.getCmd();
      if (c === 2) { F.setCmd(0); yield* F.playGame(); continue; }
      if (c === 3) { F.setCmd(0); return; }
      if (c === 1) { F.setCmd(0); var k = F.getCmdKey().toLowerCase(); if (k === 'q') S.quit = 1; if (k === 'n') { if (S.oscore) S.oscore = 15; else if (S.score) S.score = 15; F.setCmd(2); } if (k === 'o') F.setCmd(3); if (k === 'r') { F.stopSound(); yield* rosterShow(); } continue; }
      var m = F.getMenuCmd(); if (m) { yield* menuCommand(m); continue; }
      if (S.quit) return;
      F.idleAnim();
      var e;
      while ((e = F.takeEvent(['click', 'key', 'menu']))) {
        if (e.type === 'menu') { F.setMenuCmd(e); break; }
        if (e.type === 'click') { F.setCmd(2); break; }
        if (e.type === 'key') { if (e.cmd) F.setCmd(1, e.ch); else F.setCmd(2); break; }
      }
      yield 0;
    }
  }

  // ------------------------------------------------------------ the program
  function* program() {
    loadRoster();
    SPC.setSeed(Date.now() & 0x7fffffff);
    S.playerName = 'Visitor'; S.oppName = '';
    yield* presents();
    SPC.buildPuckSprites(); SPC.buildPlayerStrips();
    S.P = SPC_DATA.params[8].slice(); SPC.buildOppSprites();
    SPC.resetBox();
    yield* title();
    yield* zoomToBar();
    for (;;) {
      yield* bar();
      if (S.quit) break;
      yield* tableLoop();
      if (S.quit) break;
      yield* fadeToBar();
    }
    F.fadeOut && (yield* F.fadeOut());
    if (ui.quit) ui.quit();
  }

  F.setChampion(championSequence);
  return { program: program, setTicker: function (fn) { ticks = fn; }, ui: ui, drawRoster: drawRoster, bar: bar, saveRoster: saveRoster, loadRoster: loadRoster };
})();
