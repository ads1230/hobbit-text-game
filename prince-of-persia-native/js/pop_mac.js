// pop_mac.js — the Macintosh version's art (Brøderbund, 1992) drawn by the Apple II game.  The Apple engine keeps
// running the game and drawing its hi-res pages; alongside, the same background routines report each block they
// draw and this module draws it again the way the Macintosh application did — its own piece tables, its own
// placement rules (the Mac's BGDATA routines, taken from its code) and its own shapes — onto a Mac-sized page:
// black-and-white at 512 x 334 or 256 colours at 640 x 400.  The Mac's coordinates: x in a 320-wide space (8 per
// Apple byte, 8/7 of an Apple pixel for the characters) and y in Apple rows, both through the Mac's scale tables
// in the 512-wide modes and doubled in the 640-wide one.  The shape files are used as the Mac kept them (LZSS-
// packed sets, each shape with its width, height and hot spot; the colour ones run-length coded).
var POP = POP || {};
POP.mac = (function () {
  'use strict';
  var HR = POP.hires, P = HR.P, G = POP.grafix, L = G.L, ST = POP.state, S = ST.S, BG = POP.bg;
  var TRANSPARENT = 255;
  var data = null, mode = null, W = 0, H = 0, PLAYH = 0, pages = [null, null], inverted = false;
  var files = {};                                              // kind -> { packed, sets: {rid: {shpt, raw, shapes}} }
  function s8(v) { return (v << 24) >> 24; }

  // ---------------------------------------------------------------- the shape files
  function b64(s) { var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  // LZSS as the Mac's unpacker: a flag byte, bits LSB first; 0 = a literal byte, 1 = a 16-bit token: length - 3 in the
  // high nibble, distance - 1 in the low twelve bits (beyond the start reads as zero)
  function unpack(src, off, plen, ulen) {
    var out = new Uint8Array(ulen), i = off, o = 0, end = off + plen;
    while (o < ulen && i < end) {
      var flags = src[i++];
      for (var b = 0; b < 8 && o < ulen; b++) {
        if ((flags >> b) & 1) {
          var w = (src[i] << 8) | src[i + 1]; i += 2;
          var n = (w >> 12) + 3, d = (w & 0xFFF) + 1;
          for (var k = 0; k < n; k++) { out[o] = o >= d ? out[o - d] : 0; o++; }
        } else out[o++] = src[i++];
      }
    }
    return out;
  }
  function file(kind) {
    var f = files[kind];
    if (f) return f;
    var src = data[kind], packed = b64(src.data), sets = {};
    for (var rid in src.sets) { var s = src.sets[rid]; sets[rid] = { name: s.name, off: s.off, plen: s.plen, ulen: s.ulen, shpt: s.shpt, raw: null, shapes: {} }; }
    return files[kind] = { packed: packed, sets: sets };
  }
  function setRaw(f, set) { if (!set.raw) set.raw = unpack(f.packed, set.off, set.plen, set.ulen); return set.raw; }
  // a shape: {w, h, xo, yo} and its planes (bw: and/or as rows of 16-bit words; colour: pix, 255 = transparent)
  function shape(kind, rid, slot) {
    var f = file(kind), set = f.sets[rid]; if (!set) return null;
    var cached = set.shapes[slot]; if (cached !== undefined) return cached;
    var o = set.shpt[slot]; if (o === undefined || o < 0) return set.shapes[slot] = null;
    var raw = setRaw(f, set), w = (raw[o] << 8) | raw[o + 1], h = (raw[o + 2] << 8) | raw[o + 3];
    var xo = ((raw[o + 4] << 8) | raw[o + 5]) << 16 >> 16, yo = ((raw[o + 6] << 8) | raw[o + 7]) << 16 >> 16;
    var sh = { w: w, h: h, xo: xo, yo: yo };
    if (kind === 'bw') {
      var words = (w + 15) >> 4, and = new Uint16Array(words * h), or = new Uint16Array(words * h), p = o + 8;
      for (var y = 0; y < h; y++) for (var k = 0; k < words; k++) { and[y * words + k] = (raw[p] << 8) | raw[p + 1]; or[y * words + k] = (raw[p + 2] << 8) | raw[p + 3]; p += 4; }
      sh.words = words; sh.and = and; sh.or = or;
    } else {
      // the run-length code of the Mac's colour blitter: c = byte; bit 7 starts the next row; n = c & $1f (+ next byte when $1f);
      // op = (c >> 5) & 3: 0 = end when n is 0, else n+1 pixels of the colour byte that follows; 1 = n+1 colour bytes;
      // 2 = n+1 transparent pixels; 3 = n > 0 begins a block repeated n+1 times, n = 0 ends it
      var pix = new Uint8Array(w * h); pix.fill(TRANSPARENT);
      var q = o + 8, x = 0, row = 0, stack = [];
      for (;;) {
        var c = raw[q++]; if (c === undefined) break;
        if (c & 0x80) { row++; x = 0; }
        var n = c & 0x1F; if (n === 0x1F) n += raw[q++];
        var op = (c >> 5) & 3;
        if (op === 0) {
          if (n === 0) break;
          var col = raw[q++];
          for (k = 0; k <= n; k++, x++) if (row < h && x < w) pix[row * w + x] = col;
        } else if (op === 1) { for (k = 0; k <= n; k++, x++) { col = raw[q++]; if (row < h && x < w) pix[row * w + x] = col; } }
        else if (op === 2) x += n + 1;
        else if (n > 0) stack.push([q, n]);
        else { if (!stack.length) break; var top = stack[stack.length - 1]; if (--top[1] < 0) stack.pop(); else q = top[0]; }
      }
      sh.pix = pix;
    }
    return set.shapes[slot] = sh;
  }

  // ---------------------------------------------------------------- the sets, the palette, the tables
  var SET = { swords: 700, objects: 150, prince: 400, princess: 800, princess1: 850, princess2: 900, chamber1: 950, chamber2: 960,
    dungeon: 1200, dblocks: 1360, guard: 1750, palace: 2200, pblocks: 2360, skeleton: 2750, fat: 3750, shadow: 4750, vizier: 5750, title1: 40, title2: 50 };
  var guardSets = ['guard', 'skeleton', 'guard', 'fat', 'shadow', 'vizier'];        // by the level's CHset, as the Apple's ch4 tables
  var CHARSET = { 700: true, 400: true, 1750: true, 2750: true, 3750: true, 4750: true, 5750: true, 800: true, 850: true, 900: true };
  var R = null, T = null;                                                            // the block-piece records and the tables
  var xtable = null, ytable = null, xfirst = 0, yfirst = 0;
  var palette = null, guardColor = -1;
  var SHADOWPAL = [5, 6, 7, 23, 24, 25, 16, 17, 3, 4, 5, 18, 19];                    // the shadow: the prince's colours 90..102 become these
  var PRINCEBASE = 90;
  function currentPalette() {
    var pal = data.palette.slice();
    for (var k = 0; k < 4 && data.stars; k++) pal[200 + k] = data.stars[k];
    if (guardColor >= 0 && guardColor < 8) for (var i = 0; i < 13; i++) pal[data.guardBase + i] = data.guards[guardColor][i];
    return pal;
  }
  function setGuardColor(c) { if (c === guardColor) return; guardColor = c; palette = currentPalette(); }
  function isPal() { return S.BGset1 === 1; }
  function MAIN() { return isPal() ? SET.palace : SET.dungeon; }
  function BLK() { return isPal() ? SET.pblocks : SET.dblocks; }
  function guardSet() { return SET[guardSets[S.CHset] || 'guard']; }
  var is640 = false, isColor = false;

  // the Mac's coordinates: x from the 320-wide space, y from the Apple's row
  function mx(x320) { if (is640) return x320 * 2; var i = x320 - xfirst; return i < 0 ? xtable[0] + (i * 8 / 5 | 0) : (i < xtable.length ? xtable[i] : xtable[xtable.length - 1] + ((i - xtable.length + 1) * 8 / 5 | 0)); }
  function my(y) { if (is640) return y * 2; var i = y - yfirst; return i < 0 ? ytable[0] + (i * 5 / 3 | 0) : (i < ytable.length ? ytable[i] : ytable[ytable.length - 1] + ((i - ytable.length + 1) * 5 / 3 | 0)); }
  function x320of(px) { return px >= 0 ? Math.floor(px * 8 / 7) : -Math.floor(-px * 8 / 7); }   // the Mac's own: x * 8 / 7, truncated
  // the Mac's random numbers: a 32-bit state, seeded from the screen and block so a wall's pattern never changes
  var seed = 0;
  function rnd(n) {
    var lo = seed & 0xFFFF, hi = (seed >>> 16) & 0xFFFF, w = ((lo ^ 0x569A) + hi) & 0xFFFF;
    seed = (w * 0x6A59) >>> 0;
    var v = ((seed & 0xFFFF) + lo) & 0xFFFF;
    return (v * (n + 1)) >>> 16;
  }

  // ---------------------------------------------------------------- the pages
  function begin(kind) {
    mode = kind === 'color' ? 'color' : 'bw'; is640 = isColor = mode === 'color';
    if (is640) { W = 640; H = 400; PLAYH = 384; } else { W = 512; H = 334; PLAYH = 318; }
    pages = [new Uint8Array(W * H), new Uint8Array(W * H)];
    xtable = data.xtable.values; xfirst = data.xtable.first; ytable = data.ytable.values; yfirst = data.ytable.first;
    R = data.records; T = data.tables;
    inverted = false; peels = [[], []]; wallScrn = -1; lastScrn = -1;
    palette = currentPalette();
    cls(0); cls(1); band.dirty = true;
  }
  var BLACK = 2, WHITE = 0;                                     // colour indices in the Mac's palette; the b&w page holds 1 for black
  function ink() { return isColor ? BLACK : 1; }
  function paper() { return isColor ? WHITE : 0; }
  function pageOf() { return pages[P.PAGE ? 1 : 0]; }
  function cls(n) { pages[n].fill(ink(), 0, W * PLAYH); }
  function fillRect(page, x0, y0, x1, y1, v) {                 // rows as the page shows them (through py)
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 > W) x1 = W; if (y1 > H) y1 = H;
    for (var y = y0; y < y1; y++) page.fill(v, py(y) * W + x0, py(y) * W + x1);
  }
  function py(y) { return inverted && y < PLAYH ? PLAYH - 1 - y : y; }

  // draw a shape with its top-left at (left, top); op: 'mask' (the Mac's own AND then OR), 'recol' (the prince's colours
  // replaced by the shadow's); clip: {x0, y0, x1, y1} in Mac pixels (the play area when null)
  function blit(page, sh, left, top, flip, op, clip) {
    var x0 = clip ? Math.max(0, clip.x0) : 0, x1 = clip ? Math.min(W, clip.x1) : W, y0 = clip ? Math.max(0, clip.y0) : 0, y1 = clip ? Math.min(H, clip.y1) : PLAYH;
    var w = sh.w, h = sh.h;
    if (mode === 'bw') {
      var words = sh.words;
      for (var r = 0; r < h; r++) {
        var yy = top + r; if (yy < y0 || yy >= y1) continue;
        var prow = py(yy) * W, arow = r * words;
        for (var c = 0; c < w; c++) {
          var xx = flip ? left + w - 1 - c : left + c; if (xx < x0 || xx >= x1) continue;
          var bit = 15 - (c & 15), k = arow + (c >> 4);
          var a = (sh.and[k] >> bit) & 1, o = (sh.or[k] >> bit) & 1, p = prow + xx;
          if (!a) page[p] = 0; if (o) page[p] = 1;
        }
      }
    } else {
      var pix = sh.pix, recol = op === 'recol';
      for (r = 0; r < h; r++) {
        yy = top + r; if (yy < y0 || yy >= y1) continue;
        prow = py(yy) * W; var srow = r * w;
        for (c = 0; c < w; c++) {
          xx = flip ? left + w - 1 - c : left + c; if (xx < x0 || xx >= x1) continue;
          var v = pix[srow + c]; if (v === TRANSPARENT) continue;
          if (recol && v >= PRINCEBASE && v < PRINCEBASE + 13) v = SHADOWPAL[v - PRINCEBASE];
          page[prow + xx] = v;
        }
      }
    }
  }
  // a shape at its Mac anchor (x, y) in Mac pixels: the Mac's own placement rule (flipped: the hot spot from the right)
  function drawAt(page, set, slot, x, y, flip, op, clip) {
    var sh = shape(mode, set, slot); if (!sh) return null;
    var left = flip ? x + sh.xo - sh.w : x - sh.xo, top = y - sh.yo;
    blit(page, sh, left, top, flip, op, clip);
    return { left: left, top: top, w: sh.w, h: sh.h };
  }
  // save and restore what a character covers (the Apple's LAYRSAVE and PEEL): the region is kept with the peel entry
  var peels = [[], []];
  function saveRegion(page, rect) {
    var x0 = Math.max(0, rect.left), y0 = Math.max(0, rect.top), x1 = Math.min(W, rect.left + rect.w), y1 = Math.min(PLAYH, rect.top + rect.h);
    if (x1 <= x0 || y1 <= y0) return null;
    var buf = new Uint8Array((x1 - x0) * (y1 - y0)), o = 0;
    for (var y = y0; y < y1; y++) { var row = py(y) * W; for (var x = x0; x < x1; x++) buf[o++] = page[row + x]; }
    return { x0: x0, y0: y0, x1: x1, y1: y1, buf: buf, inverted: inverted };
  }
  function restoreRegion(page, r) {
    var o = 0, inv = inverted; inverted = r.inverted;
    for (var y = r.y0; y < r.y1; y++) { var row = py(y) * W; for (var x = r.x0; x < r.x1; x++) page[row + x] = r.buf[o++]; }
    inverted = inv;
  }
  function pushPeel(page, rect) { if (!rect) return; peels[P.PAGE ? 1 : 0].push(saveRegion(page, rect)); }

  // ---------------------------------------------------------------- the lists (the Mac's ADDBACK, ADDMID, ADDFORE, ADDWIPE)
  var ML = { wipe: [], bg: [], mid: [], fg: [] };
  var addfn = null;                                              // the Mac's 'add' pointer: addback, or addmid while a floor is drawn under the prince
  function addback(set, img, xb, xo, y, ct) { if (!img) return; ML.bg.push({ set: set, img: img, x: xb * 8 + xo, y: y, ct: ct === undefined ? null : ct }); }
  function addmid(set, img, xb, xo, y, o) {
    if (!img) return;
    o = o || {};
    ML.mid.push({ set: set, img: img, x: xb * 8 + xo, y: y, ez: !!o.ez, recol: !!o.recol, flip: !!o.flip, clip: o.clip || null, x320: o.x320 });
  }
  function addfore(set, img, xb, xo, y, cr) { if (!img) return; ML.fg.push({ set: set, img: img, x: xb * 8 + xo, y: y, cr: cr === undefined ? null : cr, ct: null }); }
  function addwipe(kind, xb, y, h, wb, col) { ML.wipe.push({ kind: kind, x: xb * 8, y: y + 1, w: wb * 8, h: h, col: col }); }
  function zerolsts() { ML.wipe.length = 0; ML.bg.length = 0; ML.mid.length = 0; ML.fg.length = 0; addfn = addback; }

  // ---------------------------------------------------------------- the Mac's BGDATA: the pieces of each block
  // c: the block being drawn {o, s, p, sp, col, row, Ay, Dy, bx, below, sbelow} as the Apple's routines have it
  function spikey(s) { return (s & 0x80) ? 5 : s; }
  function loosey(s) { if (!(s & 0x80)) return s; s &= 0x7F; return s > 10 ? 1 : s; }
  function flaskimg(s) {                                        // the flask's liquid by its bubble frame, by potion in colour
    var t = s & 0xE0, base;
    if (t === 0) return 0;
    if (t === 0x20) base = 0; else if (t === 0x40) return 0; else if (t === 0x60 || t === 0x80) base = 6; else if (t === 0xA0 || t === 0xC0) base = 12; else base = 0;
    var f = s & 0x1F; if (f > 8) f = 0; if (f > 6) f = ((f - 1) % 6) + 1;    // the Apple cycles eight bubble frames, the Mac six
    var img = T.flaskimg[f] || 0;
    return img && isColor ? img + base : img;
  }
  function checkc(o) { return o === 0 || o === 9 || o === 12 || o === 26; }
  function drawc(c) {
    if (!checkc(c.o)) return;
    var b = c.below, sb = c.sbelow;
    if (b === 7 || b === 12) { if (isPal()) addback(MAIN(), sb < 4 ? T.panelc[sb] : 0, c.bx, 0, c.Dy); }
    else if (b === 20) addback(BLK(), 2, c.bx, 0, c.Dy);
    else addback(MAIN(), R[b][7], c.bx, 0, c.Dy);
    if (R[c.p][4]) addback(MAIN(), 42, c.bx, 0, c.Ay + s8(R[1][5]));      // the floor's edge over what the piece above covers
  }
  function drawmc(c) {
    if (!(c.o === 0 || c.o === 12 || c.o === 9) || c.below !== 4) return;
    var st = Math.min(c.sbelow, 188), pos = st >> 2;
    if (is640) { addback(MAIN(), 68, c.bx, 0, c.Dy); addback(MAIN(), T.gate8c[pos % 8], c.bx, 0, c.Dy); }
    else { addback(MAIN(), 52, c.bx, 0, c.Dy); if (pos > 45) pos = 45; addback(MAIN(), 53 + T.gate512[pos], c.bx, 0, c.Dy); }
  }
  function drawb(c) {
    if (c.o === 20) return;
    var p = c.p, s = c.sp, rec = R[p], B = rec[3], by = s8(rec[5]), bx = c.bx, Ay = c.Ay;
    if (p === 0) { if (s > 3) return; addback(MAIN(), T.spaceb[s], bx, 0, Ay + T.spaceby[s]); return; }
    if (p === 1) {
      addfn(MAIN(), 42, bx, 0, Ay + by);
      if (s > 3) s = 0;
      if (!isPal()) { if (s === 0) return; addback(MAIN(), T.floorb[s], bx, 0, Ay - 20); }
      else { if (s === 1) return; addback(MAIN(), T.floorb[s], bx, 0, Ay + 2); }
      return;
    }
    if (p === 7 || p === 12) { if (isPal()) addback(MAIN(), s < 4 ? T.panelb[s] : 0, bx, 0, Ay + by); return; }
    if (p === 20) { if (isPal() && !(s & 0x80)) addback(MAIN(), 84, bx + 3, 0, Ay - 27); addback(BLK(), 1, bx, 0, Ay + by); return; }
    if (B) addback(MAIN(), B, bx, 0, Ay + by);
    if (isPal()) addback(MAIN(), rec[6], bx, 0, Ay - 27);
    if (p === 19) addback(MAIN(), 146, bx, 0, c.Dy - 28);                  // the torch's bracket
  }
  function drawmb(c) {
    var p = c.p, s = c.sp;
    if (p === 2) addback(MAIN(), T.spikeb[spikey(s)], c.bx, 0, c.Ay - 7);
    else if (p === 4) drawgateb(c);
    else if (p === 11) addback(MAIN(), T.looseb[loosey(s)], c.bx, 0, c.Dy - 1);
    else if (p === 16) drawexitb(c);
    else if (p === 19) { if (s <= 17) addback(SET.objects, BG.ptorchflame[s], c.bx + 1, isPal() ? 1 : 0, c.Ay - (isPal() ? 42 : 40)); }
  }
  function drawd(c, fore) {
    var set = MAIN(), img;
    if (c.o === 20) { set = BLK(); img = isPal() ? 3 : T.wallD[c.s & 7]; } else img = R[c.o][8];
    addfn(set, img, c.bx, 0, c.Dy);
    if (fore) addfore(set, img, c.bx, 0, c.Dy);
    if (set === BLK() && isPal()) palaceWallD(c);
  }
  function drawmd(c) {
    if (c.o !== 11) return;
    var img = T.loosed[loosey(c.s)];
    addback(MAIN(), img, c.bx, 0, c.Dy); addfore(MAIN(), img, c.bx, 0, c.Dy);
  }
  function drawa(c) {
    var y = c.Ay, img;
    if (c.p === 26 && c.o === 12) { img = 6; y += 3; }
    else if (c.o === 11) img = T.loosea[loosey(c.s)];
    else if (c.o === 15 && c.p === 0) img = 148;
    else img = R[c.o][0];
    addfn(MAIN(), img, c.bx, 0, y + s8(R[c.o][2]));
  }
  function drawma(c) {
    var o = c.o, s = c.s, bx = c.bx, Ay = c.Ay;
    if (o === 2) addfn(MAIN(), T.spikea[spikey(s)], bx, 0, Ay - 2);
    else if (o === 10) addmid(SET.objects, flaskimg(s), bx + 3, 1, Ay - 14, { ez: true });
    else if (o === 18) {
      var q = T.slicerseq[Math.min(s & 0x7F, 6)];
      addback(MAIN(), T.slicerbot[q], bx, 0, Ay); addback(MAIN(), T.slicertop[q], bx, 0, Ay - T.slicerbot2[q]);
      if (s & 0x80) addback(MAIN(), 114 + q, bx + 1, 4, Ay - 6);
    }
    else if (o === 22) { if (s === 1) addmid(SET.objects, 11, bx, 0, Ay - 3, { ez: true }); else addmid(SET.objects, 10, bx, 0, Ay - 3); }
  }
  function rightclip(c) { return BG.objAt(c.row, c.col + 1).o === 20 ? (c.col + 1) * 32 : null; }   // a front piece stops at a wall to its right
  function drawfrnt(c) {
    if (c.p === 4 && c.row === ST.Kid.BlockY && ((c.col - 1) & 0xFF) === ST.Kid.BlockX && S.scrnRight !== ST.Kid.Scrn) drawgatebf(c);
    var o = c.o, s = c.s, rec = R[o], F = rec[9], x = c.bx + s8(rec[10]), y = c.Ay + s8(rec[11]), bx = c.bx, Ay = c.Ay;
    if (o === 2) addfore(MAIN(), T.spikec[spikey(s)], bx, 0, Ay - 2, rightclip(c));
    else if (o === 10) {
      if (isPal()) F += 2; if ((s & 0xE0) === 0x40) F += 1;
      addfore(SET.objects, F, x, 0, y); addfore(SET.objects, flaskimg(s), bx + 3, 1, Ay - 14, rightclip(c));
    }
    else if (o === 14) addfore(MAIN(), F, x, 0, y, rightclip(c));
    else if (o === 18) { var q = T.slicerseq[Math.min(s & 0x7F, 6)]; addfore(MAIN(), T.slicerfrnt[q], bx, 0, Ay); if (s & 0x80) addfore(MAIN(), 119 + q, bx + 1, 4, Ay - 6); }
    else if (o === 20) { if (isPal()) palaceWallF(c); else addfore(BLK(), T.wallF[s & 7], bx, 0, Ay); }
    else if (F) addfore(MAIN(), F, x, 0, y);
  }
  function wipe(c, h) { addwipe(0, c.bx, c.Dy, h, 4, 2); }
  function wiped(c) { addwipe(0, c.bx, c.Dy, 3, 4, 2); }
  function drawflr(c) { drawb(c); drawmb(c); drawa(c); drawma(c); drawd(c, false); drawmd(c); }
  function drawfloor(c) {
    if (c.p === 0) { addfn = addmid; drawflr(c); }
    else if (c.o !== 0 && c.col > 0 && BG.objAt(c.row, c.col - 2).o === 0) { addfn = addmid; drawflr(c); addfn = addback; drawflr(c); }
    addfn = addback;
  }
  var CUTYPES = { 1: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 11: 1, 16: 1, 18: 1, 19: 1, 25: 1 };
  function drawhalf(c) {
    if (c.p !== 0 || ST.Kid.Face !== 0 || ST.Kid.BlockX !== c.col) return;
    addfn = addmid;
    if (CUTYPES[c.o]) {
      var img = T.cuPiece[ST.Kid.Posn] || 0; if (img >= 256) img = 0;
      addmid(MAIN(), img, c.bx, 0, c.Ay + (c.o === 5 ? 1 : 0));
      drawd(c, false); drawmd(c);
    } else drawflr(c);
    addfn = addback;
  }
  // the gate: its bottom, its bars up to the block's top, the part that shows in the block above
  function setupdgb(c) {
    var thr = c.Dy - 62, st = Math.min(c.sp, 188), pos = st >> 2;
    if (!is640 && pos > 45) pos = 45;
    pos += 1;
    return { thr: thr, bot: c.Ay - pos };
  }
  function drawgateb(c) {
    var g = setupdgb(c), bx = c.bx, y;
    if (is640) {
      addwipe(0, bx, g.bot, g.bot - g.thr + 1, 3, 2);
      if (g.bot + 12 < c.Ay) addback(MAIN(), 50, bx, 0, g.bot);
      else {
        addback(MAIN(), R[4][3], bx, 0, c.Ay + s8(R[4][5]));                // restore what the bottom's piece covers
        if (checkc(c.o)) drawc1(c);
        drawd(c, false); drawmd(c); drawa(c);
        addback(MAIN(), 51, bx, 0, g.bot - 2);
      }
      y = g.bot - 12; if (y >= 192) return;
      while (y - 8 >= g.thr) { addback(MAIN(), 52, bx, 0, y); y -= 8; }
      var h = y - g.thr; if (h < 0 || h > 7) return;
      addback(MAIN(), T.gate8b[h], bx, 0, y);
    } else {
      addback(MAIN(), 50, bx, 0, c.Ay);
      addback(MAIN(), 51, bx, 0, g.bot, my(g.thr));
    }
  }
  function drawc1(c) {                                           // the Mac's dodrawc (drawc without the check)
    var b = c.below, sb = c.sbelow;
    if (b === 7 || b === 12) { if (isPal()) addback(MAIN(), sb < 4 ? T.panelc[sb] : 0, c.bx, 0, c.Dy); }
    else if (b === 20) addback(BLK(), 2, c.bx, 0, c.Dy);
    else addback(MAIN(), R[b][7], c.bx, 0, c.Dy);
  }
  function drawgatebf(c) {
    var g = setupdgb(c), bx = c.bx, y;
    if (is640) {
      addfore(MAIN(), 51, bx, 0, g.bot - 2);
      y = g.bot - 12; if (y >= 192) return;
      while (y - 8 >= g.thr) { addfore(MAIN(), 52, bx, 0, y); y -= 8; }
      var h = y - g.thr; if (h < 0 || h > 7) return;
      addfore(MAIN(), T.gate8b[h], bx, 0, y);
    } else { addfore(MAIN(), 51, bx, 0, g.bot); ML.fg[ML.fg.length - 1].ct = my(g.thr); }
  }
  // the exit door: its frame, the stairs behind it when it is not the way in, the door itself risen by its state
  function drawexitb(c) {
    var x = c.bx + 1, y = c.Ay - 13, door = y - c.sp;
    var frame = shape(mode, MAIN(), 99), top = frame ? my(y) - frame.yo : null;
    addback(MAIN(), 99, x, 0, y);
    if (ST.blue[ST.KidStartScrn] !== S.SCRNUM && c.sp !== 0) addback(MAIN(), 144, x, 0, y);
    addback(MAIN(), 33, x, 0, door, top);
  }
  // the palace's walls in colour: bands of the screen's brick colours and random brick lines from the blocks set
  var wallScrn = -1, wallT = null;
  function wallTables() {
    if (wallScrn === S.SCRNUM && wallT) return wallT;
    wallScrn = S.SCRNUM; wallT = [];
    seed = S.SCRNUM & 0xFFFF; rnd(1);
    for (var row = 0; row < 3; row++) {
      var t = []; wallT.push(t);
      for (var band = 0; band < 4; band++) {
        var prev = -1;
        for (var col = 0; col <= 10; col++) {
          var v; do { v = 0x4C + ((band & 1) ? 4 : 0) + rnd(3); } while (v === prev);
          t[band * 11 + col] = v; prev = v;
        }
      }
    }
    return wallT;
  }
  function seedBlock(c) { seed = (c.col + c.row * 10 + S.SCRNUM) & 0xFFFF; }
  function palaceWallD(c) {
    if (!isColor) return;
    var save = seed; seedBlock(c);
    var t = wallTables()[c.row];
    addwipe(0, c.bx, c.Dy, 3, 4, t[33 + c.col]);
    if (is640) addback(BLK(), 15 + rnd(2), c.bx, 0, c.Dy);
    seed = save;
  }
  function palaceWallF(c) {
    var save = seed; seedBlock(c);
    var bx = c.bx, Ay = c.Ay;
    if (isColor) {
      var t = wallTables()[c.row];
      addwipe(1, bx, Ay - 40, 20, 4, t[c.col]);
      addwipe(1, bx, Ay - 19, 21, 2, t[11 + c.col]); addwipe(1, bx + 2, Ay - 19, 21, 2, t[12 + c.col]);
      addwipe(1, bx, Ay, 19, 1, t[22 + c.col]); addwipe(1, bx + 1, Ay, 19, 3, t[23 + c.col]);
      addwipe(1, bx, c.Dy, 3, 4, t[33 + c.col]);
    }
    if (isColor && is640) {
      addfore(BLK(), 15 + rnd(2), bx, 0, c.Dy);
      addfore(BLK(), 3 + rnd(2), bx + 3, 0, Ay - 53);
      addfore(BLK(), 6 + rnd(2), bx, 0, Ay - 34);
      addfore(BLK(), 9 + rnd(2), bx, 0, Ay - 13);
      addfore(BLK(), 12 + rnd(2), bx, 0, Ay);
    }
    if (!is640) addfore(BLK(), 4, bx, 0, Ay);
    seed = save;
  }

  // ---------------------------------------------------------------- the characters (the Mac's DRAWOBJS)
  var macFrame = null, sword = null;                             // set by the engine's frame lookups, read when a character is queued
  function onFrame(posn, id, fp) {
    var FD = POP.data.FD, rec;
    if (fp >= FD.swordtab) rec = null;
    else if (fp >= FD.altset2) rec = data.altset2[(fp - FD.altset2) / 5];
    else if (fp >= FD.altset1) rec = data.altset1[(fp - FD.altset1) / 5];
    else rec = data.frames[fp / 5];
    macFrame = rec ? { slot: rec[0] === 0xFF ? 0 : rec[0] + 1, tab: rec[1] >> 6 } : null;
  }
  function onSword(n) {                                          // before the Apple adds its own offsets: the Mac's are added to the character's position
    var rec = data.swords[n - 1]; if (!rec) { sword = null; return; }
    var dx = s8(rec[1]), dy = s8(rec[2]);
    if (!is640 && data.swords512[n]) dx += data.swords512[n];
    var x = x320of(ST.fcharx16()), face = S.FCharFace & 0x80;
    sword = { slot: rec[0] === 0xFF ? 0 : rec[0] + 1, x320: face ? x - dx : x + dx, y: (S.FCharY + dy) & 0xFF };
  }
  function setOfTab(tab) {
    if (tab === 3) return guardSet();
    if (tab === 1) return SET.princess;
    if (tab === 2) return cutPrincessSet;
    return SET.prince;
  }
  var cutPrincessSet = 850;
  function charX320(o) { var xb = o.x >= 0xC0 ? o.x - 256 : o.x; return x320of(xb * 7 + o.off); }
  function charClip(o) {
    if (o.cu === undefined) return null;
    return { x0: mx(o.cl * 8), x1: mx(o.cr * 8), y0: my(o.cu), y1: my(o.cd === undefined ? 192 : o.cd) };
  }
  function drawobjx(o) {
    var t = o.typ;
    if (t === ST.TypeFF) {
      var i = o.img;
      addmid(MAIN(), T.loosea[i], o.x, 0, (o.y - 3) & 0xFF, { ez: true });
      addmid(MAIN(), T.loosed[i], o.x, 0, o.y, { ez: true });
      addmid(MAIN(), T.looseb[i], o.x + 4, 0, (o.y - 1) & 0xFF, { ez: true });
      return;
    }
    if (t & 0x80) return;
    var m = o.mac; if (!m || !m.slot) return;
    var flip = !(o.face & 0x80), opt = { ez: true, flip: flip, clip: charClip(o) };
    if (t === ST.TypeKid || t === ST.TypeReflect) { if (S.backtolife && P.PAGE === 0) return; if (S.mergetimer !== 0 && !(S.mergetimer & 1)) opt.recol = true; }
    else if (t === ST.TypeShad) opt.recol = true;
    opt.x320 = m.x320 !== undefined ? m.x320 : charX320(o);
    addmid(m.set, m.slot, 0, 0, m.y !== undefined ? m.y : o.y, opt);
  }

  // ---------------------------------------------------------------- DRAWALL: the lists onto the page
  function drawWipe(page, w) {
    var x0 = mx(w.x), x1 = mx(w.x + w.w), y0 = my(w.y - w.h), y1 = my(w.y);
    var v = w.col ? (isColor ? w.col : 1) : paper();
    if (y1 > PLAYH) y1 = PLAYH;
    fillRect(page, x0, y0, x1, y1, v);
  }
  function drawEntry(page, e, list) {
    var x = e.x320 !== undefined ? e.x320 : e.x, clip = null;
    if (e.ct !== null && e.ct !== undefined) clip = { x0: 0, x1: W, y0: e.ct, y1: PLAYH };
    if (e.cr !== null && e.cr !== undefined) clip = { x0: 0, x1: mx(e.cr), y0: 0, y1: PLAYH };
    if (e.clip) clip = e.clip;
    var sh = shape(mode, e.set, e.img); if (!sh) { noteUnmapped('set ' + e.set + ' slot ' + e.img); return; }
    var X = mx(x), Y = my(e.y), left = e.flip ? X + sh.xo - sh.w : X - sh.xo, top = Y - sh.yo;
    if (POP.macTrace) POP.macTrace(list, e, left, top, sh);
    if (e.ez) pushPeel(page, { left: left, top: top, w: sh.w, h: sh.h });
    blit(page, sh, left, top, e.flip, e.recol ? 'recol' : 'mask', clip);
  }
  var unmapped = {};
  function noteUnmapped(key) { if (!unmapped[key]) { unmapped[key] = 1; if (typeof console !== 'undefined' && console.log) console.log('mac: no shape for', key); } }
  var lastScrn = -1;
  function drawallMac() {
    if (inCut && POP.top.mode() !== 'cut') inCut = false;
    if (S.SCRNUM !== lastScrn) { lastScrn = S.SCRNUM; var gc = data.guardColor[S.level] && data.guardColor[S.level][S.SCRNUM - 1]; if (gc !== undefined && gc !== 255) setGuardColor(gc); }
    var page = pageOf(), which = P.PAGE ? 1 : 0, i;
    if (L.genCLS) cls(which);
    var list = peels[which]; for (i = list.length - 1; i >= 0; i--) if (list[i]) restoreRegion(page, list[i]);
    peels[which] = [];
    for (i = 0; i < ML.wipe.length; i++) if (ML.wipe[i].kind === 0) drawWipe(page, ML.wipe[i]);
    for (i = 0; i < ML.bg.length; i++) drawEntry(page, ML.bg[i], 'bg');
    for (i = 0; i < ML.mid.length; i++) drawEntry(page, ML.mid[i], 'mid');
    for (i = 0; i < ML.wipe.length; i++) if (ML.wipe[i].kind === 1) drawWipe(page, ML.wipe[i]);
    for (i = 0; i < ML.fg.length; i++) drawEntry(page, ML.fg[i], 'fg');
    zerolsts();
    if (band.dirty) drawBand();
  }

  // ---------------------------------------------------------------- the band under the play area: the meters and the messages
  var band = { dirty: true, msg: '', timer: 0, kid: 0, kidMax: 0, opp: 0 };
  var font = null;
  function loadFont() {
    if (font || !data.font) return font;
    var d = b64(data.font), v = new DataView(d.buffer);
    var f = { firstChar: v.getUint16(2), lastChar: v.getUint16(4), kernMax: v.getInt16(8), height: v.getUint16(14), owTLoc: v.getUint16(16), ascent: v.getUint16(18), rowWords: v.getUint16(24) };
    f.rowBytes = f.rowWords * 2; f.strike = d.subarray(26, 26 + f.rowBytes * f.height);
    var n = f.lastChar - f.firstChar + 3, locOff = 26 + f.rowBytes * f.height, owOff = 16 + 2 * f.owTLoc;
    f.loc = []; f.ow = [];
    for (var i = 0; i < n; i++) { f.loc.push(v.getUint16(locOff + 2 * i)); f.ow.push(v.getUint16(owOff + 2 * i)); }
    return font = f;
  }
  function textWidth(s) {
    var f = loadFont(), w = 0; if (!f) return 0;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i) - f.firstChar, ow = f.ow[c]; if (ow === undefined || ow === 0xFFFF) continue; w += ow & 0xFF; }
    return w;
  }
  function drawText(s, x, baseline, v) {                         // both pages: the band is not flipped
    var f = loadFont(); if (!f) return;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i) - f.firstChar, ow = f.ow[c]; if (ow === undefined || ow === 0xFFFF) continue;
      var off = (ow >> 8) << 24 >> 24, adv = ow & 0xFF, l = f.loc[c], r = f.loc[c + 1], left = x + f.kernMax + off;
      for (var y = 0; y < f.height; y++) {
        var yy = baseline - f.ascent + y; if (yy < PLAYH || yy >= H) continue;
        for (var xx = l; xx < r; xx++) {
          if (!((f.strike[y * f.rowBytes + (xx >> 3)] >> (7 - (xx & 7))) & 1)) continue;
          var px = left + xx - l; if (px < 0 || px >= W) continue;
          pages[0][yy * W + px] = v; pages[1][yy * W + px] = v;
        }
      }
      x += adv;
    }
  }
  function bandRects() {
    var cx = is640 ? 320 : 255, half = is640 ? 150 : 120, right = is640 ? 640 : 510;
    return { left: [0, cx - half], msg: [cx - half, cx + half], right: [cx + half, right] };
  }
  function drawBand() {
    band.dirty = false;
    var rc = bandRects(), pg, n;
    for (n = 0; n < 2; n++) fillRect(pages[n], 0, PLAYH, W, H, ink());
    var clip = { x0: 0, x1: W, y0: PLAYH, y1: H }, y = my(198), step = mx(8);
    for (n = 0; n < 2; n++) {
      pg = pages[n];
      for (var i = 0; i < band.kidMax; i++) drawAt(pg, SET.prince, i < band.kid ? 217 : 218, mx(4) + i * step, y, false, 'mask', clip);
      for (i = 0; i < band.opp; i++) drawAt(pg, guardSet(), 1, mx(308) - i * step, y, false, 'mask', clip);
    }
    if (band.msg) { var w = textWidth(band.msg); drawText(band.msg, rc.msg[0] + ((rc.msg[1] - rc.msg[0] - w) >> 1), H - 1, paper()); }
  }
  function setMeters(kid, kidMax, opp) { if (kid === band.kid && kidMax === band.kidMax && opp === band.opp) return; band.kid = kid; band.kidMax = kidMax; band.opp = opp; band.dirty = true; }
  function kidmeter() {
    var n = S.KidStrength; if (n === 1 && P.PAGE === 0) n = 0;
    setMeters(n, S.MaxKidStr, band.opp);
  }
  function oppmeter() {
    var n = S.OppStrength, id = ST.Shad.ID;
    if (id === 24 || id === 4) n = 0;
    if (n === 1 && P.PAGE === 0) n = 0;
    setMeters(band.kid, band.kidMax, n);
  }
  function showMsg(text, ticks) { band.msg = text.toUpperCase(); band.timer = ticks; band.dirty = true; }
  function bcd(v) { return (v >> 4) * 10 + (v & 15); }
  function two(n, blank) { var t = Math.floor(n / 10) % 10, u = n % 10; return (t === 0 && blank ? ' ' : String(t)) + String(u); }
  function msg(kind) {
    if (kind === 'level') { var lv = S.level; if (lv >= 13) lv = 12; if (lv === 15) return; showMsg('Level ' + (lv < 10 ? lv + ' ' : String(lv)), 24); }
    else if (kind === 'time') {
      POP.top.getminleft();
      var m = bcd(S.MinLeft), sec = bcd(S.SecLeft);                     // the Apple keeps them in BCD
      if (m >= 2) showMsg(two(m, true) + ' minutes left', 24);
      else if (sec >= 2) showMsg(two(sec, true) + ' seconds left', 24);
      else if (sec === 1) showMsg(' 1 second left', 12);
      else showMsg('Time has expired!', 24);
    }
    else if (kind === 'continue') showMsg('Press any key to continue', 30000);
  }
  function tickBand() { if (band.timer > 0 && --band.timer === 0) { band.msg = ''; band.dirty = true; } }

  // ---------------------------------------------------------------- the princess's room (the cut scenes)
  // The Apple's room picture, post, hourglass, sand, torches and stars have the Mac's shapes drawn at the same places:
  // the room (Chamber 1) on both pages, the rest through the cut's events
  var inCut = false, lastCut = 1;
  function cutRoom(n) {
    lastCut = n; cutPrincessSet = n === 0 ? SET.princess1 : SET.princess2;
    inCut = true; peels = [[], []]; zerolsts();
    for (var pg = 0; pg < 2; pg++) { cls(pg); drawAt(pages[pg], SET.chamber1, 1, 0, 0, false, 'mask', null); }
    band.kid = band.kidMax = band.opp = 0; band.msg = ''; band.timer = 0; band.dirty = true;
  }
  function redrawRoom() { cutRoom(lastCut); if (S.GlassState) S.redrawglass = 2; }
  // the Mac's own places for the room's fixtures (its cut-scene code): the post, the hourglass and its sand, the torches
  function cutPost() { addfore(SET.chamber2, 2, 30, 2, 167); }
  function macGlass(a) { return a === 0 ? 1 : a === 1 ? 2 : a >= 8 ? 7 : Math.max(1, a - 1); }   // the Apple's nine states to the Mac's seven
  function glassY() { return is640 ? 168 : 165; }
  function cutGlass(state) { addback(SET.chamber2, 2 + macGlass(state), 19, 0, glassY()); }
  function cutFlow(frame) {
    var st = macGlass(S.GlassState); if (st >= 7) return;
    var page = pageOf();
    drawAt(page, SET.chamber2, 2 + st, mx(19 * 8), my(glassY()), false, 'mask', null);
    drawAt(page, SET.chamber2, 10 + frame, mx(20 * 8), my(is640 ? 164 : 161), false, 'mask', null);
  }
  function cutBurn(xb, off, y, state) {
    var x320 = xb === 13 ? 9 * 8 + 6 : 36 * 8 + 2;
    drawAt(pageOf(), SET.chamber2, 13 + ((BG.ptorchflame[state] - 1) % 3), mx(x320), my(121), false, 'mask', null);
  }
  function cutTwinkle(n, xb, y) {                             // a small star in the window, lit or put out, on both pages
    var x = mx(xb * 8 + 4), yy = my(y) - 2;
    var pts = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
    for (var pg = 0; pg < 2; pg++) {
      var page = pages[pg], on = page[py(yy) * W + x] === paper();
      for (var i = 0; i < pts.length; i++) {
        var px = x + pts[i][0], pyy = yy + pts[i][1]; if (px < 0 || px >= W || pyy < 0 || pyy >= PLAYH) continue;
        var q = py(pyy) * W + px;
        if (on) page[q] = ink(); else page[q] = isColor ? (i === 0 ? 0 : 200 + (n & 3)) : 0;
      }
    }
  }
  // the title pictures: the Mac's pages composed from the Title sets — the frame over a colour, the splash and its texts
  var TITLE = {
    splash: [['fill', 2], ['frame'], [50, 1, 0, 0]],
    presents: [['fill', 2], ['frame'], [50, 1, 0, 0], [50, 2, 92, 106]],
    byline: [['fill', 2], ['frame'], [50, 1, 0, 0], [50, 3, 96, 122]],
    title: [['fill', 2], ['frame'], [50, 1, 0, 0], [50, 4, 23, 107], [50, 5, 40, 184]],
    prolog: [['fill', 0x17], ['frame'], [40, 2, 24, 25]],
    sumup: [['fill', 0x17], ['frame'], [40, 3, 24, 25]],
    epilog: [['fill', 0x17], ['frame'], [40, 4, 24, 25]],
    credits: [['fill', 0x1B], ['frame'], [40, 5, 24, 26]],
    logo: [['fill', 0x1B], ['frame'], [50, 4, 23, 20]]
  };
  var titlePage = null;
  function renderTitle(rgba, name) {
    var steps = TITLE[name]; if (!steps) return false;
    if (!titlePage || titlePage.length !== W * H) titlePage = new Uint8Array(W * H);
    var page = titlePage, save = pages, inv = inverted; inverted = false;
    for (var i = 0; i < steps.length; i++) {
      var st = steps[i];
      if (st[0] === 'fill') page.fill(isColor ? st[1] : 1);
      else if (st[0] === 'frame') drawAt(page, SET.title1, 1, 0, 0, false, 'mask', { x0: 0, x1: W, y0: 0, y1: H });
      else drawAt(page, st[0] === 50 ? SET.title2 : SET.title1, st[1], mx(st[2]), my(st[3]), false, 'mask', { x0: 0, x1: W, y0: 0, y1: H });
    }
    inverted = inv;
    var n = W * H, p = 0;
    if (mode === 'bw') for (i = 0; i < n; i++, p += 4) { var v = page[i] ? 0 : 255; rgba[p] = v; rgba[p + 1] = v; rgba[p + 2] = v; rgba[p + 3] = 255; }
    else for (i = 0; i < n; i++, p += 4) { var c = data.palette[page[i]]; rgba[p] = c[0]; rgba[p + 1] = c[1]; rgba[p + 2] = c[2]; rgba[p + 3] = 255; }
    return true;
  }

  // ---------------------------------------------------------------- the hooks into the engine
  var active = false, inDrawall = false;
  function install(json) {
    data = json; R = data.records; T = data.tables;
    ST.hooks.frame = onFrame; ST.hooks.sword = onSword;
    // the character objects carry the Mac shape and set to draw them with
    var addcharobj0 = BG.addcharobj;
    BG.addcharobj = function (type) {
      addcharobj0.call(BG, type);
      var o = L.obj[L.objN]; if (!o) return;
      if (type === ST.TypeSword) o.mac = sword ? { set: SET.swords, slot: sword.slot, x320: sword.x320, y: sword.y } : null;
      else if (type === ST.TypeComix) o.mac = ST.Char.ID === 0 ? { set: SET.prince, slot: 219 } : { set: guardSet(), slot: 2 };
      else o.mac = macFrame ? { set: setOfTab(macFrame.tab), slot: macFrame.slot } : null;
    };
    var Hk = BG.hooks;
    function room(fn) { return function (c, a) { if (inCut && POP.top.mode() !== 'cut') inCut = false; if (!inCut) fn(c, a); }; }
    Hk.drawc = room(drawc); Hk.drawmc = room(drawmc); Hk.drawb = room(drawb); Hk.drawmb = room(drawmb); Hk.drawd = room(drawd); Hk.drawmd = room(drawmd); Hk.drawa = room(drawa); Hk.drawma = room(drawma);
    Hk.drawfrnt = room(drawfrnt); Hk.wipe = room(wipe); Hk.wiped = room(wiped); Hk.drawfloor = room(drawfloor); Hk.drawhalf = room(drawhalf); Hk.drawobjx = drawobjx;
    Hk.kidmeter = kidmeter; Hk.oppmeter = oppmeter; Hk.msg = msg;
    var T = POP.top, CUT = POP.cut;
    T.events.cutroom = function (n) { if (active) cutRoom(n); };
    CUT.events.post = function () { if (active) cutPost(); };
    CUT.events.glass = function (st) { if (active) cutGlass(st); };
    CUT.events.flow = function (f) { if (active) cutFlow(f); };
    CUT.events.burn = function (xb, off, y, st) { if (active) cutBurn(xb, off, y, st); };
    CUT.events.twinkle = function (n, xb, y) { if (active) cutTwinkle(n, xb, y); };
    // the Apple's DRAWALL runs first; then the lists built alongside it are drawn the Mac way
    var drawall0 = G.drawall;
    G.drawall = function () { inDrawall = true; drawall0(); inDrawall = false; if (active) { drawallMac(); tickBand(); } else zerolsts(); };
    // the direct calls: the screen is cleared or copied, or turned upside down
    var zp0 = G.zeropeels;                                       // (ZEROPEEL, inside DRAWALL, is matched in drawallMac)
    G.zeropeels = function () { zp0(); peels = [[], []]; };
    var cls0 = HR.cls, copy0 = HR.copyscrn, inv0 = HR.inverty;
    HR.cls = function () { cls0(); if (active) cls(P.PAGE ? 1 : 0); };
    HR.copyscrn = function (from, to) { copy0(from, to); if (active) pages[to ? 1 : 0].set(pages[from ? 1 : 0]); };
    HR.inverty = function () { inv0(); if (!active) return; inverted = !inverted; for (var n = 0; n < 2; n++) { var pg = pages[n], row = new Uint8Array(W); for (var y = 0; y < PLAYH >> 1; y++) { var a = y * W, b = (PLAYH - 1 - y) * W; row.set(pg.subarray(a, a + W)); pg.copyWithin(a, b, b + W); pg.set(row, b); } } };
    zerolsts();
  }
  function setActive(on) { active = on; BG.hooks.on = on; if (on) { band.dirty = true; } }

  // ---------------------------------------------------------------- output
  function render(rgba, which) {                                // the page shown, as RGBA W x H
    var page = pages[which], n = W * H, p = 0;
    if (mode === 'bw') for (var i = 0; i < n; i++, p += 4) { var v = page[i] ? 0 : 255; rgba[p] = v; rgba[p + 1] = v; rgba[p + 2] = v; rgba[p + 3] = 255; }
    else for (i = 0; i < n; i++, p += 4) { var c = palette[page[i]]; rgba[p] = c[0]; rgba[p + 1] = c[1]; rgba[p + 2] = c[2]; rgba[p + 3] = 255; }
  }
  return { install: install, begin: begin, render: render, renderTitle: renderTitle, redrawRoom: redrawRoom, setGuardColor: setGuardColor, shape: shape, drawAt: drawAt, blit: blit, SET: SET,
    mx: mx, my: my, setActive: setActive, isActive: function () { return active; }, size: function () { return { W: W, H: H, PLAYH: PLAYH, mode: mode }; },
    pages: function () { return pages; }, unmapped: unmapped, palette: function () { return palette; }, showMsg: showMsg, band: band };
})();
