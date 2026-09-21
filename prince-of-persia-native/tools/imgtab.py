"""Decodes the Apple II image tables (IMG.*): count byte, then 2-byte addresses ($6000-based) of
images, each image = width (bytes), height, then width*height bytes (top to bottom, left to right)."""
import os
BASE = 0x6000
def load_table(path):
    d = open(path, 'rb').read()
    n = d[0]
    images = [None]                      # images are numbered from 1
    for i in range(1, n + 1):
        a = (d[2 * i - 1] | d[2 * i] << 8) - BASE
        w, h = d[a], d[a + 1]
        images.append((w, h, bytes(d[a + 2:a + 2 + w * h])))
    return images

PAL = {'white': (255, 255, 255), 'violet': (221, 68, 221), 'green': (40, 200, 60), 'blue': (40, 150, 240), 'orange': (240, 120, 40)}
def render_rows(rows, width_bytes):
    """rows: list of byte rows; returns list of RGB rows with the NTSC colour rules (each byte 7 pixels)."""
    W = width_bytes * 7
    out = []
    for row in rows:
        bits = [0] * (W + 2); hb = [0] * (W + 2)
        for c in range(width_bytes):
            b = row[c]
            for i in range(7):
                bits[1 + c * 7 + i] = (b >> i) & 1; hb[1 + c * 7 + i] = b >> 7
        line = []
        for x in range(W):
            i = x + 1; col = (0, 0, 0)
            if bits[i]:
                col = PAL['white'] if (bits[i - 1] or bits[i + 1]) else ((PAL['orange'] if hb[i] else PAL['green']) if (x & 1) else (PAL['blue'] if hb[i] else PAL['violet']))
            elif bits[i - 1] and bits[i + 1]:
                xx = x - 1; col = (PAL['orange'] if hb[i] else PAL['green']) if (xx & 1) else (PAL['blue'] if hb[i] else PAL['violet'])
            line.append(col)
        out.append(line)
    return out

def sheet(images, path, scale=2, cols=12):
    from PIL import Image, ImageDraw
    n = len(images) - 1
    cellw = max(im[0] for im in images[1:]) * 7 + 6
    cellh = max(im[1] for im in images[1:]) + 12
    cellw = min(cellw, 80 * 7); cellh = min(cellh, 200)
    rows = (n + cols - 1) // cols
    img = Image.new('RGB', (cols * cellw, rows * cellh), (40, 40, 40))
    dr = ImageDraw.Draw(img)
    for i in range(1, n + 1):
        w, h, data = images[i]
        px = render_rows([data[r * w:(r + 1) * w] for r in range(h)], w)
        cx = ((i - 1) % cols) * cellw; cy = ((i - 1) // cols) * cellh
        dr.text((cx + 1, cy), str(i), fill=(255, 220, 120))
        for y, line in enumerate(px[:cellh - 12]):
            for x, col in enumerate(line[:cellw - 6]):
                img.putpixel((cx + 3 + x, cy + 11 + y), col)
    img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    img.save(path)

if __name__ == '__main__':
    import sys
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get('POP_SRC', ''), 'Images') + os.sep
    out = sys.argv[2] if len(sys.argv) > 2 else '.'
    for name in sorted(os.listdir(src)):
        ims = load_table(src + name)
        print(name, len(ims) - 1, 'images')
        sheet(ims, os.path.join(out, 'sheet_' + name + '.png'))
