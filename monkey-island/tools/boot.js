#!/usr/bin/env node
/*
 * Headless boot of the native engine: runs the boot script and N frames of the
 * main loop, writing PNG snapshots. Usage:
 *   node tools/boot.js [--frames N] [--every K] [--out dir] [--trace] [--click x,y@frame ...] [--key code@frame ...]
 * MI_DATA points at the directory holding MONKEY1.000 / MONKEY1.001 / Monkey Island.rsrc.
 */
var fs = require('fs'), path = require('path');
var SCUMM = require('../js/scumm_res.js');
require('../js/scumm_gfx.js'); require('../js/scumm_engine.js'); require('../js/scumm_ops.js');
require('../js/scumm_screen.js'); require('../js/scumm_text.js'); require('../js/scumm_actor.js'); require('../js/scumm_sound.js');
var png = require('./png.js');

var args = process.argv.slice(2), opt = { frames: 300, every: 50, out: path.join(__dirname, '..', 'out'), trace: false, clicks: [], keys: [], boot: 0 };
for (var i = 0; i < args.length; i++) {
  var a = args[i];
  if (a === '--frames') opt.frames = +args[++i];
  else if (a === '--every') opt.every = +args[++i];
  else if (a === '--out') opt.out = args[++i];
  else if (a === '--trace') opt.trace = true;
  else if (a === '--boot') opt.boot = +args[++i];
  else if (a === '--click') { var m = /^(\d+),(\d+)@(\d+)$/.exec(args[++i]); opt.clicks.push({ x: +m[1], y: +m[2], frame: +m[3] }); }
  else if (a === '--key') { m = /^(\d+)@(\d+)$/.exec(args[++i]); opt.keys.push({ ascii: +m[1], frame: +m[2] }); }
}
var dir = process.env.MI_DATA || '.';
var res = new SCUMM.Res(fs.readFileSync(path.join(dir, 'MONKEY1.000')), fs.readFileSync(path.join(dir, 'MONKEY1.001')));
var eng = new SCUMM.Engine(res, { bootParam: opt.boot, log: function (s) { if (opt.trace) console.log(s); }, warn: function (s) { console.log('WARN: ' + s); } });
try { eng.setInstrumentData(fs.readFileSync(path.join(dir, 'Monkey Island.rsrc'))); } catch (e) { console.log('no instruments: ' + e.message); }
eng.traceOps = !!process.env.TRACE_OPS;
eng.sound.player.onStart = function (id, snd) { if (opt.trace) console.log('sound ' + id + (snd.isMusic ? ' (music)' : '') + ' ' + (snd.length / 2000).toFixed(2) + 's' + (snd.loop ? ' loop' : '')); };
fs.mkdirSync(opt.out, { recursive: true });

function snapshot(name) {
  var w = eng.screenWidth, h = eng.screenHeight, rgba = new Uint8Array(w * h * 4);
  for (var i = 0; i < w * h; i++) { var c = eng.rgba[eng.screen[i]]; rgba[i * 4] = c & 0xFF; rgba[i * 4 + 1] = (c >> 8) & 0xFF; rgba[i * 4 + 2] = (c >> 16) & 0xFF; rgba[i * 4 + 3] = 255; }
  fs.writeFileSync(path.join(opt.out, name), png.encode(w, h, rgba));
}

var t0 = Date.now();
eng.runBootscript();
var frame = 0, effectFrames = 0;
for (frame = 1; frame <= opt.frames; frame++) {
  for (i = 0; i < opt.clicks.length; i++) if (opt.clicks[i].frame === frame) { eng.mouseMove(opt.clicks[i].x, opt.clicks[i].y); eng.mouseButton(0, true); }
  for (i = 0; i < opt.keys.length; i++) if (opt.keys[i].frame === frame) eng.keyDown('', opt.keys[i].ascii, false);
  var delta = eng.frameDelta();
  eng.scummLoop(delta);
  for (i = 0; i < opt.clicks.length; i++) if (opt.clicks[i].frame === frame) eng.mouseButton(0, false);
  if (eng.frameQueue.length) { effectFrames += eng.frameQueue.length; eng.frameQueue.length = 0; }
  eng.updatePalette();
  if (frame % opt.every === 0) snapshot('f' + String(frame).padStart(5, '0') + '_r' + eng.currentRoom + '.png');
  if (eng.quitFlag) { console.log('quit at frame ' + frame); break; }
}
snapshot('final_r' + eng.currentRoom + '.png');
console.log('frames ' + (frame - 1) + ', room ' + eng.currentRoom + ', effect frames ' + effectFrames + ', ' + (Date.now() - t0) + ' ms');
var running = [];
for (i = 0; i < eng.slots.length; i++) if (eng.slots[i].status !== 0) running.push(eng.slots[i].number + ':' + eng.slots[i].status);
console.log('scripts: ' + running.join(' '));
