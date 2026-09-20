#!/usr/bin/env python3
"""Builds a TAP (and TZX) test image from the binary reconstructed by skool2bin.
Layout mimics the original tape: BASIC loader, SCREEN$, 40000-byte CODE at 24576."""
import struct, sys

full = open('/tmp/hobbit_full.bin', 'rb').read()   # 0x4000..0xFFFF
base = 0x4000
screen = full[0x4000 - base:0x4000 - base + 6912]
code = full[0x6000 - base:0x6000 - base + 40000]

def block(flag, data):
    body = bytes([flag]) + data
    chk = 0
    for b in body: chk ^= b
    body += bytes([chk])
    return struct.pack('<H', len(body)) + body

def header(typ, name, length, p1, p2):
    return block(0, bytes([typ]) + name.ljust(10)[:10].encode() + struct.pack('<HHH', length, p1, p2))

# BASIC: 10 CLEAR 24319: LOAD "" SCREEN$ : LOAD "" CODE : RANDOMIZE USR 27648
def num(n):
    return b'\x0e\x00\x00' + struct.pack('<H', n) + b'\x00'
line = b'\xfd' + b'24319' + num(24319) + b':' + b'\xef"\xaa' + b':' + b'\xef"\xaf' + b':' + b'\xf9\xc0' + b'27648' + num(27648) + b'\r'
basic = struct.pack('>H', 10) + struct.pack('<H', len(line)) + line

tap = header(0, 'hobbit', len(basic), 10, len(basic)) + block(0xff, basic)
tap += header(3, 'screen', 6912, 16384, 32768) + block(0xff, screen)
tap += header(3, 'hobbit12', 40000, 24576, 32768) + block(0xff, code)
open('/tmp/hobbit_test.tap', 'wb').write(tap)

# TZX wrapper: each TAP block becomes an ID 0x10 block
tzx = b'ZXTape!\x1a\x01\x14' + bytes([0x30, 5]) + b'Hello'
i = 0
while i < len(tap):
    ln = struct.unpack('<H', tap[i:i+2])[0]
    tzx += bytes([0x10]) + struct.pack('<HH', 1000, ln) + tap[i+2:i+2+ln]
    i += 2 + ln
open('/tmp/hobbit_test.tzx', 'wb').write(tzx)
print('wrote', len(tap), 'byte TAP and', len(tzx), 'byte TZX')
