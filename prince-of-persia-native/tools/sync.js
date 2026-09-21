// sync.js — copies the Apple's game state into the native engine (used at level changes while the
// the Apple's level load is not compared frame by frame, so the two are aligned afterwards)
const ZP = require('./compare_zp.js');
module.exports = function resync(POP, o, os) {
  const ST = POP.state, S = ST.S, aux = o.m.aux;
  const rec = (c, b) => { c.Posn = os.zp[b]; c.X = os.zp[b + 1]; c.Y = os.zp[b + 2]; c.Face = os.zp[b + 3]; c.BlockX = os.zp[b + 4]; c.BlockY = os.zp[b + 5]; c.Action = os.zp[b + 6]; c.XVel = os.zp[b + 7]; c.YVel = os.zp[b + 8]; c.Seq = os.zp[b + 9] | os.zp[b + 10] << 8; c.Scrn = os.zp[b + 11]; c.Repeat = os.zp[b + 12]; c.ID = os.zp[b + 13]; c.Sword = os.zp[b + 14]; c.Life = os.zp[b + 15]; };
  rec(ST.Shad, 0x60); rec(ST.Kid, 0x50); rec(ST.Char, 0x40);
  POP.grafix.rnd.seed = os.zp[0x9e];
  for (const k of Object.keys(ZP)) if (typeof S[k] === 'number') S[k] = os.zp[ZP[k]];
  ST.blue.set(aux.subarray(0xB700, 0xB700 + 2304));
  S.trloc.set(aux.subarray(0xB600, 0xB620)); S.trscrn.set(aux.subarray(0xB620, 0xB640)); S.trdirec.set(aux.subarray(0xB640, 0xB660));
  S.mobx.set(aux.subarray(0xB660, 0xB670)); S.moby.set(aux.subarray(0xB670, 0xB680)); S.mobscrn.set(aux.subarray(0xB680, 0xB690)); S.mobvel.set(aux.subarray(0xB690, 0xB6A0)); S.mobtype.set(aux.subarray(0xB6A0, 0xB6B0)); S.moblevel.set(aux.subarray(0xB6B0, 0xB6C0));
  S.trobcount = aux[0xB6E0];
  S.FrameCount = os.p2[0x106] | os.p2[0x107] << 8; S.NextTimeMsg = os.p2[0x101]; S.MinLeft = os.p2[0x100]; S.SecLeft = os.p2[0x102];
  POP.hires.mem.set(o.m.main.subarray(0x2000, 0x6000));
};
