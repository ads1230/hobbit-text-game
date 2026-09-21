// pop_bg.js — FRAMEADV.S and GAMEBG.S: assembling the image lists for a screen, whole (SURE) or
// only the blocks the redraw buffers mark (FAST), the pieces of each block (A, B, C, D sections,
// fronts, the moving parts of gates, spikes, slicers, loose floors, torches, flasks), the objects
// drawn among them, the strength meters and the messages.
var POP = POP || {};
POP.bg = (function () {
  'use strict';
  var ST = POP.state, S = ST.S, G = POP.grafix, L = G.L, HR = POP.hires, u8 = ST.u8, s8 = ST.s8, OBJ = ST.OBJ, BG = ST.BG, blue = ST.blue, Char = ST.Char;
  var AND = HR.AND, ORA = HR.ORA, STA = HR.STA, EOR = HR.EOR, MASK = HR.MASK;
  var maxobj = 20;

  // frameadv locals
  var rowno = 0, colno = 0, yindex = 0, objid = 0, state = 0, Ay = 0, Dy = 0, gateposn = 0, gatebot = 0, blockxco = 0, blockthr = 0;
  var XCO = 0, YCO = 0, IMAGE = 0, OPACITY = 0;                 // the parameter block as FRAMEADV sees it
  var addfn = null;                                          // "add" is self-modified: addback or addmidez(fastlay)
  function setback() { addfn = function () { G.addback(XCO, YCO, IMAGE, OPACITY); }; }
  function setmid() { addfn = function () { G.addmidez(G.UseFastlay, XCO, YCO, IMAGE, null, OPACITY); }; }
  function add() { addfn(); }
  function addfore() { G.addfore(XCO, YCO, IMAGE, OPACITY); }
  function maddfore() { OPACITY = MASK; addfore(); OPACITY = ORA; addfore(); }
  var initsettings = [ST.gmaxval, ST.gminval];

  // ---------------------------------------------------------------- getobjid: objid and state of a block
  function getobjid1(y) {
    state = blue[S.BlueSpec + y];
    var id = blue[S.BlueType + y] & ST.idmask;
    if (id === OBJ.pressplate) { var m = blue[ST.LINKMAP + state] & 0x1F; return m < 2 ? OBJ.pressplate : OBJ.dpressplate; }
    if (id === OBJ.upressplate) { m = blue[ST.LINKMAP + state] & 0x1F; if (m < 2) return OBJ.upressplate; state = 0; return OBJ.floor; }
    return id;
  }
  function getobjid(y) { if (S.SCRNUM === 0) return OBJ.space; return getobjid1(y); }
  function getinitobj(y) {                                  // returns state or null when it doesn't matter
    var id = blue[S.BlueType + y] & ST.idmask;
    if (id === OBJ.gate) return initsettings[blue[S.BlueSpec + y] - 1];
    if (id === OBJ.loose) return 0;                          // "lda #0; rts": the carry is still set from the compare, so the state is zeroed
    if (id === OBJ.flask) return u8(blue[S.BlueSpec + y] << 5);
    return null;
  }

  // ---------------------------------------------------------------- neighbours
  function getprev() {
    if (S.scrnLeft === 0) {                                                  // null screen to the left
      S.PREV[0] = S.PREV[1] = S.PREV[2] = OBJ.block; S.sprev[0] = S.sprev[1] = S.sprev[2] = 0; return;
    }
    ST.calcblue(S.scrnLeft);
    S.PREV[0] = getobjid1(9); S.sprev[0] = state;
    S.PREV[1] = getobjid1(19); S.sprev[1] = state;
    S.PREV[2] = getobjid1(29); S.sprev[2] = state;
  }
  function getbelow() {
    var x = rowno;
    if (x < 2) {
      S.BELOW[0] = S.PREV[x + 1]; S.SBELOW[0] = S.sprev[x + 1];
      var y = yindex + 10;
      for (var k = 1; k < 10; k++, y++) { S.BELOW[k] = getobjid(y); S.SBELOW[k] = state; }
      return;
    }
    if (S.scrnBelow === 0) { for (k = 1; k < 10; k++) S.BELOW[k] = 1; }
    else { ST.calcblue(S.scrnBelow); for (y = 8; y >= 0; y--) { S.BELOW[y + 1] = getobjid(y); S.SBELOW[y + 1] = state; } }
    if (S.scrnBelowL === 0) { S.BELOW[0] = (S.level === 12) ? OBJ.space : OBJ.block; }
    else { ST.calcblue(S.scrnBelowL); S.BELOW[0] = getobjid(9); S.SBELOW[0] = state; }
    ST.calcblue(S.SCRNUM);
  }

  // ---------------------------------------------------------------- SURE
  function SURE() {
    L.genCLS = 1;
    setback();
    getprev();
    ST.calcblue(S.SCRNUM);
    for (var y = 2; y >= 0; y--) {
      rowno = y; Dy = ST.BlockBot[y + 1]; Ay = u8(Dy - 3); yindex = ST.Mult10[y];
      S.PRECED = S.PREV[y]; S.spreced = S.sprev[y];
      getbelow();
      for (colno = 0; colno < 10; colno++) {
        XCO = colno * 4; blockxco = XCO;
        objid = getobjid(yindex);
        RedBlockSure();
        S.PRECED = objid; S.spreced = state;
        yindex++;
      }
    }
    // bottom row of the screen above (D-sections only)
    rowno = 2; Dy = 2; Ay = 0xFF; yindex = 20; S.PRECED = 0;
    var sb = S.scrnBelow, sbl = S.scrnBelowL;
    S.scrnBelow = S.SCRNUM; S.scrnBelowL = S.scrnLeft;
    getbelow();
    ST.calcblue(S.scrnAbove);
    for (colno = 0; colno < 10; colno++) {
      XCO = colno * 4; blockxco = XCO;
      if (S.scrnAbove === 0) { objid = OBJ.floor; } else objid = getobjid1(yindex);
      RedDSure();
      S.PRECED = objid; S.spreced = state;
      yindex++;
    }
    S.scrnBelowL = sbl; S.scrnBelow = sb;
  }

  // ---------------------------------------------------------------- FAST
  function metbufs(y0, n) { var a = 0; for (var i = 0; i < n; i++) { var y = y0 + i; a |= S.redbuf[y] | S.floorbuf[y] | S.halfbuf[y] | S.fredbuf[y] | S.wipebuf[y]; } return a; }
  function FAST() {
    getprev();
    ST.calcblue(S.SCRNUM);
    S.redkidmeter = metbufs(20, 3);
    S.redoppmeter = metbufs(28, 2);
    yindex = 30; drawobjs();
    for (var y = 2; y >= 0; y--) {
      rowno = y; Dy = ST.BlockBot[y + 1]; Ay = u8(Dy - 3); yindex = ST.Mult10[y];
      S.PRECED = S.PREV[y]; S.spreced = S.sprev[y];
      getbelow();
      for (colno = 0; colno < 10; colno++) {
        XCO = colno * 4; blockxco = XCO;
        objid = getobjid(yindex);
        RedBlockFast();
        S.PRECED = objid; S.spreced = state;
        yindex++;
      }
    }
    setback();
    rowno = 2; Dy = 2; Ay = 0xFF; yindex = 20; S.PRECED = 0;
    var sb = S.scrnBelow, sbl = S.scrnBelowL;
    S.scrnBelow = S.SCRNUM; S.scrnBelowL = S.scrnLeft;
    getbelow();
    if (S.scrnAbove !== 0) {
      ST.calcblue(S.scrnAbove);
      for (colno = 0; colno < 10; colno++) {
        blockxco = colno * 4; XCO = blockxco;
        objid = getobjid1(yindex);
        RedDFast();
        S.PRECED = objid; S.spreced = state;
        yindex++;
      }
    }
    S.scrnBelowL = sbl; S.scrnBelow = sb;
    yindex = 0xFF; drawobjs();
    updatemeters();
  }

  function RedBlockSure() { drawc(); drawmc(); drawb(); drawmb(); drawd(); drawmd(); drawa(); drawma(); drawfrnt(); }
  function RedDSure() { drawc(); drawmc(); drawb(); drawd(); drawmd(); drawfrnt(); }
  function RedBlockFast() {
    var y = yindex;
    if (S.wipebuf[y]) { S.wipebuf[y]--; wipesq(y); }
    if (S.redbuf[y]) { S.redbuf[y]--; setback(); RedBlockSure(); }
    else if (S.movebuf[y]) { S.movebuf[y]--; setback(); drawmc(); drawmb(); drawma(); }
    if (S.floorbuf[y]) { S.floorbuf[y]--; setmid(); drawfloor(); }
    else if (S.halfbuf[y]) { S.halfbuf[y]--; setmid(); drawhalf(); }
    if (S.objbuf[y]) { S.objbuf[y] = 0; drawobjs(); XCO = blockxco; }
    if (S.fredbuf[y]) { S.fredbuf[y]--; drawfrnt(); }
  }
  function RedDFast() {
    if (!S.topbuf[colno]) return;
    S.topbuf[colno]--;
    wiped(); drawc(); drawmc(); drawb(); redrawd(); drawmd(); drawfrnt();
  }

  // ---------------------------------------------------------------- objects
  function drawobjs() {
    var obj = L.obj; if (!L.objN) return;
    var sort = [];
    for (var x = 1; x <= L.objN; x++) if (obj[x].indx === yindex) sort.push(x);
    if (!sort.length) return;
    sortlist(sort);
    for (var i = 0; i < sort.length; i++) drawobjx(obj[sort[i]]);
  }
  function sortlist(sort) {              // one pass from the bottom up (the original's 'switches' flag is never set, so one pass is all it makes)
    var obj = L.obj;
    for (var x = sort.length - 1; x >= 1; x--) {
      var a = obj[sort[x]], b = obj[sort[x - 1]], swap;
      if (a.typ === ST.TypeShad) swap = false;
      else if (a.y === b.y) swap = false;
      else swap = a.y > b.y;                                  // "cmp objY,y; bcc xinfront; bcs yinfront": switch when objY[x] > objY[y]
      if (swap) { var t = sort[x]; sort[x] = sort[x - 1]; sort[x - 1] = t; }
    }
  }
  function drawobjx(o) {
    S.FCharX = o.x; XCO = o.x; S.FCharY = o.y; YCO = o.y; IMAGE = o.img; S.FCharFace = o.face;
    S.FCharCU = o.cu; S.FCharCD = o.cd; S.FCharCL = o.cl; S.FCharCR = o.cr;
    var t = o.typ;
    if (t === ST.TypeKid || t === ST.TypeReflect) return DrawKid(o);
    if (t === ST.TypeShad) return DrawShad(o);
    if (t === ST.TypeFF) return DrawFF(o);
    if (t === ST.TypeSword || t === ST.TypeComix) return DrawSword(o);
    if (t === ST.TypeGd) return DrawGuard(o);
  }
  function midchar(o, opacity, offAdd) {       // addmid with char tables and layrsave
    var off = o.off, x = o.x;
    if (offAdd) { off += offAdd; if (off >= 7) { x++; off -= 7; } }
    G.addmid(G.UseLayrsave | 0x80, x, off, o.y, o.img, o.tab, opacity, o.face, o.cu, o.cd, o.cl, o.cr);
  }
  function DrawKid(o) {
    if (S.backtolife && HR.P.PAGE === 0) return;             // flash when coming back to life
    if (!(S.mergetimer & 0x80) && (S.mergetimer & 1)) return midchar(o, EOR, 0);
    midchar(o, MASK, 0);
  }
  function DrawSword(o) { midchar(o, MASK, 0); }
  function DrawShad(o) { midchar(o, EOR, 0); }
  function DrawGuard(o) { if (S.GuardColor) midchar(o, MASK, 1); else midchar(o, MASK, 0); }
  function DrawFF(o) {
    var frame = o.img, face = 0xFF, y = o.y, x = o.x;
    G.addmid(G.UseLayrsave, x, 0, u8(y - 3), BG.maska[OBJ.floor], null, AND, face, o.cu, o.cd, o.cl, o.cr);
    G.addmid(G.UseLay, x, 0, u8(y - 3), BG.loosea[frame], null, ORA, face, o.cu, o.cd, o.cl, o.cr);
    G.addmid(G.UseLayrsave, x, 0, y, BG.loosed[frame], null, STA, face, o.cu, o.cd, o.cl, o.cr);
    G.addmid(G.UseLayrsave, u8(x + 4), 0, u8(y - 4), BG.looseb, null, ORA, face, o.cu, o.cd, o.cl, o.cr);
  }

  // ---------------------------------------------------------------- the sections
  function drawfrnt() {
    if (S.PRECED === OBJ.gate) DrawGateBF();
    var x = objid;
    if (x === OBJ.slicer) return drawslicerf();
    var img;
    if (x === OBJ.flask && (state & 0xE0) !== 0xA0 && (state & 0xE0) >= 0x40) img = BG.specialflask;
    else { img = BG.fronti[x]; if (!img) return; }
    IMAGE = img; YCO = u8(Ay + BG.fronty[x]); XCO = u8(blockxco + BG.frontx[x]);
    if (x >= OBJ.archtop2) return staFore();
    if (S.BGset1 !== 1) { if (x === OBJ.posts) return staFore(); }
    if (x === OBJ.block) { var yy = state; if (yy >= BG.numblox) yy = 0; IMAGE = BG.blockfr[yy]; return staFore(); }
    return maddfore();
  }
  function staFore() { OPACITY = STA; addfore(); }
  function DrawGateBF() {
    if (rowno !== ST.Kid.BlockY) return;
    if (u8(colno - 1) !== ST.Kid.BlockX) return;
    if (S.scrnRight === ST.Kid.Scrn) return;
    drawgatebf();
  }
  function drawmb() {
    var p = S.PRECED;
    if (p === OBJ.gate) return drawgateb();
    if (p === OBJ.spikes) return drawspikeb();
    if (p === OBJ.loose) return drawlooseb();
    if (p === OBJ.torch) return drawtorchb();
    if (p === OBJ.exit) return drawexitb();
  }
  function drawmc() {
    if (!(objid === OBJ.space || objid === OBJ.panelwof || objid === OBJ.pillartop)) return;
    if (S.BELOW[colno] !== OBJ.gate) return;
    drawgatec();
  }
  function checkc() { return objid === 0 || objid === OBJ.pillartop || objid === OBJ.panelwof || objid >= OBJ.archtop1; }
  function drawc() { if (!checkc()) return; dodrawc(); domaskb(); }
  function dodrawc() {
    var x = S.BELOW[colno], img;
    if (x === OBJ.block) { var y = S.SBELOW[colno]; if (y >= BG.numblox) y = 0; img = BG.blockc[y]; if (!img) return; }
    else {
      img = BG.piecec[x]; if (!img) return;
      if (img === BG.panelc0) { y = S.SBELOW[colno]; if (y >= BG.numpans) return; img = BG.panelc[y]; if (!img) return; }
    }
    IMAGE = img; XCO = blockxco; YCO = Dy; OPACITY = ORA; add();
  }
  function domaskb() {
    var img = BG.maskb[S.PRECED]; if (!img) return;
    IMAGE = img; YCO = Dy; OPACITY = AND; add();
  }
  function drawb() {
    if (objid === OBJ.block) return;
    var x = S.PRECED, img, y;
    if (x === OBJ.space) { y = S.spreced; if (y >= BG.numbpans + 1) return; img = BG.spaceb[y]; if (!img) return; IMAGE = img; return bcont(BG.spaceby[y]); }
    if (x === OBJ.floor) { y = S.spreced; if (y >= BG.numbpans + 1) y = 0; img = BG.floorb[y]; if (!img) return; IMAGE = img; return bcont(BG.floorby[y]); }
    if (x === OBJ.block) { y = S.spreced; if (y >= BG.numblox) y = 0; img = BG.blockb[y]; if (!img) return; return bcont1(img, x); }
    img = BG.pieceb[x];
    if (!img) return stripe();
    if (img === BG.panelb0) { y = S.spreced; if (y >= BG.numpans) return; img = BG.panelb[y]; if (!img) return; return bcont1(img, x); }
    bcont1(img, x);
    stripe();
  }
  function stripe() {
    if (S.BGset1 !== 1) return;
    var img = BG.bstripe[S.PRECED]; if (!img) return;
    IMAGE = img; YCO = u8(Ay - 32); XCO = blockxco; OPACITY = ORA; add();
  }
  function bcont1(img, x) { IMAGE = img; bcont(BG.pieceby[x]); }
  function bcont(dy) { YCO = u8(Ay + dy); XCO = blockxco; OPACITY = ORA; add(); }
  function redrawd() { if (!drawd()) return; addfore(); }
  function drawd() {                                          // returns true when something was drawn (Z clear)
    OPACITY = STA;
    var x = objid, img;
    if (x === OBJ.block) { var y = state; if (y >= BG.numblox) y = 0; img = BG.blockd[y]; if (!img) return false; }
    else { if (x === OBJ.panelwof) OPACITY = ORA; img = BG.pieced[x]; if (!img) return false; }
    IMAGE = img; XCO = blockxco; YCO = Dy; add(); return true;
  }
  function drawa() {
    var p = S.PRECED;
    if (p === OBJ.archtop1) { if (objid === OBJ.panelwof) return adda1(BG.archpanel, objid); return adda(); }
    if (p === OBJ.panelwif || p === OBJ.panelwof || p === OBJ.pillartop || p === OBJ.block) addamask();
    adda();
  }
  function addamask() {
    var img = BG.maska[objid]; if (!img) return;
    IMAGE = img; XCO = blockxco; YCO = Ay; OPACITY = AND; add();
  }
  function getpiecea(x) { if (x === OBJ.loose) return BG.loosea[getloosey(state)]; return BG.piecea[x]; }
  function adda() { var img = getpiecea(objid); if (!img) return; adda1(img, objid); }
  function adda1(img, x) { IMAGE = img; XCO = blockxco; YCO = u8(Ay + BG.pieceay[x]); OPACITY = ORA; add(); }
  function drawma() {
    if (objid === OBJ.spikes) return drawspikea();
    if (objid === OBJ.slicer) return drawslicera();
    if (objid === OBJ.flask) return drawflaska();
    if (objid === OBJ.sword) return drawsworda();
  }
  function drawmd() { if (objid === OBJ.loose) drawloosed(); }
  function drawfloor() { if (S.PRECED) return; drawflr(); }
  function drawflr() { addamask(); adda(); drawma(); drawd(); }
  function drawhalf() {
    if (S.PRECED) return;
    var x = objid, img;
    if (x === OBJ.floor || x === OBJ.torch || x === OBJ.dpressplate || x === OBJ.exit) { halfsub(); img = BG.CUpiece; }
    else {
      if (S.BGset1 !== 1) return drawflr();
      if (x === OBJ.posts || x === OBJ.archbot) { halfsub(); img = BG.CUpost; } else return drawflr();
    }
    IMAGE = img; OPACITY = ORA; add(); drawd();
  }
  function halfsub() {
    IMAGE = BG.CUmask; XCO = blockxco; YCO = Ay;
    if (objid === OBJ.dpressplate) YCO = u8(YCO + 1);
    OPACITY = AND; add();
  }
  function wipesq(y) { wipe(S.whitebuf[y]); }
  function wipe(height) { G.addwipe(blockxco, Dy, height, 4, 0x80); }
  function wiped() {
    if (objid === OBJ.pillartop || objid === OBJ.panelwif || objid === OBJ.panelwof || objid === OBJ.block) return;
    wipe(3);
  }
  function getloosey(st) { if (!(st & 0x80)) return st; st &= 0x7F; if (st >= ST.Ffalling + 1) return 1; return st; }
  function drawloosed() {
    var img = BG.loosed[getloosey(state)]; if (!img) return;
    IMAGE = img; XCO = blockxco; YCO = Dy; OPACITY = STA; add();
  }
  function drawlooseb() {
    var y = getloosey(S.spreced);
    IMAGE = BG.looseb; YCO = u8(Ay + BG.looseby[y]); OPACITY = ORA; add();
  }
  function drawspikea() {
    var x = state; if (x & 0x80) x = ST.spikeExt;
    var img = BG.spikea[x]; if (!img) return;
    IMAGE = img; XCO = blockxco; YCO = u8(Ay - 1); OPACITY = ORA; add();
  }
  function drawspikeb() {
    var x = S.spreced; if (x & 0x80) x = ST.spikeExt;
    var img = BG.spikeb[x]; if (!img) return;
    IMAGE = img; XCO = blockxco; YCO = u8(Ay - 1); OPACITY = ORA; add();
  }
  function drawtorchb() {
    if (!blockxco) return;
    XCO = blockxco; YCO = Ay;
    setupflame(S.spreced);
    G.addback(XCO, YCO, IMAGE, OPACITY);
  }
  function drawflaska() {
    XCO = blockxco; YCO = Ay;
    var f = setupflask(state);
    G.addmidezo(G.UseLay, XCO, f.offset, YCO, IMAGE, null, OPACITY);
  }
  function drawsworda() {
    IMAGE = state === 1 ? BG.swordgleam1 : BG.swordgleam0;
    XCO = blockxco; YCO = Ay; OPACITY = STA; add();
  }
  function drawslicera() {
    var x = state & 0x7F; if (x >= ST.slicerRet) x = ST.slicerRet;
    x = BG.slicerseq[x] - 1;
    XCO = blockxco; YCO = Ay;
    var img = (state & 0x80) ? BG.slicerbot2[x] : BG.slicerbot[x];
    if (img) { IMAGE = img; OPACITY = ORA; add(); }
    img = BG.slicertop[x]; if (!img) return;
    IMAGE = img; YCO = u8(Ay - BG.slicergap[x]); OPACITY = ORA; add();
  }
  function drawslicerf() {
    var x = state & 0x7F; if (x >= ST.slicerRet) x = ST.slicerRet;
    x = BG.slicerseq[x] - 1;
    XCO = blockxco; YCO = Ay;
    var img = BG.slicerfrnt[x]; if (!img) return;
    IMAGE = img; maddfore();
  }
  function drawexitb() {
    IMAGE = BG.stairs; YCO = u8(Ay - 12);
    if (blockxco >= 36) return;
    XCO = blockxco + 1; OPACITY = STA;
    if (S.SCRNUM !== blue[ST.KidStartScrn]) add();
    var thr = u8(Dy - 67); if (thr >= 192) return;
    blockthr = thr;
    gateposn = S.spreced >> 2;
    S.doortop = u8(Ay - 14 - gateposn);
    var y = S.doortop;
    for (;;) {
      YCO = y;
      IMAGE = BG.doormask; OPACITY = AND; add();
      IMAGE = BG.door; OPACITY = ORA; add();
      y = u8(y - 4); if (y < blockthr) break;
    }
    var t = u8(Ay - 64); if (t >= 192) return;
    YCO = t; IMAGE = BG.toprepair; OPACITY = STA; add();
  }
  function drawgatec() {
    YCO = Dy; IMAGE = BG.gatecmask; OPACITY = AND; add();
    var st = S.SBELOW[colno]; if (st >= ST.gmaxval) st = ST.gmaxval;
    gateposn = st >> 2;
    var y = u8(u8(~(gateposn & 0xF8) + 1) + gateposn);      // (state/4) mod 8
    IMAGE = BG.gate8c[y]; OPACITY = ORA; add();
  }
  function setupdgb() {
    blockthr = u8(Dy - 62);
    var st = S.spreced; if (st >= ST.gmaxval) st = ST.gmaxval;
    gateposn = (st >> 2) + 1;
    gatebot = u8(Ay - gateposn);
  }
  function drawgatebf() {
    setupdgb();
    OPACITY = ORA; YCO = u8(gatebot - 2); IMAGE = BG.gatebotORA; addfore();
    IMAGE = BG.gateB1;
    var y = u8(gatebot - 12);
    for (;;) {
      YCO = y; if (y >= 192) return;
      var t = y - 7; if (t < 0) return; if (u8(t) < blockthr) return;
      addfore();
      y = u8(YCO - 8); if (y === 0) return;
    }
  }
  function drawgateb() {
    setupdgb();
    if (u8(gatebot + 12) >= Ay) {                              // bottom piece partly below the floor line
      restorebot();
      YCO = u8(gatebot - 2); IMAGE = BG.gatebotORA; OPACITY = ORA; G.addback(XCO, YCO, IMAGE, OPACITY);
    } else { YCO = gatebot; IMAGE = BG.gatebotSTA; OPACITY = STA; G.addback(XCO, YCO, IMAGE, OPACITY); }
    OPACITY = STA; IMAGE = BG.gateB1;
    var y = u8(gatebot - 12);
    for (;;) {
      YCO = y; if (y >= 192) return;
      var t = y - 7; if (t < 0 || u8(t) < blockthr) break;
      G.addback(XCO, YCO, IMAGE, OPACITY);
      y = u8(YCO - 8); if (y === 0) break;
    }
    var h = u8(u8(YCO - blockthr) + 1);
    if (h === 0 || h >= 9) return;
    IMAGE = BG.gate8b[h - 1]; G.addback(XCO, YCO, IMAGE, OPACITY);
  }
  function restorebot() {
    IMAGE = BG.pieceb[OBJ.gate]; YCO = u8(BG.pieceby[OBJ.gate] + Ay); XCO = blockxco; OPACITY = STA; add();
    if (checkc()) dodrawc();
    drawa();
  }

  // ---------------------------------------------------------------- GAMEBG: flames, flasks, meters, messages, comix, objects
  var torchflame = [0x52, 0x53, 0x54, 0x55, 0x56, 0x61, 0x62, 0x63, 0x64, 0x52, 0x54, 0x56, 0x63, 0x61, 0x55, 0x53, 0x64, 0x62];
  var ptorchflame = [1, 2, 3, 4, 5, 6, 7, 8, 9, 3, 5, 7, 1, 4, 9, 2, 8, 6];
  var bubble = [0xb2, 0xaf, 0xb0, 0xb1, 0xb0, 0xaf, 0xb1, 0xb0, 0xaf];
  function setupflame(x) {                                   // in: XCO=blockxco, YCO=Ay; out IMAGE/XCO/YCO/OPACITY for bgtable1
    if (x >= ST.torchLast + 1) return false;
    IMAGE = torchflame[x]; XCO = u8(XCO + 1); YCO = u8(YCO - 43); OPACITY = STA; return true;
  }
  function setupflask(x) {                                   // returns {offset}
    var offset = 2, t = x & 0xE0;
    if (t !== 0) {
      if (t > 0x40) offset++;                                // mystery potion (blue)
      if (t >= 0x40) YCO = u8(YCO - 4);                      // boost/mystery: taller
      x &= 0x1F; if (x >= ST.bubbLast + 1) x = 0;
    } else x = 0;
    IMAGE = bubble[x] | 0x80;                                // bgtable2
    XCO = u8(XCO + 2); YCO = u8(YCO - 14); OPACITY = STA;
    return { offset: offset };
  }
  var KidStrX = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12], KidStrOFF = [0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4];
  var OppStrX = [39, 38, 37, 36, 35, 34, 32, 31, 30, 29, 28, 27], OppStrOFF = [5, 4, 3, 2, 1, 0, 6, 5, 4, 3, 2, 1];
  var bullet = 0x88, blank = 0x8c, bline = [0x89, 0x8a, 0x8b];
  function updatemeters() { if (S.redkidmeter) DrawKidMeter(); if (S.redoppmeter) DrawOppMeter(); }
  function DrawKidMeter() {
    if (S.inbuilder) return;
    var yco = 191, op = STA, x = 0;
    for (;;) {
      var left = u8(S.KidStrength - x);
      if (left === 0) break;
      if (left >= 2) {
        var n = left >= 4 ? 3 : left >= 3 ? 2 : 1;
        G.addmsg(KidStrX[x], KidStrOFF[x], yco, bline[n - 1], op); x += n; continue;
      }
      if (S.KidStrength >= 2 || HR.P.PAGE !== 0) { G.addmsg(KidStrX[x], KidStrOFF[x], yco, bullet, op); x += 1; }
      break;
    }
    while (x < S.MaxKidStr) { G.addmsg(KidStrX[x], KidStrOFF[x], yco, blank, AND); x++; }
  }
  function DrawOppMeter() {
    if (S.inbuilder) return;
    if (!S.OppStrength) return;
    var id = ST.Shad.ID;
    if (id === 24 || id === 4) return;
    if (id === 1 && S.level !== 12) return;
    var yco = 191, op = STA | 0x80, x = 0;
    for (;;) {
      var left = u8(S.OppStrength - x);
      if (left === 0) break;                                   // all drawn: one blank follows (the bullet just lost)
      if (left >= 2) {
        var n = left >= 4 ? 3 : left >= 3 ? 2 : 1;
        G.addmsg(OppStrX[x], OppStrOFF[x], yco, bline[n - 1], op); x += n; continue;
      }
      if (S.OppStrength >= 2 || HR.P.PAGE !== 0) { G.addmsg(OppStrX[x], OppStrOFF[x], yco, bullet, op); return; }   // the last bullet: nothing after it
      break;                                                   // flashing off: the blank takes its place
    }
    G.addmsg(OppStrX[x], OppStrOFF[x], yco, blank, AND | 0x80);
  }
  // messages: YCO, XCO, OFFSET, IMAGE
  var my = 90, lowmy = 153, hiconty = 73, lowconty = 168;
  var contbox = [hiconty, 13, 0, 0x7c], msgbox = [my, 15, 0, 0x7b], levelmsg = [my - 5, 16, 3, 0x7a], flipbox = [my - 1, 13, 0, 0x7e], timeleft = [my, 11, 0, 0x7d], seconds = [my - 5, 14, 0, 0x7f];
  var digit1 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x71, 0x71, 0x71], digit2 = [0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x70, 0x71, 0x72];
  var M = { YCO: 0, XCO: 0, OFFSET: 0, IMAGE: 0 };
  function setupimage(d) { M.YCO = d[0]; M.XCO = d[1]; M.OFFSET = d[2]; M.IMAGE = d[3]; }
  function superim1() { G.addmsg(M.XCO, M.OFFSET, M.YCO, M.IMAGE, STA | 0x40); }
  function superimage(d) { setupimage(d); superim1(); }
  function getlevelno() { var x = S.level; if (x >= 13) x = 12; return x; }
  function printlevel() {
    superimage(msgbox);
    setupimage(levelmsg);
    var x = getlevelno(); if (x >= 10) M.OFFSET = 0;
    G.addmsg(M.XCO, M.OFFSET, M.YCO, M.IMAGE, ORA);
    M.XCO += 6;
    var d1 = digit1[x];
    if (d1) { G.addmsg(M.XCO, M.OFFSET, M.YCO, d1, ORA); M.XCO += 1; }
    G.addmsg(M.XCO, M.OFFSET, M.YCO, digit2[x], ORA);
  }
  function timeleftmsg() {
    setupimage(timeleft);
    var ok = S.MinLeft >= 2 || ST.Kid.Action === 3 || ST.Kid.Action === 4 || ST.Kid.BlockY !== 1;
    if (!ok) M.YCO = lowmy;
    superim1();
    M.YCO = u8(M.YCO - 5); M.XCO += 1;
    POP.top.getminleft();
    var temp = S.MinLeft >= 2 ? S.MinLeft : S.SecLeft;
    var hi = temp >> 4;
    if (hi) G.addmsg(M.XCO, M.OFFSET, M.YCO, digit2[hi], ORA);
    M.XCO += 1;
    G.addmsg(M.XCO, M.OFFSET, M.YCO, digit2[temp & 0xF], ORA);
    if (S.MinLeft >= 2) return;
    var y = M.YCO; setupimage(seconds); M.YCO = y;
    G.addmsg(M.XCO, M.OFFSET, M.YCO, M.IMAGE, STA);
  }
  function continuemsg() { setupimage(contbox); if (!(ST.Kid.BlockX & 1)) M.YCO = lowconty; superim1(); }
  function flipdiskmsg() { superimage(flipbox); }

  // comix (impact star)
  var starimage = 0x41, startable = 0;
  function setupcomix() {
    var save = { FCharImage: S.FCharImage, FCharX: S.FCharX, FCharY: S.FCharY, FCharFace: S.FCharFace, FCharIndex: S.FCharIndex, FCharCU: S.FCharCU, FCharCD: S.FCharCD, FCharCL: S.FCharCL, FCharCR: S.FCharCR, FCharTable: S.FCharTable };
    comixsub();
    for (var k in save) S[k] = save[k];
  }
  function comixsub() {
    S.FCharIndex = 0xFF;
    var p = Char.Posn, dx;
    if (p === 185) { S.FCharY = u8(S.FCharY + 4); dx = 5; }
    else if (p === 177) { dx = -5; }
    else if (p >= 106 && p < 111) { S.FCharY = u8(S.FCharY + 4); dx = 5; }
    else if (p === 178) return;
    else { S.FCharY = u8(S.FCharY + (Char.ID === 0 ? -15 : -11)); dx = 5; }
    ST.addfcharx(dx);
    var col = Char.ID === 0 ? 0 : 1;
    if (!((col ^ S.FCharX ^ S.FCharFace) & 1)) S.FCharX = (S.FCharX + 1) & 0xFFFF;
    S.FCharImage = starimage; S.FCharTable = startable;
    S.FCharCU = 0; S.FCharCL = 0; S.FCharCR = 40; S.FCharCD = 192;
    addcharobj(ST.TypeComix);
  }
  // ADDCHAROBJ: add a character (FChar data) to the object table
  function addcharobj(type) {
    if (L.objN + 1 >= maxobj) return;
    L.objN++;
    var c = G.cvtx(ST.fcharx16()), o = L.obj[L.objN];
    o.typ = type; o.x = c.xco; o.off = c.offset; o.y = S.FCharY; o.cu = S.FCharCU; o.cl = S.FCharCL; o.cr = S.FCharCR; o.cd = S.FCharCD;
    o.img = S.FCharImage; o.tab = S.FCharTable; o.face = S.FCharFace;
    setobjindx(o);
  }
  function setobjindx(o) { o.indx = S.FCharIndex; if (o.indx < 30) S.objbuf[o.indx] = 1; }
  function addmobobj(mobx, moby, mobtype, frame) {          // MOVER's addmobobj ("inc objX" with no room check; objCD is left as it was)
    L.objN++;
    var o = L.obj[L.objN];
    o.typ = (mobtype | 0x80) & 0xFF; o.x = mobx; o.off = 0; o.y = moby; o.img = frame; o.cu = 0; o.cl = 0; o.cr = 40;
    setobjindx(o);
  }
  function markmeters() { markkidmeter(); markoppmeter(); }
  function mark1(y) { S.height = 4; ST.markwipe({ y: y, cs: false }, 2); ST.markred({ y: y, cs: false }, 2); }
  function markkidmeter() { mark1(20); mark1(21); mark1(22); }
  function markoppmeter() { mark1(28); mark1(29); }

  return { SURE: SURE, FAST: FAST, getobjid: getobjid, getobjid1: getobjid1, getinitobj: getinitobj, drawobjs: drawobjs, addcharobj: addcharobj, setobjindx: setobjindx, addmobobj: addmobobj,
    setupcomix: setupcomix, updatemeters: updatemeters, DrawKidMeter: DrawKidMeter, DrawOppMeter: DrawOppMeter, printlevel: printlevel, timeleftmsg: timeleftmsg, continuemsg: continuemsg,
    flipdiskmsg: flipdiskmsg, markmeters: markmeters, markkidmeter: markkidmeter, markoppmeter: markoppmeter, torchflame: torchflame, ptorchflame: ptorchflame, setupflame: setupflame,
    params: function () { return { XCO: XCO, YCO: YCO, IMAGE: IMAGE, OPACITY: OPACITY }; }, setparams: function (x, y) { XCO = x; YCO = y; } };
})();
