// pics.js — captures the pictures the page shows but the published source does not hold, from the game
// running in the emulator: the double hi-res title, story and epilog screens (main and aux $2000-$3FFF)
// and the princess's room (a hi-res page), into assets/pop_pics.json.
//   node tools/pics.js
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const Oracle = require('./oracle.js');
const CPU_HZ = 1020484, FRAME = 17030;
const OUT = path.join(__dirname, '..', 'assets', 'pop_pics.json');
const b64 = u8 => Buffer.from(u8).toString('base64');
const hash = u8 => crypto.createHash('md5').update(u8).digest('hex');
const out = {};

// runs the machine for `seconds`, calling watch() once an emulated frame
function run(o, seconds, watch) {
  const m = o.m, end = m.cpu.cycles + seconds * CPU_HZ; let next = m.cpu.cycles + FRAME;
  while (m.cpu.cycles < end) { m.step(); if (m.cpu.cycles >= next) { next += FRAME; o.autoPilot(); if (watch() === false) return; } }
}
// the double hi-res screens, in the order they first appear and stay for a moment
function dhgr(o, seconds, names) {
  const m = o.m, seen = new Set(); let last = null, stable = 0, i = 0;
  run(o, seconds, () => {
    if (m.textMode || !m.hires || !m.col80) { last = null; return; }
    const main = m.main.subarray(0x2000, 0x4000), aux = m.aux.subarray(0x2000, 0x4000), h = hash(main) + hash(aux);
    if (h !== last) { last = h; stable = 0; return; }
    if (++stable !== 6 || seen.has(h)) return;
    seen.add(h);
    if (i < names.length) { out[names[i]] = { main: b64(main), aux: b64(aux) }; console.log('picture', names[i], 'at', (m.cpu.cycles / CPU_HZ).toFixed(1), 's'); }
    if (++i >= names.length) return false;
  });
}
{                                                                     // the attract sequence: title and story
  const o = new Oracle(); o.titleKeyed = true;
  dhgr(o, 120, ['splash', 'presents', 'byline', 'title', 'prolog']);
  // the princess's room: as the intro cut begins the room is loaded from the disk into page 2 while the screen is
  // dark; it is complete when the drive stops, just before the game starts drawing on it
  // (the room is unpacked into page 2 in a burst of writes; the stars start twinkling a moment later, a byte at a time)
  const m = o.m, prev = new Uint8Array(0x2000); let best = null, bestBurst = 0, burst = 0, at = 0;
  run(o, 60, () => {
    if (!m.textMode) { if (best) return false; return; }             // hi-res comes on: the room is up
    const p2 = m.main.subarray(0x4000, 0x6000); let changed = 0;
    for (let i = 0; i < 0x2000; i++) if (p2[i] !== prev[i]) changed++;
    prev.set(p2);
    if (changed) { burst += changed; return; }
    if (burst > bestBurst) { bestBurst = burst; best = b64(p2); at = m.cpu.cycles; }
    burst = 0;
  });
  if (!best) throw new Error('no princess room');
  out.proom = best; console.log('princess room at', (at / CPU_HZ).toFixed(1), 's (' + bestBurst + ' bytes written)');
  dhgr(o, 120, ['sumup']);
}
{                                                                     // the end of the game: the epilog
  const o = new Oracle(); o.toLevel(1);
  o.m.aux[0x31C] = 14; o.m.aux[0x7C] = 0x80;
  for (let i = 0; i < 5; i++) o.frame({});                            // the last level: right onto the plate that opens the gates,
  for (let i = 0; i < 25; i++) o.frame({ key: 0x4C });                 // then left down the corridor to the princess
  o.m.keyPress(0x4A); o.holding = true; o.lastKey = 0x4A;
  dhgr(o, 180, ['epilog']);
}
if (process.env.CHECK && fs.existsSync(OUT)) {                        // compare with the file as it is
  const old = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  for (const k of Object.keys(out)) { const same = JSON.stringify(old[k]) === JSON.stringify(out[k]); console.log(k, same ? 'same as before' : 'DIFFERS'); }
} else {
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('wrote', OUT, Object.keys(out).join(' '), (fs.statSync(OUT).size / 1024).toFixed(0), 'KB');
}
