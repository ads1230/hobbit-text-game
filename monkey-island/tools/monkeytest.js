// Random-input stress test: boot normally, then click around at random for many frames; report exceptions.
var fs = require('fs'), path = require('path');
var SCUMM = require('../js/scumm_res.js');
['gfx', 'engine', 'ops', 'screen', 'text', 'actor', 'sound', 'save'].forEach(function (m) { require('../js/scumm_' + m + '.js'); });
var dir = process.env.MI_DATA || '.';
var res = new SCUMM.Res(fs.readFileSync(path.join(dir, 'MONKEY1.000')), fs.readFileSync(path.join(dir, 'MONKEY1.001')));
var seed = +process.argv[2] || 1, frames = +process.argv[3] || 20000, boot = +process.argv[4] || 0;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF; return seed / 0x7FFFFFFF; }
var warnings = {};
var e = new SCUMM.Engine(res, { bootParam: boot, warn: function (s) { warnings[s] = (warnings[s] || 0) + 1; } });
var rooms = {};
try {
  e.runBootscript();
  for (var f = 0; f < frames; f++) {
    e.scummLoop(e.frameDelta()); e.frameQueue.length = 0;
    rooms[e.currentRoom] = true;
    var r = rnd();
    if (r < 0.03) { e.mouseMove((rnd() * 320) | 0, (rnd() * 200) | 0); e.mouseButton(rnd() < 0.8 ? 0 : 1, true); e.mouseButton(0, false); e.mouseButton(1, false); }
    else if (r < 0.035) e.keyDown('Escape', 27, false);
    else if (r < 0.04) e.keyDown('.', 46, false);
    else if (r < 0.042) e.mouseMove((rnd() * 320) | 0, (rnd() * 200) | 0);
    if (f % 5000 === 0 && f) { var st = e.saveState('x'); e.loadState(JSON.parse(JSON.stringify(st, function (k, v) { return v && v.buffer ? Array.from(v) : v; }))); }
  }
  console.log('seed ' + seed + ': ok, rooms visited: ' + Object.keys(rooms).join(','));
} catch (err) {
  console.log('seed ' + seed + ' frame ' + f + ' room ' + e.currentRoom + ' ERROR: ' + err.message + '\n   ' + (err.stack || '').split('\n').slice(1, 5).join('\n   '));
}
var w = Object.keys(warnings); if (w.length) console.log('warnings: ' + w.map(function (k) { return k + ' x' + warnings[k]; }).join(' | '));
