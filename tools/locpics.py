#!/usr/bin/env python3
"""Packs the per-location pictures for the web page.

usage: locpics.py <folder> [out.json]

The folder holds one PNG per Spectrum location, named "<room number in hex> <anything>.png"
(as in the downloadable set: "05 the trolls clearing (mac 03).png").  Pictures are 240x128
pixel art, or that at an exact multiple (the set is shipped at 4x, 960x512); larger ones are
reduced by taking the commonest colour of each block, so edits made on the 4x grid survive
untouched.  Identical pictures are stored once.
"""
import base64, collections, io, json, os, re, sys
from PIL import Image

W, H = 240, 128


def reduce(im):
    im = im.convert('RGB')
    w, h = im.size
    if (w, h) == (W, H):
        return im
    if w % W or h % H or w // W != h // H:
        raise ValueError('picture is %dx%d, not a multiple of %dx%d' % (w, h, W, H))
    f = w // W
    px = im.load()
    out = Image.new('RGB', (W, H))
    op = out.load()
    for y in range(H):
        for x in range(W):
            block = [px[x * f + i, y * f + j] for j in range(f) for i in range(f)]
            op[x, y] = collections.Counter(block).most_common(1)[0][0]
    return out


def png_bytes(im):
    # an exact palette image (the pictures have a few dozen colours) is a fraction of the size of RGB
    colours = sorted(set(im.getdata()))
    buf = io.BytesIO()
    if len(colours) <= 256:
        index = {c: i for i, c in enumerate(colours)}
        pal = Image.new('P', im.size)
        pal.putpalette([v for c in colours for v in c] + [0] * (768 - 3 * len(colours)))
        pal.putdata([index[c] for c in im.getdata()])
        pal.save(buf, 'PNG', optimize=True)
    else:
        im.save(buf, 'PNG', optimize=True)
    return buf.getvalue()


def main(folder, out_path):
    rooms, images, keys = {}, {}, {}
    for name in sorted(os.listdir(folder)):
        m = re.match(r'^([0-9a-fA-F]{2})\b.*\.png$', name)
        if not m:
            continue
        room = m.group(1).lower()
        im = reduce(Image.open(os.path.join(folder, name)))
        data = png_bytes(im)
        key = keys.setdefault(data, 'p%d' % len(keys))
        images[key] = base64.b64encode(data).decode()
        rooms[room] = key
    json.dump({'rooms': rooms, 'images': images}, open(out_path, 'w'), separators=(',', ':'))
    print('%d locations, %d distinct pictures, %d bytes' % (len(rooms), len(images), os.path.getsize(out_path)))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'locpics.json')
