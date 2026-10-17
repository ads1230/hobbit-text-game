#!/usr/bin/env python3
"""Stamps index.html's script tags with a hash of each script (so a changed script is fetched
afresh wherever the page is cached), then builds shufflepuck.html: index.html with the scripts
(and the game's data) inlined, so the one file stands on its own and can be opened from disk."""
import hashlib, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'index.html'), encoding='utf-8').read()
def stamp(m):
    h = hashlib.sha1(open(os.path.join(here, m.group(1)), 'rb').read()).hexdigest()[:8]
    return '<script src="%s?v=%s"></script>' % (m.group(1), h)
stamped, n = re.subn(r'<script src="([^"?]+)(?:\?v=[0-9a-f]+)?"></script>', stamp, src)
assert n == 7, 'expected the seven scripts of index.html, found %d' % n
if stamped != src: open(os.path.join(here, 'index.html'), 'w', encoding='utf-8').write(stamped)
def inline(m):
    js = open(os.path.join(here, m.group(1)), encoding='utf-8').read().replace('</script', '<\\/script')
    return '<script>\n' + js + '\n</script>'
out = re.sub(r'<script src="([^"?]+)\?v=[0-9a-f]+"></script>', inline, stamped)
dest = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, 'shufflepuck.html')
open(dest, 'w', encoding='utf-8').write(out)
print(dest, len(out) // 1024, 'KB')
