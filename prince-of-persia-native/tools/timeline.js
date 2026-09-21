// timeline.js — what the Apple shows and plays, second by second: the attract sequence from the boot, or the
// ending (level 14 played through).  The page's title and epilog timings come from this.
//   node tools/timeline.js [attract|ending]
const crypto = require('crypto');
const Oracle = require('./oracle.js');
const CPU_HZ = 1020484, FRAME = 17030;
const which = process.argv[2] || 'attract';
const o = new Oracle(); const m = o.m;
if (which === 'attract') o.titleKeyed = true;
else {
  o.toLevel(1); m.aux[0x31C] = 14; m.aux[0x7C] = 0x80;
  for (let i = 0; i < 5; i++) o.frame({});
  for (let i = 0; i < 25; i++) o.frame({ key: 0x4C });
  m.keyPress(0x4A); o.holding = true; o.lastKey = 0x4A;
}
const t0 = m.cpu.cycles, t = () => ((m.cpu.cycles - t0) / CPU_HZ).toFixed(2).padStart(7) + 's';
let cur = null; const step = m.step.bind(m);
m.step = function () {
  const pc = this.cpu.pc, inMsys = this.lcRead && !this.lcBank2;
  if (pc === 0xD400 && inMsys) { cur = { song: this.cpu.a, ticks: 0, last: this.cpu.cycles }; console.log(t(), 'song', cur.song, 'starts'); }
  if (pc === 0xD403 && inMsys && cur) { cur.ticks++; cur.last = this.cpu.cycles; }
  step();
};
let next = m.cpu.cycles + FRAME, lastMode = '', lastHash = '', stable = 0, flips = 0;
while (m.cpu.cycles < t0 + (which === 'attract' ? 200 : 150) * CPU_HZ) {
  m.step();
  if (m.cpu.cycles >= next) {
    next += FRAME; o.autoPilot();
    if (cur && m.cpu.cycles - cur.last > CPU_HZ) { console.log(t(), 'song', cur.song, 'over: last note at', ((cur.last - t0) / CPU_HZ).toFixed(2) + 's,', cur.ticks, 'ticks'); cur = null; }
    const mode = m.textMode ? 'text (dark)' : (m.col80 ? 'double hi-res' : 'hi-res');
    if (mode !== lastMode) { console.log(t(), mode); lastMode = mode; }
    if (mode === 'double hi-res' && !m.page2) { const h = crypto.createHash('md5').update(m.main.subarray(0x2000, 0x3FF8)).update(m.aux.subarray(0x2000, 0x3FF8)).digest('hex'); if (h !== lastHash) { lastHash = h; stable = 0; } else if (++stable === 3) console.log(t(), 'picture', h.slice(0, 8)); }
  }
}
