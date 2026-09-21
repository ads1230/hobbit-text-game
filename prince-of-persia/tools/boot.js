// boot.js — boots a disk image in the emulator headlessly, logs what the program asks of the
// ROM, and writes the screen as a PNG.   usage: node tools/boot.js disk.dsk [frames] [out.png] [--trace]
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const Apple2 = require('../js/apple2.js');
const A2Video = require('../js/video.js');

function png(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 3 + 1)] = 0; rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3); }
  const crcTable = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = crcTable[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// the hi-res colour rules (as in the game pages)
function renderHires(rows, mono) {
  const W = 280, H = 192, out = Buffer.alloc(W * H * 3);
  const PAL = { white: [255, 255, 255], violet: [221, 68, 221], green: [40, 200, 60], blue: [40, 150, 240], orange: [240, 120, 40] };
  const bits = new Uint8Array(W + 2), hb = new Uint8Array(W + 2);
  for (let y = 0; y < H; y++) {
    for (let c = 0; c < 40; c++) { const b = rows[y * 40 + c]; for (let i = 0; i < 7; i++) { bits[1 + c * 7 + i] = (b >> i) & 1; hb[1 + c * 7 + i] = b >> 7; } }
    bits[0] = 0; bits[W + 1] = 0;
    for (let x = 0; x < W; x++) {
      const i = x + 1; let col = null;
      if (mono) { if (bits[i]) col = PAL.white; }
      else if (bits[i]) col = (bits[i - 1] || bits[i + 1]) ? PAL.white : ((x & 1) ? (hb[i] ? PAL.orange : PAL.green) : (hb[i] ? PAL.blue : PAL.violet));
      else if (bits[i - 1] && bits[i + 1]) { const xx = x - 1; col = (xx & 1) ? (hb[i] ? PAL.orange : PAL.green) : (hb[i] ? PAL.blue : PAL.violet); }
      const p = (y * W + x) * 3;
      if (col) { out[p] = col[0]; out[p + 1] = col[1]; out[p + 2] = col[2]; }
    }
  }
  return out;
}
function textScreen(m) {
  let s = '';
  for (let r = 0; r < 24; r++) { let line = ''; for (let c = 0; c < 40; c++) { const b = m.main[m.textAddr(r, c)]; let ch = b & 0x7F; if (ch < 0x20) ch += 0x40; line += String.fromCharCode(ch); } s += line + '\n'; }
  return s;
}

if (require.main === module) {
  const args = process.argv.slice(2), trace = args.includes('--trace');
  const files = args.filter(a => /\.(dsk|do|po|nib)$/i.test(a)), frames = parseInt(args.find(a => /^\d+$/.test(a)) || '600', 10), out = args.find(a => /\.png$/i.test(a)) || '/tmp/apple2.png';
  const m = new Apple2(); m.installRom();
  const img = new Uint8Array(fs.readFileSync(files[0]));
  m.disk.insert(0, img, path.basename(files[0]));
  if (files[1]) m.disk.insert(1, new Uint8Array(fs.readFileSync(files[1])), path.basename(files[1]));
  m.log = { text: '' };
  const video = new A2Video(m), rgba = new Uint8ClampedArray(280 * 192 * 4); video.attachBuffer(rgba);
  // watch calls into the ROM area while ROM is selected
  const romCalls = {}, unknown = {};
  const origStep = m.cpu.step.bind(m.cpu);
  let lastPCs = [];
  const keys = args.filter(a => /^--key=/.test(a)).map(a => a.slice(6).split(':')).map(x => [parseInt(x[0], 10), parseInt(x[1], 16)]);   // --key=frame:hex
  const swaps = args.filter(a => /^--swap=/.test(a)).map(a => a.slice(7).split(':')).map(x => [parseInt(x[0], 10), x[1]]);           // --swap=frame:file
  const keyAts = args.filter(a => /^--keyat=/.test(a)).map(a => a.slice(8).split(':')).map(x => ({ pc: parseInt(x[0], 16), key: parseInt(x[1], 16), delay: parseInt(x[2] || '0', 10), done: false })); // --keyat=pc:hex[:frames-delay]
  const swapAts = args.filter(a => /^--swapat=/.test(a)).map(a => a.slice(9).split(':')).map(x => ({ pc: parseInt(x[0], 16), file: x[1], delay: parseInt(x[2] || '0', 10), done: false })); // --swapat=pc:file[:frames-delay]
  const shots = args.filter(a => /^--shot=/.test(a)).map(a => parseInt(a.slice(7), 10));   // --shot=frame (may repeat)
  let releaseAt = -1;
  for (let f = 0; f < frames; f++) {
    swapAts.forEach(k => { if (k.done && k.at !== undefined && k.at === f) { m.disk.insert(0, new Uint8Array(fs.readFileSync(k.file)), path.basename(k.file)); console.log('frame', f, 'inserted', k.file, '(pc hit', k.pc.toString(16) + ')'); k.at = undefined; } });
    keys.forEach(k => { if (k[0] === f) m.keyPress(k[1]); if (k[0] + 3 === f) m.keyRelease(); });
    if (releaseAt === f) m.keyRelease();
    keyAts.forEach(k => { if (k.done && k.at !== undefined && k.at === f) { m.keyPress(k.key); releaseAt = f + 3; console.log('frame', f, 'key', k.key.toString(16), 'pressed (pc hit', k.pc.toString(16) + ')'); k.at = undefined; } });
    swaps.forEach(k => { if (k[0] === f) { m.disk.insert(0, new Uint8Array(fs.readFileSync(k[1])), path.basename(k[1])); console.log('frame', f, 'inserted', k[1]); } });
    const end = m.cpu.cycles + m.frameCycles;
    while (m.cpu.cycles < end) {
      const pc = m.cpu.pc;
      if (pc >= 0xD000 && !m.lcRead) { romCalls[pc] = (romCalls[pc] || 0) + 1; if (!m.hookFlag[pc]) unknown[pc] = (unknown[pc] || 0) + 1; }
      if (trace) { lastPCs.push(pc); if (lastPCs.length > 400) lastPCs.shift(); }
      for (let i = 0; i < keyAts.length; i++) { const k = keyAts[i]; if (!k.done && pc === k.pc) { k.done = true; k.at = f + 1 + k.delay; } }
      for (let i = 0; i < swapAts.length; i++) { const k = swapAts[i]; if (!k.done && pc === k.pc) { k.done = true; k.at = f + 1 + k.delay; } }
      if (pc === 0xB700 && f > 10 && !m._reported) { m._reported = true; console.log('REBOOT to $B700 at frame', f, 'path:', lastPCs.filter((p, i, a) => i === 0 || a[i - 1] !== p).slice(-200).map(p => p.toString(16)).join(' ')); }
      if (pc === 0xC600 && f > 10 && !m._reported2) { m._reported2 = true; console.log('JUMP to $C600 at frame', f, 'path:', lastPCs.filter((p, i, a) => i === 0 || a[i - 1] !== p).slice(-120).map(p => p.toString(16)).join(' ')); }
      m.step();
    }
    if (shots.includes(f) || f === frames - 1) {
      video.render(); const rgb = Buffer.alloc(280 * 192 * 3); for (let i = 0; i < 280 * 192; i++) { rgb[i * 3] = rgba[i * 4]; rgb[i * 3 + 1] = rgba[i * 4 + 1]; rgb[i * 3 + 2] = rgba[i * 4 + 2]; }
      fs.writeFileSync(out.replace('.png', '_' + f + '.png'), png(280, 192, rgb));
      console.log('frame', f, 'shot: pc', m.cpu.pc.toString(16), 'text', m.textMode, 'hires', m.hires, 'page2', m.page2, 'mixed', m.mixed, 'track', m.disk.current().halfTrack / 2, 'motor', m.disk.motor);
    }
  }
  console.log('after', frames, 'frames: pc', m.cpu.pc.toString(16), 'text', m.textMode, 'hires', m.hires, 'page2', m.page2, 'mixed', m.mixed, 'lc', m.lcRead, m.lcBank2, 'altzp', m.altzp, 'ramrd', m.ramrd, 'ramwrt', m.ramwrt, '80store', m.store80);
  console.log('disk: drive', m.disk.drive, 'track', m.disk.current().halfTrack / 2, 'motor', m.disk.motor);
  console.log('ROM entry points hit:', Object.keys(romCalls).map(k => parseInt(k).toString(16) + (m.hookFlag[k] ? '' : '?') + ':' + romCalls[k]).join(' '));
  console.log('unknown ROM addresses:', Object.keys(unknown).map(k => parseInt(k).toString(16)).join(' '));
  console.log('text output:', JSON.stringify(m.log.text.slice(-300)));
  console.log('screen:\n' + textScreen(m));
  if (trace) console.log('last PCs', lastPCs.map(p => p.toString(16)).join(' '));
  fs.writeFileSync('/tmp/apple2_main.bin', Buffer.from(m.main)); fs.writeFileSync('/tmp/apple2_aux.bin', Buffer.from(m.aux));
}
module.exports = { png, renderHires, textScreen };
// dump for offline disassembly when asked
if (require.main === module && process.argv.includes('--dump')) {
  // (re-run quickly is expensive; instead the main run writes /tmp/apple2_main.bin at the end)
}
