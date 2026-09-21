// pop_cut.js — the princess's room: the cut scenes between levels (SUBS.S PlayCut0-8 and their helpers,
// GAMEBG.S's hourglass, sand, stars, torches and post).  A cut is a list of steps that tick() plays one
// frame at a time, so the page can pace it and play the songs; a key or the button skips a step.
var POP = POP || {};
POP.cut = (function () {
  'use strict';
  var ST = POP.state, S = ST.S, Char = ST.Char, Kid = ST.Kid, Shad = ST.Shad, SEQ = ST.SEQ, SONG = ST.SONG, u8 = ST.u8;
  var G = POP.grafix, HR = POP.hires, P = HR.P, BG = POP.bg, CH = POP.char, MV = POP.mover, SO = POP.sound, AU = POP.auto;
  var T = null;                                                        // POP.top, bound at start (it loads after this file)
  var STA = HR.STA, ORA = HR.ORA, AND = HR.AND, EOR = HR.EOR;
  var floorY = 151;
  // the room's fixtures (GAMEBG.S)
  var postx = 31, posty = 152, postimg = 0x0c, starx = 2, stary = [0x62, 0x65, 0x6d, 0x72], stari = [0x2a, 0x2b, 0x2b, 0x2a];
  var glassx = 19, glassy = 151, glassimg = [0x15, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14], sandht = [0, 1, 2, 3, 4, 5, 6, 7];
  var flowx = glassx + 1, flowy = glassy - 2, flowimg = [0x16, 0x17, 0x18];
  var pmaskdx = [0, 0], pmaskdy = [u8(-4), u8(-33)], pmaski = [0x2c, 0x22];
  var ptorchx = [13, 25, 0xFF], ptorchoff = [0, 6], ptorchy = [113, 113], ptorchstate = [1, 6], ptorchcount = 0, psandcount = 0, pstarcount = [0, 0, 0, 0];
  var SceneCount = 0;

  // ---------------------------------------------------------------- direct drawing (the original's "DIRECT HIRES CALL"s)
  function setch6(img) { P.TABLE = G.tables.ch[5]; P.IMAGE = P.TABLE[img - 1]; }
  function psetupflame(x) {                                           // in: XCO/YCO/OFFSET set; out: ready to lay
    if (x >= ST.torchLast + 1) return;
    G.initlay(); P.OPACITY = STA; setch6(BG.ptorchflame[x]);
  }
  function pburn() {
    var x = ptorchcount + 1; if (ptorchx[x] & 0x80) x = 0;
    ptorchcount = x;
    P.XCO = ptorchx[x]; P.OFFSET = ptorchoff[x]; P.YCO = ptorchy[x];
    ptorchstate[x] = MV.getflameframe(ptorchstate[x]);
    psetupflame(ptorchstate[x]);
    HR.lay();
    if (events.burn) events.burn(ptorchx[x], ptorchoff[x], ptorchy[x], ptorchstate[x]);
  }
  function pflow() {
    if (psandcount & 0x80) return;
    var x = psandcount + 1; if (x >= 3) x = 0;
    psandcount = x;
    flow(x, S.GlassState);
  }
  function flow(x, y) {
    if (y >= 8) return;
    G.initlay();
    P.BOTCUT = u8(glassy - sandht[y]);
    P.XCO = flowx; P.OFFSET = 0; P.YCO = flowy; P.OPACITY = STA; setch6(flowimg[x]);
    HR.lay();
    if (events.flow) events.flow(x, flowx, flowy, u8(glassy - sandht[y]));
  }
  function twinkle(x) {
    P.XCO = starx; P.YCO = stary[x]; P.OPACITY = EOR; setch6(stari[x]);
    HR.fastlay(); P.PAGE ^= 0x20; HR.fastlay(); P.PAGE ^= 0x20;
    if (events.twinkle) events.twinkle(x, starx, stary[x]);
  }
  function pstars() {
    for (var x = 3; x >= 0; x--) {
      if (!pstarcount[x]) continue;
      pstarcount[x]--;
      if (!pstarcount[x]) twinkle(x);
    }
    if (G.RND() >= 10) return;
    var len = (G.RND() & 3) + 5; G.RND(); var star = G.RND() & 3;
    pstarcount[star] = len;
    twinkle(star);
  }
  // the post and the hourglass are ordinary list entries: during a cut the stage-2 data (chtable6) sits
  // where bgtable1 lives, so their plain image numbers reach chtable6 through the background table
  function drawpost() { G.addfore(postx, posty, postimg, ORA); if (events.post) events.post(postx, posty); }
  function drawglass(x) { G.addback(glassx, glassy, glassimg[x], STA); if (events.glass) events.glass(x, glassx, glassy); }
  function pmask() {
    var p = Char.Posn, x;
    if (p === 19) x = 0; else if (p === 1 || p === 18) x = 1; else return;
    var c = G.cvtx(ST.fcharx16());
    var yco = u8(S.FCharY + pmaskdy[x]), xco = u8(c.xco + pmaskdx[x]);
    G.addmid(G.UseLayrsave | 0x80, xco, c.offset, yco, pmaski[x], 5, AND, S.FCharFace, S.FCharCU, S.FCharCD, S.FCharCL, S.FCharCR);
  }

  // ---------------------------------------------------------------- the simplified frame (SUBS.S play / DoFast)
  function DoKid() { ST.LoadKid(); if (Char.Posn === 0) return; CH.animchar(); ST.SaveKid(); }
  function DoShad() { ST.LoadShadwOp(); if (Char.Posn === 0) return; CH.animchar(); ST.SaveShad(); }
  function DoFast() {
    G.zerolsts();
    if (S.redrawglass) { S.redrawglass = u8(S.redrawglass - 1); drawglass(S.GlassState); }
    ST.LoadKid();
    if (Char.Posn) { ST.setupchar(); S.FCharIndex = 30; CH.addkidobj(); }
    ST.LoadShad();
    if (Char.Posn) { ST.setupchar(); S.FCharIndex = 30; CH.addkidobj(); pmask(); }
    BG.FAST();
    drawpost();
    pburn(); pburn(); pstars();
    G.drawall();
    pflow();
  }
  function flashon() { if (!S.lightning) return; T.doflashon(S.lightcolor); }
  function flashoff() { if (!S.lightning) return; S.lightning = u8(S.lightning - 1); T.doflashoff(); }
  // one frame of a "play" step: returns false when a key or the button ends the step
  function playFrame() {
    G.RND();
    if (!T.strobe()) return true;
    if (S.level === 0) { if (T.demokeys() & 0x80) T.jump(function () { T.START(1); }); }
    else if ((S.BTN0 | S.BTN1 | S.keypress) & 0x80) return false;
    DoKid(); DoShad();
    flashon();
    DoFast(); T.PageFlip();
    flashoff();
    if (S.soundon) { SO.playback(); SO.zerosound(); }
    return true;
  }

  // ---------------------------------------------------------------- setting the scene
  function initit() {
    S.scrncolor = 0xA0; S.vibes = 0; S.redrawglass = 0; Kid.Posn = 0; Shad.Posn = 0;
    ptorchcount = 0; pstarcount[0] = pstarcount[1] = pstarcount[2] = pstarcount[3] = 0;
    psandcount = 0xFF; S.SPEED = 12;
    G.zeropeels(); ST.zerored(); SO.zerosound();
  }
  function getglass() {
    T.getminleft();
    var m = S.MinLeft;
    if (m < 6) return 7; if (m < 0x11) return 6; if (m < 0x21) return 5; if (m < 0x41) return 4; return 3;
  }
  function addglass(x) { psandcount = 0; addglass1(x); }
  function addglass1(x) { S.GlassState = x; S.redrawglass = 2; }
  function pjumpseq(seq) { ST.LoadShad(); ST.jumpseq(seq); ST.SaveShad(); }
  function vjumpseq(seq) { ST.LoadKid(); ST.jumpseq(seq); ST.SaveKid(); }
  var mjumpseq = vjumpseq, kjumpseq = vjumpseq;
  function startM4() { Char.ID = 24; Char.X = 199; Char.Y = floorY + 1; Char.Face = 0xFF; ST.jumpseq(SEQ.Mscurry); CH.animchar(); }
  function startM8() { startM4(); Char.X = 144; ST.jumpseq(SEQ.Mstop); CH.animchar(); }
  function startP0() { Char.ID = 5; Char.X = 120; Char.Y = floorY; Char.Face = 0xFF; ST.jumpseq(SEQ.Pstand); CH.animchar(); }
  function startP8() { startP0(); Char.X = 130; Char.Y = floorY + 3; ST.jumpseq(SEQ.Pstroke); CH.animchar(); }
  function startP1() { startP0(); Char.Face = 0; }
  function startP4() { startP1(); Char.X = 142; Char.Y = floorY + 3; ST.jumpseq(SEQ.Pstand); CH.animchar(); }
  function startP5() { startP0(); Char.X = 160; }
  function startP2() { startP0(); Char.X = 89; Char.Y = floorY; ST.jumpseq(SEQ.Plie); CH.animchar(); }
  function startP7() { startP0(); Char.X = 136; Char.Y = floorY - 2; ST.jumpseq(S.purpleflag === 1 ? SEQ.Pwaiting : 120); CH.animchar(); }
  function startM7() { startM4(); Char.Y = floorY - 2; }
  function startV0() { Char.ID = 6; Char.X = 197; Char.Y = floorY; Char.Face = 0xFF; ST.jumpseq(SEQ.Vstand); CH.animchar(); }
  function startK7() { Char.ID = 0; Char.X = 198; Char.Y = floorY - 2; Char.Face = 0xFF; ST.jumpseq(SEQ.startrun); CH.animchar(); }

  // ---------------------------------------------------------------- the scripts
  function play(n) { return ['play', n]; }                           // (play 0 is 256 frames, as the original's counter wraps)
  function song(s, x) { return ['songX', s, x]; }                    // PlaySongX: the song, or x frames if sound or music is off
  function songP(s) { return ['songP', s, 0]; }                      // PlaySong: the song (one burn when music is off)
  function songI(s, x) { return ['songI', s, x]; }                   // PlaySongI (the intro): a key starts the game; x frames if music is off
  function call(fn) { return ['call', fn]; }
  var cuts = {
    0: function () { return [
      call(function () { startV0(); ST.SaveKid(); startP0(); ST.SaveShad(); }), play(2), songI(SONG.Princess, 8), play(5),
      call(function () { pjumpseq(SEQ.Palert); }), play(9), songI(SONG.Squeek, 0), call(function () { S.SPEED = 7; }), play(5),
      call(function () { vjumpseq(SEQ.Vapproach); }), play(6), call(function () { vjumpseq(SEQ.Vstop); }), play(4), songI(SONG.Vizier, 12), play(4),
      call(function () { vjumpseq(SEQ.Vapproach); }), play(30), call(function () { vjumpseq(SEQ.Vstop); }), play(4), songI(SONG.Buildup, 25),
      call(function () { vjumpseq(SEQ.Vraise); }), play(1), call(function () { pjumpseq(SEQ.Pback); }), play(13),
      call(function () { addglass1(0); S.lightning = 5; S.lightcolor = 0xFF; S.SPEED = 12; }), play(5),
      call(function () { psandcount = 0; }), songI(SONG.Magic, 8), call(function () { S.SPEED = 7; vjumpseq(SEQ.Vexit); }), play(17),
      call(function () { addglass1(1); }), play(12), call(function () { pjumpseq(SEQ.Pslump); }), play(28),
      call(function () { S.SPEED = 12; }), songI(SONG.StTimer, 20)]; },
    1: function () { return [call(function () { addglass(getglass()); startP1(); ST.SaveShad(); }), play(2), song(SONG.Timer, 50)]; },
    2: function () { return [call(function () { addglass(getglass()); startP2(); ST.SaveShad(); }), play(2), song(SONG.Heartbeat, 50)]; },
    4: function () { return [call(function () { addglass(getglass()); startP4(); ST.SaveShad(); startM4(); ST.SaveKid(); }), play(5),
      call(function () { pjumpseq(SEQ.Pcrouch); }), play(9), call(function () { mjumpseq(SEQ.Mraise); }), play(58)]; },
    5: function () {
      if (getglass() < 7) return cuts[1]();
      return [call(function () { addglass(getglass()); startP5(); ST.SaveShad(); }), play(2), song(SONG.Heartbeat, 50),
        call(function () { pjumpseq(SEQ.Palert); }), play(12), song(SONG.Danger, 20)];
    },
    6: function () { return [call(function () { S.SPEED = 22; addglass(8); }), play(2), songP(SONG.Tragic), play(100)]; },
    7: function () { return [call(function () { S.SPEED = 8; S.soundon = 1; S.musicon = 1; startP7(); ST.SaveShad(); }), play(8),
      call(function () { startK7(); ST.SaveKid(); }), play(8), call(function () { pjumpseq(SEQ.Pembrace); }), play(5),
      call(function () { vjumpseq(SEQ.runstop); }), play(2), call(function () { Kid.Posn = 0; }), play(9), songP(SONG.Embrace),
      call(function () { startM7(); ST.SaveKid(); }), play(12), call(function () { mjumpseq(SEQ.Mclimb); }), play(30)]; },
    8: function () { return [call(function () { addglass(getglass()); startP8(); ST.SaveShad(); startM8(); ST.SaveKid(); }), play(20),
      call(function () { mjumpseq(SEQ.Mleave); }), play(20), call(function () { pjumpseq(SEQ.Prise); }), play(20),
      call(function () { Kid.Posn = 0; }), song(SONG.Heartbeat, 50)]; }
  };
  cuts[3] = cuts[1];

  // ---------------------------------------------------------------- running a cut
  var run = null;                                                      // { steps, i, frames, song: {ticks, left, perTick}, done }
  var events = { song: null };                                          // song(set, number, seconds): the page plays it; the room's fixtures for another renderer
  function start(n, done) {
    T = POP.top;
    initit();
    run = { steps: cuts[n](), i: 0, frames: 0, song: null, done: done };
  }
  function finish() { var d = run.done; run = null; S.SPEED = 1; if (d) d(); }
  // one frame of the cut; returns true while the cut goes on
  function tick() {
    if (!run) return false;
    for (var guard = 0; guard < 64; guard++) {
      if (run.i >= run.steps.length) { finish(); return false; }
      var st = run.steps[run.i], kind = st[0];
      if (kind === 'call') { st[1](); run.i++; continue; }
      if (kind === 'play') {
        if (run.frames === 0) run.frames = st[1] || 256;
        var go = playFrame();
        run.frames--;
        if (!go || run.frames === 0) { run.frames = 0; run.i++; }
        return true;
      }
      // a song: the loop of the original's PlaySong, spread over the page's frames
      var set = kind === 'songI' ? 'title' : 'game', s = st[1], x = st[2];
      if (!(S.soundon & S.musicon)) {                                    // no music
        if (kind === 'songP') { P.PAGE ^= 0x20; pburn(); pstars(); pflow(); P.PAGE ^= 0x20; run.i++; continue; }   // one turn of the loop
        if (kind === 'songI' && x === 0) { run.i++; continue; }
        run.steps[run.i] = play(x); continue;                            // the frames instead
      }
      if (!run.song) {
        // the recordings: in the princess's room the tunes run slower than in the game, as the burn is drawn between the notes
        var au = POP.audio || {}, rset = set;
        if (set === 'game' && au.ticks && au.ticks.cut && au.ticks.cut[s] !== undefined) rset = 'cut';
        var ticks = (au.ticks && au.ticks[rset] && au.ticks[rset][s]) || 1, secs = (au.seconds && au.seconds[rset] && au.seconds[rset][s]) || 3;
        var perTick = Math.max(1, Math.round(ticks / (secs * 11)));
        run.song = { left: ticks, perTick: perTick };
        P.PAGE ^= 0x20;
        if (events.song) events.song(rset, s, secs, Math.ceil(ticks / perTick));
      }
      // the strobe and the interrupt check, once per page frame
      var stop = false;
      if (T.strobe()) {
        if (S.level === 0 && kind === 'songI') { if (T.demokeys() & 0x80) { P.PAGE ^= 0x20; run = null; T.jump(function () { T.START(1); }); } }
        else if (kind !== 'songI' && ((S.BTN0 | S.BTN1 | S.keypress) & 0x80)) stop = true;
      }
      for (var k = 0; k < run.song.perTick && run.song.left > 0 && !stop; k++) { pburn(); pstars(); pflow(); run.song.left--; }
      if (stop || run.song.left <= 0) { P.PAGE ^= 0x20; run.song = null; run.i++; if (events.songEnd) events.songEnd(); }
      return true;
    }
    return true;
  }
  function running() { return !!run; }

  return { start: start, tick: tick, running: running, events: events, initit: initit, getglass: getglass, pburn: pburn, pstars: pstars, pflow: pflow, twinkle: twinkle, DoFast: DoFast };
})();
