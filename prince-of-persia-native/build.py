#!/usr/bin/env python3
"""Builds pop.html: the page with the native engine and its data (images, levels, sequences, frame
definitions, the pictures and the recorded audio) inlined, so the file stands on its own."""
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
FILES = ['pop_hires.js', 'pop_grafix.js', 'pop_state.js', 'pop_bg.js', 'pop_char.js', 'pop_mover.js', 'pop_auto.js', 'pop_sound.js', 'pop_cut.js', 'pop_top.js']
src = open(os.path.join(here, 'pop_src.html'), encoding='utf-8').read()
js = '\n'.join(open(os.path.join(here, 'js', f), encoding='utf-8').read() for f in FILES)
def blob(name):
    with open(os.path.join(here, 'assets', name), encoding='utf-8') as f:
        return json.dumps(json.load(f), separators=(',', ':')).replace('</', '<\\/')
out = (src.replace('/*__JS__*/', js.replace('</script', '<\\/script'))
          .replace('/*__DATA__*/null', blob('pop_data.json'))
          .replace('/*__PICS__*/null', blob('pop_pics.json'))
          .replace('/*__AUDIO__*/null', blob('pop_audio.json')))
assert '/*__' not in out, 'a placeholder was left unfilled'
dest = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, 'pop.html')
open(dest, 'w', encoding='utf-8').write(out)
print(dest, len(out) // 1024, 'KB')
