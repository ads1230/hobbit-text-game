// compare.js — runs the native engine and the emulator side by side on the same inputs and reports the
// first frame where the shown pages or the game's variables differ.
//   node tools/compare.js [frames] [script]   script: "10:L 40:- 50:I" = from frame 10 hold L, ...
const fs = require('fs');
const POP = require('./load.js')();
const Oracle = require('./oracle.js');
const png = require('./png.js');
const ST = POP.state, S = ST.S, T = POP.top;

const ZP = { timebomb: 0x7d, justblocked: 0x7e, gdtimer: 0x7f, Fimage: 0x82, Fdx: 0x83, Fdy: 0x84, Fcheck: 0x85, exitopen: 0x86, collX: 0x87, lightning: 0x88, lightcolor: 0x89,
  offguard: 0x8a, blockid: 0x8b, blockx: 0x8c, blocky: 0x8d, infrontx: 0x8e, behindx: 0x8f, abovey: 0x90, tempblockx: 0x91, tempblocky: 0x92, tempscrn: 0x93, numtrans: 0x95, tempnt: 0x96,
  redrawflg: 0x97, RNDseed: 0x9e, invert: 0x9f, PlayCount: 0xa0, refract: 0xa1, cutplan: 0xa3, cutscrn: 0xa6, savekidx: 0xaf, mirrx: 0xb0, dmirr: 0xb1, imwidth: 0xb4, imheight: 0xb5,
  leftej: 0xb7, rightej: 0xb8, topej: 0xb9, leftblock: 0xba, rightblock: 0xbb, topblock: 0xbc, bottomblock: 0xbd, CDLeftEj: 0xbe, CDRightEj: 0xbf, endrange: 0xc0, bufindex: 0xc1,
  blockedge: 0xc2, collideL: 0xc3, collideR: 0xc4, weightless: 0xc5, cutorder: 0xc6, AMtimer: 0xc7, begrange: 0xc8, keybufptr: 0xca, VisScrn: 0xcb, OppStrength: 0xcc, jarabove: 0xcd,
  KidStrength: 0xce, ChgKidStr: 0xcf, MaxKidStr: 0xd0, EnemyAlert: 0xd1, ChgOppStr: 0xd2, heroic: 0xd3, clrF: 0xd4, clrB: 0xd5, clrU: 0xd6, clrD: 0xd7, clrbtn: 0xd8, Fsword: 0xd9,
  msgtimer: 0xdb, MaxOppStr: 0xdc, guardprog: 0xdd, ManCtrl: 0xde, mergetimer: 0xdf, lastpotion: 0xe0, origstrength: 0xe1, alertguard: 0xe4, createshad: 0xe5, stunned: 0xe6, droppedout: 0xe7,
  JSTKX: 0x18, JSTKY: 0x19, BTN0: 0x1a, BTN1: 0x1b, SINGSTEP: 0x21, SCRNUM: 0x23, CUTTIMER: 0x28, scrnLeft: 0x31, scrnRight: 0x32, scrnAbove: 0x33, scrnBelow: 0x34, kbdX: 0x39, kbdY: 0x3a, btn: 0x3d };
const P2 = { level: 0x3f4, NextLevel: 0x31c, FrameCount: 0x306, SongCue: 0x319, SongCount: 0x308, message: 0x30b, timerequest: 0x31f, nummob: 0x30d, gotsword: 0x30a, MinLeft: 0x300, SecLeft: 0x302 };
// page 3 layout: MinLeft 300, NextTimeMsg 301, SecLeft 302, BGset1 303, BGset2 304, CHset 305, FrameCount 306-7, SongCount 308, PreRecPtr 309, gotsword 30b?  (checked below against the dump)

function nativeState() {
  const rec = c => ({ posn: c.Posn, x: c.X, y: c.Y, face: c.Face, bx: c.BlockX, by: c.BlockY, action: c.Action, xvel: c.XVel, yvel: c.YVel, seq: c.Seq, scrn: c.Scrn, repeat: c.Repeat, id: c.ID, sword: c.Sword, life: c.Life });
  return { kid: rec(ST.Kid), shad: rec(ST.Shad), char: rec(ST.Char), page: POP.hires.P.PAGE, rnd: POP.grafix.rnd.seed };
}
function diffRec(name, a, b, out) { for (const k of Object.keys(a)) if (a[k] !== b[k]) out.push(`${name}.${k} native=${a[k]} apple=${b[k]}`); }
function diffState(ns, os) {
  const out = [];
  diffRec('kid', ns.kid, os.kid, out); diffRec('shad', ns.shad, os.shad, out);
  if (ns.page !== os.page) out.push(`PAGE native=${ns.page} apple=${os.page}`);
  if (ns.rnd !== os.zp[0x9e]) out.push(`RNDseed native=${ns.rnd} apple=${os.zp[0x9e]}`);
  for (const k of Object.keys(ZP)) { const nv = S[k]; if (nv === undefined || typeof nv !== 'number') continue; if ((nv & 0xFF) !== os.zp[ZP[k]]) out.push(`${k} native=${nv & 0xFF} apple=${os.zp[ZP[k]]}`); }
  return out;
}
function diffPage(a, b) {
  let n = 0; const cols = new Set(), rows = new Set();
  for (let y = 0; y < 192; y++) for (let x = 0; x < 40; x++) if (a[y * 40 + x] !== b[y * 40 + x]) { n++; cols.add(x); rows.add(y); }
  return { n, cols: [...cols].sort((p, q) => p - q), rows: [...rows].sort((p, q) => p - q) };
}
// the native engine, with its shows collected
let shows = [];
T.events.show = (page, kind) => { const rows = new Uint8Array(40 * 192); if (page) POP.hires.rows(page === 1 ? 0 : 0x20, rows); shows.push({ page, kind, rows }); };
T.events.song = song => { console.log('   (song', song, 'plays)'); };
const KEYS = { L: 0x4C, J: 0x4A, I: 0x49, K: 0x4B, U: 0x55, O: 0x4F, '-': 0 };
function parseScript(s) {
  const steps = [];
  for (const tok of (s || '').split(/\s+/).filter(Boolean)) {
    const [f, k, str] = tok.split(':');
    if (k === 'T') { let at = parseInt(f, 10); for (const ch of str) { steps.push({ at: at, key: ch.charCodeAt(0), btn: false }); steps.push({ at: at + 1, key: 0, btn: false }); at += 2; } continue; }
    if (k === 'G') { steps.push({ at: parseInt(f, 10), key: 0, btn: false, level: parseInt(str, 10) }); continue; }
    steps.push({ at: parseInt(f, 10), key: KEYS[k[0]] || 0, btn: k.includes('b') });
  }
  return steps;
}

const frames = parseInt(process.argv[2] || '30', 10), script = parseScript(process.argv[3]);
const o = new Oracle(); const r0 = o.toLevel(1);

T.INITSYSTEM(); T.START(1);
const first = shows[shows.length - 1]; shows = [];
let d = diffPage(first.rows, r0.pages[0].rows);
console.log('first frame: differing bytes', d.n, d.n ? 'cols ' + d.cols.join(',') + ' rows ' + d.rows.slice(0, 12).join(',') : '');
let sd = diffState(nativeState(), r0.state); if (sd.length) console.log('first state diffs:', sd.join(' | '));
let cur = { key: 0, btn: false }, lastLevel = S.level;
for (let f = 0; f < frames; f++) {
  for (const st of script) if (st.at === f) { cur = { key: st.key, btn: st.btn }; if (st.level) { S.NextLevel = st.level; o.m.aux[0x31C] = st.level; o.m.aux[0x7C] = 0x80; } }
  // native input
  if (cur.key !== T.input.key) { T.input.key = cur.key; T.input.strobe = !!cur.key; T.input.down = !!cur.key; }
  T.input.btn0 = cur.btn;
  shows = []; T.tick();
  for (let g = 0; g < 5000 && T.mode() === 'cut'; g++) T.tick();     // the cut scene before a level runs to its end (the Apple's frame covers it too)
  if (T.mode() !== 'game') { console.log(`game over (mode ${T.mode()}) at frame ${f}`); break; }
  const r = o.frame({ key: cur.key, btn: cur.btn });
  const os = r.state, ns = nativeState();
  const ok = [];
  const levelChanged = S.level !== lastLevel; lastLevel = S.level;
  if (levelChanged) {
    console.log(`frame ${f}: level ${S.level} (apple level ${os.level}) — shows not compared; native state resynced to the Apple's (the level load draws from different starting pages)`);
    const rec = (c, b) => { c.Posn = os.zp[b]; c.X = os.zp[b + 1]; c.Y = os.zp[b + 2]; c.Face = os.zp[b + 3]; c.BlockX = os.zp[b + 4]; c.BlockY = os.zp[b + 5]; c.Action = os.zp[b + 6]; c.XVel = os.zp[b + 7]; c.YVel = os.zp[b + 8]; c.Seq = os.zp[b + 9] | os.zp[b + 10] << 8; c.Scrn = os.zp[b + 11]; c.Repeat = os.zp[b + 12]; c.ID = os.zp[b + 13]; c.Sword = os.zp[b + 14]; c.Life = os.zp[b + 15]; };
    rec(ST.Shad, 0x60); rec(ST.Kid, 0x50); rec(ST.Char, 0x40);
    POP.grafix.rnd.seed = os.zp[0x9e];
    for (const k of Object.keys(ZP)) if (typeof S[k] === 'number') S[k] = os.zp[ZP[k]];
    const aux = o.m.aux;
    ST.blue.set(aux.subarray(0xB700, 0xB700 + 2304));
    S.trloc.set(aux.subarray(0xB600, 0xB620)); S.trscrn.set(aux.subarray(0xB620, 0xB640)); S.trdirec.set(aux.subarray(0xB640, 0xB660));
    S.mobx.set(aux.subarray(0xB660, 0xB670)); S.moby.set(aux.subarray(0xB670, 0xB680)); S.mobscrn.set(aux.subarray(0xB680, 0xB690)); S.mobvel.set(aux.subarray(0xB690, 0xB6A0)); S.mobtype.set(aux.subarray(0xB6A0, 0xB6B0)); S.moblevel.set(aux.subarray(0xB6B0, 0xB6C0));
    S.trobcount = aux[0xB6E0];
    POP.hires.mem.set(o.m.main.subarray(0x2000, 0x6000));            // both hi-res pages as the Apple has them
    S.FrameCount = os.p2[0x106] | os.p2[0x107] << 8; S.NextTimeMsg = os.p2[0x101]; S.MinLeft = os.p2[0x100]; S.SecLeft = os.p2[0x102];
  }
  else if (shows.length !== r.pages.length) ok.push(`shows native=${shows.map(s => s.kind + s.page).join(',')} apple=${r.pages.map(p => p.page + '@' + p.pc.toString(16)).join(',')}`);
  const n = Math.min(shows.length, r.pages.length);
  for (let i = 0; i < n && !levelChanged; i++) {
    if (shows[i].kind !== 'flip') continue;
    if (shows[i].page !== r.pages[i].page) { ok.push(`page order native=${shows[i].page} apple=${r.pages[i].page}`); continue; }
    const pd = diffPage(shows[i].rows, r.pages[i].rows);
    if (pd.n) { ok.push(`page ${shows[i].page}: ${pd.n} bytes differ, cols ${pd.cols.join(',')} rows ${pd.rows.slice(0, 16).join(',')}${pd.rows.length > 16 ? '...' : ''}`); png.save(`/tmp/cmp_f${f}_native.png`, shows[i].rows); png.save(`/tmp/cmp_f${f}_apple.png`, r.pages[i].rows); }
  }
  const sdiff = levelChanged ? [] : diffState(ns, os);
  const line = `frame ${f} key=${cur.key.toString(16)} kid=${JSON.stringify(ns.kid)}`;
  if (process.env.TRACE && f >= parseInt(process.env.TRACE, 10)) console.log(`  trace f${f}: native EA=${S.EnemyAlert} ag=${S.alertguard} clrF=${S.clrF} clrD=${S.clrD} shad=${ns.shad.posn}/${ns.shad.x}/${ns.shad.scrn}/${ns.shad.sword} kid=${ns.kid.posn}/${ns.kid.x}/${ns.kid.scrn} | apple EA=${os.zp[0xd1]} ag=${os.zp[0xe4]} clrF=${os.zp[0xd4]} clrD=${os.zp[0xd7]} shad=${os.shad.posn}/${os.shad.x}/${os.shad.scrn}/${os.shad.sword} kid=${os.kid.posn}/${os.kid.x}/${os.kid.scrn}`);
  if (ok.length || sdiff.length) { console.log(line); ok.forEach(x => console.log('  ', x)); if (sdiff.length) console.log('   state:', sdiff.join(' | ')); if (process.argv[4] !== 'go') break; }
  else if (f % 10 === 0) console.log(line, 'OK');
}
