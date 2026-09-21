#!/usr/bin/env python3
"""Builds oregon.html from oregon_src.html by inlining the pictures in pics/ as base64 PNGs."""
import base64, json, os, re

here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'oregon_src.html'), encoding='utf-8').read()
pics = {}
for name in sorted(os.listdir(os.path.join(here, 'pics'))):
    if name.endswith('.png'):
        pics[name[:-4]] = base64.b64encode(open(os.path.join(here, 'pics', name), 'rb').read()).decode()
out = src.replace('/*__PICS__*/null', json.dumps(pics, separators=(',', ':')), 1)
assert out != src, 'no /*__PICS__*/ marker in oregon_src.html'
open(os.path.join(here, 'oregon.html'), 'w', encoding='utf-8').write(out)
print('oregon.html: %d pictures, %d bytes' % (len(pics), len(out.encode('utf-8'))))
