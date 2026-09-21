#!/usr/bin/env python3
"""Packs everything the page needs from the Apple II disks into data.json.

Expects apple2/ to hold: L0..L17.PCK, M0.PCK, TS.PCK, RIVER.PCK (the pictures), the .IMA
libraries, HUNTER.IMA / ANIMALS.IMA / THINGS.IMA (the hunting sprites, cut from the
language-card image), MS0..MS17.BIN and TS.BIN (the tunes), VAR.BIN (the variable table)
and talk.json (the "talk to people" texts).
"""
import base64, json, os, sys

here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
a2 = os.path.join(here, 'apple2')


def b64(name):
    return base64.b64encode(open(os.path.join(a2, name), 'rb').read()).decode()


def var_tables():
    d = open(os.path.join(a2, 'VAR.BIN'), 'rb').read()
    base = 39170

    def fp(b):
        e = b[0]
        if e == 0: return 0.0
        m = b[1:5]; sign = -1 if m[0] & 0x80 else 1
        mant = ((m[0] | 0x80) << 24 | m[1] << 16 | m[2] << 8 | m[3]) / 2 ** 32
        return sign * mant * 2 ** (e - 128)

    pos = 217; arrays = {}
    while pos + 5 <= len(d):
        a, b = d[pos], d[pos + 1]
        n1 = chr(a & 0x7f); n2 = chr(b & 0x7f) if (b & 0x7f) else ''
        t = ('$' if (not a & 0x80) and (b & 0x80) else '%' if (a & 0x80) and (b & 0x80) else '')
        if not ('A' <= n1 <= 'Z'): break
        size = d[pos + 2] | d[pos + 3] << 8; nd = d[pos + 4]
        dims = [d[pos + 5 + 2 * i] << 8 | d[pos + 6 + 2 * i] for i in range(nd)][::-1]
        data = pos + 5 + 2 * nd; name = n1 + n2 + t
        esz = 3 if t == '$' else 2 if t == '%' else 5
        total = 1
        for x in dims: total *= x
        vals = []
        for i in range(total):
            v = d[data + i * esz:data + (i + 1) * esz]
            if t == '$':
                ln = v[0]; ptr = v[1] | v[2] << 8; off = ptr - base
                vals.append(d[off:off + ln].decode('latin1') if 0 <= off < len(d) and ln else '')
            elif t == '%': vals.append(v[0] << 8 | v[1])
            else:
                x = fp(v); vals.append(int(x) if x == int(x) else x)
        arrays[name] = (dims, vals); pos += size

    def col(name, j):
        dims, vals = arrays[name]; d0 = dims[0]
        return [vals[i + j * d0] for i in range(d0)]

    lm = {'name': col('LM$', 0), 'type': [int(x) for x in col('LM$', 1)], 'leg': [int(x) for x in col('LM$', 2)],
          'alt': [int(x) for x in col('LM$', 3)], 'mapx': col('MP%', 0), 'mapy': col('MP%', 1)}
    legs = {'dist': col('LM', 0), 'daily': col('LM', 1), 'next': col('LM', 2)}
    rivers = {k: col('RC', j) for j, k in enumerate(('depth', 'width', 'swift', 'bottom', 'x', 'option'))}
    return {
        'landmarks': lm, 'legs': legs, 'rivers': rivers,
        'scenery': {'image': col('L%', 0), 'x': col('L%', 1)},
        'weather': arrays['WC$'][1], 'months': arrays['M$'][1], 'items': arrays['I$'][1],
        'store': {k: col('S$', j) for j, k in enumerate(('name', 'price', 'unit', 'plural'))},
        'actions': arrays['AQ$'][1], 'ills': arrays['IL$'][1], 'health': arrays['H$'][1], 'weathers': arrays['W$'][1],
        'paces': arrays['P$'][1], 'rations': arrays['R$'][1], 'B': arrays['B'][1],
    }


def main():
    out = {'pck': {}, 'ima': {}, 'tunes': {}}
    for name in ['L%d' % i for i in range(18)] + ['M0', 'TS', 'RIVER']:
        out['pck'][name] = b64(name + '.PCK')
    for name in ('PRAIRIE', 'MOUNTAINS', 'EVENTS', 'RIVER', 'OREGON', 'FIRST', 'ORSPRITE', 'HUNTER', 'ANIMALS', 'THINGS'):
        out['ima'][name] = b64(name + '.IMA')
    for name in ['MS%d' % i for i in range(18)] + ['TS']:
        out['tunes'][name] = b64(name + '.BIN')
    out['tables'] = var_tables()
    out['talk'] = json.load(open(os.path.join(a2, 'talk.json')))
    json.dump(out, open(os.path.join(here, 'data.json'), 'w'), separators=(',', ':'))
    print('data.json: %d bytes' % os.path.getsize(os.path.join(here, 'data.json')))


if __name__ == '__main__':
    main()
