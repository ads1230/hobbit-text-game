#!/usr/bin/env python3
"""Builds shufflepuck.html: index.html with the scripts (and the game's data) inlined, so the
one file stands on its own and can be opened from disk."""
import os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'index.html'), encoding='utf-8').read()
def inline(m):
    js = open(os.path.join(here, m.group(1)), encoding='utf-8').read().replace('</script', '<\\/script')
    return '<script>\n' + js + '\n</script>'
out, n = re.subn(r'<script src="([^"]+)"></script>', inline, src)
assert n == 7, 'expected the seven scripts of index.html, found %d' % n
dest = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, 'shufflepuck.html')
open(dest, 'w', encoding='utf-8').write(out)
print(dest, len(out) // 1024, 'KB')
