// A small 1-bit QuickDraw for the Shufflepuck Café port: bitmaps, patterns, pens,
// rectangles, ovals, lines, CopyBits with the classic transfer modes, PICT (v1)
// decoding and bitmap-font text. Pixels are 0 = white, 1 = black, like the Mac.
'use strict';
var QD = (function () {
  function Bitmap(w, h) {
    this.width = w; this.height = h;
    this.pix = new Uint8Array(w * h);
  }
  Bitmap.prototype.fill = function (v) { this.pix.fill(v); };
  Bitmap.prototype.clone = function () { var b = new Bitmap(this.width, this.height); b.pix.set(this.pix); return b; };

  // Rect: {t, l, b, r} (top, left, bottom, right) as in QuickDraw
  function R(l, t, r, b) { return { t: t, l: l, b: b, r: r }; }
  function copyR(r) { return { t: r.t, l: r.l, b: r.b, r: r.r }; }
  function offsetRect(r, dh, dv) { r.l += dh; r.r += dh; r.t += dv; r.b += dv; return r; }
  function insetRect(r, dh, dv) { r.l += dh; r.r -= dh; r.t += dv; r.b -= dv; return r; }
  function unionRect(a, b) { return { t: Math.min(a.t, b.t), l: Math.min(a.l, b.l), b: Math.max(a.b, b.b), r: Math.max(a.r, b.r) }; }
  function sectRect(a, b) { var r = { t: Math.max(a.t, b.t), l: Math.max(a.l, b.l), b: Math.min(a.b, b.b), r: Math.min(a.r, b.r) }; return (r.r > r.l && r.b > r.t) ? r : null; }
  function ptInRect(x, y, r) { return x >= r.l && x < r.r && y >= r.t && y < r.b; }

  // Patterns: 8 bytes, bit 7 of row y&7 is the leftmost pixel. Aligned to the bitmap origin.
  var WHITE = [0, 0, 0, 0, 0, 0, 0, 0], BLACK = [255, 255, 255, 255, 255, 255, 255, 255];
  var GRAY = [0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55];
  var LTGRAY = [0x88, 0x22, 0x88, 0x22, 0x88, 0x22, 0x88, 0x22];
  var DKGRAY = [0x77, 0xDD, 0x77, 0xDD, 0x77, 0xDD, 0x77, 0xDD];
  function patBit(pat, x, y) { return (pat[y & 7] >> (7 - (x & 7))) & 1; }

  // Transfer modes
  var srcCopy = 0, srcOr = 1, srcXor = 2, srcBic = 3, patCopy = 8, patOr = 9, patXor = 10, patBic = 11;
  var notPatCopy = 12, notPatOr = 13, notPatXor = 14, notPatBic = 15;

  // A port: a bitmap plus pen state and a clip rect
  function Port(bm) {
    this.bm = bm;
    this.clip = R(-32768, -32768, 32767, 32767);
    this.penPat = BLACK; this.penSize = [1, 1]; this.penMode = patCopy;
    this.penX = 0; this.penY = 0;
  }
  Port.prototype.setPort = function (bm) { this.bm = bm; };
  Port.prototype.clipRect = function (r) { this.clip = copyR(r); };
  Port.prototype.penPattern = function (p) { this.penPat = p; };
  Port.prototype.pen = function (w, h) { this.penSize = [w, h]; };
  Port.prototype.mode = function (m) { this.penMode = m; };
  Port.prototype.moveTo = function (x, y) { this.penX = x; this.penY = y; };

  function clipTo(port, r) {
    var bm = port.bm, c = port.clip;
    return { t: Math.max(r.t, c.t, 0), l: Math.max(r.l, c.l, 0), b: Math.min(r.b, c.b, bm.height), r: Math.min(r.r, c.r, bm.width) };
  }
  // paint a span with a pattern and mode
  function patSpan(port, x0, x1, y, pat, mode) {
    var bm = port.bm, pix = bm.pix, row = y * bm.width;
    for (var x = x0; x < x1; x++) {
      var p = patBit(pat, x, y), i = row + x;
      if (mode >= notPatCopy) { p ^= 1; mode -= 4; }
      switch (mode) {
        case patCopy: pix[i] = p; break;
        case patOr: pix[i] |= p; break;
        case patXor: pix[i] ^= p; break;
        case patBic: pix[i] &= p ^ 1; break;
      }
    }
  }
  Port.prototype.paintRectPat = function (r, pat, mode) {
    var c = clipTo(this, r);
    for (var y = c.t; y < c.b; y++) if (c.r > c.l) patSpan(this, c.l, c.r, y, pat, mode);
  };
  Port.prototype.fillRect = function (r, pat) { this.paintRectPat(r, pat, patCopy); };
  Port.prototype.paintRect = function (r) { this.paintRectPat(r, this.penPat, this.penMode); };
  Port.prototype.eraseRect = function (r) { this.paintRectPat(r, WHITE, patCopy); };
  Port.prototype.frameRect = function (r) {
    var pw = this.penSize[0], ph = this.penSize[1];
    if (r.r - r.l <= 2 * pw || r.b - r.t <= 2 * ph) { this.paintRect(r); return; }
    this.paintRect(R(r.l, r.t, r.r, r.t + ph));
    this.paintRect(R(r.l, r.b - ph, r.r, r.b));
    this.paintRect(R(r.l, r.t + ph, r.l + pw, r.b - ph));
    this.paintRect(R(r.r - pw, r.t + ph, r.r, r.b - ph));
  };
  // Lines: the pen rectangle is dragged along the line (QuickDraw puts the pen's
  // top-left corner on each point of the line).
  Port.prototype.lineTo = function (x1, y1) {
    var x0 = this.penX, y0 = this.penY, pw = this.penSize[0], ph = this.penSize[1];
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
    var x = x0, y = y0;
    for (;;) {
      this.paintRectPat(R(x, y, x + pw, y + ph), this.penPat, this.penMode);
      if (x === x1 && y === y1) break;
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    this.penX = x1; this.penY = y1;
  };
  Port.prototype.line = function (dx, dy) { this.lineTo(this.penX + dx, this.penY + dy); };

  // Ovals: QuickDraw-like scan conversion of the ellipse inscribed in r.
  // Returns per-row [left, right) spans (right exclusive), rows t..b-1.
  function ovalSpans(r) {
    var w = r.r - r.l, h = r.b - r.t, spans = [];
    if (w <= 0 || h <= 0) return spans;
    var a = w / 2, b = h / 2, cx = r.l + a, cy = r.t + b;
    for (var y = r.t; y < r.b; y++) {
      // use the row's centre line; clamp so every row has at least one pixel
      var yy = (y + 0.5 - cy) / b;
      var t = 1 - yy * yy; if (t < 0) t = 0;
      var half = a * Math.sqrt(t);
      var l = Math.round(cx - half), rr = Math.round(cx + half);
      if (rr <= l) { l = Math.floor(cx - 0.5); rr = l + 1; }
      if (l < r.l) l = r.l; if (rr > r.r) rr = r.r;
      spans.push([y, l, rr]);
    }
    return spans;
  }
  Port.prototype.paintOvalPat = function (r, pat, mode) {
    var sp = ovalSpans(r), c = clipTo(this, R(-32768, -32768, 32767, 32767));
    for (var i = 0; i < sp.length; i++) {
      var y = sp[i][0]; if (y < c.t || y >= c.b) continue;
      var l = Math.max(sp[i][1], c.l), rr = Math.min(sp[i][2], c.r);
      if (rr > l) patSpan(this, l, rr, y, pat, mode);
    }
  };
  Port.prototype.fillOval = function (r, pat) { this.paintOvalPat(r, pat, patCopy); };
  Port.prototype.paintOval = function (r) { this.paintOvalPat(r, this.penPat, this.penMode); };
  Port.prototype.frameOval = function (r) {
    // the frame is the oval minus the oval inset by the pen size
    var pw = this.penSize[0], ph = this.penSize[1];
    var outer = ovalSpans(r), inner = ovalSpans(R(r.l + pw, r.t + ph, r.r - pw, r.b - ph));
    var innerByRow = {};
    for (var i = 0; i < inner.length; i++) innerByRow[inner[i][0]] = inner[i];
    var c = clipTo(this, R(-32768, -32768, 32767, 32767));
    for (i = 0; i < outer.length; i++) {
      var y = outer[i][0]; if (y < c.t || y >= c.b) continue;
      var l = outer[i][1], rr = outer[i][2], inn = innerByRow[y];
      if (!inn) { patSpan(this, Math.max(l, c.l), Math.min(rr, c.r), y, this.penPat, this.penMode); continue; }
      var l2 = Math.max(l, c.l), r2 = Math.min(inn[1], c.r); if (r2 > l2) patSpan(this, l2, r2, y, this.penPat, this.penMode);
      l2 = Math.max(inn[2], c.l); r2 = Math.min(rr, c.r); if (r2 > l2) patSpan(this, l2, r2, y, this.penPat, this.penMode);
    }
  };

  // CopyBits (no scaling: the rectangles have the same size)
  function copyBits(src, srcRect, dst, dstRect, mode, clip) {
    var w = srcRect.r - srcRect.l, h = srcRect.b - srcRect.t;
    var sp = src.pix, dp = dst.pix, sw = src.width, dw = dst.width;
    for (var y = 0; y < h; y++) {
      var sy = srcRect.t + y, dy = dstRect.t + y;
      if (sy < 0 || sy >= src.height || dy < 0 || dy >= dst.height) continue;
      if (clip && (dy < clip.t || dy >= clip.b)) continue;
      var x0 = 0, x1 = w;
      if (srcRect.l < 0) x0 = -srcRect.l;
      if (dstRect.l < 0) x0 = Math.max(x0, -dstRect.l);
      if (srcRect.l + x1 > sw) x1 = sw - srcRect.l;
      if (dstRect.l + x1 > dw) x1 = dw - dstRect.l;
      if (clip) { if (dstRect.l + x0 < clip.l) x0 = clip.l - dstRect.l; if (dstRect.l + x1 > clip.r) x1 = clip.r - dstRect.l; }
      var si = sy * sw + srcRect.l, di = dy * dw + dstRect.l;
      switch (mode) {
        case srcCopy: for (var x = x0; x < x1; x++) dp[di + x] = sp[si + x]; break;
        case srcOr: for (x = x0; x < x1; x++) dp[di + x] |= sp[si + x]; break;
        case srcXor: for (x = x0; x < x1; x++) dp[di + x] ^= sp[si + x]; break;
        case srcBic: for (x = x0; x < x1; x++) dp[di + x] &= sp[si + x] ^ 1; break;
      }
    }
  }

  // ---- PICT version 1 decoding (what the game's pictures use) ----
  function unpackBits(src, p, rowbytes, out) {
    var n = 0;
    while (n < rowbytes) {
      var c = src[p++];
      if (c < 128) { for (var i = 0; i <= c; i++) out[n++] = src[p++]; }
      else if (c > 128) { var v = src[p++]; for (i = 0; i < 257 - c; i++) out[n++] = v; }
    }
    return p;
  }
  function be16(b, p) { return (b[p] << 8) | b[p + 1]; }
  function s16(b, p) { var v = be16(b, p); return v >= 0x8000 ? v - 0x10000 : v; }
  // Decodes a PICT into a Bitmap of its frame size (pixels relative to the frame's top-left).
  function decodePict(data) {
    var t = s16(data, 2), l = s16(data, 4), b = s16(data, 6), r = s16(data, 8);
    var bm = new Bitmap(r - l, b - t), pix = bm.pix, W = bm.width;
    var p = 10;
    while (p < data.length) {
      var op = data[p++];
      if (op === 0x11) p += 1;
      else if (op === 0x00 || op === 0x1e) {}
      else if (op === 0x01) p += be16(data, p);
      else if (op === 0xa0) p += 2;
      else if (op === 0xa1) p += 4 + be16(data, p + 2);
      else if (op === 0x90 || op === 0x98 || op === 0x91 || op === 0x99) {
        var rowbytes = be16(data, p); p += 2;
        var bt = s16(data, p), bl = s16(data, p + 2), bb = s16(data, p + 4), br = s16(data, p + 6); p += 8;
        var st = s16(data, p), sl = s16(data, p + 2), sb = s16(data, p + 4), sr = s16(data, p + 6); p += 8;
        var dt = s16(data, p), dl = s16(data, p + 2), db = s16(data, p + 4), dr = s16(data, p + 6); p += 8;
        var mode = be16(data, p); p += 2;
        if (op === 0x91 || op === 0x99) p += be16(data, p);
        var h = bb - bt, row = new Uint8Array(rowbytes), packed = !(op === 0x90 || op === 0x91 || rowbytes < 8);
        for (var y = 0; y < h; y++) {
          if (packed) {
            var cnt; if (rowbytes > 250) { cnt = be16(data, p); p += 2; } else { cnt = data[p++]; }
            unpackBits(data, p, rowbytes, row); p += cnt;
          } else { row.set(data.subarray(p, p + rowbytes)); p += rowbytes; }
          var yy = y + bt;                    // absolute row in the bitmap's coordinates
          if (yy < st || yy >= sb) continue;
          var dy = dt + (yy - st) - t; if (dy < 0 || dy >= bm.height) continue;
          for (var x = sl; x < sr; x++) {
            var sx = x - bl, bit = (row[sx >> 3] >> (7 - (sx & 7))) & 1;
            var dx = dl + (x - sl) - l; if (dx < 0 || dx >= W) continue;
            var i = dy * W + dx, m = mode & 7;
            if (m === 0) pix[i] = bit; else if (m === 1) pix[i] |= bit; else if (m === 2) pix[i] ^= bit; else if (m === 3) pix[i] &= bit ^ 1; else pix[i] = bit;
          }
        }
      }
      else if (op === 0xff) break;
      else if (op === 0x0a || op === 0x09 || op === 0x02) p += 8;
      else if (op === 0x07) p += 4;
      else if (op === 0x08 || op === 0x03 || op === 0x05 || op === 0x0d) p += 2;
      else if (op === 0x04) p += 1;
      else if (op === 0x20) p += 8; else if (op === 0x21) p += 4; else if (op === 0x22) p += 6; else if (op === 0x23) p += 2;
      else if ((op >= 0x30 && op <= 0x37) || (op >= 0x40 && op <= 0x47) || (op >= 0x50 && op <= 0x57)) p += 8;
      else if ((op >= 0x38 && op <= 0x3f) || (op >= 0x48 && op <= 0x4f) || (op >= 0x58 && op <= 0x5f)) {}
      else if (op === 0x28) p += 5 + data[p + 4];
      else if (op === 0x29 || op === 0x2a) p += 2 + data[p + 1];
      else if (op === 0x2b) p += 3 + data[p + 2];
      else throw new Error('PICT op ' + op.toString(16));
    }
    bm.frame = R(l, t, r, b);
    return bm;
  }

  // ---- bitmap fonts (from FONT resources, see tools/build_data.py) ----
  // font = {height, ascent, descent, glyphs: {code: [bearing, advance, columns]}}
  function stringWidth(font, s, bold) {
    var w = 0;
    for (var i = 0; i < s.length; i++) {
      var g = font.glyphs[s.charCodeAt(i)] || font.glyphs[font.last + 1];
      if (g) w += g[1] + (bold ? 1 : 0);
    }
    return w;
  }
  // draws at the pen position (baseline), mode srcOr (black) or srcBic (white); bold smears 1px right
  Port.prototype.drawString = function (font, s, bold, mode) {
    var x = this.penX, y = this.penY - font.ascent, bm = this.bm, pix = bm.pix, W = bm.width, c = this.clip;
    for (var i = 0; i < s.length; i++) {
      var g = font.glyphs[s.charCodeAt(i)] || font.glyphs[font.last + 1];
      if (!g) continue;
      var cols = g[2], x0 = x + g[0];
      for (var cx = 0; cx < cols.length; cx++) {
        var col = cols[cx];
        for (var cy = 0; cy < font.height; cy++) {
          if (!((col >> cy) & 1)) continue;
          for (var dx = 0; dx <= (bold ? 1 : 0); dx++) {
            var px = x0 + cx + dx, py = y + cy;
            if (px < 0 || py < 0 || px >= W || py >= bm.height || px < c.l || px >= c.r || py < c.t || py >= c.b) continue;
            if (mode === srcBic) pix[py * W + px] = 0; else if (mode === srcXor) pix[py * W + px] ^= 1; else pix[py * W + px] = 1;
          }
        }
      }
      x += g[1] + (bold ? 1 : 0);
    }
    this.penX = x;
  };

  // ---- presenting a bitmap on a canvas ----
  function present(bm, ctx, imgData) {
    var d = imgData.data, p = bm.pix, n = p.length;
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      var v = p[i] ? 0 : 255;
      d[j] = v; d[j + 1] = v; d[j + 2] = v; d[j + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  return { Bitmap: Bitmap, Port: Port, R: R, copyR: copyR, offsetRect: offsetRect, insetRect: insetRect, unionRect: unionRect, sectRect: sectRect, ptInRect: ptInRect,
    WHITE: WHITE, BLACK: BLACK, GRAY: GRAY, LTGRAY: LTGRAY, DKGRAY: DKGRAY,
    srcCopy: srcCopy, srcOr: srcOr, srcXor: srcXor, srcBic: srcBic, patCopy: patCopy, patOr: patOr, patXor: patXor, patBic: patBic,
    notPatCopy: notPatCopy, notPatOr: notPatOr, notPatXor: notPatXor, notPatBic: notPatBic,
    copyBits: copyBits, decodePict: decodePict, stringWidth: stringWidth, present: present, ovalSpans: ovalSpans };
})();
if (typeof module !== 'undefined') module.exports = QD;
