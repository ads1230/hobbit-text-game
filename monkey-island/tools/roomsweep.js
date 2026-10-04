// Boot into every room (via the boot parameter) and run a few hundred frames, reporting errors.
var fs = require('fs'), path = require('path');
var SCUMM = require('../js/scumm_res.js');
['gfx', 'engine', 'ops', 'screen', 'text', 'actor', 'sound', 'save'].forEach(function (m) { require('../js/scumm_' + m + '.js'); });
var dir = process.env.MI_DATA || '.';
var res = new SCUMM.Res(fs.readFileSync(path.join(dir, 'MONKEY1.000')), fs.readFileSync(path.join(dir, 'MONKEY1.001')));
var frames = +process.argv[2] || 400, bad = 0;
for (var room = 1; room < 100; room++) {
  if (res.roomOffset(room) < 0) continue;
  var warnings = [];
  var e = new SCUMM.Engine(res, { bootParam: room, warn: function (s) { warnings.push(s); } });
  try {
    e.runBootscript();
    for (var f = 0; f < frames; f++) {
      e.scummLoop(e.frameDelta()); e.frameQueue.length = 0;
      // poke around: click somewhere in the scene every 50 frames
      if (f % 50 === 25) { e.mouseMove(40 + (f * 7) % 240, 60 + (f * 3) % 60); e.mouseButton(0, true); e.mouseButton(0, false); }
      if (f % 97 === 50) { e.mouseButton(1, true); e.mouseButton(1, false); }
    }
    console.log('room ' + room + ' (' + (res.roomNames[room] || '?') + ') -> ' + e.currentRoom + ' ok' + (warnings.length ? ' warnings: ' + warnings.slice(0, 3).join(' | ') : ''));
  } catch (err) {
    bad++;
    console.log('room ' + room + ' (' + (res.roomNames[room] || '?') + ') ERROR: ' + err.message + '\n   ' + (err.stack || '').split('\n').slice(1, 4).join('\n   '));
  }
}
console.log('errors: ' + bad);
