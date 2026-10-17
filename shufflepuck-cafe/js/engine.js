// Shufflepuck Café — game engine: the table world, puck physics, paddles, the
// opponent's parameter-driven AI, sprites and the frame compositor.
// A port of the 1988 Macintosh program (Brøderbund) to JavaScript; function
// names from the original are given as F<seg>_<offset> for reference.
'use strict';
var SPC = (function () {
  var R = QD.R;

  // ---------------------------------------------------------------- world
  var W = 512, H = 342;
  var S = {                      // the game's globals
    // puck (G0018 x, G0014 z, G0010 vx, G000c vz)
    px: 0, pz: 295, pvx: 0, pvz: 0,
    // player paddle (G0694 x, G0692 z; G0690/G068e previous; G0696 half-width)
    plx: 50, plz: 50, plxPrev: 50, plzPrev: 50, plHw: 50,
    // mouse box (G067c top, G067a left, G0678 bottom, G0676 right) and its origin (G0dd4 left, G0dd6 top)
    box: { t: 0, l: 0, b: 300, r: 400 }, boxLeft: 0, boxTop: 0,
    // player hit parameters: button up G06a6.., button down G069e..
    hitUp: [50, 50, 70, 130], hitDown: [50, 50, 70, 140],
    hitCooldown: 0,             // G0674
    // opponent paddle (G0d5e x, G0d5c z, G0d5a vx, G0d58 vz)
    ox: 0, oz: 1400, ovx: 0, ovz: 0,
    // opponent AI (parameter block G0b16..G0ad2 loaded per opponent)
    P: null,
    aiState: 0,                 // G0988: 0 idle, 1 track, 2 backswing, 3 strike
    tx: 0, tz: 0, tvx: 0, tvz: 0,   // G0982, G097e, G097a, G0976 (simulated puck / target)
    cx: 0, cz: 0,               // G0986, G0984 saved contact point
    serveCount: 0,              // G0972
    // blocker (G0c64 on, G0c5e x, G0c5c vx, G0c62 half-width, G0c60 weight)
    blockerOn: 0, bx: 0, bvx: 0, bHw: 0, bWeight: 5,
    // scores (G0ca8 player, G0ca6 opponent), serve (G0618: 0 opponent serves, 1 player serves)
    score: 0, oscore: 0, playerServes: 0, playerServeFlag: 0,   // G0616
    running: 0,                 // G061a
    opp: 0,                     // G0c3c opponent id (1..8, 10 = DC3)
    tournament: 1,              // G0970
    sound: 1,                   // G0a18
    quit: 0,                    // G0a8e
    // Nerual's mirror parameters (G0062, G0060)
    nx: 0, nz: 0,
    reaction: 0,                // G0624: 1 opponent scored, 2 player scored
    seqTime: 0, seqLast: 0, seqT: 0,  // G0622, G0620, G061e
    champion: 'Biff Raunch', roster: [],
    playerName: 'Biff Raunch',
    lastResult: 0,              // G0c3a: 1 player won (cheer), 2 lost (boo)
  };
  var PIDX = { bSideB: 0, bFwdB: 1, bSideP: 2, bFwdP: 3, hw: 8,
    idleVxMax: 9, idleXMax: 10, idleVxMin: 11, idleXMin: 12, idleVzMin: 13, idleZ2: 14, idleVzMax: 15, idleZ1: 16,
    predSteps: 17, react: 18, predErr: 19, jitter: 20, retVxMax: 21, retVxMin: 22, retVzMin: 23, retVzMax: 24,
    srvX1: 25, srvX2: 26, srvZ1: 27, srvZ2: 28, bsXmin: 29, bsZmin: 30, bsXmax: 31, bsZmax: 32, blkVx: 33, blkVz: 34 };

  // ------------------------------------------------------------- helpers
  // 16-bit and 32-bit integer semantics of the original
  function w16(v) { v &= 0xFFFF; return v >= 0x8000 ? v - 0x10000 : v; }
  function tdiv(a, b) { return Math.trunc(a / b); }          // divs / F1_01e8: truncate toward zero
  function clamp(v, a, b) { if (a > b) { var t = a; a = b; b = t; } return v < a ? a : v > b ? b : v; }   // F2_3b0e
  function mapv(v, a, b, c, d) { return c + tdiv((v - a) * (d - c), (b - a)); }                         // F2_3d38
  function rdiv(a, b) { return tdiv(a + tdiv(b, 2), b); }                                                 // F2_3d20
  function addMag(a, b) { return a < 0 ? -(-a + b) : a + b; }                                             // F2_3c90
  // Macintosh Random(): randSeed = randSeed * 16807 mod (2^31-1); result = low 16 bits
  var seed = 1;
  function setSeed(s) { seed = (s >>> 0) % 2147483647 || 1; }
  function macRandom() {
    var lo = seed & 0xFFFF, hi = seed >>> 16;
    var t = lo * 16807 + ((hi * 16807) % 32768) * 65536;   // 16807*seed mod 2^31-1 (Park–Miller via Schrage-like split)
    var carry = Math.floor((hi * 16807) / 32768);
    t = t + carry;
    seed = t % 2147483647; if (seed === 0) seed = 1;
    var r = seed & 0xFFFF;
    if (r === 0x8000) r = 0;
    return r >= 0x8000 ? r - 0x10000 : r;
  }
  // F2_3c12: random integer in [a, b] inclusive
  function rnd(a, b) {
    if (a > b) { var t = a; a = b; b = t; }
    var hi = b + 1, r = Math.abs(macRandom());
    return a + tdiv(r * (hi - a), 32768);
  }

  // perspective (F5_1a76 + F5_1a42): x in [-250,250], y down (260 = object top, 300 = table), z depth
  function proj(x, y, z) { var d = z + 576; return { h: tdiv(x * 576, d) + 255, v: tdiv(y * 576, d) + 30 }; }
  function projTop(x, z) { return proj(x, 260, z); }       // F5_1b2e
  function projBot(x, z) { return proj(x, 300, z); }       // F5_1b04
  function projRaw(x, y, z) { var d = z + 576; return { h: tdiv(x * 576, d), v: tdiv(y * 576, d) }; }

  // --------------------------------------------------------------- bitmaps
  var screen = new QD.Bitmap(W, H);      // the window (G0b1a)
  var back = new QD.Bitmap(W, H);        // back buffer (G0a4a)
  var bg = new QD.Bitmap(W, H);          // background (G0a58)
  var port = new QD.Port(back);          // offscreen port (G0a5c)
  var wport = new QD.Port(screen);
  var dirty = true;                       // screen changed, needs presenting
  function toScreen(r) { QD.copyBits(back, r, screen, r, 0); dirty = true; }       // CopyBits back -> window
  function fromBg(r) { QD.copyBits(bg, r, back, r, 0); }                           // restore background
  var FULL = R(0, 0, W, H);

  var PAT = {};                            // PAT resources by id
  Object.keys(SPC_DATA.patterns).forEach(function (k) { PAT[k] = SPC_DATA.patterns[k]; });
  function pat(id) { return PAT[id] || QD.BLACK; }

  // ---------------------------------------------------------------- pictures
  var pictCache = {};
  function pict(id) {
    if (!pictCache[id]) {
      var b64 = SPC_DATA.picts[id]; if (!b64) return null;
      var s = atob(b64), bytes = new Uint8Array(s.length);
      for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
      pictCache[id] = QD.decodePict(bytes);
    }
    return pictCache[id];
  }
  // F2_361a(left, top, id): draw a picture with its top-left at (left, top) in the current port
  function drawPict(p, left, top, id) {
    var bm = pict(id); if (!bm) return;
    QD.copyBits(bm, R(0, 0, bm.width, bm.height), p.bm, R(left, top, left + bm.width, top + bm.height), 0, p.clip);
  }

  // ------------------------------------------------------------------ fonts
  var FONTS = SPC_DATA.fonts;
  function la12(p) { return FONTS.la12; }

  // ============================================================ rects/objects
  var puckRect = R(0, 0, 0, 0), puckOld = R(0, 0, 0, 0);          // G0612 / G060a
  var plRect = R(0, 0, 0, 0), plOld = R(0, 0, 0, 0);              // G068c / G0684
  var oRect = R(0, 0, 0, 0), oOld = R(0, 0, 0, 0);                // G0d56 / G0d4e
  var bRect = R(0, 0, 0, 0), bOld = R(0, 0, 0, 0);                // G0c5a / G0c52

  // ----------------------------------------------------------- puck sprites (L2_5406)
  var puckSprites = [];   // {img, mask, w, h, halfW (G0116), base (G00bc)}
  function buildPuckSprites() {
    puckSprites = [];
    var last = 100, i = 0;
    var tmp = new QD.Bitmap(64, 64), p = new QD.Port(tmp);
    for (var z = 0; z <= 2000; z++) {
      var pp = projRaw(48, 291, z);
      if (last - pp.h < 1) continue;
      var top = projRaw(48, 271, z), far = projRaw(48, 291, z + 48);
      var w = pp.h, hgt = pp.v - top.v, eh = pp.v - far.v;
      var A = R(0, hgt, w, hgt + eh);                         // bottom ellipse
      var B = R(0, A.b - tdiv(eh, 2) - hgt, w, A.b - tdiv(eh, 2) - 1);   // side
      var C = R(0, 0, w, eh);                                 // top ellipse
      var bw = w + 1, bh = A.b + 1;
      var img = new QD.Bitmap(bw, bh), mask = new QD.Bitmap(bw, bh);
      p.setPort(img); p.clipRect(R(-32768, -32768, 32767, 32767));
      p.fillRect(R(0, 0, 64, 64), QD.WHITE);
      drawPuck(p, A, B, C, 0);
      var d1 = B.r - tdiv(B.r * 8, 20);
      p.clipRect(R(d1, 0, B.r, A.b));
      p.fillRect(R(0, 0, 64, 64), QD.WHITE);
      drawPuck(p, A, B, C, 51);
      p.clipRect(R(-32768, -32768, 32767, 32767));
      p.setPort(mask);
      p.fillRect(R(0, 0, 64, 64), QD.WHITE);
      p.fillOval(A, QD.BLACK); p.fillRect(B, QD.BLACK); p.fillOval(C, QD.BLACK);
      puckSprites.push({ img: img, mask: mask, w: bw, h: bh, halfW: tdiv(w, 2), base: B.b - C.t + 1 });
      last = w; i++;
      if (i > 44) break;
    }
  }
  // L2_5338: a shaded cylinder
  function drawPuck(p, A, B, C, patId) {
    var A1 = QD.copyR(A); QD.offsetRect(A1, 0, 1);
    p.fillOval(A1, QD.BLACK);
    p.penPattern(pat(patId)); p.mode(QD.patCopy); p.pen(1, 1);
    p.paintOval(A);
    p.penPattern(QD.WHITE); p.frameOval(A);
    p.penPattern(pat(patId)); p.paintRect(B);
    p.penPattern(QD.WHITE);
    p.moveTo(B.l, B.b); p.lineTo(B.l, B.t);
    p.moveTo(B.r - 1, B.b); p.lineTo(B.r - 1, B.t);
    p.penPattern(pat(50)); p.paintOval(C);
    p.penPattern(QD.WHITE); p.frameOval(C);
  }
  // F2_5958: draw the puck into the back buffer; L2_5892 picks the sprite by projected width
  function drawPuckSprite() {
    var pz = w16(S.pz), px = w16(S.px);
    var w = projRaw(48, 300, pz).h;
    var idx = clamp(48 - w, 0, puckSprites.length - 1);
    var sp = puckSprites[idx];
    var pt = proj(px, 291, pz);
    var left = pt.h - sp.halfW, top = pt.v - sp.base;
    puckRect = R(left, top, left + sp.w, top + sp.h);
    QD.copyBits(sp.mask, R(0, 0, sp.w, sp.h), back, puckRect, QD.srcBic);
    QD.copyBits(sp.img, R(0, 0, sp.w, sp.h), back, puckRect, QD.srcOr);
  }

  // ------------------------------------------------- opponent paddle sprites (F2_0da2)
  var oppSprites = [], oppWidest = 0;   // G0d42[], G0d46
  function buildOppSprites() {
    oppSprites = []; var last = 1000, hw2 = S.P[PIDX.hw] * 2;
    var p = new QD.Port(null);
    for (var z = 1200; z <= 1500; z++) {
      var pp = projRaw(hw2, 300, z);
      if (last - pp.h < 1) continue;
      var q = projRaw(0, 260, z);
      var w = pp.h, h = pp.v - q.v;
      var bm = new QD.Bitmap(Math.max(w, 1), Math.max(h, 1));
      p.setPort(bm);
      drawOppPaddle(p, R(0, 0, w, h));
      oppSprites.push({ bm: bm, w: w, h: h });
      last = pp.h;
      if (oppSprites.length === 1) oppWidest = pp.h;
      if (oppSprites.length > 10) break;
    }
  }
  // L2_0d36: the opponent's paddle is a box (black for Lexan, Nerual, Bejin; gray otherwise)
  function drawOppPaddle(p, r) {
    var dark = (S.opp === 4 || S.opp === 6 || S.opp === 7);
    p.fillRect(r, dark ? QD.BLACK : QD.GRAY);
    p.penPattern(QD.WHITE); p.pen(1, 1); p.mode(QD.patCopy); p.frameRect(r);
    p.penPattern(QD.BLACK); var r2 = QD.copyR(r); QD.insetRect(r2, 1, 1); p.frameRect(r2);
  }
  // L2_0eb4: draw the opponent paddle
  function drawOppSprite() {
    var w = projRaw(S.P[PIDX.hw] * 2, 300, S.oz).h;
    var idx = clamp(oppWidest - w, 0, oppSprites.length - 1);
    var sp = oppSprites[idx];
    oRect.r = oRect.l + sp.w; oRect.b = oRect.t + sp.h;
    QD.copyBits(sp.bm, R(0, 0, sp.w, sp.h), back, oRect, QD.srcCopy);
    drawHand(oRect);
  }
  // L2_2b92: Skip's and Lexan's hand on top of their paddle
  var hand = null;   // {img, mask, w, h}
  function drawHand(r) {
    if (!hand || !(S.opp === 1 || S.opp === 4)) return;
    r.t -= 5; r.b += 3;
    var cx = tdiv(r.r + r.l, 2), y = r.t;
    var l = cx - tdiv(hand.w, 2), rr = l + hand.w, b = y + hand.h, dr = R(l, y, rr, b);
    QD.copyBits(hand.mask, R(0, 0, hand.w, hand.h), back, dr, QD.srcBic);
    QD.copyBits(hand.img, R(0, 0, hand.w, hand.h), back, dr, QD.srcOr);
  }
  function loadHand(imgId, maskId) {
    var a = pict(imgId), b = pict(maskId);
    hand = a && b ? { img: a, mask: b, w: a.width, h: a.height } : null;
  }

  // ---------------------------------------------------- player paddle strips (F5_3df4)
  var strips = {};
  function buildPlayerStrips() {
    var p = new QD.Port(null);
    function mk(w, h, fn) { var bm = new QD.Bitmap(w, h); p.setPort(bm); p.clipRect(R(-32768, -32768, 32767, 32767)); bm.fill(0); fn(p, R(0, 0, w, h)); return bm; }
    // L5_3aaa: main strip 500x40
    strips.main = mk(500, 40, function (p, bounds) {
      p.fillRect(bounds, QD.BLACK); var r = QD.copyR(bounds); r.t += 3; p.fillRect(r, QD.WHITE);
      p.penPattern(QD.GRAY); p.pen(3, 3); p.mode(QD.patCopy);
      p.moveTo(0, 3); p.lineTo(500, 3); p.moveTo(0, 3); p.lineTo(0, 43);
      p.penPattern(QD.BLACK); p.pen(1, 1);
      p.moveTo(3, 6); p.lineTo(500, 6); p.moveTo(3, 6); p.lineTo(3, 46);
      p.pen(1, 1); p.penPattern(QD.WHITE);
      p.moveTo(2, 0); p.lineTo(500, 0); p.moveTo(1, 1); p.lineTo(500, 1); p.moveTo(0, 2); p.lineTo(500, 2);
    });
    // L5_3b92 / L5_3c62: right edge strips 16x40; the odd-width variant draws its gray with notPatCopy
    function edge(p, bounds, gmode) {
      p.fillRect(bounds, QD.BLACK); var r = QD.copyR(bounds); r.t += 3; p.fillRect(r, QD.WHITE);
      p.penPattern(QD.GRAY); p.pen(3, 3); p.mode(gmode);
      p.moveTo(0, 3); p.lineTo(4, 3); p.moveTo(1, 3); p.lineTo(1, 43);
      p.penPattern(QD.BLACK); p.pen(1, 1); p.mode(QD.patCopy);
      p.moveTo(0, 6); p.lineTo(0, 46);
      p.penPattern(QD.WHITE); p.pen(1, 1);
      p.moveTo(1, 0); p.lineTo(0, 0); p.moveTo(2, 1); p.lineTo(0, 1); p.moveTo(3, 2); p.lineTo(0, 2);
    }
    strips.edgeA = mk(16, 40, function (p, b) { edge(p, b, QD.patCopy); });
    strips.edgeB = mk(16, 40, function (p, b) { edge(p, b, QD.notPatCopy); });
    // L5_3d38 / L5_3d96: bottom strips 500x5
    function bottom(p, b, gmode) {
      p.penPattern(QD.GRAY); p.pen(4, 4); p.mode(gmode);
      p.moveTo(0, 0); p.lineTo(500, 0);
      p.mode(QD.patCopy); p.penPattern(QD.BLACK); p.pen(1, 1);
      p.moveTo(0, 4); p.lineTo(500, 4); p.moveTo(3, 0); p.lineTo(500, 0);
    }
    strips.botA = mk(500, 5, function (p, b) { bottom(p, b, QD.patCopy); });
    strips.botB = mk(500, 5, function (p, b) { bottom(p, b, QD.notPatCopy); });
  }
  // F5_3f76: compose the player's paddle from the strips into the back buffer
  function drawPlayerPaddle() {
    var r = plRect;
    var A = R(r.l, r.t - 3, r.r - 4, r.b - 4);
    var B = R(r.r - 4, r.t - 3, r.r, r.b - 3);
    var C = R(r.l, r.b - 4, r.r, r.b + 1);
    var src = R(0, 0, A.r - A.l, A.b - A.t);
    QD.copyBits(strips.main, src, back, A, QD.srcCopy);
    src = R(0, 0, B.r - B.l, B.b - B.t);
    QD.copyBits(((r.r - r.l) & 1) ? strips.edgeB : strips.edgeA, src, back, B, QD.srcCopy);
    src = R(0, 0, C.r - C.l, C.b - C.t);
    QD.copyBits(((r.b - r.t) & 1) ? strips.botA : strips.botB, src, back, C, QD.srcCopy);
    r.t -= 4; r.b += 1;
  }

  // ------------------------------------------------------------- blocker (F2_1586)
  var blockerBm = null, blockerRect = R(0, 0, 0, 0);    // G0c4a, G0c44
  function buildBlocker() {
    var tl = projTop(-S.bHw, 750), br = projBot(S.bHw, 750);
    var r = R(tl.h, tl.v, br.h - 1, br.v + 1);
    QD.offsetRect(r, -r.l, -r.t);
    blockerRect = r;
    blockerBm = new QD.Bitmap(Math.max(r.r, 1), Math.max(r.b, 1));
    var p = new QD.Port(blockerBm);
    p.fillRect(r, QD.BLACK);
    var r2 = QD.copyR(r); r2.t += 2; r2.b -= 3; p.fillRect(r2, QD.DKGRAY);
    p.mode(QD.patCopy); p.pen(1, 1); p.penPattern(QD.WHITE);
    p.moveTo(r.l, r.t + 1); p.lineTo(r.l, r.b - 2);
    p.moveTo(r.l + 1, r.t); p.lineTo(r.l + 1, r.b);
    p.moveTo(r.l + 2, r.t); p.lineTo(r.r, r.t);
  }
  // L2_169e
  function drawBlocker() {
    if (!S.blockerOn || !blockerBm) return;
    var tl = projTop(S.bx - S.bHw, 750);
    bRect = R(tl.h + 1, tl.v + 1, tl.h + 1 + blockerRect.r, tl.v + 1 + blockerRect.b);
    QD.copyBits(blockerBm, R(0, 0, blockerRect.r, blockerRect.b), back, bRect, QD.srcCopy);
  }

  // =============================================================== physics
  // F5_363e: the player's paddle follows the mouse through a draggable box
  // (mouse.direct, a page option: the paddle's centre sits under the pointer instead,
  // by inverting the projection, so the pointer can stay visible on the paddle)
  var mouse = { x: 256, y: 171, down: false, direct: false };
  function playerFromMouse() {
    S.plzPrev = S.plz; S.plxPrev = S.plx;
    var mx = mouse.x, my = mouse.y, box = S.box, dh = 0, dv = 0;
    if (mouse.direct) {
      var v = clamp(my, 214, 310);                       // the paddle's middle (y 280) at z 300 .. 0
      S.plz = clamp(tdiv(280 * 576, v - 30) - 576, 0, 300);
      S.plx = clamp(tdiv((mx - 255) * (S.plz + 576), 576), S.plHw - 250, 250 - S.plHw);
      box.l = mx - S.plx - S.plHw + 250; box.r = box.l - 2 * S.plHw + 500;   // keep the box consistent
      box.t = my - 300 + S.plz; box.b = box.t + 300;
      playerRect(); return;
    }
    if (mx > box.r) dh = mx - box.r; else if (mx < box.l) dh = mx - box.l;
    if (my > box.b) dv = my - box.b; else if (my < box.t) dv = my - box.t;
    QD.offsetRect(box, dh, dv);
    S.plx = mx - box.l + S.plHw - 250;
    S.plz = 300 - (my - box.t);
    playerRect();
  }
  function playerRect() {           // L5_357e
    var a = projTop(S.plx - S.plHw, S.plz), b = projBot(S.plx + S.plHw, S.plz);
    plRect = R(a.h, a.v, b.h, b.v);
  }
  function resetBox() {             // F5_3610
    S.box.l = S.boxLeft; S.box.t = S.boxTop;
    S.box.r = S.box.l - 2 * S.plHw + 500; S.box.b = S.box.t + 300;
  }
  function paddleDefaults() {       // F5_3a14
    S.hitUp = [50, 50, 70, 130]; S.hitDown = [50, 50, 70, 140]; S.plHw = 50; resetBox();
  }
  function paddleIsDefault() {      // F5_3a54
    var u = S.hitUp, d = S.hitDown;
    return u[0] === 50 && u[1] === 50 && u[2] === 70 && u[3] === 130 && d[0] === 50 && d[1] === 50 && d[2] === 70 && d[3] === 140 && S.plHw === 50;
  }

  // F2_0c82: move the opponent paddle and compute its rect
  function oppMove() {
    var x0 = S.ox, z0 = S.oz, hw = S.P[PIDX.hw];
    S.ox = w16(S.ox + S.ovx); S.oz = w16(S.oz + S.ovz);
    S.ox = clamp(S.ox, hw - 250, 250 - hw);
    S.oz = clamp(S.oz, 1200, 1500);
    S.ovx = w16(S.ox - x0); S.ovz = w16(S.oz - z0);
    var a = projTop(S.ox - hw, S.oz), b = projBot(S.ox + hw, S.oz);
    oRect = R(a.h, a.v, b.h, b.v);
  }

  // F2_13f6: the blocker slides and bounces
  function blockerStep() {
    S.bx = w16(S.bx + S.bvx);
    if (S.bx + S.bHw > 250) { S.bvx = -S.bvx; S.bx = 250 - S.bHw; }
    if (S.bx - S.bHw < -250) { S.bvx = -S.bvx; S.bx = S.bHw - 250; }
  }
  // F2_1532 / L2_1448: puck crossing the blocker line
  function blockerCollide() {
    if (!S.blockerOn) return;
    var z = S.pz, vz = S.pvz, crossed = false;
    if (vz > 0 && z >= 750 && z - vz < 750) crossed = true;
    if (vz < 0 && z <= 750 && z - vz > 750) crossed = true;
    if (!crossed) return;
    if (!(S.px - 24 < S.bx + S.bHw && S.px + 24 > S.bx - S.bHw)) return;
    S.hitCooldown = 0;
    sfx.blocker();
    S.pvz = -S.pvz;
    var nb = w16(S.bvx * S.bWeight);
    S.bvx = w16(tdiv(S.pvx, S.bWeight));
    S.pvx = nb;
    if (S.bvx === 0 && S.pvx === 0) {
      S.bvx = tdiv(rnd(15, 40), S.bWeight);
      S.pvx = rnd(15, 40);
      if (rnd(0, 1)) S.bvx = -S.bvx; else S.pvx = -S.pvx;
    }
    S.pz = S.pvz > 0 ? 754 : 746;
  }
  function blockerInWay() {      // F2_173e
    return S.blockerOn && (S.bx - S.bHw < 24) && (S.bx + S.bHw > -24);
  }

  // L5_36fa: a paddle hit (player)
  function applyHit(pvx, pvz, prm, side) {
    if (S.hitCooldown <= 0) {
      S.pvx = tdiv(S.pvx * prm[0], 100);
      S.pvz = tdiv(S.pvz * prm[1], 100);
      S.pvz = side ? Math.abs(S.pvz) : -Math.abs(S.pvz);
      S.pvx += tdiv(pvx * prm[2], 100);
      S.pvz += tdiv(pvz * prm[3], 100);
    }
    if (side) { if (S.plz + 24 > S.pz) S.pz = S.plz + 24; }
    else { if (S.plz - 24 < S.pz) S.pz = S.plz - 24; }
    if (S.pz > 300 && S.pvz < 5) S.pvz = 5;
  }
  // L5_39ae: player paddle collision
  function playerCollide() {
    var side, hit = false;
    var prevZ = S.pz - S.pvz;
    if (S.plzPrev < prevZ) { side = 1; if (S.plz > S.pz - 24) hit = true; }
    else { side = 0; if (S.plz < S.pz + 24) hit = true; }
    if (hit) {
      var maxX = Math.max(S.px - S.pvx, S.px), minPx = Math.min(S.plxPrev, S.plx) - S.plHw;
      var minX = Math.min(S.px - S.pvx, S.px), maxPx = Math.max(S.plxPrev, S.plx) + S.plHw;
      hit = (maxX + 20 > minPx) && (minX - 20 < maxPx);
    }
    if (hit) {
      var pvx = S.plx - S.plxPrev, pvz = S.plz - S.plzPrev;
      if (S.hitCooldown === 0) sfx.hit();
      // L5_383c
      if (!mouse.down) {
        if (S.playerServeFlag === 1) { S.playerServeFlag = 0; nerualMirror(pvx, pvz, S.hitUp[2], S.hitUp[3]); }
        applyHit(pvx, pvz, S.hitUp, side);
      } else {
        if (S.playerServeFlag === 1) { S.playerServeFlag = 0; nerualMirror(pvx, pvz, S.hitDown[2], S.hitDown[3]); }
        applyHit(pvx, pvz, S.hitDown, side);
      }
      S.hitCooldown = 5;
    } else if (S.hitCooldown > 0) S.hitCooldown--;
  }
  function nerualMirror(pvx, pvz, sp, fp) {    // L5_3392
    if (S.opp !== 6) return;
    S.nx = pvx; S.nz = pvz; S.P[PIDX.bSideP] = sp; S.P[PIDX.bFwdP] = fp;
  }
  // F2_0aea: opponent paddle collision
  function oppCollide() {
    var crossed = (S.oz - S.ovz > S.pz - S.pvz) && (S.oz <= S.pz);
    if (!crossed) return;
    var hw = S.P[PIDX.hw];
    var maxX = Math.max(S.px - S.pvx, S.px), minOx = Math.min(S.ox, S.ox - S.ovx) - hw;
    if (!(maxX + 24 > minOx)) return;
    var minX = Math.min(S.px - S.pvx, S.px), maxOx = Math.max(S.ox, S.ox - S.ovx) + hw;
    if (!(minX - 24 < maxOx)) return;
    // L2_0a60
    S.hitCooldown = 0;
    var P = S.P;
    var pvx = S.aiState > 1 ? S.ovx : 0, pvz = S.aiState > 1 ? S.ovz : 0;
    if (S.pvz > 0) { S.pvx = tdiv(S.pvx * P[0], 100); S.pvz = tdiv(-S.pvz * P[1], 100); }
    S.pvx += tdiv(pvx * P[2], 100); S.pvz += tdiv(pvz * P[3], 100);
    if (S.pvz > -5) S.pvz = -5;
    S.pz = S.oz - 4;
    sfx.oppHit();
  }
  // F5_65d4: one step of the puck
  function puckStep() {
    S.px += S.pvx; S.pz += S.pvz;
    if (S.px < -226) { sfx.wall(); S.pvx = -S.pvx; S.px = -226; }
    if (S.px > 226) { sfx.wall(); S.pvx = -S.pvx; S.px = 226; }
    playerCollide();
    blockerCollide();
    oppCollide();
    if (S.pz < -18) S.pz = -17;
    if (S.pz > 1500) S.pz = 1500;
  }

  // ============================================================ opponent AI
  function P(k) { return S.P[PIDX[k]]; }
  function aiClampTarget() {                                   // L5_2b52
    S.tx = clamp(w16(S.tx), P('hw') - 250, 250 - P('hw'));
  }
  function aiBounce() {                                        // L5_2b78
    if (S.tx > 226) { S.tx = 226; S.tvx = -S.tvx; }
    if (S.tx < -226) { S.tx = -226; S.tvx = -S.tvx; }
  }
  function aiSimStep() {                                       // L5_2bc8
    if (S.tz < 1200) { S.tx += S.tvx; S.tz += S.tvz; aiBounce(); }
    else aiClampTarget();
  }
  function aiCopyPuck() { S.tx = S.px; S.tz = S.pz; S.tvx = S.pvx; S.tvz = S.pvz; }   // L5_2bde
  function aiRandomX() { S.tx += rnd(-P('predErr'), P('predErr')); }               // L5_2bf8
  function aiTrack() {                                         // L5_2c12
    S.aiState = 1; aiCopyPuck(); aiRandomX();
    for (var i = 0; i < P('predSteps'); i++) aiSimStep();
  }
  function aiIdleX() {                                         // L5_2c40
    S.tx = (tdiv(P('idleXMax') + P('idleXMin'), 2) < S.ox) ? P('idleXMin') : P('idleXMax'); S.tvx = 0;
  }
  function aiIdleZ() {                                         // L5_2c6c
    S.tz = (1500 - tdiv(P('idleZ1') + P('idleZ2'), 2) < S.oz) ? 1500 - P('idleZ1') : 1500 - P('idleZ2'); S.tvz = 0;
  }
  function aiIdle() { S.aiState = 0; aiIdleZ(); aiIdleX(); aiRandomX(); aiClampTarget(); }   // F5_2caa
  function aiJitter() {                                        // L5_2d3c
    var j = P('jitter'); if (!j) return;
    if (S.ovx) S.ovx = w16(S.ovx + rnd(-j, j));
    if (S.ovz) S.ovz = w16(S.ovz + rnd(-j, j));
  }
  function aiBackswing() {                                     // L5_2d00
    S.aiState = 2; S.cx = w16(S.tx); S.cz = w16(S.tz);
    S.tx += rnd(P('bsXmax'), P('bsXmin')); S.tz += rnd(P('bsZmax'), P('bsZmin'));
  }
  function aiThink() {                                         // L5_2e24
    aiSimStep();
    S.ovx = w16(S.tx - S.ox); S.ovz = w16(S.tz - S.oz);
    if (S.aiState === 0) {
      S.ovx = clamp(S.ovx, -P('idleVxMin'), P('idleVxMax')); S.ovz = clamp(S.ovz, -P('idleVzMin'), P('idleVzMax')); aiJitter();
      if (S.ovz === 0) aiIdleZ();
      if (S.ovx === 0) aiIdleX();
    } else if (S.aiState === 1) {
      S.ovx = clamp(S.ovx, -P('retVxMin'), P('retVxMax')); S.ovz = clamp(S.ovz, -P('retVzMin'), P('retVzMax')); aiJitter();
      if (S.ovz === 0 && S.ovx === 0) aiBackswing();
    } else {
      S.ovx = clamp(S.ovx, -P('blkVx'), P('blkVx')); S.ovz = clamp(S.ovz, 0, P('blkVz')); aiJitter();
      if (S.ovz === 0 && S.ovx === 0) S.aiState = 3;
      if (S.cz <= S.pz + S.pvz) { S.ovx = w16(S.cx - S.ox); S.ovz = w16(S.cz - S.oz); }
    }
  }
  function aiFrame() {                                         // F5_2ed2
    if (S.pvz <= 0) { if (S.aiState !== 0) aiIdle(); }
    else if (S.aiState === 0 && S.pz - 24 > Math.max(1500 - P('react'), 300)) aiTrack();
    aiThink();
  }

  // ======================================================= sounds (hooks filled by app)
  var sfx = { wall: function () {}, hit: function () {}, oppHit: function () {}, blocker: function () {}, crack: function () {}, bigCrack: function () {}, play: function () {}, stop: function () {}, done: function () { return true; } };

  // =========================================================== glass cracks
  // L5_25bc: a random jagged line
  function crackLine(p, x, y, segs, len) {
    p.setPort(screen); p.pen(1, 1); p.penPattern(QD.WHITE); p.mode(QD.patCopy);
    while (segs) {
      p.moveTo(x, y);
      x += rnd(-len, len); y += rnd(-len, 0);
      if (clamp(x, 0, 512) !== x || clamp(y, 0, 342) !== y) break;
      p.lineTo(x, y);
      segs--;
    }
    dirty = true;
  }
  var speedFor = function () { return Math.abs(w16(S.pvz)) + tdiv(Math.abs(w16(S.pvx)), 2); };
  function crackNear() {                 // F5_2696: the puck broke the glass at the player's end
    sfx.crack(Math.min(speedFor(), 350));
    var x0 = w16(S.px) + 255;
    if (S.pvz === 0) {
      for (var i = 0; i < 2; i++) crackLine(port, x0 + i * 4 - 4, 340, 6, rnd(30, 90));
    } else {
      var sp = Math.min(speedFor(), 300);
      var len = mapv(sp, 0, 300, 10, 90);
      for (i = 0; i < 2; i++) crackLine(port, x0 + i * 4 - 4, 340, 6, len);
    }
  }
  function crackFar() {                  // F5_277a: at the opponent's end
    var pt = projBot(w16(S.px), 1500);
    sfx.crack(Math.min(speedFor(), 350));
    if (S.pvz === 0) {
      for (var i = 0; i < 2; i++) crackLine(port, pt.h + i - 1, pt.v, 6, rnd(tdiv(pt.v, 4), tdiv(pt.v, 10)));
    } else {
      var sp = Math.min(speedFor(), 250), len = mapv(sp, 0, 250, 10, 30);
      for (i = 0; i < 2; i++) crackLine(port, pt.h + i - 1, pt.v, 6, len);
    }
  }
  function crackBig() {                  // F5_2880
    sfx.bigCrack();
    for (var i = 0; i < 3; i++) crackLine(port, 256, 340, 7, 120);
  }

  // =============================================================== compositor (F2_42be)
  function intersects(a, b) { return a.l < b.r && a.r > b.l && a.b > b.t && a.t < b.b; }
  function render() {
    fromBg(puckOld); fromBg(plOld); fromBg(oOld);
    if (S.blockerOn) fromBg(bOld);
    // draw order by depth (back to front)
    if (S.oz < S.pz) { drawPuckSprite(); drawOppSprite(); drawBlocker(); drawPlayerPaddle(); }
    else {
      drawOppSprite();
      if (S.plz <= S.pz) {
        if (S.pz > 750) { drawPuckSprite(); drawBlocker(); drawPlayerPaddle(); }
        else { drawBlocker(); drawPuckSprite(); drawPlayerPaddle(); }
      } else { drawBlocker(); drawPlayerPaddle(); drawPuckSprite(); }
    }
    var u1 = QD.unionRect(puckOld, puckRect), u2 = QD.unionRect(plOld, plRect), u3 = QD.unionRect(oOld, oRect), u4 = S.blockerOn ? QD.unionRect(bOld, bRect) : null;
    var merged = false;
    if (intersects(u2, u1)) { u2 = QD.unionRect(u2, u1); merged = true; }
    else if (intersects(u3, u1)) { u3 = QD.unionRect(u3, u1); merged = true; }
    else if (u4 && intersects(u4, u1)) { u4 = QD.unionRect(u4, u1); merged = true; }
    if (!merged) toScreen(u1);
    toScreen(u2); toScreen(u3); if (u4) toScreen(u4);
    puckOld = QD.copyR(puckRect); plOld = QD.copyR(plRect); oOld = QD.copyR(oRect); bOld = QD.copyR(bRect);
  }

  // ============================================================ scoreboard
  var SB = { x: 0, y: 0 };      // pen in 1/128 units (G0c38, G0c34)
  var handBm = [null, null], handMask = [null, null];
  function sbPen(x, y) { SB.x = x * 128; SB.y = y * 128; }     // L2_1a84
  // L2_1aa4 is a generator (animates the chalk hand); see flow.js
  function drawNames(p) {                 // L2_0fd4: the names on the scoreboard, white script
    p.moveTo(12, 42); p.drawString(FONTS.la12, S.playerName, true, QD.srcBic);
    p.moveTo(12, 69); p.drawString(FONTS.la12, S.oppName || '', true, QD.srcBic);
  }

  return {
    S: S, PIDX: PIDX, W: W, H: H, R: R, w16: w16, tdiv: tdiv, clamp: clamp, mapv: mapv, rdiv: rdiv, addMag: addMag, rnd: rnd, setSeed: setSeed,
    proj: proj, projTop: projTop, projBot: projBot, projRaw: projRaw,
    screen: screen, back: back, bg: bg, port: port, wport: wport, FULL: FULL, PAT: PAT, pat: pat, pict: pict, drawPict: drawPict, FONTS: FONTS,
    toScreen: toScreen, fromBg: fromBg, isDirty: function () { return dirty; }, setDirty: function (v) { dirty = v; },
    rects: function () { return { puck: puckRect, puckOld: puckOld, pl: plRect, plOld: plOld, o: oRect, oOld: oOld, b: bRect, bOld: bOld }; },
    setOldRects: function () { puckOld = QD.copyR(puckRect); plOld = QD.copyR(plRect); oOld = QD.copyR(oRect); bOld = QD.copyR(bRect); },
    buildPuckSprites: buildPuckSprites, buildOppSprites: buildOppSprites, buildPlayerStrips: buildPlayerStrips, buildBlocker: buildBlocker, loadHand: loadHand,
    drawPuckSprite: drawPuckSprite, drawOppSprite: drawOppSprite, drawPlayerPaddle: drawPlayerPaddle, drawBlocker: drawBlocker,
    mouse: mouse, playerFromMouse: playerFromMouse, playerRect: playerRect, resetBox: resetBox, paddleDefaults: paddleDefaults, paddleIsDefault: paddleIsDefault,
    oppMove: oppMove, blockerStep: blockerStep, puckStep: puckStep, blockerInWay: blockerInWay,
    aiFrame: aiFrame, aiIdle: aiIdle, aiThink: aiThink, aiTrack: aiTrack, aiClampTarget: aiClampTarget,
    sfx: sfx, crackNear: crackNear, crackFar: crackFar, crackBig: crackBig, render: render,
    SB: SB, sbPen: sbPen, drawNames: drawNames, speedFor: speedFor
  };
})();
