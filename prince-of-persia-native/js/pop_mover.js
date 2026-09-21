// pop_mover.js — MOVER.S: the transitional objects (gates, pressure plates, spikes, slicers, loose
// floors, torches, flasks, the exit) and the moving objects (falling floors).  trloc/trscrn/trdirec
// and the mob arrays keep the original's layout: entry 0 is the working copy, 1..n the list.
var POP = POP || {};
POP.mover = (function () {
  'use strict';
  var ST = POP.state, S = ST.S, Char = ST.Char, Kid = ST.Kid, OBJ = ST.OBJ, SEQ = ST.SEQ, SND = ST.SND, SONG = ST.SONG, u8 = ST.u8, s8 = ST.s8;
  var blue = ST.blue, LINKLOC = ST.LINKLOC, LINKMAP = ST.LINKMAP, BlockBot = ST.BlockBot, BlockAy = ST.BlockAy, FloorY = ST.FloorY;
  var addsound = function (n) { POP.sound.addsound(n); };
  var gatevel = [0, 0, 0, 20, 40, 60, 80, 100, 120], maxgatevel = gatevel.length - 1;
  var pptimer = 5, spiketimer = 15 + 128, slicetimer = 15, gatetimer = ST.gmaxval + 50, loosetimer = ST.Ffalling;
  var wiggletime = 4, FFaccel = 3, FFtermvel = 29, crumbletime = 2, disappeartime = 2, FFheight = 17, CrushDist = 30;
  var loosewipe = 31, spikewipe = 31, slicerwipe = 63, platewipe = 16;
  var gateinc = [0xFF, 4, 4], exitinc = 4, emaxval = 43 * 4;
  var maxtr = 0x20 - 1, maxmob = 0x10 - 1;
  var state = 0, temp1 = 0, linkindex = 0, pptype = 0, mobframe = 0, underFF = 0;
  var trloc = S.trloc, trscrn = S.trscrn, trdirec = S.trdirec;
  var mobx = S.mobx, moby = S.moby, mobscrn = S.mobscrn, mobvel = S.mobvel, mobtype = S.mobtype, moblevel = S.moblevel;

  // ---------------------------------------------------------------- the trans list
  function searchtrob() {
    for (var x = S.numtrans; x > 0; x--) if (trloc[x] === trloc[0] && trscrn[x] === trscrn[0]) return x;
    return 0;
  }
  function addtrob() {
    var x = searchtrob();
    if (x) { trdirec[x] = trdirec[0]; return; }
    x = S.numtrans;
    if (x === maxtr) return;
    x++; S.numtrans = x;
    trdirec[x] = trdirec[0]; trloc[x] = trloc[0]; trscrn[x] = trscrn[0];
  }
  function addamob() {
    var x = S.nummob;
    if (x === maxmob) return;
    x++; S.nummob = x;
    savemob(x);
  }
  function savemob(x) { mobx[x] = mobx[0]; moby[x] = moby[0]; mobscrn[x] = mobscrn[0]; mobvel[x] = mobvel[0]; mobtype[x] = mobtype[0]; moblevel[x] = moblevel[0]; }
  function loadmob(x) { mobx[0] = mobx[x]; moby[0] = moby[x]; mobscrn[0] = mobscrn[x]; mobvel[0] = mobvel[x]; mobtype[0] = mobtype[x]; moblevel[0] = moblevel[x]; }

  // ---------------------------------------------------------------- triggers (in: rdblock results)
  function trigslicer(a) {
    state = a;
    var sp = ST.spec();
    if (sp !== 0 && sp < ST.slicerRet) return;
    trloc[0] = S.rdY; ST.setspec(state); trscrn[0] = S.VisScrn; trdirec[0] = 1;
    addtrob();
  }
  function closeexit(a) {                              // in: a = screen, rdY = block
    trloc[0] = S.rdY; trscrn[0] = a;
    ST.setspec(emaxval); trdirec[0] = 3;
    addtrob();
  }
  function smashmirror() { ST.setspec(86); }
  function trigflask(a) {
    trloc[0] = S.rdY; trscrn[0] = a; trdirec[0] = 1;
    ST.setspec((POP.grafix.RND() & 7) | ST.spec());
    addtrob();
  }
  function trigsword(a) {
    trloc[0] = S.rdY; trscrn[0] = a; trdirec[0] = 1;
    ST.setspec(POP.grafix.RND() & 0x1F);
    addtrob();
  }
  function trigtorch(a) {
    trloc[0] = S.rdY; trscrn[0] = a; trdirec[0] = 1;
    ST.setspec(POP.grafix.RND() & 0x0F);
    addtrob();
  }
  function trigspikes() {
    var sp = ST.spec();
    if (sp === 0) { spikecont(1); return; }
    if (!(sp & 0x80)) return;
    if (sp === 0xFF) return;
    ST.setspec(spiketimer);
  }
  function spikecont(dir) {
    trdirec[0] = dir; trloc[0] = S.rdY; trscrn[0] = S.tempscrn; Y = S.rdY;
    addtrob(); redspikes();
    addsound(SND.GateDown);
  }
  function jamspikes() { ST.setspec(0xFF); spikecont(0xFF); }
  // 0 = safe, 1 = sprung, 2 = springing
  function getspikes() {
    var sp = ST.spec();
    if (sp & 0x80) return sp === 0xFF ? 0 : 1;
    if (sp === 0) return 0;
    if (sp < ST.spikeExt) return 2;
    return 0;
  }
  function breakloose() { breakloose1(1); }
  function breakloose1(a) {
    state = a;
    if (blue[S.BlueType + S.rdY] & ST.reqmask) return;
    var sp = ST.spec();
    if (!(sp & 0x80) && sp !== 0) return;
    ST.setspec(state);
    trloc[0] = S.rdY; trscrn[0] = S.tempscrn; trdirec[0] = 0; Y = S.rdY;
    addtrob(); redloose();
  }
  function pushpp() { pptype = blue[S.BlueType + S.rdY] & ST.idmask; pushpp1(); }
  function pushpp1() {
    linkindex = ST.spec();
    var t = gettimer(linkindex);
    if (t === 31) return;
    if (t >= 2) { chgtimer(linkindex, pptimer); trigger(); return; }
    chgtimer(linkindex, pptimer);
    trloc[0] = S.rdY; trscrn[0] = S.tempscrn; trdirec[0] = 1; Y = S.rdY;
    addtrob(); redplate();
    S.alertguard = 1; addsound(SND.PlateDown);
    trigger();
  }
  function jampp() {
    pptype = blue[S.BlueType + S.rdY] & ST.idmask;
    if (pptype === OBJ.pressplate) { ST.settype(OBJ.dpressplate); pushpp1(); return; }
    ST.settype(OBJ.floor); ST.setspec(0); pptype = OBJ.rubble; pushpp1();
  }
  function trigger() {
    for (;;) {
      var x = linkindex;
      if (blue[LINKLOC + x] === 0xFF) return;
      trloc[0] = getloc(x);
      trscrn[0] = getscrn(x);
      ST.calcblue(trscrn[0]);
      var y = trloc[0];
      S.rdY = y;
      var id = blue[S.BlueType + y] & ST.idmask;
      trigobj(id);
      if (!(trdirec[0] & 0x80)) addtrob();
      x = linkindex; linkindex = u8(linkindex + 1);
      if (getlastflag(x)) return;
    }
  }
  function trigobj(id) {
    if (id === OBJ.gate) { triggate(); return; }
    if (id === OBJ.exit) { openexit(); return; }
  }
  function openexit() { if (ST.spec() !== 0) { trdirec[0] = 0xFF; return; } trdirec[0] = 1; }
  function triggate() {
    var pos = ST.spec(), x = pptype;
    if (x === OBJ.upressplate) {                       // raise
      trdirec[0] = 1;
      if (pos === 0xFF) { stopobj(); return; }
      if (pos < ST.gmaxval) return;
      ST.setspec(gatetimer); stopobj(); return;
    }
    if (x === OBJ.rubble) {                            // open and jam
      trdirec[0] = 2;
      if (pos < ST.gmaxval) return;
      ST.setspec(0xFF); stopobj(); return;
    }
    if (pos === ST.gminval) { stopobj(); return; }      // lower
    trdirec[0] = 3;
  }

  // ---------------------------------------------------------------- ANIMTRANS
  function animtrans() {
    S.trobcount = 0;
    var n = S.numtrans; if (!n) return;
    var clean = false;
    for (var x = n; x > 0; x--) {
      S.tempnt = x;
      animobj(x);
      x = S.tempnt;
      if (trdirec[0] & 0x80) { trdirec[x] = 0xFF; clean = true; }
      else trdirec[x] = trdirec[0];
    }
    if (!clean) return;
    var y = 0;
    for (x = 1; x <= S.numtrans; x++) {
      if (trdirec[x] === 0xFF) continue;
      y++; trdirec[y] = trdirec[x]; trloc[y] = trloc[x]; trscrn[y] = trscrn[x];
    }
    S.numtrans = y;
  }
  function animobj(x) {
    trloc[0] = trloc[x]; trscrn[0] = trscrn[x]; trdirec[0] = trdirec[x];
    ST.calcblue(trscrn[0]);
    var y = trloc[0]; S.rdY = y; Y = y;
    state = blue[S.BlueSpec + y];
    var id = blue[S.BlueType + y] & ST.idmask;
    if (id === OBJ.torch) animtorch();
    else if (id === OBJ.upressplate || id === OBJ.pressplate) animplate();
    else if (id === OBJ.spikes) animspikes();
    else if (id === OBJ.loose) animfloor();
    else if (id === OBJ.space) animspace();
    else if (id === OBJ.slicer) animslicer();
    else if (id === OBJ.gate) animgate();
    else if (id === OBJ.exit) animexit();
    else if (id === OBJ.flask) animflask();
    else if (id === OBJ.sword) animsword();
    else stopobj();
    blue[S.BlueSpec + trloc[0]] = state;               // (BlueSpec),y as the original left it (mirappear can have moved it: kept as is)
  }
  function animexit() {
    var x = trdirec[0];
    if (x & 0x80) { redexit(); return; }
    if (x >= 3) {                                      // coming down fast
      if (x < maxgatevel) { x++; trdirec[0] = x; }
      var before = state; state = u8(before - gatevel[x]);
      if (state === 0 || before >= gatevel[x]) { redexit(); return; }
      stopobj(); state = 0; addsound(SND.GateSlam); redexit(); return;
    }
    addsound(SND.RaisingExit);
    state = u8(state + exitinc);
    if (state < emaxval) { redexit(); return; }
    stopobj();
    addsound(SND.GateDown);
    POP.top.cuesong(SONG.Stairs, 15);
    S.exitopen = 1;
    POP.top.mirappear(); if (S.level === 4) Y = 4;   // mirappear's rdblock leaves Y at the mirror's block
    redexit();
  }
  function animgate() {
    var x = trdirec[0];
    if (x & 0x80) { redgate(); return; }
    if (x >= 3) { gatedownfast(x); return; }
    if (state === 0xFF) { gatestop(); return; }
    state = u8(state + gateinc[x]);
    if (x === 0) {
      if (state === ST.gminval || state < ST.gminval) { gatestop(); return; }
      if (state < ST.gmaxval) POP.top.addlowersound();
      redgate(); return;
    }
    if (state >= ST.gmaxval) {
      if (x >= 2) { state = 0xFF; gatestop(); return; }
      state = gatetimer; trdirec[0] = 0; return;
    }
    addsound(SND.RaisingGate);
    redgate();
  }
  function gatestop() { stopobj(); addsound(SND.GateDown); redgate(); }
  function gatedownfast(x) {
    if (x < maxgatevel) { x++; trdirec[0] = x; }
    var before = state;
    state = u8(before - gatevel[x]);
    if (state === 0 || before >= gatevel[x]) { redgate(); return; }
    state = 0; stopobj(); addsound(SND.GateSlam); redgate();
  }
  function animplate() {
    if (trdirec[0] & 0x80) return;
    var x = state, t = u8(gettimer(x) - 1);
    chgtimer(x, t);
    if (t >= 2) return;
    addsound(SND.PlateUp);
    stopobj();
    redplate();
  }
  function animslicer() {
    if (!(trdirec[0] & 0x80)) {
      var hi = state & 0x80, f = u8((state & 0x7F) + 1);
      if (f >= slicetimer + 1) f = 1;
      state = hi | f;
      if ((state & 0x7F) === ST.slicerExt) addsound(SND.JawsClash);
      var purge = true;
      if (trscrn[0] === S.VisScrn) {
        var ui = ST.unindex(trloc[0]);
        if (ui.by === Kid.BlockY) {
          if (Kid.Life & 0x80) purge = false;                // the kid is alive: leave it running
          else if (state & 0x80) purge = false;              // dead: stop all unbloodied slicers (the bloodied one goes on)
        }
      }
      if (purge) { if ((state & 0x7F) >= ST.slicerRet) stopobj(); }
    }
    if ((state & 0x7F) >= ST.slicerRet) return;
    redslicer();
  }
  function animflask() {
    if (trdirec[0] & 0x80) return;
    if (trscrn[0] !== S.VisScrn) { stopobj(); return; }
    temp1 = state & 0xE0;
    state = getflaskframe(state & 0x1F) | temp1;
    redflask();
  }
  function animsword() {
    if (trscrn[0] !== S.VisScrn) { stopobj(); return; }
    state = u8(state - 1);
    if (state === 0) state = u8((POP.grafix.RND() & 0x3F) + 40);
    redsword();
  }
  function animtorch() {
    if (trdirec[0] & 0x80) return;
    if (trscrn[0] !== S.VisScrn) { stopobj(); return; }
    state = getflameframe(state);
    redtorch();
  }
  function getflameframe(a) {
    var st = a, r = POP.grafix.RND();
    if (r !== st && r < ST.torchLast + 1) return r;
    st = u8(st + 1);
    if (st < ST.torchLast + 1) return st;
    return 0;
  }
  function getflaskframe(a) { a = u8(a + 1); return a < ST.bubbLast + 1 ? a : 1; }
  function animspikes() {
    if (trdirec[0] & 0x80) { redspikes(); return; }
    if (state & 0x80) {
      state = u8(state - 1);
      if (state & 0x7F) return;
      state = ST.spikeExt + 1; redspikes(); return;
    }
    var a = state; state = u8(state + 1);
    if (a === ST.spikeExt) { state = spiketimer; redspikes(); return; }
    if (a !== ST.spikeRet) { redspikes(); return; }
    state = 0; stopobj(); redspikes();
  }
  function animfloor() {
    if (trdirec[0] & 0x80) { redloose(); return; }
    state = u8(state + 1);
    if (state & 0x80) {                                // wiggling
      if (S.level === 13) return;
      if (state < wiggletime + 0x80) { redloose(); return; }
      state = 0; stopobj(); redloose(); return;
    }
    if (state < loosetimer) { redloose(); return; }
    state = makespace();
    stopobj();
    var ui = ST.unindex(trloc[0]);
    mobx[0] = u8(ui.bx << 2); moblevel[0] = ui.by;
    moby[0] = u8(BlockBot[ui.by + 1]);
    mobscrn[0] = trscrn[0]; mobvel[0] = 0; mobtype[0] = 0;
    addamob();
    redloose();
  }
  function animspace() { stopobj(); redloose(); }
  function stopobj() { trdirec[0] = 0xFF; }

  // ---------------------------------------------------------------- redraw marks for the object at (trscrn, trloc)
  function redtrobj() {
    var ix = check(); ST.markred(ix, 2); ST.markwipe(ix, 2);
    ix = checkright(); ST.markred(ix, 2); ST.markwipe(ix, 2);
  }
  function redexit() { ST.markmove(checkright(), 2); }
  function redtorch() { ST.markmove(checkright(), 2); }
  function redsword() { ST.markmove(check(), 2); }
  function redflask() { ST.markmove(check(), 2); }
  function redloose() { S.trobcount = u8(S.trobcount + 1); S.height = loosewipe; redtrobj(); }
  function redgate() {
    var ix = checkright(); ST.markmove(ix, 2); ST.markfred(ix, 2);
    ST.markmove(checkabover(), 2);
  }
  function redspikes() { S.trobcount = u8(S.trobcount + 1); S.height = spikewipe; redtrobj(); }
  function redslicer() { S.trobcount = u8(S.trobcount + 1); S.height = slicerwipe; var ix = check(); ST.markred(ix, 2); ST.markwipe(ix, 2); }
  function redplate() { S.height = platewipe; redtrobj(); }
  // The checks below return the original's Y register and carry; when a check fails on a screen it does
  // not know, Y is left as it was (the original's leftover register) and the carry is the last compare's.
  var Y = 0;
  function no() { Y = 30; return { y: 30, cs: true }; }
  function above(scrn) { if (scrn !== S.scrnAbove) return { y: Y, cs: scrn >= S.scrnAbove }; Y = u8(trloc[0] - 20); return { y: Y, cs: true }; }
  function check() {
    var scrn = trscrn[0];
    if (scrn !== S.VisScrn) return above(scrn);
    Y = trloc[0]; return { y: Y, cs: Y >= 30 };
  }
  function checkleft() {
    var scrn = trscrn[0];
    if (scrn === S.VisScrn) { Y = trloc[0]; if (Y === 0 || Y === 10 || Y === 20) return no(); Y = u8(Y - 1); return { y: Y, cs: false }; }
    if (scrn !== S.scrnRight) return above(scrn);
    Y = u8(trloc[0] + 9); return { y: Y, cs: false };
  }
  function checkright() {
    var scrn = trscrn[0];
    if (scrn === S.VisScrn) { Y = trloc[0]; if (Y === 9 || Y === 19 || Y === 29) return no(); Y = u8(Y + 1); return { y: Y, cs: false }; }
    if (scrn !== S.scrnLeft) return above(scrn);
    Y = trloc[0];
    if (Y === 9 || Y === 19 || Y === 29) { Y = u8(Y - 9); return { y: Y, cs: false }; }
    return no();
  }
  function checkabover() {
    var scrn = trscrn[0];
    if (scrn === S.VisScrn) {
      Y = trloc[0];
      if (Y < 10) { Y = u8(Y + 1); return { y: Y, cs: true }; }
      if (Y === 19 || Y === 29) return no();
      Y = u8(Y - 9); return { y: Y, cs: false };
    }
    if (scrn === S.scrnLeft) {
      Y = trloc[0];
      if (Y === 9) { Y = 0; return { y: 0, cs: true }; }
      if (Y === 19 || Y === 29) { Y = u8(Y - 19); return { y: Y, cs: false }; }
      return no();
    }
    if (scrn === S.scrnBelow) { Y = trloc[0]; if (Y >= 9) return no(); Y = u8(Y + 21); return { y: Y, cs: false }; }
    if (scrn === S.scrnBelowL) { Y = trloc[0]; if (Y !== 9) return no(); Y = 20; return { y: 20, cs: false }; }
    return { y: Y, cs: scrn >= S.scrnBelowL };
  }

  // ---------------------------------------------------------------- LINKLOC / LINKMAP
  function gettimer(x) { return blue[LINKMAP + x] & 0x1F; }
  function chgtimer(x, a) { blue[LINKMAP + x] = (blue[LINKMAP + x] & 0xE0) | (a & 0x1F); }
  function getloc(x) { return blue[LINKLOC + x] & 0x1F; }
  function getlastflag(x) { return blue[LINKLOC + x] & 0x80; }
  function getscrn(x) { var lo = (blue[LINKLOC + x] & 0x60) >> 2; return u8((blue[LINKMAP + x] & 0xE0) + lo) >> 3; }

  // ---------------------------------------------------------------- MOBs
  function animmobs() {
    var n = S.nummob; if (!n) return;
    for (var x = n; x > 0; x--) {
      S.tempnt = x; loadmob(x);
      animmob();
      checkcrush();
      x = S.tempnt; savemob(x);
    }
    var y = 0;
    for (x = 1; x <= S.nummob; x++) {
      if (mobvel[x] === 0xFF) continue;
      y++; mobvel[y] = mobvel[x]; mobx[y] = mobx[x]; moby[y] = moby[x]; mobscrn[y] = mobscrn[x]; mobtype[y] = mobtype[x]; moblevel[y] = moblevel[x];
    }
    S.nummob = y;
  }
  function animmob() {
    if (mobtype[0] === 0) mobfloor();
    if (mobvel[0] & 0x80) mobvel[0] = u8(mobvel[0] + 1);
  }
  function mobfloor() {
    var v = mobvel[0];
    if (v & 0x80) return;
    if (v < FFtermvel) { v = u8(v + FFaccel); mobvel[0] = v; }
    var y = u8(v + moby[0]); moby[0] = y;
    if (mobscrn[0] === 0) { if (moby[0] >= 192 + 17) mobvel[0] = u8(-disappeartime); return; }
    if (y >= u8(-30)) return;
    var lv = moblevel[0];
    if (y < u8(BlockAy[lv + 1])) return;
    S.tempblocky = lv; S.tempblockx = mobx[0] >> 2; S.tempscrn = mobscrn[0];
    var a = ST.rdblock1(); underFF = a;
    if (a === OBJ.space) { passthru(); return; }
    if (a === OBJ.loose) { knockloose(); passthru(); return; }
    addsound(SND.LooseCrash);
    S.tempscrn = mobscrn[0]; S.tempblocky = moblevel[0];
    shakem1();
    moby[0] = u8(BlockAy[moblevel[0] + 1]);
    mobvel[0] = u8(-crumbletime);
    makerubble();
  }
  function knockloose() {
    ST.setspec(makespace());
    mobvel[0] = mobvel[0] >> 1;
    savemob(S.tempnt);
    moby[0] = u8(moby[0] + 6);
    passthru();
    addamob();
    loadmob(S.tempnt);
    markmob();
  }
  function makespace() { ST.settype(OBJ.space); return S.BGset1 === 1 ? 1 : 0; }
  function passthru() {
    moblevel[0] = u8(moblevel[0] + 1);
    if (moblevel[0] < 3) return;
    moby[0] = u8(moby[0] - 192);
    moblevel[0] = 0;
    mobscrn[0] = ST.GETDOWN(mobscrn[0]);
  }
  function makerubble() {
    S.tempblocky = moblevel[0]; S.tempblockx = mobx[0] >> 2; S.tempscrn = mobscrn[0];
    var a = ST.rdblock1();
    if (a === OBJ.pressplate) { pushpp(); ST.rdblock1(); }
    else if (a === OBJ.upressplate) { ST.settype(OBJ.rubble); pushpp(); ST.rdblock1(); }
    else if (!(a === OBJ.floor || a === OBJ.spikes || a === OBJ.flask || a === OBJ.torch)) return;
    ST.settype(OBJ.rubble);
    markmob();
  }
  function markmob() {
    if (mobscrn[0] !== S.VisScrn) return;
    S.height = loosewipe;
    var ix = ST.indexblock(); ST.markred(ix, 2); ST.markwipe(ix, 2);
    S.tempblockx = u8(S.tempblockx + 1);
    ix = ST.indexblock(); ST.markred(ix, 2); ST.markfred(ix, 2); ST.markwipe(ix, 2);
  }
  function checkcrush() {
    ST.LoadKid();
    if (chcrush1()) crushchar();
    ST.SaveKid();
  }
  function chcrush1() {
    if (mobscrn[0] !== Char.Scrn) return false;
    if ((mobx[0] >> 2) !== Char.BlockX) return false;
    if (moby[0] >= Char.Y) return false;
    if (u8(Char.Y - CrushDist) >= moby[0]) return false;
    return true;
  }
  function crushchar() {
    if (S.level !== 13) { var p = Char.Posn; if (p >= 5 && p < 15) return; }
    var a = Char.Action;
    if (!(a < 2 || a === 7)) return;
    Char.Y = u8(FloorY[u8(Char.BlockY + 1)]);
    if (POP.top.decstr(1) === 0) { ST.jumpseq(SEQ.hardland); return; }
    if (Char.Posn === 109) return;
    ST.jumpseq(SEQ.crush);
  }
  function addmobs() {
    var n = S.nummob; if (!n) return;
    for (var x = n; x > 0; x--) {
      S.tempnt = x; loadmob(x);
      if (mobtype[0] === 0) ATM();
      x = S.tempnt;
    }
  }
  function ATM() {
    if (mobscrn[0] === S.VisScrn) { if (moby[0] >= 192 + 17) return; }
    else {
      if (mobscrn[0] !== S.scrnBelow) return;
      if (moby[0] < u8(-17) && moby[0] >= 17) return;
      moby[0] = u8(moby[0] + 192);
    }
    S.tempblocky = ST.getblocky(moby[0]);
    S.tempblockx = mobx[0] >> 2;
    S.FCharIndex = ST.indexblock().y;
    S.tempblockx = u8(S.tempblockx + 1);
    var ix = ST.indexblock(); ST.markfloor(ix, 2); ST.markfred(ix, 2);
    var top = ST.getblocky(u8(moby[0] - FFheight));
    if (top !== S.tempblocky) { S.tempblocky = top; ix = ST.indexblock(); ST.markfloor(ix, 2); ST.markfred(ix, 2); }
    mobframe = ST.Ffalling;
    POP.bg.addmobobj(mobx[0], moby[0], mobtype[0], mobframe);
  }
  // shake the loose floors on a row: in a = blocky (on VisScrn)
  function shakem(a) {
    if (S.level === 13) return;
    S.tempblocky = a; S.tempscrn = S.VisScrn;
    shakem1();
  }
  function shakem1() {
    for (var x = 9; x >= 0; x--) {
      S.tempblockx = x;
      if (ST.rdblock1() === OBJ.loose) shakeit();
    }
  }
  function shakeit() {
    var sp = ST.spec();
    if (sp & 0x80) return;
    if (sp !== 0) return;
    ST.setspec(0x80);
    trloc[0] = S.rdY; trscrn[0] = S.tempscrn; trdirec[0] = 1;
    addtrob();
  }

  return { animtrans: animtrans, trigspikes: trigspikes, pushpp: pushpp, breakloose1: breakloose1, breakloose: breakloose, animmobs: animmobs, addmobs: addmobs,
    closeexit: closeexit, getspikes: getspikes, shakem: shakem, trigslicer: trigslicer, trigtorch: trigtorch, getflameframe: getflameframe, smashmirror: smashmirror,
    jamspikes: jamspikes, trigflask: trigflask, getflaskframe: getflaskframe, trigsword: trigsword, jampp: jampp, addtrob: addtrob, stopobj: stopobj, searchtrob: searchtrob };
})();
