// HobbitMachine: a minimal ZX Spectrum 48K emulator specialised for
// Melbourne House's The Hobbit (1982). Runs the original game code with
// interrupts disabled (as the game itself does), no ROM apart from the
// character set, and hooks a handful of game routines so a web page can
// feed typed lines in and read printed text out.
//
// Works in Node (for tests) and in the browser. Expects a global Z80
// constructor (Molly Howell's Z80.js, patched with register accessors).
(function (root) {
  'use strict';

  var CLOCK = 3500000; // T-states per second

  // Keyboard matrix rows (port high byte with one bit low selects a row).
  // row index -> keys for bits 0..4
  var ROWS = [
    ['SHIFT', 'Z', 'X', 'C', 'V'],
    ['A', 'S', 'D', 'F', 'G'],
    ['Q', 'W', 'E', 'R', 'T'],
    ['1', '2', '3', '4', '5'],
    ['0', '9', '8', '7', '6'],
    ['P', 'O', 'I', 'U', 'Y'],
    ['ENTER', 'L', 'K', 'J', 'H'],
    ['SPACE', 'SYM', 'M', 'N', 'B']
  ];
  var KEYPOS = {};
  ROWS.forEach(function (row, r) { row.forEach(function (k, b) { KEYPOS[k] = { row: r, mask: 1 << b }; }); });

  // Byte patterns (hex, "??" = wildcard) taken from the v1.2 disassembly.
  // Used to locate the routines we hook in whichever version is loaded.
  var SIGS = {
    getKey:    'e5 dd e5 c5 cd ?? ?? ed 43 ?? ?? 21 ?? ?? dd 21 ?? ?? 01 fe fe ed 78 e6 1f dd b6 00 f5 2f a6 2f 28 07',
    printUpper:'e5 c5 f5 2a ?? ?? 3a ?? ?? 4f 3a ?? ?? a7 20 15 3a ?? ?? a7 28 0f 47 3e 20 cd ?? ?? 3a ?? ?? 3d 32 ?? ?? 10 f2 f1 f5 fe',
    caseFlag:  'e5 21 ?? ?? 34 35 28 0c fe 61 38 08 fe 7b 30 04 cb af 36 00 fe 2e 20 01 34 e1 cd',
    printLower:'e5 f5 2a ?? ?? fe 0d 20 07 3e 20 cd ?? ?? 18 17 fe 08 28 29 fe 61 38 06 fe 7b 30 02 e6 5f cd',
    picWait:   'af db fe e6 1f fe 1f 28 f7 3e 07 d3 fe c9',
    keyWait:   'e5 2a ?? ?? cd ?? ?? a7 20 20 2b 7c b5 20 f5 e1 e5 cd ?? ?? 11 ?? ?? 06 04 1a 77 23 13 cd ?? ?? 10 f7 e3 06 7c 3e 0d 21',
    editor:    '21 b8 0b 22 ?? ?? 3e 01 32 ?? ?? 32 ?? ?? 3e 3e cd ?? ?? 3e 20 cd ?? ?? 21 ?? ?? 06 80 0e 00 cd ?? ?? cb 78 28 05 fe 40',
    save:      'dd e5 d5 11 ?? ?? 21 ?? ?? cd ?? ?? 3e 01 32 ?? ?? 21 ?? ?? cd ?? ?? cd',
    load:      'dd e5 d5 3e ff 37 dd 21 ?? ?? 11 ?? ?? cd ?? ?? 3e ff 37 dd 21 ?? ?? 11 ?? ?? cd ?? ?? 3e ff 37 dd 21 ?? ?? 11 ?? ?? cd ?? ?? 3e ff 37 dd 21 ?? ?? 11 ?? ?? cd ?? ?? f3 21 ?? ?? 11 ?? ?? cd ?? ?? d1 dd e1 c3 ?? ??',
    startWait: 'af db fe e6 1f fe 1f 28 f7 3e 7f db fe e6 08 32 ?? ??',
    startWait10: 'af db fe e6 1f fe 1f 28 f7 21 e0 50 22 ?? ??', // v1.0: no "N for no pictures" check
    wrap:      '21 ?? ?? b8 30 05 7e cd ?? ?? 77 d1 7a e6 f0 fe 70 3e 01',
    locObj:    'dd 21 ?? ?? cd ?? ?? e5 dd 6e 01 dd 66 02 e3 dd e1 c9',
    locLoc:    'fe 50 38 02 af c9 d5 11 ?? ?? e5 6f',
    dirTable:  '21 ?? ?? 5f cb bb 16 00 19 19 5e 23 56 c9',
    dictBase:  '4a 7a e6 0f 57 21 ?? ?? 19 11 ?? ?? e5 06 00 7e',
    deadWait:  'af db fe e6 1f fe 1f 28 f7 c3 ?? ??',
    drawStart: 'cd ?? ?? 08 fd 7e 00 fd 23 08 30 03 08 af 08 08 d3 fe'
  };

  function parseSig(s) {
    return s.split(/\s+/).map(function (t) { return t === '??' ? -1 : parseInt(t, 16); });
  }
  function findSig(mem, sig, from, to) {
    var pat = parseSig(sig), n = pat.length, hits = [];
    outer: for (var a = from; a <= to - n; a++) {
      for (var i = 0; i < n; i++) {
        var p = pat[i];
        if (p >= 0 && mem[a + i] !== p) continue outer;
      }
      hits.push(a);
    }
    return hits;
  }

  function HobbitMachine() {
    var self = this;
    this.mem = new Uint8Array(65536);
    this.keyState = new Uint8Array(8);   // bits set = key pressed (per row)
    this.border = 7;
    this.tstates = 0;
    this.version = null;                 // 'v1.0', 'v1.2', or 'unknown'
    this.addr = null;                    // resolved hook addresses
    this.hooks = null;                   // Uint8Array(65536) of hook ids
    this.inputQueue = [];                // character codes to feed to GetKey
    this.parked = false;                 // stopped at GetKey waiting for input
    this.idle = false;                   // game is waiting for a line
    this.pauseTimer = true;              // true: park at GetKey; false: authentic 30 s timer
    this.graphics = true;                // hold N at start to disable pictures
    this.keyDownUntil = 0;               // t-state until which the virtual "any key" is held
    this.anyKey = 'SHIFT';
    this.typeQueue = [];                 // matrix-typing fallback queue
    this.typeTimer = 0;
    this.typeCur = null;
    this.started = false;
    this.loadingScreen = false;
    this.entry = 0x6C00;
    this.stackTop = 0x5EFF;
    this.saveSlot = null;                // in-game SAVE data
    // callbacks
    this.onText = null;                  // function(str) upper-window text (\n for newline, \b for backspace)
    this.onLower = null;                 // function(str) lower-window messages
    this.onPicture = null;               // function() picture finished drawing
    this.onEvent = null;                 // function(name, data)
    this.onSave = null;                  // function(blob) -> void
    this.onLoad = null;                  // function() -> blob|null
    this.textBuf = '';

    this.cpu = new Z80({
      mem_read: function (a) { return self.mem[a]; },
      mem_write: function (a, v) { if (a >= 0x4000) self.mem[a] = v; },
      io_read: function (port) { return self.ioRead(port); },
      io_write: function (port, v) { if ((port & 1) === 0) self.border = v & 7; }
    });
  }

  HobbitMachine.prototype.ioRead = function (port) {
    if ((port & 1) !== 0) return 0xff;
    var res = 0x1f, hi = port >> 8;
    if (this.tstates < this.keyDownUntil) {
      var kp = KEYPOS[this.anyKey];
      if (((hi >> kp.row) & 1) === 0) res &= ~kp.mask;
    }
    for (var r = 0; r < 8; r++) {
      if (((hi >> r) & 1) === 0) res &= ~this.keyState[r];
    }
    return 0xe0 | (res & 0x1f);
  };

  // ---------------------------------------------------------------- loading

  // Returns {name, addr, data} for each CODE block found in a TAP image,
  // plus {basic: bytes} for the BASIC program (used to find the USR address).
  HobbitMachine.parseTAP = function (bytes) {
    var blocks = [], i = 0, pendingHeader = null, basic = null;
    while (i + 2 <= bytes.length) {
      var len = bytes[i] | (bytes[i + 1] << 8); i += 2;
      if (len < 2 || i + len > bytes.length) break;
      var flag = bytes[i], data = bytes.subarray(i + 1, i + len - 1); i += len;
      if (flag === 0 && data.length === 17) {
        pendingHeader = { type: data[0], name: String.fromCharCode.apply(null, data.subarray(1, 11)).trim(),
          length: data[11] | (data[12] << 8), p1: data[13] | (data[14] << 8), p2: data[15] | (data[16] << 8) };
      } else if (flag === 0xff) {
        if (pendingHeader) {
          if (pendingHeader.type === 3) blocks.push({ name: pendingHeader.name, addr: pendingHeader.p1, data: data });
          else if (pendingHeader.type === 0 && !basic) basic = data;
          pendingHeader = null;
        } else if (data.length === 6912) {
          blocks.push({ name: 'screen', addr: 0x4000, data: data });
        } else if (data.length >= 30000 && data.length <= 41000) {
          blocks.push({ name: 'headerless', addr: 0x6000, data: data });
        }
      }
    }
    return { blocks: blocks, basic: basic };
  };

  // Extracts the standard/turbo data blocks from a TZX and hands them to the
  // TAP parser (each TZX data block is a TAP block minus the length prefix).
  HobbitMachine.parseTZX = function (bytes) {
    var out = [], i = 10;
    function u16(p) { return bytes[p] | (bytes[p + 1] << 8); }
    function u24(p) { return bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16); }
    function u32(p) { return u24(p) + bytes[p + 3] * 16777216; }
    function push(data) { out.push(data.length & 0xff, (data.length >> 8) & 0xff); for (var k = 0; k < data.length; k++) out.push(data[k]); }
    while (i < bytes.length) {
      var id = bytes[i++], len;
      switch (id) {
        case 0x10: len = u16(i + 2); push(bytes.subarray(i + 4, i + 4 + len)); i += 4 + len; break;
        case 0x11: len = u24(i + 15); push(bytes.subarray(i + 18, i + 18 + len)); i += 18 + len; break;
        case 0x12: i += 4; break;
        case 0x13: i += 1 + bytes[i] * 2; break;
        case 0x14: len = u24(i + 7); i += 10 + len; break;
        case 0x15: len = u24(i + 5); i += 8 + len; break;
        case 0x18: case 0x19: i += 4 + u32(i); break;
        case 0x20: i += 2; break;
        case 0x21: i += 1 + bytes[i]; break;
        case 0x22: break;
        case 0x23: i += 2; break;
        case 0x24: i += 2; break;
        case 0x25: break;
        case 0x26: i += 2 + u16(i) * 2; break;
        case 0x27: break;
        case 0x28: i += 2 + u16(i); break;
        case 0x2a: i += 4; break;
        case 0x2b: i += 5; break;
        case 0x30: i += 1 + bytes[i]; break;
        case 0x31: i += 2 + bytes[i + 1]; break;
        case 0x32: i += 2 + u16(i); break;
        case 0x33: i += 1 + bytes[i] * 3; break;
        case 0x35: i += 0x10 + 4 + u32(i + 0x10); break;
        case 0x5a: i += 9; break;
        default: i = bytes.length; break; // unknown block: stop
      }
    }
    return HobbitMachine.parseTAP(new Uint8Array(out));
  };

  // Finds "USR nnnnn" in a BASIC program block (token 0xC0 followed by digits).
  HobbitMachine.findUSR = function (basic) {
    if (!basic) return null;
    var last = null;
    for (var i = 0; i < basic.length - 1; i++) {
      if (basic[i] === 0xc0) {
        var j = i + 1, s = '';
        while (j < basic.length && basic[j] >= 0x30 && basic[j] <= 0x39) s += String.fromCharCode(basic[j++]);
        if (s.length) last = parseInt(s, 10);
      }
    }
    return last;
  };

  // Loads a tape image (TAP or TZX bytes). Returns an info object or throws.
  HobbitMachine.prototype.loadTape = function (bytes) {
    var isTZX = bytes.length > 10 && String.fromCharCode.apply(null, bytes.subarray(0, 7)) === 'ZXTape!';
    var parsed = isTZX ? HobbitMachine.parseTZX(bytes) : HobbitMachine.parseTAP(bytes);
    var game = null, screen = null;
    parsed.blocks.forEach(function (b) {
      if (b.data.length === 6912) screen = b; // loading screen (the BASIC loader puts it at 16384 whatever the header says)
      else if (b.data.length >= 30000 && (!game || b.data.length > game.data.length)) game = b;
    });
    if (!game) throw new Error('No game code block found in this tape image.');
    this.mem.fill(0);
    if (screen) { this.mem.set(screen.data, 0x4000); this.loadingScreen = true; }
    this.mem.set(game.data, game.addr);
    var usr = HobbitMachine.findUSR(parsed.basic);
    this.entry = usr || 0x6C00;
    return this.prepare({ codeLength: game.data.length, codeAddr: game.addr, usr: usr });
  };

  // Loads a raw game binary (as extracted by Wilderland's TapCon) at 0x6000.
  HobbitMachine.prototype.loadBinary = function (bytes, addr) {
    this.mem.fill(0);
    this.mem.set(bytes, addr || 0x6000);
    this.entry = 0x6C00;
    return this.prepare({ codeLength: bytes.length, codeAddr: addr || 0x6000 });
  };

  // Loads a 48K .sna snapshot (27-byte header + 48K RAM).
  HobbitMachine.prototype.loadSNA = function (b) {
    if (b.length < 49179) throw new Error('Not a 48K .sna snapshot.');
    this.mem.fill(0);
    this.mem.set(b.subarray(27, 27 + 49152), 0x4000);
    var sp = b[23] | (b[24] << 8);
    var pc = this.mem[sp] | (this.mem[sp + 1] << 8);
    sp = (sp + 2) & 0xffff;
    var regs = { i: b[0], l_: b[1], h_: b[2], e_: b[3], d_: b[4], c_: b[5], b_: b[6], f_: b[7], a_: b[8],
      l: b[9], h: b[10], e: b[11], d: b[12], c: b[13], b: b[14], iy: b[15] | (b[16] << 8), ix: b[17] | (b[18] << 8),
      iff2: (b[19] >> 2) & 1, r: b[20], f: b[21], a: b[22], sp: sp, im: b[25] & 3, border: b[26] & 7, pc: pc };
    return this.prepareSnapshot(regs);
  };

  // Loads a .z80 snapshot (versions 1, 2 and 3; 48K only).
  HobbitMachine.prototype.loadZ80 = function (b) {
    var mem = this.mem; mem.fill(0);
    var regs = { a: b[0], f: b[1], c: b[2], b: b[3], l: b[4], h: b[5], pc: b[6] | (b[7] << 8), sp: b[8] | (b[9] << 8),
      i: b[10], r: (b[11] & 0x7f) | ((b[12] & 1) << 7), border: (b[12] >> 1) & 7, e: b[13], d: b[14],
      c_: b[15], b_: b[16], e_: b[17], d_: b[18], l_: b[19], h_: b[20], a_: b[21], f_: b[22],
      iy: b[23] | (b[24] << 8), ix: b[25] | (b[26] << 8), iff2: b[28] ? 1 : 0, im: b[29] & 3 };
    var flags12 = b[12] === 255 ? 1 : b[12];
    function decompress(src, dst, dstOff, dstLen) {
      var i = 0, o = dstOff, end = dstOff + dstLen;
      while (i < src.length && o < end) {
        if (src[i] === 0xed && src[i + 1] === 0xed) {
          var n = src[i + 2], v = src[i + 3];
          for (var k = 0; k < n && o < end; k++) dst[o++] = v;
          i += 4;
        } else dst[o++] = src[i++];
      }
    }
    if (regs.pc !== 0) { // version 1
      var body = b.subarray(30);
      if (flags12 & 0x20) decompress(body, mem, 0x4000, 49152); else mem.set(body.subarray(0, 49152), 0x4000);
    } else {
      var extra = b[30] | (b[31] << 8);
      regs.pc = b[32] | (b[33] << 8);
      var hw = b[34], i = 32 + extra;
      if ((extra === 23 && hw > 1) || (extra >= 54 && hw > 2)) {
        if (!(hw === 3 && extra === 23) && !(hw === 4 && extra >= 54)) throw new Error('Only 48K .z80 snapshots are supported.');
      }
      while (i + 3 <= b.length) {
        var len = b[i] | (b[i + 1] << 8), page = b[i + 2], data = b.subarray(i + 3, len === 0xffff ? i + 3 + 16384 : i + 3 + len);
        var dest = page === 4 ? 0x8000 : page === 5 ? 0xc000 : page === 8 ? 0x4000 : -1;
        if (dest >= 0) { if (len === 0xffff) mem.set(data, dest); else decompress(data, mem, dest, 16384); }
        i += 3 + data.length;
      }
    }
    return this.prepareSnapshot(regs);
  };

  HobbitMachine.prototype.prepareSnapshot = function (regs) {
    this.entry = regs.pc;
    var info = this.prepare({ codeLength: 40000, snapshot: true });
    var st = this.cpu.getState();
    st.a = regs.a; st.b = regs.b; st.c = regs.c; st.d = regs.d; st.e = regs.e; st.h = regs.h; st.l = regs.l;
    st.a_prime = regs.a_; st.b_prime = regs.b_; st.c_prime = regs.c_; st.d_prime = regs.d_; st.e_prime = regs.e_; st.h_prime = regs.h_; st.l_prime = regs.l_;
    st.ix = regs.ix; st.iy = regs.iy; st.i = regs.i; st.r = regs.r; st.sp = regs.sp; st.pc = regs.pc;
    st.imode = regs.im; st.iff1 = regs.iff2; st.iff2 = regs.iff2; st.halted = false;
    this.cpu.setState(st);
    this.cpu.setF(regs.f);
    this.cpu.setFPrime(regs.f_);
    this.border = regs.border;
    this.started = true;
    info.snapshot = true;
    return info;
  };

  HobbitMachine.prototype.setCharset = function (bytes) {
    // 768 bytes: the Spectrum ROM character set (chars 32..127), lives at 0x3D00.
    this.mem.set(bytes.subarray(0, 768), 0x3D00);
  };

  // Resolves hook addresses by signature and resets the machine to the entry point.
  HobbitMachine.prototype.prepare = function (info) {
    var mem = this.mem, A = {}, warn = [];
    function one(name, from, to) {
      var h = findSig(mem, SIGS[name], from || 0x6000, to || 0xffff);
      if (h.length !== 1) { warn.push(name + (h.length ? ' ambiguous' : ' not found')); return null; }
      return h[0];
    }
    function w16(a) { return mem[a] | (mem[a + 1] << 8); }
    A.getKey = one('getKey');
    A.printUpper = one('printUpper');
    if (A.printUpper !== null) {
      A.lineStart = w16(A.printUpper + 11); // 0x86A0: nonzero once something is on the line
      A.indent = w16(A.printUpper + 17);    // 0x869F: indent spaces for object lists
      A.width = w16(A.printUpper + 29);     // 0x869B: columns left on the current line
    }
    var wr = one('wrap');
    if (wr !== null) A.wrapRet = wr + 10;   // 0x755B: return address of the word-wrap newline
    var cf = one('caseFlag');
    if (cf !== null) A.caseFlag = w16(cf + 2); // 0xB704: capitalise next letter
    A.printLower = one('printLower');
    if (A.printLower !== null) A.lowerWidth = w16(A.printLower + 3) - 1; // 0x85B3
    A.picWait = one('picWait');
    var kw = one('keyWait');
    if (kw !== null) {
      A.keyWait = kw;
      A.timeout = w16(kw + 2);              // 0xB714
      A.autoWait = kw + 15;                 // 0x7258: timer expired, "WAIT" auto-typed
    }
    var ed = one('editor');
    if (ed !== null) {
      A.editor = ed; A.editorEnd = ed + 0xC1;
      A.window = w16(ed + 9);               // 0xB701: 0 = upper window, 1 = lower
      A.printChar = w16(ed + 17);           // 0x858B
      A.inputBuffer = w16(ed + 25);         // 0x6FF9
    }
    var sv = one('save');
    if (sv !== null) {
      A.save = sv;
      A.flagsSrc = w16(sv + 4);             // 0xB6EB
      A.flagsCopy = w16(sv + 7);            // 0xC9E2
    }
    var ld = one('load');
    if (ld !== null) {
      A.load = ld;
      A.blocks = [];
      for (var i = 0; i < 4; i++) {
        var p = ld + 3 + i * 13;
        A.blocks.push({ addr: w16(p + 5), len: w16(p + 8) });
      }
      A.resume = w16(ld + 3 + 4 * 13 + 14);   // 0x82B3
    }
    A.drawStart = one('drawStart');
    A.startWait = one('startWait');
    if (A.startWait === null) { warn.pop(); A.startWait = one('startWait10'); A.noPicturesOption = false; } else A.noPicturesOption = true;
    // tables used to describe the current turn (exits, things present)
    var lo = one('locObj'); if (lo !== null) A.objIndex = w16(lo + 2);     // 0xC063
    var ll = one('locLoc'); if (ll !== null) A.locIndex = w16(ll + 8);     // 0xB9E0
    var dt = one('dirTable'); if (dt !== null) A.dirTable = w16(dt + 1);   // 0xA20E
    var db = one('dictBase'); if (db !== null) A.dictBase = w16(db + 6);   // 0x6000
    // "any key then restart" appears twice (after death, after a tape error)
    var dws = findSig(mem, SIGS.deadWait, 0x6000, 0xffff);
    A.deadWaits = dws;
    if (dws.length) A.restart = w16(dws[0] + 10); else warn.push('deadWait not found');
    this.addr = A;
    this.warnings = warn;
    this.hooksOK = A.getKey !== null && A.printUpper !== null && A.editor !== null;

    var len = info && info.codeLength;
    this.version = len === 37888 ? 'v1.0' : len === 40000 ? (A.getKey === 0x8B93 ? 'v1.2' : 'v1.x') : 'unknown';

    var hooks = this.hooks = new Uint8Array(65536);
    if (A.getKey !== null) hooks[A.getKey] = 1;
    if (A.printUpper !== null) hooks[A.printUpper] = 2;
    if (A.printLower !== null) hooks[A.printLower] = 3;
    if (A.picWait !== null) hooks[A.picWait] = 4;
    if (A.autoWait !== undefined) hooks[A.autoWait] = 5;
    if (A.save !== null && A.blocks) hooks[A.save] = 6;
    if (A.load !== null) hooks[A.load] = 7;
    if (A.restart !== undefined) hooks[A.restart] = 8;
    A.deadWaits.forEach(function (a) { hooks[a] = 9; });
    if (A.startWait !== null) hooks[A.startWait] = 10;
    if (A.drawStart !== null) hooks[A.drawStart] = 11;
    this.reset();
    if (info && info.snapshot) this.version = A.getKey === 0x8B93 ? 'v1.2' : 'v1.x';
    return { version: this.version, hooksOK: this.hooksOK, warnings: warn, addr: A, entry: this.entry };
  };

  HobbitMachine.prototype.reset = function () {
    this.cpu.reset();
    this.cpu.setSP(this.stackTop);
    this.cpu.setPC(this.entry);
    this.cpu.setR(Math.floor(Math.random() * 128));
    this.tstates = 0;
    this.inputQueue.length = 0;
    this.typeQueue.length = 0;
    this.typeCur = null;
    this.keyState.fill(0);
    this.parked = false;
    this.idle = false;
    this.started = false;
    this.inputSeen = false;
    this.deadNotified = false;
    this.resumeDead = false;
    this.drawing = false;
    this.keyDownUntil = 0;
    this.textBuf = '';
    this.border = 7;
  };

  // ---------------------------------------------------------------- running

  // Queue a line of input. Characters are fed one per GetKey call.
  HobbitMachine.prototype.type = function (line) {
    var s = line.toUpperCase().replace(/[“”″]/g, '"').replace(/[‘’]/g, '');
    if (s.trim() === '@') { this.inputQueue.push(0x40); this.wake(); return; } // repeat last command
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if ((c >= 0x41 && c <= 0x5a) || c === 0x20 || c === 0x22 || c === 0x2e || c === 0x2c) {
        this.inputQueue.push(c);
      }
    }
    this.inputQueue.push(0x0d);
    this.wake();
  };

  // Starts a new game from the game's own restart entry point.
  HobbitMachine.prototype.restart = function () {
    this.reset();
    if (this.addr && this.addr.restart !== undefined) {
      this.cpu.setPC(this.addr.restart);
      this.started = true;
      this.pressAnyKey(this.graphics ? 'SHIFT' : 'N');
    }
  };

  // Press "any key" briefly (used for the start screen, after pictures, after death).
  HobbitMachine.prototype.pressAnyKey = function (key) {
    this.anyKey = key || 'SHIFT';
    this.keyDownUntil = this.tstates + 40000;
  };

  HobbitMachine.prototype.wake = function () {
    this.parked = false;
    this.idle = false;
    if (!this.hooksOK) this.enqueueMatrixTyping();
  };

  // Fallback for unknown versions: type through the keyboard matrix.
  HobbitMachine.prototype.enqueueMatrixTyping = function () {
    while (this.inputQueue.length) {
      var c = this.inputQueue.shift(), keys = null;
      if (c >= 0x41 && c <= 0x5a) keys = [String.fromCharCode(c)];
      else if (c === 0x20) keys = ['SPACE'];
      else if (c === 0x0d) keys = ['ENTER'];
      else if (c === 0x2e) keys = ['SYM', 'M'];
      else if (c === 0x2c) keys = ['SYM', 'N'];
      else if (c === 0x22) keys = ['SYM', 'P'];
      else if (c === 0x40) keys = ['SYM', '2'];
      if (keys) this.typeQueue.push(keys);
    }
  };

  HobbitMachine.prototype.serviceTyping = function () {
    // hold each key for 120k T-states, release for 120k (GetKey scans every ~30k)
    if (this.typeCur) {
      if (this.tstates >= this.typeTimer) { this.keyState.fill(0); this.typeCur = null; this.typeTimer = this.tstates + 120000; }
      return;
    }
    if (this.tstates < this.typeTimer || !this.typeQueue.length) return;
    var keys = this.typeQueue.shift();
    for (var i = 0; i < keys.length; i++) { var kp = KEYPOS[keys[i]]; this.keyState[kp.row] |= kp.mask; }
    this.typeCur = keys;
    this.typeTimer = this.tstates + 120000;
  };

  HobbitMachine.prototype.emit = function (s) { this.textBuf += s; };
  HobbitMachine.prototype.emitSpace = function () {
    var last = this.textBuf.length ? this.textBuf[this.textBuf.length - 1] : this.lastFlushed;
    if (last !== ' ' && last !== '\n') this.textBuf += ' ';
  };

  HobbitMachine.prototype.flush = function () {
    if (this.textBuf && this.onText) { var t = this.textBuf; this.textBuf = ''; this.lastFlushed = t[t.length - 1]; this.onText(t); }
  };

  HobbitMachine.prototype.w16 = function (a) { return this.mem[a] | (this.mem[(a + 1) & 0xffff] << 8); };

  HobbitMachine.prototype.ret = function () {
    var sp = this.cpu.getSP(), pc = this.mem[sp] | (this.mem[sp + 1] << 8);
    this.cpu.setSP(sp + 2);
    this.cpu.setPC(pc);
  };

  // Returns true if the hook changed PC (so the run loop must re-dispatch),
  // false to execute the instruction at PC normally.
  HobbitMachine.prototype.handleHook = function (id, pc) {
    var A = this.addr, mem = this.mem, cpu = this.cpu;
    switch (id) {
      case 1: // GetKey
        this.inputSeen = true;
        if (this.inputQueue.length) {
          cpu.setA(this.inputQueue.shift());
          this.ret();
          return true;
        }
        this.idle = true;
        if (this.pauseTimer) { this.parked = true; return true; }
        return false;
      case 2: { // upper window print, A = character
        var ch = cpu.getA(), sp = cpu.getSP();
        if (mem[A.lineStart] === 0 && mem[A.indent] > 0) {
          // indent for nested object lists; not repeated after a cosmetic wrap
          if (!this.wrapped) for (var n = mem[A.indent]; n > 0; n--) this.emit(' ');
        }
        this.wrapped = false;
        if (ch === 0x0d) {
          // a newline issued by the word printer because the next word does
          // not fit on the 42-column line is cosmetic: join with a space
          var wrap = A.wrapRet !== undefined && this.w16(sp + 2) === A.printChar - 2 && this.w16(sp + 6) === A.wrapRet;
          if (wrap) { this.emitSpace(); this.wrapped = true; } else this.emit('\n');
        } else if (ch === 0x08) this.emit('\b');
        else if (ch >= 0x20 && ch < 0x80) {
          if (ch >= 0x41 && ch <= 0x5a) ch |= 0x20;
          if (A.caseFlag !== undefined && mem[A.caseFlag] !== 0 && ch >= 0x61 && ch <= 0x7a) ch &= 0xdf;
          this.emit(String.fromCharCode(ch));
          // the line is now full: the printer wraps silently, so add the space it drops
          if (A.width !== undefined && mem[A.width] === 1) { this.emitSpace(); this.wrapped = true; }
        }
        return false;
      }
      case 3: { // lower window print
        var sp3 = cpu.getSP(), caller = this.w16(sp3);
        var echo = !this.inputSeen || (caller >= A.editor && caller < A.editorEnd) || (A.keyWait !== undefined && caller >= A.keyWait && caller < A.keyWait + 0x48);
        if (!echo && this.onLower) {
          var c2 = cpu.getA();
          if (c2 === 0x0d) {
            var wrap2 = A.wrapRet !== undefined && caller === A.printChar - 2 && this.w16(sp3 + 4) === A.wrapRet;
            this.onLower(wrap2 ? ' ' : '\n');
          } else if (c2 >= 0x20 && c2 < 0x80) {
            // the Spectrum shows this window in capitals; give it the upper window's
            // sentence case instead, using the game's own capitalise-next flag
            if (c2 >= 0x41 && c2 <= 0x5a) c2 |= 0x20;
            if (A.caseFlag !== undefined && c2 >= 0x61 && c2 <= 0x7a) {
              if (mem[A.caseFlag] !== 0) { c2 &= 0xdf; mem[A.caseFlag] = 0; }
            }
            if (c2 === 0x2e && A.caseFlag !== undefined) mem[A.caseFlag]++;
            this.onLower(String.fromCharCode(c2));
            if (A.lowerWidth !== undefined && mem[A.lowerWidth] === 1) this.onLower(' ');
          }
        }
        return false;
      }
      case 4: // waiting for a key after drawing a picture
        this.drawing = false;
        this.flush();
        if (this.onPicture) this.onPicture();
        this.pressAnyKey('SHIFT');
        return false;
      case 5: // idle timer expired: game types WAIT for us
        if (this.onEvent) this.onEvent('autowait');
        return false;
      case 6: { // SAVE
        var blob = { version: this.version, blocks: [] };
        // the game first copies 3 bytes of flags to a safe place
        for (var i = 0; i < 3; i++) mem[A.flagsCopy + i] = mem[A.flagsSrc + i];
        A.blocks.forEach(function (b) { blob.blocks.push(Array.from(mem.subarray(b.addr, b.addr + b.len))); });
        if (this.onSave) this.onSave(blob);
        cpu.setPC(A.resume);
        return true;
      }
      case 7: { // LOAD
        var data = this.onLoad ? this.onLoad() : null;
        if (data && data.blocks && data.blocks.length === A.blocks.length) {
          A.blocks.forEach(function (b, k) { mem.set(Uint8Array.from(data.blocks[k]).subarray(0, b.len), b.addr); });
          for (var j = 0; j < 3; j++) mem[A.flagsSrc + j] = mem[A.flagsCopy + j];
          if (this.onEvent) this.onEvent('loaded');
        } else if (this.onEvent) this.onEvent('noload');
        cpu.setPC(A.resume);
        return true;
      }
      case 8: // game (re)start
        this.flush();
        this.deadNotified = false;
        this.inputSeen = false; // the boot-up "> LOOK" prompt is not a message
        if (this.onEvent) this.onEvent('restart');
        return false;
      case 9: // dead: waiting for a key before restarting (hook sits on the loop, so it fires per iteration)
        if (this.resumeDead) { this.resumeDead = false; return false; }
        this.flush();
        if (!this.deadNotified) { this.deadNotified = true; if (this.onEvent) this.onEvent('dead'); }
        this.idle = true;
        if (this.pauseTimer) { this.parked = true; return true; }
        return false;
      case 11: // the screen is being cleared for a location picture
        this.drawing = true;
        return false;
      case 10: // title screen: waiting for a key
        this.started = true;
        if (this.tstates >= this.keyDownUntil) this.pressAnyKey(this.graphics ? 'SHIFT' : 'N');
        return false;
    }
    return false;
  };

  // Runs until `tstates` reaches endT, the machine parks, or the wall-clock
  // deadline passes. Returns the number of T-states executed.
  HobbitMachine.prototype.run = function (maxT, deadlineMs) {
    var cpu = this.cpu, hooks = this.hooks, endT = this.tstates + maxT, start = this.tstates;
    var checkEvery = 2000, n = 0;
    while (this.tstates < endT) {
      if (this.parked) break;
      var pc = cpu.getPC();
      var id = hooks[pc];
      if (id !== 0) {
        if (this.handleHook(id, pc)) { if (this.parked) break; continue; }
      }
      this.tstates += cpu.run_instruction();
      if (this.typeCur || this.typeQueue.length) this.serviceTyping();
      if (deadlineMs && ++n >= checkEvery) { n = 0; if (Date.now() >= deadlineMs) break; }
    }
    this.flush();
    return this.tstates - start;
  };

  // Unpark after a death (any key restarts the game).
  HobbitMachine.prototype.continueAfterDeath = function () {
    this.parked = false; this.idle = false;
    this.inputQueue.length = 0;
    this.resumeDead = true;
    this.pressAnyKey('SHIFT');
  };

  // ---------------------------------------------------------------- game state

  // Decodes a dictionary word (5-bit letters, bit 7 ends the word, with the
  // game's own quirk for two- and three-letter entries).
  HobbitMachine.prototype.dictWord = function (off) {
    var mem = this.mem, a = this.addr.dictBase + (off & 0x0fff), out = '', n = 0;
    for (var guard = 0; guard < 24; guard++) {
      var c = mem[a] & 0x1f;
      if (c === 0) break;
      n++; out += String.fromCharCode(0x60 + c);
      var last = mem[a] & 0x80; a++;
      if (!last) continue;
      if (n === 2) continue;
      if (n !== 3) break;
      if (mem[a - 2] & 0x80) continue;
      break;
    }
    return out;
  };

  HobbitMachine.prototype.objectParts = function (rec) {
    var w, o = { adj1: '', adj2: '', noun: '' };
    w = this.w16(rec + 0x0a); if (w & 0x0fff) o.adj1 = this.dictWord(w);
    w = this.w16(rec + 0x0c); if (w & 0x0fff) o.adj2 = this.dictWord(w);
    w = this.w16(rec + 0x08); if (w & 0x0fff) o.noun = this.dictWord(w);
    return o;
  };
  HobbitMachine.prototype.objectName = function (rec) {
    var o = this.objectParts(rec);
    return [o.adj1, o.adj2, o.noun].filter(Boolean).join(' ');
  };

  // Describes the current turn: where Bilbo is, the exits, and the things present.
  HobbitMachine.prototype.state = function () {
    var A = this.addr, mem = this.mem;
    if (!A || A.objIndex === undefined || A.locIndex === undefined || A.dirTable === undefined || A.dictBase === undefined) return null;
    var objects = [], youRec = null;
    for (var p = A.objIndex; mem[p] !== 0xff && p < A.objIndex + 3 * 128; p += 3) {
      var id = mem[p], rec = this.w16(p + 1);
      if (id === 0) { youRec = rec; continue; }
      objects.push({ id: id, rec: rec });
    }
    if (youRec === null) return null;
    var loc = mem[youRec + 0x10];
    var locRec = this.w16(A.locIndex + loc * 2), exits = [], seen = {};
    for (var q = locRec + 10, k = 0; mem[q] !== 0xff && k < 12; q += 3, k++) {
      var dir = mem[q], door = mem[q + 1], dest = mem[q + 2];
      if (dir === 0) continue;
      var code = dir & 0x7f, word = this.dictWord(this.w16(A.dirTable + code * 2));
      if (!word || seen[word]) continue;
      var doorName = null;
      if (door) {
        var dr = this.objectRecord(door);
        if (!dr || !(mem[dr + 7] & 0x80)) continue; // an unseen door is not an exit yet
        doorName = this.objectName(dr);
      }
      seen[word] = true;
      exits.push({ code: code, word: word, door: doorName, dest: dest });
    }
    var here = [], carried = [], things = [], byId = {};
    var self = this;
    objects.forEach(function (o) {
      var r = o.rec, attr = mem[r + 7], qty = mem[r], mo = mem[r + 1];
      var parts = self.objectParts(r);
      var thing = { id: o.id, name: [parts.adj1, parts.adj2, parts.noun].filter(Boolean).join(' '), noun: parts.noun, adj1: parts.adj1,
        animal: !!(attr & 0x40), open: !!(attr & 0x20), dead: !!(attr & 0x08), locked: !!(attr & 0x01),
        light: !!(attr & 0x10), full: !!(attr & 0x04), fluid: !!(attr & 0x02),
        fixed: mem[r + 3] === 0xff, visible: !!(attr & 0x80), mo: mo,
        inRoom: mem[r + 0x10] === loc || (qty >= 2 && mem[r + 0x11] === loc), actions: [] };
      if (!thing.name) return;
      // after the location byte(s) comes the list of actions this object responds to: (action, handler) triples
      for (var q = r + 0x10 + qty, n = 0; mem[q] !== 0xff && n < 24; q += 3, n++) {
        if (mem[q] && thing.actions.indexOf(mem[q]) < 0) thing.actions.push(mem[q]);
      }
      things.push(thing); byId[o.id] = thing;
    });
    // loose things in the room, then whatever an open container reveals
    // (behind the curtain a wall, in the wall a cupboard, in the cupboard food)
    function addContents(container, depth) {
      if (depth > 4 || container.animal || !container.open) return;
      things.forEach(function (t) {
        if (t.mo === container.id && t.visible && t.inRoom) { here.push(t); addContents(t, depth + 1); }
      });
    }
    things.forEach(function (t) {
      if (t.mo === 0) carried.push(t);
      else if (t.mo === 0xff && t.inRoom && t.visible) { here.push(t); addContents(t, 0); }
    });
    carried.slice().forEach(function (t) { // things inside open containers you carry
      var extra = [];
      (function walk(c, depth) { if (depth > 4 || !c.open) return; things.forEach(function (x) { if (x.mo === c.id && x.visible) { extra.push(x); walk(x, depth + 1); } }); })(t, 0);
      extra.forEach(function (x) { if (carried.indexOf(x) < 0) carried.push(x); });
    });
    // the parser takes a bare noun, or the first adjective plus the noun; two
    // adjectives can fail ("short strong sword"), so commands use the shortest
    // form that is unambiguous among the things in view
    var all = here.concat(carried), count = {};
    all.forEach(function (t) { count[t.noun] = (count[t.noun] || 0) + 1; });
    all.forEach(function (t) { t.ref = (count[t.noun] > 1 && t.adj1) ? t.adj1 + ' ' + t.noun : (t.noun || t.name); });
    return { location: loc, exits: exits, here: here, carried: carried };
  };

  HobbitMachine.prototype.objectRecord = function (id) {
    var A = this.addr, mem = this.mem;
    for (var p = A.objIndex; mem[p] !== 0xff && p < A.objIndex + 3 * 128; p += 3) if (mem[p] === id) return this.w16(p + 1);
    return null;
  };

  // ---------------------------------------------------------------- screen

  var PALETTE = [
    [0, 0, 0], [0, 0, 0xd7], [0xd7, 0, 0], [0xd7, 0, 0xd7], [0, 0xd7, 0], [0, 0xd7, 0xd7], [0xd7, 0xd7, 0], [0xd7, 0xd7, 0xd7],
    [0, 0, 0], [0, 0, 0xff], [0xff, 0, 0], [0xff, 0, 0xff], [0, 0xff, 0], [0, 0xff, 0xff], [0xff, 0xff, 0], [0xff, 0xff, 0xff]
  ];
  HobbitMachine.PALETTE = PALETTE;

  // Renders screen rows [y0, y1) into a Uint8ClampedArray RGBA buffer (256 wide).
  HobbitMachine.prototype.render = function (rgba, y0, y1, flashOn) {
    var mem = this.mem;
    for (var y = y0; y < y1; y++) {
      var line = 0x4000 | ((y & 0xc0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2);
      var attrLine = 0x5800 + (y >> 3) * 32;
      for (var cx = 0; cx < 32; cx++) {
        var bits = mem[line + cx], attr = mem[attrLine + cx];
        var ink = (attr & 7) | ((attr & 0x40) >> 3), paper = ((attr >> 3) & 7) | ((attr & 0x40) >> 3);
        if (flashOn && (attr & 0x80)) { var t = ink; ink = paper; paper = t; }
        var pi = PALETTE[ink], pp = PALETTE[paper];
        var o = ((y - y0) * 256 + cx * 8) * 4;
        for (var b = 7; b >= 0; b--, o += 4) {
          var c = (bits >> b) & 1 ? pi : pp;
          rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255;
        }
      }
    }
  };

  // ---------------------------------------------------------------- snapshots

  HobbitMachine.prototype.snapshot = function () {
    return {
      kind: 'hobbit-web-snapshot', version: this.version, entry: this.entry,
      cpu: this.cpu.getState(), border: this.border, tstates: this.tstates,
      parked: this.parked, idle: this.idle, started: this.started,
      mem: this.mem
    };
  };

  HobbitMachine.prototype.restore = function (snap) {
    this.mem.set(snap.mem);
    this.cpu.setState(snap.cpu);
    this.border = snap.border; this.tstates = snap.tstates;
    this.parked = snap.parked; this.idle = snap.idle; this.started = snap.started;
    this.inputQueue.length = 0; this.typeQueue.length = 0; this.typeCur = null; this.keyState.fill(0);
    this.keyDownUntil = 0; this.textBuf = '';
  };

  HobbitMachine.KEYPOS = KEYPOS;
  HobbitMachine.findSig = findSig;
  root.HobbitMachine = HobbitMachine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
