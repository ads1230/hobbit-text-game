// Headless test: loads a tape image, starts the game, sends commands, prints the transcript.
// usage: node play.js <tape> [command ...]
const fs = require('fs');
const vm = require('vm');
const ctx = { console, Math, Date, Uint8Array, Uint8ClampedArray, Array, String, globalThis: null };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../z80.js', 'utf8') + '\nglobalThis.Z80 = Z80;', ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../machine.js', 'utf8'), ctx);
const HobbitMachine = ctx.HobbitMachine;

const tapeFile = process.argv[2];
const cmds = process.argv.slice(3);
const m = new HobbitMachine();
m.setCharset(new Uint8Array(fs.readFileSync(__dirname + '/../charset/CharSetSpectrum8x8.bin')));
const bytes = new Uint8Array(fs.readFileSync(tapeFile));
const info = tapeFile.endsWith('.bin') ? m.loadBinary(bytes) : m.loadTape(bytes);
console.log('version', info.version, 'hooksOK', info.hooksOK, 'entry', info.entry.toString(16), 'warnings', info.warnings);
console.log('addr', Object.fromEntries(Object.entries(info.addr).map(([k, v]) => [k, typeof v === 'number' ? v.toString(16) : v])));

let out = '';
m.onText = (t) => { out += t; };
m.onLower = (t) => { out += '\x1b[2m' + t + '\x1b[0m'; };
m.onPicture = () => { out += '[picture, border ' + m.border + ']\n'; };
m.onEvent = (e) => { out += '[' + e + ']\n'; };
m.onSave = (b) => { fs.writeFileSync('/tmp/hobbit_save.json', JSON.stringify(b)); out += '[saved]\n'; };
m.onLoad = () => fs.existsSync('/tmp/hobbit_save.json') ? JSON.parse(fs.readFileSync('/tmp/hobbit_save.json')) : null;

function runUntilParked(limit) {
  let t = 0;
  while (!m.parked && t < limit) t += m.run(1000000, 0);
  return t;
}
const t0 = Date.now();
let total = runUntilParked(400e6);
console.log('--- start: ' + total + ' T-states, ' + (Date.now() - t0) + ' ms, parked=' + m.parked + ' pc=' + m.cpu.getPC().toString(16));
for (const c of cmds) {
  out += '\n> ' + c + '\n';
  m.type(c);
  const t1 = Date.now();
  total = runUntilParked(400e6);
  out += '   [' + total + ' T, ' + (Date.now() - t1) + ' ms]\n';
}
console.log(out);
if (process.env.DUMPSCR) {
  // ASCII dump of the screen
  let s = '';
  for (let y = 0; y < 192; y += 2) {
    const line = 0x4000 | ((y & 0xc0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2);
    for (let x = 0; x < 32; x++) { const b = m.mem[line + x]; for (let i = 7; i >= 0; i--) s += (b >> i) & 1 ? '#' : ' '; }
    s += '\n';
  }
  console.log(s);
}
