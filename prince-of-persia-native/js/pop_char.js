// pop_char.js — the character logic: COLL.S (the sequence interpreter ANIMCHAR, barrier collisions,
// slicers, gates), CTRL.S (what the player's commands and the ground do to the character) and the
// last pieces of CTRLSUBS.S (SETUPSWORD and the ADD...OBJ entry points).
var POP = POP || {};
POP.char = (function () {
  'use strict';
  var ST = POP.state, S = ST.S, Char = ST.Char, Op = ST.Op, OBJ = ST.OBJ, SEQ = ST.SEQ, SND = ST.SND, SONG = ST.SONG, OPC = ST.OPC, u8 = ST.u8, s8 = ST.s8;
  var FloorY = ST.FloorY, Mult7 = ST.Mult7, angle = ST.angle, Fcheckmark = ST.Fcheckmark;
  var addsound = function (n) { POP.sound.addsound(n); };

  // ---------------------------------------------------------------- COLL.S
  var BarL = [0, 12, 2, 0, 0], BarR = [0, 0, 9, 11, 0];              // by barrier code: clear, panel/gate, flask, mirror/slicer, block
  var DeathVelocity = 33, OofVelocity = 22, gatemargin = 6;
  var CollFace = 0, tempobjid = 0;

  function checkbarr() {
    S.collideL = 0xFF; S.collideR = 0xFF;
    if (Char.Action === 7) return;
    S.BlockYthis = Char.BlockY;
    initCDbufs();
    S.BlockYlast = S.BlockYthis;
    var e = u8(ST.getblockxp(S.CDRightEj) + 2); if (e >= 11) e = 11;
    S.endrange = e;
    S.begrange = u8(ST.getblockxp(S.CDLeftEj) - 1);
    S.blocky = S.BlockYthis; getCData(S.SNthisframe, S.CDthisframe);
    S.blocky = u8(S.BlockYthis + 1); getCData(S.SNbelow, S.CDbelow);
    S.blocky = u8(S.BlockYthis - 1); getCData(S.SNabove, S.CDabove);
    for (var x = 9; x >= 0; x--) {
      var sn = S.SNthisframe[x]; if (sn & 0x80) continue;
      if (sn !== S.SNlastframe[x]) continue;
      if (!(S.CDlastframe[x] & 0x0F) && (S.CDthisframe[x] & 0x0F)) S.collideL = x;
      if (!(S.CDlastframe[x] & 0xF0) && (S.CDthisframe[x] & 0xF0)) S.collideR = x;
    }
  }
  function getCData(SN, CD) {
    S.blockedge = u8(ST.getblockej(S.begrange) + angle);
    var x = S.begrange;
    for (var guard = 0; guard < 256; guard++) {
      S.bufindex = x;
      var lb = getleftbar(Char.Scrn, S.bufindex, S.blocky);
      var z = (lb < S.CDRightEj) ? 0x0F : 0;
      var rb = getrightbar(Char.Scrn, S.bufindex, S.blocky);
      var z2 = (rb <= S.CDLeftEj) ? 0 : 0xF0;
      CD[S.tempblockx] = z | z2;
      SN[S.tempblockx] = S.tempscrn;
      S.blockedge = u8(S.blockedge + 14);
      x = u8(S.bufindex + 1);
      if (x === S.endrange) break;
    }
  }
  function initCDbufs() {
    var t = S.BlockYthis, l = S.BlockYlast, SN, CD;
    if (t === l || u8(t + 3) === l || u8(t - 3) === l) { SN = S.SNthisframe; CD = S.CDthisframe; }
    else if (u8(t + 1) === l || u8(t - 2) === l) { SN = S.SNabove; CD = S.CDabove; }
    else { SN = S.SNbelow; CD = S.CDbelow; }
    for (var x = 9; x >= 0; x--) { S.SNlastframe[x] = SN[x]; S.CDlastframe[x] = CD[x]; S.SNthisframe[x] = 0xFF; S.SNabove[x] = 0xFF; S.SNbelow[x] = 0xFF; }
  }
  // x-coordinate of the barrier's left edge (255 if the block is no barrier) / right edge (0 if none)
  function getleftbar(scrn, bx, by) { var c = ST.cmpbarr(ST.rdblock(scrn, bx, by)); return c ? u8(S.blockedge + BarL[c]) : 255; }
  function getrightbar(scrn, bx, by) { var c = ST.cmpbarr(ST.rdblock(scrn, bx, by)); return c ? u8(S.blockedge + 13 - BarR[c]) : 0; }

  function collisions() {
    if (S.AMtimer) { S.AMtimer--; return; }
    var a = Char.Action; if (a === 2 || a === 6) return;
    var p = Char.Posn; if (p >= 135 && p < 149) return;
    var x = S.collideL;
    if (!(x & 0x80)) { S.collX = x; leftcoll(); return; }
    x = S.collideR;
    if (!(x & 0x80)) { S.collX = x; rightcoll(); }
  }
  function rightcoll() {
    if (Char.Sword !== 2 && !(Char.Face & 0x80)) return;
    if (!checkcoll1(S.collX)) return;
    var rb = getrightbar(S.tempscrn, S.tempblockx, S.tempblocky);
    collide(u8(rb - S.CDLeftEj), 0);
  }
  function leftcoll() {
    if (Char.Sword !== 2 && (Char.Face & 0x80)) return;
    if (!checkcoll1(S.collX)) return;
    var lb = getleftbar(S.tempscrn, S.tempblockx, S.tempblocky);
    collide(u8(lb - S.CDRightEj), 0xFF);
  }
  function checkcoll1(x) {
    S.tempblockx = x;
    var by = Char.BlockY;
    if (by & 0x80) by = u8(by + 3); else if (by >= 3) by = u8(by - 3);
    S.tempblocky = by;
    S.tempscrn = S.SNthisframe[x];
    return checkcoll(ST.rdblock1());
  }
  // in: rdblock results (a = objid); out: true if collision, with blockedge set
  function checkcoll(a) {
    if (a === OBJ.flask) return false;
    if (a === OBJ.gate) { if (gatebarr()) return false; return coll1(); }
    if (a === OBJ.slicer) { if (ST.spec() !== ST.slicerExt) return false; return coll1(); }
    if (a === OBJ.mirror) {
      if (Char.ID === 0 && Char.Posn >= 39 && Char.Posn < 44 && (Char.Face & 0x80)) { POP.mover.smashmirror(); S.createshad = 0xFF; return false; }
    }
    return coll1();
  }
  function coll1() { S.blockedge = u8(AdjustScrn(ST.getblockej(S.tempblockx)) + angle); return true; }
  function AdjustScrn(a) {
    var x = S.tempscrn;
    if (x === S.VisScrn) return a;
    if (x === S.scrnLeft || x === S.scrnBelowL) return u8(a - ST.ScrnWidth);
    if (x === S.scrnRight || x === S.scrnBelowR) return u8(a + ST.ScrnWidth);
    return a;
  }
  // true if the gate is clear (high enough), false if it bars you
  function gatebarr() { return u8((ST.spec() >> 2) + gatemargin) >= S.imheight; }

  function collide(a, face) {
    CollFace = face;
    if (!(Char.Life & 0x80)) return;
    if (Char.Posn === 177) return;
    Char.X = u8(a + Char.X);
    var id = ST.rdblock1();
    if (CollFace & 0x80) {
      if (id === OBJ.block) { S.tempblockx = u8(S.tempblockx - 1); id = ST.rdblock1(); }
    } else if (id === OBJ.panelwof || id === OBJ.panelwif || id === OBJ.block) {
      S.tempblockx = u8(S.tempblockx + 1);
      if (S.tempscrn === 0 && S.tempblockx === 10) { S.tempscrn = Char.Scrn; S.tempblockx = 0; }
      id = ST.rdblock1();
    }
    if (ST.cmpspace(id) === 0) AirBump(); else GroundBump();
  }
  function AirBump() {
    Char.X = ST.addcharx(-4);
    if (Char.Action === 4) Char.XVel = 0;
    else { ST.jumpseq(SEQ.bumpfall); animchar(); }
    BumpSound();
  }
  function BumpSound() { S.alertguard = 1; addsound(SND.SmackWall); }
  function GroundBump() {
    var fy = u8(FloorY[u8(Char.BlockY + 1)]);
    if (Char.Sword !== 2) { if (u8(fy - Char.Y) >= 15) { AirBump(); return; } }
    Char.Y = fy;
    if (Char.YVel >= OofVelocity) { Char.X = ST.addcharx(-5); return; }
    Char.YVel = 0;
    if (Char.Life === 0) return;
    if (Char.Sword === 2) {
      if (CollFace === Char.Face) { ST.jumpseq(SEQ.bumpengback); animchar(); Char.X = ST.addcharx(1); return; }
      ST.jumpseq(SEQ.bumpengfwd); animchar(); BumpSound(); return;
    }
    var p = Char.Posn, hard = (p === 24 || p === 25) || (p >= 40 && p < 43) || (p >= 102 && p < 107);
    if (!hard) { ST.jumpseq(SEQ.bump); BumpSound(); animchar(); }
    else { ST.jumpseq(SEQ.hardbump); animchar(); BumpSound(); }
  }

  // GETFWDDIST: {a: size of the careful step (0-14), x: 0 edge / 1 barrier / 2 clear, y: the block's id}
  function getfwddist() {
    ST.GetBaseBlock(); ST.setupchar(); ST.getedges();
    var a = ST.getunderft(); tempobjid = a;
    if (ST.cmpbarr(a)) { S.tempblockx = Char.BlockX; var d = DBarr(); if (!(d & 0x80)) return tobarr(d); }
    a = ST.getinfront(); tempobjid = a;
    if (a === OBJ.panelwof && !(Char.Face & 0x80)) return toEOB();
    if (ST.cmpbarr(a)) { S.tempblockx = S.infrontx; var d2 = DBarr(); if (!(d2 & 0x80)) return tobarr(d2); }
    a = ST.getinfront(); tempobjid = a;
    if (a === OBJ.loose) return toEOB();
    if (a === OBJ.pressplate || a === OBJ.sword || a === OBJ.flask) return toEOB1();
    if (ST.cmpspace(a) === 0) return toEOB();
    return fullstep();
  }
  function fullstep() { return { a: 11, x: 2, y: tempobjid }; }
  function toEOB1() { var d = ST.getdist(); if (d === 0) return fullstep(); return { a: d, x: 0, y: tempobjid }; }
  function toEOB() { return { a: ST.getdist(), x: 0, y: tempobjid }; }
  function tobarr(d) { if (d >= 14) return fullstep(); return { a: d, x: 1, y: tempobjid }; }
  // distance to the barrier in the block (tempblockx); negative if it is behind the character
  function DBarr() {
    if (tempobjid === OBJ.gate && gatebarr()) return 0xFF;
    S.blockedge = u8(ST.getblockej(S.tempblockx) + angle);
    var c = ST.cmpbarr(tempobjid); if (!c) return 0xFF;
    if (!(Char.Face & 0x80)) return u8(u8(S.blockedge + BarL[c]) - S.CDRightEj);
    return u8(S.CDLeftEj - u8(S.blockedge + 13 - BarR[c]));
  }
  function DBarr2() {                                  // for enemies: the back is the leading edge
    var c = ST.cmpbarr(tempobjid); if (!c) return 0xFF;
    if (Char.Face & 0x80) return u8(u8(S.blockedge + BarL[c]) - S.CDRightEj);
    return u8(S.CDLeftEj - u8(S.blockedge + 13 - BarR[c]));
  }

  // ANIMCHAR: run the sequence table until it yields the next frame number
  var oGoto = u8(OPC.goto), oAbout = u8(OPC.aboutface), oUp = u8(OPC.up), oDown = u8(OPC.down), oChx = u8(OPC.chx), oChy = u8(OPC.chy), oAct = u8(OPC.act),
    oSetfall = u8(OPC.setfall), oIfwtless = u8(OPC.ifwtless), oDie = u8(OPC.die), oJaru = u8(OPC.jaru), oJard = u8(OPC.jard), oEffect = u8(OPC.effect), oTap = u8(OPC.tap), oNext = u8(OPC.nextlevel);
  function animchar() {
    for (;;) {
      var v = ST.getseq(), lo, hi;
      if (v === oChx) { Char.X = ST.addcharx(ST.getseq()); continue; }
      if (v === oChy) { Char.Y = u8(ST.getseq() + Char.Y); continue; }
      if (v === oAbout) { Char.Face ^= 0xFF; continue; }
      if (v === oGoto) { lo = ST.getseq(); hi = ST.getseq(); Char.Seq = lo | (hi << 8); continue; }
      if (v === oUp) { Char.BlockY = u8(Char.BlockY - 1); POP.top.addslicers(); continue; }
      if (v === oDown) { Char.BlockY = u8(Char.BlockY + 1); POP.top.addslicers(); continue; }
      if (v === oAct) { Char.Action = ST.getseq(); continue; }
      if (v === oSetfall) { Char.XVel = ST.getseq(); Char.YVel = ST.getseq(); continue; }
      if (v === oIfwtless) { lo = ST.getseq(); hi = ST.getseq(); if (S.weightless) Char.Seq = lo | (hi << 8); continue; }
      if (v === oDie) continue;
      if (v === oJaru) { S.jarabove = 1; continue; }
      if (v === oJard) { S.jarabove = 0xFF; continue; }
      if (v === oTap) {
        var t = ST.getseq();
        if (t === 1) { addsound(SND.Footstep); S.alertguard = 1; }
        else if (t === 0) S.alertguard = 1;
        else if (t === 2) { addsound(SND.SmackWall); S.alertguard = 1; }
        continue;
      }
      if (v === oNext) { GoneUpstairs(); continue; }
      if (v === oEffect) { if (ST.getseq() === 1) POP.top.potioneffect(); continue; }
      Char.Posn = v; return;
    }
  }
  function GoneUpstairs() {
    if (S.level !== 13) POP.top.cuesong(S.level === 4 ? SONG.Shadow : SONG.Upstairs, 25);
    S.NextLevel = u8(S.NextLevel + 1);
  }

  function checkslice() {
    S.tempblocky = Char.BlockY;
    for (var x = 9; x >= 0; x--) {
      S.tempblockx = x;
      if (S.CDthisframe[x] !== 0xFF) continue;
      S.tempscrn = S.SNthisframe[x];
      if (ST.rdblock1() !== OBJ.slicer) continue;
      if ((ST.spec() & 0x7F) !== ST.slicerExt) continue;
      slice(); return;
    }
  }
  function slice() {
    ST.setspec(ST.spec() | 0x80);
    if (Char.Posn === 178) return;
    Char.X = u8(ST.getblockej(S.tempblockx) + 7);
    Char.X = ST.addcharx(8);
    Char.Y = u8(FloorY[u8(Char.BlockY + 1)]);
    POP.top.decstr(100);
    addsound(SND.Splat);
    ST.jumpseq(SEQ.halve); animchar();
  }
  function checkslice2() {
    if (sliceq(ST.getunderft())) return;
    S.tempblockx = u8(S.tempblockx + 1);
    sliceq(ST.rdblock1());
  }
  function sliceq(a) {
    if (a !== OBJ.slicer) return false;
    if ((ST.spec() & 0x7F) !== ST.slicerExt) return false;
    S.blockedge = u8(ST.getblockej(S.tempblockx) + angle);
    if (getleftbar(S.tempscrn, S.tempblockx, S.tempblocky) >= S.CDRightEj) return false;
    if (getrightbar(S.tempscrn, S.tempblockx, S.tempblocky) <= S.CDLeftEj) return false;
    ST.rdblock1();
    slice();
    return true;
  }
  function checkgate() {
    var p = Char.Posn;
    if (!(Char.Action === 7 || p === 15 || (p >= 108 && p < 111))) return;
    var a = ST.getunderft();
    if (a !== OBJ.gate) { S.tempblockx = u8(S.tempblockx - 1); if (ST.rdblock1() !== OBJ.gate) return; }
    var x = S.tempblockx;
    if ((S.CDthisframe[x] & S.CDlastframe[x]) !== 0xFF) return;
    if (gatebarr()) return;
    BumpSound();
    S.collX = S.tempblockx;
    ST.getunderft();
    if (S.tempblockx <= S.collX) Char.X = u8(Char.X - 5); else Char.X = u8(Char.X + 5);
  }
  function enemycoll() {
    if (S.AMtimer) return;
    if (Char.Action !== 1) return;
    if (!(Char.Life & 0x80)) return;
    if (Char.Sword < 2) return;
    var a = ST.getunderft(), coll = false;
    if (a === OBJ.block || a === OBJ.panelwif) coll = true;
    else if (a === OBJ.gate) { if (!gatebarr()) coll = true; }
    if (!coll) {
      if (Char.Face & 0x80) return;
      S.tempblockx = u8(S.tempblockx - 1);
      a = ST.rdblock1();
      if (a === OBJ.panelwif) coll = true;
      else if (a === OBJ.gate) { if (!gatebarr()) coll = true; }
      if (!coll) return;
    }
    ST.setupchar(); ST.getedges();
    a = ST.rdblock(S.tempscrn, S.tempblockx, S.tempblocky); tempobjid = a;
    if (!checkcoll(a)) return;
    var d = DBarr2();
    if (!(d & 0x80)) return;
    Char.X = ST.addcharx(u8(-d));
    ST.jumpseq(SEQ.bumpengback); animchar(); ST.rereadblocks();
  }

  // ---------------------------------------------------------------- CTRL.S
  var grabreach = -8, grabspeed = 32, grablead = 25, stuntime = 12, jumpupreach = 0, jumpupangle = -6;
  var JumpBackThres = 6, StepOffFwd = 3, StepOffBack = 8, swordthres = 90, swordthresN = u8(-10), blockthres = 32, graceperiod = 9, gdpatience = 15;
  var gclimbthres = 6, stairthres = 30;
  var RJChange = 4, RJLookahead = 1, RJLeadDist = 14, RJMaxFujBak = 8, RJMaxFujFwd = 2;

  function falling() {
    if (Char.Y < u8(FloorY[u8(Char.BlockY + 1)])) { fallon(); return; }
    var a = ST.getunderft();
    if (a === OBJ.block) a = InsideBlock();
    if (ST.cmpspace(a) !== 0) { hitflr(); return; }
    Char.BlockY = u8(Char.BlockY + 1);
  }
  function checkfloor() {
    var a = Char.Action, p;
    if (a === 6) return;
    if (a === 5) { p = Char.Posn; if (p === 109 || p === 185) onground(); return; }
    if (a === 4) { falling(); return; }
    if (a === 3) { p = Char.Posn; if (p >= 102 && p < 106) fallon(); return; }
    if (a === 2) return;
    onground();
  }
  function hitflr() {
    Char.Y = u8(FloorY[u8(Char.BlockY + 1)]);
    var a = ST.getunderft();
    if (a === OBJ.spikes) { hitspikes(); return; }
    a = ST.getinfront();
    if (ST.cmpspace(a) === 0) { if (ST.getdist() < 4) Char.X = ST.addcharx(-3); }
    POP.top.addslicers();
    if (!(Char.Life & 0x80)) { hardland(); return; }
    if (ST.getdist() >= 12) { if (ST.getbehind() === OBJ.spikes) { hitspikes(); return; } }
    if (ST.getunderft() === OBJ.spikes) { hitspikes(); return; }
    notspikes();
  }
  function hitspikes() { if (POP.mover.getspikes()) { DoImpale(); return; } notspikes(); }
  function notspikes() {
    var v = Char.YVel;
    if (v < OofVelocity) { softland(); return; }
    if (v < DeathVelocity) { medland(); return; }
    hardland();
  }
  function hardland() { POP.top.decstr(100); hdland1(); }
  function hdland1() { addsound(SND.Splat); doland(SEQ.hardland); }
  function medland() {
    var id = Char.ID;
    if (id === 1) { softland(); return; }
    if (id >= 2) { hardland(); return; }
    if (POP.top.decstr(1) === 0) { hdland1(); return; }
    addsound(SND.Splat); doland(SEQ.medland);
  }
  function softland() {
    if (Char.ID >= 2 || Char.Sword === 2) { Char.Sword = 2; doland(SEQ.landengarde); return; }
    doland(SEQ.softland);
  }
  function doland(seq) { ST.jumpseq(seq); animchar(); Char.YVel = 0; }
  function fallon() {
    if (!(S.btn & Char.Life & 0x80)) return;
    if (Char.YVel >= grabspeed) return;
    if (u8(Char.Y + grablead) < u8(FloorY[u8(Char.BlockY + 1)])) return;
    S.savekidx = Char.X;
    Char.X = ST.addcharx(grabreach);
    ST.rereadblocks();
    S.blockid = ST.getabove();
    if (ST.checkledge(ST.getaboveinf()) === 0) { Char.X = S.savekidx; ST.rereadblocks(); return; }
    Char.X = ST.addcharx(ST.getdist());
    Char.Y = u8(FloorY[u8(Char.BlockY + 1)]);
    Char.YVel = 0;
    ST.jumpseq(SEQ.fallhang); animchar();
    S.stunned = stuntime;
  }
  function onground() {
    if (!(S.Fcheck & Fcheckmark)) return;
    var a = ST.getunderft();
    if (a === OBJ.block) a = InsideBlock();
    if (ST.cmpspace(a) !== 0) return;
    if (S.level === 12 && (S.mergetimer & 0x80) && Char.BlockY === 0) {         // the phantom bridge
      var yes = Char.Scrn === 2 || (Char.Scrn === 13 && S.tempblockx >= 6);
      if (yes) {
        ST.settype(OBJ.floor);
        var ix = ST.indexblock();
        ST.markwipe(ix, 2); ST.markred(ix, 2);
        var ix2 = { y: ix.y + 1, cs: ix.cs };
        ST.markwipe(ix2, 2); ST.markred(ix2, 2);
        return;
      }
    }
    startfall();
  }
  function startfall() {
    S.rjumpflag = 0; Char.Sword = 0;
    Char.BlockY = u8(Char.BlockY + 1);
    POP.top.addslicers();
    var p = Char.Posn, seq; S.rjumpflag = p;
    if (p === 9) seq = SEQ.stepfall;
    else if (p === 13) seq = SEQ.stepfall2;
    else if (p === 26) seq = SEQ.jumpfall;
    else if (p === 44) seq = SEQ.rjumpfall;
    else if (p >= 81 && p < 86) { Char.X = ST.addcharx(5); ST.rereadblocks(); seq = SEQ.stepfall2; }
    else if (p >= 150 && p < 180) {
      if (Char.ID < 2) { S.droppedout = 1; seq = SEQ.fightfall; }
      else if (Char.XVel & 0x80) seq = SEQ.efightfall;
      else { S.droppedout = 0; seq = SEQ.efightfallfwd; }
    }
    else seq = SEQ.stepfall;
    ST.jumpseq(seq); animchar();
    ST.rereadblocks();
    if (ST.cmpwall(ST.getunderft()) === 0) { InsideBlock(); return; }
    if (ST.cmpwall(ST.getinfront()) !== 0) return;
    CDpatch();
  }
  function CDpatch() {
    if (S.rjumpflag === 44 && ST.getdist() < 6) { ST.jumpseq(SEQ.patchfall); animchar(); ST.rereadblocks(); return; }
    Char.X = ST.addcharx(-1); ST.rereadblocks();
  }
  // the character is "inside" a block: put him on one side of it; returns the block underfoot
  function InsideBlock() {
    if (ST.getdist() >= 8) return bumpback();
    if (ST.getinfront() === OBJ.block) return bumpback();
    return reland(u8(ST.getdist() + 4));
  }
  function reland(a) { Char.X = ST.addcharx(a); ST.rereadblocks(); return ST.getunderft(); }
  function bumpback() {
    if (ST.getbehind() === OBJ.block) return reland(u8(7 - u8(ST.getdist() + 14)));
    return reland(u8(7 - ST.getdist()));
  }

  function shadctrl() {
    if (Char.ID === 24) { POP.auto.AutoCtrl(); return; }
    var alive = Char.Life & 0x80;
    if (alive && S.OppStrength === 0) { Char.Life = 0; POP.top.deadenemy(); alive = 0; }
    if (!alive && Char.ID === 1) { POP.top.VanishChar(); return; }
    if (S.ManCtrl) { POP.top.LoadDesel(); POP.top.getdesel(); POP.top.clrjstk(); UserCtrl(); POP.top.SaveDesel(); return; }
    POP.auto.AutoCtrl();
    GenCtrl();
  }
  function playerctrl() {
    if ((Char.Life & 0x80) && S.KidStrength === 0) Char.Life = 0;
    if (S.stunned) S.stunned = u8(S.stunned - 1);
    if (S.level === 0) { DemoCtrl(); GenCtrl(); return; }
    POP.top.LoadSelect(); POP.top.getselect(); POP.top.clrjstk();
    UserCtrl();
    POP.top.SaveSelect();
  }
  function DemoCtrl() {
    if (S.milestone) { clrall(); S.clrbtn = 1; S.clrF = 0xFF; S.JSTKX = 0xFF; return; }
    if (Char.Sword === 0) { POP.top.demo(); return; }
    S.guardprog = 10; POP.auto.AutoCtrl(); S.guardprog = 11;
  }
  function UserCtrl() {
    if (Char.Face & 0x80) { GenCtrl(); return; }
    POP.top.facejstk(); GenCtrl(); POP.top.facejstk();
  }
  function clrall() { S.clrB = 0; S.clrF = 0; S.clrU = 0; S.clrD = 0; return 1; }

  function GenCtrl() {
    if (!(Char.Life & 0x80)) {
      var p = Char.Posn;
      if (p === 15 || p === 166 || p === 158 || p === 171) ST.jumpseq(SEQ.dropdead);
      return;
    }
    var a = Char.Action;
    if (a === 5 || a === 4) { clrall(); return; }
    if (Char.Sword === 2) { FightCtrl(); return; }
    if (Char.ID >= 2) { GuardCtrl(); return; }
    var x = Char.Posn;
    if (x === 15) { standing(); return; }
    if (x === 48) { turning(); return; }
    if (x >= 50 && x < 53) { standing(); return; }
    if (x < 4) { starting(); return; }
    if (x >= 67 && x < 70) { stjumpup(); return; }
    if (x < 15) { arunning(); return; }
    if (x >= 87 && x < 100) { hanging(); return; }
    if (x === 109) crouching();
  }
  function GuardCtrl() {
    if (Char.Posn !== 166) return;
    if (!(S.clrD & 0x80)) return;
    if (S.clrF & 0x80) { DoEngarde(); return; }
    S.clrD = 1; ST.jumpseq(SEQ.alertturn);
  }
  function FightCtrl() {
    if (Char.Action >= 2) return;
    if (ST.getunderft() !== OBJ.loose) { if (S.EnemyAlert < 2) { dropgd(); return; } }
    var d = ST.getopdist();
    if (d < swordthres) { onalert(); return; }
    if (d < 128) { dropgd(); return; }
    if (d >= u8(-4)) { onalert(); return; }
    DoTurnEng();
  }
  function dropgd() {
    var id = Char.ID;
    if (id === 0) S.heroic = 0;
    else if (id >= 2) { onalert(); return; }
    if (Char.Posn !== 171) return;
    Char.Sword = 0; ST.jumpseq(SEQ.resheathe);
  }
  function onalert() {
    var x = Char.Posn;
    if (x === 161 || (S.clrbtn & 0x80)) {
      if (x === 161 && !(S.clrbtn & 0x80)) { ST.jumpseq(SEQ.retreat); return; }
      if (Char.ID === 0) S.gdtimer = gdpatience;
      DoStrike(x);
      if (S.clrbtn === 1) return;
    }
    if (S.clrD & 0x80) {
      x = Char.Posn;
      if (x !== 158 && x !== 170 && x !== 171) return;
      S.clrD = 1; Char.Sword = 0;
      var id = Char.ID;
      if (id === 0) { S.offguard = 1; S.refract = graceperiod; S.heroic = 0; ST.jumpseq(SEQ.fastsheathe); return; }
      if (id === 1) { ST.jumpseq(SEQ.resheathe); return; }
      ST.jumpseq(SEQ.goalertstand); return;
    }
    if (S.clrU & 0x80) { DoBlock(); return; }
    if (S.clrF & 0x80) { DoAdvance(); return; }
    if (S.clrB & 0x80) DoRetreat();
  }
  function DoTurnEng() { ST.jumpseq(SEQ.turnengarde); }
  function DoBlock() {
    var x = Char.Posn;
    if (x === 158 || x === 170 || x === 171 || x === 168 || x === 165) {
      if (ST.getopdist() >= blockthres) { blockmiss(); return; }
      if (Char.ID !== 0) { if (Op.Posn === 152) blockdo(SEQ.readyblock); return; }
      var op = Op.Posn;
      if (op === 168) return;
      if (op === 151 || op === 152 || op === 162) { blockdo(SEQ.readyblock); return; }
      if (op !== 153) { blockmiss(); return; }
      blockdo(SEQ.readyblock); animchar(); return;
    }
    if (x === 167) blockdo(SEQ.strikeblock);
  }
  function blockdo(seq) { S.clrU = 1; ST.jumpseq(seq); }
  function blockmiss() { if (Char.ID !== 0) { DoRetreat(); return; } blockdo(SEQ.readyblock); }
  function DoStrike(x) {
    if (x === 157 || x === 158 || x === 170 || x === 171 || x === 165) { dostr(Char.ID !== 0 ? SEQ.strike : SEQ.faststrike); return; }
    if (x === 150 || x === 161) dostr(SEQ.blocktostrike);
  }
  function dostr(seq) { S.clrbtn = 1; ST.jumpseq(seq); }
  function DoRetreat() { var x = Char.Posn; if (x === 158 || x === 170 || x === 171) { S.clrB = 1; ST.jumpseq(SEQ.retreat); } }
  function DoAdvance() { var x = Char.Posn; if (x === 158 || x === 170 || x === 171) { S.clrF = 1; ST.jumpseq(Char.ID !== 0 ? SEQ.advance : SEQ.fastadvance); } }

  function standing() {
    if ((S.clrbtn & 0x80) && (S.btn & 0x80)) { if (TryPickup()) return; }
    if (Char.ID !== 0) {
      if ((S.clrD & 0x80) && (S.clrF & 0x80)) { DoEngarde(); return; }
    } else if (S.gotsword) {
      if (S.offguard && !(S.btn & 0x80)) { btnup(); return; }
      if (S.EnemyAlert >= 2) {
        var d = ST.getopdist();
        if (d >= swordthresN || d < swordthres) {
          S.heroic = 1;
          if (d >= u8(-6)) { DoTurn(); return; }
          var eng = true;
          if (Op.ID === 1) {
            if (Op.Action === 3) eng = false;
            else if (Op.Posn >= 107 && Op.Posn < 118) eng = false;
          }
          if (eng) { DoEngarde(); return; }
        }
      }
      S.offguard = 0;
    }
    if (!(S.btn & 0x80)) { btnup(); return; }
    if (S.clrB & 0x80) { DoTurn(); return; }
    if (S.clrU & 0x80) { standUp(); return; }
    if (S.clrD & 0x80) { standDown(); return; }
    if (!(S.JSTKX & 0x80)) return;
    if (S.clrF & 0x80) DoStepfwd();
  }
  function btnup() {
    if (S.clrF & 0x80) { DoStartrun(); return; }
    if (S.clrB & 0x80) { DoTurn(); return; }
    if (S.clrU & 0x80) { standUp(); return; }
    if (S.clrD & 0x80) { standDown(); return; }
    if (S.JSTKX & 0x80) DoStartrun();
  }
  function standUp() {
    var stairs = ST.getunderft() === OBJ.exit || ST.getbehind() === OBJ.exit || ST.getinfront() === OBJ.exit;
    if (stairs && (ST.spec() >> 2) >= stairthres) { Stairs(); return; }
    if (S.JSTKX & 0x80) { DoStandjump(); return; }
    DoJumpup();
  }
  function standDown() {
    S.clrD = 1;
    if (ST.cmpspace(ST.getinfront()) === 0) {
      if (ST.getdist() < StepOffFwd) { Char.X = ST.addcharx(5); ST.rereadblocks(); return; }
    }
    if (ST.cmpspace(ST.getbehind()) !== 0) { DoCrouch(); return; }
    if (ST.getdist() < StepOffBack) { DoCrouch(); return; }
    S.blockid = ST.getbehind();
    if (ST.checkledge(ST.getunderft()) === 0) { DoCrouch(); return; }
    if (Char.Face & 0x80) {
      if (ST.getunderft() === OBJ.gate && (ST.spec() >> 2) < gclimbthres) { DoCrouch(); return; }
    }
    Char.X = ST.addcharx(u8(ST.getdist() - 9));
    ST.jumpseq(SEQ.climbdown);
  }
  function Stairs() { Char.X = u8(ST.getblockej(S.tempblockx) + 10); Char.Face = 0xFF; ST.jumpseq(SEQ.climbstairs); }
  function crouching() {
    if (S.clrbtn & 0x80) { if (TryPickup()) return; }
    if (S.JSTKY !== 1) { ST.jumpseq(SEQ.standup); return; }
    if (!(S.clrF & 0x80)) return;
    S.clrF = 1; ST.jumpseq(SEQ.crawl);
  }
  function starting() { if ((S.JSTKY & 0x80) && (S.JSTKX & 0x80)) DoStandjump(); }
  function stjumpup() { if ((S.JSTKX & 0x80) || (S.clrF & 0x80)) DoStandjump(); }
  function turning() {
    if (S.btn & 0x80) return;
    if (!(S.JSTKX & 0x80)) return;
    if (S.JSTKY & 0x80) return;
    ST.jumpseq(SEQ.turnrun);
  }
  function arunning() {
    var jx = S.JSTKX;
    if (jx === 0) { var p = Char.Posn; if (p === 7 || p === 11) { clrall(); S.clrF = 1; ST.jumpseq(SEQ.runstop); } return; }
    if (!(jx & 0x80)) { clrall(); S.clrB = 1; ST.jumpseq(SEQ.runturn); return; }
    if (S.JSTKY & 0x80) { if (S.clrU & 0x80) DoRunjump(); return; }
    if (S.clrD & 0x80) { S.clrD = 1; ST.jumpseq(SEQ.rdiveroll); }
  }
  function hanging() {
    if (S.stunned === 0 && (S.JSTKY & 0x80)) { climbup(); return; }
    if (!(S.btn & 0x80)) { hangdrop(); return; }
    if (Char.Action !== 6) {
      var a = ST.getunderft();
      if (a === OBJ.block) { ST.jumpseq(SEQ.hangstraight); return; }
      if (Char.Face === 0xFF && (a === OBJ.panelwif || a === OBJ.panelwof)) { ST.jumpseq(SEQ.hangstraight); return; }
    }
    if (ST.cmpspace(ST.getabove()) === 0) hangdrop();
  }
  function climbup() {
    clrall(); S.clrU = 1; S.clrbtn = 1;
    var a = ST.getabove();
    if (a === OBJ.mirror || a === OBJ.slicer) { ST.jumpseq(Char.Face === 0 ? SEQ.climbfail : SEQ.climbup); return; }
    if (a === OBJ.gate && Char.Face !== 0 && (ST.spec() >> 2) < gclimbthres) { ST.jumpseq(SEQ.climbfail); return; }
    ST.jumpseq(SEQ.climbup);
  }
  function hangdrop() {
    clrall(); S.clrD = 1;
    if (ST.cmpspace(ST.getbehind()) === 0 && ST.cmpspace(ST.getunderft()) === 0) { ST.jumpseq(SEQ.hangfall); return; }
    var a = ST.getunderft(), sheer = false;
    if (a === OBJ.block) sheer = true;
    else if ((Char.Face & 0x80) && (a === OBJ.panelwof || a === OBJ.panelwif)) sheer = true;
    if (sheer) Char.X = ST.addcharx(-7);
    ST.jumpseq(SEQ.hangdrop);
  }
  function DoStartrun() {
    var r = getfwddist();
    if (r.x === 1 && r.y !== OBJ.slicer) {
      r = getfwddist();
      if (r.a < 8) { if (S.clrF & 0x80) DoStepfwd(); return; }
    }
    ST.jumpseq(SEQ.startrun);
  }
  function DoTurn() {
    clrall(); S.clrB = 1;
    if (S.gotsword && S.EnemyAlert >= 2 && (ST.getopdist() & 0x80) && ST.getdist() >= 2) {
      Char.Sword = 2; S.offguard = 0; ST.jumpseq(SEQ.turndraw); return;
    }
    ST.jumpseq(SEQ.turn);
  }
  function DoStandjump() { S.clrU = 1; S.clrF = 1; ST.jumpseq(SEQ.standjump); }
  function DoSdiveroll() { S.clrD = 1; ST.jumpseq(SEQ.sdiveroll); }
  function DoCrouch() { ST.jumpseq(SEQ.stoop); clrall(); S.clrD = 1; }
  function DoEngarde() {
    clrall(); S.clrF = 1; S.clrbtn = 1; Char.Sword = 2;
    var id = Char.ID;
    if (id === 0) { S.offguard = 0; ST.jumpseq(SEQ.engarde); return; }
    if (id === 1) { ST.jumpseq(SEQ.engarde); return; }
    ST.jumpseq(SEQ.guardengarde);
  }
  function DoJumpup() {
    clrall(); S.clrU = 1;
    S.blockid = ST.getabove();
    if (ST.checkledge(ST.getaboveinf())) { DoJumphang(); return; }
    S.blockid = ST.getabovebeh();
    if (ST.checkledge(ST.getabove())) {
      if (ST.getdist() >= JumpBackThres) {
        if (ST.cmpspace(ST.getbehind()) === 0) { DoJumpedge(); return; }
        Char.X = ST.addcharx(u8(ST.getdist() - 14)); ST.rereadblocks(); DoJumphang(); return;
      }
    }
    DoJumphigh();
  }
  function DoJumpedge() { ST.getabove(); Char.X = ST.addcharx(u8(ST.getdist() - 10)); ST.jumpseq(SEQ.jumpbackhang); }
  function DoJumphang() {
    ST.getaboveinf();
    var atemp = ST.getdist(), doLong = atemp >= 4;
    if (!doLong) { var r = getfwddist(); if (r.a < 4 && r.x === 1) doLong = true; }
    if (doLong) { Char.X = ST.addcharx(u8(atemp - 4)); ST.jumpseq(SEQ.jumphangLong); return; }
    Char.X = ST.addcharx(atemp); ST.jumpseq(SEQ.jumphangMed);
  }
  function DoRunjump() {
    if (Char.Posn < 7) return;
    S.bufindex = 0;
    var ztemp = ST.addcharx(RJChange);
    S.blockx = u8(ST.getblockxp(ztemp));
    var d = ST.plus1[(Char.Face & 1) ? 0 : 1], edge = false;
    for (;;) {
      S.blockx = u8(S.blockx + d);
      var a = ST.rdblock(Char.Scrn, S.blockx, Char.BlockY);
      if (a === OBJ.spikes || ST.cmpspace(a) === 0) { edge = true; break; }
      S.bufindex++;
      if (S.bufindex < RJLookahead + 1) continue;
      break;
    }
    if (edge) {
      var px = ST.getdist1(ztemp), x = S.bufindex;
      px = u8(px + Mult7[x]); px = u8(px + Mult7[x]); px = u8(px - RJLeadDist);
      if (px >= u8(-RJMaxFujBak)) { }
      else if (px < RJMaxFujFwd) { }
      else if (px < 0x80) return;
      else px = u8(-3);
      Char.X = ST.addcharx(u8(px + RJChange));
    }
    clrall(); S.clrU = 1; ST.jumpseq(SEQ.runjump);
  }
  function DoStepfwd() {
    S.clrF = 1; S.clrbtn = 1;
    var r = getfwddist();
    if (r.a !== 0) { step2(r.a); return; }
    if (r.x === 1) { step2(11); return; }
    if (Char.Repeat !== 0) { Char.Repeat = 0; ST.jumpseq(SEQ.testfoot); return; }
    step2(11);
  }
  function step2(a) { Char.Repeat = a; ST.jumpseq(u8(a + SEQ.stepfwd1 - 1)); }
  function DoJumphigh() {
    clrall(); S.clrU = 1;
    var r = getfwddist();
    if (r.a < 4 && r.x === 1) Char.X = ST.addcharx(u8(r.a - 3));
    var zt = ST.facedx(jumpupreach);
    var a = u8(u8(ST.getbasex() + jumpupangle) + zt);
    var bx = u8(ST.getblockx(a));
    var id = ST.rdblock(Char.Scrn, bx, u8(Char.BlockY - 1));
    if (id === OBJ.block || ST.cmpspace(id) !== 0) { ST.jumpseq(SEQ.jumpup); return; }
    ST.jumpseq(SEQ.highjump);
  }
  function checkpress() {
    var p = Char.Posn, a;
    if ((p >= 87 && p < 100) || (p >= 135 && p < 141)) { checkit(ST.getabove()); return; }
    var act = Char.Action;
    if (!(act === 7 || act === 5 || act < 2)) return;
    if (p === 79) { if (ST.getabove() === OBJ.loose) POP.mover.breakloose(); return; }
    if (!(S.Fcheck & Fcheckmark)) return;
    checkit(ST.getunderft());
  }
  function checkit(a) {
    if (a === OBJ.upressplate || a === OBJ.pressplate) { if (Char.Life & 0x80) POP.mover.pushpp(); else POP.mover.jampp(); return; }
    if (a !== OBJ.loose) return;
    S.alertguard = 1; POP.mover.breakloose();
  }
  function checkimpale() {
    if (ST.rdblock(Char.Scrn, Char.BlockX, Char.BlockY) !== OBJ.spikes) return;
    var x = Char.Posn;
    if (x < 7) return;
    if (x < 15) { if (POP.mover.getspikes() < 2) return; DoImpale(); return; }
    if (x === 43 || x === 26) { if (POP.mover.getspikes() === 0) return; DoImpale(); }
  }
  function DoImpale() {
    POP.mover.jamspikes();
    Char.Y = u8(FloorY[u8(Char.BlockY + 1)]);
    Char.X = u8(ST.getblockej(S.tempblockx) + 10);
    Char.X = ST.addcharx(8);
    Char.YVel = 0;
    addsound(SND.Impaled);
    POP.top.decstr(100);
    ST.jumpseq(SEQ.impale); animchar();
  }
  function TryPickup() {
    var a = ST.getunderft();
    if (a === OBJ.flask || a === OBJ.sword) {
      if (ST.cmpspace(ST.getbehind()) === 0) return 0;
      Char.X = ST.addcharx(-14); ST.rereadblocks();
    }
    a = ST.getinfront();
    if (a === OBJ.flask || a === OBJ.sword) { PickItUp(a); return 1; }
    return 0;
  }
  function PickItUp(a) {
    if (Char.Posn !== 109) {
      var r = getfwddist();
      if (r.x !== 2) Char.X = ST.addcharx(r.a);
      if (!(Char.Face & 0x80)) Char.X = ST.addcharx(-2);
      DoCrouch(); return;
    }
    if (a === OBJ.sword) { POP.top.RemoveObj(0xFF); ST.jumpseq(SEQ.pickupsword); return; }
    POP.top.RemoveObj(ST.spec() >> 5); ST.jumpseq(SEQ.drinkpotion);
  }

  // ---------------------------------------------------------------- CTRLSUBS.S: the sword and the object entries
  function setupsword() {
    var vis = false;
    if (Char.ID === 2 && (Char.Life & 0x80)) vis = true;
    else { var p = Char.Posn; if (p >= 229 && p < 238) vis = true; else if (Char.Sword !== 0) vis = true; }
    if (!vis) return;
    var f = S.Fsword & 0x3F; if (!f) return;
    var sf = ST.swordframe(f);
    if (sf[0] === 0) return;
    S.FCharImage = sf[0]; S.FCharTable = 2;
    S.Fdx = sf[1]; S.Fdy = sf[2];
    ST.addfcharx(S.Fdx);
    S.FCharY = u8(S.Fdy + S.FCharY);
    POP.bg.addcharobj(ST.TypeSword);
  }
  function addkidobj() { POP.bg.addcharobj(ST.TypeKid); }
  function addreflobj() { POP.bg.addcharobj(ST.TypeReflect); }
  function addshadobj() { POP.bg.addcharobj(ST.TypeShad); }
  function addguardobj() { POP.bg.addcharobj(ST.TypeGd); }

  return { checkbarr: checkbarr, collisions: collisions, getfwddist: getfwddist, checkcoll: checkcoll, animchar: animchar, checkslice: checkslice, checkslice2: checkslice2,
    checkgate: checkgate, enemycoll: enemycoll, gatebarr: gatebarr, GoneUpstairs: GoneUpstairs,
    playerctrl: playerctrl, checkfloor: checkfloor, shadctrl: shadctrl, checkpress: checkpress, DoImpale: DoImpale, GenCtrl: GenCtrl, checkimpale: checkimpale,
    clrall: clrall, DoEngarde: DoEngarde, DoTurn: DoTurn, DoStartrun: DoStartrun, DoCrouch: DoCrouch, DoSdiveroll: DoSdiveroll, InsideBlock: InsideBlock, startfall: startfall,
    setupsword: setupsword, addkidobj: addkidobj, addreflobj: addreflobj, addshadobj: addshadobj, addguardobj: addguardobj };
})();
