#!/usr/bin/env node
/*
 * Build a single self-contained page with the game data inside it, for keeping
 * on your own devices (the data is Lucasfilm's, so such a page must not be put
 * on a public site).
 *
 *   node tools/build.js "The Secret of Monkey Island.sit" [out.html]
 *   node tools/build.js MONKEY1.000 MONKEY1.001 "Monkey Island.rsrc" [out.html]
 *   node tools/build.js <folder containing the files> [out.html]
 *
 * The output defaults to monkey-island-full.html next to index.html.
 */
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..');
var SCUMM = require(path.join(root, 'js', 'stuffit.js'));

var args = process.argv.slice(2), out = null, inputs = [];
args.forEach(function (a) { if (/\.html?$/i.test(a)) out = a; else inputs.push(a); });
if (!inputs.length) { console.error('usage: node tools/build.js <game.sit | files | folder> [out.html]'); process.exit(1); }
out = out || path.join(root, 'monkey-island-full.html');

var found = {};
function classify(name, isResource) {
  var n = name.toLowerCase().replace(/^.*[\/\\]/, '');
  if (n === 'monkey1.000') return 'index';
  if (n === 'monkey1.001') return 'data';
  if (isResource) return 'rsrc';
  if (/^(\._)?monkey[ _]island(\.rsrc|\.bin)?$/.test(n)) return 'rsrc';
  return null;
}
function take(file) {
  var data = new Uint8Array(fs.readFileSync(file));
  if (SCUMM.StuffIt.isStuffIt5(data)) {
    SCUMM.StuffIt.list(data).forEach(function (e) {
      var kind = classify(e.name, e.isResource);
      if (!kind) return;
      process.stderr.write('unpacking ' + e.name + (e.isResource ? ' (resource fork)' : '') + '\n');
      found[kind] = SCUMM.StuffIt.extract(data, e);
    });
    return;
  }
  var kind = classify(file, false);
  if (kind) found[kind] = data; else process.stderr.write('skipping ' + file + '\n');
}
inputs.forEach(function (inp) {
  if (fs.statSync(inp).isDirectory()) fs.readdirSync(inp).forEach(function (f) { if (!fs.statSync(path.join(inp, f)).isDirectory()) take(path.join(inp, f)); });
  else take(inp);
});
if (!found.index || !found.data) { console.error('MONKEY1.000 and MONKEY1.001 were not found'); process.exit(1); }
if (!found.rsrc) process.stderr.write('note: no "Monkey Island" application found, the page will have no music\n');

var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// inline every script
html = html.replace(/<script src="([^"]+)"><\/script>/g, function (m, src) {
  var js = fs.readFileSync(path.join(root, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  var pre = '';
  if (/app\.js$/.test(src)) {
    pre = '<script>window.MI_EMBEDDED={index:"' + Buffer.from(found.index).toString('base64') + '",data:"' + Buffer.from(found.data).toString('base64') + '"' +
          (found.rsrc ? ',rsrc:"' + Buffer.from(found.rsrc).toString('base64') + '"' : '') + '};</script>\n';
  }
  return pre + '<script>\n' + js + '\n</script>';
});
fs.writeFileSync(out, html);
process.stderr.write('wrote ' + out + ' (' + (fs.statSync(out).size / 1048576).toFixed(1) + ' MB)\n');
