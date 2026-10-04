/*
 * Virtual screens, background/object drawing, masks, dirty rectangles, palette,
 * colour cycling, room transition effects and screen shake.
 * Port of the relevant parts of ScummVM's gfx.cpp / palette.cpp (GPL v3).
 *
 * As in the original engine, the main virtual screen's buffers are 320 bytes
 * wide with a few spare rows, and a pixel at screen column x lives at
 * y * 320 + xstart + x, so scrolling by 8 pixels only needs one new strip.
 */
var SCUMM = (function (g) { return g.SCUMM || (g.SCUMM = {}); })(typeof globalThis !== 'undefined' ? globalThis : this);

(function () {
  'use strict';
  var E = SCUMM.Engine, P = E.prototype, V = E.V, C = E.C, Gfx = SCUMM.Gfx;
  var kMain = C.kMainVirtScreen, kText = C.kTextVirtScreen, kVerb = C.kVerbVirtScreen, kBanner = C.kBannerVirtScreen;
  var USAGE_BIT_DIRTY = C.USAGE_BIT_DIRTY, USAGE_BIT_RESTORED = C.USAGE_BIT_RESTORED;
  var CHARSET_MASK_TRANSPARENCY = 0xFD;
  var dbAllowMaskOr = 1, dbDrawMaskOnAll = 2, dbObjectMode = 8;
  P.dbAllowMaskOr = dbAllowMaskOr; P.dbDrawMaskOnAll = dbDrawMaskOnAll; P.dbObjectMode = dbObjectMode;

  var transitionEffects = [
    { n: 13, delta: [1, 1, -1, 1, -1, 1, -1, -1, 1, -1, -1, -1, 1, 1, 1, -1], strip: [0, 0, 39, 0, 39, 0, 39, 24, 0, 24, 39, 24, 0, 0, 0, 24] },
    { n: 25, delta: [0, 1, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 0, 0, 0, 0], strip: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 255, 0, 0, 0] },
    { n: 25, delta: [-2, -1, 0, -1, -2, -1, -2, 0, -2, -1, -2, 0, 0, 0, 0, 0], strip: [39, 24, 39, 24, 39, 24, 39, 24, 38, 24, 38, 24, 255, 0, 0, 0] },
    { n: 25, delta: [0, -1, -2, -1, -2, 0, -2, -1, -2, 0, -2, -1, 0, 0, 0, 0], strip: [0, 24, 39, 24, 39, 0, 39, 24, 38, 0, 38, 24, 255, 0, 0, 0] },
    { n: 9, delta: [-1, -1, 1, -1, -1, 1, 1, 1, -1, -1, -1, 1, 1, -1, 1, 1], strip: [7, 7, 32, 7, 7, 8, 32, 8, 7, 8, 7, 8, 32, 7, 32, 8] },
    { n: 16, delta: [2, 0, 2, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0], strip: [0, 0, 0, 15, 1, 0, 1, 15, 255, 0, 0, 0, 255, 0, 0, 0] }
  ];
  var shakePositions = [0, 1, 2, 1, 0, 2, 3, 1];

  P.initScreenState = function () {
    this.numStrips = this.screenWidth >> 3;
    this.screenStartStrip = 0; this.screenEndStrip = this.numStrips - 1; this.screenTop = 0;
    this.virtscr = [];
    for (var i = 0; i < 4; i++) this.virtscr.push({ number: i, topline: 0, w: 0, h: 0, pitch: 0, hasTwoBuffers: false, xstart: 0, pixels: null, backBuf: null,
                                                     tdirty: new Int32Array(81), bdirty: new Int32Array(81) });
    this.gfxUsageBits = new Uint32Array(410 * 3);
    this.maskBuf = null; this.numZBuffer = 1; this.imgBufOffs = new Int32Array(9); this.zbufferDisabled = false;
    this.textSurface = new Uint8Array(this.screenWidth * this.screenHeight); this.textSurface.fill(CHARSET_MASK_TRANSPARENCY);
    this.screen = new Uint8Array(this.screenWidth * this.screenHeight);       // the "system" screen (8-bit)
    this.rgba = new Uint32Array(256);                                           // palette for the page
    this.currentPalette = new Uint8Array(768);
    this.palDirtyMin = 256; this.palDirtyMax = -1; this.paletteChanged = true;
    this.shadowPalette = new Uint8Array(256); this.roomPalette = new Uint8Array(256);
    for (i = 0; i < 256; i++) { this.shadowPalette[i] = i; this.roomPalette[i] = i; }
    this.colorCycle = []; for (i = 0; i < 16; i++) this.colorCycle.push({ delay: 0, counter: 0, flags: 0, start: 0, end: 0 });
    this.palManipCounter = 0; this.palManipStart = 0; this.palManipEnd = 0; this.palManipPalette = null; this.palManipIntermediatePal = null;
    this.scaleSlots = new Array(21); this.extraBoxFlags = new Int32Array(65);
    this.transparentColor = 255;
    this.frameQueue = [];
    this.curPalIndex = 0;
    this.shakeEnabled = false; this.shakeNextTick = 0; this.shakeTickCounter = 0;
    this.verbPalette = null;
  };

  // ---- virtual screens ----
  P.initScreens = function (b, h) {
    this.initVirtScreen(kBanner, 80, this.screenWidth, 12, false, false);
    this.initVirtScreen(kMain, b, this.screenWidth, h - b, true, true);
    this.initVirtScreen(kText, 0, this.screenWidth, b, false, false);
    this.initVirtScreen(kVerb, h, this.screenWidth, this.screenHeight - h, false, false);
    this.screenB = b; this.screenH = h;
  };
  P.initVirtScreen = function (slot, top, width, height, twobufs, scrollable) {
    var vs = this.virtscr[slot];
    vs.number = slot; vs.w = width; vs.topline = top; vs.h = height; vs.hasTwoBuffers = twobufs; vs.xstart = 0; vs.pitch = width;
    var size = vs.pitch * vs.h; if (scrollable) size += vs.pitch * 4;
    vs.pixels = new Uint8Array(size);
    vs.backBuf = twobufs ? new Uint8Array(size) : null;
    if (slot !== 3) this.setDirtyRange(vs, 0, height);
  };
  P.setDirtyRange = function (vs, top, bottom) { for (var i = 0; i < 81; i++) { vs.tdirty[i] = top; vs.bdirty[i] = bottom; } };
  P.findVirtScreen = function (y) {
    for (var i = 0; i < 3; i++) { var vs = this.virtscr[i]; if (y >= vs.topline && y < vs.topline + vs.h) return vs; }
    return null;
  };

  // ---- usage bits ----
  P.setGfxUsageBit = function (strip, bit) { bit--; this.gfxUsageBits[3 * strip + (bit >> 5)] |= (1 << (bit & 31)); };
  P.clearGfxUsageBit = function (strip, bit) { bit--; this.gfxUsageBits[3 * strip + (bit >> 5)] &= ~(1 << (bit & 31)); };
  P.testGfxUsageBit = function (strip, bit) { bit--; return (this.gfxUsageBits[3 * strip + (bit >> 5)] & (1 << (bit & 31))) !== 0; };
  P.testGfxAnyUsageBits = function (strip) {
    var g = this.gfxUsageBits, o = 3 * strip;
    return (g[o] !== 0) || (g[o + 1] !== 0) || ((g[o + 2] & 0x3FFFFFFF) !== 0);
  };
  P.testGfxOtherUsageBits = function (strip, bit) {
    var g = this.gfxUsageBits, o = 3 * strip, m = [0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF];
    bit--; m[bit >> 5] &= ~(1 << (bit & 31));
    for (var i = 0; i < 3; i++) if ((g[o + i] & m[i]) !== 0) return true;
    return false;
  };

  // ---- dirty rectangles ----
  P.markRectAsDirty = function (virt, left, right, top, bottom, dirtybit) {
    var vs = this.virtscr[virt], lp, rp;
    if (left > right || top > bottom) return;
    if (top > vs.h || bottom < 0) return;
    if (top < 0) top = 0;
    if (bottom > vs.h) bottom = vs.h;
    if (virt === kMain && dirtybit) {
      lp = (left >> 3) + this.screenStartStrip; if (lp < 0) lp = 0;
      rp = (right + vs.xstart) >> 3; if (rp >= 200) rp = 200;
      for (; lp <= rp; lp++) this.setGfxUsageBit(lp, dirtybit);
    }
    lp = left >> 3; rp = right >> 3;
    if (lp >= this.numStrips || rp < 0) return;
    if (lp < 0) lp = 0;
    if (rp >= this.numStrips) rp = this.numStrips - 1;
    while (lp <= rp) {
      if (top < vs.tdirty[lp]) vs.tdirty[lp] = top;
      if (bottom > vs.bdirty[lp]) vs.bdirty[lp] = bottom;
      lp++;
    }
  };

  P.drawDirtyScreenParts = function () {
    this.updateDirtyScreen(kVerb);
    this.updateDirtyScreen(kText);
    if (this.camera.last.x !== this.camera.cur.x) {
      var vs = this.virtscr[kMain];
      this.drawStripToScreen(vs, 0, vs.w, 0, vs.h);
      this.setDirtyRange(vs, vs.h, 0);
    } else this.updateDirtyScreen(kMain);
  };
  P.updateDirtyScreen = function (slot) {
    var vs = this.virtscr[slot];
    if (vs.h === 0) return;
    var w = 8, start = 0;
    for (var i = 0; i < this.numStrips; i++) {
      if (vs.bdirty[i]) {
        var top = vs.tdirty[i], bottom = vs.bdirty[i];
        vs.tdirty[i] = vs.h; vs.bdirty[i] = 0;
        if (i !== this.numStrips - 1 && vs.bdirty[i + 1] === bottom && vs.tdirty[i + 1] === top) { w += 8; continue; }
        this.drawStripToScreen(vs, start * 8, w, top, bottom);
        w = 8;
      }
      start = i + 1;
    }
  };
  // Composite text over the virtual screen into the system screen.
  P.drawStripToScreen = function (vs, x, width, top, bottom) {
    if (bottom <= top || top >= vs.h) return;
    if (width > vs.w - x) width = vs.w - x;
    if (top < this.screenTop) top = this.screenTop;
    if (bottom > this.screenTop + this.screenHeight) bottom = this.screenTop + this.screenHeight;
    var y = vs.topline + top - this.screenTop, height = bottom - top;
    if (width <= 0 || height <= 0) return;
    var src = vs.pixels, srcOff = top * vs.pitch + vs.xstart + x, text = this.textSurface, scr = this.screen, W = this.screenWidth;
    for (var h = 0; h < height; h++) {
      var so = srcOff + h * vs.pitch, to = (y + h) * W + x;
      for (var w = 0; w < width; w++) {
        var t = text[to + w];
        scr[to + w] = (t === CHARSET_MASK_TRANSPARENCY) ? src[so + w] : t;
      }
    }
  };

  // ---- backgrounds ----
  P.initBGBuffers = function (height) {
    var room = this.roomPtr(this.roomResource);
    var rmih = this.find(this.find(room, 'RMIM'), 'RMIH');
    this.numZBuffer = this.le16(rmih + 8) + 1;
    if (this.numZBuffer < 1 || this.numZBuffer > 8) throw new Error('bad z-buffer count');
    var itemsize = (this.roomHeight + 4) * this.numStrips;
    this.maskBuf = new Uint8Array(itemsize * this.numZBuffer);
    for (var i = 0; i < 9; i++) this.imgBufOffs[i] = i < this.numZBuffer ? i * itemsize : (this.numZBuffer - 1) * itemsize;
  };
  P.getMaskBufferOffset = function (x, y, z) {
    return ((x + this.virtscr[kMain].xstart) >> 3) + y * this.numStrips + this.imgBufOffs[z];
  };

  P.redrawBGAreas = function () {
    var val = 0;
    if (this.camera.cur.x !== this.camera.last.x && this.charset.hasMask) this.stopTalk();
    if (!this.fullRedraw && this.bgNeedsRedraw) {
      for (var i = 0; i !== this.numStrips; i++) if (this.testGfxUsageBit(this.screenStartStrip + i, USAGE_BIT_DIRTY)) this.redrawBGStrip(i, 1);
    }
    var diff = this.camera.cur.x - this.camera.last.x;
    if (!this.fullRedraw && diff === 8) { val = -1; this.redrawBGStrip(this.numStrips - 1, 1); }
    else if (!this.fullRedraw && diff === -8) { val = 1; this.redrawBGStrip(0, 1); }
    else if (this.fullRedraw || diff !== 0) { this.bgNeedsRedraw = false; this.redrawBGStrip(0, this.numStrips); }
    this.drawRoomObjects(val);
    this.bgNeedsRedraw = false;
  };
  P.redrawBGStrip = function (start, num) {
    var s = this.screenStartStrip + start;
    for (var i = 0; i < num; i++) this.setGfxUsageBit(s + i, USAGE_BIT_DIRTY);
    var room = this.roomPtr(this.roomResource);
    this.drawBitmap(room + this.IM00_offs, this.virtscr[kMain], s, 0, this.roomWidth, this.virtscr[kMain].h, s, num, 0);
  };

  // Draw strips of an image block (IM00 or an object's IMxx) into a virtual screen.
  // x = first strip in room coordinates, y = top row, width/height in pixels, stripnr = first strip within the image.
  P.drawBitmap = function (ptr, vs, x, y, width, height, stripnr, numstrip, flag) {
    var smap = this.find(ptr, 'SMAP');
    if (smap < 0) throw new Error('drawBitmap: no SMAP');
    var zplanes = this.getZPlanes(ptr), numzbuf = zplanes.length;
    var objectMode = (flag & dbObjectMode) === dbObjectMode;
    var lightsOn = this.isLightOn();
    var sx = x - (vs.xstart >> 3);
    if (sx < 0) { numstrip -= -sx; x += -sx; stripnr += -sx; sx = 0; }
    var limit = Math.max(this.roomWidth, vs.w) / 8 - x;
    if (limit > numstrip) limit = numstrip;
    if (limit > this.numStrips - sx) limit = this.numStrips - sx;
    var d = this.d, smapLen = this.blockSize(smap);
    for (var k = 0; k < limit; ++k, ++stripnr, ++sx, ++x) {
      if (y < vs.tdirty[sx]) vs.tdirty[sx] = y;
      if (y + height > vs.bdirty[sx]) vs.bdirty[sx] = y + height;
      var dstOff = y * vs.pitch + x * 8;
      var dst = vs.hasTwoBuffers ? vs.backBuf : vs.pixels;
      var offset = -1;
      if (stripnr * 4 + 8 < smapLen) offset = this.le32(smap + stripnr * 4 + 8);
      if (offset < 0 || offset >= smapLen) throw new Error('screen strip offset out of range');
      var transpStrip = Gfx.decodeStrip(d, smap + offset, height, dst, dstOff, vs.pitch, this.transparentColor, this.roomPalette);
      if (vs.hasTwoBuffers) {
        var front = vs.pixels;
        if (lightsOn) for (var h = 0; h < height; h++) { var o = dstOff + h * vs.pitch; for (var j = 0; j < 8; j++) front[o + j] = dst[o + j]; }
        else for (h = 0; h < height; h++) { o = dstOff + h * vs.pitch; for (j = 0; j < 8; j++) front[o + j] = 0; }
      }
      this.decodeMask(x, y, width, height, stripnr, numzbuf, zplanes, transpStrip, flag);
    }
  };
  P.getZPlanes = function (ptr) {
    var list = [this.find(ptr, 'SMAP')];
    var numzbuf = this.zbufferDisabled ? 0 : this.numZBuffer;
    if (numzbuf <= 1) return list.slice(0, numzbuf);
    for (var i = 1; i < numzbuf; i++) list.push(this.find(ptr, 'ZP0' + i));
    return list;
  };
  P.decodeMask = function (x, y, width, height, stripnr, numzbuf, zplanes, transpStrip, flag) {
    var d = this.d, mb = this.maskBuf;
    if (flag & dbDrawMaskOnAll) {
      var z = zplanes[1] + this.le16(zplanes[1] + stripnr * 2 + 8);
      for (var i = 0; i < numzbuf; i++) {
        var mo = this.getMaskBufferOffset(x * 8 - this.virtscr[kMain].xstart, y, i);
        Gfx.decodeMaskImg(d, z, height, mb, mo, this.numStrips, transpStrip && (flag & dbAllowMaskOr));
      }
    } else {
      for (i = 1; i < numzbuf; i++) {
        var zp = zplanes[i];
        if (zp < 0) continue;
        var offs = this.le16(zp + stripnr * 2 + 8);
        mo = x + y * this.numStrips + this.imgBufOffs[i];   // x is already a room strip
        if (offs) Gfx.decodeMaskImg(d, zp + offs, height, mb, mo, this.numStrips, transpStrip && (flag & dbAllowMaskOr));
        else if (!(transpStrip && (flag & dbAllowMaskOr))) for (var h = 0; h < height; h++) mb[mo + h * this.numStrips] = 0;
      }
    }
  };

  P.resetBackground = function (top, bottom, strip) {
    var vs = this.virtscr[kMain];
    if (top < 0) top = 0;
    if (bottom > vs.h) bottom = vs.h;
    if (top >= bottom) return;
    if (top < vs.tdirty[strip]) vs.tdirty[strip] = top;
    if (bottom > vs.bdirty[strip]) vs.bdirty[strip] = bottom;
    var off = top * vs.pitch + (strip + (vs.xstart >> 3)) * 8, n = bottom - top;
    var front = vs.pixels, back = vs.backBuf;
    if (this.isLightOn()) for (var h = 0; h < n; h++) { var o = off + h * vs.pitch; for (var j = 0; j < 8; j++) front[o + j] = back[o + j]; }
    else for (h = 0; h < n; h++) { o = off + h * vs.pitch; for (j = 0; j < 8; j++) front[o + j] = 0; }
  };

  P.restoreBackground = function (rect, backColor) {
    var left = rect.left, right = rect.right, top = rect.top, bottom = rect.bottom;
    if (top < 0) top = 0;
    if (left >= right || top >= bottom) return;
    var vs = this.findVirtScreen(top);
    if (!vs) return;
    if (left > vs.w) return;
    top -= vs.topline; bottom -= vs.topline;
    if (left < 0) left = 0; if (right > vs.w) right = vs.w; if (top < 0) top = 0; if (bottom > vs.h) bottom = vs.h;
    var height = bottom - top, width = right - left;
    this.markRectAsDirty(vs.number, left, right, top, bottom, USAGE_BIT_RESTORED);
    if (!height || width <= 0) return;
    var off = top * vs.pitch + vs.xstart + left;
    if (vs.hasTwoBuffers && this.currentRoom !== 0 && this.isLightOn()) {
      for (var h = 0; h < height; h++) { var o = off + h * vs.pitch; for (var w = 0; w < width; w++) vs.pixels[o + w] = vs.backBuf[o + w]; }
      if (vs.number === kMain && this.charset.hasMask) {
        for (h = 0; h < height; h++) { o = (top - this.screenTop + h) * this.screenWidth + left; for (w = 0; w < width; w++) this.textSurface[o + w] = CHARSET_MASK_TRANSPARENCY; }
      }
    } else {
      for (h = 0; h < height; h++) { o = off + h * vs.pitch; for (w = 0; w < width; w++) vs.pixels[o + w] = backColor; }
    }
  };
  P.restoreCharsetBg = function () {
    this.nextLeft = this.string[0].xpos;
    this.nextTop = this.string[0].ypos + this.screenTop;
    if (this.charset.hasMask) {
      this.charset.hasMask = false;
      this.charset.str.left = -1;
      this.charset.left = -1;
      var vs = this.virtscr[this.charset.textScreenID];
      if (!vs.h) return;
      this.markRectAsDirty(vs.number, 0, vs.w, 0, vs.h, USAGE_BIT_RESTORED);
      if (vs.hasTwoBuffers && this.currentRoom !== 0 && this.isLightOn()) {
        if (vs.number !== kMain) vs.pixels.set(vs.backBuf);
      } else {
        vs.pixels.fill(0, 0, vs.h * vs.pitch);
      }
      if (vs.hasTwoBuffers) this.textSurface.fill(CHARSET_MASK_TRANSPARENCY);
    }
  };
  P.clearTextSurface = function () { this.textSurface.fill(CHARSET_MASK_TRANSPARENCY); };

  P.drawBox = function (x, y, x2, y2, color) {
    var vs = this.findVirtScreen(y);
    if (!vs) return;
    if (x > x2) { var t = x; x = x2; x2 = t; }
    if (y > y2) { t = y; y = y2; y2 = t; }
    x2++; y2++;
    y -= vs.topline; y2 -= vs.topline;
    if (x < 0) x = 0; else if (x >= vs.w) return;
    if (x2 < 0) return; else if (x2 > vs.w) x2 = vs.w;
    if (y < 0) y = 0; else if (y > vs.h) return;
    if (y2 < 0) return; else if (y2 > vs.h) y2 = vs.h;
    var width = x2 - x, height = y2 - y;
    if (width <= 0 || height <= 0) return;
    this.markRectAsDirty(vs.number, x, x2, y, y2, 0);
    var off = y * vs.pitch + vs.xstart + x;
    for (var h = 0; h < height; h++) {
      var o = off + h * vs.pitch;
      for (var w = 0; w < width; w++) vs.pixels[o + w] = color;
      if (vs.backBuf) for (w = 0; w < width; w++) vs.backBuf[o + w] = color;
    }
  };

  // ---- objects (object.cpp drawing) ----
  P.drawRoomObjects = function (arg) {
    for (var i = this.numLocalObjects - 1; i > 0; i--) {
      var o = this.objs[i];
      if (o.obj_nr > 0 && (o.state & 0xF)) this.drawRoomObject(i, arg);
    }
  };
  P.drawRoomObject = function (i, arg) {
    var od = this.objs[i];
    if (i < 1 || od.obj_nr < 1 || !od.state) return;
    do {
      var a = od.parentstate;
      if (!od.parent) { this.drawObject(i, arg); break; }
      od = this.objs[od.parent];
    } while ((od.state & 0xF) === a);
  };
  P.drawObject = function (obj, scrollType) {
    var od = this.objs[obj];
    if (this.bgNeedsRedraw) scrollType = 0;
    if (od.obj_nr === 0) return;
    var xpos = od.x_pos >> 3, ypos = od.y_pos;
    od.height &= 0xFFFFFFF8;
    var width = od.width >> 3, height = od.height;
    if (width === 0 || xpos > this.screenEndStrip || xpos + width < this.screenStartStrip) return;
    var ptr = this.getObjectImage(od.obim, this.getState(od.obj_nr));
    if (ptr < 0) return;
    var x = 0xFFFF, numstrip = 0;
    for (var a = 0; a < width; a++) {
      var tmp = xpos + a;
      if (tmp < this.screenStartStrip || this.screenEndStrip < tmp) continue;
      if (scrollType > 0 && this.screenStartStrip + scrollType <= tmp) continue;
      if (scrollType < 0 && tmp <= this.screenEndStrip + scrollType) continue;
      this.setGfxUsageBit(tmp, USAGE_BIT_DIRTY);
      if (tmp < x) x = tmp;
      numstrip++;
    }
    if (numstrip !== 0) {
      var flags = od.flags | dbObjectMode;
      this.drawBitmap(ptr, this.virtscr[kMain], x, ypos, width * 8, height, x - xpos, numstrip, flags);
    }
  };
  P.markObjectRectAsDirty = function (obj) {
    for (var i = 1; i < this.numLocalObjects; i++) {
      var o = this.objs[i];
      if (o.obj_nr === obj) {
        if (o.width !== 0) {
          var minStrip = Math.max(this.screenStartStrip, o.x_pos >> 3), maxStrip = Math.min(this.screenEndStrip + 1, (o.x_pos >> 3) + (o.width >> 3));
          for (var strip = minStrip; strip < maxStrip; strip++) this.setGfxUsageBit(strip, USAGE_BIT_DIRTY);
        }
        this.bgNeedsRedraw = true;
        return;
      }
    }
  };

  // ---- verbs drawing (verbs.cpp) ----
  P.drawVerb = function (verb, mode) {
    if (!verb) return;
    var vs = this.verbs[verb];
    if (!vs.saveid && vs.curmode && vs.verbid) {
      if (vs.type === C.kImageVerbType) { this.drawVerbBitmap(verb, vs.curRect.left, vs.curRect.top); return; }
      this.restoreVerbBG(verb);
      var st = this.string[4];
      st.charset = vs.charset_nr; st.xpos = vs.curRect.left; st.ypos = vs.curRect.top; st.right = this.screenWidth - 1; st.center = vs.center;
      if (vs.curmode === 2) st.color = vs.dimcolor; else if (mode && vs.hicolor) st.color = vs.hicolor; else st.color = vs.color;
      var msg = this.verbNames[verb];
      if (!msg) return;
      var tmp = this.charset.center;
      this.drawString(4, msg);
      this.charset.center = tmp;
      vs.curRect.right = this.charset.str.right;
      vs.curRect.bottom = this.charset.str.bottom;
      vs.oldRect.left = this.charset.str.left; vs.oldRect.top = this.charset.str.top; vs.oldRect.right = this.charset.str.right; vs.oldRect.bottom = this.charset.str.bottom;
      this.charset.str.left = this.charset.str.right;
    } else {
      this.restoreVerbBG(verb);
    }
  };
  P.restoreVerbBG = function (verb) {
    var vs = this.verbs[verb];
    if (vs.oldRect.left !== -1) { this.restoreBackground(vs.oldRect, vs.bkcolor); vs.oldRect.left = -1; }
  };
  P.drawVerbBitmap = function (verb, x, y) {
    var vst = this.verbs[verb];
    var vs = this.findVirtScreen(y);
    if (!vs) return;
    this.zbufferDisabled = true;
    var twobufs = vs.hasTwoBuffers; vs.hasTwoBuffers = false;
    var xstrip = x >> 3, ydiff = y - vs.topline;
    var obim = vst.image;
    var imhd = this.find(obim, 'IMHD') + 8;
    var imgw = this.le16(imhd + 12) >> 3, imgh = this.le16(imhd + 14) >> 3;
    var imptr = this.getObjectImage(obim, 1);
    for (var i = 0; i < imgw; i++) this.drawBitmap(imptr, vs, xstrip + i, ydiff, imgw * 8, imgh * 8, i, 1, dbAllowMaskOr | dbObjectMode);
    vst.curRect.right = vst.curRect.left + imgw * 8;
    vst.curRect.bottom = vst.curRect.top + imgh * 8;
    vst.oldRect.left = vst.curRect.left; vst.oldRect.top = vst.curRect.top; vst.oldRect.right = vst.curRect.right; vst.oldRect.bottom = vst.curRect.bottom;
    this.zbufferDisabled = false;
    vs.hasTwoBuffers = twobufs;
  };

  // ---- palette (palette.cpp) ----
  P.resetPalette = function () { this.setDirtyColors(0, 255); };
  P.setDirtyColors = function (min, max) { if (this.palDirtyMin > min) this.palDirtyMin = min; if (this.palDirtyMax < max) this.palDirtyMax = max; };
  P.getPalettePtr = function () { return this.roomPtr(this.roomResource) + this.CLUT_offs; };
  P.setCurrentPalette = function (palindex) { this.curPalIndex = palindex; this.setPaletteFromPtr(this.getPalettePtr(), 256); };
  P.setPaletteFromPtr = function (ptr, numcolor) {
    var d = this.d, dest = this.currentPalette, p = ptr;
    for (var i = 0; i < numcolor; i++, p += 3) {
      var r = d[p], g = d[p + 1], b = d[p + 2];
      if (i < 15 || i === 15 || r < 252 || g < 252 || b < 252) { dest[i * 3] = r; dest[i * 3 + 1] = g; dest[i * 3 + 2] = b; }
    }
    this.setDirtyColors(0, numcolor - 1);
  };
  P.setPalColor = function (idx, r, g, b) {
    this.currentPalette[idx * 3] = r; this.currentPalette[idx * 3 + 1] = g; this.currentPalette[idx * 3 + 2] = b;
    this.setDirtyColors(idx, idx);
  };
  P.darkenPalette = function (redScale, greenScale, blueScale, startColor, endColor) {
    var max = 252;
    if (startColor <= endColor) {
      var palptr = this.getPalettePtr(), d = this.d;
      for (var j = startColor; j <= endColor; j++) {
        var cptr = palptr + j * 3, color;
        color = ((d[cptr] * redScale) / 0xFF) | 0; if (color > max) color = max; this.currentPalette[j * 3] = color;
        color = ((d[cptr + 1] * greenScale) / 0xFF) | 0; if (color > max) color = max; this.currentPalette[j * 3 + 1] = color;
        color = ((d[cptr + 2] * blueScale) / 0xFF) | 0; if (color > max) color = max; this.currentPalette[j * 3 + 2] = color;
      }
      this.setDirtyColors(startColor, endColor);
    }
  };
  P.setShadowPalette = function (redScale, greenScale, blueScale, startColor, endColor, start, end) {
    var basepal = this.getPalettePtr(), d = this.d, pal = basepal + start * 3;
    for (var i = start; i < end; i++) {
      var r = (((d[pal] >> 2) * redScale) >> 8), g = (((d[pal + 1] >> 2) * greenScale) >> 8), b = (((d[pal + 2] >> 2) * blueScale) >> 8);
      pal += 3;
      var bestitem = 0, bestsum = 32000, cp = basepal + startColor * 3;
      for (var j = startColor; j <= endColor; j++, cp += 3) {
        var sum = Math.abs((d[cp] >> 2) - r) + Math.abs((d[cp + 1] >> 2) - g) + Math.abs((d[cp + 2] >> 2) - b);
        if (sum < bestsum) { bestsum = sum; bestitem = j; }
      }
      this.shadowPalette[i] = bestitem;
    }
  };
  function colorWeight(r, g, b) { return 3 * r * r + 6 * g * g + 2 * b * b; }
  P.remapPaletteColor = function (r, g, b, threshold) {
    var pal = this.currentPalette, bestsum = 0x7FFFFFFF, bestitem = 0;
    if (r > 255) r = 255; if (g > 255) g = 255; if (b > 255) b = 255;
    r &= ~3; g &= ~3; b &= ~3;
    for (var i = 1; i < 255; i++) {
      var ar = pal[i * 3] & ~3, ag = pal[i * 3 + 1] & ~3, ab = pal[i * 3 + 2] & ~3;
      if (ar === r && ag === g && ab === b) return i;
      var sum = colorWeight(ar - r, ag - g, ab - b);
      if (sum < bestsum) { bestsum = sum; bestitem = i; }
    }
    if (threshold !== -1 && bestsum > colorWeight(threshold, threshold, threshold)) {
      for (i = 254; i > 48; i--) {
        if (pal[i * 3] >= 252 && pal[i * 3 + 1] >= 252 && pal[i * 3 + 2] >= 252) { this.setPalColor(i, r, g, b); return i; }
      }
    }
    return bestitem;
  };
  P.findClosestPaletteColor = function (r, g, b) {
    var pal = this.currentPalette, best = 0, bestsum = 0x7FFFFFFF;
    for (var i = 0; i < 256; i++) {
      var dr = pal[i * 3] - r, dg = pal[i * 3 + 1] - g, db = pal[i * 3 + 2] - b, sum = dr * dr + dg * dg + db * db;
      if (sum < bestsum) { bestsum = sum; best = i; }
    }
    return best;
  };
  P.updatePalette = function () {
    if (this.palDirtyMax === -1) return;
    var pal = this.currentPalette;
    for (var i = this.palDirtyMin; i <= this.palDirtyMax; i++) {
      this.rgba[i] = (0xFF << 24 | pal[i * 3 + 2] << 16 | pal[i * 3 + 1] << 8 | pal[i * 3]) >>> 0;
    }
    this.palDirtyMax = -1; this.palDirtyMin = 256;
    this.paletteChanged = true;
  };

  // colour cycling
  P.initCycl = function (ptr) {
    var d = this.d, j;
    for (var i = 0; i < 16; i++) { var c = this.colorCycle[i]; c.delay = 0; c.counter = 0; c.flags = 0; c.start = 0; c.end = 0; }
    while ((j = d[ptr++]) !== 0) {
      if (j < 1 || j > 16) throw new Error('Invalid color cycle index ' + j);
      var cycl = this.colorCycle[j - 1];
      ptr += 2;
      cycl.counter = 0;
      cycl.delay = (16384 / ((d[ptr] << 8) | d[ptr + 1])) | 0; ptr += 2;
      cycl.flags = (d[ptr] << 8) | d[ptr + 1]; ptr += 2;
      cycl.start = d[ptr++]; cycl.end = d[ptr++];
    }
  };
  P.stopCycle = function (i) {
    if (i !== 0) { this.colorCycle[i - 1].delay = 0; return; }
    for (var k = 0; k < 16; k++) this.colorCycle[k].delay = 0;
  };
  function doCyclePalette(palette, cycleStart, cycleEnd, size, forward) {
    var start = cycleStart * size, end = cycleEnd * size, num = cycleEnd - cycleStart, tmp = new Uint8Array(size), i;
    if (forward) {
      for (i = 0; i < size; i++) tmp[i] = palette[end + i];
      palette.copyWithin(start + size, start, start + num * size);
      for (i = 0; i < size; i++) palette[start + i] = tmp[i];
    } else {
      for (i = 0; i < size; i++) tmp[i] = palette[start + i];
      palette.copyWithin(start, start + size, start + size + num * size);
      for (i = 0; i < size; i++) palette[end + i] = tmp[i];
    }
  }
  function doCycleIndirectPalette(palette, cycleStart, cycleEnd, forward) {
    var num = cycleEnd - cycleStart + 1, offset = forward ? 1 : num - 1;
    for (var i = 0; i < 256; i++) {
      if (cycleStart <= palette[i] && palette[i] <= cycleEnd) palette[i] = (palette[i] - cycleStart + offset) % num + cycleStart;
    }
    doCyclePalette(palette, cycleStart, cycleEnd, 1, forward);
  }
  P.cyclePalette = function () {
    var valueToAdd = this.VAR(V.TIMER);
    if (valueToAdd < this.VAR(V.TIMER_NEXT)) valueToAdd = this.VAR(V.TIMER_NEXT);
    for (var i = 0; i < 16; i++) {
      var cycl = this.colorCycle[i];
      if (!cycl.delay || cycl.start > cycl.end) continue;
      cycl.counter += valueToAdd;
      if (cycl.counter >= cycl.delay) {
        cycl.counter %= cycl.delay;
        this.setDirtyColors(cycl.start, cycl.end);
        this.moveMemInPalRes(cycl.start, cycl.end, cycl.flags & 2);
        doCyclePalette(this.currentPalette, cycl.start, cycl.end, 3, !(cycl.flags & 2));
        doCycleIndirectPalette(this.shadowPalette, cycl.start, cycl.end, !(cycl.flags & 2));
      }
    }
  };
  P.moveMemInPalRes = function (start, end, direction) {
    if (!this.palManipCounter) return;
    doCyclePalette(this.palManipPalette, start, end, 3, !direction);
    doCyclePalette(this.palManipIntermediatePal, start, end, 6, !direction);
  };
  P.palManipulateInit = function (resID, start, end, time) {
    var s1 = this.strings[resID], s2 = this.strings[resID + 1], s3 = this.strings[resID + 2];
    if (!s1 || !s2 || !s3) throw new Error('palManipulateInit: cannot obtain string resources ' + resID);
    this.palManipStart = start; this.palManipEnd = end; this.palManipCounter = 0;
    if (!this.palManipPalette) this.palManipPalette = new Uint8Array(0x300);
    if (!this.palManipIntermediatePal) this.palManipIntermediatePal = new Uint8Array(0x600);
    var pal = this.currentPalette, target = this.palManipPalette, between = this.palManipIntermediatePal;
    for (var i = start; i < end; ++i) {
      target[i * 3] = s1[i]; target[i * 3 + 1] = s2[i]; target[i * 3 + 2] = s3[i];
      for (var c = 0; c < 3; c++) { var v = pal[i * 3 + c] << 8; between[i * 6 + c * 2] = v & 0xFF; between[i * 6 + c * 2 + 1] = v >> 8; }
    }
    this.palManipCounter = time;
  };
  P.palManipulate = function () {
    if (!this.palManipCounter || !this.palManipPalette) return;
    var pal = this.currentPalette, target = this.palManipPalette, between = this.palManipIntermediatePal, n = this.palManipCounter;
    for (var i = this.palManipStart; i < this.palManipEnd; ++i) {
      for (var c = 0; c < 3; c++) {
        var bi = i * 6 + c * 2, b = between[bi] | (between[bi + 1] << 8);
        b = (b + (((target[i * 3 + c] << 8) - b) / n | 0)) & 0xFFFF;
        between[bi] = b & 0xFF; between[bi + 1] = b >> 8;
        pal[i * 3 + c] = b >> 8;
      }
    }
    this.setDirtyColors(this.palManipStart, this.palManipEnd);
    this.palManipCounter--;
  };

  // ---- shake, effects ----
  P.setShake = function (mode) {
    if (this.shakeEnabled !== (mode !== 0)) this.fullRedraw = true;
    this.shakeEnabled = mode !== 0; this.shakeFrame = 0;
  };
  // vertical display offset for the shake effect; nowMs is wall-clock time
  P.getShakeOffset = function (nowMs) {
    if (!this.shakeEnabled) { this.shakeFrame = 0; this.shakeNextTick = 0; return 0; }
    if (!this.shakeNextTick) this.shakeNextTick = nowMs;
    while (nowMs >= this.shakeNextTick) { this.shakeFrame = (this.shakeFrame + 1) % 8; this.shakeNextTick += 1000 / 30; }
    return -shakePositions[this.shakeFrame];
  };

  // Effects run synchronously inside script execution; each "wait" records a frame for the page to show.
  P.waitForTimer = function (quarterFrames) {
    if (this.palDirtyMax !== -1) this.updatePalette();
    this.frameQueue.push({ delay: quarterFrames, screen: new Uint8Array(this.screen), rgba: this.paletteChanged ? new Uint32Array(this.rgba) : null });
    this.paletteChanged = false;
  };
  P.fadeIn = function (effect) {
    this.updatePalette();
    switch (effect) {
      case 0: break;
      case 1: case 2: case 3: case 4: case 5: case 6: this.setDirtyRange(this.virtscr[kMain], 0, 0); this.transitionEffect(effect - 1); break;
      case 128: break;                    // the Macintosh version has no dissolve
      case 129: break;
      case 130: case 131: case 132: case 133: this.scrollEffect(133 - effect); break;
      case 134: case 135: break;          // dissolve: not on the Macintosh
      default: throw new Error('Unknown screen effect ' + effect);
    }
    this.screenEffectFlag = true;
  };
  P.fadeOut = function (effect) {
    var vs = this.virtscr[kMain];
    this.setDirtyRange(vs, 0, 0);
    this.camera.last.x = this.camera.cur.x;
    if (this.screenEffectFlag && effect !== 0) {
      vs.pixels.fill(0, 0, vs.pitch * vs.h + vs.xstart);
      switch (effect) {
        case 1: case 2: case 3: case 4: case 5: case 6: this.transitionEffect(effect - 1); break;
        case 128: break;
        case 129: this.setDirtyRange(vs, 0, vs.h); this.updateDirtyScreen(kMain); break;
        case 134: case 135: break;
        default: throw new Error('fadeOut: default case ' + effect);
      }
    }
    this.screenEffectFlag = false;
  };
  P.transitionEffect = function (a) {
    var delta = new Int32Array(16), tab_2 = new Int32Array(16);
    var height = Math.min(this.virtscr[kMain].h, this.screenHeight);
    var delay = this.VAR(V.FADE_DELAY);
    var eff = transitionEffects[a], numOfIterations = eff.n;
    for (var i = 0; i < 16; i++) { delta[i] = eff.delta[i]; var j = eff.strip[i]; if (j === 24) j = (height >> 3) - 1; tab_2[i] = j; }
    var bottom = height >> 3, vs = this.virtscr[kMain];
    for (j = 0; j < numOfIterations; j++) {
      for (i = 0; i < 4; i++) {
        var l = tab_2[i * 4], t = tab_2[i * 4 + 1], r = tab_2[i * 4 + 2], b = tab_2[i * 4 + 3];
        if (t === b) {
          while (l <= r) {
            if (l >= 0 && l < this.numStrips && t < bottom) { vs.tdirty[l] = this.screenTop + t * 8; vs.bdirty[l] = this.screenTop + (b + 1) * 8; }
            l++;
          }
        } else {
          if (l < 0 || l >= this.numStrips || b <= t) continue;
          if (b > bottom) b = bottom;
          if (t < 0) t = 0;
          vs.tdirty[l] = this.screenTop + t * 8; vs.bdirty[l] = this.screenTop + (b + 1) * 8;
        }
        this.updateDirtyScreen(kMain);
      }
      for (i = 0; i < 16; i++) tab_2[i] += delta[i];
      if (!this.fastMode) this.waitForTimer(delay);
    }
  };
  P.moveScreen = function (dx, dy, height) {
    var W = this.screenWidth, scr = this.screen;
    if (dy) {
      if (dy < 0) scr.copyWithin(0, -dy * W, height * W); else scr.copyWithin(dy * W, 0, (height - dy) * W);
    }
    if (dx) {
      for (var y = 0; y < height; y++) {
        var row = y * W;
        if (dx < 0) scr.copyWithin(row, row - dx, row + W); else scr.copyWithin(row + dx, row, row + W - dx);
      }
    }
  };
  P.copyRectToScreen = function (src, srcOff, pitch, x, y, w, h) {
    var W = this.screenWidth, scr = this.screen;
    for (var j = 0; j < h; j++) { var so = srcOff + j * pitch, to = (y + j) * W + x; for (var i = 0; i < w; i++) scr[to + i] = src[so + i]; }
  };
  P.scrollEffect = function (dir) {
    var vs = this.virtscr[kMain], step = 8, delay = this.VAR(V.FADE_DELAY), x, y;
    switch (dir) {
      case 0:
        y = 1 + step;
        while (y < vs.h) { this.moveScreen(0, -step, vs.h); this.copyRectToScreen(vs.pixels, (y - step) * vs.pitch + vs.xstart, vs.pitch, 0, vs.h - step, vs.w, step); this.waitForTimer(delay); y += step; }
        break;
      case 1:
        y = 1 + step;
        while (y < vs.h) { this.moveScreen(0, step, vs.h); this.copyRectToScreen(vs.pixels, (vs.h - y) * vs.pitch + vs.xstart, vs.pitch, 0, 0, vs.w, step); this.waitForTimer(delay); y += step; }
        break;
      case 2:
        x = 1 + step;
        while (x < vs.w) { this.moveScreen(-step, 0, vs.h); this.copyRectToScreen(vs.pixels, vs.xstart + x - step, vs.pitch, vs.w - step, 0, step, vs.h); this.waitForTimer(delay); x += step; }
        break;
      case 3:
        x = 1 + step;
        while (x < vs.w) { this.moveScreen(step, 0, vs.h); this.copyRectToScreen(vs.pixels, vs.xstart + vs.w - x, vs.pitch, 0, 0, step, vs.h); this.waitForTimer(delay); x += step; }
        break;
    }
  };
  P.drawFlashlight = function () { /* not used by Monkey Island */ };

  // ---- boxes (boxes.cpp) ----
  P.getNumBoxes = function () { return this.boxData ? this.boxData[0] : 0; };
  P.boxAddr = function (box) {
    var bd = this.boxData;
    if (!bd || box === 255) return -1;
    if (box < 0 || box >= bd[0]) throw new Error('box ' + box + ' out of range');
    return box * 20 + 2;
  };
  function bdle16(bd, o) { var v = bd[o] | (bd[o + 1] << 8); return v & 0x8000 ? v - 0x10000 : v; }
  P.getBoxCoordinates = function (boxnum) {
    var bd = this.boxData, bp = this.boxAddr(boxnum);
    if (bp < 0) throw new Error('getBoxCoordinates: bad box ' + boxnum);
    return { ul: { x: bdle16(bd, bp), y: bdle16(bd, bp + 2) }, ur: { x: bdle16(bd, bp + 4), y: bdle16(bd, bp + 6) },
             lr: { x: bdle16(bd, bp + 8), y: bdle16(bd, bp + 10) }, ll: { x: bdle16(bd, bp + 12), y: bdle16(bd, bp + 14) } };
  };
  P.getMaskFromBox = function (box) { var bp = this.boxAddr(box); return bp < 0 ? 0 : this.boxData[bp + 16]; };
  P.getBoxFlags = function (box) { var bp = this.boxAddr(box); return bp < 0 ? 0 : this.boxData[bp + 17]; };
  P.setBoxFlags = function (box, val) {
    if (val & 0xC000) { this.extraBoxFlags[box] = val; return; }
    var bp = this.boxAddr(box); if (bp < 0) return; this.boxData[bp + 17] = val;
  };
  P.setBoxScale = function (box, scale) { var bp = this.boxAddr(box); this.boxData[bp + 18] = scale & 0xFF; this.boxData[bp + 19] = (scale >> 8) & 0xFF; };
  P.getBoxScale = function (box) { var bp = this.boxAddr(box); if (bp < 0) return 255; return this.boxData[bp + 18] | (this.boxData[bp + 19] << 8); };
  P.getScale = function (box, x, y) {
    var bp = this.boxAddr(box); if (bp < 0) return 255;
    var scale = this.boxData[bp + 18] | (this.boxData[bp + 19] << 8), slot = 0;
    if (scale & 0x8000) slot = (scale & 0x7FFF) + 1;
    if (slot) scale = this.getScaleFromSlot(slot, x, y);
    return scale;
  };
  P.getScaleFromSlot = function (slot, x, y) {
    var s = this.scaleSlots[slot];
    if (!s) throw new Error('Invalid scale slot ' + slot);
    var scale, scaleX = 0, scaleY = 0;
    if (s.y1 === s.y2 && s.x1 === s.x2) throw new Error('Invalid scale slot ' + slot);
    if (s.y1 !== s.y2) { if (y < 0) y = 0; scaleY = ((s.scale2 - s.scale1) * (y - s.y1) / (s.y2 - s.y1) | 0) + s.scale1; }
    if (s.x1 === s.x2) scale = scaleY;
    else {
      scaleX = ((s.scale2 - s.scale1) * (x - s.x1) / (s.x2 - s.x1) | 0) + s.scale1;
      scale = s.y1 === s.y2 ? scaleX : ((scaleX + scaleY) >> 1);
    }
    if (scale < 1) scale = 1; else if (scale > 255) scale = 255;
    return scale;
  };
  P.setScaleSlot = function (slot, x1, y1, scale1, x2, y2, scale2) {
    if (slot < 1 || slot > 20) throw new Error('bad scale slot ' + slot);
    this.scaleSlots[slot] = { x1: x1, y1: y1, scale1: scale1, x2: x2, y2: y2, scale2: scale2 };
  };
  function compareSlope(p1, p2, p3) { return (p2.y - p1.y) * (p3.x - p1.x) <= (p3.y - p1.y) * (p2.x - p1.x); }
  function closestPtOnLine(ls, le, p) {
    var result = { x: 0, y: 0 }, lxdiff = le.x - ls.x, lydiff = le.y - ls.y;
    if (le.x === ls.x) { result.x = ls.x; result.y = p.y; }
    else if (le.y === ls.y) { result.x = p.x; result.y = ls.y; }
    else {
      var dist = lxdiff * lxdiff + lydiff * lydiff, a, b, c;
      if (Math.abs(lxdiff) > Math.abs(lydiff)) {
        a = (ls.x * lydiff / lxdiff) | 0; b = (p.x * lxdiff / lydiff) | 0;
        c = ((a + b - ls.y + p.y) * lydiff * lxdiff / dist) | 0;
        result.x = c; result.y = ((c * lydiff / lxdiff) | 0) - a + ls.y;
      } else {
        a = (ls.y * lxdiff / lydiff) | 0; b = (p.y * lydiff / lxdiff) | 0;
        c = ((a + b - ls.x + p.x) * lydiff * lxdiff / dist) | 0;
        result.x = ((c * lxdiff / lydiff) | 0) - a + ls.x; result.y = c;
      }
    }
    if (Math.abs(lydiff) < Math.abs(lxdiff)) {
      if (lxdiff > 0) { if (result.x < ls.x) result = { x: ls.x, y: ls.y }; else if (result.x > le.x) result = { x: le.x, y: le.y }; }
      else { if (result.x > ls.x) result = { x: ls.x, y: ls.y }; else if (result.x < le.x) result = { x: le.x, y: le.y }; }
    } else {
      if (lydiff > 0) { if (result.y < ls.y) result = { x: ls.x, y: ls.y }; else if (result.y > le.y) result = { x: le.x, y: le.y }; }
      else { if (result.y > ls.y) result = { x: ls.x, y: ls.y }; else if (result.y < le.y) result = { x: le.x, y: le.y }; }
    }
    return result;
  }
  function sqrDist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
  P.checkXYInBoxBounds = function (boxnum, x, y) {
    if (boxnum < 0 || boxnum === 0 /* kInvalidBox */) return false;
    var box = this.getBoxCoordinates(boxnum), p = { x: x, y: y };
    if (x < box.ul.x && x < box.ur.x && x < box.lr.x && x < box.ll.x) return false;
    if (x > box.ul.x && x > box.ur.x && x > box.lr.x && x > box.ll.x) return false;
    if (y < box.ul.y && y < box.ur.y && y < box.lr.y && y < box.ll.y) return false;
    if (y > box.ul.y && y > box.ur.y && y > box.lr.y && y > box.ll.y) return false;
    if ((box.ul.x === box.ur.x && box.ul.y === box.ur.y && box.lr.x === box.ll.x && box.lr.y === box.ll.y) ||
        (box.ul.x === box.ll.x && box.ul.y === box.ll.y && box.ur.x === box.lr.x && box.ur.y === box.lr.y)) {
      var tmp = closestPtOnLine(box.ul, box.lr, p);
      if (sqrDist(p, tmp) <= 4) return true;
    }
    if (!compareSlope(box.ul, box.ur, p)) return false;
    if (!compareSlope(box.ur, box.lr, p)) return false;
    if (!compareSlope(box.lr, box.ll, p)) return false;
    if (!compareSlope(box.ll, box.ul, p)) return false;
    return true;
  };
  P.getClosestPtOnBox = function (box, x, y) {
    var p = { x: x, y: y }, best = { dist: 0xFFFFFF, x: 0, y: 0 }, sides = [[box.ul, box.ur], [box.ur, box.lr], [box.lr, box.ll], [box.ll, box.ul]];
    for (var i = 0; i < 4; i++) {
      var tmp = closestPtOnLine(sides[i][0], sides[i][1], p), dist = sqrDist(p, tmp);
      if (dist < best.dist) { best.dist = dist; best.x = tmp.x; best.y = tmp.y; }
    }
    return best;
  };
  P.getNextBox = function (from, to) {
    var numOfBoxes = this.getNumBoxes(), dest = -1;
    if (from === to) return to;
    if (to === 0) return -1;
    if (from === 0) return to;
    if (from >= numOfBoxes || to >= numOfBoxes) throw new Error('getNextBox: bad box');
    var boxm = this.boxMatrix, p = 0;
    if (boxm[p] === 0xFF) p++;
    var end = boxm.length;
    for (var i = 0; i < from && p < end; i++) { while (p < end && boxm[p] !== 0xFF) p += 3; p++; }
    while (p < end && boxm[p] !== 0xFF) {
      if (boxm[p] <= to && to <= boxm[p + 1]) dest = (boxm[p + 2] << 24) >> 24;
      p += 3;
    }
    return dest;
  };
  P.areBoxesNeighbors = function (box1nr, box2nr) {
    if ((this.getBoxFlags(box1nr) & 0x80) || (this.getBoxFlags(box2nr) & 0x80)) return false;
    var box2 = this.getBoxCoordinates(box1nr), box = this.getBoxCoordinates(box2nr), tmp;
    function rot(b) { tmp = b.ul; b.ul = b.ur; b.ur = b.lr; b.lr = b.ll; b.ll = tmp; }
    for (var j = 0; j < 4; j++) {
      for (var k = 0; k < 4; k++) {
        if (box2.ur.x === box2.ul.x && box.ul.x === box2.ul.x && box.ur.x === box2.ul.x) {
          var s2 = false, s1 = false, t;
          if (box2.ur.y < box2.ul.y) { s2 = true; t = box2.ur.y; box2.ur.y = box2.ul.y; box2.ul.y = t; }
          if (box.ur.y < box.ul.y) { s1 = true; t = box.ur.y; box.ur.y = box.ul.y; box.ul.y = t; }
          if (box.ur.y < box2.ul.y || box.ul.y > box2.ur.y || ((box.ul.y === box2.ur.y || box.ur.y === box2.ul.y) && box2.ur.y !== box2.ul.y && box.ul.y !== box.ur.y)) {}
          else return true;
          if (s2) { t = box2.ur.y; box2.ur.y = box2.ul.y; box2.ul.y = t; }
          if (s1) { t = box.ur.y; box.ur.y = box.ul.y; box.ul.y = t; }
        }
        if (box2.ur.y === box2.ul.y && box.ul.y === box2.ul.y && box.ur.y === box2.ul.y) {
          s2 = false; s1 = false;
          if (box2.ur.x < box2.ul.x) { s2 = true; t = box2.ur.x; box2.ur.x = box2.ul.x; box2.ul.x = t; }
          if (box.ur.x < box.ul.x) { s1 = true; t = box.ur.x; box.ur.x = box.ul.x; box.ul.x = t; }
          if (box.ur.x < box2.ul.x || box.ul.x > box2.ur.x || ((box.ul.x === box2.ur.x || box.ur.x === box2.ul.x) && box2.ur.x !== box2.ul.x && box.ul.x !== box.ur.x)) {}
          else return true;
          if (s2) { t = box2.ur.x; box2.ur.x = box2.ul.x; box2.ul.x = t; }
          if (s1) { t = box.ur.x; box.ur.x = box.ul.x; box.ul.x = t; }
        }
        rot(box2);
      }
      rot(box);
    }
    return false;
  };
  P.createBoxMatrix = function () {
    var num = this.getNumBoxes(), boxSize = 64, i, j, k;
    var adjacent = new Uint8Array(boxSize * boxSize), itinerary = new Uint8Array(boxSize * boxSize);
    for (i = 0; i < num; i++) for (j = 0; j < num; j++) {
      if (i === j) { adjacent[i * boxSize + j] = 0; itinerary[i * boxSize + j] = j; }
      else if (this.areBoxesNeighbors(i, j)) { adjacent[i * boxSize + j] = 1; itinerary[i * boxSize + j] = j; }
      else { adjacent[i * boxSize + j] = 255; itinerary[i * boxSize + j] = 0; }
    }
    for (k = 0; k < num; k++) for (i = 0; i < num; i++) for (j = 0; j < num; j++) {
      if (i === j) continue;
      var distIK = adjacent[boxSize * i + k], distKJ = adjacent[boxSize * k + j];
      if (adjacent[boxSize * i + j] > (distIK + distKJ) & 0xFF) { adjacent[boxSize * i + j] = (distIK + distKJ) & 0xFF; itinerary[boxSize * i + j] = itinerary[boxSize * i + k]; }
    }
    var out = [];
    for (i = 0; i < num; i++) {
      out.push(0xFF);
      for (j = 0; j < num; j++) {
        var it = itinerary[boxSize * i + j];
        if (it !== 0) {
          out.push(j);
          while (j < num - 1 && it === itinerary[boxSize * i + (j + 1)]) j++;
          out.push(j); out.push(it);
        }
      }
    }
    out.push(0xFF);
    this.boxMatrix = new Uint8Array(out);
  };
})();

if (typeof module !== 'undefined') module.exports = SCUMM;
