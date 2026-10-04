/*
 * SCUMM v5 image decoding: 8-pixel-wide strip codecs for room backgrounds and
 * object images, and the run-length coded z-plane masks.
 * Ported from ScummVM's engines/scumm/gfx.cpp (GPL v3).
 */
var SCUMM = (function (g) { return g.SCUMM || (g.SCUMM = {}); })(typeof globalThis !== 'undefined' ? globalThis : this);

SCUMM.Gfx = (function () {
  'use strict';

  var identity = new Uint8Array(256);
  for (var ii = 0; ii < 256; ii++) identity[ii] = ii;

  // Decode one strip (8 px wide, `height` rows) at d[off] (code byte first) into
  // dst (8-bit indices) at dstOff with row pitch `pitch`. Returns true when the
  // codec is a transparent one (pixels equal to `transp` are left untouched).
  // pal (optional) is the room palette remap table applied to every written pixel.
  function decodeStrip(d, off, height, dst, dstOff, pitch, transp, pal) {
    var code = d[off], p = off + 1;
    var shr = code % 10, mask = 0xFF >> (8 - shr);
    var x, h, o, color, bits, cl, inc, bit;
    var transpStrip = false;

    if (!pal) { pal = identity; }
    if (code === 1) {                       // raw 8-bit pixels
      for (h = 0; h < height; h++) { o = dstOff + h * pitch; for (x = 0; x < 8; x++) dst[o + x] = pal[d[p++]]; }
      return false;
    }
    if (code >= 14 && code <= 18 || code >= 34 && code <= 38) {   // zig-zag, vertical
      transpStrip = code >= 34;
      color = d[p++]; bits = d[p++]; cl = 8; inc = -1;
      for (x = 0; x < 8; x++) {
        o = dstOff + x;
        for (h = 0; h < height; h++) {
          if (cl <= 8) { bits |= d[p++] << cl; cl += 8; }
          if (!transpStrip || color !== transp) dst[o] = pal[color];
          o += pitch;
          cl--; bit = bits & 1; bits >>>= 1;
          if (bit) {
            cl--; bit = bits & 1; bits >>>= 1;
            if (!bit) {
              if (cl <= 8) { bits |= d[p++] << cl; cl += 8; }
              color = bits & mask; bits >>>= shr; cl -= shr; inc = -1;
            } else {
              cl--; bit = bits & 1; bits >>>= 1;
              if (!bit) color = (color + inc) & 0xFF;
              else { inc = -inc; color = (color + inc) & 0xFF; }
            }
          }
        }
      }
      return transpStrip;
    }
    if (code >= 24 && code <= 28 || code >= 44 && code <= 48) {   // zig-zag, horizontal
      transpStrip = code >= 44;
      color = d[p++]; bits = d[p++]; cl = 8; inc = -1;
      for (h = 0; h < height; h++) {
        o = dstOff + h * pitch;
        for (x = 0; x < 8; x++) {
          if (cl <= 8) { bits |= d[p++] << cl; cl += 8; }
          if (!transpStrip || color !== transp) dst[o + x] = pal[color];
          cl--; bit = bits & 1; bits >>>= 1;
          if (bit) {
            cl--; bit = bits & 1; bits >>>= 1;
            if (!bit) {
              if (cl <= 8) { bits |= d[p++] << cl; cl += 8; }
              color = bits & mask; bits >>>= shr; cl -= shr; inc = -1;
            } else {
              cl--; bit = bits & 1; bits >>>= 1;
              if (!bit) color = (color + inc) & 0xFF;
              else { inc = -inc; color = (color + inc) & 0xFF; }
            }
          }
        }
      }
      return transpStrip;
    }
    if (code >= 64 && code <= 68 || code >= 84 && code <= 88 || code >= 104 && code <= 108 || code >= 124 && code <= 128) {
      // major/minor jump codec (horizontal)
      transpStrip = (code >= 84 && code <= 88) || (code >= 124 && code <= 128);
      color = d[p]; bits = d[p + 1] | (d[p + 2] << 8); p += 3;
      var numBits = 16, repeat = false, repeatCount = 0, diff, v;
      for (h = 0; h < height; h++) {
        o = dstOff + h * pitch;
        for (x = 0; x < 8; x++) {
          if (!transpStrip || color !== transp) dst[o + x] = pal[color];
          if (!repeat) {
            if (numBits <= 8) { bits |= d[p++] << numBits; numBits += 8; }
            v = bits & 1; bits >>>= 1; numBits--;
            if (v) {
              if (numBits <= 8) { bits |= d[p++] << numBits; numBits += 8; }
              v = bits & 1; bits >>>= 1; numBits--;
              if (v) {
                if (numBits <= 8) { bits |= d[p++] << numBits; numBits += 8; }
                diff = (bits & 7) - 4; bits >>>= 3; numBits -= 3;
                if (diff) color = (color + diff) & 0xFF;
                else {
                  if (numBits <= 8) { bits |= d[p++] << numBits; numBits += 8; }
                  repeatCount = (bits & 0xFF) - 1; bits >>>= 8; numBits -= 8;
                  repeat = true;
                }
              } else {
                if (numBits <= 8) { bits |= d[p++] << numBits; numBits += 8; }
                color = bits & ((1 << shr) - 1); bits >>>= shr; numBits -= shr;
              }
            }
          } else {
            if (--repeatCount === 0) repeat = false;
          }
        }
      }
      return transpStrip;
    }
    throw new Error('unsupported strip codec ' + code);
  }

  // Z-plane mask strip: run-length coded bytes, one byte (8 pixels) per row.
  function decodeMaskImg(d, off, height, dst, dstOff, maskPitch, orMode) {
    var p = off, o = dstOff, b, c;
    while (height > 0) {
      b = d[p++];
      if (b & 0x80) {
        b &= 0x7F; c = d[p++];
        do { if (orMode) dst[o] |= c; else dst[o] = c; o += maskPitch; height--; } while (--b && height);
      } else {
        do { if (orMode) dst[o] |= d[p]; else dst[o] = d[p]; p++; o += maskPitch; height--; } while (--b && height);
      }
    }
  }

  return { decodeStrip: decodeStrip, decodeMaskImg: decodeMaskImg };
})();

if (typeof module !== 'undefined') module.exports = SCUMM;
