// dhgr.js — renders an Apple II double hi-res page (main + aux 8K) to a PNG: 140 colour cells of 4 bits
// per line (aux byte first, then main, 7 bits each; the bits stream least-significant first).
const fs = require('fs'), { png } = require('./png.js');
// the 16 colours, indexed by the 4-bit pattern as it appears on the wire (bit order as streamed)
const PAL = [[0, 0, 0], [227, 30, 96], [96, 78, 189], [255, 68, 253], [0, 163, 96], [156, 156, 156], [20, 207, 253], [208, 195, 255],
  [96, 114, 3], [255, 106, 60], [156, 156, 156], [255, 160, 208], [20, 245, 60], [208, 221, 141], [114, 255, 208], [255, 255, 255]];
function lineOffset(y) { return (y & 7) * 0x400 + ((y >> 3) & 7) * 0x80 + (y >> 6) * 0x28; }
// returns a 560-bit array per line
function bitsOf(main, aux, y) {
  const off = lineOffset(y), bits = new Uint8Array(560); let p = 0;
  for (let c = 0; c < 40; c++) {
    const a = aux[off + c], m = main[off + c];
    for (let i = 0; i < 7; i++) bits[p++] = (a >> i) & 1;
    for (let i = 0; i < 7; i++) bits[p++] = (m >> i) & 1;
  }
  return bits;
}
// colour of pixel x: the 4 bits of the cell it falls in, rotated by the phase (x mod 4)
function render(main, aux, width) {
  const W = width || 560, rgb = Buffer.alloc(W * 192 * 3);
  for (let y = 0; y < 192; y++) {
    const bits = bitsOf(main, aux, y);
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(x * 560 / W);
      // the 4-bit window ending at sx, aligned to the colour phase: value = bits[k..k+3] with k = sx - (sx & 3)
      const k = sx - (sx & 3);
      let v = 0; for (let i = 0; i < 4; i++) v |= (bits[k + i] || 0) << i;
      // colour phase: bit i of the cell corresponds to phase (k+i) mod 4; the palette index is the pattern rotated so that phase 0 is bit 0
      const rot = k & 3, idx = ((v << rot) | (v >> (4 - rot))) & 15;
      const c = PAL[idx], p = (y * W + x) * 3; rgb[p] = c[0]; rgb[p + 1] = c[1]; rgb[p + 2] = c[2];
    }
  }
  return rgb;
}
function save(path, main, aux, width) { const W = width || 560; fs.writeFileSync(path, png(W, 192, render(main, aux, W))); }
module.exports = { render, save, PAL };
if (require.main === module) {
  const base = process.argv[2];
  save(process.argv[3] || base + '.png', fs.readFileSync(base + '.main'), fs.readFileSync(base + '.aux'), parseInt(process.argv[4] || '560', 10));
}
