// pop_state.js — the game's memory: the constants from EQ/GAMEEQ/MOVEDATA/SEQDATA/SOUNDNAMES, the
// tables of TABLES.S and BGDATA.S, the level blueprint, the character records and every global the
// original kept in zero page and pages 2-3, plus the character subroutines of CTRLSUBS.S.
var POP = POP || {};
POP.state = (function () {
  'use strict';
  var u8 = function (x) { return x & 0xFF; }, s8 = function (x) { return (x << 24) >> 24; };

  // ---------------------------------------------------------------- object ids (MOVEDATA)
  var OBJ = { space: 0, floor: 1, spikes: 2, posts: 3, gate: 4, dpressplate: 5, pressplate: 6, panelwif: 7, pillarbottom: 8, pillartop: 9, flask: 10, loose: 11,
    panelwof: 12, mirror: 13, rubble: 14, upressplate: 15, exit: 16, exit2: 17, slicer: 18, torch: 19, block: 20, bones: 21, sword: 22, window: 23, window2: 24,
    archbot: 25, archtop1: 26, archtop2: 27, archtop3: 28, archtop4: 29 };
  var torchLast = 17, bubbLast = 8, spikeExt = 5, spikeRet = 9, slicerExt = 2, slicerRet = 6, Ffalling = 10, gmaxval = 47 * 4, gminval = 0;
  // sounds (SOUNDNAMES)
  var SND = { PlateDown: 0, PlateUp: 1, GateDown: 2, SpecialKey1: 3, SpecialKey2: 4, Splat: 5, MirrorCrack: 6, LooseCrash: 7, GotKey: 8, Footstep: 9, RaisingExit: 10,
    RaisingGate: 11, LoweringGate: 12, SmackWall: 13, Impaled: 14, GateSlam: 15, FlashMsg: 16, SwordClash1: 17, SwordClash2: 18, JawsClash: 19 };
  var SONG = { Accid: 1, Heroic: 2, Danger: 3, Sword: 4, Rejoin: 5, Shadow: 6, Vict: 7, Stairs: 8, Upstairs: 9, Jaffar: 10, Potion: 11, ShortPot: 12, Timer: 13, Tragic: 14, Embrace: 15, Heartbeat: 16,
    Presents: 1, Byline: 2, Title: 3, Prolog: 4, Sumup: 5, Princess: 7, Squeek: 8, Vizier: 9, Buildup: 10, Magic: 11, StTimer: 12, Epilog: 1, Curtain: 2 };
  // sequences (SEQDATA)
  var SEQ = { startrun: 1, stand: 2, standjump: 3, runjump: 4, turn: 5, runturn: 6, stepfall: 7, jumphangMed: 8, hang: 9, climbup: 10, hangdrop: 11, freefall: 12, runstop: 13,
    jumpup: 14, fallhang: 15, jumpbackhang: 16, softland: 17, jumpfall: 18, stepfall2: 19, medland: 20, rjumpfall: 21, hardland: 22, hangfall: 23, jumphangLong: 24,
    hangstraight: 25, rdiveroll: 26, sdiveroll: 27, highjump: 28, stepfwd1: 29, turnrun: 43, testfoot: 44, bumpfall: 45, hardbump: 46, bump: 47, superhijump: 48,
    standup: 49, stoop: 50, impale: 51, crush: 52, deadfall: 53, halve: 54, engarde: 55, advance: 56, retreat: 57, strike: 58, flee: 59, turnengarde: 60, strikeblock: 61,
    readyblock: 62, landengarde: 63, bumpengfwd: 64, bumpengback: 65, blocktostrike: 66, strikeadv: 67, climbdown: 68, blockedstrike: 69, climbstairs: 70, dropdead: 71,
    stepback: 72, climbfail: 73, stabbed: 74, faststrike: 75, strikeret: 76, alertstand: 77, drinkpotion: 78, crawl: 79, alertturn: 80, fightfall: 81, efightfall: 82,
    efightfallfwd: 83, running: 84, stabkill: 85, fastadvance: 86, goalertstand: 87, arise: 88, turndraw: 89, guardengarde: 90, pickupsword: 91, resheathe: 92,
    fastsheathe: 93, Pstand: 94, Vstand: 95, Vapproach: 96, Vstop: 97, Palert: 98, Pback: 99, Vexit: 100, Mclimb: 101, Vraise: 102, Plie: 103, patchfall: 104,
    Mscurry: 105, Mstop: 106, Mleave: 107, Pembrace: 108, Pwaiting: 109, Pstroke: 110, Prise: 111, Pcrouch: 112, Pslump: 113, Mraise: 114 };
  var OPC = { goto: -1, aboutface: -2, up: -3, down: -4, chx: -5, chy: -6, act: -7, setfall: -8, ifwtless: -9, die: -10, jaru: -11, jard: -12, effect: -13, tap: -14, nextlevel: -15 };
  var Fcheckmark = 0x40, Fthinmark = 0x20, Ffootmark = 0x1F;
  var floorheight = 15, angle = 7, VertDist = 11;
  var TypeKid = 0, TypeShad = 1, TypeGd = 2, TypeSword = 3, TypeReflect = 4, TypeComix = 5, TypeFF = 0x80;
  var ScrnWidth = 140, ScrnLeft = 58, ScrnRight = ScrnLeft + ScrnWidth - 1, ScrnTop = 0, ScrnBottom = 191;
  var idmask = 0x1F, reqmask = 0x20;

  // ---------------------------------------------------------------- TABLES.S
  var ByteTable = new Uint8Array(256), OffsetTable = new Uint8Array(256), BlockTable = new Int8Array(256), PixelTable = new Uint8Array(256);
  for (var i = 0; i < 256; i++) { ByteTable[i] = Math.floor(i / 7); OffsetTable[i] = i % 7; }
  // BlockTable: 2 of -5, then 18 blocks of 14, then 2 of 13
  (function () { var b = -5, k = 0; BlockTable[k] = b; PixelTable[k++] = 12; BlockTable[k] = b; PixelTable[k++] = 13;
    for (var j = 0; j < 18; j++) { b++; for (var p = 0; p < 14; p++) { BlockTable[k] = b; PixelTable[k++] = p; } }
    b++; BlockTable[k] = b; PixelTable[k++] = 0; BlockTable[k] = b; PixelTable[k++] = 1; })();
  var Mult10 = [], Mult7 = [], Mult30 = [];
  for (i = 0; i < 16; i++) { Mult10.push(i * 10); Mult7.push(i * 7); }
  var BlockEdge = []; for (i = 0; i < 20; i++) BlockEdge.push(u8(-12 + 14 * i));          // index block x + 5
  var Blox1 = 63, Blox2 = 126, Blox3 = 189, Blox4 = 252, ScrnBot = 191, TVertDist = 10, DHeight = 3;
  var BlockTop = [u8(ScrnBot + 1 - Blox4), u8(ScrnBot + 1 - Blox3), u8(ScrnBot + 1 - Blox2), u8(ScrnBot + 1 - Blox1), u8(ScrnBot + 1)];   // index block y + 1
  var BlockBot = [u8(ScrnBot - Blox3), u8(ScrnBot - Blox2), u8(ScrnBot - Blox1), u8(ScrnBot), u8(ScrnBot + Blox1)];
  var FloorY = [u8(ScrnBot - Blox3 - TVertDist), u8(ScrnBot - Blox2 - TVertDist), u8(ScrnBot - Blox1 - TVertDist), u8(ScrnBot - TVertDist), u8(ScrnBot + Blox1 - TVertDist)];
  var BlockAy = [u8(ScrnBot - Blox3 - DHeight), u8(ScrnBot - Blox2 - DHeight), u8(ScrnBot - Blox1 - DHeight), u8(ScrnBot - DHeight), u8(ScrnBot + Blox1 - DHeight)];

  // ---------------------------------------------------------------- BGDATA.S
  var BG = {
    maska: [0x00, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x00, 0x03, 0x03, 0x00, 0x03, 0x03, 0x03, 0x03, 0x00, 0x00, 0x03, 0x00, 0x03, 0x00, 0x03, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00],
    piecea: [0x00, 0x01, 0x05, 0x07, 0x0a, 0x01, 0x01, 0x0a, 0x10, 0x00, 0x01, 0x00, 0x00, 0x14, 0x20, 0x4b, 0x01, 0x00, 0x00, 0x01, 0x00, 0x97, 0x00, 0x01, 0x00, 0xa7, 0xa9, 0xaa, 0xac, 0xad],
    pieceay: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -4, -4, -4],
    maskb: [0x00, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04, 0x00, 0x04, 0x00, 0x00, 0x04, 0x04, 0x04, 0x00, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04, 0x04, 0x00, 0x00, 0x00, 0x00],
    pieceb: [0x00, 0x02, 0x06, 0x08, 0x0b, 0x1b, 0x02, 0x9e, 0x1a, 0x1c, 0x02, 0x00, 0x9e, 0x4a, 0x21, 0x1b, 0x4d, 0x4e, 0x02, 0x51, 0x84, 0x98, 0x02, 0x91, 0x92, 0x02, 0x00, 0x00, 0x00, 0x00],
    pieceby: [0, 0, 0, 0, 0, 1, 0, 3, 0, 3, 0, 0, 3, 0, 0, -1, 0, 0, 0, -1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    bstripe: [0x00, 0x47, 0x47, 0x00, 0x00, 0x47, 0x47, 0x00, 0x00, 0x00, 0x47, 0x47, 0x00, 0x00, 0x47, 0x47, 0x00, 0x00, 0x47, 0x00, 0x00, 0x00, 0x47, 0x00, 0x00, 0x47, 0x00, 0x00, 0x00, 0x00],
    piecec: [0x00, 0x00, 0x00, 0x09, 0x0c, 0x00, 0x00, 0x9f, 0x00, 0x1d, 0x00, 0x00, 0x9f, 0x00, 0x00, 0x00, 0x4f, 0x50, 0x00, 0x00, 0x85, 0x00, 0x00, 0x93, 0x94, 0x00, 0x00, 0x00, 0x00, 0x00],
    pieced: [0x00, 0x15, 0x15, 0x15, 0x15, 0x18, 0x19, 0x16, 0x15, 0x00, 0x15, 0x00, 0x17, 0x15, 0x2e, 0x4c, 0x15, 0x15, 0x15, 0x15, 0x86, 0x15, 0x15, 0x15, 0x15, 0x15, 0xab, 0x00, 0x00, 0x00],
    fronti: [0x00, 0x00, 0x00, 0x45, 0x46, 0x00, 0x00, 0x46, 0x48, 0x49, 0x87, 0x00, 0x46, 0x0f, 0x13, 0x00, 0x00, 0x00, 0x00, 0x00, 0x83, 0x00, 0x00, 0x00, 0x00, 0xa8, 0x00, 0xae, 0xae, 0xae],
    fronty: [0, 0, 0, -1, 0, 0, 0, 0, -1, 3, -3, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, -36, -36, -36],
    frontx: [0x00, 0x00, 0x00, 0x01, 0x03, 0x00, 0x00, 0x03, 0x01, 0x01, 0x02, 0x00, 0x03, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00],
    gatebotSTA: 0x43, gatebotORA: 0x44, gateB1: 0x37, gatecmask: 0x0d,
    gate8c: [0x2f, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36], gate8b: [0x3e, 0x3d, 0x3c, 0x3b, 0x3a, 0x39, 0x38, 0x37],
    CUmask: 0x11, CUpiece: 0x12, CUpost: 0x0e, stairs: 0x6b, door: 0x6c, doormask: 0x6d, toprepair: 0x6e, archtop3sp: 0xa1,
    spikea: [0x00, 0x22, 0x24, 0x26, 0x28, 0x2a, 0x28, 0x24, 0x22, 0x00], spikeb: [0x00, 0x23, 0x25, 0x27, 0x29, 0x2b, 0x29, 0x25, 0x23, 0x00],
    slicerseq: [4, 3, 1, 2, 5, 4, 4], slicertop: [0x00, 0x58, 0x5a, 0x5c, 0x5e], slicerbot: [0x57, 0x59, 0x5b, 0x5d, 0x5f], slicerbot2: [0x8e, 0x8f, 0x90, 0x5d, 0x5f],
    slicergap: [0, 38, 46, 53, 55], slicerfrnt: [0x65, 0x66, 0x67, 0x68, 0x69],
    looseb: 0x1b, loosea: [0x01, 0x1e, 0x01, 0x1f, 0x1f, 0x01, 0x01, 0x01, 0x1f, 0x1f, 0x1f], looseby: [0, 1, 0, -1, -1, 0, 0, 0, -1, -1, -1],
    loosed: [0x15, 0x2c, 0x15, 0x2d, 0x2d, 0x15, 0x15, 0x15, 0x2d, 0x2d, 0x2d],
    specialflask: 0x95, swordgleam1: 0xb3, swordgleam0: 0x99,
    panelb0: 0x9e, panelc0: 0x9f, numpans: 3, panelb: [0x9e, 0x9a, 0x81], panelc: [0x9f, 0x9b, 0x82], archpanel: 0xa1,
    numbpans: 3, spaceb: [0x00, 0xa3, 0xa5, 0xa6], spaceby: [0, -20, -20, 0], floorb: [0x02, 0xa2, 0xa4, 0xa4], floorby: [0, 0, 0, 0],
    numblox: 2, blockb: [0x84, 0x6f], blockc: [0x85, 0x85], blockd: [0x86, 0x86], blockfr: [0x83, 0x83]
  };

  // ---------------------------------------------------------------- the blueprint
  var BLUETYPE = 0, BLUESPEC = 720, LINKLOC = 1440, LINKMAP = 1696, MAP = 1952, INFO = 2048;
  var blue = new Uint8Array(4096);                          // 2304 used; screen 0 reads land in the zero area beyond
  var KidStartScrn = INFO + 64, KidStartBlock = INFO + 65, KidStartFace = INFO + 66, SwStartScrn = INFO + 68, SwStartBlock = INFO + 69,
    GdStartBlock = INFO + 71, GdStartFace = INFO + 95, GdStartX = INFO + 119, GdStartSeqL = INFO + 143, GdStartProg = INFO + 167, GdStartSeqH = INFO + 191;

  // ---------------------------------------------------------------- game globals
  var S = {
    // hires-ish params also live in POP.hires.P
    // $18-3f
    JSTKX: 0, JSTKY: 0, BTN0: 0, BTN1: 0, BUTT0: 0, BUTT1: 0, JSTKUP: 0, b0down: 0, b1down: 0, SINGSTEP: 0, blackflag: 0, SCRNUM: 0, BlueType: 0, BlueSpec: 0,
    CUTTIMER: 0, PRECED: 0, spreced: 0, PREV: [0, 0, 0], sprev: [0, 0, 0], scrnLeft: 0, scrnRight: 0, scrnAbove: 0, scrnBelow: 0, scrnBelowL: 0, scrnAboveL: 0, scrnAboveR: 0, scrnBelowR: 0,
    kbdX: 0, kbdY: 0, joyX: 0, joyY: 0, btn: 0, butt: 0,
    // page 2
    inmenu: 0, inbuilder: 0, ineditor: 0, soundon: 1, jctr: 0, joyon: 0, develment: 0, keypress: 0, keydown: 0, IIGS: 0,
    sortX: new Uint8Array(16), BELOW: new Uint8Array(16), SBELOW: new Uint8Array(16),
    bluepTRK: 0, bluepREG: 0, binfoTRK: 0, binfoREG: 0, level: 0, BBundID: 0xA9, redherring2: 0, pausetemp: 0, recheck0: 0,
    // $40-e7
    FCharImage: 0, FCharX: 0, FCharY: 0, FCharFace: 0, FCharIndex: 0, FCharCU: 0, FCharCD: 0, FCharCL: 0, FCharCR: 0, FCharTable: 0,
    yellowflag: 0, timebomb: 0, justblocked: 0, gdtimer: 0, framepoint: 0, Fimage: 0, Fdx: 0, Fdy: 0, Fcheck: 0, exitopen: 0, collX: 0, lightning: 0, lightcolor: 0,
    offguard: 0, blockid: 0, blockx: 0, blocky: 0, infrontx: 0, behindx: 0, abovey: 0, tempblockx: 0, tempblocky: 0, tempscrn: 0, tempid: 0, numtrans: 0, tempnt: 0,
    redrawflg: 0, xdiff: 0, ydiff: 0, xdir: 0, ydir: 0, invert: 0, PlayCount: 0, refract: 0, backtolife: 0, cutplan: 0, lastcmd: 0, distfallen: 0, cutscrn: 0,
    waitingtojump: 0, trigppabove: 0, direcpp: 0, blockaddr: 0, delay: 0, XCOORD: 0, savekidx: 0, mirrx: 0, dmirr: 0, barrdist: 0, barrcode: 0, imwidth: 0, imheight: 0,
    leadedge: 0, leftej: 0, rightej: 0, topej: 0, leftblock: 0, rightblock: 0, topblock: 0, bottomblock: 0, CDLeftEj: 0, CDRightEj: 0, endrange: 0, bufindex: 0,
    blockedge: 0, collideL: 0, collideR: 0, weightless: 0, cutorder: 0, AMtimer: 0, begrange: 0, scrn: 0, keybufptr: 0, VisScrn: 0, OppStrength: 0, jarabove: 0,
    KidStrength: 0, ChgKidStr: 0, MaxKidStr: 0, EnemyAlert: 0, ChgOppStr: 0, heroic: 0, clrF: 0, clrB: 0, clrU: 0, clrD: 0, clrbtn: 0, Fsword: 0, purpleflag: 1,
    msgtimer: 0, MaxOppStr: 0, guardprog: 0, ManCtrl: 0, mergetimer: 0, lastpotion: 0, origstrength: 0, jmpaddr: 0, alertguard: 0, createshad: 0, stunned: 0, droppedout: 0,
    // $212-
    milestone: 0, GlassState: 0, redrawglass: 0, doortop: 0, GuardColor: 0, shadowaction: 0, skipmessage: 0, MSset: 0, rjumpflag: 0, redherring: 0,
    // $300-
    MinLeft: 0, NextTimeMsg: 0, SecLeft: 0, BGset1: 0, BGset2: 0, CHset: 0, FrameCount: 0, SongCount: 0, PreRecPtr: 0, gotsword: 0, message: 0, SPEED: 1, nummob: 0,
    clrSEL: [0, 0, 0, 0, 0], clrDESEL: [0, 0, 0, 0, 0], vibes: 0, SongCue: 0, musicon: 1, redkidmeter: 0, NextLevel: 0, scrncolor: 0, redoppmeter: 0, timerequest: 0,
    CDthisframe: new Uint8Array(16), CDlastframe: new Uint8Array(16), CDbelow: new Uint8Array(16), CDabove: new Uint8Array(16),
    SNthisframe: new Uint8Array(16), SNlastframe: new Uint8Array(16), SNbelow: new Uint8Array(16), SNabove: new Uint8Array(16), BlockYthis: 0, BlockYlast: 0,
    keybuf: new Uint8Array(10),
    // trans list / mobs / sounds (mobtables)
    trloc: new Uint8Array(32), trscrn: new Uint8Array(32), trdirec: new Uint8Array(32),
    mobx: new Uint8Array(16), moby: new Uint8Array(16), mobscrn: new Uint8Array(16), mobvel: new Uint8Array(16), mobtype: new Uint8Array(16), moblevel: new Uint8Array(16),
    soundtable: [], trobcount: 0,
    // saved game
    SavLevel: 0xFF, SavStrength: 0, SavMaxed: 0, SavTimer: 0, SavNextMsg: 0,
    // redraw buffers
    halfbuf: new Uint8Array(32), redbuf: new Uint8Array(32), fredbuf: new Uint8Array(32), floorbuf: new Uint8Array(32), wipebuf: new Uint8Array(32), movebuf: new Uint8Array(32),
    objbuf: new Uint8Array(32), whitebuf: new Uint8Array(32), topbuf: new Uint8Array(12),
    // misc kept elsewhere in the original
    height: 0, PAGE: 0
  };
  // character records: Posn X Y Face BlockX BlockY Action XVel YVel Seq Scrn Repeat ID Sword Life
  function mkChar() { return { Posn: 0, X: 0, Y: 0, Face: 0, BlockX: 0, BlockY: 0, Action: 0, XVel: 0, YVel: 0, Seq: 0, Scrn: 0, Repeat: 0, ID: 0, Sword: 0, Life: 0 }; }
  var Char = mkChar(), Kid = mkChar(), Shad = mkChar(), Op = mkChar();
  var FIELDS = ['Posn', 'X', 'Y', 'Face', 'BlockX', 'BlockY', 'Action', 'XVel', 'YVel', 'Seq', 'Scrn', 'Repeat', 'ID', 'Sword', 'Life'];
  function copyChar(dst, src) { for (var i = 0; i < FIELDS.length; i++) dst[FIELDS[i]] = src[FIELDS[i]]; }
  function LoadKid() { copyChar(Char, Kid); } function SaveKid() { copyChar(Kid, Char); }
  function LoadShad() { copyChar(Char, Shad); } function SaveShad() { copyChar(Shad, Char); }
  function LoadKidwOp() { copyChar(Char, Kid); copyChar(Op, Shad); } function SaveKidwOp() { copyChar(Kid, Char); copyChar(Shad, Op); }
  function LoadShadwOp() { copyChar(Char, Shad); copyChar(Op, Kid); } function SaveShadwOp() { copyChar(Shad, Char); copyChar(Kid, Op); }

  // ---------------------------------------------------------------- sequence table and frame definitions
  var seqOrg = 0x3000, seq = null, framedef = null, FD = { Fdef: 0, altset1: 0, altset2: 0, swordtab: 0 };
  function loadData(data) {
    seq = data.seq; framedef = data.framedef; FD = data.FD;
    for (var k in data.images) data.images[k].forEach(function (im, i) { im.tab = k; im.idx = i + 1; });   // (so a renderer can tell them apart)
  }
  function seqByte(addr) { return seq[addr - seqOrg]; }
  function jumpseq(n) { var x = (n - 1) * 2; Char.Seq = seq[x] | (seq[x + 1] << 8); }
  function opjumpseq(n) { var x = (n - 1) * 2; Op.Seq = seq[x] | (seq[x + 1] << 8); }
  function getseq() { var v = seq[Char.Seq - seqOrg]; Char.Seq = (Char.Seq + 1) & 0xFFFF; return v; }

  // GETFRAMEINFO: Fimage, Fsword, Fdx, Fdy, Fcheck for Char.Posn (using the alternate sets where the original did)
  function GetFrameInfo() {
    var p = Char.Posn, fp = FD.Fdef + (p - 1) * 5, id = Char.ID;
    if (id !== 0 && id !== 24) {
      if (id >= 5) fp = FD.altset2 + (p - 1) * 5;
      else {
        var q = p;
        if (id >= 2 && q >= 102 && q < 107) q = q + 70;
        if (q >= 150 && q < 190) fp = FD.altset1 + (q - 150) * 5;
      }
    }
    S.framepoint = fp;
    S.Fimage = framedef[fp]; S.Fsword = framedef[fp + 1]; S.Fdx = framedef[fp + 2]; S.Fdy = framedef[fp + 3]; S.Fcheck = framedef[fp + 4];
    if (hooks.frame) hooks.frame(p, id, fp);
  }
  function swordframe(n) { var a = FD.swordtab + (n - 1) * 3; if (hooks.sword) hooks.sword(n); return [framedef[a], framedef[a + 1], framedef[a + 2]]; }
  var hooks = { frame: null, sword: null };                            // another renderer (the Macintosh art) listens here

  // ---------------------------------------------------------------- blueprint access (CALCBLUE, RDBLOCK ...)
  function calcblue(scrn) {
    if (scrn === 0) { S.BlueType = 2304 + 64; S.BlueSpec = 2304 + 64 + 720; return; }   // "returns garbage": a zeroed area
    S.BlueType = (scrn - 1) * 30; S.BlueSpec = 720 + (scrn - 1) * 30;
  }
  function GETLEFT(a) { return a ? blue[MAP + (a - 1) * 4] : 0; }
  function GETRIGHT(a) { return a ? blue[MAP + (a - 1) * 4 + 1] : 0; }
  function GETUP(a) { return a ? blue[MAP + (a - 1) * 4 + 2] : 0; }
  function GETDOWN(a) { return a ? blue[MAP + (a - 1) * 4 + 3] : 0; }
  function getscrns() {
    S.scrnLeft = GETLEFT(S.VisScrn); S.scrnRight = GETRIGHT(S.VisScrn); S.scrnAbove = GETUP(S.VisScrn); S.scrnBelow = GETDOWN(S.VisScrn);
    S.scrnBelowL = GETLEFT(S.scrnBelow); S.scrnBelowR = GETRIGHT(S.scrnBelow); S.scrnAboveL = GETLEFT(S.scrnAbove); S.scrnAboveR = GETRIGHT(S.scrnAbove);
  }
  // rdblock: A = screen, X = blockx, Y = blocky (as signed bytes); returns objid; sets tempscrn/tempblockx/tempblocky, BlueType/Spec, and the Y (block index) in S.rdY
  function rdblock(scrn, bx, by) { S.tempscrn = u8(scrn); S.tempblockx = u8(bx); S.tempblocky = u8(by); return rdblock1(); }
  function rdblock1() {
    for (;;) {
      var x = s8(S.tempblockx), y = s8(S.tempblocky);
      if (x < 0) { S.tempblockx = u8(x + 10); S.tempscrn = GETLEFT(S.tempscrn); continue; }
      if (x >= 10) { S.tempblockx = u8(x - 10); S.tempscrn = GETRIGHT(S.tempscrn); continue; }
      if (y < 0) { S.tempblocky = u8(y + 3); S.tempscrn = GETUP(S.tempscrn); continue; }
      if (y >= 3) { S.tempblocky = u8(y - 3); S.tempscrn = GETDOWN(S.tempscrn); continue; }
      break;
    }
    if (S.tempscrn === 0) { S.rdY = 0; return OBJ.block; }
    calcblue(S.tempscrn);
    S.rdY = Mult10[S.tempblocky] + S.tempblockx;
    return blue[S.BlueType + S.rdY] & idmask;
  }
  function spec() { return blue[S.BlueSpec + S.rdY]; }                 // (BlueSpec),y after rdblock
  function setspec(v) { blue[S.BlueSpec + S.rdY] = u8(v); }
  function settype(v) { blue[S.BlueType + S.rdY] = u8(v); }

  var plus1 = [-1, 1], minus1 = [1, -1];                              // indexed by CharFace+1
  function getunderft() { return rdblock(Char.Scrn, Char.BlockX, Char.BlockY); }
  function getinfront() { S.infrontx = u8(Char.BlockX + plus1[Char.Face & 1 ? 0 : 1]); return rdblock(Char.Scrn, S.infrontx, Char.BlockY); }
  function get2infront() { var d = plus1[Char.Face & 1 ? 0 : 1]; return rdblock(Char.Scrn, u8(Char.BlockX + 2 * d), Char.BlockY); }
  function getbehind() { S.behindx = u8(Char.BlockX + minus1[Char.Face & 1 ? 0 : 1]); return rdblock(Char.Scrn, S.behindx, Char.BlockY); }
  function getabove() { S.abovey = u8(Char.BlockY - 1); return rdblock(Char.Scrn, Char.BlockX, S.abovey); }
  function getaboveinf() { S.infrontx = u8(Char.BlockX + plus1[Char.Face & 1 ? 0 : 1]); S.abovey = u8(Char.BlockY - 1); return rdblock(Char.Scrn, S.infrontx, S.abovey); }
  function getabovebeh() { S.behindx = u8(Char.BlockX + minus1[Char.Face & 1 ? 0 : 1]); S.abovey = u8(Char.BlockY - 1); return rdblock(Char.Scrn, S.behindx, S.abovey); }
  // note: CharFace is 0 (right) or $FF (left); "ldx CharFace; inx" gives 1 for right, 0 for left

  function addcharx(a) { a = s8(a); if (Char.Face & 0x80) a = -a; return u8(Char.X + a); }
  function facedx(a) { a = s8(a); return u8((Char.Face & 0x80) ? a : -a); }
  function getbasex() { return addcharx(u8(-(S.Fcheck & Ffootmark) + s8(S.Fdx))); }
  function getblockx(a) { a = u8(a); S.OFFSET = PixelTable[a]; return BlockTable[a]; }         // returns signed block, OFFSET in S
  function getblockxp(a) { return getblockx(u8(a - angle)); }
  function getblocky(a) { a = u8(a); for (var x = 3; x >= 0; x--) if (a >= BlockTop[x + 1]) return x; return -1 & 0xFF; }
  function getblockyp(a) { a = u8(a); for (var x = 3; x >= 0; x--) if (a >= FloorY[x + 1]) return x; return 0xFF; }
  function getblockej(a) { return BlockEdge[s8(a) + 5]; }
  function getdist() { return getdist1(getbasex()); }
  function getdist1(a) { getblockxp(a); return Char.Face === 0 ? u8(13 - S.OFFSET) : S.OFFSET; }
  function GetBaseBlock() { Char.BlockX = u8(getblockxp(getbasex())); }
  function rereadblocks() { GetFrameInfo(); GetBaseBlock(); }
  function indexblock() {                     // returns {y, cs}
    var by = s8(S.tempblocky);
    if (by < 0) return { y: S.tempblockx, cs: true };
    if (by >= 3 || S.tempblockx >= 10) return { y: 30, cs: true };
    return { y: S.tempblockx + Mult10[by], cs: false };
  }
  function unindex(a) { var x = 0; while (a >= 10) { a -= 10; x++; } return { bx: a, by: x }; }
  function cmpspace(a) { return (a === OBJ.space || a === OBJ.pillartop || a === OBJ.panelwof || a === OBJ.block || a >= OBJ.archtop1) ? 0 : 1; }
  function cmpbarr(a) { if (a === OBJ.panelwif || a === OBJ.panelwof || a === OBJ.gate) return 1; if (a === OBJ.mirror || a === OBJ.slicer) return 3; if (a === OBJ.block) return 4; return 0; }
  function cmpwall(a) { if (a === OBJ.block) return 0; if (Char.Face & 0x80) { if (a === OBJ.panelwif || a === OBJ.panelwof) return 0; } return 1; }

  // marks (results of indexblock: y and cs)
  function markos(buf, ix, a) { if (ix.cs) { if (ix.y < 10) S.topbuf[ix.y] = a; return; } buf[ix.y] = a; }
  function markred(ix, a) { markos(S.redbuf, ix, a); }
  function markfred(ix, a) { if (!ix.cs) S.fredbuf[ix.y] = a; }
  function markwipe(ix, a) {
    if (ix.cs) return;
    var y = ix.y;
    if (!S.wipebuf[y] || S.height >= S.whitebuf[y]) S.whitebuf[y] = S.height;
    S.wipebuf[y] = a;
  }
  function markmove(ix, a) { markos(S.movebuf, ix, a); }
  function markfloor(ix, a) { markos(S.floorbuf, ix, a); }
  function markhalf(ix, a) { markos(S.halfbuf, ix, a); }
  function zerored() { S.redbuf.fill(0); S.fredbuf.fill(0); S.floorbuf.fill(0); S.wipebuf.fill(0); S.movebuf.fill(0); S.objbuf.fill(0); S.halfbuf.fill(0); S.topbuf.fill(0); }

  // ---------------------------------------------------------------- SETUPCHAR / GETEDGES / INDEXCHAR / CROPCHAR
  function decodeim() {
    var t = ((S.Fsword & 0xC0) >> 1); t = (t + (S.Fimage & 0x80)) >> 5;          // "lsr; adc ztemp; lsr x5" with carry clear
    S.FCharTable = t;
    S.FCharImage = (S.Fimage & 0x7F) | S.timebomb;
  }
  function zerocrop() { S.FCharCU = 0; S.FCharCL = 0; S.FCharCR = 40; S.FCharCD = 192; }
  function setupchar() {
    zerocrop(); GetFrameInfo();
    S.FCharFace = Char.Face;
    decodeim();
    var x = u8(addcharx(S.Fdx) - ScrnLeft);           // 8-bit difference
    var fx = x << 1;                                   // "asl FCharX; rol FCharX+1"
    var hi = fx >> 8, lo = fx & 0xFF;
    if (hi !== 0 && lo >= 0xF0) hi = 0xFF;             // a carry out with the low byte at $F0 or more: negative
    S.FCharX = (hi << 8) | lo;
    S.FCharY = u8(S.Fdy + Char.Y - ScrnTop);
    if (!((S.Fcheck ^ S.FCharFace) & 0x80)) S.FCharX = (S.FCharX + 1) & 0xFFFF;
  }
  function fcharx16() { return (S.FCharX << 16) >> 16; }       // signed
  function addfcharx(a) { a = s8(a); var neg = a < 0; if (neg) a = -a; var left = ((neg ? 0xFF : 0) ^ S.FCharFace) & 0x80; S.FCharX = ((left ? S.FCharX - a : S.FCharX + a) & 0xFFFF); }
  function getedges() {
    var im = POP.grafix.dimchar(S.FCharImage, S.FCharTable);
    S.imheight = im.h;
    S.imwidth = (Mult7[im.w] + 1) >> 1;
    var x = u8(((S.FCharX >> 1) & 0xFF) + ScrnLeft);
    if (!(Char.Face & 0x80)) x = u8(x - S.imwidth);
    S.leftej = x; S.rightej = u8(x + S.imwidth);
    var t = u8(S.FCharY - S.imheight + 1); if (t >= 192) t = 0;
    S.topej = t;
    var tb = getblocky(t); if (tb === 3) tb = 0xFF;
    S.topblock = tb;
    S.bottomblock = getblocky(S.FCharY);
    S.leftblock = u8(getblockx(S.leftej)); S.rightblock = u8(getblockx(S.rightej));
    var thin = (S.Fcheck & Fthinmark) ? 3 : 0;
    S.CDLeftEj = u8(S.leftej + thin); S.CDRightEj = u8(S.rightej - thin);
  }
  function indexchar() {
    if (Char.Action === 1) { S.tempblocky = S.bottomblock; S.tempblockx = S.leftblock; }
    else { S.tempblocky = Char.BlockY; S.tempblockx = Char.BlockX; }
    var p = Char.Posn, fall = (p >= 135 && p < 149) || p === 2 || p === 3 || p === 4 || p === 6;
    if (fall) S.tempblockx = u8(S.tempblockx - 1);
    S.FCharIndex = indexblock().y;
  }
  function quickfloor() {
    var p = Char.Posn, which;
    if (p >= 135 && p < 149) which = markhalf;
    else {
      if (Char.Action === 1) { if (!(p >= 78 && p < 80)) return; }
      else if (!(Char.Action === 2 || Char.Action === 3 || Char.Action === 4 || Char.Action === 6)) return;
      which = markfloor;
    }
    var bx = S.rightblock;
    for (;;) {
      S.tempblockx = bx;
      S.tempblocky = S.bottomblock; which(indexblock(), 2);
      if (S.topblock !== S.bottomblock) { S.tempblocky = S.topblock; which(indexblock(), 2); }
      if (bx === S.leftblock) return;
      bx = u8(bx - 1); if (bx & 0x80) return;
    }
  }
  function quickfg() {
    if (Char.Sword >= 2) { if (Char.Face & 0x80) S.leftblock = u8(S.leftblock - 1); else S.rightblock = u8(S.rightblock + 1); }
    var by = S.bottomblock;
    for (;;) {
      S.tempblocky = by;
      var bx = S.rightblock;
      for (;;) { S.tempblockx = bx; markfred(indexblock(), 3); if (bx === S.leftblock) break; bx = u8(bx - 1); if (bx & 0x80) break; }
      if (by === S.topblock) return;
      by = u8(by - 1); if (by & 0x80) return;
    }
  }
  function cropchar() {
    var p = Char.Posn;
    if (p >= 224 && p < 229) { var d = u8(S.doortop + 2); if (d < S.FCharY) S.FCharCU = d; return; }   // on the stairs: mask the door (the original's debug hang for d >= FCharY is skipped)
    // under a solid floor: crop top
    var a = rdblock(Char.Scrn, S.leftblock, S.topblock), solid = false;
    if (a === OBJ.block || cmpspace(a) !== 0) {
      var ok = false;
      if (Char.Action === 0 && (p === 79 || p === 81)) ok = true;
      else { var b = rdblock(Char.Scrn, S.rightblock, S.topblock); if (b === OBJ.block || cmpspace(b) !== 0) ok = true; }
      if (ok) {
        var x = u8(Char.BlockY + 1);
        if (x === 1) solid = true;
        else { var bt = BlockTop[x]; if (bt < S.FCharY) { if (u8(bt - floorheight) < S.topej) solid = true; } }
        if (solid) { S.FCharCU = BlockTop[x]; S.topej = BlockTop[x]; }
      }
    }
    // left of a panel: crop right
    S.blockx = u8(getblockx(S.CDLeftEj));
    a = rdblock(Char.Scrn, S.blockx, Char.BlockY);
    if (a === OBJ.panelwof || a === OBJ.panelwif) {
      var wall;
      if (!(Char.Face & 0x80) && Char.Action === 2) wall = true;                  // hanging on the right: no need to check the head
      else { var h = rdblock(Char.Scrn, S.blockx, S.topblock); wall = (h === OBJ.block || h === OBJ.panelwof || h === OBJ.panelwif); }
      if (wall) { S.FCharCR = u8(S.tempblockx * 4 + 4); return; }
    }
    S.blockx = u8(getblockx(S.CDRightEj));
    a = rdblock(Char.Scrn, S.blockx, Char.BlockY);
    if (a !== OBJ.block) return;
    var h2 = rdblock(Char.Scrn, S.blockx, S.topblock);
    if (h2 !== OBJ.block) return;
    if (S.tempscrn !== Char.Scrn) return;
    S.FCharCR = u8(S.tempblockx * 4);
  }
  function checkledge(a) {                       // in: blockid (must be clear), a = rdblock result (must be ledge); rdY set
    var tempstate = spec(), b = S.blockid;
    if (b === OBJ.block) return 0;
    if (b === OBJ.panelwof && !(Char.Face & 0x80)) return 0;
    if (cmpspace(b) !== 0) return 0;
    if (a === OBJ.loose) { if (tempstate & OBJ.loose) return 0; }   // "bit tempstate" with A = loose (11): floor is already loose
    else if (a === OBJ.panelwif && (Char.Face & 0x80)) return 0;
    if (cmpspace(a) === 0) return 0;
    return 1;
  }
  function getopdist() {
    if (Char.Scrn !== Op.Scrn) return 127;
    var a;
    if (Op.X >= Char.X) { a = u8(Op.X - Char.X); if (a & 0x80) a = 127; }
    else { a = u8(Char.X - Op.X); if (a & 0x80) a = 127; a = u8(-a); }
    if (Char.Face & 0x80) a = u8(-a);
    if ((Char.Face ^ Op.Face) & 0x80) { if (a < 127 - 13) a = u8(a + 13); }
    return a;
  }
  function unevenfloor() { if (getunderft() === OBJ.dpressplate) Char.Y = u8(Char.Y + 1); }
  function rechargemeter() { S.ChgKidStr = u8(S.MaxKidStr - S.KidStrength); }
  function boostmeter() { if (S.MaxKidStr < 10) S.MaxKidStr++; rechargemeter(); }
  function checkspikes() {
    var r = getblockxp(S.rightej); if (r & 0x80) return;
    var tempright = u8(r), bx = u8(getblockxp(S.leftej));
    for (;;) {
      S.blockx = bx;
      // sub
      S.tempblockx = S.blockx; S.tempblocky = Char.BlockY; S.tempscrn = Char.Scrn;
      for (;;) {
        var a = rdblock1();
        if (a === OBJ.spikes) { POP.mover.trigspikes(); break; }
        if (cmpspace(a) !== 0) break;
        if (S.tempscrn === 0 || S.tempscrn !== Char.Scrn) break;
        S.tempblocky = u8(S.tempblocky + 1);
      }
      if (S.blockx === tempright) return;
      bx = u8(S.blockx + 1);
    }
  }

  return { u8: u8, s8: s8, OBJ: OBJ, SND: SND, SONG: SONG, SEQ: SEQ, OPC: OPC, BG: BG, S: S, blue: blue, Char: Char, Kid: Kid, Shad: Shad, Op: Op,
    BLUETYPE: BLUETYPE, BLUESPEC: BLUESPEC, LINKLOC: LINKLOC, LINKMAP: LINKMAP, MAP: MAP, INFO: INFO,
    KidStartScrn: KidStartScrn, KidStartBlock: KidStartBlock, KidStartFace: KidStartFace, GdStartBlock: GdStartBlock, GdStartFace: GdStartFace, GdStartX: GdStartX,
    GdStartSeqL: GdStartSeqL, GdStartProg: GdStartProg, GdStartSeqH: GdStartSeqH,
    torchLast: torchLast, bubbLast: bubbLast, spikeExt: spikeExt, spikeRet: spikeRet, slicerExt: slicerExt, slicerRet: slicerRet, Ffalling: Ffalling, gmaxval: gmaxval, gminval: gminval,
    Fcheckmark: Fcheckmark, Fthinmark: Fthinmark, Ffootmark: Ffootmark, floorheight: floorheight, angle: angle, VertDist: VertDist,
    TypeKid: TypeKid, TypeShad: TypeShad, TypeGd: TypeGd, TypeSword: TypeSword, TypeReflect: TypeReflect, TypeComix: TypeComix, TypeFF: TypeFF,
    ScrnWidth: ScrnWidth, ScrnLeft: ScrnLeft, ScrnRight: ScrnRight, ScrnTop: ScrnTop, ScrnBottom: ScrnBottom, idmask: idmask, reqmask: reqmask,
    ByteTable: ByteTable, OffsetTable: OffsetTable, BlockTable: BlockTable, PixelTable: PixelTable, Mult10: Mult10, Mult7: Mult7, BlockEdge: BlockEdge,
    BlockTop: BlockTop, BlockBot: BlockBot, FloorY: FloorY, BlockAy: BlockAy,
    mkChar: mkChar, copyChar: copyChar, LoadKid: LoadKid, SaveKid: SaveKid, LoadShad: LoadShad, SaveShad: SaveShad, LoadKidwOp: LoadKidwOp, SaveKidwOp: SaveKidwOp,
    LoadShadwOp: LoadShadwOp, SaveShadwOp: SaveShadwOp,
    loadData: loadData, jumpseq: jumpseq, opjumpseq: opjumpseq, getseq: getseq, seqByte: seqByte, GetFrameInfo: GetFrameInfo, swordframe: swordframe, hooks: hooks,
    calcblue: calcblue, GETLEFT: GETLEFT, GETRIGHT: GETRIGHT, GETUP: GETUP, GETDOWN: GETDOWN, getscrns: getscrns, rdblock: rdblock, rdblock1: rdblock1, spec: spec, setspec: setspec, settype: settype,
    getunderft: getunderft, getinfront: getinfront, get2infront: get2infront, getbehind: getbehind, getabove: getabove, getaboveinf: getaboveinf, getabovebeh: getabovebeh,
    addcharx: addcharx, facedx: facedx, getbasex: getbasex, getblockx: getblockx, getblockxp: getblockxp, getblocky: getblocky, getblockyp: getblockyp, getblockej: getblockej,
    getdist: getdist, getdist1: getdist1, GetBaseBlock: GetBaseBlock, rereadblocks: rereadblocks, indexblock: indexblock, unindex: unindex, cmpspace: cmpspace, cmpbarr: cmpbarr, cmpwall: cmpwall,
    markred: markred, markfred: markfred, markwipe: markwipe, markmove: markmove, markfloor: markfloor, markhalf: markhalf, zerored: zerored,
    decodeim: decodeim, zerocrop: zerocrop, setupchar: setupchar, addfcharx: addfcharx, fcharx16: fcharx16, getedges: getedges, indexchar: indexchar, quickfloor: quickfloor, quickfg: quickfg,
    cropchar: cropchar, checkledge: checkledge, getopdist: getopdist, unevenfloor: unevenfloor, rechargemeter: rechargemeter, boostmeter: boostmeter, checkspikes: checkspikes, plus1: plus1, minus1: minus1 };
})();
