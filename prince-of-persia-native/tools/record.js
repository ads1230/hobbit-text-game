// record.js — records the Apple's speaker for every sound effect and song, as lists of toggle times
// (in CPU cycles), into assets/pop_audio.json.  The effects and the game's songs are played by calling
// the game's own routines at the main loop; the others are captured as the game itself plays them:
// the title songs during the attract sequence, the princess-room versions of the game's tunes (slower,
// as the room is redrawn between the notes) at level changes, at the end of the hour and at the end
// of the game, and the epilog's two after the final cut.
//   node tools/record.js [sfx game title cut epilog]   (all when none is named; sets are merged into the file)
const fs = require('fs'), path = require('path');
const Oracle = require('./oracle.js');
const CPU_HZ = 1020484, FRAME = 17030;
const OUT = path.join(__dirname, '..', 'assets', 'pop_audio.json');
function deltas(toggles, start) { const out = []; let last = start; for (const t of toggles) { out.push(t - last); last = t; } return out; }
function b64(arr) { const u = new Uint32Array(arr); return Buffer.from(u.buffer).toString('base64'); }
const sets = process.argv.slice(2).length ? process.argv.slice(2) : ['sfx', 'game', 'title', 'cut', 'epilog'];
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { cpuHz: CPU_HZ, sfx: {}, game: {}, title: {}, cut: {}, epilog: {}, ticks: { game: {}, title: {}, cut: {}, epilog: {} } };
for (const k of ['sfx', 'game', 'title', 'cut', 'epilog']) { out[k] = out[k] || {}; if (k !== 'sfx') out.ticks[k] = out.ticks[k] || {}; }

// ---- the game set: at level 1's main loop, calling PLAYBACK for the effects and the song player for the tunes
if (sets.includes('sfx') || sets.includes('game')) {
  const o = new Oracle(); o.toLevel(1); const m = o.m;
  const SOUNDTABLE = 0xB6C0, PLAYBACK = 0xEA00;
  if (sets.includes('sfx')) for (let n = 0; n < 20; n++) {
    m.aux[SOUNDTABLE] = 1; m.aux[SOUNDTABLE + 1] = n;
    m.speakerToggles.length = 0; const start = m.cpu.cycles;
    o.call(PLAYBACK, 0);
    const d = deltas(m.speakerToggles, start);
    out.sfx[n] = { n: d.length, cycles: m.cpu.cycles - start, data: b64(d) };
    console.log('sfx', n, 'toggles', d.length, 'ms', ((m.cpu.cycles - start) / CPU_HZ * 1000).toFixed(0));
  }
  m.aux[SOUNDTABLE] = 0;
  if (sets.includes('game')) for (let s = 1; s <= 16; s++) {
    m.speakerToggles.length = 0; const start = m.cpu.cycles;
    o.call(0x4B7, s); let ticks = 0;
    for (;;) { ticks++; if (o.call(0x4BA, 0) === 0) break; }
    const d = deltas(m.speakerToggles, start);
    out.game[s] = { n: d.length, cycles: m.cpu.cycles - start, data: b64(d) }; out.ticks.game[s] = ticks;
    console.log('game song', s, 'toggles', d.length, 'sec', ((m.cpu.cycles - start) / CPU_HZ).toFixed(1), 'ticks', ticks);
  }
}

// ---- the songs the game plays by itself: the music system's _minit ($D400) and _mplay ($D403), in aux LC bank 1
// A song runs from _minit to its last _mplay call (plus one tick): the caller stops calling once it reports the end.
function captureSongs(o, seconds, keep, label) {
  const m = o.m, songs = {}, ticks = {}; let cur = null; const step = m.step.bind(m);
  function finish() {
    if (!cur) return;
    const endAt = cur.ticks > 1 ? cur.lastPlay + (cur.lastPlay - cur.start) / (cur.ticks - 1) : m.cpu.cycles;
    const d = deltas(m.speakerToggles.filter(t => t <= endAt), cur.start);
    if (!songs[cur.song] && (!keep || keep.includes(cur.song))) {
      songs[cur.song] = { n: d.length, cycles: Math.round(endAt - cur.start), data: b64(d) }; ticks[cur.song] = cur.ticks;
      console.log(label, 'song', cur.song, 'toggles', d.length, 'sec', ((endAt - cur.start) / CPU_HZ).toFixed(1), 'ticks', cur.ticks);
    }
    cur = null;
  }
  m.step = function () {
    const pc = this.cpu.pc, inMsys = this.lcRead && !this.lcBank2;
    if (pc === 0xD400 && inMsys) { if (cur) finish(); cur = { song: this.cpu.a, start: this.cpu.cycles, lastPlay: this.cpu.cycles, ticks: 0 }; this.speakerToggles.length = 0; }
    if (pc === 0xD403 && inMsys && cur) { cur.ticks++; cur.lastPlay = this.cpu.cycles; }
    step();
  };
  const end = m.cpu.cycles + seconds * CPU_HZ; let next = m.cpu.cycles + FRAME;
  while (m.cpu.cycles < end) {
    m.step();
    if (m.cpu.cycles >= next) {
      next += FRAME; o.autoPilot();
      if (cur && m.cpu.cycles - cur.lastPlay > CPU_HZ) finish();        // a second without a note: the song is over
      if (keep && !cur && keep.every(k => songs[k])) break;
    }
  }
  finish(); m.step = step;
  return { songs, ticks };
}
function merge(set, r) { for (const k of Object.keys(r.songs)) { out[set][k] = r.songs[k]; out.ticks[set][k] = r.ticks[k]; } }
const force = process.env.FORCE;
function have(set, songs) { return !force && songs.every(k => out[set][k]); }

if (sets.includes('title')) {                                          // the attract sequence, from the boot
  const o = new Oracle(); o.titleKeyed = true;
  merge('title', captureSongs(o, 175, null, 'title'));           // (the summing-up tune ends at 159 s)
}
// the level is poked as the harnesses do it (NextLevel at $31C, with the copy-protection flag); the change happens at the next pass
function pokeLevel(o, level) { o.m.aux[0x31C] = level; o.m.aux[0x7C] = 0x80; }
if (sets.includes('cut')) {
  // level changes: 1 -> 2 (Timer), 3 -> 4 (Heartbeat), 11 -> 12 late in the hour (Heartbeat, then Danger)
  for (const [from, to, keep, late] of [[1, 2, [13]], [3, 4, [16]], [11, 12, [16, 3], true]]) {
    if (have('cut', keep)) continue;
    const o = new Oracle(); o.toLevel(1);
    if (from !== 1) { pokeLevel(o, from); for (let i = 0; i < 60; i++) o.frame({}); }
    if (late) { o.m.aux[0x306] = 0x9A; o.m.aux[0x307] = 0x8D; o.m.aux[0x301] = 20; }   // FrameCount at 50 minutes, the next message the 55th
    pokeLevel(o, to);
    merge('cut', captureSongs(o, 90, keep, 'cut ' + from + '->' + to));
  }
  if (!have('cut', [14])) {                                            // the hour runs out: the tragic scene
    const o = new Oracle(); o.toLevel(1);
    for (let i = 0; i < 40; i++) o.frame({});                           // (past the level's opening song)
    o.m.aux[0x306] = 0xE2; o.m.aux[0x307] = 0xA9; o.m.aux[0x301] = 32;    // FrameCount just short of the end, at the last time message
    merge('cut', captureSongs(o, 120, [14], 'time up'));
  }
}
if (sets.includes('cut') && !have('cut', [15]) || sets.includes('epilog') && !have('epilog', [1, 2])) {
  const o = new Oracle(); o.toLevel(1);                                // the end of the game: the embrace, then the epilog
  pokeLevel(o, 14);
  for (let i = 0; i < 5; i++) o.frame({});                            // the last level: right onto the plate that opens the gates,
  for (let i = 0; i < 25; i++) o.frame({ key: 0x4C });                 // then left down the corridor to the princess
  o.m.keyPress(0x4A); o.holding = true; o.lastKey = 0x4A;
  const r = captureSongs(o, 120, [15], 'the end'); if (sets.includes('cut')) merge('cut', r);
  if (sets.includes('epilog')) merge('epilog', captureSongs(o, 120, [1, 2], 'epilog'));
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('wrote', OUT, (fs.statSync(OUT).size / 1024).toFixed(0), 'KB');
