// cpu6502.js — a 6502 with the 65C02 additions, driven through a bus object that
// supplies read(addr) and write(addr, value).  step() runs one instruction and returns
// its cycle count.
var CPU6502 = (function () {
  'use strict';
  var C = 1, Z = 2, I = 4, D = 8, B = 16, U = 32, V = 64, N = 128;

  function CPU(bus) {
    this.bus = bus;
    this.a = 0; this.x = 0; this.y = 0; this.sp = 0xFF; this.pc = 0; this.p = U | I;
    this.cycles = 0; this.halted = false;
  }
  var P = CPU.prototype;
  P.reset = function () { this.sp = 0xFD; this.p = U | I; this.pc = this.read16(0xFFFC); };
  P.read = function (a) { return this.bus.read(a & 0xFFFF); };
  P.write = function (a, v) { this.bus.write(a & 0xFFFF, v & 0xFF); };
  P.read16 = function (a) { return this.read(a) | this.read((a + 1) & 0xFFFF) << 8; };
  P.push = function (v) { this.write(0x100 | this.sp, v); this.sp = (this.sp - 1) & 0xFF; };
  P.pull = function () { this.sp = (this.sp + 1) & 0xFF; return this.read(0x100 | this.sp); };
  P.setNZ = function (v) { this.p = (this.p & ~(N | Z)) | (v & N) | (v === 0 ? Z : 0); return v; };
  P.branch = function (cond) {
    var off = this.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
    if (!cond) return 2;
    var target = (this.pc + (off << 24 >> 24)) & 0xFFFF, extra = ((target ^ this.pc) & 0xFF00) ? 2 : 1;
    this.pc = target; return 2 + extra;
  };
  // addressing: each returns the effective address; this.extra collects page-cross cycles
  P.imm = function () { var a = this.pc; this.pc = (this.pc + 1) & 0xFFFF; return a; };
  P.zp = function () { var a = this.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF; return a; };
  P.zpx = function () { var a = (this.read(this.pc) + this.x) & 0xFF; this.pc = (this.pc + 1) & 0xFFFF; return a; };
  P.zpy = function () { var a = (this.read(this.pc) + this.y) & 0xFF; this.pc = (this.pc + 1) & 0xFFFF; return a; };
  P.abs = function () { var a = this.read16(this.pc); this.pc = (this.pc + 2) & 0xFFFF; return a; };
  P.abx = function (pen) { var b = this.read16(this.pc); this.pc = (this.pc + 2) & 0xFFFF; var a = (b + this.x) & 0xFFFF; if (pen && ((a ^ b) & 0xFF00)) this.extra++; return a; };
  P.aby = function (pen) { var b = this.read16(this.pc); this.pc = (this.pc + 2) & 0xFFFF; var a = (b + this.y) & 0xFFFF; if (pen && ((a ^ b) & 0xFF00)) this.extra++; return a; };
  P.izx = function () { var z = (this.read(this.pc) + this.x) & 0xFF; this.pc = (this.pc + 1) & 0xFFFF; return this.read(z) | this.read((z + 1) & 0xFF) << 8; };
  P.izy = function (pen) { var z = this.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF; var b = this.read(z) | this.read((z + 1) & 0xFF) << 8; var a = (b + this.y) & 0xFFFF; if (pen && ((a ^ b) & 0xFF00)) this.extra++; return a; };
  P.izp = function () { var z = this.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF; return this.read(z) | this.read((z + 1) & 0xFF) << 8; };
  // operations
  P.adc = function (v) {
    var a = this.a, c = this.p & C, r = a + v + c;
    if (this.p & D) {
      var lo = (a & 0x0F) + (v & 0x0F) + c, hi = (a & 0xF0) + (v & 0xF0);
      if (lo > 0x09) { hi += 0x10; lo += 0x06; }
      this.p = (this.p & ~(N | V | Z | C)) | (hi & 0x80) | ((~(a ^ v) & (a ^ hi) & 0x80) ? V : 0) | ((r & 0xFF) === 0 ? Z : 0);
      if (hi > 0x90) hi += 0x60;
      if (hi & 0xFF00) this.p |= C;
      this.a = (hi & 0xF0) | (lo & 0x0F);
    } else {
      this.p = (this.p & ~(C | V)) | (r > 0xFF ? C : 0) | ((~(a ^ v) & (a ^ r) & 0x80) ? V : 0);
      this.a = this.setNZ(r & 0xFF);
    }
  };
  P.sbc = function (v) {
    var a = this.a, c = this.p & C, r = a - v - (1 - c);
    this.p = (this.p & ~(C | V)) | (r >= 0 ? C : 0) | (((a ^ v) & (a ^ r) & 0x80) ? V : 0);
    this.setNZ(r & 0xFF);
    if (this.p & D) {
      var lo = (a & 0x0F) - (v & 0x0F) - (1 - c), hi = (a & 0xF0) - (v & 0xF0);
      if (lo & 0x10) { lo -= 6; hi -= 0x10; }
      if (hi & 0x100) hi -= 0x60;
      this.a = (hi & 0xF0) | (lo & 0x0F);
    } else this.a = r & 0xFF;
  };
  P.cmp = function (r, v) { var d = r - v; this.p = (this.p & ~C) | (d >= 0 ? C : 0); this.setNZ(d & 0xFF); };
  P.asl = function (v) { this.p = (this.p & ~C) | (v & 0x80 ? C : 0); return this.setNZ((v << 1) & 0xFF); };
  P.lsr = function (v) { this.p = (this.p & ~C) | (v & 1 ? C : 0); return this.setNZ(v >> 1); };
  P.rol = function (v) { var c = this.p & C; this.p = (this.p & ~C) | (v & 0x80 ? C : 0); return this.setNZ(((v << 1) | c) & 0xFF); };
  P.ror = function (v) { var c = this.p & C; this.p = (this.p & ~C) | (v & 1 ? C : 0); return this.setNZ((v >> 1) | (c ? 0x80 : 0)); };
  P.bit = function (v) { this.p = (this.p & ~(N | V | Z)) | (v & (N | V)) | ((this.a & v) === 0 ? Z : 0); };
  P.rmw = function (addr, fn) { var v = this.read(addr); this.write(addr, v); var r = fn.call(this, v); this.write(addr, r); };

  P.step = function () {
    var op = this.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
    this.extra = 0;
    var a, v, cyc;
    switch (op) {
      // ---- loads/stores
      case 0xA9: this.a = this.setNZ(this.read(this.imm())); cyc = 2; break;
      case 0xA5: this.a = this.setNZ(this.read(this.zp())); cyc = 3; break;
      case 0xB5: this.a = this.setNZ(this.read(this.zpx())); cyc = 4; break;
      case 0xAD: this.a = this.setNZ(this.read(this.abs())); cyc = 4; break;
      case 0xBD: this.a = this.setNZ(this.read(this.abx(1))); cyc = 4; break;
      case 0xB9: this.a = this.setNZ(this.read(this.aby(1))); cyc = 4; break;
      case 0xA1: this.a = this.setNZ(this.read(this.izx())); cyc = 6; break;
      case 0xB1: this.a = this.setNZ(this.read(this.izy(1))); cyc = 5; break;
      case 0xB2: this.a = this.setNZ(this.read(this.izp())); cyc = 5; break;
      case 0xA2: this.x = this.setNZ(this.read(this.imm())); cyc = 2; break;
      case 0xA6: this.x = this.setNZ(this.read(this.zp())); cyc = 3; break;
      case 0xB6: this.x = this.setNZ(this.read(this.zpy())); cyc = 4; break;
      case 0xAE: this.x = this.setNZ(this.read(this.abs())); cyc = 4; break;
      case 0xBE: this.x = this.setNZ(this.read(this.aby(1))); cyc = 4; break;
      case 0xA0: this.y = this.setNZ(this.read(this.imm())); cyc = 2; break;
      case 0xA4: this.y = this.setNZ(this.read(this.zp())); cyc = 3; break;
      case 0xB4: this.y = this.setNZ(this.read(this.zpx())); cyc = 4; break;
      case 0xAC: this.y = this.setNZ(this.read(this.abs())); cyc = 4; break;
      case 0xBC: this.y = this.setNZ(this.read(this.abx(1))); cyc = 4; break;
      case 0x85: this.write(this.zp(), this.a); cyc = 3; break;
      case 0x95: this.write(this.zpx(), this.a); cyc = 4; break;
      case 0x8D: this.write(this.abs(), this.a); cyc = 4; break;
      case 0x9D: this.write(this.abx(0), this.a); cyc = 5; break;
      case 0x99: this.write(this.aby(0), this.a); cyc = 5; break;
      case 0x81: this.write(this.izx(), this.a); cyc = 6; break;
      case 0x91: this.write(this.izy(0), this.a); cyc = 6; break;
      case 0x92: this.write(this.izp(), this.a); cyc = 5; break;
      case 0x86: this.write(this.zp(), this.x); cyc = 3; break;
      case 0x96: this.write(this.zpy(), this.x); cyc = 4; break;
      case 0x8E: this.write(this.abs(), this.x); cyc = 4; break;
      case 0x84: this.write(this.zp(), this.y); cyc = 3; break;
      case 0x94: this.write(this.zpx(), this.y); cyc = 4; break;
      case 0x8C: this.write(this.abs(), this.y); cyc = 4; break;
      case 0x64: this.write(this.zp(), 0); cyc = 3; break;
      case 0x74: this.write(this.zpx(), 0); cyc = 4; break;
      case 0x9C: this.write(this.abs(), 0); cyc = 4; break;
      case 0x9E: this.write(this.abx(0), 0); cyc = 5; break;
      // ---- transfers / stack
      case 0xAA: this.x = this.setNZ(this.a); cyc = 2; break;
      case 0xA8: this.y = this.setNZ(this.a); cyc = 2; break;
      case 0x8A: this.a = this.setNZ(this.x); cyc = 2; break;
      case 0x98: this.a = this.setNZ(this.y); cyc = 2; break;
      case 0xBA: this.x = this.setNZ(this.sp); cyc = 2; break;
      case 0x9A: this.sp = this.x; cyc = 2; break;
      case 0x48: this.push(this.a); cyc = 3; break;
      case 0x68: this.a = this.setNZ(this.pull()); cyc = 4; break;
      case 0x08: this.push(this.p | B | U); cyc = 3; break;
      case 0x28: this.p = (this.pull() | U) & ~B; cyc = 4; break;
      case 0xDA: this.push(this.x); cyc = 3; break;
      case 0xFA: this.x = this.setNZ(this.pull()); cyc = 4; break;
      case 0x5A: this.push(this.y); cyc = 3; break;
      case 0x7A: this.y = this.setNZ(this.pull()); cyc = 4; break;
      // ---- arithmetic
      case 0x69: this.adc(this.read(this.imm())); cyc = 2; break;
      case 0x65: this.adc(this.read(this.zp())); cyc = 3; break;
      case 0x75: this.adc(this.read(this.zpx())); cyc = 4; break;
      case 0x6D: this.adc(this.read(this.abs())); cyc = 4; break;
      case 0x7D: this.adc(this.read(this.abx(1))); cyc = 4; break;
      case 0x79: this.adc(this.read(this.aby(1))); cyc = 4; break;
      case 0x61: this.adc(this.read(this.izx())); cyc = 6; break;
      case 0x71: this.adc(this.read(this.izy(1))); cyc = 5; break;
      case 0x72: this.adc(this.read(this.izp())); cyc = 5; break;
      case 0xE9: this.sbc(this.read(this.imm())); cyc = 2; break;
      case 0xE5: this.sbc(this.read(this.zp())); cyc = 3; break;
      case 0xF5: this.sbc(this.read(this.zpx())); cyc = 4; break;
      case 0xED: this.sbc(this.read(this.abs())); cyc = 4; break;
      case 0xFD: this.sbc(this.read(this.abx(1))); cyc = 4; break;
      case 0xF9: this.sbc(this.read(this.aby(1))); cyc = 4; break;
      case 0xE1: this.sbc(this.read(this.izx())); cyc = 6; break;
      case 0xF1: this.sbc(this.read(this.izy(1))); cyc = 5; break;
      case 0xF2: this.sbc(this.read(this.izp())); cyc = 5; break;
      case 0xC9: this.cmp(this.a, this.read(this.imm())); cyc = 2; break;
      case 0xC5: this.cmp(this.a, this.read(this.zp())); cyc = 3; break;
      case 0xD5: this.cmp(this.a, this.read(this.zpx())); cyc = 4; break;
      case 0xCD: this.cmp(this.a, this.read(this.abs())); cyc = 4; break;
      case 0xDD: this.cmp(this.a, this.read(this.abx(1))); cyc = 4; break;
      case 0xD9: this.cmp(this.a, this.read(this.aby(1))); cyc = 4; break;
      case 0xC1: this.cmp(this.a, this.read(this.izx())); cyc = 6; break;
      case 0xD1: this.cmp(this.a, this.read(this.izy(1))); cyc = 5; break;
      case 0xD2: this.cmp(this.a, this.read(this.izp())); cyc = 5; break;
      case 0xE0: this.cmp(this.x, this.read(this.imm())); cyc = 2; break;
      case 0xE4: this.cmp(this.x, this.read(this.zp())); cyc = 3; break;
      case 0xEC: this.cmp(this.x, this.read(this.abs())); cyc = 4; break;
      case 0xC0: this.cmp(this.y, this.read(this.imm())); cyc = 2; break;
      case 0xC4: this.cmp(this.y, this.read(this.zp())); cyc = 3; break;
      case 0xCC: this.cmp(this.y, this.read(this.abs())); cyc = 4; break;
      case 0xE6: this.rmw(this.zp(), function (v) { return this.setNZ((v + 1) & 0xFF); }); cyc = 5; break;
      case 0xF6: this.rmw(this.zpx(), function (v) { return this.setNZ((v + 1) & 0xFF); }); cyc = 6; break;
      case 0xEE: this.rmw(this.abs(), function (v) { return this.setNZ((v + 1) & 0xFF); }); cyc = 6; break;
      case 0xFE: this.rmw(this.abx(0), function (v) { return this.setNZ((v + 1) & 0xFF); }); cyc = 7; break;
      case 0xC6: this.rmw(this.zp(), function (v) { return this.setNZ((v - 1) & 0xFF); }); cyc = 5; break;
      case 0xD6: this.rmw(this.zpx(), function (v) { return this.setNZ((v - 1) & 0xFF); }); cyc = 6; break;
      case 0xCE: this.rmw(this.abs(), function (v) { return this.setNZ((v - 1) & 0xFF); }); cyc = 6; break;
      case 0xDE: this.rmw(this.abx(0), function (v) { return this.setNZ((v - 1) & 0xFF); }); cyc = 7; break;
      case 0xE8: this.x = this.setNZ((this.x + 1) & 0xFF); cyc = 2; break;
      case 0xC8: this.y = this.setNZ((this.y + 1) & 0xFF); cyc = 2; break;
      case 0xCA: this.x = this.setNZ((this.x - 1) & 0xFF); cyc = 2; break;
      case 0x88: this.y = this.setNZ((this.y - 1) & 0xFF); cyc = 2; break;
      case 0x1A: this.a = this.setNZ((this.a + 1) & 0xFF); cyc = 2; break;
      case 0x3A: this.a = this.setNZ((this.a - 1) & 0xFF); cyc = 2; break;
      // ---- logic
      case 0x29: this.a = this.setNZ(this.a & this.read(this.imm())); cyc = 2; break;
      case 0x25: this.a = this.setNZ(this.a & this.read(this.zp())); cyc = 3; break;
      case 0x35: this.a = this.setNZ(this.a & this.read(this.zpx())); cyc = 4; break;
      case 0x2D: this.a = this.setNZ(this.a & this.read(this.abs())); cyc = 4; break;
      case 0x3D: this.a = this.setNZ(this.a & this.read(this.abx(1))); cyc = 4; break;
      case 0x39: this.a = this.setNZ(this.a & this.read(this.aby(1))); cyc = 4; break;
      case 0x21: this.a = this.setNZ(this.a & this.read(this.izx())); cyc = 6; break;
      case 0x31: this.a = this.setNZ(this.a & this.read(this.izy(1))); cyc = 5; break;
      case 0x32: this.a = this.setNZ(this.a & this.read(this.izp())); cyc = 5; break;
      case 0x09: this.a = this.setNZ(this.a | this.read(this.imm())); cyc = 2; break;
      case 0x05: this.a = this.setNZ(this.a | this.read(this.zp())); cyc = 3; break;
      case 0x15: this.a = this.setNZ(this.a | this.read(this.zpx())); cyc = 4; break;
      case 0x0D: this.a = this.setNZ(this.a | this.read(this.abs())); cyc = 4; break;
      case 0x1D: this.a = this.setNZ(this.a | this.read(this.abx(1))); cyc = 4; break;
      case 0x19: this.a = this.setNZ(this.a | this.read(this.aby(1))); cyc = 4; break;
      case 0x01: this.a = this.setNZ(this.a | this.read(this.izx())); cyc = 6; break;
      case 0x11: this.a = this.setNZ(this.a | this.read(this.izy(1))); cyc = 5; break;
      case 0x12: this.a = this.setNZ(this.a | this.read(this.izp())); cyc = 5; break;
      case 0x49: this.a = this.setNZ(this.a ^ this.read(this.imm())); cyc = 2; break;
      case 0x45: this.a = this.setNZ(this.a ^ this.read(this.zp())); cyc = 3; break;
      case 0x55: this.a = this.setNZ(this.a ^ this.read(this.zpx())); cyc = 4; break;
      case 0x4D: this.a = this.setNZ(this.a ^ this.read(this.abs())); cyc = 4; break;
      case 0x5D: this.a = this.setNZ(this.a ^ this.read(this.abx(1))); cyc = 4; break;
      case 0x59: this.a = this.setNZ(this.a ^ this.read(this.aby(1))); cyc = 4; break;
      case 0x41: this.a = this.setNZ(this.a ^ this.read(this.izx())); cyc = 6; break;
      case 0x51: this.a = this.setNZ(this.a ^ this.read(this.izy(1))); cyc = 5; break;
      case 0x52: this.a = this.setNZ(this.a ^ this.read(this.izp())); cyc = 5; break;
      case 0x24: this.bit(this.read(this.zp())); cyc = 3; break;
      case 0x2C: this.bit(this.read(this.abs())); cyc = 4; break;
      case 0x34: this.bit(this.read(this.zpx())); cyc = 4; break;
      case 0x3C: this.bit(this.read(this.abx(1))); cyc = 4; break;
      case 0x89: v = this.read(this.imm()); this.p = (this.p & ~Z) | ((this.a & v) === 0 ? Z : 0); cyc = 2; break;
      case 0x04: a = this.zp(); v = this.read(a); this.p = (this.p & ~Z) | ((this.a & v) === 0 ? Z : 0); this.write(a, v | this.a); cyc = 5; break;
      case 0x0C: a = this.abs(); v = this.read(a); this.p = (this.p & ~Z) | ((this.a & v) === 0 ? Z : 0); this.write(a, v | this.a); cyc = 6; break;
      case 0x14: a = this.zp(); v = this.read(a); this.p = (this.p & ~Z) | ((this.a & v) === 0 ? Z : 0); this.write(a, v & ~this.a); cyc = 5; break;
      case 0x1C: a = this.abs(); v = this.read(a); this.p = (this.p & ~Z) | ((this.a & v) === 0 ? Z : 0); this.write(a, v & ~this.a); cyc = 6; break;
      // ---- shifts
      case 0x0A: this.a = this.asl(this.a); cyc = 2; break;
      case 0x06: this.rmw(this.zp(), this.asl); cyc = 5; break;
      case 0x16: this.rmw(this.zpx(), this.asl); cyc = 6; break;
      case 0x0E: this.rmw(this.abs(), this.asl); cyc = 6; break;
      case 0x1E: this.rmw(this.abx(0), this.asl); cyc = 7; break;
      case 0x4A: this.a = this.lsr(this.a); cyc = 2; break;
      case 0x46: this.rmw(this.zp(), this.lsr); cyc = 5; break;
      case 0x56: this.rmw(this.zpx(), this.lsr); cyc = 6; break;
      case 0x4E: this.rmw(this.abs(), this.lsr); cyc = 6; break;
      case 0x5E: this.rmw(this.abx(0), this.lsr); cyc = 7; break;
      case 0x2A: this.a = this.rol(this.a); cyc = 2; break;
      case 0x26: this.rmw(this.zp(), this.rol); cyc = 5; break;
      case 0x36: this.rmw(this.zpx(), this.rol); cyc = 6; break;
      case 0x2E: this.rmw(this.abs(), this.rol); cyc = 6; break;
      case 0x3E: this.rmw(this.abx(0), this.rol); cyc = 7; break;
      case 0x6A: this.a = this.ror(this.a); cyc = 2; break;
      case 0x66: this.rmw(this.zp(), this.ror); cyc = 5; break;
      case 0x76: this.rmw(this.zpx(), this.ror); cyc = 6; break;
      case 0x6E: this.rmw(this.abs(), this.ror); cyc = 6; break;
      case 0x7E: this.rmw(this.abx(0), this.ror); cyc = 7; break;
      // ---- flags
      case 0x18: this.p &= ~C; cyc = 2; break;
      case 0x38: this.p |= C; cyc = 2; break;
      case 0x58: this.p &= ~I; cyc = 2; break;
      case 0x78: this.p |= I; cyc = 2; break;
      case 0xB8: this.p &= ~V; cyc = 2; break;
      case 0xD8: this.p &= ~D; cyc = 2; break;
      case 0xF8: this.p |= D; cyc = 2; break;
      // ---- branches / jumps
      case 0x10: cyc = this.branch(!(this.p & N)); break;
      case 0x30: cyc = this.branch(this.p & N); break;
      case 0x50: cyc = this.branch(!(this.p & V)); break;
      case 0x70: cyc = this.branch(this.p & V); break;
      case 0x90: cyc = this.branch(!(this.p & C)); break;
      case 0xB0: cyc = this.branch(this.p & C); break;
      case 0xD0: cyc = this.branch(!(this.p & Z)); break;
      case 0xF0: cyc = this.branch(this.p & Z); break;
      case 0x80: cyc = this.branch(true); break;
      case 0x4C: this.pc = this.read16(this.pc); cyc = 3; break;
      case 0x6C: a = this.read16(this.pc); this.pc = this.read16(a); cyc = 5; break;
      case 0x7C: a = (this.read16(this.pc) + this.x) & 0xFFFF; this.pc = this.read16(a); cyc = 6; break;
      case 0x20: a = this.read16(this.pc); this.pc = (this.pc + 1) & 0xFFFF; this.push(this.pc >> 8); this.push(this.pc & 0xFF); this.pc = a; cyc = 6; break;
      case 0x60: this.pc = (this.pull() | this.pull() << 8); this.pc = (this.pc + 1) & 0xFFFF; cyc = 6; break;
      case 0x40: this.p = (this.pull() | U) & ~B; this.pc = this.pull() | this.pull() << 8; cyc = 6; break;
      case 0x00: this.pc = (this.pc + 1) & 0xFFFF; this.push(this.pc >> 8); this.push(this.pc & 0xFF); this.push(this.p | B | U); this.p |= I; this.pc = this.read16(0xFFFE); cyc = 7; break;
      case 0xEA: cyc = 2; break;
      default:
        // undocumented / unused opcodes: treat as NOPs of the right length
        if ((op & 0x0F) === 0x03 || (op & 0x0F) === 0x0B || (op & 0x0F) === 0x07 || (op & 0x0F) === 0x0F) cyc = 1;
        else if (op === 0x02 || op === 0x22 || op === 0x42 || op === 0x62 || op === 0x82 || op === 0xC2 || op === 0xE2 || op === 0x44 || op === 0x54 || op === 0xD4 || op === 0xF4) { this.pc = (this.pc + 1) & 0xFFFF; cyc = 3; }
        else if (op === 0x5C || op === 0xDC || op === 0xFC) { this.pc = (this.pc + 2) & 0xFFFF; cyc = 4; }
        else cyc = 2;
    }
    cyc += this.extra;
    this.cycles += cyc;
    return cyc;
  };
  return CPU;
})();
if (typeof module !== 'undefined') module.exports = CPU6502;
