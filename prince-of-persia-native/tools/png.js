// png.js — writes a 40x192-byte hi-res page (top line first) as a PNG with the NTSC colour rules
const zlib = require('zlib'), fs = require('fs');
function png(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 3 + 1)] = 0; rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3); }
  const crcTable = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = crcTable[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function renderHires(rows) {
  const W = 280, H = 192, out = Buffer.alloc(W * H * 3);
  const PAL = { white: [255, 255, 255], violet: [221, 68, 221], green: [40, 200, 60], blue: [40, 150, 240], orange: [240, 120, 40] };
  const bits = new Uint8Array(W + 2), hb = new Uint8Array(W + 2);
  for (let y = 0; y < H; y++) {
    for (let c = 0; c < 40; c++) { const b = rows[y * 40 + c]; for (let i = 0; i < 7; i++) { bits[1 + c * 7 + i] = (b >> i) & 1; hb[1 + c * 7 + i] = b >> 7; } }
    bits[0] = 0; bits[W + 1] = 0;
    for (let x = 0; x < W; x++) {
      const i = x + 1; let col = null;
      if (bits[i]) col = (bits[i - 1] || bits[i + 1]) ? PAL.white : ((x & 1) ? (hb[i] ? PAL.orange : PAL.green) : (hb[i] ? PAL.blue : PAL.violet));
      else if (bits[i - 1] && bits[i + 1]) { const xx = x - 1; col = (xx & 1) ? (hb[i] ? PAL.orange : PAL.green) : (hb[i] ? PAL.blue : PAL.violet); }
      const p = (y * W + x) * 3;
      if (col) { out[p] = col[0]; out[p + 1] = col[1]; out[p + 2] = col[2]; }
    }
  }
  return out;
}
function save(path, rows) { fs.writeFileSync(path, png(280, 192, renderHires(rows))); }
module.exports = { png, renderHires, save };
