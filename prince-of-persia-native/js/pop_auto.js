// pop_auto.js — AUTO.S: the guards' and the shadow's minds (AutoCtrl), sword contact (CheckStrike /
// CheckStab), the pre-recorded shadow scenes, and the cuts between screens (CutCheck / Cut / AddGuard).
var POP = POP || {};
POP.auto = (function () {
  'use strict';
  var ST = POP.state, S = ST.S, Char = ST.Char, Op = ST.Op, Kid = ST.Kid, Shad = ST.Shad, OBJ = ST.OBJ, SEQ = ST.SEQ, SND = ST.SND, SONG = ST.SONG, u8 = ST.u8;
  var blue = ST.blue, FloorY = ST.FloorY;
  var addsound = function (n) { POP.sound.addsound(n); };
  var TopCutEdgePl = ST.ScrnTop + 10, TopCutEdgeMi = u8(ST.ScrnTop - 16), BotCutEdge = u8(ST.ScrnBottom + 24), LeftCutEdge = ST.ScrnLeft - 4, RightCutEdge = ST.ScrnRight + 4;
  var flaskscrn = 24, flaskx = 3, flasky = 0, mirscrn = 4, mirx = 4, miry = 0, swordscrn = 15, swordx = 1, swordy = 0;
  var strikerange1 = 12, strikerange2 = 29, blockrange1 = 0, blockrange2 = 29;
  var swordthres = 90, strikethres1 = strikerange1, strikethres2 = strikerange2, blockthres1 = 10, blockthres2 = blockrange2;
  var tooclose = strikethres1, toofar = strikethres2 + 6, offguardthres = 8, jumpthres = 50, runthres = 40, blocktime = 4;
  var strikeprob = [75, 100, 75, 75, 75, 50, 100, 220, 0, 60, 40, 60], restrikeprob = [0, 0, 0, 5, 5, 175, 20, 10, 0, 255, 255, 150];
  var blockprob = [0, 150, 150, 200, 200, 255, 200, 250, 0, 255, 255, 255], impblockprob = [0, 75, 75, 100, 100, 145, 100, 250, 0, 145, 255, 175];
  var advprob = [255, 200, 200, 200, 255, 255, 200, 0, 0, 255, 100, 100], refractimer = [20, 20, 20, 20, 10, 10, 10, 10, 0, 10, 0, 0];
  var specialcolor = [0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, 1], extrastrength = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], numprogs = 12;
  var basicstrength = [4, 3, 3, 3, 3, 4, 5, 4, 4, 5, 5, 5, 4, 6], basiccolor = [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0], shadstrength = 4;
  var shadpos6a = [0x0f, 0x51, 0x76, 0x00, 0x00, 0x01, 0x00, SEQ.stand], shadpos5 = [0x0f, 0x37, 0x37, 0x00, 0xff, 0x00, 0x00, SEQ.stand], shadpos12 = [0x0f, 0x51, 0xf0, 0x00, 0x00, 0x00, 0x00, SEQ.stepfall];
  var EndProg = 0xFE, EndDemo = 0xFF, Ctr = 0, Fwd = 1, Back = 2, Up = 3, Down = 4, Upfwd = 5, Press = 6, Release = 7;
  var ShadProg5 = [0, Ctr, 1, Fwd, 14, Ctr, 18, Press, 29, Release, 45, Back, 49, Fwd, 255, EndProg];
  var cutdir = 0;

  function AutoCtrl() {
    DoRelease();
    if (Char.ID === 0) { GuardProg(); return; }                   // the kid in the demo
    if (S.justblocked) S.justblocked = u8(S.justblocked - 1);
    if (S.gdtimer) S.gdtimer = u8(S.gdtimer - 1);
    if (S.refract) S.refract = u8(S.refract - 1);
    var id = Char.ID;
    if (id === 24) { MouseProg(); return; }
    if (id === 4) { GuardProg(); return; }                        // skeleton: en garde, then a guard
    if (id < 2) { ShadowProg(); return; }
    GuardProg();                                                  // (the vizier on level 13 is a guard too)
  }
  // the skeleton is always en garde
  function SkelProg() { Char.Sword = 2; GuardProg(); }
  function MouseProg() {
    if (Char.Face === 86) return;
    if (Char.Action !== 0) {
      if (Char.X >= 166) return;
      ST.jumpseq(SEQ.Mleave); POP.char.animchar(); return;
    }
    if (Char.X < 200) return;
    POP.top.VanishChar();
  }
  function ShadowProg() {
    var l = S.level;
    if (l === 4) { ShadLevel4(); return; }
    if (l === 5) { ShadLevel5(); return; }
    if (l === 6) { ShadLevel6(); return; }
    if (l === 12) FinalShad();
  }
  function ShadLevel6() {
    if (Char.Scrn !== 1) return;
    if (Kid.Posn !== 43) return;
    if (Kid.X >= 0x80) return;
    DoPress(); DoFwd();
  }
  function ShadLevel5() {
    if (Char.Scrn !== flaskscrn) return;
    if (S.PlayCount === 0) {
      ST.rdblock(flaskscrn, 1, 0);
      if (ST.spec() < 20) return;
      S.PreRecPtr = 0;
    }
    AutoPlayback(ShadProg5);
    if (Char.X >= 15) return;
    POP.top.VanishChar();
  }
  function ShadLevel4() {
    if (Char.Scrn !== 4) return;
    if (Char.X < 80) { POP.top.VanishChar(); return; }
    DoFwd();
  }
  function FinalShad() {
    if (Char.Scrn === swordscrn && S.shadowaction === 0) {
      if (Op.X >= 150) { csps(shadpos12); return; }
      S.shadowaction = 1;
    }
    if (Char.Sword >= 2) {                                        // normal fighting
      if (S.offguard && S.refract === 0) { DoDown(); return; }
      EnGarde(); return;
    }
    var hostile = Op.Sword >= 2 || S.offguard === 0;
    if (hostile) {
      if (S.EnemyAlert >= 2 && ST.getopdist() < swordthres) {
        if (Char.Posn !== 15) return;
        DoEngarde(); return;
      }
      if (!(ST.getopdist() & 0x80)) return;
      DoBack(); return;
    }
    // face to face, swords down
    if (ST.getopdist() & 0x80) {                                  // the kid and the shadow reunite
      S.lightcolor = 0xFF; S.lightning = 10;
      ST.boostmeter();
      POP.top.cuesong(SONG.Rejoin, 85);
      S.mergetimer = 42;
      Char.ID = 0;
      ST.SaveKid();
      POP.top.VanishChar();
      return;
    }
    if (S.EnemyAlert !== 2) return;
    var op = Op.Posn;
    if (op < 3) return;
    if (op < 15) { DoFwd(); return; }
    if (op < 127) return;
    if (op >= 133) return;
    DoFwd();
  }
  function GuardProg() {
    if (Char.ID === 4) Char.Sword = 2;
    if (Char.Sword < 2) { Alert(); return; }
    EnGarde();
  }
  function Alert() {
    if (!(Kid.Life & 0x80)) return;
    var d = ST.getopdist();
    if (Op.BlockY === Char.BlockY && d >= u8(-8)) { eng(); return; }
    if (S.alertguard) {
      S.alertguard = 0;
      if (d < 128) { eng(); return; }
      if (d >= u8(-4)) { ok(d); return; }
      DoTurn(); return;
    }
    ok(d);
    function ok(d) { if (d >= 128) return; eng(); }
    function eng() {
      if (S.EnemyAlert === 0) return;
      if (S.level === 13 && S.SongCue !== 0) return;
      DoEngarde();
    }
  }
  function EnGarde() {
    var p = Char.Posn;
    if (p === 166 || p < 150) return;
    var ea = S.EnemyAlert;
    if (ea < 2) {
      if (ea === 1) return;
      if (S.droppedout) { FollowKid(); return; }
      if (Char.ID === 4) return;
      DoDropguard(); return;
    }
    var d = ST.getopdist();
    if (!(d & 0x80) && d >= 12 && Op.Posn >= 102 && Op.Posn < 118 && Op.Action === 5) return;   // the kid is stunned: let him recover
    d = ST.getopdist();
    if (d >= toofar) {                                             // out of range
      if (S.refract) return;
      if (Char.Face !== Op.Face) {
        var op = Op.Posn;
        if (op >= 7 && op < 15) { if (ST.getopdist() < runthres) DoStrike(); return; }
        if (op >= 34 && op < 44) { if (ST.getopdist() < jumpthres) DoStrike(); return; }
      }
      if (ST.cmpspace(ST.getinfront()) === 0) { DoRetreat(); return; }
      if (ST.cmpspace(ST.get2infront()) === 0) { DoRetreat(); return; }
      DoAdvance(); return;
    }
    if (Char.Sword >= 2) { if (d < tooclose) { tooCloseNow(); return; } InRange(); return; }
    if (d < offguardthres) { tooCloseNow(); return; }
    InRange();
  }
  function tooCloseNow() { if (Char.Face === Op.Face) DoRetreat(); else DoAdvance(); }
  function FollowKid() {
    var a = Op.Action;
    if (a === 2 || a === 6) return;
    var z = ST.getinfront();
    if (ST.cmpbarr(z)) { stopped(); return; }
    if (ST.cmpspace(z) !== 0) { DoAdvance(); return; }
    ST.getinfront();
    S.tempblocky = u8(S.tempblocky + 1);
    z = ST.rdblock1();
    if (z === OBJ.spikes || z === OBJ.loose) { stopped(); return; }
    if (ST.cmpbarr(z)) { stopped(); return; }
    if (ST.cmpspace(z) === 0) { stopped(); return; }
    if (u8(Char.BlockY + 1) !== Op.BlockY) { stopped(); return; }
    DoAdvance();
  }
  function stopped() { S.droppedout = 0; DoRetreat(); }
  function InRange() {
    if (Op.Sword === 2) { GenFight(); return; }
    if (S.refract) return;
    if (ST.getopdist() < strikethres2) { DoStrike(); return; }
    DoAdvance();
  }
  function GenFight() {
    var d = ST.getopdist();
    if (d < blockthres1 || d >= blockthres2) { MaybeAdvance(); return; }
    MaybeBlock();
    if (S.refract) return;
    d = ST.getopdist();
    if (d < strikethres1 || d >= strikethres2) { MaybeAdvance(); return; }
    MaybeStrike();
  }
  function MaybeAdvance() {
    if (S.guardprog !== 0 && S.gdtimer) return;
    var r = rndp();
    if (r.a >= advprob[r.x]) return;
    DoAdvance();
  }
  function MaybeBlock() {
    var op = Op.Posn;
    if (op !== 152 && op !== 153 && op !== 162) return;
    var r = rndp();
    if (S.justblocked) { if (r.a >= impblockprob[r.x]) return; DoBlock(); return; }
    if (r.a < blockprob[r.x]) DoBlock();
  }
  function MaybeStrike() {
    var op = Op.Posn;
    if (op === 169 || op === 151) return;
    var p = Char.Posn, r = rndp();
    if (p === 161 || p === 150) { if (r.a >= restrikeprob[r.x]) return; DoStrike(); return; }
    if (r.a >= strikeprob[r.x]) return;
    DoStrike();
  }
  function DoRelease() { S.clrF = 0; S.clrB = 0; S.clrU = 0; S.clrD = 0; S.clrbtn = 0; S.JSTKX = 0; S.JSTKY = 0; S.btn = 0; }
  function DoAdvance() { S.clrF = 0xFF; S.JSTKX = 0xFF; }
  var DoFwd = DoAdvance;
  function DoRetreat() { S.clrB = 0xFF; S.JSTKX = 1; }
  var DoBack = DoRetreat;
  function DoBlock() { S.clrU = 0xFF; S.JSTKY = 0xFF; }
  var DoUp = DoBlock;
  function DoTurn() { S.clrD = 0xFF; S.JSTKY = 1; }
  var DoDown = DoTurn;
  function DoStandup() { S.clrU = 0xFF; DoBack(); }
  function DoDropguard() { S.clrD = 0xFF; DoBack(); }
  function DoEngarde() { S.clrD = 0xFF; DoFwd(); }
  function DoStrike() { S.clrbtn = 0xFF; S.btn = 0xFF; }
  var DoPress = DoStrike;
  function DoRelBtn() { S.btn = 0; }
  function rndp() { var x = S.guardprog; return { x: x, a: POP.grafix.RND() }; }

  // ---------------------------------------------------------------- sword contact
  function CheckStrike() {
    var p = Kid.Posn;
    if (p === 0) return;
    if (p >= 219 && p < 229) return;
    ST.LoadShadwOp(); TestStrike(); ST.SaveShadwOp();
    ST.LoadKidwOp(); TestStrike(); ST.SaveKidwOp();
  }
  function TestStrike() {
    if (Char.Sword !== 2) return;
    if (Char.BlockY !== Op.BlockY) return;
    var p = Char.Posn;
    if (p !== 153 && p !== 154) return;
    var d = ST.getopdist();
    if (d >= blockrange1 && d < blockrange2) {
      var op = Op.Posn;
      if (op === 161 || op === 150) {
        if (op === 150) Op.Posn = 161;
        if (Char.ID !== 0) S.justblocked = blocktime;
        ST.jumpseq(SEQ.blockedstrike); POP.char.animchar(); return;
      }
    }
    if (Char.Posn !== 154) return;
    d = ST.getopdist();
    if (Op.Sword >= 2) { if (d < strikerange1) return; }
    else if (d < offguardthres) return;
    if (d >= strikerange2) return;
    Op.Action = 99;
  }
  function CheckStab() {
    if (Shad.Action === 99) {
      if (Kid.Action === 99) Kid.Action = 1;                       // a tie goes to the player
      ST.LoadShad(); POP.top.StabChar(); ST.SaveShad();
      var r = rndp(); S.refract = refractimer[r.x];
    }
    if (Kid.Action !== 99) return;
    ST.LoadKid(); POP.top.StabChar(); ST.SaveKid();
  }

  // ---------------------------------------------------------------- the shadow's fixed entrances and scripts
  function chgshadposn(t) {
    Char.Posn = t[0]; Char.X = t[1]; Char.Y = t[2]; Char.Face = t[3]; Char.BlockX = t[4]; Char.BlockY = t[5]; Char.Action = t[6];
    ST.jumpseq(t[7]);
    Char.ID = 1; S.PlayCount = 0;
  }
  function csps(t) { chgshadposn(t); S.guardprog = 3; S.MaxOppStr = shadstrength; S.OppStrength = shadstrength; ST.SaveShad(); }
  function AutoPlayback(prog) {
    if (S.PlayCount >= 254) return;
    S.PlayCount = u8(S.PlayCount + 1);
    var y = S.PreRecPtr, cmd;
    if (S.PlayCount >= prog[y]) { cmd = prog[y + 1]; S.PreRecPtr = u8(y + 2); }
    else cmd = prog[y - 1];
    if (cmd === EndDemo) { POP.top.attractmode(); return; }
    if (cmd === Ctr) DoRelease();
    else if (cmd === Fwd) DoFwd();
    else if (cmd === Back) DoBack();
    else if (cmd === Up) DoUp();
    else if (cmd === Down) DoDown();
    else if (cmd === Upfwd) { DoUp(); DoFwd(); }
    else if (cmd === Press) DoPress();
    else if (cmd === Release) DoRelBtn();
  }

  // ---------------------------------------------------------------- cuts
  function CutCheck() {
    if (S.CUTTIMER) { S.CUTTIMER = u8(S.CUTTIMER - 1); return; }
    ST.LoadKid(); ST.setupchar(); ST.getedges();
    var d = cutchar();
    if (d & 0x80) return;
    cutdir = d;
    ST.SaveKid();
    S.cutscrn = Char.Scrn;
    if (Shad.Face === 86) return;
    if (!(Shad.Life & 0x80)) { updateguard(); return; }
    if (Shad.Sword !== 2) { updateguard(); return; }
    var x = Kid.Scrn;
    if (blue[ST.GdStartBlock - 1 + x] < 30 && blue[ST.GdStartSeqH - 1 + x] === 0) { updateguard(); return; }   // a live guard waits on the new screen
    var transfer;
    if (cutdir === 0) transfer = Shad.X < u8(256 - ST.ScrnWidth - 25);
    else if (cutdir === 1) transfer = Shad.X >= ST.ScrnWidth + 25;
    else if (cutdir === 2) transfer = !!(Shad.BlockY & 0x80);
    else transfer = Shad.BlockY >= 3;
    if (transfer) transferguard(); else updateguard();
  }
  function transferguard() {
    blue[ST.GdStartBlock - 1 + Kid.Scrn] = 0xFF;
    blue[ST.GdStartBlock - 1 + Shad.Scrn] = 0xFF;
    ST.LoadShad(); cut(cutdir); ST.SaveShad();
  }
  function updateguard() {
    if (Shad.Face === 86) return;
    if (Shad.ID === 1 || Shad.ID === 24) return;
    S.tempblockx = 0; S.tempblocky = Shad.BlockY;
    var ix = ST.indexblock(), x = Shad.Scrn;
    blue[ST.GdStartBlock - 1 + x] = ix.y;
    blue[ST.GdStartX - 1 + x] = Shad.X;
    blue[ST.GdStartFace - 1 + x] = Shad.Face;
    blue[ST.GdStartProg - 1 + x] = S.guardprog;
    if (Shad.Life & 0x80) blue[ST.GdStartSeqH - 1 + x] = 0;          // alive: he starts afresh when we come back
    else { blue[ST.GdStartSeqL - 1 + x] = Shad.Seq & 0xFF; blue[ST.GdStartSeqH - 1 + x] = Shad.Seq >> 8; }   // dead: he stays as he fell
    Shad.Face = 86;
    S.OppStrength = 0;
  }
  function CutGuard() {
    if (Shad.Face === 86) return;
    if (Shad.Y < BotCutEdge) return;
    var id = Shad.ID;
    if (id === 1) { if (Shad.Action !== 4) return; ST.LoadShad(); POP.top.VanishChar(); ST.SaveShad(); return; }
    if (id === 4) {
      Shad.Scrn = ST.GETDOWN(Shad.Scrn);
      if (Shad.Scrn === 3) {                                       // the skeleton lands on screen 3
        addsound(SND.Splat);
        Shad.X = 0x85; Shad.BlockY = 1; Shad.Face = 0; Shad.Life = 0xFF;
        updateguard(); return;
      }
    }
    RemoveGd();
  }
  function RemoveGd() {
    POP.top.deadenemy();
    blue[ST.GdStartBlock - 1 + S.VisScrn] = 0xFF;
    Shad.Face = 86; S.OppStrength = 0; S.ChgOppStr = 0xFF;
  }
  // is the character passing off screen?  moves him to the next screen; returns the direction (0-3) or -1
  function cutchar() {
    var y = Char.Y, a = Char.Action;
    if (!(a === 5 || a === 4 || a === 3)) { if (y < TopCutEdgePl || y >= TopCutEdgeMi) return cutgo(2); }
    if (y >= BotCutEdge) return cutdown();
    var x = Char.Posn;
    if (x >= 135 && x < 150) return 0xFF;
    if (x >= 110 && x < 120) return 0xFF;
    if (x >= 150 && x < 163) return 0xFF;
    if (x >= 166 && x < 169) return 0xFF;
    if (Char.Action === 7) return 0xFF;
    if (Char.Face !== 0) {
      var le = S.leftej;
      if (le <= LeftCutEdge) return cutleft();
      if (le >= ST.ScrnRight + 1) return cutright();
      return 0xFF;
    }
    var b = ST.rdblock(Char.Scrn, 9, Char.BlockY);
    if (b !== OBJ.panelwif && b !== OBJ.panelwof) { if (S.rightej >= RightCutEdge) return cutright(); }
    if (S.rightej <= ST.ScrnLeft - 1) return cutleft();
    return 0xFF;
  }
  function cutleft() { mirrmusic(); milestone3(); return cutgo(0); }
  function cutright() { stealsword(); jaffmusic(); return cutgo(1); }
  function cutdown() { if (S.level === 6 && Char.Scrn === 1) return 0xFF; return cutgo(3); }
  function cutgo(d) { cut(d); return d; }
  function milestone3() { if (S.level !== 3) return; if (Char.Scrn !== 7) return; S.milestone = 1; S.origstrength = S.MaxKidStr; }
  function stealsword() { if (S.level !== 12 || Char.Scrn !== 18) return; ST.rdblock(swordscrn, swordx, swordy); ST.settype(OBJ.floor); }
  function jaffmusic() { if (S.level !== 13 || S.exitopen || Char.Scrn !== 3) return; POP.top.cuesong(SONG.Jaffar, 25); }
  function mirrmusic() {
    if (S.exitopen === 0 || S.exitopen === 77) return;
    if (S.level !== 4 || Char.BlockY !== miry || Char.Scrn !== 11) return;
    POP.top.cuesong(SONG.Danger, 50); S.exitopen = 77;
  }
  // move the character to the adjacent screen: 0 left, 1 right, 2 up, 3 down
  function cut(d) {
    if (d === 3) { Char.Scrn = ST.GETDOWN(Char.Scrn); Char.BlockY = u8(Char.BlockY - 3); Char.Y = u8(Char.Y - 189); return; }
    if (d === 1) { Char.Scrn = ST.GETRIGHT(Char.Scrn); Char.X = u8(Char.X - 140); return; }
    if (d === 2) { Char.Scrn = ST.GETUP(Char.Scrn); Char.BlockY = u8(Char.BlockY + 3); Char.Y = u8(Char.Y + 189); return; }
    Char.Scrn = ST.GETLEFT(Char.Scrn); Char.X = u8(140 + Char.X);
  }
  // on a cut to a new screen: bring its guard to life (and the shadow where the story puts him)
  function AddGuard() {
    S.offguard = 0;
    var l = S.level;
    if (l === 12) {
      if (S.exitopen) return;
      if (S.mergetimer !== 0) return;                              // the shadow has been reabsorbed
      if (S.VisScrn !== swordscrn) return;
      Char.Scrn = S.VisScrn;
      if (ST.rdblock(Char.Scrn, swordx, swordy) === OBJ.sword) return;
      S.shadowaction = 0; S.exitopen = 1;
      csps(shadpos12); return;
    }
    if (l === 6) {
      Char.Scrn = S.VisScrn;
      if (S.VisScrn !== 1) { AddNormalGd(); return; }
      if (S.exitopen !== 77) { POP.top.cuesong(SONG.Danger, 50); S.exitopen = 77; }
      csps(shadpos6a); return;
    }
    if (l === 5) {
      Char.Scrn = S.VisScrn;
      if (S.VisScrn !== flaskscrn) { AddNormalGd(); return; }
      if (ST.rdblock(Char.Scrn, flaskx, flasky) !== OBJ.flask) return;
      csps(shadpos5); return;
    }
    AddNormalGd();
  }
  function AddNormalGd() {
    var x = S.VisScrn, gb = blue[ST.GdStartBlock - 1 + x];
    if (gb >= 30) return;
    Char.Scrn = x;
    var ui = ST.unindex(gb);
    Char.BlockY = ui.by;
    Char.Y = u8(FloorY[ui.by + 1]);
    Char.X = blue[ST.GdStartX - 1 + x];
    Char.BlockX = u8(ST.getblockxp(Char.X));
    Char.Face = blue[ST.GdStartFace - 1 + x];
    Char.ID = S.level === 3 ? 4 : 2;
    var hi = blue[ST.GdStartSeqH - 1 + x];
    if (hi === 0) {
      if (Char.ID === 4) { Char.Sword = 2; ST.jumpseq(SEQ.landengarde); }
      else { Char.Sword = 0; ST.jumpseq(SEQ.alertstand); }
    } else Char.Seq = blue[ST.GdStartSeqL - 1 + x] | (hi << 8);
    POP.char.animchar();
    var p = Char.Posn;
    if (p === 185 || p === 177 || p === 178) { Char.Life = 1; S.OppStrength = 0; }
    else { Char.Life = 0xFF; S.alertguard = 0; S.refract = 0; S.justblocked = 0; getgdstrength(); }
    Char.XVel = 0; Char.YVel = 0; Char.Action = 1;
    var prog = blue[ST.GdStartProg - 1 + x]; if (prog >= numprogs) prog = 3;
    S.guardprog = prog;
    S.GuardColor = basiccolor[S.level] ^ specialcolor[prog];
    ST.SaveShad();
  }
  function getgdstrength() { var s = u8(basicstrength[S.level] + extrastrength[S.guardprog]); S.MaxOppStr = s; S.OppStrength = s; }

  return { AutoCtrl: AutoCtrl, CheckStrike: CheckStrike, CheckStab: CheckStab, AutoPlayback: AutoPlayback, CutCheck: CutCheck, CutGuard: CutGuard, AddGuard: AddGuard, cut: cut,
    DoRelease: DoRelease, DoFwd: DoFwd, DoBack: DoBack, DoUp: DoUp, DoDown: DoDown, DoPress: DoPress, DoRelBtn: DoRelBtn, updateguard: updateguard, getgdstrength: getgdstrength };
})();
