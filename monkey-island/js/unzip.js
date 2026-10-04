/* Minimal zip reader: stored and deflated entries, inflated with the browser's DecompressionStream. */
var SCUMM = (function (g) { return g.SCUMM || (g.SCUMM = {}); })(typeof globalThis !== 'undefined' ? globalThis : this);

SCUMM.Unzip = (function () {
  'use strict';
  function le16(b, o) { return b[o] | (b[o + 1] << 8); }
  function le32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function isZip(b) { return b.length > 4 && b[0] === 0x50 && b[1] === 0x4B && b[2] === 3 && b[3] === 4; }
  function list(b) {
    // find the end of central directory record
    var i = b.length - 22, found = -1;
    for (; i >= Math.max(0, b.length - 70000); i--) if (b[i] === 0x50 && b[i + 1] === 0x4B && b[i + 2] === 5 && b[i + 3] === 6) { found = i; break; }
    if (found < 0) throw new Error('zip: no central directory');
    var n = le16(b, found + 10), cd = le32(b, found + 16), p = cd, out = [];
    for (var k = 0; k < n; k++) {
      if (le32(b, p) !== 0x02014b50) throw new Error('zip: bad central directory');
      var method = le16(b, p + 10), csize = le32(b, p + 20), usize = le32(b, p + 24), nlen = le16(b, p + 28), elen = le16(b, p + 30), clen = le16(b, p + 32);
      var lho = le32(b, p + 42), name = '';
      for (var j = 0; j < nlen; j++) name += String.fromCharCode(b[p + 46 + j]);
      try { name = decodeURIComponent(escape(name)); } catch (e) {}
      // local header
      var lnlen = le16(b, lho + 26), lelen = le16(b, lho + 28);
      out.push({ path: name, name: name.split('/').pop(), method: method, compLen: csize, size: usize, offset: lho + 30 + lnlen + lelen });
      p += 46 + nlen + elen + clen;
    }
    return out;
  }
  async function extract(b, e) {
    var data = b.subarray(e.offset, e.offset + e.compLen);
    if (e.method === 0) return data.slice();
    if (e.method !== 8) throw new Error('zip: unsupported compression method ' + e.method);
    if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot inflate zip files; please choose the unpacked files instead');
    var ds = new DecompressionStream('deflate-raw');
    var writer = ds.writable.getWriter(); writer.write(data); writer.close();
    var buf = new Uint8Array(await new Response(ds.readable).arrayBuffer());
    return buf;
  }
  return { isZip: isZip, list: list, extract: extract };
})();
