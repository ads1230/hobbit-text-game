// Headless harness: runs the game program with a virtual clock and scripted input, writes PNG screenshots.
var fs = require('fs'), vm = require('vm'), path = require('path'), zlib = require('zlib');
var root = path.join(__dirname, '..');
global.atob = function (b) { return Buffer.from(b, 'base64').toString('binary'); };
global.localStorage = { getItem: function () { return null; }, setItem: function () {} };
global.window = global;
['data.js', 'qd.js', 'engine.js', 'opponents.js', 'flow.js', 'scenes.js'].forEach(function (f) { vm.runInThisContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), { filename: f }); });
var S = SPC.S, F = FLOW;
var tick = 0;
F.setTicker(function () { return tick; }); SCENES.setTicker(function () { return tick; });
SCENES.ui.menuEnable = function () {};
SCENES.ui.dialog = function* () { return null; };
SCENES.ui.nameEntry = function* () { return 'Tester'; };
var sounds = [], playingUntil = 0;
function sampleCount(id) { var b = SPC_DATA.sounds[id]; return b ? Math.floor(b.length * 3 / 4) : 0; }
SPC.sfx.play = function (id, n, d) { sounds.push([tick, id, n, d]); playingUntil = tick + Math.ceil(sampleCount(id) / (22257 * n / d) * 60); };
SPC.sfx.done = function () { return tick >= playingUntil; };
SPC.sfx.stop = function () { playingUntil = 0; };
SPC.sfx.wall = function () { sounds.push([tick, 'wall']); };
SPC.sfx.blocker = function () { sounds.push([tick, 'blocker']); };
SPC.sfx.hit = function () { sounds.push([tick, 'hit']); };
SPC.sfx.oppHit = function () { sounds.push([tick, 'opphit']); };
SPC.sfx.crack = function () { sounds.push([tick, 'crack']); };
SPC.sfx.bigCrack = function () { sounds.push([tick, 'bigcrack']); };
SPC.sfx.crackRate = function () { sounds.push([tick, 'crackrate']); };
SPC.setSeed(12345);
var gen = SCENES.program(), wake = 0, lastLim = -100, waitLim = 0, done = false;
function advance(nTicks) {   // advance the virtual clock by nTicks, running the program
  var end = tick + nTicks;
  while (tick < end && !done) {
    var ran = 0;
    for (;;) {
      if (waitLim) { if (tick - lastLim < waitLim) break; lastLim = tick; waitLim = 0; }
      else if (tick < wake) break;
      var r = gen.next();
      if (r.done) { done = true; break; }
      var v = r.value;
      if (typeof v === 'number') wake = tick + (v > 0 ? v : 1);
      else if (v && v.lim !== undefined) { waitLim = v.lim; if (tick - lastLim >= waitLim) { lastLim = tick; waitLim = 0; wake = tick; } }
      else wake = tick + 1;
      if (++ran > 100000) throw new Error('runaway');
    }
    tick++;
  }
}
function png(bm, file) {
  var w = bm.width, h = bm.height, raw = Buffer.alloc((w + 1) * h);
  for (var y = 0; y < h; y++) { raw[y * (w + 1)] = 0; for (var x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = bm.pix[y * w + x] ? 0 : 255; }
  function chunk(t, d) { var c = Buffer.concat([Buffer.from(t), d]); var crc = zlib.crc32 ? zlib.crc32(c) : crc32(c); var out = Buffer.alloc(8 + d.length + 4); out.writeUInt32BE(d.length, 0); c.copy(out, 4); out.writeUInt32BE(crc >>> 0, 8 + d.length); return out; }
  function crc32(buf) { var c, crc = 0xffffffff; for (var n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
  var ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
module.exports = { advance: advance, png: png, S: S, F: F, SPC: SPC, SCENES: SCENES, sounds: sounds, tickNow: function () { return tick; }, isDone: function () { return done; } };
if (require.main === module) {
  var out = path.join(root, 'shots'); if (!fs.existsSync(out)) fs.mkdirSync(out);
  advance(200); png(SPC.screen, out + '/01_presents.png');
  advance(400); png(SPC.screen, out + '/02_title.png');
  advance(1200); png(SPC.screen, out + '/03_bar.png');
  console.log('opp', S.opp, 'quit', S.quit, 'tick', tick, 'sounds', sounds.length);
  F.pushEvent({ type: 'click', x: 80, y: 220 });   // Skip
  advance(300); png(SPC.screen, out + '/04_table.png');
  console.log('opp', S.opp, 'cmd', F.getCmd(), 'running', S.running, 'score', S.score, S.oscore, 'puck', S.px, S.pz, S.pvx, S.pvz);
  SPC.mouse.x = 256; SPC.mouse.y = 300;
  advance(300); png(SPC.screen, out + '/05_play.png');
  console.log('running', S.running, 'score', S.score, S.oscore, 'puck', S.px, S.pz, S.pvx, S.pvz, 'opp', S.ox, S.oz, 'ai', S.aiState);
  for (var i = 0; i < 20; i++) { advance(120); console.log('t', tick, 'running', S.running, 'score', S.score, S.oscore, 'puck', S.px, S.pz, S.pvx, S.pvz, 'opp', S.ox, S.oz, 'ai', S.aiState, 'pl', S.plx, S.plz); }
  png(SPC.screen, out + '/06_later.png');
  console.log(sounds.slice(0, 30));
}
