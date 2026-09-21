#!/usr/bin/env python3
"""Builds prince.html: the page with the emulator scripts and the three disk sides inlined."""
import base64, json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'prince_src.html'), encoding='utf-8').read()
js = '\n'.join(open(os.path.join(here, 'js', f), encoding='utf-8').read() for f in ('cpu6502.js', 'apple2.js', 'video.js'))
disks = {k: base64.b64encode(open(os.path.join(here, 'disks', k + '.dsk'), 'rb').read()).decode() for k in ('boot', 'a', 'b')}
out = src.replace('/*__JS__*/', js).replace('/*__DISKS__*/null', json.dumps(disks))
dest = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, 'prince.html')
open(dest, 'w', encoding='utf-8').write(out)
print(dest, len(out) // 1024, 'KB')
