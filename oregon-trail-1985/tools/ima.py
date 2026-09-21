#!/usr/bin/env python3
"""Decodes MECC .IMA image libraries from the 1985 Apple II Oregon Trail.

A library starts with a 16-bit image count, then one 16-bit offset per image
(images are numbered from 1; bit 15 of an offset marks an image stored raw, the
rest are run-length coded).  An image is a width in 7-pixel bytes, a height in
lines, then its bytes: row by row for a raw image, or column by column and coded like the .PCK screens: a control
byte below $40 is followed by that many+1 literal bytes, $40-$7F repeats the next
byte (n&$3F)+1 times, $80-$BF repeats the next two bytes, $C0 ends the image.

usage: ima.py file.IMA -o outdir      writes one PNG per image (7x scale not applied) and a sheet
"""
import os, sys
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pck import render as render_screen, BLACK, WHITE, VIOLET, GREEN, BLUE, ORANGE


def unpack_rle(data, pos, n):
    out = bytearray()
    while len(out) < n and pos < len(data):
        c = data[pos]; pos += 1
        if c < 0x40:
            out += data[pos:pos + c + 1]; pos += c + 1
        elif c < 0x80:
            out += bytes([data[pos]]) * ((c & 0x3F) + 1); pos += 1
        elif c == 0xC0:
            break
        else:
            out += bytes(data[pos:pos + 2]) * ((c & 0x3F) + 1); pos += 2
    return bytes(out[:n]), pos


def images(lib):
    """Yields (number, width_bytes, height, bytes column-major) for each image in a library."""
    count = lib[0] | lib[1] << 8
    for n in range(1, count + 1):
        lo, hi = lib[2 * n], lib[2 * n + 1]
        off = lo | (hi & 0x3F) << 8
        raw = bool(hi & 0x80)
        if off == 0 or off + 2 > len(lib):
            continue
        w, h = lib[off], lib[off + 1]
        if w == 0 or h == 0 or w > 40 or h > 192:
            continue
        if raw:
            rows = lib[off + 2:off + 2 + w * h]          # raw images are stored row by row
            body = bytes(rows[y * w + c] if y * w + c < len(rows) else 0 for c in range(w) for y in range(h))
        else:
            body, _ = unpack_rle(lib, off + 2, w * h)
        if len(body) < w * h:
            body = body + bytes(w * h - len(body))
        yield n, w, h, body


def to_rows(w, h, body):
    """Column-major bytes -> list of h rows of w bytes."""
    return [bytes(body[col * h + y] for col in range(w)) for y in range(h)]


def render(w, h, body, colour=True):
    """Renders an image with the hi-res colour rules; returns an RGB PIL image w*7 x h."""
    rows = to_rows(w, h, body)
    W = w * 7
    img = Image.new('RGB', (W, h), BLACK)
    px = img.load()
    for y, line in enumerate(rows):
        bits = [0] * (W + 2); hb = [0] * (W + 2)
        for col, b in enumerate(line):
            for i in range(7):
                bits[1 + col * 7 + i] = (b >> i) & 1
                hb[1 + col * 7 + i] = b >> 7
        for x in range(W):
            i = x + 1
            if not colour:
                if bits[i]: px[x, y] = WHITE
                continue
            if bits[i]:
                if bits[i - 1] or bits[i + 1]: px[x, y] = WHITE
                else: px[x, y] = (BLUE if hb[i] else VIOLET) if x % 2 == 0 else (ORANGE if hb[i] else GREEN)
            elif bits[i - 1] and bits[i + 1]:
                xx = x - 1
                px[x, y] = (BLUE if hb[i] else VIOLET) if xx % 2 == 0 else (ORANGE if hb[i] else GREEN)
    return img


def main():
    args = sys.argv[1:]
    outdir = '.'
    if '-o' in args:
        k = args.index('-o'); outdir = args[k + 1]; del args[k:k + 2]
    os.makedirs(outdir, exist_ok=True)
    for path in args:
        lib = open(path, 'rb').read()
        name = os.path.basename(path).split('.')[0]
        ims = list(images(lib))
        print(name, len(ims), 'images')
        cell_w = max(im.width for im in [render(w, h, b) for _, w, h, b in ims]) + 8 if ims else 8
        cols = 6
        rows_n = (len(ims) + cols - 1) // cols
        cell_h = max(h for _, _, h, _ in ims) + 16 if ims else 16
        sheet = Image.new('RGB', (cols * cell_w + 8, rows_n * cell_h + 8), (60, 60, 60))
        d = ImageDraw.Draw(sheet)
        for i, (n, w, h, body) in enumerate(ims):
            im = render(w, h, body)
            im.save(os.path.join(outdir, '%s_%02d.png' % (name, n)))
            x = 8 + (i % cols) * cell_w; y = 8 + (i // cols) * cell_h
            sheet.paste(im, (x, y + 12))
            d.text((x, y), '%d %dx%d' % (n, w * 7, h), fill=(255, 255, 255))
        sheet = sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST)
        sheet.save(os.path.join(outdir, '%s_sheet.png' % name))


if __name__ == '__main__':
    main()
