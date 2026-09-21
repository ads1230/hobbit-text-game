// frametime.js — how long the Apple takes per frame, as a function of what the frame draws.  Runs the
// native engine and the emulator on the same inputs, records the Apple's cycles per main-loop pass and
// the native drawing counters, and fits cycles = base + sum(weight * bytes) by least squares.  The
// weights go into the page (frameMs), so its frame rate rises and falls as the Apple's did.
//   node tools/frametime.js [frames] [script]
const POP = require('./load.js')();
const Oracle = require('./oracle.js');
const resync = require('./sync.js');
const ST = POP.state, S = ST.S, T = POP.top, W = POP.hires.work;
const KEYS = { L: 0x4C, J: 0x4A, I: 0x49, K: 0x4B, U: 0x55, O: 0x4F, '-': 0 };
function parseScript(s) {
  const steps = [];
  for (const tok of (s || '').split(/\s+/).filter(Boolean)) {
    const [f, k, str] = tok.split(':');
    if (k === 'G') { steps.push({ at: parseInt(f, 10), key: 0, btn: false, level: parseInt(str, 10) }); continue; }
    steps.push({ at: parseInt(f, 10), key: KEYS[k[0]] || 0, btn: k.includes('b') });
  }
  return steps;
}
const frames = parseInt(process.argv[2] || '300', 10), script = parseScript(process.argv[3] || '');
const o = new Oracle(); o.toLevel(1);
T.events.show = () => { }; let songThisFrame = false; T.events.song = () => { songThisFrame = true; };
T.INITSYSTEM(); T.START(1);
const KEYSN = Object.keys(W), rows = [];
let cur = { key: 0, btn: false }, lastLevel = S.level;
for (let f = 0; f < frames; f++) {
  for (const st of script) if (st.at === f) { cur = { key: st.key, btn: st.btn }; if (st.level) { S.NextLevel = st.level; o.m.aux[0x31C] = st.level; o.m.aux[0x7C] = 0x80; } }
  if (cur.key !== T.input.key) { T.input.key = cur.key; T.input.strobe = !!cur.key; T.input.down = !!cur.key; }
  T.input.btn0 = cur.btn;
  for (const k of KEYSN) W[k] = 0;
  songThisFrame = false;
  T.tick();
  for (let g = 0; g < 5000 && T.mode() === 'cut'; g++) T.tick();     // the cut scene before a level, to its end
  if (T.mode() !== 'game') break;
  const c0 = o.m.cpu.cycles; const r = o.frame({ key: cur.key, btn: cur.btn }); const cycles = o.m.cpu.cycles - c0;
  const levelChanged = S.level !== lastLevel; lastLevel = S.level;
  if (levelChanged) { resync(POP, o, r.state); continue; }         // (the cut scene's time is not the game's)
  if (!songThisFrame) rows.push({ f, cycles, w: KEYSN.map(k => W[k]) });
}
console.log(rows.length, 'frames measured');
// least squares: X = [1, w...], y = cycles
const n = KEYSN.length + 1, A = Array.from({ length: n }, () => new Float64Array(n)), b = new Float64Array(n);
for (const r of rows) { const x = [1, ...r.w]; for (let i = 0; i < n; i++) { b[i] += x[i] * r.cycles; for (let j = 0; j < n; j++) A[i][j] += x[i] * x[j]; } }
// drop columns that never vary (all zero)
const used = [0]; for (let i = 1; i < n; i++) if (rows.some(r => r.w[i - 1] > 0)) used.push(i);
const m = used.length, M = used.map(i => used.map(j => A[i][j])), v = used.map(i => b[i]);
for (let i = 0; i < m; i++) M[i][i] += 1e-6;                        // ridge, for stability
for (let c = 0; c < m; c++) {                                         // gaussian elimination
  let p = c; for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
  [M[c], M[p]] = [M[p], M[c]]; [v[c], v[p]] = [v[p], v[c]];
  for (let r = 0; r < m; r++) { if (r === c) continue; const k = M[r][c] / M[c][c]; for (let j = c; j < m; j++) M[r][j] -= k * M[c][j]; v[r] -= k * v[c]; }
}
const sol = new Float64Array(n); used.forEach((i, k) => { sol[i] = v[k] / M[k][k]; });
console.log('base cycles', sol[0].toFixed(0), '(' + (sol[0] / 1020.484).toFixed(1) + ' ms)');
KEYSN.forEach((k, i) => console.log('  ' + k.padEnd(6), 'cycles/byte', sol[i + 1].toFixed(1), 'used in', rows.filter(r => r.w[i] > 0).length, 'frames'));
let err = 0, worst = null;
for (const r of rows) { let p = sol[0]; r.w.forEach((x, i) => p += x * sol[i + 1]); const e = p - r.cycles; err += e * e; if (!worst || Math.abs(e) > Math.abs(worst.e)) worst = { f: r.f, e, p, c: r.cycles }; }
console.log('rms error', (Math.sqrt(err / rows.length) / 1020.484).toFixed(1), 'ms; worst frame', worst.f, 'predicted', (worst.p / 1020.484).toFixed(1), 'actual', (worst.c / 1020.484).toFixed(1));
const ms = rows.map(r => r.cycles / 1020.484).sort((a, b) => a - b);
console.log('actual frame ms: min', ms[0].toFixed(1), 'median', ms[ms.length >> 1].toFixed(1), 'max', ms[ms.length - 1].toFixed(1));
if (process.env.DUMP) for (const r of rows) if (r.cycles / 1020.484 > parseFloat(process.env.DUMP)) console.log('  frame', r.f, (r.cycles / 1020.484).toFixed(1), 'ms', KEYSN.map((k, i) => k + '=' + r.w[i]).join(' '));
if (process.env.ROWS) require('fs').writeFileSync(process.env.ROWS, JSON.stringify({ keys: KEYSN, rows }));
