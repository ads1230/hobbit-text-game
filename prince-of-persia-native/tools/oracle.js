// oracle.js — the real game in the Apple IIe emulator, driven a frame at a time, as the reference the
// native engine is checked against.  A "frame" is one pass of the game's main loop (aux $218C); the
// pages it shows (reads of $C054/$C055) are captured with their contents at that moment.
//   const O = require('./oracle'); const o = new O(); o.toLevel(1);
//   const r = o.frame({ key: 0x4C, btn: false }); // r.pages: [{page, rows(40*192)}], r.state: {...}
const fs = require('fs'), path = require('path');
// the emulator and the disk images: the prince-of-persia/ folder beside this one (or $POP_EMU, $POP_DISKS)
const EMU = process.env.POP_EMU || path.join(__dirname, '..', '..', 'prince-of-persia');
const Apple2 = require(path.join(EMU, 'js', 'apple2.js'));
const DISKS = process.env.POP_DISKS || path.join(EMU, 'disks');
const MAINLOOP = 0x218C, FRAME = 17030;
const SIG = [0xAD, 0x00, 0xC0, 0x0D, 0x61, 0xC0, 0x0D, 0x62, 0xC0, 0x10, 0xF5];
const SIDE_NAME = { 1: 'a', 2: 'b', 3: 'boot' };

class Oracle {
  constructor() {
    const m = this.m = new Apple2(); m.installRom();
    this.images = { boot: new Uint8Array(fs.readFileSync(path.join(DISKS, 'boot.dsk'))), a: new Uint8Array(fs.readFileSync(path.join(DISKS, 'a.dsk'))), b: new Uint8Array(fs.readFileSync(path.join(DISKS, 'b.dsk'))) };
    this.inserted = null; this.insert('boot');
    this.introDone = { scroller: false, picture: false }; this.autoKeyRelease = 0; this.autoCooldown = 0;
    this.pages = []; this.capturing = false; this.frameNo = 0; this.log = [];
    this.watch = { 0xD924: 0 };                                 // BURN (specialk+36): torch burns during songs
    const self = this, io = m.io.bind(m);
    m.io = function (a, v) {
      const lo = a & 0xFF;
      if (v === undefined && (lo === 0x54 || lo === 0x55) && self.capturing) self.capture(lo === 0x54 ? 1 : 2);
      return io(a, v);
    };
  }
  insert(side) { this.m.disk.insert(0, this.images[side], side + '.dsk'); this.inserted = side; }
  capture(page) {
    const base = page === 1 ? 0x2000 : 0x4000, rows = new Uint8Array(40 * 192), mem = this.m.main;
    for (let y = 0; y < 192; y++) { const off = base + ((y & 7) << 10) + ((y >> 3) & 7) * 0x80 + (y >> 6) * 0x28; for (let x = 0; x < 40; x++) rows[y * 40 + x] = mem[off + x]; }
    this.pages.push({ page, rows, frame: this.frameNo, cycles: this.m.cpu.cycles, pc: this.m.cpu.pc });
  }
  autoKey(code) { this.m.keyPress(code); this.autoKeyRelease = this.m.cpu.cycles + FRAME * 3; this.autoCooldown = this.m.cpu.cycles + FRAME * 12; }
  autoPilot() {
    const m = this.m, pc = m.cpu.pc, now = m.cpu.cycles;
    if (this.autoKeyRelease && now >= this.autoKeyRelease) { this.autoKeyRelease = 0; if (!this.holding) m.keyRelease(); }
    if (now < this.autoCooldown) return;
    if (!m.lcRead) {
      if (!this.introDone.scroller && pc >= 0x4027 && pc < 0x4890) { this.introDone.scroller = true; this.autoKey(0x8D); return; }
      if (!this.introDone.picture && this.introDone.scroller && pc >= 0xB71C && pc < 0xB72B) { this.introDone.picture = true; this.autoKey(0x8D); return; }
    }
    if (pc >= 0xD286 && pc < 0xD291 && m.lcRead && !m.lcBank2) {
      const base = 0xC286; for (let i = 0; i < SIG.length; i++) if (m.main[base + i] !== SIG[i]) return;
      const side = SIDE_NAME[m.main[0xC39E]]; if (!side) return;
      if (side !== this.inserted) { this.insert(side); this.log.push('inserted ' + side + ' at frame ' + this.frameNo); }
      this.autoKey(0x8D);
    }
  }
  // runs until the main loop's top is reached (at most `limit` cycles); returns true when it was
  runToMainLoop(limit, title) {
    const m = this.m, cpu = m.cpu, end = cpu.cycles + limit;
    let next = cpu.cycles + FRAME, idle = 0;
    const watch = this.watch;
    while (cpu.cycles < end) {
      if (cpu.pc === MAINLOOP && m.ramrd) return true;
      if (watch && watch[cpu.pc] !== undefined && m.lcRead) watch[cpu.pc]++;
      m.step();
      if (cpu.cycles >= next) {
        next += FRAME; this.autoPilot();
        if (title) {                                                // the title screen waits for a key: press one once it has been up for a second
          idle = (!m.textMode && m.hires && !m.disk.motor) ? idle + 1 : 0;
          if (idle === 60 && !this.titleKeyed) { this.titleKeyed = true; m.keyPress(0x8D); }
          if (idle === 63 && this.titleKeyed) m.keyRelease();
        }
      }
    }
    return false;
  }
  // boots and plays through to the first frame of the level (1); the autopilot skips the intro and swaps sides
  toLevel(level) {
    if (level && level !== 1) throw new Error('only level 1 for now');
    this.capturing = true; this.pages.length = 0; this.frameNo = 0;
    if (!this.runToMainLoop(80 * 1000000, true)) throw new Error('never reached the main loop');
    const initial = this.pages.slice(-1);                           // the level's first frame (DoCleanCut) is shown before the loop's first pass
    this.pages.length = 0; this.lastKey = 0;
    return { state: this.state(), pages: initial };
  }
  // one pass of the main loop with the given input: key (7-bit code or 0), btn (button 0 down)
  frame(input) {
    input = input || {};
    const m = this.m, key = input.key || 0;
    if (key !== this.lastKey) { if (key) m.keyPress(key); else m.keyRelease(); this.lastKey = key; }
    this.holding = !!key;
    m.buttons[0] = !!input.btn; m.buttons[1] = false;
    const start = this.pages.length;
    m.step();                                                     // leave the loop's top
    if (!this.runToMainLoop(120 * 1000000)) throw new Error('main loop not reached again (pc ' + m.cpu.pc.toString(16) + ')');
    this.frameNo++;
    return { pages: this.pages.slice(start), state: this.state() };
  }
  // the game's variables, from the aux bank the game keeps them in
  state() {
    const z = this.m.aux, rec = (b) => ({ posn: z[b], x: z[b + 1], y: z[b + 2], face: z[b + 3], bx: z[b + 4], by: z[b + 5], action: z[b + 6], xvel: z[b + 7], yvel: z[b + 8], seq: z[b + 9] | z[b + 10] << 8, scrn: z[b + 11], repeat: z[b + 12], id: z[b + 13], sword: z[b + 14], life: z[b + 15] });
    return { kid: rec(0x50), shad: rec(0x60), char: rec(0x40), page: z[0], scrnum: z[0x23], level: z[0x3F4], zp: Uint8Array.from(z.subarray(0, 0x100)), p2: Uint8Array.from(z.subarray(0x200, 0x400)) };
  }
}
module.exports = Oracle;

if (require.main === module) {
  const png = require('./png.js');
  const o = new Oracle();
  const t0 = Date.now();
  const r0 = o.toLevel(1), s0 = r0.state;
  console.log('at main loop after', ((Date.now() - t0) / 1000).toFixed(1), 's; log:', o.log.join('; '), 'initial pages', r0.pages.length);
  console.log('kid', JSON.stringify(s0.kid), 'page', s0.page, 'scrnum', s0.scrnum, 'level', s0.level);
  if (r0.pages[0]) png.save('/tmp/oracle_first.png', r0.pages[0].rows);
  const n = parseInt(process.argv[2] || '5', 10);
  for (let i = 0; i < n; i++) {
    const r = o.frame({});
    console.log('frame', i, 'pages', r.pages.map(p => p.page + '@' + p.pc.toString(16)).join(','), 'kid', JSON.stringify(r.state.kid), 'page', r.state.page);
    r.pages.forEach((p, j) => png.save(`/tmp/oracle_f${i}_${j}.png`, p.rows));
  }
}

// calls a game subroutine (aux memory) at the main loop's top: A/X/Y in, A out.  The CPU state is restored.
Oracle.prototype.call = function (addr, a, x, y) {
  const m = this.m, cpu = m.cpu, save = { pc: cpu.pc, a: cpu.a, x: cpu.x, y: cpu.y, sp: cpu.sp, p: cpu.p };
  cpu.a = a & 0xFF; cpu.x = (x || 0) & 0xFF; cpu.y = (y || 0) & 0xFF;
  cpu.push(0xCF); cpu.push(0xFE);                       // returns to $CFFF
  cpu.pc = addr;
  let n = 0;
  while (cpu.pc !== 0xCFFF) { m.step(); if (++n > 50000000) throw new Error('call never returned'); }
  const out = cpu.a;
  cpu.pc = save.pc; cpu.a = save.a; cpu.x = save.x; cpu.y = save.y; cpu.sp = save.sp; cpu.p = save.p;
  return out;
};
// how many torch-burn iterations a song lasts (the mplay loop of songcues)
Oracle.prototype.songTicks = function (song) {
  this.call(0x4B7, song);
  let n = 0;
  for (;;) { n++; if (this.call(0x4BA, 0) === 0) break; if (n > 100000) throw new Error('song never ends'); }
  return n;
};
