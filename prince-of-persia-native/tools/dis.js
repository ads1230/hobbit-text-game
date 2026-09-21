// dis.js — a small 6502 disassembler for checking the disk's code against the source
const OPS = {};
const set = (mn, list) => { for (const [op, mode] of list) OPS[op] = [mn, mode]; };
set('ADC', [[0x69, 'imm'], [0x65, 'zp'], [0x75, 'zpx'], [0x6D, 'abs'], [0x7D, 'absx'], [0x79, 'absy'], [0x61, 'indx'], [0x71, 'indy'], [0x72, 'ind']]);
set('AND', [[0x29, 'imm'], [0x25, 'zp'], [0x35, 'zpx'], [0x2D, 'abs'], [0x3D, 'absx'], [0x39, 'absy'], [0x21, 'indx'], [0x31, 'indy'], [0x32, 'ind']]);
set('ASL', [[0x0A, 'acc'], [0x06, 'zp'], [0x16, 'zpx'], [0x0E, 'abs'], [0x1E, 'absx']]);
set('BCC', [[0x90, 'rel']]); set('BCS', [[0xB0, 'rel']]); set('BEQ', [[0xF0, 'rel']]); set('BMI', [[0x30, 'rel']]); set('BNE', [[0xD0, 'rel']]); set('BPL', [[0x10, 'rel']]); set('BVC', [[0x50, 'rel']]); set('BVS', [[0x70, 'rel']]); set('BRA', [[0x80, 'rel']]);
set('BIT', [[0x24, 'zp'], [0x2C, 'abs'], [0x89, 'imm'], [0x34, 'zpx'], [0x3C, 'absx']]);
set('BRK', [[0x00, 'imp']]); set('CLC', [[0x18, 'imp']]); set('CLD', [[0xD8, 'imp']]); set('CLI', [[0x58, 'imp']]); set('CLV', [[0xB8, 'imp']]);
set('CMP', [[0xC9, 'imm'], [0xC5, 'zp'], [0xD5, 'zpx'], [0xCD, 'abs'], [0xDD, 'absx'], [0xD9, 'absy'], [0xC1, 'indx'], [0xD1, 'indy'], [0xD2, 'ind']]);
set('CPX', [[0xE0, 'imm'], [0xE4, 'zp'], [0xEC, 'abs']]); set('CPY', [[0xC0, 'imm'], [0xC4, 'zp'], [0xCC, 'abs']]);
set('DEC', [[0xC6, 'zp'], [0xD6, 'zpx'], [0xCE, 'abs'], [0xDE, 'absx'], [0x3A, 'acc']]); set('DEX', [[0xCA, 'imp']]); set('DEY', [[0x88, 'imp']]);
set('EOR', [[0x49, 'imm'], [0x45, 'zp'], [0x55, 'zpx'], [0x4D, 'abs'], [0x5D, 'absx'], [0x59, 'absy'], [0x41, 'indx'], [0x51, 'indy'], [0x52, 'ind']]);
set('INC', [[0xE6, 'zp'], [0xF6, 'zpx'], [0xEE, 'abs'], [0xFE, 'absx'], [0x1A, 'acc']]); set('INX', [[0xE8, 'imp']]); set('INY', [[0xC8, 'imp']]);
set('JMP', [[0x4C, 'abs'], [0x6C, 'absind'], [0x7C, 'absxind']]); set('JSR', [[0x20, 'abs']]);
set('LDA', [[0xA9, 'imm'], [0xA5, 'zp'], [0xB5, 'zpx'], [0xAD, 'abs'], [0xBD, 'absx'], [0xB9, 'absy'], [0xA1, 'indx'], [0xB1, 'indy'], [0xB2, 'ind']]);
set('LDX', [[0xA2, 'imm'], [0xA6, 'zp'], [0xB6, 'zpy'], [0xAE, 'abs'], [0xBE, 'absy']]); set('LDY', [[0xA0, 'imm'], [0xA4, 'zp'], [0xB4, 'zpx'], [0xAC, 'abs'], [0xBC, 'absx']]);
set('LSR', [[0x4A, 'acc'], [0x46, 'zp'], [0x56, 'zpx'], [0x4E, 'abs'], [0x5E, 'absx']]); set('NOP', [[0xEA, 'imp']]);
set('ORA', [[0x09, 'imm'], [0x05, 'zp'], [0x15, 'zpx'], [0x0D, 'abs'], [0x1D, 'absx'], [0x19, 'absy'], [0x01, 'indx'], [0x11, 'indy'], [0x12, 'ind']]);
set('PHA', [[0x48, 'imp']]); set('PHP', [[0x08, 'imp']]); set('PLA', [[0x68, 'imp']]); set('PLP', [[0x28, 'imp']]); set('PHX', [[0xDA, 'imp']]); set('PHY', [[0x5A, 'imp']]); set('PLX', [[0xFA, 'imp']]); set('PLY', [[0x7A, 'imp']]);
set('ROL', [[0x2A, 'acc'], [0x26, 'zp'], [0x36, 'zpx'], [0x2E, 'abs'], [0x3E, 'absx']]); set('ROR', [[0x6A, 'acc'], [0x66, 'zp'], [0x76, 'zpx'], [0x6E, 'abs'], [0x7E, 'absx']]);
set('RTI', [[0x40, 'imp']]); set('RTS', [[0x60, 'imp']]);
set('SBC', [[0xE9, 'imm'], [0xE5, 'zp'], [0xF5, 'zpx'], [0xED, 'abs'], [0xFD, 'absx'], [0xF9, 'absy'], [0xE1, 'indx'], [0xF1, 'indy'], [0xF2, 'ind']]);
set('SEC', [[0x38, 'imp']]); set('SED', [[0xF8, 'imp']]); set('SEI', [[0x78, 'imp']]);
set('STA', [[0x85, 'zp'], [0x95, 'zpx'], [0x8D, 'abs'], [0x9D, 'absx'], [0x99, 'absy'], [0x81, 'indx'], [0x91, 'indy'], [0x92, 'ind']]);
set('STX', [[0x86, 'zp'], [0x96, 'zpy'], [0x8E, 'abs']]); set('STY', [[0x84, 'zp'], [0x94, 'zpx'], [0x8C, 'abs']]); set('STZ', [[0x64, 'zp'], [0x74, 'zpx'], [0x9C, 'abs'], [0x9E, 'absx']]);
set('TAX', [[0xAA, 'imp']]); set('TAY', [[0xA8, 'imp']]); set('TSX', [[0xBA, 'imp']]); set('TXA', [[0x8A, 'imp']]); set('TXS', [[0x9A, 'imp']]); set('TYA', [[0x98, 'imp']]);
set('TRB', [[0x14, 'zp'], [0x1C, 'abs']]); set('TSB', [[0x04, 'zp'], [0x0C, 'abs']]);
const LEN = { imp: 1, acc: 1, imm: 2, zp: 2, zpx: 2, zpy: 2, rel: 2, abs: 3, absx: 3, absy: 3, indx: 2, indy: 2, ind: 2, absind: 3, absxind: 3 };
const h2 = v => v.toString(16).padStart(2, '0'), h4 = v => v.toString(16).padStart(4, '0');
function disasm(mem, start, end, read) {
  const rd = read || (a => mem[a]); const out = []; let pc = start;
  while (pc < end) {
    const op = rd(pc), e = OPS[op];
    if (!e) { out.push(`${h4(pc)}  ${h2(op)}        ???`); pc++; continue; }
    const [mn, mode] = e, n = LEN[mode], b1 = rd(pc + 1), b2 = rd(pc + 2), w = b1 | (b2 << 8);
    let arg = '';
    switch (mode) {
      case 'imm': arg = '#$' + h2(b1); break; case 'zp': arg = '$' + h2(b1); break; case 'zpx': arg = '$' + h2(b1) + ',X'; break; case 'zpy': arg = '$' + h2(b1) + ',Y'; break;
      case 'rel': arg = '$' + h4((pc + 2 + ((b1 << 24) >> 24)) & 0xFFFF); break; case 'abs': arg = '$' + h4(w); break; case 'absx': arg = '$' + h4(w) + ',X'; break; case 'absy': arg = '$' + h4(w) + ',Y'; break;
      case 'indx': arg = '($' + h2(b1) + ',X)'; break; case 'indy': arg = '($' + h2(b1) + '),Y'; break; case 'ind': arg = '($' + h2(b1) + ')'; break; case 'absind': arg = '($' + h4(w) + ')'; break; case 'absxind': arg = '($' + h4(w) + ',X)'; break;
      case 'acc': arg = 'A'; break;
    }
    const bytes = []; for (let i = 0; i < n; i++) bytes.push(h2(rd(pc + i)));
    out.push(`${h4(pc)}  ${bytes.join(' ').padEnd(9)} ${mn} ${arg}`);
    pc += n;
  }
  return out;
}
module.exports = { disasm, OPS, LEN };
