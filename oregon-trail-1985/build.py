#!/usr/bin/env python3
"""Builds oregon85.html from oregon85_src.html: inlines the scripts in js/ and data.json (made by tools/pack.py)."""
import json, os

here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'oregon85_src.html'), encoding='utf-8').read()
for marker, name in (('/*__ENGINE__*/', 'engine.js'), ('/*__GAME__*/', 'game.js'), ('/*__HUNT__*/', 'hunt.js'), ('/*__RAFT__*/', 'raft.js'), ('/*__FONT__*/', 'font.js')):
    js = open(os.path.join(here, 'js', name), encoding='utf-8').read().replace('</script', '<\\/script')
    assert marker in src, marker
    src = src.replace(marker, js, 1)
data = open(os.path.join(here, 'data.json'), encoding='utf-8').read()
assert '/*__DATA__*/null' in src
src = src.replace('/*__DATA__*/null', data, 1)
out = os.path.join(here, 'oregon85.html')
open(out, 'w', encoding='utf-8').write(src)
print('oregon85.html: %d bytes' % os.path.getsize(out))
