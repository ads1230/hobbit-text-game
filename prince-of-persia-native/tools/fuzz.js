// fuzz.js — random play on both engines: node tools/fuzz.js [seed] [frames] [runs]
let POP = require('./load.js')();
const Oracle = require('./oracle.js');
const png = require('./png.js');
let ST = POP.state, S = ST.S, T = POP.top;
const ZP = require('./compare_zp.js');
const resync = require('./sync.js');

function nativeState() {
  const rec = c => ({ posn: c.Posn, x: c.X, y: c.Y, face: c.Face, bx: c.BlockX, by: c.BlockY, action: c.Action, xvel: c.XVel, yvel: c.YVel, seq: c.Seq, scrn: c.Scrn, repeat: c.Repeat, id: c.ID, sword: c.Sword, life: c.Life });
  return { kid: rec(ST.Kid), shad: rec(ST.Shad), page: POP.hires.P.PAGE, rnd: POP.grafix.rnd.seed };
}
function diffRec(name, a, b, out) { for (const k of Object.keys(a)) if (a[k] !== b[k]) out.push(`${name}.${k} native=${a[k]} apple=${b[k]}`); }
function diffState(ns, os) {
  const out = [];
  diffRec('kid', ns.kid, os.kid, out); diffRec('shad', ns.shad, os.shad, out);
  if (ns.page !== os.page) out.push(`PAGE native=${ns.page} apple=${os.page}`);
  if (ns.rnd !== os.zp[0x9e]) out.push(`RNDseed native=${ns.rnd} apple=${os.zp[0x9e]}`);
  for (const k of Object.keys(ZP)) { const nv = S[k]; if (typeof nv !== 'number') continue; if ((nv & 0xFF) !== os.zp[ZP[k]]) out.push(`${k} native=${nv & 0xFF} apple=${os.zp[ZP[k]]}`); }
  return out;
}
function diffPage(a, b) { let n = 0; const cols = new Set(), rows = new Set(); for (let y = 0; y < 192; y++) for (let x = 0; x < 40; x++) if (a[y * 40 + x] !== b[y * 40 + x]) { n++; cols.add(x); rows.add(y); } return { n, cols: [...cols].sort((p, q) => p - q), rows: [...rows].sort((p, q) => p - q) }; }
let shows = [];
function fresh() { POP = require('./load.js')(); ST = POP.state; S = ST.S; T = POP.top; T.events.show = (page, kind) => { const rows = new Uint8Array(40 * 192); if (page) POP.hires.rows(page === 1 ? 0 : 0x20, rows); shows.push({ page, kind, rows }); }; }
const KEYS = [0, 0, 0x4C, 0x4C, 0x4A, 0x4A, 0x49, 0x4B, 0x55, 0x4F];
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

const seed0 = parseInt(process.argv[2] || '1', 10), frames = parseInt(process.argv[3] || '1500', 10), runs = parseInt(process.argv[4] || '1', 10), level = parseInt(process.argv[5] || '1', 10), warp = process.argv[6] === 'warp';
for (let run = 0; run < runs; run++) {
  const seed = seed0 + run, R = rng(seed);
  const o = new Oracle(); const r0 = o.toLevel(1);
  fresh(); T.INITSYSTEM(); T.START(1); shows = [];
  let cur = { key: 0, btn: false }, hold = 0, log = [], failed = false, lastLevel = 1;
  const typed = []; if (level > 1) { for (let w = 0; w < 10; w++) typed.push(0); }
  for (let f = 0; f < frames; f++) {
    if (f === 5 && level > 1) { S.NextLevel = level; o.m.aux[0x31C] = level; o.m.aux[0x7C] = 0x80; }
    if (f === 40 && warp) {                                            // teleport the kid to another screen, in both
      const nscr = ST.blue[ST.INFO] - 1, scrn = 1 + Math.floor(R() * nscr), bx = 1 + Math.floor(R() * 8), by = Math.floor(R() * 3);
      const x = ST.u8(ST.getblockej(bx) + 14), y = ST.FloorY[by + 1];
      const put = (set) => { set('Scrn', scrn); set('X', x); set('Y', y); set('BlockX', bx); set('BlockY', by); set('Action', 0); set('XVel', 0); set('YVel', 0); };
      put((k, v) => { ST.Kid[k] = v; }); S.cutscrn = scrn;
      const OFF = { Scrn: 11, X: 1, Y: 2, BlockX: 4, BlockY: 5, Action: 6, XVel: 7, YVel: 8 };
      put((k, v) => { o.m.aux[0x50 + OFF[k]] = v; }); o.m.aux[0xA6] = scrn;
      log.push(`warp:${scrn}/${bx},${by}`);
    }
    if (f < typed.length) { cur = { key: typed[f], btn: false }; }
    else if (hold-- <= 0) { cur = { key: KEYS[Math.floor(R() * KEYS.length)], btn: R() < 0.3 }; hold = Math.floor(R() * 40); log.push(`${f}:${cur.key.toString(16)}${cur.btn ? 'b' : ''}`); }
    if (cur.key !== T.input.key) { T.input.key = cur.key; T.input.strobe = !!cur.key; T.input.down = !!cur.key; }
    T.input.btn0 = cur.btn;
    shows = []; T.tick();
    for (let g = 0; g < 5000 && T.mode() === 'cut'; g++) T.tick();   // the cut scene before a level runs to its end (the Apple's frame covers it too)
    if (T.mode() !== 'game') { console.log(`seed ${seed}: game over (mode ${T.mode()}) at frame ${f}`); break; }
    const r = o.frame({ key: cur.key, btn: cur.btn });
    const os = r.state, ns = nativeState(), bad = [];
    if (S.level !== lastLevel) { lastLevel = S.level; resync(POP, o, os); continue; }
    if (shows.length !== r.pages.length) bad.push(`shows native=${shows.map(s => s.kind + s.page).join(',')} apple=${r.pages.map(p => p.page + '@' + p.pc.toString(16)).join(',')}`);
    const n = Math.min(shows.length, r.pages.length);
    for (let i = 0; i < n; i++) {
      if (shows[i].kind !== 'flip') continue;
      if (shows[i].page !== r.pages[i].page) { bad.push(`page order native=${shows[i].page} apple=${r.pages[i].page}`); continue; }
      const pd = diffPage(shows[i].rows, r.pages[i].rows);
      if (pd.n) { bad.push(`page ${shows[i].page}: ${pd.n} bytes differ, cols ${pd.cols.join(',')} rows ${pd.rows.slice(0, 16).join(',')}`); png.save(`/tmp/fz_native.png`, shows[i].rows); png.save(`/tmp/fz_apple.png`, r.pages[i].rows); }
    }
    const sd = diffState(ns, os);
    if (bad.length || sd.length) {
      console.log(`seed ${seed} frame ${f} key=${cur.key.toString(16)}${cur.btn ? 'b' : ''} kid=${JSON.stringify(ns.kid)} level=${S.level} vis=${S.VisScrn}`);
      bad.forEach(x => console.log('  ', x)); if (sd.length) console.log('   state:', sd.join(' | '));
      console.log('   inputs:', log.slice(-12).join(' '));
      failed = true; break;
    }
  }
  if (!failed) console.log(`seed ${seed}: ${frames} frames OK, level ${S.level} screen ${S.VisScrn} kid ${JSON.stringify(nativeState().kid)}`);
}
