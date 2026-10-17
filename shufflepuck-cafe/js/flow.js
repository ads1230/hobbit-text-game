// Shufflepuck Café — the game flow: serving, the rally loop, scoring, the
// scoreboard hand, the opponents' idle animations and reactions. Written as
// generators: `yield n` waits n ticks (1/60 s), `yield {lim: n}` is the frame
// limiter (at most one pass per n ticks), `yield 0` waits for the next tick.
'use strict';
var FLOW = (function () {
  var S = SPC.S, R = QD.R, tdiv = SPC.tdiv, w16 = SPC.w16, clamp = SPC.clamp, rnd = SPC.rnd, mapv = SPC.mapv;
  var port = SPC.port, back = SPC.back, bg = SPC.bg, screen = SPC.screen, wport = SPC.wport;
  var PIDX = SPC.PIDX;
  var sfx = SPC.sfx;

  // ------------------------------------------------------------ input/events
  var events = [];            // {type:'click'|'key'|'menu', ...}
  function pushEvent(e) { events.push(e); }
  function takeEvent(types) {
    for (var i = 0; i < events.length; i++) if (types.indexOf(events[i].type) >= 0) return events.splice(i, 1)[0];
    return null;
  }
  function flushEvents() { events.length = 0; }
  var cmd = 0, cmdKey = '';   // G0b1e / G0b1c: 1 = menu key, 2 = start game, 3 = to the bar
  var menuCmd = null;         // pending menu selection {menu, item}

  // ------------------------------------------------------------ helpers
  function fullRedraw() { SPC.toScreen(SPC.FULL); }                       // F2_45d8
  function restoreScreen() { QD.copyBits(back, SPC.FULL, screen, SPC.FULL, 0); SPC.setDirty(true); }   // F2_460c
  function restoreBg() { SPC.fromBg(SPC.FULL); fullRedraw(); }          // L2_466c
  function blackScreen(p) { p.fillRect(SPC.FULL, QD.BLACK); }           // F2_3598
  function sound(spec) { if (typeof spec === 'function') spec = spec(); sfx.play(spec[0], spec[1], spec[2]); }
  function stopSound() { sfx.stop(); }                                   // F5_1b72

  // F5_1ffa: dissolve the screen to black (11 steps)
  function* fadeOut() {
    QD.copyBits(screen, SPC.FULL, back, SPC.FULL, 0);
    for (var i = 0; i <= 10; i++) {
      port.setPort(back); port.penPattern(SPC.pat(2300 + i)); port.mode(QD.patOr); port.paintRect(SPC.FULL);
      yield { lim: 4 }; yield 0;
      restoreScreen();
    }
  }
  // F5_209c: reveal the background from black
  function* fadeIn() {
    for (var i = 10; i >= 0; i--) {
      SPC.fromBg(SPC.FULL);
      port.setPort(back); port.penPattern(SPC.pat(2300 + i)); port.mode(QD.patOr); port.paintRect(SPC.FULL);
      yield { lim: 5 }; yield 0;
      restoreScreen();
    }
  }
  // L5_21b6: zoom from a small rect of the back buffer to the full screen
  function* zoomIn(r) {
    r = QD.copyR(r);
    var dl = tdiv(r.l, 20), dr = tdiv(512 - r.r, 20), dt = tdiv(r.t, 20), db = tdiv(342 - r.b, 20);
    for (var i = 21; i >= 0; i--) {
      yield { lim: 3 };
      SPC.toScreen(r);
      r.l = Math.max(r.l - dl, 0); r.r = Math.min(r.r + dr, 512); r.t = Math.max(r.t - dt, 0); r.b = Math.min(r.b + db, 342);
    }
    fullRedraw();
  }

  // ------------------------------------------------------------ opponent set-up (L5_5ff4)
  var eyeBm = [];            // G0c12[] small frames
  function loadEyes() {
    eyeBm = [];
    var e = OPP.EYES[S.opp]; if (!e) return;
    for (var i = 0; i < e.pics.length; i++) eyeBm[i] = SPC.pict(e.pics[i]);
    if (e.blink) {                       // F2_1fd4: Lexan's eye region, 64x24 crops
      eyeBm[9] = cropTo(SPC.pict(8001), 64, 24);
      for (i = 0; i < e.blink.length; i++) eyeBm[10 + i] = cropTo(SPC.pict(e.blink[i]), 64, 24);
    }
  }
  function cropTo(bm, w, h) { var o = new QD.Bitmap(w, h); QD.copyBits(bm, R(0, 0, w, h), o, R(0, 0, w, h), 0); return o; }
  function loadParams(opp) {           // L2_3468 + L2_326c
    var rec = OPP.INFO[opp].rec;
    S.P = SPC_DATA.params[rec].slice();
    SPC.buildOppSprites();
  }
  function setupOpponent(opp) {        // L5_5e60.. : name, parameters, pictures, sounds
    S.opp = opp; S.oppName = OPP.INFO[opp].name;
    loadParams(opp); loadEyes();
    if (opp === 1) SPC.loadHand(3101, 3100); else if (opp === 4) SPC.loadHand(8101, 8100); else SPC.loadHand(0, 0);
    if (opp === 4) S.lexanSunk = 0;
  }
  // L2_4658: the table and the names
  function drawTable(p) { SPC.drawPict(p, 0, 0, 1010); SPC.drawNames(p); }
  // L2_46b6 .. L2_46d4: fade out, draw the table with the opponent's face into the background, fade in
  function* showTable(introFace) {
    yield* fadeOut();
    port.setPort(bg); drawTable(port);
    if (introFace) OPP.FACE[S.opp].intro(port);
    SPC.drawNames(port);
    yield* fadeIn();
    resetPoint();
  }
  // F5_5dfc / F5_5dee: Nerual dissolves in and out; Lexan rises if he sank
  function* oppIntroEffects() {
    if (S.opp === 6) yield* nerualDissolve(true);
    if (S.opp === 4) yield* lexanRise();
  }
  function* oppOutroEffects() { if (S.opp === 6) yield* nerualDissolve(false); }
  var faceRect = R(200, 21, 310, 112);
  function* nerualDissolve(inward) {     // F2_5128 / F2_51ec
    port.setPort(back); port.mode(QD.patOr);
    for (var i = 0; i < 11; i++) {
      if (i === 4) sound(OPP.SND.spec0);
      SPC.drawPict(port, 210, 26, 5000);
      port.penPattern(SPC.pat(2300 + (inward ? 10 - i : i))); port.paintRect(faceRect);
      yield { lim: 1 };
      SPC.toScreen(faceRect);
    }
    QD.copyBits(back, faceRect, bg, faceRect, 0);
    stopSound();
  }
  var lexRect = R(187, 14, 325, 112);
  function* lexanSink() {                // F2_4aba
    S.lexanSunk = 1;
    port.setPort(back);
    for (var i = 1; i <= 200; i <<= 1) {
      port.fillRect(lexRect, QD.BLACK); SPC.drawPict(port, 210, 18 + i, 8011);
      yield { lim: 4 }; SPC.toScreen(lexRect);
    }
    sfx.crackRate(2.0);
    drawTable(port); QD.copyBits(back, lexRect, bg, lexRect, 0);
  }
  function* lexanRise() {                // F2_4b2e
    if (!S.lexanSunk) return; S.lexanSunk = 0;
    port.setPort(back);
    for (var i = 100; i >= 0; i -= 10) {
      port.fillRect(lexRect, QD.BLACK); SPC.drawPict(port, 210, 18 + i, 8000);
      yield { lim: 1 }; SPC.toScreen(lexRect);
    }
    drawTable(port); SPC.drawPict(port, 210, 18, 8000); QD.copyBits(back, lexRect, bg, lexRect, 0);
  }
  // F2_47e0: Visine rises from behind the table
  function* visineRise() {
    port.setPort(back);
    var r = R(200, 75, 315, 112);
    for (var y = 32; y >= 0; y -= 2) {
      SPC.drawPict(port, 200, 76 + y, 7000);
      yield { lim: 2 }; SPC.toScreen(r);
    }
    drawTable(port); SPC.drawPict(port, 200, 76, 7000);
    QD.copyBits(back, r, bg, r, 0);
    QD.copyBits(bg, R(0, 0, 175, 140), back, R(0, 0, 175, 140), 0);
  }
  // draws an opponent frame directly on the screen (the face functions)
  function* faceFrame(n) {
    var d = OPP.FACE[S.opp].frame(wport, n) || 0; SPC.setDirty(true);
    if (d) yield { lim: d };
  }

  // ------------------------------------------------------------ puck placement
  var glide = { x: 0, z: 0, dx: 0, dz: 0 };
  function glideTarget(x, z) {           // F5_6420
    glide.dx = tdiv(SPC.addMag(w16(x - S.px), 21), 20);
    glide.dz = tdiv(SPC.addMag(w16(z - S.pz), 21), 20);
    glide.x = x; glide.z = z;
  }
  function glideStep() {                 // F5_6474
    var d = w16(glide.x - S.px);
    if (Math.abs(d) <= Math.abs(glide.dx) || !S.running) S.px = glide.x; else S.px += glide.dx;
    d = w16(glide.z - S.pz);
    if (Math.abs(d) <= Math.abs(glide.dz) || !S.running) S.pz = glide.z; else S.pz += glide.dz;
    SPC.drawPuckSprite();
  }
  function* glideTo(x, z) {              // L5_6542 = F5_6420 + L5_6500
    glideTarget(x, z);
    while (S.px !== glide.x || S.pz !== glide.z) {
      var rr = SPC.rects();
      SPC.fromBg(rr.puckOld);           // F2_59b8
      glideStep();                      // F5_6474 (draws the puck)
      var u = QD.unionRect(rr.puckOld, SPC.rects().puck); SPC.toScreen(u); SPC.setOldRects();   // F2_597c
      yield 0;
    }
    S.pvx = 0; S.pvz = 0;
  }
  function resetPuck() { S.px = 0; S.pz = 295; S.pvx = 0; S.pvz = 0; }   // F5_655c
  function resetPoint() {                // L2_3346
    S.score = 0; S.oscore = 0; S.bvx = 0; S.bx = 0; resetPuck();
    if (S.opp === 4) loadParams(4);      // F5_3556: Lexan sobers up
    S.playerServes = 1;
  }

  // ------------------------------------------------------------ frames
  function* gameEvents() {               // F2_2e48
    var e;
    while ((e = takeEvent(['key', 'menu']))) {
      if (e.type === 'menu') { menuCmd = e; S.running = 0; continue; }
      if (e.cmd) {
        if (e.ch === 's' || e.ch === 'S') { toggleSound(); continue; }
        cmd = 1; cmdKey = e.ch; S.running = 0;
      } else S.running = 0;
    }
  }
  function toggleSound() { S.sound = S.sound ? 0 : 1; if (!S.sound) stopSound(); if (FLOW.onSoundChange) FLOW.onSoundChange(); }
  // one rally frame (the body of L2_335e)
  function* rallyFrame() {
    yield* gameEvents();
    SPC.blockerStep();
    SPC.aiFrame(); SPC.oppMove();        // L2_0c8c
    SPC.playerFromMouse();
    SPC.puckStep();
    idleAnim();
    SPC.render();
    yield { lim: 2 };
  }
  // a frame without the puck moving (L5_3130)
  function* stillFrame() {
    yield* gameEvents(); SPC.blockerStep(); SPC.oppMove(); SPC.playerFromMouse(); SPC.render(); yield { lim: 2 };
  }
  function* stillFrames(n) {             // L5_3146
    var t0 = ticks();
    do { yield* stillFrame(); } while (ticks() - t0 < n && S.running);
  }

  // ------------------------------------------------------------ serving (F5_2fb4)
  function* preServe() {                 // L5_2f18
    SPC.aiIdle();
    for (var i = 0; (S.oz <= 1350 || i < 30) && S.running; i++) {
      yield* gameEvents();
      SPC.aiThink();
      S.ovz = Math.max(5, S.P[PIDX.idleVzMax]);
      SPC.blockerStep(); SPC.oppMove(); SPC.playerFromMouse(); idleAnim(); SPC.render();
      yield { lim: 2 };
    }
  }
  function* opponentServes() {
    yield* glideTo(0, 1205); S.serveCount = 0;            // L5_6580
    if (S.opp !== 7) yield* preServe();
    var vxMax = Math.max(S.P[PIDX.blkVx], 1), vzMax = Math.max(S.P[PIDX.blkVz], 1);
    S.aiState = 1;
    if (S.opp === 8) {                                      // L5_2504: Biff aims by the score difference
      var k = clamp(S.score - S.oscore, -10, 10) + 10;
      var dx = tdiv(S.P[PIDX.srvX1] * k, 20); if (rnd(0, 1)) dx = -dx;
      var dz = tdiv((S.P[PIDX.srvZ1] - S.P[PIDX.srvZ2]) * k, 20) + S.P[PIDX.srvZ2];
      S.tx = S.px + dx; S.tz = S.pz + dz;
    } else if (S.opp === 6) {                               // L5_33c0: Nerual mirrors the player's last serve
      S.tx = S.px + S.nx; S.tz = S.pz + Math.max(5, S.nz);
    } else {
      S.tz = rnd(S.P[PIDX.srvZ1], S.P[PIDX.srvZ2]) + S.pz;
      S.tx = rnd(S.P[PIDX.srvX1], S.P[PIDX.srvX2]);
      S.tx = clamp(w16(S.tx), S.P[PIDX.hw] - 250, 250 - S.P[PIDX.hw]);
      S.tz = clamp(w16(S.tz), 1200, 1500);
    }
    S.ovx = 1;
    while ((S.ovx !== 0 || S.ovz !== 0) && S.running) {
      yield* gameEvents();
      S.ovx = clamp(w16(S.tx - S.ox), -vxMax, vxMax);
      S.ovz = clamp(w16(S.tz - S.oz), -vzMax, vzMax);
      SPC.blockerStep(); SPC.oppMove(); SPC.playerFromMouse();
      if (S.opp !== 7) idleAnim();
      SPC.render();
      yield { lim: 2 };
    }
    if (S.opp === 10) yield* droidServe();
    if (S.opp === 7) yield* bejinServe();
    else {                                                  // L5_2f72: the paddle strikes the puck
      if (S.running) {
        S.ovx = w16(S.px - S.ox); S.ovz = w16(S.pz - S.oz); S.aiState = 3;
        SPC.blockerStep(); SPC.oppMove(); SPC.playerFromMouse(); SPC.puckStep(); idleAnim(); SPC.render();
      }
    }
    scheduleBlink();
  }
  function* droidServe() {               // L5_32e8
    sound(OPP.SND.droidServe);
    var seq = [3, 5, 1, 6, 3, 5, 2, 4];
    for (var i = 0; i < seq.length; i++) { yield* stillFrames(5); yield* faceFrame(seq[i]); }
    stopSound();
  }
  function* bejinServe() {               // L5_31d2
    var slow = rnd(0, 1);
    sound(slow ? OPP.SND.bej0 : OPP.SND.bej1);
    var hands = [4, 5, 2, 3];
    yield* stillFrames(10);
    for (var i = 0; i < hands.length; i++) { yield* faceFrame(hands[i]); yield* stillFrames(10); }
    while (S.pz > 750 && S.running) { S.pz -= 50; yield* stillFrame(); }
    if (SPC.blockerInWay()) sound(OPP.SND.wallRev);
    var step = rnd(0, 1) ? -10 : 10;
    while (Math.abs(w16(S.px)) < 100 && S.running) { S.px += step; yield* stillFrame(); }
    S.pvz = rnd(-150, -200);
    S.pvx = slow ? tdiv(-S.pvz, 5) : tdiv(S.pvz * 7, 16);
    if (S.px < 0) S.pvx = -S.pvx;
    SPC.toScreen(R(187, 14, 272, 113));
    stopSound();
    if (S.running) sfx.oppHit();
  }
  function* serve() {                    // L2_32de
    S.serveCount = 0;
    if (!S.playerServes) yield* opponentServes();
    else { SPC.aiIdle(); yield* glideTo(0, 295); S.playerServeFlag = 1; }
  }

  // ------------------------------------------------------------ the rally (L2_335e) and scoring (L2_3314)
  function* rally() {
    while (S.running) {
      yield* rallyFrame();
      if (S.pz <= 0) { S.playerServes ^= 1; yield* opponentScored(); scheduleBlink(); SPC.playerFromMouse(); }
      if (S.pz >= 1500) { S.playerServes ^= 1; yield* playerScored(); scheduleBlink(); SPC.playerFromMouse(); }
    }
  }
  function endFrame() {                  // L2_4528: the paddles vanish, the puck stays
    var rr = SPC.rects();
    SPC.fromBg(rr.plOld); SPC.fromBg(rr.oOld); SPC.fromBg(rr.bOld);
    SPC.drawPuckSprite();
    SPC.toScreen(rr.plOld); SPC.toScreen(rr.oOld); SPC.toScreen(rr.bOld); SPC.toScreen(rr.puckOld);
    SPC.setOldRects();
  }
  function* opponentScored() {           // L2_1278 + L2_11d8
    endFrame(); SPC.crackNear(); yield 40; restoreScreen();
    S.oscore++;
    reactionOpponentScored();            // F5_48c0
    if (!S.playerServes) glideTarget(0, 1205); else glideTarget(0, 295);   // L2_1220
    yield* tally(S.oscore, 27);
    yield* afterPoint();
    yield* checkGameOver();
  }
  function* playerScored() {             // L2_1242 + L2_11d8
    endFrame(); SPC.crackFar(); yield 40; restoreScreen();
    if (S.opp === 6 || S.opp === 2 || S.opp === 4) yield* glideTo(w16(S.px), 1300);   // F5_4888
    S.score++;
    reactionPlayerScored();              // F5_48f8
    if (!S.playerServes) glideTarget(0, 1205); else glideTarget(0, 295);
    yield* tally(S.score, 0);
    yield* afterPoint();
    yield* checkGameOver();
  }
  function* afterPoint() {               // F5_5da6
    if (S.opp === 1) { yield* faceFrame(5); S.look = 4; }
    if (S.opp === 5) { yield* faceFrame(1); S.look = 4; }
    if (S.opp === 10) yield* faceFrame(2);
    scheduleBlink(); stopSound();
  }
  function* checkGameOver() {            // L2_11d8
    if (S.score >= 15 || S.oscore >= 15) S.running = 0;
    if (!S.running) {
      if (S.opp === 7) yield* bejinEnd();                   // F5_5e16
      if (S.opp === 4) { yield 15; yield* lexanSink(); }
      if (S.oscore >= 15 && S.tournament) { S.lastResult = 2; cmd = 3; }      // F5_2b40
      if (S.score >= 15) yield* playerWon();                                    // F5_2b1c
    } else yield* serve();
  }
  function* bejinEnd() {                 // L5_4f46: Bejin's farewell
    yield { lim: 2 }; OPP.FACE[7].hands(wport, 0); SPC.setDirty(true);
    yield { lim: 3 }; OPP.FACE[7].hands(wport, 1); SPC.setDirty(true);
    yield { lim: 3 }; OPP.FACE[7].hands(wport, 2); SPC.setDirty(true);
    yield { lim: 3 };
    if (S.oscore >= 15) blitEyes(7, 1, true);
    yield { lim: 60 };
    if (S.score >= 15) { flushEvents(); while (!takeEvent(['click', 'key'])) yield 0; }
    OPP.FACE[7].hands(wport, 1); SPC.setDirty(true); yield { lim: 10 };
    OPP.FACE[7].hands(wport, 0); SPC.setDirty(true); yield { lim: 10 };
    SPC.toScreen(R(187, 14, 325, 114)); yield { lim: 10 };
  }
  function* playerWon() {                // F5_2b1c
    if (!S.tournament) return;
    if (S.opp < 8) {                     // L5_6062: next opponent
      yield* oppOutroEffects();
      var next = S.opp + 1;
      setupOpponent(next);
      yield* showTable(true);
      if (next === 2) yield* visineRise();
      S.running = 1;
      yield* oppIntroEffects();
      yield* serve();
    } else {                             // L5_2af8: champion
      yield* championSequence();
      cmd = 3;
    }
  }

  // ------------------------------------------------------------ reactions (F5_48c0 / F5_48f8 / F5_5d34)
  function resetSeq() { S.seqTime = 0; S.seqLast = 0; }    // L5_48b6
  function reactionOpponentScored() {    // F5_48c0: half the time, always on the first and the winning point
    resetSeq(); S.reaction = (rnd(0, 9) < 5 || S.oscore >= 15 || S.oscore === 1) ? 1 : 0;
  }
  function reactionPlayerScored() {      // F5_48f8
    resetSeq(); S.reaction = (rnd(0, 9) < 5 || S.score >= 15 || S.score === 1) ? 2 : 0;
  }
  // L5_4930 / L5_4964
  function at(t) { S.seqT = t; if (t > S.seqTime) return false; if (S.seqLast < t) { S.seqLast = t; return true; } return false; }
  function rel(dt) { return at(S.seqT + dt); }
  var gameOver = function () { return S.score >= 15 || S.oscore >= 15; };
  var playerWonGame = function () { return S.score >= 15; };
  var opponentWonGame = function () { return S.oscore >= 15; };
  // run one keyframe list: [[time, kind('a'|'r'), sound?, frame?], ...]
  function keys(list) {
    for (var i = 0; i < list.length; i++) {
      var k = list[i], fire = k[1] === 'a' ? at(k[0]) : rel(k[0]);
      if (!fire) continue;
      if (k[2]) sound(k[2]);
      if (k[3] !== undefined) frameNow(k[3]);
    }
  }
  function frameNow(n) { var d = OPP.FACE[S.opp].frame(wport, n); SPC.setDirty(true); if (d) pendingDelay = Math.max(pendingDelay, d); }
  var pendingDelay = 0;
  var SN = OPP.SND;
  function reactionFrame() {             // F5_5d34, called once per scoreboard-hand frame
    S.seqTime++;
    var r = S.reaction;
    switch (S.opp) {
      case 1:   // L5_58e8 Skip
        if (r === 1) {
          if (at(5)) { if (gameOver() && !S.tournament) sound(SN.skipAgain); frameNow(1); }
          if (at(20)) frameNow(5);
        }
        if (r === 2) {
          if (at(5)) { if (gameOver() && !S.tournament) sound(SN.skipAgain); else sound(SN.skipGood); frameNow(2); }
          if (at(10)) frameNow(3); if (at(15)) frameNow(4); if (at(20)) frameNow(5);
        }
        break;
      case 2:   // L5_4aa0 Visine
        if (r === 0) keys([[0, 'a', 0, 11], [3, 'a', 0, 12], [6, 'a', 0, 13], [14, 'a', 0, 12], [17, 'a', 0, 11], [20, 'a', 0, 0]]);
        if (r === 2) {
          if (playerWonGame()) keys([[1, 'a', SN.visCry, 1], [5, 'r', 0, 0], [5, 'r', 0, 1], [3, 'r', 0, 0], [3, 'r', 0, 1], [3, 'r', 0, 0]]);
          else keys([[2, 'a', 0, 1], [20, 'a', 0, 0]]);
        }
        if (r === 1) { if (at(5)) frameNow(14); if (rel(5)) { frameNow(20); sound(SN.visGiggle); } if (rel(3)) frameNow(21); if (rel(3)) frameNow(20); if (rel(3)) frameNow(0); }
        break;
      case 3:   // L5_576c Vinnie
        if (r !== 0 && gameOver()) {          // L5_5634
          if (at(6)) { if (opponentWonGame()) sound(SN.vin2); frameNow(5); }
          keys([[2, 'r', 0, 6], [1, 'r', 0, 7]]);
          if (rel(1)) { if (playerWonGame()) sound(SN.vin0); frameNow(6); }
          keys([[1, 'r', 0, 8], [1, 'r', 0, 6], [1, 'r', 0, 7], [1, 'r', 0, 6], [1, 'r', 0, 8], [1, 'r', 0, 6], [1, 'r', 0, 5], [1, 'r', 0, 0]]);
        } else if (r === 2) keys([[5, 'a', 0, 1], [10, 'a', SN.vin1, 2], [15, 'a', 0, 3], [20, 'a', 0, 2], [25, 'a', 0, 1]]);   // L5_5496
        else if (r === 1) keys([[1, 'a', 0, 9], [3, 'r', 0, 10], [2, 'r', 0, 11], [2, 'r', 0, 12], [2, 'r', 0, 11], [2, 'r', 0, 10], [2, 'r', 0, 11], [2, 'r', 0, 12], [2, 'r', 0, 11], [2, 'r', 0, 10], [2, 'r', 0, 9], [2, 'r', 0, 0]]);   // L5_5514
        break;
      case 4:   // L5_5452 Lexan
        if (r === 0) lexanEyes();
        if (r === 2) { if (gameOver()) lexanDrink(1); else { lexanEyes(); keys([[3, 'a', 0, 5], [6, 'a', 0, 6], [9, 'a', 0, 5], [12, 'a', 0, 1], [25, 'a', SN.hic, 2], [28, 'a', 0, 1]]); } }   // L5_53bc
        if (r === 1) { if (gameOver()) lexanDrink(1); else lexanDrink(3); }
        break;
      case 5:   // L5_5cfe Eneg
        if (r === 2) {
          if (playerWonGame()) keys([[3, 'a', SN.gen4, 6], [3, 'r', 0, 7], [3, 'r', 0, 8], [1, 'r', 0, 7], [2, 'r', 0, 8], [4, 'r', 0, 7], [1, 'r', 0, 6], [1, 'r', 0, 1]]);   // L5_59b6
          else keys([[5, 'a', 0, 3], [10, 'a', SN.gen0, 6], [15, 'a', 0, 3], [29, 'a', 0, 1]]);   // L5_5bd2
        }
        if (r === 1) {
          if (gameOver()) keys([[3, 'a', SN.gen2, 15], [1, 'r', 0, 16], [1, 'r', 0, 15], [1, 'r', 0, 16], [1, 'r', 0, 17], [1, 'r', 0, 16], [1, 'r', 0, 17], [3, 'r', 0, 16], [2, 'r', 0, 17], [4, 'r', 0, 16], [1, 'r', 0, 15], [1, 'r', 0, 1], [3, 'r', 0, 2], [4, 'r', 0, 1]]);   // L5_5a7c
          else keys([[5, 'a', 0, 9], [13, 'a', 0, 10], [15, 'a', SN.droidServe12, 11], [17, 'a', 0, 12], [19, 'a', 0, 13], [21, 'a', 0, 14], [23, 'a', 0, 9], [25, 'a', 0, 1]]);   // L5_5c38
        }
        break;
      case 6:   // L5_4b74 Nerual
        if (r === 2) {
          for (var i = 0; i <= 10; i++) if (at(i)) { if (i === 7) sound(SN.spec1); frameNow(i); }
          for (i = 15; i <= 25; i++) if (at(i)) frameNow(25 - i);
        }
        if (r === 1) {
          for (i = 0; i <= 5; i++) if (at(i)) frameNow(i);
          for (i = 7; i <= 9; i++) if (at(i)) frameNow(i + 4);
          if (at(10)) sound(SN.spec2);
          if (at(12)) frameNow(12); if (at(14)) frameNow(13); if (at(16)) frameNow(12); if (at(17)) frameNow(11);
          for (i = 20; i <= 25; i++) if (at(i)) frameNow(25 - i);
        }
        break;
      case 7:   // L5_4fe8 Bejin
        if (r === 1 && !gameOver()) {
          if (at(3)) blitEyes(7, 1, true); if (at(8)) blitEyes(7, 3, false); if (at(13)) blitEyes(7, 4, false);
          if (at(18)) blitEyes(7, 3, false); if (at(23)) blitEyes(7, 0, false); if (at(28)) blitEyes(7, 0, true);
        }
        break;
      case 8:   // L5_4f10 Biff
        if (r === 1) {
          if (gameOver()) { if (at(14)) { sound(SN.biff3); frameNow(6); } if (rel(4)) frameNow(0); }      // L5_4e78
          else { if (at(1)) { sound(SN.biff1); frameNow(6); } keys([[2, 'r', 0, 7], [2, 'r', 0, 8], [2, 'r', 0, 7], [2, 'r', 0, 8], [2, 'r', 0, 7], [2, 'r', 0, 8], [2, 'r', 0, 7], [2, 'r', 0, 8], [2, 'r', 0, 7], [2, 'r', 0, 6], [2, 'r', 0, 5]]); }   // L5_4cf2
        }
        if (r === 2) {
          if (gameOver()) keys([[10, 'a', 0, 1], [4, 'r', 0, 2], [6, 'r', 0, 1], [4, 'r', 0, 0]]);   // L5_4e18
          else { if (at(1)) frameNow(3); if (at(5)) { sound(SN.biff2); frameNow(4); } if (at(15)) frameNow(3); if (at(20)) frameNow(0); }   // L5_4eac
        }
        break;
      case 10:  // L5_582a DC3
        if (r === 1) {                      // L5_579c: random beeps whenever the last one finished
          if (sfx.done()) { var k = rnd(1, 3); sound([SN.r2d1, SN.r2d2, SN.r2d3][k - 1]); }
          if (at(2)) frameNow(3); if (at(4)) frameNow(1); if (at(6)) { frameNow(2); resetSeq(); }
        }
        if (r === 2) {
          if (sfx.done()) { k = rnd(1, 3); sound([SN.r2d1s, SN.r2d2s, SN.r2d3s][k - 1]); }
          if (at(2)) frameNow(1); if (at(4)) frameNow(3); if (at(6)) { frameNow(2); resetSeq(); }
        }
        break;
    }
  }
  // Lexan's drinks (L5_509a / L5_5238): each one slows him down (L5_3476)
  function lexanDrink(startT) {
    if (startT === 1) {
      if (at(1)) { lexanDegrade(); frameNow(7); }
      for (var t = 2; t <= 8; t++) if (at(t)) frameNow(t + 6);
      keys([[13, 'a', 0, 13], [14, 'a', 0, 12], [15, 'a', 0, 11], [19, 'a', 0, 12], [20, 'a', 0, 13], [21, 'a', 0, 14], [26, 'a', 0, 13], [27, 'a', 0, 12], [28, 'a', 0, 11]]);
    } else {
      if (at(3)) { lexanDegrade(); frameNow(7); }
      for (t = 4; t <= 10; t++) if (at(t)) frameNow(t + 4);
      for (t = 18; t <= 24; t++) if (at(t)) frameNow(31 - t);
      if (at(25)) frameNow(0);
    }
  }
  function lexanDegrade() {              // L5_3476
    var P = S.P, I = PIDX;
    ['retVxMax', 'retVxMin', 'retVzMin', 'retVzMax', 'idleVxMax', 'idleVxMin', 'idleVzMin', 'idleVzMax', 'blkVx', 'blkVz', 'bSideP', 'bFwdP', 'bSideB', 'bFwdB'].forEach(function (k) { P[I[k]] = w16(tdiv(P[I[k]] * 82, 100)); });
    P[I.idleXMax] = w16(tdiv(P[I.idleXMax] * 107, 100)); P[I.idleXMin] = w16(tdiv(P[I.idleXMin] * 107, 100));
    P[I.predErr] = w16(tdiv(P[I.predErr] * 105, 100));
  }
  function lexanEyes() { if (S.lexanSunk) return; lexanRandomEyes(); }

  // ------------------------------------------------------------ eyes / blinking (F2_29cc)
  var blinkAt = 0, blinkPhase = 0, blinkBase = 0, lexEyeAt = 0;   // G0b4a, G0b46, G0b44, G0b4e
  var visBlinkAt = 0, visPhase = 0;                              // G0b42, G0b3e
  function scheduleBlink() { blinkPhase = 0; blinkAt = ticks() + rnd(10, 200); }   // F2_2478
  function blitEyes(opp, n, alt) {
    var e = OPP.EYES[opp], bm = eyeBm[n]; if (!bm || !e) return;
    var pos = e.pos;
    if (alt && e.pos2) { pos = e.pos2; bm = eyeBm[n + 5]; if (!bm) return; }
    var left = pos[0], top = pos[1];
    if (opp === 5) { top = 56; left = 234; if (n > 2) left -= 1; QD.copyBits(bm, R(1, 1, bm.width - 1, bm.height - 1), screen, R(left + 1, top + 1, left + bm.width - 1, top + bm.height - 1), 0); SPC.setDirty(true); return; }
    QD.copyBits(bm, R(0, 0, bm.width, bm.height), screen, R(left, top, left + bm.width, top + bm.height), 0);
    SPC.setDirty(true);
  }
  function lexanRandomEyes() {           // F2_243e
    var t = ticks(); if (t <= lexEyeAt) return;
    blitEyes(4, rnd(0, 8), false); lexEyeAt = t + 4;
  }
  function lexanBlink() {                // L2_24a6 (frames 10.. are the blink pictures 8003-8006)
    var t = ticks(); if (t <= blinkAt) return;
    var d = tdiv(t - blinkAt, 2);
    function bl(n) { var bm = eyeBm[9 + n]; if (!bm) return; QD.copyBits(bm, R(0, 0, bm.width, bm.height), screen, R(210, 18, 210 + bm.width, 18 + bm.height), 0); SPC.setDirty(true); }
    if (blinkPhase < 1 && d >= 0) { blinkBase = rnd(0, 1) * 2; bl(blinkBase + 1); blinkPhase++; }
    if (blinkPhase < 2 && d >= 5) { bl(blinkBase + 2); blinkPhase++; }
    if (blinkPhase < 3 && d >= 10) { bl(blinkBase + 1); blinkPhase++; }
    if (blinkPhase < 4 && d >= 15) { bl(0); blinkPhase = 0; blinkAt = t + rnd(0, 300); }
  }
  function look() {                      // L2_28ec: which way the opponent looks
    var l;
    if (S.aiState === 0) l = 4;
    else if (S.aiState === 1 || S.aiState === 2) { l = S.px < -83 ? 0 : S.px < 83 ? 1 : 2; }
    else l = 3;
    if (l === S.look) return;
    if (l === 4) scheduleBlink();
    if (S.opp === 3) blitEyes(3, l === 0 ? 3 : l === 2 ? 4 : l === 1 ? 5 : 0, false);
    else if (S.opp === 1) blitEyes(1, l, false);
    else blitEyes(5, l, false);
    S.look = l;
  }
  function blinkSeq(frames, nextLo, nextHi, phaseTimes, draw) {   // the common blink pattern
    var t = ticks(); if (t <= blinkAt) return;
    var d = tdiv(t - blinkAt, 2);
    for (var i = 0; i < frames.length; i++) {
      if (blinkPhase < i + 1 && d >= phaseTimes[i]) { draw(frames[i]); blinkPhase++; if (i === frames.length - 1) { blinkPhase = 0; blinkAt = t + rnd(nextLo, nextHi); } }
    }
  }
  function idleAnim() {                  // F2_29cc
    var o = S.opp;
    if (o === 3) { look(); if (S.look === 4) blinkSeq([1, 2, 1, 0], 50, 500, [0, 4, 8, 12], function (n) { blitEyes(3, n, false); }); }
    if (o === 5) { look(); if (S.look === 4) blinkSeq([6, 7, 6, 5], 0, 300, [0, 5, 10, 15], function (n) { blitEyes(5, n, false); }); }
    if (o === 7) blinkSeq([1, 2, 1, 0], 100, 500, [0, 1, 2, 3], function (n) { blitEyes(7, n, false); });
    if (o === 1) look();
    if (o === 4 && !S.lexanSunk) { lexanRandomEyes(); lexanBlink(); }
    if (o === 2 && !S.running) visineIdle();
  }
  function visineIdle() {                // L2_27e8
    var t = ticks(); if (t <= visBlinkAt) return;
    var d = t - visBlinkAt, fr = [11, 12, 13, 12, 11, 0], tm = [0, 5, 10, 15, 20, 25];
    for (var i = 0; i < fr.length; i++) if (visPhase < i + 1 && d >= tm[i]) { OPP.FACE[2].frame(wport, fr[i]); SPC.setDirty(true); visPhase++; if (i === 5) { visBlinkAt = t + rnd(100, 300); visPhase = 0; } }
  }

  // ------------------------------------------------------------ scoreboard (L2_100e, L2_1aa4, L2_12da)
  var handPics = { chalk: [103, 102], eraser: [101, 100] };   // [image, mask]
  var handNow = 'chalk';
  var sbArea = R(0, 0, 175, 140);
  function drawHandSprite(x, y) {         // L2_1896
    var img = SPC.pict(handPics[handNow][0]), mask = SPC.pict(handPics[handNow][1]);
    var dr = R(x - 179, y - 5, x - 179 + img.width, y - 5 + img.height);
    QD.copyBits(mask, R(0, 0, mask.width, mask.height), back, dr, QD.srcBic);
    QD.copyBits(img, R(0, 0, img.width, img.height), back, dr, QD.srcOr);
  }
  // L2_1aa4(x, y, mode): 0 move (with puck glide), 1 draw, 2 erase, 3 move
  function* handTo(x, y, mode) {
    var SB = SPC.SB, tx = x * 128, ty = y * 128;
    var sx = tdiv(tx - SB.x, 10), sy = tdiv(ty - SB.y, 10);
    var bgPort = new QD.Port(bg);
    if (mode === 1) { bgPort.penPattern(QD.WHITE); bgPort.pen(2, 2); bgPort.mode(QD.patCopy); bgPort.moveTo(SPC.rdiv(SB.x, 128), SPC.rdiv(SB.y, 128)); }
    if (mode === 2) { bgPort.penPattern(QD.BLACK); bgPort.pen(5, 6); bgPort.mode(QD.patCopy); bgPort.moveTo(SPC.rdiv(SB.x, 128) - 5, SPC.rdiv(SB.y, 128) + 5); }
    while (SB.x !== tx || SB.y !== ty) {
      reactionFrame();
      yield* gameEvents();
      if (S.running && Math.abs(SB.x - tx) > Math.abs(sx)) SB.x += sx; else SB.x = tx;
      if (S.running && Math.abs(SB.y - ty) > Math.abs(sy)) SB.y += sy; else SB.y = ty;
      if (mode === 1) bgPort.lineTo(SPC.rdiv(SB.x, 128), SPC.rdiv(SB.y, 128));
      if (mode === 2) bgPort.lineTo(SPC.rdiv(SB.x, 128) - 5, SPC.rdiv(SB.y, 128) + 5);
      QD.copyBits(bg, sbArea, back, sbArea, 0);
      drawHandSprite(tdiv(SB.x, 128), tdiv(SB.y, 128));
      yield { lim: 2 };
      SPC.toScreen(sbArea);
      if (mode < 2) {                     // the puck glides to the server meanwhile
        var rr = SPC.rects(); SPC.fromBg(rr.puckOld); glideStep();
        SPC.toScreen(QD.unionRect(rr.puckOld, SPC.rects().puck)); SPC.setOldRects();
      }
      if (pendingDelay) { var d = pendingDelay; pendingDelay = 0; yield { lim: d }; }
    }
  }
  function* tally(score, yoff) {          // L2_100e
    var x = 86; while (score > 5) { score -= 5; x += 28; }
    x += score * 4;
    var y = yoff + 32;
    SPC.sbPen(-5, 50);
    if (score === 5) { x -= 2; yield* handTo(x, y + 3, 0); yield* handTo(x - 16, y + 7, 1); }
    else { yield* handTo(x, y, 0); yield* handTo(x, y + 10, 1); }
    yield* handTo(-5, 50, 0);
  }
  function* eraseScoreboard() {           // L2_12da
    S.reaction = 0; S.running = 1; handNow = 'eraser';
    SPC.sbPen(-5, 50);
    var x = 91, y = 27;
    if (S.score) { yield* handTo(x, y, 3); yield* handTo(x + 75, y, 2); yield* handTo(x, y + 6, 2); yield* handTo(x + 75, y + 6, 2); }
    if (S.oscore) { y += 27; yield* handTo(x, y + 6, 3); yield* handTo(x + 75, y + 6, 2); yield* handTo(x, y, 2); yield* handTo(x + 75, y, 2); }
    yield* handTo(-5, 50, 3);
    handNow = 'chalk';
  }
  function* marksFor(score, yoff) {       // redraw tallies without animation (used when restoring)
    var bgPort = new QD.Port(bg); bgPort.penPattern(QD.WHITE); bgPort.pen(2, 2); bgPort.mode(QD.patCopy);
    for (var s = 1; s <= score; s++) {
      var k = s, x = 86; while (k > 5) { k -= 5; x += 28; } x += k * 4; var y = yoff + 32;
      if (k === 5) { bgPort.moveTo(x - 2, y + 3); bgPort.lineTo(x - 18, y + 10); } else { bgPort.moveTo(x, y); bgPort.lineTo(x, y + 10); }
    }
  }

  // ------------------------------------------------------------ a game (L2_33c8)
  function* playGame() {
    scheduleBlink();
    yield* oppIntroEffects();
    S.running = 1;
    if (S.score >= 15 || S.oscore >= 15) { yield* eraseScoreboard(); resetPoint(); }
    SPC.playerFromMouse(); scheduleBlink();
    yield* serve();
    yield* rally();
    if (cmd !== 3) { restoreBg(); yield* oppOutroEffects(); }
    S.aiState = 0;
    flushEvents();
  }

  // ------------------------------------------------------------ ticks (set by the runner)
  var ticks = function () { return 0; };
  function setTicker(fn) { ticks = fn; }
  // champion sequence is provided by scenes.js
  var championSequence = function* () {};
  function setChampion(fn) { championSequence = fn; }

  return {
    pushEvent: pushEvent, takeEvent: takeEvent, flushEvents: flushEvents, setTicker: setTicker, setChampion: setChampion,
    getCmd: function () { return cmd; }, setCmd: function (v, k) { cmd = v; cmdKey = k || ''; }, getCmdKey: function () { return cmdKey; },
    getMenuCmd: function () { var m = menuCmd; menuCmd = null; return m; }, setMenuCmd: function (m) { menuCmd = m; },
    fadeOut: fadeOut, fadeIn: fadeIn, zoomIn: zoomIn, fullRedraw: fullRedraw, restoreScreen: restoreScreen, restoreBg: restoreBg, blackScreen: blackScreen,
    sound: sound, stopSound: stopSound, toggleSound: toggleSound,
    setupOpponent: setupOpponent, loadParams: loadParams, showTable: showTable, drawTable: drawTable, visineRise: visineRise, oppIntroEffects: oppIntroEffects, oppOutroEffects: oppOutroEffects,
    playGame: playGame, idleAnim: idleAnim, scheduleBlink: scheduleBlink, resetPoint: resetPoint, eraseScoreboard: eraseScoreboard, marksFor: marksFor,
    glideTo: glideTo, gameEvents: gameEvents, onSoundChange: null
  };
})();
