// apple2.js — an Apple IIe with 128K, the language card and a Disk II in slot 6,
// enough of a machine to run a program that boots from its own disk.  There is no
// Apple ROM in it: the few monitor entry points a DOS 3.3 boot uses are provided
// natively (text output, key input, the I/O vectors), the disk controller's boot code
// is replaced by a hook, and everything else the program brings with it.
var Apple2 = (function () {
  'use strict';
  var CPU = typeof CPU6502 !== 'undefined' ? CPU6502 : require('./cpu6502.js');

  // ---------------------------------------------------------------- Disk II
  var SIX_TWO = [0x96, 0x97, 0x9A, 0x9B, 0x9D, 0x9E, 0x9F, 0xA6, 0xA7, 0xAB, 0xAC, 0xAD, 0xAE, 0xAF, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB7, 0xB9, 0xBA, 0xBB, 0xBC, 0xBD, 0xBE, 0xBF, 0xCB, 0xCD, 0xCE, 0xCF, 0xD3, 0xD6, 0xD7, 0xD9, 0xDA, 0xDB, 0xDC, 0xDD, 0xDE, 0xDF, 0xE5, 0xE6, 0xE7, 0xE9, 0xEA, 0xEB, 0xEC, 0xED, 0xEE, 0xEF, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF7, 0xF9, 0xFA, 0xFB, 0xFC, 0xFD, 0xFE, 0xFF];
  var DOS_ORDER = [0, 7, 14, 6, 13, 5, 12, 4, 11, 3, 10, 2, 9, 1, 8, 15];   // physical sector -> logical sector, DOS 3.3 order
  var PRODOS_ORDER = [0, 8, 1, 9, 2, 10, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  var TRACK_NIBBLES = 0x1A00;

  // 6&2 nibbles for one 256-byte sector: 86 "twos" (the low bit pairs of three bytes each),
  // 256 "sixes", each exclusive-ored with the one before, then a checksum, all through the table.
  function encodeSector(data) {
    var six = new Uint8Array(342);
    function pair(b) { return ((b & 1) << 1) | ((b & 2) >> 1); }
    for (var k = 0; k < 86; k++) {
      var v = (k + 172 < 256 ? pair(data[k + 172]) << 4 : 0) | (pair(data[k + 86]) << 2) | pair(data[k]);
      six[k] = v;
    }
    for (var i = 0; i < 256; i++) six[86 + i] = data[i] >> 2;
    var out = new Uint8Array(343), prev = 0;
    for (i = 0; i < 342; i++) { out[i] = SIX_TWO[six[i] ^ prev]; prev = six[i]; }
    out[342] = SIX_TWO[prev];
    return out;
  }
  function encodeTrack(image, track, order, volume) {
    var t = new Uint8Array(TRACK_NIBBLES).fill(0xFF), p = 0;
    function put(b) { t[p++] = b; }
    function four4(b) { put(((b >> 1) & 0x55) | 0xAA); put((b & 0x55) | 0xAA); }
    p = 48;                                                        // gap 1
    for (var phys = 0; phys < 16; phys++) {
      var logical = order[phys];
      put(0xD5); put(0xAA); put(0x96); four4(volume); four4(track); four4(phys); four4(volume ^ track ^ phys); put(0xDE); put(0xAA); put(0xEB);
      for (var g = 0; g < 8; g++) put(0xFF);                       // gap 2
      put(0xD5); put(0xAA); put(0xAD);
      var nib = encodeSector(image.subarray((track * 16 + logical) * 256, (track * 16 + logical) * 256 + 256));
      for (var i = 0; i < 343; i++) put(nib[i]);
      put(0xDE); put(0xAA); put(0xEB);
      for (g = 0; g < 16; g++) put(0xFF);                          // gap 3
    }
    return t;
  }

  // the way back: a track of nibbles to its sixteen sectors, for a disk the program has written to
  var UNSIX = new Int16Array(256).fill(-1); for (var u = 0; u < 64; u++) UNSIX[SIX_TWO[u]] = u;
  function unpair(v) { return ((v & 1) << 1) | ((v & 2) >> 1); }
  function decodeTrack(track, image, trackNo, order) {
    var n = track.length, found = 0, six = new Uint8Array(342);
    function at(i) { return track[i % n]; }
    function four4(j) { return ((at(j) << 1) | 1) & at(j + 1); }
    for (var i = 0; i < n; i++) {
      if (at(i) !== 0xD5 || at(i + 1) !== 0xAA || at(i + 2) !== 0x96) continue;
      var vol = four4(i + 3), trk = four4(i + 5), sec = four4(i + 7), chk = four4(i + 9);
      if ((vol ^ trk ^ sec) !== chk || sec > 15) continue;
      var j = i + 11, limit = j + 40, ok = false;
      for (; j < limit; j++) if (at(j) === 0xD5 && at(j + 1) === 0xAA && at(j + 2) === 0xAD) { ok = true; break; }
      if (!ok) continue;
      j += 3;
      var prev = 0, bad = false;
      for (var k = 0; k < 342; k++) { var v = UNSIX[at(j + k)]; if (v < 0) { bad = true; break; } prev ^= v; six[k] = prev; }
      if (bad || UNSIX[at(j + 342)] !== prev) continue;
      var base = (trackNo * 16 + order[sec]) * 256;
      for (k = 0; k < 256; k++) image[base + k] = (six[86 + k] << 2) | unpair((six[k % 86] >> (2 * ((k / 86) | 0))) & 3);
      found++; i = j + 342;
    }
    return found;
  }

  function Drive() { this.tracks = null; this.halfTrack = 0; this.phase = 0; this.pos = 0; this.name = ''; this.dirty = {}; this.image = null; this.order = DOS_ORDER; }
  // writes the tracks the program changed back into the sector image; returns true when anything changed
  Drive.prototype.flush = function () {
    var keys = Object.keys(this.dirty); if (!keys.length || !this.image) return false;
    for (var i = 0; i < keys.length; i++) decodeTrack(this.tracks[keys[i]], this.image, +keys[i], this.order);
    this.dirty = {}; return true;
  };
  function DiskII(machine) {
    this.m = machine; this.drives = [new Drive(), new Drive()]; this.drive = 0; this.motor = false; this.q6 = 0; this.q7 = 0;
    this.latch = 0; this.lastCycles = 0; this.lastReadPos = -1; this.lastCycle = 0;
  }
  DiskII.prototype.insert = function (n, image, name) {
    var d = this.drives[n];
    if (!image) { d.tracks = null; d.name = ''; return; }
    var order = /\.po$/i.test(name || '') ? PRODOS_ORDER : DOS_ORDER;
    d.tracks = []; d.name = name || ''; d.image = image.length === 143360 ? image : null; d.order = order; d.dirty = {};
    if (image.length === 232960) {                                  // a .nib image: raw nibbles, 6656 a track
      for (var tr = 0; tr < 35; tr++) d.tracks.push(new Uint8Array(image.subarray(tr * 6656, (tr + 1) * 6656)));
    } else {
      for (tr = 0; tr < 35; tr++) d.tracks.push(encodeTrack(image, tr, order, 254));
    }
  };
  DiskII.prototype.current = function () { return this.drives[this.drive]; };
  DiskII.prototype.access = function (addr, value, cycles) {
    var sw = addr & 0x0F, d = this.current();
    if (sw < 8) {                                                   // phase magnets: step the head
      var ph = sw >> 1, on = sw & 1;
      if (on) {
        var delta = ((ph - d.phase + 4) & 3);
        if (delta === 1) d.halfTrack++; else if (delta === 3) d.halfTrack--;
        if (d.halfTrack < 0) d.halfTrack = 0; if (d.halfTrack > 69) d.halfTrack = 69;
        d.phase = ph;
      }
      return this.latch;
    }
    switch (sw) {
      case 8: this.motor = false; return this.latch;
      case 9: this.motor = true; return this.latch;
      case 10: this.drive = 0; return this.latch;
      case 11: this.drive = 1; return this.latch;
      // Q6/Q7: off/off reads the latch, on/off senses write protect (bit 7), off/on shifts a nibble out, on/on loads the latch
      case 12: this.q6 = 0; return this.shift(cycles, value);
      case 13: this.q6 = 1; if (value !== undefined && this.q7) this.latch = value; return this.q7 ? this.latch : (d.tracks ? 0 : 0x80);
      case 14: this.q7 = 0; return this.q6 ? (d.tracks ? 0 : 0x80) : this.latch;
      case 15: this.q7 = 1; if (value !== undefined && this.q6) this.latch = value; return this.latch;
    }
    return 0;
  };
  // the data latch: a new nibble every 32 cycles; a read sees a nibble once, then a not-yet-ready value until the next
  DiskII.prototype.shift = function (cycles, value) {
    var d = this.current(), track = d.tracks && d.tracks[d.halfTrack >> 1];
    if (!track) return 0xFF;
    var elapsed = cycles - this.lastCycles, n = Math.floor(elapsed / 32);
    if (n > 0) { d.pos = (d.pos + n) % track.length; this.lastCycles += n * 32; }
    if (this.q7) {                                                   // writing
      if (value !== undefined) this.latch = value;
      if (n > 0) { track[d.pos] = this.latch; d.dirty[d.halfTrack >> 1] = true; }
      return this.latch;
    }
    if (d.pos !== this.lastReadPos) { this.lastReadPos = d.pos; this.latch = track[d.pos]; return this.latch; }
    return this.latch & 0x7F;
  };
  // reads a logical sector straight from the image (for the boot hook)
  DiskII.prototype.readSector = function (track, physical, out) {
    var d = this.current(); if (!d.image) return false;
    var logical = d.order[physical];
    out.set(d.image.subarray((track * 16 + logical) * 256, (track * 16 + logical) * 256 + 256));
    return true;
  };

  // ---------------------------------------------------------------- the machine
  function Machine() {
    this.main = new Uint8Array(0x10000); this.aux = new Uint8Array(0x10000);
    this.rom = new Uint8Array(0x3000).fill(0x60);                   // $D000-$FFFF: RTS everywhere but the hooks
    this.slotRom = new Uint8Array(0x0F00);                          // $C100-$CFFF
    this.rArr = new Array(256); this.rOff = new Uint32Array(256); this.wArr = new Array(256); this.wOff = new Uint32Array(256);
    this.cpu = new CPU(this);
    this.disk = new DiskII(this);
    this.hooks = {}; this.hookFlag = new Uint8Array(0x10000);
    this.kbd = 0; this.keyDown = false; this.buttons = [false, false, false]; this.paddles = [128, 128, 128, 128]; this.paddleStart = 0; this.joystick = false;
    this.speakerToggles = []; this.frameCycles = 17030; this.vblStart = 12480;
    this.text = ''; this.log = null;
    this.reset();
  }
  var M = Machine.prototype;
  M.reset = function () {
    this.store80 = false; this.ramrd = false; this.ramwrt = false; this.altzp = false; this.intcxrom = false; this.slotc3rom = false; this.col80 = false; this.altchar = false;
    this.textMode = true; this.mixed = false; this.page2 = false; this.hires = false;
    this.lcRead = false; this.lcWrite = false; this.lcBank2 = false; this.lcPrewrite = 0;
    this.annunciators = [false, false, false, false];
    this.mapPages();
    this.cpu.a = this.cpu.x = this.cpu.y = 0; this.cpu.sp = 0xFF; this.cpu.p = 0x24; this.cpu.cycles = 0;
    this.cpu.pc = 0xFA62;                                            // RESET: goes to the boot hook
  };
  M.mapPages = function () {
    var main = this.main, aux = this.aux, rom = this.rom, slot = this.slotRom;
    var zpArr = this.altzp ? aux : main;
    for (var p = 0; p < 2; p++) { this.rArr[p] = zpArr; this.rOff[p] = p << 8; this.wArr[p] = zpArr; this.wOff[p] = p << 8; }
    for (p = 2; p < 0xC0; p++) {
      var r = this.ramrd ? aux : main, w = this.ramwrt ? aux : main;
      if (this.store80 && ((p >= 4 && p < 8) || (this.hires && p >= 0x20 && p < 0x40))) { r = w = this.page2 ? aux : main; }
      this.rArr[p] = r; this.rOff[p] = p << 8; this.wArr[p] = w; this.wOff[p] = p << 8;
    }
    for (p = 0xC1; p < 0xD0; p++) { this.rArr[p] = slot; this.rOff[p] = (p - 0xC1) << 8; this.wArr[p] = null; }
    var lc = this.altzp ? aux : main;
    for (p = 0xD0; p < 0x100; p++) {
      var off = p < 0xE0 ? ((this.lcBank2 ? 0xD000 : 0xC000) + ((p - 0xD0) << 8)) : (p << 8);
      if (this.lcRead) { this.rArr[p] = lc; this.rOff[p] = off; } else { this.rArr[p] = rom; this.rOff[p] = (p - 0xD0) << 8; }
      if (this.lcWrite) { this.wArr[p] = lc; this.wOff[p] = off; } else this.wArr[p] = null;
    }
  };
  M.read = function (a) {
    var p = a >> 8;
    if (p === 0xC0) return this.io(a, undefined);
    return this.rArr[p][this.rOff[p] + (a & 0xFF)];
  };
  M.write = function (a, v) {
    var p = a >> 8;
    if (p === 0xC0) { this.io(a, v); return; }
    var arr = this.wArr[p];
    if (arr) arr[this.wOff[p] + (a & 0xFF)] = v;
  };
  M.peek = function (a) { return this.read(a); };
  M.io = function (a, v) {
    var lo = a & 0xFF, write = v !== undefined;
    if (lo < 0x10) {
      if (!write) return this.kbd;
      switch (lo) {
        case 0x00: this.store80 = false; break; case 0x01: this.store80 = true; break;
        case 0x02: this.ramrd = false; break; case 0x03: this.ramrd = true; break;
        case 0x04: this.ramwrt = false; break; case 0x05: this.ramwrt = true; break;
        case 0x06: this.intcxrom = false; break; case 0x07: this.intcxrom = true; break;
        case 0x08: this.altzp = false; break; case 0x09: this.altzp = true; break;
        case 0x0A: this.slotc3rom = false; break; case 0x0B: this.slotc3rom = true; break;
        case 0x0C: this.col80 = false; break; case 0x0D: this.col80 = true; break;
        case 0x0E: this.altchar = false; break; case 0x0F: this.altchar = true; break;
      }
      this.mapPages(); return 0;
    }
    if (lo === 0x10) { this.kbd &= 0x7F; return (this.kbd & 0x7F) | (this.keyDown ? 0x80 : 0); }
    if (lo < 0x20) {
      var k = this.kbd & 0x7F, f;
      switch (lo) {
        case 0x11: f = this.lcBank2; break; case 0x12: f = this.lcRead; break; case 0x13: f = this.ramrd; break; case 0x14: f = this.ramwrt; break;
        case 0x15: f = this.intcxrom; break; case 0x16: f = this.altzp; break; case 0x17: f = this.slotc3rom; break; case 0x18: f = this.store80; break;
        case 0x19: f = (this.cpu.cycles % this.frameCycles) < this.vblStart; break;      // RDVBLBAR: high outside the vertical blank
        case 0x1A: f = this.textMode; break; case 0x1B: f = this.mixed; break; case 0x1C: f = this.page2; break; case 0x1D: f = this.hires; break;
        case 0x1E: f = this.altchar; break; case 0x1F: f = this.col80; break;
      }
      return k | (f ? 0x80 : 0);
    }
    if (lo === 0x30) { this.speakerToggles.push(this.cpu.cycles); return 0; }
    if (lo >= 0x50 && lo < 0x58) {
      switch (lo) {
        case 0x50: this.textMode = false; break; case 0x51: this.textMode = true; break; case 0x52: this.mixed = false; break; case 0x53: this.mixed = true; break;
        case 0x54: this.page2 = false; break; case 0x55: this.page2 = true; break; case 0x56: this.hires = false; break; case 0x57: this.hires = true; break;
      }
      if (this.store80) this.mapPages();
      return 0;
    }
    if (lo >= 0x58 && lo < 0x60) { this.annunciators[(lo - 0x58) >> 1] = !!(lo & 1); return 0; }
    if (lo === 0x61 || lo === 0x62 || lo === 0x63) return this.buttons[lo - 0x61] ? 0x80 : 0;
    if (lo >= 0x64 && lo < 0x68) { if (!this.joystick) return 0x80; var t = this.cpu.cycles - this.paddleStart; return t < this.paddles[lo - 0x64] * 11 ? 0x80 : 0; }   // no joystick plugged in: the timers never trip
    if (lo === 0x70) { this.paddleStart = this.cpu.cycles; return 0; }
    if (lo >= 0x80 && lo < 0x90) {
      // the language card: bit 3 picks the bank, bit 1 read RAM/ROM, bit 0 write enable (after two reads)
      this.lcBank2 = !(lo & 8);
      this.lcRead = ((lo & 3) === 0 || (lo & 3) === 3);
      if (lo & 1) { if (!write) { this.lcPrewrite++; if (this.lcPrewrite >= 2) this.lcWrite = true; } }
      else { this.lcPrewrite = 0; this.lcWrite = false; }
      if (write) this.lcPrewrite = 0;
      this.mapPages(); return 0;
    }
    if (lo >= 0xE0 && lo < 0xF0) return this.disk.access(a, v, this.cpu.cycles);
    return 0;
  };
  // ---- keyboard
  M.keyPress = function (code) { this.kbd = (code & 0x7F) | 0x80; this.keyDown = true; };
  M.keyRelease = function () { this.keyDown = false; };
  // ---- hooks: native code that stands in for ROM routines, keyed by address
  M.hook = function (addr, fn) { this.hooks[addr] = fn; this.hookFlag[addr] = 1; };
  M.rts = function () { var c = this.cpu; c.pc = (c.pull() | c.pull() << 8); c.pc = (c.pc + 1) & 0xFFFF; };
  // runs for a number of cycles; returns cycles actually run
  M.run = function (cycles) {
    var cpu = this.cpu, end = cpu.cycles + cycles, flags = this.hookFlag;
    // a hook stands in for the ROM, so it only applies while the ROM is what's mapped there
    while (cpu.cycles < end) {
      if (flags[cpu.pc] && (cpu.pc < 0xD000 || !this.lcRead)) { var r = this.hooks[cpu.pc](this); cpu.cycles += r === 'wait' ? 16 : 8; if (r === 'halt') return; continue; }
      cpu.step();
    }
  };
  M.step = function () { var cpu = this.cpu; if (this.hookFlag[cpu.pc] && (cpu.pc < 0xD000 || !this.lcRead)) { var r = this.hooks[cpu.pc](this); cpu.cycles += r === 'wait' ? 16 : 8; return; } cpu.step(); };
  // ---- the 40-column text screen, as the monitor's COUT1 would keep it
  M.textAddr = function (row, col) { return 0x400 + (row & 7) * 0x80 + (row >> 3) * 0x28 + col; };
  M.coutChar = function (ch) {
    var m = this.main;
    var CH = m[0x24], CV = m[0x25], WNDLFT = m[0x20], WNDWDTH = m[0x21] || 40, WNDTOP = m[0x22], WNDBTM = m[0x23] || 24;
    ch &= 0xFF;
    if (this.log) this.log.text += String.fromCharCode(ch & 0x7F);
    if (ch === 0x8D) { CH = 0; CV++; }
    else if (ch === 0x8A) CV++;
    else if (ch === 0x87) this.speakerToggles.push(this.cpu.cycles);
    else if (ch === 0x88) { if (CH) CH--; }
    else if ((ch & 0x7F) >= 0x20) {
      var c = ch & 0x7F; if (c >= 0x60) c -= 0x20;                    // lower case shows as upper case in the primary set
      m[this.textAddr(CV, WNDLFT + CH)] = m[0x32] === 0x3F ? (c & 0x3F) : (c | 0x80);   // INVFLG picks inverse or normal
      CH++; if (CH >= WNDWDTH) { CH = 0; CV++; }
    }
    if (CV >= WNDBTM) {                                                  // scroll the window
      for (var r = WNDTOP; r < WNDBTM - 1; r++) for (var x = 0; x < WNDWDTH; x++) m[this.textAddr(r, WNDLFT + x)] = m[this.textAddr(r + 1, WNDLFT + x)];
      for (x = 0; x < WNDWDTH; x++) m[this.textAddr(WNDBTM - 1, WNDLFT + x)] = 0xA0;
      CV = WNDBTM - 1;
    }
    m[0x24] = CH; m[0x25] = CV;
  };
  M.home = function () { var m = this.main; for (var r = 0; r < 24; r++) for (var x = 0; x < 40; x++) m[this.textAddr(r, x)] = 0xA0; m[0x24] = 0; m[0x25] = 0; };
  // ---- installs the stand-ins for the monitor and the disk boot
  M.installRom = function () {
    var self = this, cpu = this.cpu, m = this.main;
    // the machine-identification bytes programs look at (an enhanced Apple IIe); $FE1F stays RTS so
    // the IIgs test (SEC; JSR $FE1F; BCC) says "not a IIgs"
    this.rom[0xFBB3 - 0xD000] = 0x06; this.rom[0xFBC0 - 0xD000] = 0xE0; this.rom[0xFB1E - 0xD000] = 0xAD; this.rom[0xFBBF - 0xD000] = 0x00;
    function setVectors() { m[0x36] = 0xF0; m[0x37] = 0xFD; m[0x38] = 0x1B; m[0x39] = 0xFD; }
    this.hook(0xFA62, function () {                                    // RESET
      m[0x20] = 0; m[0x21] = 40; m[0x22] = 0; m[0x23] = 24; m[0x32] = 0xFF; m[0x24] = 0; m[0x25] = 0;
      self.textMode = true; self.mixed = false; self.page2 = false; self.hires = false; self.mapPages();
      setVectors(); self.home();
      m[0x2B] = 0x60; cpu.x = 0x60; cpu.pc = 0xC600;
    });
    this.hook(0xC600, function () {                                    // the Disk II boot ROM: sector 0 of track 0 to $0800
      var d = self.disk.current(); if (!d.image) return 'wait';
      m.set(d.image.subarray(0, 256), 0x800); m[0x2B] = 0x60; m[0x3D] = 0; m[0x41] = 0; m[0x27] = 9; cpu.x = 0x60; cpu.pc = 0x801;
    });
    this.hook(0xC65C, function () {                                    // its sector-read loop, called by boot1 for the rest of DOS
      var d = self.disk.current(); var buf = new Uint8Array(256);
      if (self.disk.readSector(m[0x41], m[0x3D] & 15, buf)) m.set(buf, m[0x27] << 8);
      m[0x27] = (m[0x27] + 1) & 0xFF; cpu.pc = 0x801;
    });
    this.hook(0xFE89, function () { m[0x38] = 0x1B; m[0x39] = 0xFD; self.rts(); });   // SETKBD
    this.hook(0xFE93, function () { m[0x36] = 0xF0; m[0x37] = 0xFD; self.rts(); });   // SETVID
    this.hook(0xFB2F, function () { self.textMode = true; self.mixed = false; self.page2 = false; self.hires = false; m[0x20] = 0; m[0x21] = 40; m[0x22] = 0; m[0x23] = 24; m[0x24] = 0; m[0x25] = 23; self.mapPages(); self.rts(); });   // INIT
    this.hook(0xFC58, function () { self.home(); self.rts(); });       // HOME
    this.hook(0xFDED, function () { cpu.pc = m[0x36] | m[0x37] << 8; });   // COUT → (CSW)
    this.hook(0xFDF0, function () { self.coutChar(cpu.a); self.rts(); });   // COUT1
    this.hook(0xFD8E, function () { cpu.a = 0x8D; cpu.pc = 0xFDED; });   // CROUT
    this.hook(0xFD0C, function () { cpu.pc = m[0x38] | m[0x39] << 8; });   // RDKEY → (KSW)
    this.hook(0xFD1B, function () {                                    // KEYIN: wait for a key
      if (!(self.kbd & 0x80)) return 'wait';
      cpu.a = self.kbd; self.kbd &= 0x7F; self.rts();
    });
    this.hook(0xFD35, function () { cpu.pc = 0xFD0C; });               // RDCHAR
    this.hook(0xFD6A, function () {                                    // GETLN: read a line into $0200
      var buf = self.lineBuffer; if (!buf) { buf = self.lineBuffer = []; }
      if (!(self.kbd & 0x80)) return 'wait';
      var k = self.kbd & 0x7F; self.kbd &= 0x7F;
      if (k === 0x0D) { for (var i = 0; i < buf.length; i++) m[0x200 + i] = buf[i] | 0x80; m[0x200 + buf.length] = 0x8D; cpu.x = buf.length; self.lineBuffer = null; self.coutChar(0x8D); self.rts(); return; }
      if (k === 0x08 || k === 0x7F) { buf.pop(); return; }
      buf.push(k); self.coutChar(k | 0x80);
    });
    this.hook(0xFF3A, function () { self.rts(); });                    // BELL
    this.hook(0xFBDD, function () { self.rts(); });                    // BELL1
    this.hook(0xFE84, function () { m[0x32] = 0xFF; self.rts(); });    // SETNORM
    this.hook(0xFE80, function () { m[0x32] = 0x3F; self.rts(); });    // SETINV
    this.hook(0xFC22, function () { m[0x25] = m[0x25]; self.rts(); });  // VTAB
    this.hook(0xFC42, function () { for (var r = m[0x25]; r < 24; r++) for (var x = (r === m[0x25] ? m[0x24] : 0); x < 40; x++) m[self.textAddr(r, x)] = 0xA0; self.rts(); });   // CLREOP
    this.hook(0xFC9C, function () { for (var x = m[0x24]; x < 40; x++) m[self.textAddr(m[0x25], x)] = 0xA0; self.rts(); });   // CLREOL
    this.hook(0xFDDA, function () { var h = '0123456789ABCDEF'; self.coutChar(h.charCodeAt(cpu.a >> 4) | 0x80); self.coutChar(h.charCodeAt(cpu.a & 15) | 0x80); self.rts(); });   // PRBYTE
    this.hook(0xFCA8, function () { self.rts(); });                    // WAIT
    this.hook(0xFE2C, function () {                                    // MOVE: (A1)..(A2) -> (A4)
      var a1 = m[0x3C] | m[0x3D] << 8, a2 = m[0x3E] | m[0x3F] << 8, a4 = m[0x42] | m[0x43] << 8;
      for (var i = 0; a1 + i <= a2 && i < 0x10000; i++) self.write((a4 + i) & 0xFFFF, self.read((a1 + i) & 0xFFFF));
      self.rts();
    });
    this.hook(0xF3E2, function () { self.hires = true; self.textMode = false; self.mixed = true; self.page2 = false; self.mapPages(); for (var i = 0x2000; i < 0x4000; i++) m[i] = 0; self.rts(); });   // HGR
    this.hook(0xF3D8, function () { self.hires = true; self.textMode = false; self.mixed = false; self.page2 = true; self.mapPages(); for (var i = 0x4000; i < 0x6000; i++) m[i] = 0; self.rts(); });   // HGR2
    // low-resolution graphics: 40x48 blocks, two to a text byte, colour in $30
    function loAddr(row, col) { return self.textAddr(row >> 1, col); }
    function plot(row, col) { var a = loAddr(row, col), v = m[a]; m[a] = (row & 1) ? ((v & 0x0F) | (m[0x30] & 0xF0)) : ((v & 0xF0) | (m[0x30] & 0x0F)); }
    this.hook(0xF800, function () { plot(cpu.a, cpu.y); self.rts(); });                                   // PLOT
    this.hook(0xF819, function () { for (var x = cpu.y; x <= m[0x2C]; x++) plot(cpu.a, x); cpu.y = m[0x2C]; self.rts(); });   // HLINE
    this.hook(0xF828, function () { for (var r = cpu.a; r <= m[0x2D]; r++) plot(r, cpu.y); cpu.a = m[0x2D]; self.rts(); });   // VLINE
    this.hook(0xF832, function () { for (var r = 0; r < 24; r++) for (var x = 0; x < 40; x++) m[self.textAddr(r, x)] = 0; cpu.y = 0; self.rts(); });   // CLRSCR
    this.hook(0xF836, function () { for (var r = 0; r < 20; r++) for (var x = 0; x < 40; x++) m[self.textAddr(r, x)] = 0; cpu.y = 0; self.rts(); });   // CLRTOP
    this.hook(0xF864, function () { m[0x30] = (cpu.a & 15) * 17; self.rts(); });                          // SETCOL
    this.hook(0xF871, function () { var v = m[loAddr(cpu.a, cpu.y)]; cpu.a = (cpu.a & 1) ? v >> 4 : v & 15; self.rts(); });   // SCRN
    this.hook(0xFF4A, function () { m[0x45] = cpu.a; m[0x46] = cpu.x; m[0x47] = cpu.y; m[0x48] = cpu.p; m[0x49] = cpu.sp; self.rts(); });   // SAVE
    this.hook(0xFF3F, function () { cpu.a = m[0x45]; cpu.x = m[0x46]; cpu.y = m[0x47]; cpu.p = m[0x48] | 0x20; self.rts(); });        // RESTORE
    this.hook(0xFB1E, function () { cpu.y = self.paddles[cpu.x & 3] & 0xFF; cpu.p = (cpu.p & ~0x82) | (cpu.y & 0x80) | (cpu.y === 0 ? 2 : 0); self.rts(); });   // PREAD
    // vectors
    this.rom[0xFFFC - 0xD000] = 0x62; this.rom[0xFFFD - 0xD000] = 0xFA;
    this.rom[0xFFFE - 0xD000] = 0x62; this.rom[0xFFFF - 0xD000] = 0xFA;
    this.rom[0xFFFA - 0xD000] = 0x62; this.rom[0xFFFB - 0xD000] = 0xFA;
    // the Applesoft/monitor entry a DOS uses to tell what language is there: leave nothing that looks like BASIC
  };
  // ---- video helpers: the hi-res page as 40x192 bytes, and the text screen as 280x192 dots via a font
  M.hiresRows = function (out, page2) {
    var base = page2 ? 0x4000 : 0x2000, src = this.main;
    for (var y = 0; y < 192; y++) {
      var addr = base + (y & 7) * 0x400 + ((y >> 3) & 7) * 0x80 + (y >> 6) * 0x28;
      out.set(src.subarray(addr, addr + 40), y * 40);
    }
  };
  // ---- the whole state of the machine, for saving: memory, softswitches, CPU and where the disk heads are
  var SWITCHES = ['store80', 'ramrd', 'ramwrt', 'altzp', 'intcxrom', 'slotc3rom', 'col80', 'altchar', 'textMode', 'mixed', 'page2', 'hires', 'lcRead', 'lcWrite', 'lcBank2', 'lcPrewrite'];
  M.snapshot = function () {
    var s = { v: 1, main: this.main.slice(), aux: this.aux.slice(), sw: {}, cpu: { a: this.cpu.a, x: this.cpu.x, y: this.cpu.y, sp: this.cpu.sp, p: this.cpu.p, pc: this.cpu.pc, cycles: this.cpu.cycles }, kbd: this.kbd, keyDown: this.keyDown, annunciators: this.annunciators.slice(),
      disk: { drive: this.disk.drive, motor: this.disk.motor, q6: this.disk.q6, q7: this.disk.q7, latch: this.disk.latch, drives: this.disk.drives.map(function (d) { return { name: d.name, halfTrack: d.halfTrack, phase: d.phase, pos: d.pos }; }) } };
    for (var i = 0; i < SWITCHES.length; i++) s.sw[SWITCHES[i]] = this[SWITCHES[i]];
    return s;
  };
  M.restore = function (s) {
    this.main.set(s.main); this.aux.set(s.aux);
    for (var i = 0; i < SWITCHES.length; i++) this[SWITCHES[i]] = s.sw[SWITCHES[i]];
    var c = this.cpu; c.a = s.cpu.a; c.x = s.cpu.x; c.y = s.cpu.y; c.sp = s.cpu.sp; c.p = s.cpu.p; c.pc = s.cpu.pc; c.cycles = s.cpu.cycles;
    this.kbd = s.kbd; this.keyDown = s.keyDown; this.annunciators = s.annunciators.slice();
    var dk = this.disk; dk.drive = s.disk.drive; dk.motor = s.disk.motor; dk.q6 = s.disk.q6; dk.q7 = s.disk.q7; dk.latch = s.disk.latch; dk.lastCycles = c.cycles; dk.lastReadPos = -1;
    for (i = 0; i < 2; i++) { var d = dk.drives[i], sd = s.disk.drives[i]; d.halfTrack = sd.halfTrack; d.phase = sd.phase; d.pos = sd.pos; }
    this.mapPages();
  };
  // ---- the speaker: its clicks, sampled into a run of audio samples (box-filtered, so short pulses count)
  M.speakerSamples = function (out, fromCycle, cyclesPerSample, level) {
    var t = this.speakerToggles, ti = 0, n = out.length, c0 = fromCycle;
    while (ti < t.length && t[ti] < c0) { level = -level; ti++; }
    for (var i = 0; i < n; i++) {
      var c1 = c0 + cyclesPerSample, acc = 0, c = c0;
      while (ti < t.length && t[ti] < c1) { acc += (t[ti] - c) * level; level = -level; c = t[ti]; ti++; }
      acc += (c1 - c) * level;
      out[i] = acc / cyclesPerSample;
      c0 = c1;
    }
    this.speakerToggles = ti < t.length ? t.slice(ti) : [];
    return level;
  };
  Machine.encodeTrack = encodeTrack; Machine.decodeTrack = decodeTrack; Machine.DiskII = DiskII;
  return Machine;
})();
if (typeof module !== 'undefined') module.exports = Apple2;
