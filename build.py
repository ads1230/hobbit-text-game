#!/usr/bin/env python3
"""Inlines the Z80 core, the machine module and the character set into one HTML file."""
import base64, pathlib
root = pathlib.Path(__file__).parent
src = (root / 'index_src.html').read_text()
z80 = (root / 'z80.js').read_text()
machine = (root / 'machine.js').read_text()
charset = base64.b64encode((root / 'charset' / 'CharSetSpectrum8x8.bin').read_bytes()).decode()
walk = (root / 'walkthrough.json').read_text().strip()
locpics = (root / 'locpics.json').read_text().strip() if (root / 'locpics.json').exists() else 'null'
# the tape built into the page: the first tape image found in tape/
import json
tapes = sorted(p for p in (root / 'tape').glob('*') if p.suffix.lower() in ('.tap', '.tzx', '.z80', '.sna')) if (root / 'tape').exists() else []
tape = json.dumps({'name': tapes[0].name, 'b64': base64.b64encode(tapes[0].read_bytes()).decode()}) if tapes else 'null'
out = src.replace('/*__Z80__*/', z80).replace('/*__MACHINE__*/', machine).replace('/*__CHARSET__*/', charset).replace('/*__WALKTHROUGH__*/null', walk).replace('/*__LOCPICS__*/null', locpics).replace('/*__TAPE__*/null', tape)
(root / 'hobbit.html').write_text(out)
print('wrote hobbit.html', len(out), 'bytes')
