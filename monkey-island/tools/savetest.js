var fs = require('fs'), path = require('path');
var SCUMM = require('../js/scumm_res.js');
['gfx', 'engine', 'ops', 'screen', 'text', 'actor', 'sound', 'save'].forEach(function (m) { require('../js/scumm_' + m + '.js'); });
var png = require('./png.js');
var dir = process.env.MI_DATA || '.';
var res = new SCUMM.Res(fs.readFileSync(path.join(dir, 'MONKEY1.000')), fs.readFileSync(path.join(dir, 'MONKEY1.001')));
function mk() { var e = new SCUMM.Engine(res, { bootParam: +process.argv[2] || 0, warn: function (s) { console.log('WARN ' + s); } }); return e; }
function snap(eng, name) {
  var w = 320, h = 200, rgba = new Uint8Array(w * h * 4);
  for (var i = 0; i < w * h; i++) { var c = eng.rgba[eng.screen[i]]; rgba[i * 4] = c & 255; rgba[i * 4 + 1] = (c >> 8) & 255; rgba[i * 4 + 2] = (c >> 16) & 255; rgba[i * 4 + 3] = 255; }
  fs.writeFileSync('out/' + name, png.encode(w, h, rgba));
}
var e1 = mk(); e1.runBootscript();
var N = +process.argv[3] || 2100;
for (var f = 0; f < N; f++) { e1.scummLoop(e1.frameDelta()); e1.frameQueue.length = 0; }
e1.updatePalette(); snap(e1, 'save_before.png');
var st = e1.saveState('test');
var json = JSON.stringify(st, function (k, v) { return v && v.buffer ? Array.from(v) : v; });
console.log('state size (json) ' + json.length + ', room ' + st.room);
var st2 = JSON.parse(json);
var e2 = mk();
e2.loadState(st2);
for (f = 0; f < 3; f++) { e2.scummLoop(e2.frameDelta()); e2.frameQueue.length = 0; }
e2.updatePalette(); snap(e2, 'save_after.png');
for (f = 0; f < 200; f++) { e2.scummLoop(e2.frameDelta()); e2.frameQueue.length = 0; }
e2.updatePalette(); snap(e2, 'save_after200.png');
// compare screens of e1 after same number of frames
for (f = 0; f < 203; f++) { e1.scummLoop(e1.frameDelta()); e1.frameQueue.length = 0; }
e1.updatePalette();
var diff = 0; for (var i = 0; i < 64000; i++) if (e1.screen[i] !== e2.screen[i]) diff++;
console.log('pixels differing after 203 frames: ' + diff);
snap(e1, 'save_e1_203.png');
