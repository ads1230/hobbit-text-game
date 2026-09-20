#!/usr/bin/env python3
"""Extracts the location illustrations from the 1985 Macintosh version of The Hobbit.

The Mac program keeps its pictures in the data fork of the "Hobbit" file, after
the game database and the title screen.  Each picture is 480x256 pixels, 1 bit
deep, stored as 30x16 tiles of 8x8 "big pixels" (each big pixel is a 2x2 block
of a 16-level dither pattern) plus a list of single big-pixel fix-ups.  The
format was worked out from the 68000 decoder in CODE resource 2.

usage: macpics.py Hobbit.data outdir
  writes, for each picture XX: mono_XX.png (the Mac's own 480x256 dither), grey_XX.png and
  colour_XX.png (the 240x128 ink map at 4x, in the greys the patterns average to and in a
  painter's palette chosen from what each ink paints across the set), and outdir/macpics.json
  ({"XX": base64 of the raw compressed picture}) for the web page.
"""
import base64, json, os, struct, sys
from PIL import Image

# The four rows of the 16 dither patterns (two rows for even big-pixel rows,
# two for odd), the nibble-to-byte expansion table and the 2-bit pair masks,
# copied from the program's initialised data.
ROW_EVEN0 = bytes.fromhex('ff5599556644001 1ff55ddee88aa0000'.replace(' ', ''))
ROW_EVEN1 = bytes.fromhex('ffffffaa9922aa44ffff77557744 4400'.replace(' ', ''))
ROW_ODD0 = bytes.fromhex('ff55665566880011ff55ddee88aa0000')
ROW_ODD1 = bytes.fromhex('ffffffaa9911aa44ffff77aa77111100')
EXPAND = bytes.fromhex('00030c0f30333c3fc0c3cccff0f3fcff')
PAIR = bytes.fromhex('c0300c03')
ROWBYTES = 60
# What each of the 16 inks looks like: the greys the dither patterns average to, and the colours
# each ink evidently stands for (skies, water, foliage, rock, wood, sunlight...) across the pictures.
GREY = [0, 64, 64, 128, 128, 191, 191, 191, 0, 64, 64, 96, 128, 160, 223, 255]
COLOUR = [(0, 0, 0), (24, 32, 96), (96, 56, 24), (60, 90, 60), (40, 120, 50), (135, 170, 210), (200, 140, 70), (180, 180, 180),
          (0, 0, 0), (40, 90, 200), (24, 96, 40), (120, 80, 50), (110, 170, 70), (170, 190, 220), (250, 235, 150), (255, 255, 255)]


def decode_inks(data):
    """Returns the 240x128 picture as one ink number (0-15) per point, row by row."""
    idx = bytearray(240 * 128)
    pos = 0
    for ty in range(16):
        for tx in range(30):
            b = data[pos]; pos += 1
            back = (b >> 3) & 15
            fore = (b & 7) | ((b >> 3) & 8)
            masks = [0] * 8
            if b & 0x80:
                if back != fore:
                    masks = [data[pos]] * 8; pos += 1
            else:
                masks = list(data[pos:pos + 8]); pos += 8
            for i in range(8):
                off = (ty * 8 + i) * 240 + tx * 8
                for k in range(8):
                    idx[off + k] = fore if masks[i] & (0x80 >> k) else back
    while pos + 2 < len(data):
        idx[data[pos + 2] * 240 + data[pos + 1]] = data[pos]; pos += 3
    return idx


def decode(data):
    """Returns the 15360-byte 1-bit bitmap (1 = black, rows of 60 bytes)."""
    buf = bytearray(ROWBYTES * 256)
    pos = 0

    def fill(tx, ty, pat):
        off = ty * 0x3c0 + tx * 2
        for i in range(8):
            r0, r1 = (ROW_ODD0, ROW_ODD1) if i & 1 else (ROW_EVEN0, ROW_EVEN1)
            buf[off] = buf[off + 1] = r0[pat]
            buf[off + 60] = buf[off + 61] = r1[pat]
            off += 120

    def row(tx, ty, i, mask, pat):
        off = ty * 0x3c0 + i * 120 + tx * 2
        mh, ml = EXPAND[mask >> 4], EXPAND[mask & 15]
        r0, r1 = (ROW_ODD0, ROW_ODD1) if i & 1 else (ROW_EVEN0, ROW_EVEN1)
        buf[off] = (buf[off] & ~mh & 0xff) | (r0[pat] & mh)
        buf[off + 60] = (buf[off + 60] & ~mh & 0xff) | (r1[pat] & mh)
        buf[off + 1] = (buf[off + 1] & ~ml & 0xff) | (r0[pat] & ml)
        buf[off + 61] = (buf[off + 61] & ~ml & 0xff) | (r1[pat] & ml)

    for ty in range(16):
        for tx in range(30):
            b = data[pos]; pos += 1
            back = (b >> 3) & 15                 # background pattern: bits 3-6
            fore = (b & 7) | ((b >> 3) & 8)      # foreground pattern: bits 0-2, sharing bit 6
            fill(tx, ty, back)
            if b & 0x80:
                if back != fore:                 # one mask byte repeated for all 8 rows
                    mask = data[pos]; pos += 1
                    for i in range(8): row(tx, ty, i, mask, fore)
            else:                                # eight mask bytes, one per row
                for i in range(8):
                    row(tx, ty, i, data[pos], fore); pos += 1
    while pos + 2 < len(data):                   # fix-ups: pattern, x, y of one big pixel
        pat, x, y = data[pos], data[pos + 1], data[pos + 2]; pos += 3
        off = y * 120 + (x >> 2)
        m = PAIR[x & 3]
        r0, r1 = (ROW_ODD0, ROW_ODD1) if y & 1 else (ROW_EVEN0, ROW_EVEN1)
        buf[off] = (buf[off] & ~m & 0xff) | (r0[pat] & m)
        buf[off + 60] = (buf[off + 60] & ~m & 0xff) | (r1[pat] & m)
    if pos != len(data):
        raise ValueError('picture data does not add up: used %d of %d bytes' % (pos, len(data)))
    return buf


def main(path, outdir):
    d = open(path, 'rb').read()
    db_off, title_off, pic_off = struct.unpack('>III', d[:12])
    table_len = struct.unpack('>I', d[pic_off:pic_off + 4])[0]   # size of the table, header included
    count = (table_len - 4) // 6
    entries, p = [], pic_off + 4
    for i in range(count):
        pid = d[p]; off = (d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3]; ln = struct.unpack('>H', d[p + 4:p + 6])[0]
        entries.append((pid, off, ln)); p += 6
    os.makedirs(outdir, exist_ok=True)
    out, seen = {}, {}
    for pid, off, ln in entries:
        if off in seen:
            continue
        seen[off] = pid
        raw = d[pic_off + off:pic_off + off + ln]
        buf = decode(raw)
        img = Image.frombytes('1', (480, 256), bytes(b ^ 0xff for b in buf))
        img.save(os.path.join(outdir, 'mono_%02x.png' % pid), optimize=True)
        inks = Image.frombytes('P', (240, 128), bytes(decode_inks(raw)))
        for name, pal in (('grey', [(g, g, g) for g in GREY]), ('colour', COLOUR)):
            inks.putpalette([c for rgb in pal for c in rgb] + [0] * (768 - 48))
            inks.resize((960, 512), Image.NEAREST).save(os.path.join(outdir, '%s_%02x.png' % (name, pid)), optimize=True)
        out['%02x' % pid] = base64.b64encode(raw).decode()
    json.dump(out, open(os.path.join(outdir, 'macpics.json'), 'w'), separators=(',', ':'))
    print('%d entries, %d pictures written to %s' % (count, len(out), outdir))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'macpics')
