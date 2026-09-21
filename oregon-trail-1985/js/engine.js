// engine.js — the Apple II side of things: a 280x192 hi-res screen kept as the real
// 40 bytes a line, the decoders for the disks' picture and image formats, sprite
// drawing with the same bit-level semantics as the machine, the six-colour NTSC
// rendering rules, and the tune player.
var A2 = (function () {
  'use strict';
  var W = 280, H = 192, BPL = 40;

  function b64(s) { var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }

  // The run-length code shared by the .PCK screens and the packed .IMA images (the game's DUN unpacker):
  // a control byte below $40 is followed by that many+1 literal bytes, $40-$7F repeats the next byte
  // (n&$3F)+1 times, $80-$BF repeats the next two bytes, $C0 ends the data.
  function unpackRLE(data, pos, n) {
    var out = new Uint8Array(n), o = 0;
    while (o < n && pos < data.length) {
      var c = data[pos++];
      if (c < 0x40) { for (var i = 0; i <= c && o < n; i++) out[o++] = data[pos++]; }
      else if (c < 0x80) { var b = data[pos++]; for (i = 0; i <= (c & 0x3F) && o < n; i++) out[o++] = b; }
      else if (c === 0xC0) break;
      else { var b1 = data[pos++], b2 = data[pos++]; for (i = 0; i <= (c & 0x3F) && o < n; i++) { out[o++] = b1; if (o < n) out[o++] = b2; } }
    }
    return out;
  }

  // A .PCK is one screen stored column by column; returns it row by row (40 bytes a line).
  function unpackScreen(pck) {
    var col = unpackRLE(pck, 0, BPL * H), out = new Uint8Array(BPL * H);
    for (var c = 0; c < BPL; c++) for (var y = 0; y < H; y++) out[y * BPL + c] = col[c * H + y];
    return out;
  }

  // An .IMA library: a count, then an offset per image (numbered from 1; bit 15 marks a raw image),
  // each image a width in bytes, a height, and its bytes: row by row if raw, else column by column packed.
  function library(bytes) {
    var count = bytes[0] | bytes[1] << 8, cache = {};
    return {
      count: count,
      get: function (n) {
        if (cache[n]) return cache[n];
        var lo = bytes[2 * n], hi = bytes[2 * n + 1], off = lo | (hi & 0x3F) << 8, raw = !!(hi & 0x80);
        if (!off) return null;
        var w = bytes[off], h = bytes[off + 1], rows = new Uint8Array(w * h);
        if (raw) { rows.set(bytes.subarray(off + 2, off + 2 + w * h)); }
        else { var col = unpackRLE(bytes, off + 2, w * h); for (var c = 0; c < w; c++) for (var y = 0; y < h; y++) rows[y * w + c] = col[c * h + y]; }
        return (cache[n] = { w: w, h: h, px: w * 7, rows: rows });
      }
    };
  }

  // Horizontal mirror of an image, as the hunt's flip routine does it: bytes reversed within each row and
  // the seven pixel bits reversed within each byte (the colour bit stays).
  function flipImage(img) {
    if (img.flipped) return img.flipped;
    var w = img.w, h = img.h, rows = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) for (var c = 0; c < w; c++) {
      var b = img.rows[y * w + (w - 1 - c)], r = b & 0x80;
      for (var i = 0; i < 7; i++) if (b & (1 << i)) r |= 1 << (6 - i);
      rows[y * w + c] = r;
    }
    return (img.flipped = { w: w, h: h, px: img.px, rows: rows, flipped: img });
  }

  // The colours an Apple II shows on a colour monitor.
  var PAL = { black: [0, 0, 0], white: [255, 255, 255], violet: [221, 68, 221], green: [40, 200, 60], blue: [40, 150, 240], orange: [240, 120, 40] };

  function Screen() { this.bytes = new Uint8Array(BPL * H); }
  Screen.prototype.clear = function () { this.bytes.fill(0); };
  Screen.prototype.load = function (screenBytes) { this.bytes.set(screenBytes); };
  Screen.prototype.getPixel = function (x, y) {
    if (x < 0 || x >= W || y < 0 || y >= H) return 0;
    return (this.bytes[y * BPL + ((x / 7) | 0)] >> (x % 7)) & 1;
  };
  // Draws an image with its top-left pixel at (x, y): mode 'or' merges its lit pixels (sprites), 'copy' also
  // clears what it covers (backgrounds), 'xor' toggles (the bullet), 'clear' erases its lit pixels and 'and' erases
  // where it is dark (a mask).  A byte's colour bit is carried across.
  Screen.prototype.put = function (img, x, y, mode, flip) {
    if (!img) return;
    if (flip) img = flipImage(img);
    var w = img.w, h = img.h, bytes = this.bytes;
    x = Math.round(x); y = Math.round(y);
    for (var r = 0; r < h; r++) {
      var sy = y + r;
      if (sy < 0 || sy >= H) continue;
      var base = sy * BPL;
      if (mode === 'copy') {
        for (var px = x; px < x + w * 7; px++) if (px >= 0 && px < W) bytes[base + ((px / 7) | 0)] &= ~(1 << (px % 7));
      }
      if (mode === 'and') {                                     // keep the screen only where the mask is lit
        for (var c2 = 0; c2 < w; c2++) for (var i2 = 0; i2 < 7; i2++) {
          var sx2 = x + c2 * 7 + i2;
          if (sx2 >= 0 && sx2 < W && !(img.rows[r * w + c2] & (1 << i2))) bytes[base + ((sx2 / 7) | 0)] &= ~(1 << (sx2 % 7));
        }
        continue;
      }
      for (var c = 0; c < w; c++) {
        var b = img.rows[r * w + c], x0 = x + c * 7;
        if (b & 0x80) {
          var d0 = (x0 / 7) | 0, d1 = ((x0 + 6) / 7) | 0;
          if (d0 >= 0 && d0 < BPL) bytes[base + d0] |= 0x80;
          if (d1 >= 0 && d1 < BPL && d1 !== d0) bytes[base + d1] |= 0x80;
        }
        if (!(b & 0x7F)) continue;
        for (var i = 0; i < 7; i++) {
          if (!(b & (1 << i))) continue;
          var sx = x0 + i;
          if (sx < 0 || sx >= W) continue;
          var idx = base + ((sx / 7) | 0), bit = 1 << (sx % 7);
          if (mode === 'xor') bytes[idx] ^= bit; else if (mode === 'clear') bytes[idx] &= ~bit; else bytes[idx] |= bit;
        }
      }
    }
  };
  // A filled rectangle in one of the hi-res colours (0 black, 1 green, 2 violet, 3 white, 5 orange, 6 blue).
  Screen.prototype.box = function (x1, y1, x2, y2, colour) {
    var bytes = this.bytes;
    for (var y = Math.max(0, y1); y <= Math.min(H - 1, y2); y++) {
      var base = y * BPL;
      for (var x = Math.max(0, x1); x <= Math.min(W - 1, x2); x++) {
        var idx = base + ((x / 7) | 0), bit = 1 << (x % 7);
        var c = colour & 3, on = c === 3 || (c === 1 && (x & 1)) || (c === 2 && !(x & 1));
        if (on) bytes[idx] |= bit; else bytes[idx] &= ~bit;
        if (colour & 4) bytes[idx] |= 0x80; else bytes[idx] &= 0x7F;
      }
    }
  };
  // Renders the screen into an ImageData (280 x 192) with the colour rules: two lit pixels side by side are
  // white, a lone lit pixel is violet or green by its column (blue or orange when the byte's colour bit is
  // set), and the gap between two lit pixels one apart takes their colour.  mono draws the raw dots.
  Screen.prototype.render = function (imageData, mono) {
    var data = imageData.data, bytes = this.bytes, bits = this._bits || (this._bits = new Uint8Array(W + 2)), hb = this._hb || (this._hb = new Uint8Array(W + 2));
    var white = PAL.white, violet = PAL.violet, green = PAL.green, blue = PAL.blue, orange = PAL.orange;
    for (var y = 0; y < H; y++) {
      var base = y * BPL;
      for (var c = 0; c < BPL; c++) {
        var b = bytes[base + c], o = 1 + c * 7, high = b >> 7;
        for (var i = 0; i < 7; i++) { bits[o + i] = (b >> i) & 1; hb[o + i] = high; }
      }
      bits[0] = 0; bits[W + 1] = 0;
      var p = y * W * 4;
      for (var x = 0; x < W; x++, p += 4) {
        var i2 = x + 1, col = null;
        if (mono) { if (bits[i2]) col = white; }
        else if (bits[i2]) {
          if (bits[i2 - 1] || bits[i2 + 1]) col = white;
          else col = (x & 1) ? (hb[i2] ? orange : green) : (hb[i2] ? blue : violet);
        } else if (bits[i2 - 1] && bits[i2 + 1]) {
          var xx = x - 1; col = (xx & 1) ? (hb[i2] ? orange : green) : (hb[i2] ? blue : violet);
        }
        if (col) { data[p] = col[0]; data[p + 1] = col[1]; data[p + 2] = col[2]; } else { data[p] = data[p + 1] = data[p + 2] = 0; }
        data[p + 3] = 255;
      }
    }
  };

  // ---- tunes: pairs of (note, duration) after a four-byte header, $80 ends; note 0 is a rest.
  // The machine's pitch table runs a semitone a step with note 20 close to middle C; a duration unit is 5.8 ms.
  var audio = null, playing = null;
  function tunePlayer() {
    return {
      play: function (bytes, loop, onEnd) {
        this.stop();
        try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
        if (audio.state === 'suspended') audio.resume();
        var notes = [];
        for (var p = 4; p + 1 < bytes.length; p += 2) { if (bytes[p] === 0x80) break; notes.push([bytes[p], bytes[p + 1]]); }
        var t = audio.currentTime + 0.05, gain = audio.createGain(); gain.gain.value = 0.06; gain.connect(audio.destination);
        var oscs = [];
        notes.forEach(function (n) {
          var dur = n[1] * 0.00576;
          if (n[0]) {
            var o = audio.createOscillator(); o.type = 'square'; o.frequency.value = 262 * Math.pow(2, (n[0] - 20) / 12);
            o.connect(gain); o.start(t); o.stop(t + dur * 0.92); oscs.push(o);
          }
          t += dur;
        });
        var self = this;
        playing = { gain: gain, oscs: oscs, timer: setTimeout(function () { if (playing && playing.gain === gain) { playing = null; if (loop) self.play(bytes, loop, onEnd); else if (onEnd) onEnd(); } }, (t - audio.currentTime) * 1000) };
      },
      stop: function () {
        if (!playing) return;
        clearTimeout(playing.timer);
        try { playing.oscs.forEach(function (o) { o.stop(); }); playing.gain.disconnect(); } catch (e) {}
        playing = null;
      },
      unlock: function () { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) {} }
    };
  }

  return { W: W, H: H, b64: b64, unpackScreen: unpackScreen, library: library, flipImage: flipImage, Screen: Screen, PAL: PAL, tunePlayer: tunePlayer };
})();
