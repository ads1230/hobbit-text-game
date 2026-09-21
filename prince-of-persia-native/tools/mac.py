#!/usr/bin/env python3
"""Builds assets/pop_mac.json from the Macintosh version's disk image (an HFS image with the game's folder):
the shape files Persia(BW) and Persia(COLOR) as the game keeps them (each set LZSS-packed in the data
fork, with the resource fork's SHPD/SHPT directories), and from the application's resources and global
data everything the page needs to use those shapes in place of the Apple's: the 256-colour palette and the
guard palettes, the frame table (which Mac image each frame draws), the sword table, the block-piece records,
the animation tables, and the two scale tables that turn the game's coordinates into Mac pixels.
    python3 tools/mac.py PrinceOfPersia.img
"""
import sys, os, json, base64, struct
here = os.path.dirname(os.path.abspath(__file__))
import machfs

def parse_rsrc(fork):
    """A classic resource fork: {type: {id: (name, bytes)}}."""
    if len(fork) < 16: return {}
    data_off, map_off, data_len, map_len = struct.unpack('>IIII', fork[:16])
    m = fork[map_off:map_off + map_len]
    type_list_off, name_list_off = struct.unpack('>HH', m[24:28])
    ntypes = struct.unpack('>H', m[type_list_off:type_list_off + 2])[0] + 1
    out = {}; p = type_list_off + 2
    for _ in range(ntypes):
        rtype, count, ref_off = struct.unpack('>4sHH', m[p:p + 8]); p += 8
        refs = type_list_off + ref_off
        d = out.setdefault(rtype.decode('mac_roman'), {})
        for i in range(count + 1):
            rid, name_off, attr_off = struct.unpack('>hHI', m[refs + i * 12: refs + i * 12 + 8])
            off = attr_off & 0xFFFFFF
            length = struct.unpack('>I', fork[data_off + off:data_off + off + 4])[0]
            name = None
            if name_off != 0xFFFF:
                n = m[name_list_off + name_off]; name = m[name_list_off + name_off + 1:name_list_off + name_off + 1 + n].decode('mac_roman', 'replace')
            d[rid] = (name, fork[data_off + off + 4:data_off + off + 4 + length])
    return out

def globals_below_a5(res):
    """THINK C's initialised data: DATA copied a word at a time, each zero word followed by as many more zero
    bytes as the next word of ZERO says (the startup code in CODE 1)."""
    d = res['DATA'][0][1]; z = res['ZERO'][0][1]
    below = struct.unpack('>I', res['CODE'][0][1][4:8])[0]
    zw = struct.unpack('>%dH' % (len(z) // 2), z)
    out = bytearray(); zi = 0
    for i in range(0, len(d), 2):
        out += d[i:i + 2]
        if d[i] == 0 and d[i + 1] == 0: out += bytes(zw[zi]); zi += 1
    assert len(out) == below
    return bytes(out)

def clut(res, rid):
    d = res['clut'][rid][1]; n = struct.unpack('>h', d[6:8])[0] + 1
    return [(v, r >> 8, g >> 8, b >> 8) for (v, r, g, b) in (struct.unpack('>HHHH', d[8 + i * 8: 16 + i * 8]) for i in range(n))]

def shape_file(obj):
    res = parse_rsrc(obj.rsrc); sets = {}
    for rid in sorted(res['SHPD']):
        name, d = res['SHPD'][rid]; off, plen, ulen = struct.unpack('>3I', d)
        t = res['SHPT'][rid][1]; offs = struct.unpack('>%dI' % (len(t) // 4), t)
        sets[rid] = {'name': name, 'off': off, 'plen': plen, 'ulen': ulen, 'shpt': [(-1 if o == 0xFFFFFFFF else o) for o in offs]}
    return {'data': base64.b64encode(obj.data).decode(), 'sets': sets}

def main(img_path):
    v = machfs.Volume(); v.read(open(img_path, 'rb').read())
    folder = v['Prince of Persia']
    app = parse_rsrc(folder['Prince of Persia'].rsrc)
    mem = globals_below_a5(app); A5 = len(mem)
    at = lambda a5off: mem[A5 + a5off:]
    def words(a5off, n): return list(struct.unpack('>%dh' % n, mem[A5 + a5off: A5 + a5off + 2 * n]))
    out = {'bw': shape_file(folder['Persia(BW)']), 'color': shape_file(folder['Persia(COLOR)']), 'lc': shape_file(folder['Persia(LC)'])}
    # palettes: the 256-colour clut (201 entries, by index), the eight guard palettes (13 entries replacing 105..117), the star colours
    pal = [[0, 0, 0]] * 256
    for v_, r, g, b in clut(app, 2000): pal[v_] = [r, g, b]
    out['palette'] = pal
    out['guards'] = [[[r, g, b] for (_, r, g, b) in clut(app, 3000 + i)] for i in range(8)]
    out['guardBase'] = 105
    out['stars'] = [[r, g, b] for (_, r, g, b) in clut(app, 3500)]
    out['grays'] = [[r, g, b] for (_, r, g, b) in clut(app, 4000)]
    # the scale tables: x in the 320-wide space (-128..447) and y in the Apple's (-63..254) to Mac pixels
    out['xtable'] = {'first': -128, 'values': words(-26522 - 2 * 128, 576)}
    out['ytable'] = {'first': -63, 'values': words(-25500 - 2 * 63, 318)}
    # the frame table: 6-byte records (image, sword, dx, dy, check, 0) for the same 400 frames as the Apple's Fdef (its
    # alternate sets follow; dx, dy and check are the Apple's, the image is the Mac shape's number less one)
    ft = at(-21862)
    out['frames'] = [list(ft[i*6:i*6+5]) for i in range(400)]
    a1 = at(-20416); out['altset1'] = [list(a1[i*6:i*6+5]) for i in range(40)]         # frames 150..189 of the guards' set
    a2 = at(-20170); out['altset2'] = [list(a2[i*6:i*6+5]) for i in range(90)]         # the skeleton's and the others'
    # the sword table: (image, dx, dy, 0), entry 0 a dummy
    st = at(-19660)
    out['swords'] = [[st[i*4], st[i*4+1], st[i*4+2]] for i in range(1, 40)]
    # the block-piece records, 12 bytes for each of the 30 block types: A ax ay, B bx by, stripe, C, D, F fx fy
    rec = at(-19456)
    out['records'] = [list(rec[i*12:(i+1)*12]) for i in range(30)]
    # the animation tables that follow (loose floors, slicers, spikes, gates)
    tb = at(-19084)
    out['tables'] = {'loosea': list(tb[0:11]), 'looseb': list(tb[12:23]), 'loosed': list(tb[24:35]), 'looseflag': list(tb[36:47]),
                     'slicerseq': list(tb[48:55]), 'slicertop': list(tb[56:61]), 'slicerbot': list(tb[62:67]), 'slicerbot2': list(tb[68:73]), 'slicerfrnt': list(tb[74:79]),
                     'spikea': list(tb[80:90]), 'spikeb': list(tb[90:100]), 'spikec': list(tb[100:110]), 'gate8c': list(tb[110:118]), 'gate8b': list(tb[118:126]),
                     'flameseq': [list(tb[126:133]), list(tb[133:141]), list(tb[141:148]), list(tb[148:155]), list(tb[155:163]), list(tb[163:170]), list(tb[170:174])],
                     'after': list(tb[174:215])}
    # what follows the gate tables (the 41 bytes 'after' above), by use: the palace's panel pieces (B, then C), the dark
    # cell walls behind a space (spaceb) and their heights (spaceby), the floor's second piece (floorb), the wall's stripe
    # (wallD) and face (wallF) by the wall's state, and the flask's liquid by its bubble frame (flaskimg)
    a = out['tables']['after']
    out['tables'].update({'panelb': a[0:4], 'panelc': a[4:8], 'spaceb': a[8:12], 'spaceby': [(v - 256 if v > 127 else v) for v in a[12:16]],
                          'floorb': a[16:20], 'wallD': a[20:28], 'wallF': a[24:32], 'flaskimg': a[28:41]})
    # the 512-mode gate: which shape shows the gate's top in the block above for each position (state / 4, up to 45)
    out['tables']['gate512'] = list(tb[126:172])
    # the ledge piece drawn in front of the prince as he climbs up, by his frame (135..148), from the table the game
    # indexes with the frame number
    cu = mem[A5 - 0x568e:]
    out['tables']['cuPiece'] = {str(pn): struct.unpack('>H', cu[2 * pn:2 * pn + 2])[0] for pn in range(130, 150)}
    # the levels: the same blueprints as the Apple's with the guard tables 17 bytes further on and a seventh table, the
    # colour of each screen's guard (the palette of clut 3000 + n replaces indices 105..117); 255 = no guard
    out['guardColor'] = [list(app['LEVL'][n][1][2280:2304]) for n in range(15)]
    # in the 512 x 320 modes the sword table's dx is adjusted for seven entries (the code after the mode is chosen)
    out['swords512'] = {18: -1, 21: -4, 23: -3, 24: -3, 25: -2, 26: -1, 33: 1}
    out['font'] = base64.b64encode(app['FONT'][25616][1]).decode() if 25616 in app.get('FONT', {}) else None
    p = os.path.join(here, '..', 'assets', 'pop_mac.json')
    json.dump(out, open(p, 'w'), separators=(',', ':'))
    print('wrote', p, os.path.getsize(p) // 1024, 'KB')
    for k in ['bw', 'color', 'lc']: print(k, 'sets', len(out[k]['sets']), 'data', len(out[k]['data']) * 3 // 4, 'bytes')

if __name__ == '__main__':
    main(sys.argv[1])
