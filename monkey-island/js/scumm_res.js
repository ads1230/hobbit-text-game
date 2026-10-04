/*
 * SCUMM v5 resource access (The Secret of Monkey Island, 1993 Macintosh data:
 * MONKEY1.000 index + MONKEY1.001 LECF container; every byte XOR 0x69).
 *
 * Block format: 4-char tag, big-endian 32-bit size that includes the 8-byte header.
 * Offsets in the index are relative to the start of a room's ROOM block, whose
 * absolute position comes from the LOFF table at the start of the data file.
 *
 * Layout knowledge follows ScummVM's engines/scumm (GPL v3), see README.
 */
var SCUMM = (function (g) { return g.SCUMM || (g.SCUMM = {}); })(typeof globalThis !== 'undefined' ? globalThis : this);

SCUMM.Res = (function () {
  'use strict';

  function tagAt(b, o) { return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]); }
  function be32(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }
  function le16(b, o) { return b[o] | (b[o + 1] << 8); }
  function le32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  function decode(buf) {
    var out = new Uint8Array(buf.length);
    for (var i = 0; i < buf.length; i++) out[i] = buf[i] ^ 0x69;
    return out;
  }

  function Res(indexRaw, dataRaw, alreadyDecoded) {
    this.idx = alreadyDecoded ? indexRaw : decode(indexRaw);
    this.d = alreadyDecoded ? dataRaw : decode(dataRaw);
    this.rooms = [];      // room number -> absolute offset of the ROOM block
    this.scripts = [];    // id -> { room, offs }  (offs relative to the ROOM block)
    this.sounds = [];
    this.costumes = [];
    this.charsets = [];
    this.roomNames = {};
    this.objOwner = null; this.objState = null; this.classData = null;
    this.maxs = {};
    this.readIndex();
    this.readLOFF();
  }

  Res.prototype.tag = function (o) { return tagAt(this.d, o); };
  Res.prototype.size = function (o) { return be32(this.d, o + 4); };

  // Iterate the children of the block at `o` (its payload starts at o+8).
  Res.prototype.children = function (o) {
    var d = this.d, end = o + be32(d, o + 4), p = o + 8, out = [];
    while (p + 8 <= end) {
      var s = be32(d, p + 4);
      if (s < 8) break;
      out.push(p);
      p += s;
    }
    return out;
  };

  // First direct child block of `o` with the given tag (like ScummVM's
  // findResource, which does not descend into nested blocks); -1 if absent.
  Res.prototype.find = function (o, tag) {
    var d = this.d, end = o + be32(d, o + 4), p = o + 8;
    while (p + 8 <= end) {
      var s = be32(d, p + 4);
      if (s < 8) break;
      if (tagAt(d, p) === tag) return p;
      p += s;
    }
    return -1;
  };

  // All direct children with the given tag, in order.
  Res.prototype.findAll = function (o, tag) {
    var d = this.d, out = [], ch = this.children(o);
    for (var i = 0; i < ch.length; i++) if (tagAt(d, ch[i]) === tag) out.push(ch[i]);
    return out;
  };

  Res.prototype.readIndex = function () {
    var b = this.idx, p = 0, self = this;
    function dirList(o) {
      var n = le16(b, o + 8), rn = o + 10, oo = o + 10 + n, list = [];
      for (var i = 0; i < n; i++) list.push({ room: b[rn + i], offs: le32(b, oo + i * 4) });
      return list;
    }
    while (p + 8 <= b.length) {
      var t = tagAt(b, p), s = be32(b, p + 4);
      switch (t) {
        case 'RNAM': {
          var q = p + 8;
          while (b[q]) {
            var r = b[q], name = '';
            for (var i = 1; i <= 9; i++) { var c = b[q + i] ^ 0xFF; if (!c) break; name += String.fromCharCode(c); }
            self.roomNames[r] = name; q += 10;
          }
          break;
        }
        case 'MAXS':
          self.maxs = { numVariables: le16(b, p + 8), numBitVariables: le16(b, p + 12), numLocalObjects: le16(b, p + 14),
                        numCharsets: le16(b, p + 18), numInventory: le16(b, p + 24), numArray: 50, numVerbs: 100,
                        numNewNames: 150, numGlobalScripts: 200, numFlObject: 50 };
          break;
        case 'DROO': self.roomDir = dirList(p); break;
        case 'DSCR': self.scripts = dirList(p); break;
        case 'DSOU': self.sounds = dirList(p); break;
        case 'DCOS': self.costumes = dirList(p); break;
        case 'DCHR': self.charsets = dirList(p); break;
        case 'DOBJ': {
          var n = le16(b, p + 8);
          self.numGlobalObjects = n;
          self.objOwner = new Uint8Array(n); self.objState = new Uint8Array(n); self.classData = new Uint32Array(n);
          for (var k = 0; k < n; k++) { var v = b[p + 10 + k]; self.objOwner[k] = v & 0x0F; self.objState[k] = v >> 4; }
          var co = p + 10 + n;
          for (var k2 = 0; k2 < n; k2++) self.classData[k2] = le32(b, co + k2 * 4);
          break;
        }
      }
      p += s;
    }
  };

  Res.prototype.readLOFF = function () {
    var d = this.d;
    if (tagAt(d, 0) !== 'LECF' || tagAt(d, 8) !== 'LOFF') throw new Error('not a SCUMM v5 LECF data file');
    var n = d[16], p = 17;
    for (var i = 0; i < n; i++) { this.rooms[d[p]] = le32(d, p + 1); p += 5; }
  };

  // Absolute offset of a global resource block (SCRP/SOUN/COST/CHAR), or -1.
  Res.prototype.globalRes = function (list, id) {
    var e = list[id];
    if (!e || e.room === 0) return -1;
    var base = this.rooms[e.room];
    if (base === undefined) return -1;
    return base + e.offs;
  };
  Res.prototype.scriptOffset = function (id) { return this.globalRes(this.scripts, id); };
  Res.prototype.soundOffset = function (id) { return this.globalRes(this.sounds, id); };
  Res.prototype.costumeOffset = function (id) { return this.globalRes(this.costumes, id); };
  Res.prototype.charsetOffset = function (id) { return this.globalRes(this.charsets, id); };
  Res.prototype.roomOffset = function (r) { var o = this.rooms[r]; return o === undefined ? -1 : o; };

  Res.prototype.le16 = function (o) { return le16(this.d, o); };
  Res.prototype.le32 = function (o) { return le32(this.d, o); };
  Res.prototype.s16 = function (o) { var v = le16(this.d, o); return v & 0x8000 ? v - 0x10000 : v; };

  return Res;
})();

if (typeof module !== 'undefined') module.exports = SCUMM;
