#!/usr/bin/env python3
"""Builds assets/pop_data.json from Mechner's published source: the image tables, the fifteen
level blueprints, the assembled sequence table and frame definitions."""
import base64, json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
from asm import assemble
from imgtab import load_table

# Mechner's published source (github.com/jmechner/Prince-of-Persia-Apple-II), cloned beside the repository or named by $POP_SRC
SRC = os.environ.get('POP_SRC') or os.path.join(here, '..', '..', '..', 'Prince-of-Persia-Apple-II', '01 POP Source') + os.sep
out = {'images': {}, 'levels': [], 'seq': None, 'framedef': None}

names = {  # table key -> file
    'bg1dun': 'IMG.BGTAB1.DUN', 'bg1pal': 'IMG.BGTAB1.PAL', 'bg2dun': 'IMG.BGTAB2.DUN', 'bg2pal': 'IMG.BGTAB2.PAL',
    'ch1': 'IMG.CHTAB1', 'ch2': 'IMG.CHTAB2', 'ch3': 'IMG.CHTAB3', 'ch4gd': 'IMG.CHTAB4.GD', 'ch4skel': 'IMG.CHTAB4.SKEL',
    'ch4shad': 'IMG.CHTAB4.SHAD', 'ch4fat': 'IMG.CHTAB4.FAT', 'ch4viz': 'IMG.CHTAB4.VIZ', 'ch5': 'IMG.CHTAB5',
    'ch6a': 'IMG.CHTAB6.A', 'ch6b': 'IMG.CHTAB6.B', 'ch7': 'IMG.CHTAB7'}
for key, fn in names.items():
    ims = load_table(SRC + 'Images/' + fn)
    out['images'][key] = [[w, h, base64.b64encode(d).decode()] for (w, h, d) in ims[1:]]

for n in range(15):
    out['levels'].append(base64.b64encode(open(SRC + 'Levels/LEVEL%d' % n, 'rb').read()).decode())

seq, syms = assemble(open(SRC + 'Source/SEQTABLE.S').read())
out['seq'] = {'org': 0x3000, 'data': base64.b64encode(seq).decode(),
              'labels': {k: v for k, v in syms.items() if isinstance(v, int) and 0x3000 <= v < 0x3000 + len(seq) and not k.startswith(':') and ':' not in k}}
fd, fsyms = assemble(open(SRC + 'Source/FRAMEDEF.S').read())
out['framedef'] = {'data': base64.b64encode(fd).decode(), 'Fdef': fsyms['Fdef'] - 0x2800, 'altset1': fsyms['ALTSET1'] - 0x2800,
                   'altset2': fsyms['ALTSET2'] - 0x2800, 'swordtab': fsyms['SWORDTAB'] - 0x2800}
os.makedirs(os.path.join(here, '..', 'assets'), exist_ok=True)
path = os.path.join(here, '..', 'assets', 'pop_data.json')
json.dump(out, open(path, 'w'))
print(path, os.path.getsize(path) // 1024, 'KB', 'seq', len(seq), 'framedef', len(fd))
