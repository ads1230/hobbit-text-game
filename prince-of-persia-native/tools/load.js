// load.js — loads the engine's files into one shared scope, as the page does, and returns POP
const fs = require('fs'), path = require('path'), vm = require('vm');
const FILES = ['pop_hires.js', 'pop_grafix.js', 'pop_state.js', 'pop_bg.js', 'pop_char.js', 'pop_mover.js', 'pop_auto.js', 'pop_sound.js', 'pop_cut.js', 'pop_top.js', 'pop_mac.js'];
module.exports = function load(extra) {
  const dir = path.join(__dirname, '..', 'js');
  let src = 'var POP = {};\n';
  for (const f of FILES) { const p = path.join(dir, f); if (fs.existsSync(p)) src += fs.readFileSync(p, 'utf8').replace(/^var POP = POP \|\| \{\};/m, '') + '\n'; }
  src += 'POP;';
  const sandbox = { console: console, Math: Math, atob: s => Buffer.from(s, 'base64').toString('binary') }; vm.createContext(sandbox);
  const POP = vm.runInContext(src, sandbox, { filename: 'pop.js' });
  // data
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'pop_data.json'), 'utf8'));
  const b64 = s => new Uint8Array(Buffer.from(s, 'base64'));
  const images = {};
  for (const k of Object.keys(data.images)) images[k] = data.images[k].map(([w, h, d]) => ({ w, h, data: b64(d) }));
  POP.data = { images, levels: data.levels.map(b64), seq: b64(data.seq.data), seqLabels: data.seq.labels, framedef: b64(data.framedef.data), FD: data.framedef };
  const picsPath = path.join(__dirname, '..', 'assets', 'pop_pics.json');
  if (fs.existsSync(picsPath)) { const pics = JSON.parse(fs.readFileSync(picsPath, 'utf8')); POP.data.proom = b64(pics.proom); POP.data.pics = pics; }
  const audioPath = path.join(__dirname, '..', 'assets', 'pop_audio.json');
  if (fs.existsSync(audioPath)) {
    const au = JSON.parse(fs.readFileSync(audioPath, 'utf8'));
    POP.audio = { ticks: au.ticks, seconds: { game: {}, title: {} } };
    for (const set of ['game', 'title']) for (const k of Object.keys(au[set])) POP.audio.seconds[set][k] = au[set][k].cycles / au.cpuHz;
  }
  POP.state.loadData(POP.data);
  const macPath = path.join(__dirname, '..', 'assets', 'pop_mac.json');
  if (fs.existsSync(macPath) && POP.mac) POP.macData = JSON.parse(fs.readFileSync(macPath, 'utf8'));
  return POP;
};
