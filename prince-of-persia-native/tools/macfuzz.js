// macfuzz.js — random play with the Macintosh renderer on: every level, the kid warped to random screens and
// given random keys; reports exceptions, shapes the renderer could not find, and dumps a frame now and then.
//   node tools/macfuzz.js <bw|color> [frames per level] [outdir]
const fs = require('fs'), { png } = require('./png.js');
const POP = require('./load.js')();
const ST = POP.state, S = ST.S, T = POP.top, MAC = POP.mac, HR = POP.hires;
const mode = process.argv[2] || 'color', frames = +(process.argv[3] || 600), out = process.argv[4];
MAC.install(POP.macData); MAC.begin(mode); MAC.setActive(true);
T.events.show = () => {}; T.events.song = () => {};
T.INITSYSTEM();
const KEYS = [0, 0, 0x4C, 0x4C, 0x4A, 0x4A, 0x49, 0x4B, 0x55, 0x4F];
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const { W, H } = MAC.size();
function dump(name) { const rgba = new Uint8Array(W * H * 4); MAC.render(rgba, HR.P.PAGE ? 0 : 1); const rgb = Buffer.alloc(W * H * 3); for (let i = 0, p = 0; i < W * H; i++, p += 3) { rgb[p] = rgba[i*4]; rgb[p+1] = rgba[i*4+1]; rgb[p+2] = rgba[i*4+2]; } fs.writeFileSync(name, png(W, H, rgb)); }
let problems = 0;
for (let level = 1; level <= 14; level++) {
  const R = rng(level * 7919);
  T.runJumps(() => T.START(level));
  let hold = 0, cur = 0, btn = false, warps = 0;
  for (let f = 0; f < frames; f++) {
    if (f % 150 === 20) {                                               // a warp to another screen
      const nscr = ST.blue[ST.INFO] - 1, scrn = 1 + Math.floor(R() * nscr), bx = 1 + Math.floor(R() * 8), by = Math.floor(R() * 3);
      ST.Kid.Scrn = scrn; ST.Kid.X = ST.u8(ST.getblockej(bx) + 14); ST.Kid.Y = ST.FloorY[by + 1]; ST.Kid.BlockX = bx; ST.Kid.BlockY = by; ST.Kid.Action = 0; ST.Kid.XVel = 0; ST.Kid.YVel = 0; S.cutscrn = scrn; warps++;
    }
    if (hold-- <= 0) { cur = KEYS[Math.floor(R() * KEYS.length)]; btn = R() < 0.3; hold = 3 + Math.floor(R() * 20); }
    T.input.key = cur; T.input.down = cur !== 0; T.input.strobe = hold === 3 + 0 || R() < 0.2; T.input.btn0 = btn;
    try { T.runJumps(() => T.tick()); } catch (e) { console.log('level', level, 'frame', f, 'threw', e.stack.split('\n').slice(0, 3).join(' | ')); problems++; break; }
    if (T.mode() !== 'game') { console.log('level', level, 'frame', f, 'mode', T.mode(), '(restarting)'); T.runJumps(() => T.START(level)); }
    if (out && f % 200 === 199) dump(`${out}/f${level}-${f + 1}.png`);
  }
  console.log('level', level, 'done; unmapped so far:', Object.keys(MAC.unmapped).join(',') || 'none');
}
console.log(problems ? problems + ' problems' : 'no exceptions');
