/*
 * StuffIt 5 archive reader with the "Arsenic" (method 15) decompressor, so the
 * page can take the game straight from the user's .sit file.
 * Ported from The Unarchiver's XADStuffIt5Parser.m / XADStuffItArsenicHandle.m
 * (MacPaw/XADMaster, LGPL).
 */
var SCUMM = (function (g) { return g.SCUMM || (g.SCUMM = {}); })(typeof globalThis !== 'undefined' ? globalThis : this);

SCUMM.StuffIt = (function () {
  'use strict';

  var RandomizationTable = [
    0xee, 0x56, 0xf8, 0xc3, 0x9d, 0x9f, 0xae, 0x2c, 0xad, 0xcd, 0x24, 0x9d, 0xa6, 0x101, 0x18, 0xb9,
    0xa1, 0x82, 0x75, 0xe9, 0x9f, 0x55, 0x66, 0x6a, 0x86, 0x71, 0xdc, 0x84, 0x56, 0x96, 0x56, 0xa1,
    0x84, 0x78, 0xb7, 0x32, 0x6a, 0x3, 0xe3, 0x2, 0x11, 0x101, 0x8, 0x44, 0x83, 0x100, 0x43, 0xe3,
    0x1c, 0xf0, 0x86, 0x6a, 0x6b, 0xf, 0x3, 0x2d, 0x86, 0x17, 0x7b, 0x10, 0xf6, 0x80, 0x78, 0x7a,
    0xa1, 0xe1, 0xef, 0x8c, 0xf6, 0x87, 0x4b, 0xa7, 0xe2, 0x77, 0xfa, 0xb8, 0x81, 0xee, 0x77, 0xc0,
    0x9d, 0x29, 0x20, 0x27, 0x71, 0x12, 0xe0, 0x6b, 0xd1, 0x7c, 0xa, 0x89, 0x7d, 0x87, 0xc4, 0x101,
    0xc1, 0x31, 0xaf, 0x38, 0x3, 0x68, 0x1b, 0x76, 0x79, 0x3f, 0xdb, 0xc7, 0x1b, 0x36, 0x7b, 0xe2,
    0x63, 0x81, 0xee, 0xc, 0x63, 0x8b, 0x78, 0x38, 0x97, 0x9b, 0xd7, 0x8f, 0xdd, 0xf2, 0xa3, 0x77,
    0x8c, 0xc3, 0x39, 0x20, 0xb3, 0x12, 0x11, 0xe, 0x17, 0x42, 0x80, 0x2c, 0xc4, 0x92, 0x59, 0xc8,
    0xdb, 0x40, 0x76, 0x64, 0xb4, 0x55, 0x1a, 0x9e, 0xfe, 0x5f, 0x6, 0x3c, 0x41, 0xef, 0xd4, 0xaa,
    0x98, 0x29, 0xcd, 0x1f, 0x2, 0xa8, 0x87, 0xd2, 0xa0, 0x93, 0x98, 0xef, 0xc, 0x43, 0xed, 0x9d,
    0xc2, 0xeb, 0x81, 0xe9, 0x64, 0x23, 0x68, 0x1e, 0x25, 0x57, 0xde, 0x9a, 0xcf, 0x7f, 0xe5, 0xba,
    0x41, 0xea, 0xea, 0x36, 0x1a, 0x28, 0x79, 0x20, 0x5e, 0x18, 0x4e, 0x7c, 0x8e, 0x58, 0x7a, 0xef,
    0x91, 0x2, 0x93, 0xbb, 0x56, 0xa1, 0x49, 0x1b, 0x79, 0x92, 0xf3, 0x58, 0x4f, 0x52, 0x9c, 0x2,
    0x77, 0xaf, 0x2a, 0x8f, 0x49, 0xd0, 0x99, 0x4d, 0x98, 0x101, 0x60, 0x93, 0x100, 0x75, 0x31, 0xce,
    0x49, 0x20, 0x56, 0x57, 0xe2, 0xf5, 0x26, 0x2b, 0x8a, 0xbf, 0xde, 0xd0, 0x83, 0x34, 0xf4, 0x17
  ];

  var crcTable = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();

  // MSB-first bit reader
  function BitReader(buf, start, end) { this.buf = buf; this.pos = start; this.end = end; this.bitbuf = 0; this.bitcnt = 0; }
  BitReader.prototype.bit = function () {
    if (this.bitcnt === 0) {
      if (this.pos >= this.end) throw new Error('StuffIt: unexpected end of data');
      this.bitbuf = this.buf[this.pos++]; this.bitcnt = 8;
    }
    this.bitcnt--;
    return (this.bitbuf >> this.bitcnt) & 1;
  };
  BitReader.prototype.bits = function (n) { var v = 0; for (var i = 0; i < n; i++) v = (v * 2) + this.bit(); return v; };

  // adaptive arithmetic coding model
  function Model(first, last, increment, limit) {
    this.increment = increment; this.limit = limit; this.n = last - first + 1;
    this.symbols = new Int32Array(this.n); this.freq = new Int32Array(this.n);
    for (var i = 0; i < this.n; i++) this.symbols[i] = i + first;
    this.reset();
  }
  Model.prototype.reset = function () { this.total = this.increment * this.n; this.freq.fill(this.increment); };
  Model.prototype.increase = function (i) {
    this.freq[i] += this.increment; this.total += this.increment;
    if (this.total > this.limit) {
      this.total = 0;
      for (var k = 0; k < this.n; k++) { this.freq[k] = (this.freq[k] + 1) >> 1; this.total += this.freq[k]; }
    }
  };

  var NumBits = 26, One = 1 << (NumBits - 1), Half = 1 << (NumBits - 2);
  function Decoder(input) { this.input = input; this.range = One; this.code = input.bits(NumBits); }
  Decoder.prototype.next = function (symlow, symsize, symtot) {
    var renorm = (this.range / symtot) | 0, lowincr = renorm * symlow;
    this.code -= lowincr;
    if (symlow + symsize === symtot) this.range -= lowincr; else this.range = symsize * renorm;
    while (this.range <= Half) { this.range <<= 1; this.code = (this.code << 1) | this.input.bit(); }
  };
  Decoder.prototype.symbol = function (m) {
    var frequency = (this.code / ((this.range / m.total) | 0)) | 0, cumulative = 0, n;
    for (n = 0; n < m.n - 1; n++) {
      if (cumulative + m.freq[n] > frequency) break;
      cumulative += m.freq[n];
    }
    this.next(cumulative, m.freq[n], m.total);
    m.increase(n);
    return m.symbols[n];
  };
  Decoder.prototype.bitString = function (m, bits) { var r = 0; for (var i = 0; i < bits; i++) if (this.symbol(m)) r |= 1 << i; return r; };

  function arsenic(buf, start, len, outLen) {
    var input = new BitReader(buf, start, start + len), dec = new Decoder(input);
    var initial = new Model(0, 1, 1, 256), selector = new Model(0, 10, 8, 1024);
    var mtfmodel = [new Model(2, 3, 8, 1024), new Model(4, 7, 4, 1024), new Model(8, 15, 4, 1024), new Model(16, 31, 4, 1024),
                    new Model(32, 63, 2, 1024), new Model(64, 127, 2, 1024), new Model(128, 255, 1, 1024)];
    if (dec.bitString(initial, 8) !== 0x41 || dec.bitString(initial, 8) !== 0x73) throw new Error('StuffIt: bad Arsenic signature');
    var blockbits = dec.bitString(initial, 4) + 9, blocksize = 1 << blockbits;
    var block = new Uint8Array(blocksize), mtf = new Int32Array(256), transform = new Uint32Array(blocksize);
    var out = new Uint8Array(outLen), outPos = 0, crc = 0xFFFFFFFF, compcrc = 0;
    var endofblocks = dec.symbol(initial) !== 0;
    var repeat = 0, count = 0, last = 0;
    function mtfDecode(sym) { var r = mtf[sym]; for (var i = sym; i > 0; i--) mtf[i] = mtf[i - 1]; mtf[0] = r; return r; }
    while (outPos < outLen) {
      if (endofblocks) break;
      // -- read a block --
      for (var i = 0; i < 256; i++) mtf[i] = i;
      var randomized = dec.symbol(initial), transformindex = dec.bitString(initial, blockbits), numbytes = 0;
      for (;;) {
        var sel = dec.symbol(selector);
        if (sel === 0 || sel === 1) {
          var zerostate = 1, zerocount = 0;
          while (sel < 2) {
            if (sel === 0) zerocount += zerostate; else if (sel === 1) zerocount += 2 * zerostate;
            zerostate *= 2;
            sel = dec.symbol(selector);
          }
          if (numbytes + zerocount > blocksize) throw new Error('StuffIt: block overflow');
          block.fill(mtfDecode(0), numbytes, numbytes + zerocount);
          numbytes += zerocount;
        }
        var symbol;
        if (sel === 10) break;
        else if (sel === 2) symbol = 1;
        else symbol = dec.symbol(mtfmodel[sel - 3]);
        if (numbytes >= blocksize) throw new Error('StuffIt: block overflow');
        block[numbytes++] = mtfDecode(symbol);
      }
      if (transformindex >= numbytes) throw new Error('StuffIt: bad transform index');
      selector.reset();
      for (i = 0; i < 7; i++) mtfmodel[i].reset();
      if (dec.symbol(initial)) { compcrc = dec.bitString(initial, 32) >>> 0; endofblocks = true; }
      // inverse BWT
      var counts = new Int32Array(256), cum = new Int32Array(256), total = 0;
      for (i = 0; i < numbytes; i++) counts[block[i]]++;
      for (i = 0; i < 256; i++) { cum[i] = total; total += counts[i]; counts[i] = 0; }
      for (i = 0; i < numbytes; i++) { var b = block[i]; transform[cum[b] + counts[b]] = i; counts[b]++; }
      // -- produce bytes --
      var bytecount = 0, randindex = 0, randcount = RandomizationTable[0];
      count = 0; last = 0;
      while (bytecount < numbytes && outPos < outLen) {
        var outbyte;
        if (repeat) { repeat--; outbyte = last; }
        else {
          transformindex = transform[transformindex];
          var byte = block[transformindex];
          if (randomized && randcount === bytecount) { byte ^= 1; randindex = (randindex + 1) & 255; randcount += RandomizationTable[randindex]; }
          bytecount++;
          if (count === 4) {
            count = 0;
            if (byte === 0) continue;
            repeat = byte - 1;
            outbyte = last;
          } else {
            if (byte === last) count++; else { count = 1; last = byte; }
            outbyte = byte;
          }
        }
        out[outPos++] = outbyte;
        crc = (crcTable[(crc ^ outbyte) & 0xFF] ^ (crc >>> 8)) >>> 0;
      }
      // drain any pending repeat at block end
      while (repeat && outPos < outLen) { repeat--; out[outPos++] = last; crc = (crcTable[(crc ^ last) & 0xFF] ^ (crc >>> 8)) >>> 0; }
    }
    if (outPos !== outLen) throw new Error('StuffIt: short output (' + outPos + ' of ' + outLen + ')');
    if (endofblocks && compcrc !== ((~crc) >>> 0)) throw new Error('StuffIt: CRC mismatch');
    return out;
  }

  function be32(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }
  function be16(b, o) { return (b[o] << 8) | b[o + 1]; }
  function macRoman(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) { var c = bytes[i]; s += c < 128 ? String.fromCharCode(c) : (c === 0xAA ? '™' : String.fromCharCode(c)); }
    return s;
  }

  function isStuffIt5(b) {
    var sig = 'StuffIt (c)1997-';
    if (b.length < 100) return false;
    for (var i = 0; i < sig.length; i++) if (b[i] !== sig.charCodeAt(i)) return false;
    return true;
  }

  // Returns [{name, path, size, method, offset, compLen, isResource}] for all file entries.
  function list(b) {
    if (!isStuffIt5(b)) throw new Error('not a StuffIt 5 archive');
    var version = b[82], flags = b[83];
    if (version !== 5) throw new Error('StuffIt: unsupported archive version ' + version);
    var numfiles = be16(b, 92), firstoffs = be32(b, 94);
    var entries = [], dirs = {}, p = firstoffs;
    for (var i = 0; i < numfiles; i++) {
      var offs = p;
      if (be32(b, p) !== 0xA5A5A5A5) throw new Error('StuffIt: bad entry header');
      var ver = b[p + 4], headersize = be16(b, p + 6), eflags = b[p + 9];
      var diroffs = be32(b, p + 26), namelength = be16(b, p + 30);
      var datalength = be32(b, p + 34), datacomplen = be32(b, p + 38);
      var q = p + 46, datamethod = 0, nfiles = 0;
      if (eflags & 0x40) {
        nfiles = be16(b, q); q += 2;
        if (datalength === 0xFFFFFFFF) { numfiles++; p = offs + headersize; continue; }
      } else {
        datamethod = b[q]; var passlen = b[q + 1]; q += 2;
        if (passlen) throw new Error('StuffIt: encrypted archives are not supported');
      }
      var name = macRoman(b.subarray(q, q + namelength)); q += namelength;
      if (q < offs + headersize) { var commentsize = be16(b, q); q += 4 + commentsize; }
      var something = be16(b, q); q += 4;
      q += 8; // type, creator
      q += 2; // finder flags
      q += ver === 1 ? 22 : 18;
      var resourcelength = 0, resourcecomplen = 0, resourcemethod = 0;
      if (something & 1) {
        resourcelength = be32(b, q); resourcecomplen = be32(b, q + 4); q += 12; resourcemethod = b[q]; var rpass = b[q + 1]; q += 2;
        if (rpass) throw new Error('StuffIt: encrypted archives are not supported');
      }
      var datastart = q;
      var parent = dirs[diroffs] || '';
      var path = parent ? parent + '/' + name : name;
      if (eflags & 0x40) {
        dirs[offs] = path;
        numfiles += nfiles;
        p = datastart;
      } else {
        if (something & 1) entries.push({ name: name, path: path, size: resourcelength, method: resourcemethod, offset: datastart, compLen: resourcecomplen, isResource: true });
        if (datalength || !(something & 1)) entries.push({ name: name, path: path, size: datalength, method: datamethod, offset: datastart + resourcecomplen, compLen: datacomplen, isResource: false });
        p = datastart + resourcecomplen + datacomplen;
      }
    }
    return entries;
  }

  function extract(b, entry) {
    if (entry.method === 0) return b.slice(entry.offset, entry.offset + entry.size);
    if (entry.method === 15) return arsenic(b, entry.offset, entry.compLen, entry.size);
    throw new Error('StuffIt: compression method ' + entry.method + ' is not supported');
  }

  return { isStuffIt5: isStuffIt5, list: list, extract: extract, arsenic: arsenic };
})();

if (typeof module !== 'undefined') module.exports = SCUMM;
