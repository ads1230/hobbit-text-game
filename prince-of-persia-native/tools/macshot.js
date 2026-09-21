// macshot.js — runs the game natively with the Macintosh renderer and writes the Mac page as a PNG:
//   node tools/macshot.js <level> <screen> <bw|color> out.png [frames] [key]
const fs = require('fs'), path = require('path');
const { png } = require('./png.js');
const POP = require('./load.js')();
const ST = POP.state, S = ST.S, T = POP.top, MAC = POP.mac;
const level = parseInt(process.argv[2] || '1', 10), scrn = parseInt(process.argv[3] || '1', 10), mode = process.argv[4] || 'bw', out = process.argv[5] || '/tmp/macshot.png';
const frames = parseInt(process.argv[6] || '30', 10), key = { L: 0x4C, J: 0x4A, I: 0x49, K: 0x4B, '-': 0 }[process.argv[7] || '-'] || 0;
MAC.install(POP.macData); MAC.begin(mode); MAC.setActive(true);
T.events.show = () => {}; T.events.song = () => {};
T.INITSYSTEM(); T.START(level);
if (scrn > 1 || process.argv[3]) {                                  // put the kid on the screen asked for
  const bx = 2, by = 1;
  ST.Kid.Scrn = scrn; ST.Kid.X = ST.u8(ST.getblockej(bx) + 14); ST.Kid.Y = ST.FloorY[by + 1]; ST.Kid.BlockX = bx; ST.Kid.BlockY = by; ST.Kid.Action = 0; ST.Kid.XVel = 0; ST.Kid.YVel = 0; S.cutscrn = scrn;
}
MAC.setGuardColor(POP.macData.guardColor[level][scrn - 1]);
for (let f = 0; f < frames; f++) {
  if (key) { T.input.key = key; T.input.down = true; T.input.strobe = f === 0; }
  T.tick();
}
const { W, H } = MAC.size();
const rgba = new Uint8Array(W * H * 4); MAC.render(rgba, POP.hires.P.PAGE ? 0 : 1);     // the page shown is the one not being drawn
const rgb = Buffer.alloc(W * H * 3);
for (let i = 0, p = 0; i < W * H; i++, p += 3) { rgb[p] = rgba[i * 4]; rgb[p + 1] = rgba[i * 4 + 1]; rgb[p + 2] = rgba[i * 4 + 2]; }
fs.writeFileSync(out, png(W, H, rgb));
// the Apple's own page beside it, for comparison (monochrome, doubled)
if (process.env.APPLE_OUT) {
  const rowbuf = new Uint8Array(40 * 192); POP.hires.rows(POP.hires.P.PAGE ? 0 : 0x20, rowbuf);
  const AW = 560, AH = 384, arg = Buffer.alloc(AW * AH * 3);
  for (let y = 0; y < 192; y++) for (let c = 0; c < 40; c++) { const b = rowbuf[y * 40 + c]; for (let i = 0; i < 7; i++) { const v = (b >> i) & 1 ? 255 : 0; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const q = ((y * 2 + dy) * AW + (c * 7 + i) * 2 + dx) * 3; arg[q] = v; arg[q + 1] = v; arg[q + 2] = v; } } }
  fs.writeFileSync(process.env.APPLE_OUT, png(AW, AH, arg));
}
console.log('wrote', out, W + 'x' + H, 'kid at', ST.Kid.Scrn, ST.Kid.X, ST.Kid.Y, 'unmapped:', Object.keys(MAC.unmapped).join(', ') || 'none');
