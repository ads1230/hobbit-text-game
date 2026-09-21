// pop_grafix.js — the image lists and DRAWALL from GRAFIX.S: everything the frame code wants drawn
// is queued (wipe, background, middle, foreground, message lists) and then put on the hidden page
// in order, with the peel lists restoring what characters covered two frames ago.
var POP = POP || {};
POP.grafix = (function () {
  'use strict';
  var HR = POP.hires, P = HR.P;
  var maxback = 200, maxfore = 100, maxwipe = 20, maxpeel = 46, maxmid = 46, maxobj = 20, maxmsg = 32;
  var UseFastlay = 0, UseLay = 1, UseLayrsave = 2;

  // image tables: set by the game (bg1/bg2 change with the level's background set, ch4 with the guard set)
  var tables = { bg1: null, bg2: null, ch: [null, null, null, null, null, null, null] };

  var L = { genCLS: 0, wipe: [], bg: [], fg: [], mid: [], msg: [], obj: [], objN: 0, peel: [[], []], blackflag: 0, purpleflag: 1 };
  for (var i = 0; i < maxobj; i++) L.obj.push({ indx: 0, x: 0, off: 0, y: 0, img: 0, face: 0, typ: 0, cu: 0, cd: 0, cl: 0, cr: 0, tab: 0 });

  function addback(XCO, YCO, IMAGE, OPACITY) { if (L.bg.length >= maxback - 1) return; if (YCO >= 192) return; L.bg.push({ x: XCO, y: YCO, img: IMAGE, op: OPACITY }); }
  function addfore(XCO, YCO, IMAGE, OPACITY) { if (L.fg.length >= maxfore - 1) return; if (YCO >= 192) return; L.fg.push({ x: XCO, y: YCO, img: IMAGE, op: OPACITY }); }
  function addmsg(XCO, OFFSET, YCO, IMAGE, OPACITY) { if (L.msg.length >= maxmsg - 1) return; L.msg.push({ x: XCO, off: OFFSET, y: YCO, img: IMAGE, op: OPACITY }); }
  function addwipe(XCO, YCO, height, width, color) { if (L.wipe.length >= maxwipe - 1) return; if (L.blackflag) color = 0xFF; L.wipe.push({ x: XCO, y: YCO, h: height, w: width, col: color }); }
  // full ADDMID: in XCO, OFFSET, YCO, IMAGE, TABLE, OPACITY, FCharFace, FCharCU/CD/CL/CR; A = midTYP
  function addmid(typ, XCO, OFFSET, YCO, IMAGE, TABLE, OPACITY, face, CU, CD, CL, CR) {
    if (L.mid.length >= maxmid - 1) return;
    L.mid.push({ typ: typ, x: XCO, off: OFFSET, y: YCO, img: IMAGE, tab: TABLE, op: ((face ^ 0xFF) & 0x80) | OPACITY, cu: CU, cd: CD, cl: CL, cr: CR });
  }
  function addmidez(typ, XCO, YCO, IMAGE, TABLE, OPACITY) { addmidezo(typ, XCO, 0, YCO, IMAGE, TABLE, OPACITY); }
  function addmidezo(typ, XCO, OFFSET, YCO, IMAGE, TABLE, OPACITY) {
    if (L.mid.length >= maxmid - 1) return;
    L.mid.push({ typ: typ, x: XCO, off: OFFSET, y: YCO, img: IMAGE, tab: TABLE, op: OPACITY, cu: 0, cd: 192, cl: 0, cr: 40 });
  }
  function addpeel() {                              // right after layrsave
    if (!P.PEELIMG) return;
    var list = L.peel[P.PAGE ? 1 : 0];
    if (list.length + 1 >= maxpeel) return;
    list.push({ x: P.PEELXCO, y: P.PEELYCO, img: P.PEELIMG });
  }
  function zerolsts() { L.genCLS = 0; L.wipe.length = 0; L.bg.length = 0; L.mid.length = 0; L.objN = 0; L.fg.length = 0; L.msg.length = 0; }
  function zeropeels() { L.peel[0].length = 0; L.peel[1].length = 0; }
  function zeropeel() { L.peel[P.PAGE ? 1 : 0].length = 0; }

  // coded image numbers: bit 7 picks bgtable2
  function setbgimg(coded) { P.TABLE = (coded & 0x80) ? tables.bg2 : tables.bg1; P.IMAGE = P.TABLE[(coded & 0x7F) - 1]; }
  function setcharimg(tab, n) { P.TABLE = tables.ch[tab]; P.IMAGE = P.TABLE[n - 1]; }
  function dimchar(n, tab) { var im = tables.ch[tab][n - 1]; return im; }        // width, height

  // ---------------------------------------------------------------- DRAWALL
  function drawall() {
    if (L.genCLS) HR.cls();
    if (!L.blackflag) sngpeel();
    zeropeel();
    drawwipe(); drawback(); drawmid(); drawfore(); drawmsg();
  }
  function sngpeel() {
    var list = L.peel[P.PAGE ? 1 : 0];
    for (var i = list.length - 1; i >= 0; i--) HR.peel(list[i].img, list[i].x, list[i].y);
  }
  function drawwipe() { for (var i = 0; i < L.wipe.length; i++) { var w = L.wipe[i]; P.XCO = w.x; P.YCO = w.y; HR.fastblack(w.w, w.h, w.col); } }
  function drawback() { for (var i = 0; i < L.bg.length; i++) { var e = L.bg[i]; setbgimg(e.img); P.XCO = e.x; P.YCO = e.y; P.OPACITY = e.op; HR.fastlay(); } }
  function drawfore() {
    for (var i = 0; i < L.fg.length; i++) {
      var e = L.fg[i]; setbgimg(e.img); P.XCO = e.x; P.YCO = e.y;
      if (e.op === HR.MASK) HR.fastmask(); else { P.OPACITY = e.op; HR.fastlay(); }
    }
  }
  function drawmid() {
    for (var i = 0; i < L.mid.length; i++) {
      var e = L.mid[i];
      if (e.typ & 0x80) setcharimg(e.tab, e.img); else setbgimg(e.img);
      P.XCO = e.x; P.YCO = e.y; P.OPACITY = e.op;
      var t = e.typ & 0x7F;
      if (t === UseFastlay) { HR.fastlay(); continue; }
      P.OFFSET = e.off; P.LEFTCUT = e.cl; P.RIGHTCUT = e.cr; P.TOPCUT = e.cu; P.BOTCUT = e.cd;
      if (t === UseLayrsave) { HR.layrsave(); addpeel(); HR.lay(); }
      else if (t === UseLay) HR.lay();
    }
  }
  function drawmsg() {
    for (var i = 0; i < L.msg.length; i++) {
      var e = L.msg[i]; setbgimg(e.img);
      P.XCO = e.x; P.OFFSET = e.off; P.YCO = e.y; P.LEFTCUT = 0; P.TOPCUT = 0; P.RIGHTCUT = 40; P.BOTCUT = 192;
      P.OPACITY = e.op;
      if (e.op & 0x40) { P.OPACITY = e.op & 0xBF; HR.layrsave(); addpeel(); }
      HR.lay();
    }
  }
  // the (rarely used) direct calls: lay with full-screen cuts and a given table
  function initlay() { P.RIGHTCUT = 40; P.BOTCUT = 192; P.LEFTCUT = 0; P.TOPCUT = 0; }

  // ---------------------------------------------------------------- CVTX: 280-res X (2 bytes) to byte/offset
  function cvtx(x) {                                 // x may be negative; returns {xco, offset} as 8-bit values
    var t = 0, XL = x & 0xFF, XH = (x >> 8) & 0xFF;
    if (XH & 0x80) { do { t -= 36; XL = (XL + 252) & 0xFF; XH = (XH + (XL < 252 ? 1 : 0)) & 0xFF; } while (XH); }
    else while (XH) { t += 36; var nl = XL - 252; XL = nl & 0xFF; XH = (XH - (nl < 0 ? 1 : 0)) & 0xFF; }
    return { xco: (Math.floor(XL / 7) + t) & 0xFF, offset: XL % 7 };
  }
  // RNDseed := (5 * RNDseed + 23) mod 256
  var rnd = { seed: 0 };
  function RND() { rnd.seed = (rnd.seed * 5 + 23) & 0xFF; return rnd.seed; }

  return { L: L, tables: tables, addback: addback, addfore: addfore, addmsg: addmsg, addwipe: addwipe, addmid: addmid, addmidez: addmidez, addmidezo: addmidezo,
    addpeel: addpeel, zerolsts: zerolsts, zeropeels: zeropeels, zeropeel: zeropeel, drawall: drawall, setbgimg: setbgimg, setcharimg: setcharimg, dimchar: dimchar,
    initlay: initlay, cvtx: cvtx, rnd: rnd, RND: RND, UseFastlay: UseFastlay, UseLay: UseLay, UseLayrsave: UseLayrsave };
})();
