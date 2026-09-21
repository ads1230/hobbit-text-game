// pop_hires.js — the Apple's two hi-res pages and the drawing primitives from HIRES.S, byte for
// byte: LAY (general / mask / special-XOR, each with a mirrored twin), FASTLAY, FASTMASK,
// FASTBLACK, LAYRSAVE + PEEL, CLS and the page copy.  Images are 7 pixels a byte, the high bit
// set, stored bottom line first.  Everything works in unsigned 8-bit arithmetic, as the 6502 did.
var POP = POP || {};
POP.hires = (function () {
  'use strict';
  var u8 = function (x) { return x & 0xFF; };

  // ---------------------------------------------------------------- tables (HRTABLES.S)
  var YLO = new Uint8Array(192), YHI = new Uint8Array(192);
  for (var y = 0; y < 192; y++) { var a = 0x2000 + (y & 7) * 0x400 + ((y >> 3) & 7) * 0x80 + (y >> 6) * 0x28; YLO[y] = a & 0xFF; YHI[y] = a >> 8; }
  var SHIFT = [], CARRY = [];
  for (var n = 0; n < 7; n++) {
    var s = new Uint8Array(128), c = new Uint8Array(128);
    for (var v = 0; v < 128; v++) { s[v] = ((v << n) & 0x7F) | 0x80; c[v] = v >> (7 - n); }
    SHIFT.push(s); CARRY.push(c);
  }
  var MIRROR = new Uint8Array(128);
  for (v = 0; v < 128; v++) { var r = 0; for (var b = 0; b < 7; b++) if (v & (1 << b)) r |= 1 << (6 - b); MIRROR[v] = r | 0x80; }
  var MASKTAB = new Uint8Array([
    0xFF, 0xFC, 0xF8, 0xF8, 0xF1, 0xF0, 0xF0, 0xF0, 0xE3, 0xE0, 0xE0, 0xE0, 0xE1, 0xE0, 0xE0, 0xE0,
    0xC7, 0xC4, 0xC0, 0xC0, 0xC1, 0xC0, 0xC0, 0xC0, 0xC3, 0xC0, 0xC0, 0xC0, 0xC1, 0xC0, 0xC0, 0xC0,
    0x8F, 0x8C, 0x88, 0x88, 0x81, 0x80, 0x80, 0x80, 0x83, 0x80, 0x80, 0x80, 0x81, 0x80, 0x80, 0x80,
    0x87, 0x84, 0x80, 0x80, 0x81, 0x80, 0x80, 0x80, 0x83, 0x80, 0x80, 0x80, 0x81, 0x80, 0x80, 0x80,
    0x9F, 0x9C, 0x98, 0x98, 0x91, 0x90, 0x90, 0x90, 0x83, 0x80, 0x80, 0x80, 0x81, 0x80, 0x80, 0x80,
    0x87, 0x84, 0x80, 0x80, 0x81, 0x80, 0x80, 0x80, 0x83, 0x80, 0x80, 0x80, 0x81, 0x80, 0x80, 0x80,
    0x8F, 0x8C, 0x88, 0x88, 0x81, 0x80, 0x80, 0x80, 0x83, 0x80, 0x80, 0x80, 0x81, 0x80, 0x80, 0x80,
    0x87, 0x84, 0x80, 0x80, 0x81, 0x80, 0x80, 0x80, 0x83, 0x80, 0x80, 0x80, 0x81, 0x80, 0x80, 0x80]);
  var AMASKS = [0x80, 0x81, 0x83, 0x87, 0x8F, 0x9F, 0xBF], BMASKS = [0xFF, 0xFE, 0xFC, 0xF8, 0xF0, 0xE0, 0xC0];
  var AND = 0, ORA = 1, STA = 2, EOR = 3, MASK = 4;

  // the screen: $2000-$5FFF, page 1 then page 2
  var mem = new Uint8Array(0x4000);
  function base(y, page) { return ((YHI[y] << 8) | YLO[y]) - 0x2000 + (page << 8); }
  function opstore(op, old, val) {              // the self-modified instruction: AND/ORA/STA/EOR (oper),Y
    switch (op) { case AND: case 4: return old & val; case ORA: return old | val; case EOR: return old ^ val; default: return val; }
  }

  // ---------------------------------------------------------------- the parameter block ($00-$17)
  var P = { PAGE: 0, XCO: 0, YCO: 0, OFFSET: 0, IMAGE: null, OPACITY: 0, TABLE: null, LEFTCUT: 0, RIGHTCUT: 40, TOPCUT: 0, BOTCUT: 192,
    PEELBUF: null, PEELIMG: null, PEELXCO: 0, PEELYCO: 0 };

  // CROP: in XCO, YCO, WIDTH, HEIGHT and the cutoffs; out an object or null when nothing shows
  function crop(XCO, YCO, WIDTH, HEIGHT, skipRows) {
    var TOPEDGE, OFFLEFT, OFFRIGHT, RMOST, VISWIDTH, rowskip = 0;
    if (YCO >= P.BOTCUT) {                                     // bottom is offscreen
      var top = u8(YCO - HEIGHT + 1);
      if (top >= P.BOTCUT) return null;
      TOPEDGE = u8(top - 1);
      var x = YCO;
      do { rowskip++; x = u8(x - 1); } while (x >= P.BOTCUT);
      YCO = x;
    } else {
      var t = u8(YCO - HEIGHT);
      if (t < 191) { TOPEDGE = t; if (P.TOPCUT) { var tc = u8(P.TOPCUT - 1); if (tc >= TOPEDGE) TOPEDGE = tc; } }
      else TOPEDGE = u8(P.TOPCUT - 1);
    }
    var xs = (XCO << 24) >> 24;                                 // "lda XCO; bmi :leftoff"
    if (xs < 0 || u8(XCO) < P.LEFTCUT) {
      OFFLEFT = u8(P.LEFTCUT - XCO);
      var vw = u8(WIDTH - OFFLEFT);
      if (vw & 0x80) return null;
      VISWIDTH = vw; XCO = P.LEFTCUT; OFFRIGHT = 0; RMOST = 0;
    } else {
      if (u8(XCO) >= P.RIGHTCUT) return null;
      var rm = u8(XCO + WIDTH);
      if (rm < P.RIGHTCUT) { VISWIDTH = WIDTH; OFFLEFT = 0; OFFRIGHT = 0; RMOST = 0; }
      else { RMOST = u8(rm - P.RIGHTCUT); OFFRIGHT = u8(RMOST + 1); VISWIDTH = u8(P.RIGHTCUT - XCO); OFFLEFT = 0; }
    }
    return { XCO: u8(XCO), YCO: YCO, TOPEDGE: TOPEDGE, OFFLEFT: OFFLEFT, OFFRIGHT: OFFRIGHT, RMOST: RMOST, VISWIDTH: VISWIDTH, rowskip: rowskip };
  }

  // ---------------------------------------------------------------- LAY
  // how much each frame draws, in bytes per primitive: the page turns it into the Apple's frame time
  var work = { gen: 0, mask: 0, xor: 0, fast: 0, fmask: 0, black: 0, rsave: 0, cls: 0, copy: 0 };
  function count(kind, c) { if (c) work[kind] += u8(c.YCO - c.TOPEDGE) * (c.VISWIDTH + 2); }
  function lay() {
    var op = P.OPACITY;
    if (op & 0x80) { op &= 0x7F; if (op === EOR) return mlayXOR(); if (op >= MASK) return mlayMask(op); return mlayGen(op); }
    if (op === EOR) return layXOR();
    if (op >= MASK) return layMask(op);
    return layGen(op);
  }
  function layGen(op) {
    var im = P.IMAGE, WIDTH = im.w, HEIGHT = im.h, data = im.data;
    var c = crop(P.XCO, P.YCO, WIDTH, HEIGHT); if (!c) return;
    count('gen', c);
    var sh = SHIFT[P.OFFSET], cy = CARRY[P.OFFSET], amask = AMASKS[P.OFFSET], bmask = BMASKS[P.OFFSET];
    var ip = c.rowskip * WIDTH, YCO = c.YCO, mm = mem, page = P.PAGE;
    for (;;) {
      var bs = base(YCO, page) + c.XCO, y, carry, w;
      if (c.OFFLEFT) {
        carry = cy[data[ip + c.OFFLEFT - 1] & 0x7F]; ip += c.OFFLEFT; w = c.VISWIDTH;
        if (!w) { mm[bs] = opstore(op, mm[bs], bmask & mm[bs] | carry); ip += 0; YCO = u8(YCO - 1); if (YCO === c.TOPEDGE) return; continue; }
      } else { carry = mm[bs] & amask; w = WIDTH; }
      var vis = c.VISWIDTH;
      for (y = 0; y < vis; y++) { var v = data[ip + y] & 0x7F; mm[bs + y] = opstore(op, mm[bs + y], sh[v] | carry); carry = cy[v]; }
      if (!c.OFFRIGHT) mm[bs + y] = opstore(op, mm[bs + y], (mm[bs + y] & bmask) | carry);
      ip += w;
      YCO = u8(YCO - 1); if (YCO === c.TOPEDGE) return;
    }
  }
  function layMask(op) {
    var maskop = op === 4 ? AND : STA;
    var im = P.IMAGE, WIDTH = im.w, HEIGHT = im.h, data = im.data;
    var c = crop(P.XCO, P.YCO, WIDTH, HEIGHT); if (!c) return;
    count('mask', c);
    var sh = SHIFT[P.OFFSET], cy = CARRY[P.OFFSET], amask = AMASKS[P.OFFSET], bmask = BMASKS[P.OFFSET];
    var ip = c.rowskip * WIDTH, YCO = c.YCO, mm = mem, page = P.PAGE;
    for (;;) {
      var bs = base(YCO, page) + c.XCO, y, carry, carryim, w;
      if (c.OFFLEFT) {
        var v0 = data[ip + c.OFFLEFT - 1] & 0x7F; carryim = cy[v0]; carry = cy[MASKTAB[v0] & 0x7F]; ip += c.OFFLEFT; w = c.VISWIDTH;
        if (!w) { mm[bs] = opstore(maskop, mm[bs], bmask | carry) | carryim; YCO = u8(YCO - 1); if (YCO === c.TOPEDGE) return; continue; }
      } else { carry = amask; carryim = amask & mm[bs]; w = WIDTH; }
      for (y = 0; y < c.VISWIDTH; y++) {
        var v = data[ip + y] & 0x7F, imbyte = sh[v] | carryim; carryim = cy[v];
        var m = MASKTAB[v] & 0x7F;
        mm[bs + y] = opstore(maskop, mm[bs + y], sh[m] | carry) | imbyte; carry = cy[m];
      }
      if (!c.OFFRIGHT) mm[bs + y] = opstore(maskop, mm[bs + y], bmask | carry) | carryim;
      ip += w;
      YCO = u8(YCO - 1); if (YCO === c.TOPEDGE) return;
    }
  }
  function layXOR() {
    var im = P.IMAGE, WIDTH = im.w, HEIGHT = im.h, data = im.data;
    var c = crop(P.XCO, P.YCO, WIDTH, HEIGHT); if (!c) return;
    count('xor', c);
    var off = P.OFFSET, off1 = off >= 6 ? off - 1 : off + 1;
    var sh = SHIFT[off], cy = CARRY[off], sh1 = SHIFT[off1], cy1 = CARRY[off1], amask = AMASKS[off1];
    var ip = c.rowskip * WIDTH, YCO = c.YCO, mm = mem, page = P.PAGE;
    for (;;) {
      var bs = base(YCO, page) + c.XCO, y, carry, carryim, w;
      if (c.OFFLEFT) {
        var v0 = data[ip + c.OFFLEFT - 1] & 0x7F; carryim = cy1[v0]; carry = cy[v0]; ip += c.OFFLEFT; w = c.VISWIDTH;
        if (!w) { mm[bs] = ((carry | mm[bs]) ^ carryim) | 0x80; YCO = u8(YCO - 1); if (YCO === c.TOPEDGE) return; continue; }
      } else { carry = mm[bs] & amask; carryim = 0; w = WIDTH; }
      for (y = 0; y < c.VISWIDTH; y++) {
        var v = data[ip + y] & 0x7F, imbyte = sh1[v] | carryim; carryim = cy1[v];
        mm[bs + y] = (((sh[v] | carry) | mm[bs + y]) ^ imbyte) | 0x80; carry = cy[v];
      }
      if (!c.OFFRIGHT) mm[bs + y] = ((carry | mm[bs + y]) ^ carryim) | 0x80;
      ip += w;
      YCO = u8(YCO - 1); if (YCO === c.TOPEDGE) return;
    }
  }

  // ---------------------------------------------------------------- MIRROR LAY (XCO is the right edge; bytes read right to left)
  function mlayGen(op) {
    var im = P.IMAGE, WIDTH = im.w, HEIGHT = im.h, data = im.data;
    var c = crop(u8(P.XCO - WIDTH), P.YCO, WIDTH, HEIGHT); if (!c) return;
    count('gen', c);
    var sh = SHIFT[P.OFFSET], cy = CARRY[P.OFFSET], amask = AMASKS[P.OFFSET], bmask = BMASKS[P.OFFSET];
    var ip = c.rowskip * WIDTH, YCO = c.YCO, mm = mem, page = P.PAGE;
    for (;;) {
      var bs = base(YCO, page), y, carry, bx = c.XCO;
      if (c.OFFLEFT) { y = c.VISWIDTH; carry = cy[MIRROR[data[ip + y] & 0x7F] & 0x7F]; y--; }
      else { carry = mm[bs + bx] & amask; y = WIDTH - 1; }
      if (y >= 0) {
        for (;;) {
          var v = MIRROR[data[ip + y] & 0x7F] & 0x7F;
          mm[bs + bx] = opstore(op, mm[bs + bx], sh[v] | carry); carry = cy[v]; bx++;
          if (y === c.RMOST) break;
          y--; if (y < 0) break;
        }
      }
      if (!c.OFFRIGHT) mm[bs + bx] = opstore(op, mm[bs + bx], (mm[bs + bx] & bmask) | carry);
      ip += WIDTH;
      YCO = u8(YCO - 1); if (YCO === c.TOPEDGE) return;
    }
  }
  function mlayMask(op) {
    var maskop = op === 4 ? AND : STA;
    var im = P.IMAGE, WIDTH = im.w, HEIGHT = im.h, data = im.data;
    var c = crop(u8(P.XCO - WIDTH), P.YCO, WIDTH, HEIGHT); if (!c) return;
    count('mask', c);
    var sh = SHIFT[P.OFFSET], cy = CARRY[P.OFFSET], amask = AMASKS[P.OFFSET], bmask = BMASKS[P.OFFSET];
    var ip = c.rowskip * WIDTH, YCO = c.YCO, mm = mem, page = P.PAGE;
    for (;;) {
      var bs = base(YCO, page), y, carry, carryim, bx = c.XCO;
      if (c.OFFLEFT) { y = c.VISWIDTH; var v0 = MIRROR[data[ip + y] & 0x7F] & 0x7F; carryim = cy[v0]; carry = cy[MASKTAB[v0] & 0x7F]; y--; }
      else { carry = amask; carryim = amask & mm[bs + bx]; y = WIDTH - 1; }
      if (y >= 0) {
        for (;;) {
          var v = MIRROR[data[ip + y] & 0x7F] & 0x7F, imbyte = sh[v] | carryim; carryim = cy[v];
          var m = MASKTAB[v] & 0x7F;
          mm[bs + bx] = opstore(maskop, mm[bs + bx], sh[m] | carry) | imbyte; carry = cy[m]; bx++;
          if (y === c.RMOST) break;
          y--; if (y < 0) break;
        }
      }
      if (!c.OFFRIGHT) mm[bs + bx] = opstore(maskop, mm[bs + bx], (mm[bs + bx] & bmask) | carry) | carryim;
      ip += WIDTH;
      YCO = u8(YCO - 1); if (YCO === c.TOPEDGE) return;
    }
  }
  function mlayXOR() {
    var im = P.IMAGE, WIDTH = im.w, HEIGHT = im.h, data = im.data;
    var c = crop(u8(P.XCO - WIDTH), P.YCO, WIDTH, HEIGHT); if (!c) return;
    count('xor', c);
    var off = P.OFFSET, off1 = off >= 6 ? off - 1 : off + 1;
    var sh = SHIFT[off], cy = CARRY[off], sh1 = SHIFT[off1], cy1 = CARRY[off1], amask = AMASKS[off1];
    var ip = c.rowskip * WIDTH, YCO = c.YCO, mm = mem, page = P.PAGE;
    for (;;) {
      var bs = base(YCO, page), y, carry, carryim, bx = c.XCO;
      if (c.OFFLEFT) { y = c.VISWIDTH; var v0 = MIRROR[data[ip + y] & 0x7F] & 0x7F; carryim = cy1[v0]; carry = cy[v0]; y--; }
      else { carry = amask & mm[bs + bx]; carryim = 0; y = WIDTH - 1; }
      if (y >= 0) {
        for (;;) {
          var v = MIRROR[data[ip + y] & 0x7F] & 0x7F, imbyte = sh1[v] | carryim; carryim = cy1[v];
          mm[bs + bx] = (((sh[v] | carry) | mm[bs + bx]) ^ imbyte) | 0x80; carry = cy[v]; bx++;
          if (y === c.RMOST) break;
          y--; if (y < 0) break;
        }
      }
      if (!c.OFFRIGHT) mm[bs + bx] = ((carry | mm[bs + bx]) ^ carryim) | 0x80;
      ip += WIDTH;
      YCO = u8(YCO - 1); if (YCO === c.TOPEDGE) return;
    }
  }

  // ---------------------------------------------------------------- LAYRSAVE: save what LAY would cover, as an image
  function layrsave() {
    var im = P.IMAGE, WIDTH = im.w + 1, HEIGHT = im.h, XCO = P.XCO;
    if (P.OPACITY & 0x80) XCO = u8(XCO - im.w);
    var c = crop(XCO, P.YCO, WIDTH, HEIGHT);
    if (!c || !c.VISWIDTH) { P.PEELIMG = null; return; }
    var h = u8(c.YCO - c.TOPEDGE), w = c.VISWIDTH, data = new Uint8Array(w * h), YCO = c.YCO, page = P.PAGE, o = 0;
    work.rsave += w * h;
    for (;;) {
      var bs = base(YCO, page) + c.XCO;
      for (var y = 0; y < w; y++) data[o + y] = mem[bs + y];
      o += w;
      YCO = u8(YCO - 1); if (YCO === c.TOPEDGE) break;
    }
    P.PEELIMG = { w: w, h: h, data: data }; P.PEELXCO = c.XCO; P.PEELYCO = c.YCO;
  }

  // ---------------------------------------------------------------- the fast ones
  function fastlay() {
    var im = P.IMAGE, w = im.w, h = im.h, data = im.data, op = P.OPACITY & 0x7F;
    var x = P.YCO, top = P.YCO - h; if (top < 0) top = -1;
    var ip = 0, page = P.PAGE, xco = P.XCO;
    work.fast += w * (x - top);
    for (; x !== top; x--) {
      var bs = base(x, page) + xco;
      if (op === STA) for (var y = w - 1; y >= 0; y--) mem[bs + y] = data[ip + y];
      else for (y = w - 1; y >= 0; y--) mem[bs + y] = opstore(op, mem[bs + y], data[ip + y]);
      ip += w;
    }
  }
  function fastmask() {
    var im = P.IMAGE, w = im.w, h = im.h, data = im.data;
    var x = P.YCO, top = P.YCO - h; if (top < 0) top = -1;
    var ip = 0, page = P.PAGE, xco = P.XCO;
    work.fmask += w * (x - top);
    for (; x !== top; x--) {
      var bs = base(x, page) + xco;
      for (var y = w - 1; y >= 0; y--) mem[bs + y] &= MASKTAB[data[ip + y] & 0x7F];
      ip += w;
    }
  }
  function fastblack(width, height, color) {
    var x = P.YCO, top = u8(P.YCO - height), page = P.PAGE, xco = P.XCO;
    work.black += width * u8(x - top);
    do { var bs = base(x, page) + xco; for (var y = width - 1; y >= 0; y--) mem[bs + y] = color; x = u8(x - 1); } while (x !== top);
  }
  function peel(img, xco, yco) { P.IMAGE = img; P.XCO = xco; P.YCO = yco; P.OPACITY = STA; fastlay(); }
  function cls() { var o = P.PAGE << 8; for (var i = 0; i < 0x2000; i++) mem[o + i] = 0x80; work.cls += 0x2000; }
  function copyscrn(from, to) { mem.copyWithin(to << 8, from << 8, (from << 8) + 0x2000); work.copy += 0x2000; }
  function inverty() { for (var x = 191, y = 0; y < 96; x--, y++) { var t = YLO[x]; YLO[x] = YLO[y]; YLO[y] = t; t = YHI[x]; YHI[x] = YHI[y]; YHI[y] = t; } }

  // the page as 40x192 bytes, top line first, for the renderer
  function rows(page, out) { for (var y = 0; y < 192; y++) { var bs = base(y, page); for (var x = 0; x < 40; x++) out[y * 40 + x] = mem[bs + x]; } }

  return { P: P, mem: mem, work: work, YLO: YLO, YHI: YHI, base: base, lay: lay, fastlay: fastlay, fastmask: fastmask, fastblack: fastblack, layrsave: layrsave, peel: peel, cls: cls, copyscrn: copyscrn, inverty: inverty, rows: rows,
    AND: AND, ORA: ORA, STA: STA, EOR: EOR, MASK: MASK, MASKTAB: MASKTAB, MIRROR: MIRROR, SHIFT: SHIFT, CARRY: CARRY };
})();
if (typeof module !== 'undefined') module.exports = POP;
