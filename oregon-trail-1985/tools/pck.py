#!/usr/bin/env python3
"""Decodes MECC .PCK pictures from the 1985 Apple II Oregon Trail into PNGs.

A .PCK is one 280x192 hi-res screen, run-length coded column by column (the
unpacker is the DUN command of the game's & package at $87D4).  Rendering
follows the Apple II hi-res colour rules: two lit pixels side by side are white,
a lone lit pixel is coloured by its column (even columns violet, odd green, or
blue/orange when the byte's high bit is set) and the gap between two lit pixels
one apart takes their colour.

usage: pck.py file.PCK... -o outdir
"""
import os, sys
from PIL import Image

W, H = 280, 192


def unpack(data):
    out = bytearray(40 * H)          # index = col*192 + line
    n = 0
    pos = 0

    def put(b):
        nonlocal n
        if n < len(out):
            out[n] = b
        n += 1

    while pos < len(data):
        c = data[pos]; pos += 1
        top, cnt = c & 0xC0, c & 0x3F
        if top == 0x00:
            for _ in range(cnt + 1):
                put(data[pos]); pos += 1
        elif top == 0x40:
            b = data[pos]; pos += 1
            for _ in range(cnt + 1):
                put(b)
        elif c == 0xC0:
            break
        else:
            b1, b2 = data[pos], data[pos + 1]; pos += 2
            for _ in range(cnt + 1):
                put(b1); put(b2)
    if n != len(out):
        raise ValueError('unpacked %d bytes, expected %d' % (n, len(out)))
    return out


def rows(screen):
    """40 bytes per line, line by line."""
    return [bytes(screen[col * H + y] for col in range(40)) for y in range(H)]


BLACK, WHITE = (0, 0, 0), (255, 255, 255)
VIOLET, GREEN, BLUE, ORANGE = (221, 68, 221), (40, 200, 60), (40, 150, 240), (240, 120, 40)


def render(screen, colour=True, palette=None):
    pal = palette or {'violet': VIOLET, 'green': GREEN, 'blue': BLUE, 'orange': ORANGE}
    img = Image.new('RGB', (W, H), BLACK)
    px = img.load()
    for y, line in enumerate(rows(screen)):
        bits = [0] * (W + 2)
        hb = [0] * (W + 2)
        for col, b in enumerate(line):
            for i in range(7):
                bits[1 + col * 7 + i] = (b >> i) & 1
                hb[1 + col * 7 + i] = b >> 7
        for x in range(W):
            i = x + 1
            if not colour:
                if bits[i]:
                    px[x, y] = WHITE
                continue
            if bits[i]:
                if bits[i - 1] or bits[i + 1]:
                    px[x, y] = WHITE
                else:
                    px[x, y] = pal[('blue' if hb[i] else 'violet') if x % 2 == 0 else ('orange' if hb[i] else 'green')]
            elif bits[i - 1] and bits[i + 1]:
                xx = x - 1
                px[x, y] = pal[('blue' if hb[i] else 'violet') if xx % 2 == 0 else ('orange' if hb[i] else 'green')]
    return img


def main():
    args = sys.argv[1:]
    outdir = '.'
    if '-o' in args:
        k = args.index('-o'); outdir = args[k + 1]; del args[k:k + 2]
    os.makedirs(outdir, exist_ok=True)
    for path in args:
        name = os.path.basename(path).split('.')[0]
        scr = unpack(open(path, 'rb').read())
        render(scr, colour=False).resize((W * 2, H * 2), Image.NEAREST).save(os.path.join(outdir, name + '_mono.png'), optimize=True)
        render(scr).resize((W * 2, H * 2), Image.NEAREST).save(os.path.join(outdir, name + '_colour.png'), optimize=True)
        print(name)


if __name__ == '__main__':
    main()
