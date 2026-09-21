// pop_top.js — TOPCTRL.S with the game parts of SUBS.S, MISC.S, SPECIALK.S and GRAFIX.S: the main loop,
// starting and restarting levels, the player's input, the timers and messages, and the cuts between
// screens.  The original's non-local jumps (RESTART from inside a key handler, say) are thrown as Jump
// and caught by tick(), which is what the page calls once per game frame.
var POP = POP || {};
POP.top = (function () {
  'use strict';
  var ST = POP.state, S = ST.S, Char = ST.Char, Op = ST.Op, Kid = ST.Kid, Shad = ST.Shad, OBJ = ST.OBJ, SEQ = ST.SEQ, SND = ST.SND, SONG = ST.SONG, u8 = ST.u8;
  var G = POP.grafix, HR = POP.hires, P = HR.P, BG = POP.bg, CH = POP.char, MV = POP.mover, AU = POP.auto, SO = POP.sound, blue = ST.blue, FloorY = ST.FloorY;
  var addsound = function (n) { SO.addsound(n); };
  var POPside1 = 0xA9, POPside2 = 0xAD, FirstSideB = 3, LastSideB = 14;
  var initmaxstr = 3, BTLtimer = 20, wtlflash = 15, mousetimer = 150;
  var LevelMsg = 1, ContMsg = 2, TimeMsg = 3, leveltimer = 20, contflash = 95, contoff = 15, deadenough = 4, timemsgtimer = 20;
  var mirlevel = 4, mirscrn = 4, mirx = 4, miry = 0;
  var min = 725, sec = Math.floor(min / 60), t = 60;                 // frames per "minute" (SPECIALK.S)
  var timetable = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 56, 57, 58].map(function (m) { return m * min; });
  timetable.push(59 * min + 1); timetable.push(60 * min + 5);
  var nummsg = timetable.length * 2;
  var bgset1 = [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 1, 1, 2, 2, 1], bgset2 = [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 1, 1, 2, 2, 1], chset = [0, 0, 0, 1, 2, 2, 3, 2, 2, 2, 2, 2, 4, 5, 5];
  var keybuflen = 10;

  // what the page sees: the input it sets, the events it listens to
  var input = { key: 0, strobe: false, down: false, btn0: false, btn1: false };
  var events = { show: null, sound: null, tone: null, song: null, mode: null };
  var mode = 'boot';                                                  // boot | title | game | cut | won
  function Jump(fn) { this.fn = fn; }
  function jump(fn) { throw new Jump(fn); }
  function setmode(m) { mode = m; if (events.mode) events.mode(m); }

  // ---------------------------------------------------------------- the display switches
  function show(page, kind) { if (events.show) events.show(page, kind); }
  function PageFlip() {
    if (P.PAGE === 0) { P.PAGE = 0x20; show(1, 'flip'); }
    else { P.PAGE = 0; show(2, 'flip'); }
  }
  function lrcls(color) { S.scrncolor = color; }
  function lrclse(color) { if (color !== S.scrncolor) lrcls(color); }
  function vblank() { }
  function pause(n) { }
  function showtext() { show(1, 'text'); }
  function doflashon(color) { lrclse(color); show(1, 'flashon'); }
  function doflashoff() { if (P.PAGE === 0) show(2, 'flashoff'); }   // (with PAGE = $20 page 1 is already selected: only hires comes back on)
  function gtone() { if (events.tone) events.tone(); }

  // ---------------------------------------------------------------- input (SPECIALK.S KEYS / KREAD, GRAFIX.S controller)
  var C_skip = 'SKIP';
  var pendingFreeze = false;
  function strobe() { if (!keys()) return false; controller(); return true; }
  function keys() {
    if (S.SINGSTEP) return freeze();
    S.keypress = input.key | (input.strobe ? 0x80 : 0);
    return keys2();
  }
  // frozen (ESC): the original spins reading the keyboard; here the frame waits for a fresh key.
  // ESC again steps one frame; any other key resumes.
  function freeze() {
    if (!input.strobe) return false;
    var k = input.key | 0x80; input.strobe = false;
    if (k === 0x9B) { S.SINGSTEP = 1; S.keypress = 1; return true; }
    S.SINGSTEP = 0; S.keypress = 0;
    return keys2();
  }
  function keys2() {
    S.keydown = input.down ? 0x80 : 0; input.strobe = false;           // reading $C010 clears the strobe
    kread();
    var kp = S.keypress;
    if (!(kp & 0x80)) return true;
    addkey(kp);
    if (checkcode(C_skip) === 0) {                                     // (the shipped disk has no development codes: only SKIP, to level 4)
      var lim = S.develment ? 11 : 3;
      if (lim >= S.level) { S.NextLevel = u8(S.NextLevel + 1); shortentime(); }
    }
    if (!LegitKeys()) return false;
    DevelKeys();
    return true;
  }
  function kread() {
    S.kbdX = 0; S.kbdY = 0;
    var a = S.keypress;
    if (!(a & 0x80)) { if (!(S.keydown & 0x80)) return; a |= 0x80; }
    switch (a) {
      case 0xEA: case 0xCA: S.kbdX = 0xFF; return;                    // j: left
      case 0xEC: case 0xCC: S.kbdX = 1; return;                       // l: right
      case 0xE9: case 0xC9: S.kbdY = 0xFF; return;                    // i: up
      case 0xEB: case 0xCB: S.kbdY = 1; return;                       // k: down
      case 0xF5: case 0xD5: S.kbdX = 0xFF; S.kbdY = 0xFF; return;     // u: up-left
      case 0xEF: case 0xCF: S.kbdX = 1; S.kbdY = 0xFF; return;        // o: up-right
    }
  }
  function LegitKeys() {
    var k = S.keypress;
    if (k === 0x9B) return freeze();                                  // ESC: freeze
    if (k === 0x92) { jump(GOATTRACT); }                              // ctrl-R
    if (k === 0x81) { jump(RESTART); }                                // ctrl-A
    if (k === 0x8B) { S.joyon = 0; gtone(); return true; }                 // ctrl-K
    if (k === 0x8A) { setcenter(); gtone(); return true; }                 // ctrl-J
    if (k === 0x98) { S.jhoriz ^= 1; gtone(); return true; }
    if (k === 0x99) { S.jvert ^= 1; gtone(); return true; }
    if (k === 0x93) { zerosound(); S.soundon ^= 1; if (S.soundon) gtone(); return true; }
    if (k === 0x8E) { S.musicon ^= 1; if (S.musicon) gtone(); return true; }
    if (k === 0x96) { return true; }                                       // ctrl-V: version (a text-page display; nothing here)
    if (k === 0x87) { S.SavLevel = S.level; DoSaveGame(); return true; }
    if (k === 0xA0) { S.timerequest = 3; return true; }               // space: show time
    return true;
  }
  function DevelKeys() { }                                             // development mode cannot be switched on in the shipped game
  function addkey(a) { var x = S.keybufptr + 1; if (x >= keybuflen) x = 0; S.keybufptr = x; S.keybuf[x] = a; }
  // the last keys typed against a code (given reversed in the original: its last character first)
  function checkcode(code) {
    var x = S.keybufptr;
    for (var i = code.length - 1; i >= 0; i--) {
      var c = code.charCodeAt(i) | 0x80, k = S.keybuf[x];
      if (c !== k) { if (c < 0xC1 || c >= 0xDB) return 0xFF; if ((c | 0x20) !== k) return 0xFF; }
      x--; if (x < 0) x = keybuflen - 1;
    }
    return 0;
  }
  function setcenter() { S.joyon = 0; S.jvert = 0; S.jhoriz = 0; S.jbtns = 0; }    // no joystick here: PREAD finds none
  function controller() { S.BTN0 = input.btn0 ? 0x80 : 0; S.BTN1 = input.btn1 ? 0x80 : 0; }
  function getselect() { if (S.joyon) getjoy(); else getkbd(); }
  function getdesel() { if (S.joyon) getkbd(); else getjoy(); }
  function getjoy() { S.JSTKX = S.joyX; S.JSTKY = S.joyY; var b = S.BTN1; if (!(S.ManCtrl & 0x80)) b |= S.BTN0; S.btn = b; }
  function getkbd() { S.JSTKX = S.kbdX; S.JSTKY = S.kbdY; var b = S.BTN0; if (!(S.ManCtrl & 0x80)) b |= S.BTN1; S.btn = b; }
  function clr1(name, pressed) {
    var c = S[name];
    if (c & 0x80) return;
    if (!pressed) { S[name] = 0; return; }
    if (c !== 0) return;
    S[name] = 0xFF;
  }
  function clrjstk() {
    clr1('clrF', S.JSTKX & 0x80); clr1('clrB', S.JSTKX === 1); clr1('clrU', S.JSTKY & 0x80); clr1('clrD', S.JSTKY === 1); clr1('clrbtn', S.btn & 0x80);
  }
  function facejstk() { S.JSTKX = u8(0 - S.JSTKX); var x = S.clrF; S.clrF = S.clrB; S.clrB = x; }
  function SaveSelect() { S.clrSEL[0] = S.clrF; S.clrSEL[1] = S.clrB; S.clrSEL[2] = S.clrU; S.clrSEL[3] = S.clrD; S.clrSEL[4] = S.clrbtn; }
  function LoadSelect() { S.clrF = S.clrSEL[0]; S.clrB = S.clrSEL[1]; S.clrU = S.clrSEL[2]; S.clrD = S.clrSEL[3]; S.clrbtn = S.clrSEL[4]; }
  function SaveDesel() { S.clrDESEL[0] = S.clrF; S.clrDESEL[1] = S.clrB; S.clrDESEL[2] = S.clrU; S.clrDESEL[3] = S.clrD; S.clrDESEL[4] = S.clrbtn; }
  function LoadDesel() { S.clrF = S.clrDESEL[0]; S.clrB = S.clrDESEL[1]; S.clrU = S.clrDESEL[2]; S.clrD = S.clrDESEL[3]; S.clrbtn = S.clrDESEL[4]; }
  function initinput() { for (var i = 0; i < 5; i++) { S.clrDESEL[i] = 0; S.clrSEL[i] = 0; } }
  function clearjoy() { LoadSelect(); S.clrF = 0; S.clrB = 0; S.clrU = 0; S.clrD = 0; SaveSelect(); }
  function demokeys() {
    if (S.level !== 0) return 0;
    if ((S.BTN0 | S.BTN1) & 0x80) return 0xFF;
    var k = S.keypress;
    if (!(k & 0x80)) return 0;
    if (k === 0x9B || k === 0x93) return 0;
    return 0xFF;
  }
  function zerosound() { SO.zerosound(); }

  // ---------------------------------------------------------------- the main loop
  function mainloop() {
    if (!pendingFreeze) { G.RND(); S.ChgKidStr = 0; S.ChgOppStr = 0; }
    pendingFreeze = false;
    if (!strobe()) { pendingFreeze = true; return; }                   // frozen: the frame waits for a key
    if (demokeys() & 0x80) { START(1); return; }
    misctimers();
    NextFrame();
    flashon();
    FrameAdv();
    SO.playback(); zerosound();
    flashoff();
    songcues();
    if (S.NextLevel !== S.level) { yellowcheck(); LoadNextLevel(); }
  }
  function tick() {
    if (mode === 'cut') { runJumps(function () { POP.cut.tick(); }); return; }
    if (mode !== 'game') return;
    runJumps(mainloop);
  }

  // ---------------------------------------------------------------- starting, restarting, the next level
  function START(level) { StartGame(level); RESTART(); }
  // resume a saved game: the level it was saved on, with the strength and the clock as they were
  function STARTRESUME(save) {
    StartGame(4);
    S.origstrength = save.strength; S.FrameCount = save.timer & 0xFFFF; S.NextTimeMsg = save.nextmsg;
    S.timerequest = 1; S.yellowflag = 0x80; S.level = save.level; S.NextLevel = save.level;
    S.BBundID = save.level >= FirstSideB ? POPside2 : POPside1;
    RESTART();
  }
  function StartGame(level) {
    S.level = level; S.NextLevel = level;
    if (level === 1) cuesong(SONG.Danger, 25);
    S.origstrength = initmaxstr;
    initgame();
  }
  function initgame() {
    S.blackflag = 0; S.redrawflg = 0; S.inmenu = 0; S.inbuilder = 0; S.recheck0 = 0; S.SINGSTEP = 0; S.ManCtrl = 0; S.vibes = 0; S.invert = 0; S.milestone = 0;
    S.timerequest = 0; S.FrameCount = 0; S.NextTimeMsg = 0; S.MinLeft = 0xFF; S.SecLeft = 0xFF; S.SPEED = 1;
  }
  function INITSYSTEM() {
    var im = POP.data.images;
    G.tables.ch[0] = im.ch1; G.tables.ch[1] = im.ch2; G.tables.ch[2] = im.ch3; G.tables.ch[4] = im.ch5; G.tables.ch[5] = im.ch6a; G.tables.ch[6] = im.ch7;
    setcenter(); S.develment = 0; initgame();
    S.yellowflag = 0x80;                                             // the copy-protection check always passes here
  }
  function RESTART() {
    setmode('game');
    input.strobe = false;
    lrcls(0xA0); vblank(); show(1, 'text');
    LoadLevelX(S.level);
    setinitials(); initialguards();
    S.SINGSTEP = 0; S.vibes = 0; S.AMtimer = 0; S.VisScrn = 0; S.exitopen = 0; S.lightning = 0; S.mergetimer = 0; S.numtrans = 0; S.nummob = 0; S.EnemyAlert = 0;
    S.createshad = 0; S.stunned = 0; S.heroic = 0; S.ChgKidStr = 0; S.OppStrength = 0; S.msgtimer = 0; S.PreRecPtr = 0; S.PlayCount = 0;
    if (S.SongCue !== SONG.Danger) S.SongCue = 0;
    zerosound(); G.zeropeels(); initCDbuf(); initinput();
    S.gotsword = 1; S.cutorder = 0xFF; Shad.ID = 2; Shad.Face = 86;
    startkid();
    if (S.level === 1) S.gotsword = 0;
    var l = S.level, msg = true;
    if (l === 0 || l === 14) msg = false;
    else if (l === 13 && S.skipmessage) { S.skipmessage = 0; msg = false; }
    if (msg) { S.message = LevelMsg; S.msgtimer = leveltimer; }
    entrance();
    FirstFrame();
  }
  function LoadLevelX(x) {
    blue.fill(0); blue.set(POP.data.levels[x]);
    S.BBundID = x >= FirstSideB ? POPside2 : POPside1;
    S.BGset1 = bgset1[x]; S.BGset2 = bgset2[x]; S.CHset = chset[x];
    var im = POP.data.images;
    G.tables.bg1 = [im.bg1dun, im.bg1pal, im.bg1dun][S.BGset1];
    G.tables.bg2 = [im.bg2dun, im.bg2pal, im.bg2dun][S.BGset2];
    G.tables.ch[3] = [im.ch4gd, im.ch4skel, im.ch4gd, im.ch4fat, im.ch4shad, im.ch4viz][S.CHset];
  }
  function LoadNextLevel() { if (S.NextLevel !== 14) S.timerequest = 1; LoadNext1(); }
  function LoadNext1() {
    S.origstrength = S.MaxKidStr; S.milestone = 0;
    var n = S.NextLevel;
    if (n >= LastSideB + 1 || n < 1) { S.NextLevel = S.level; jump(RESTART); }
    var side = n >= FirstSideB ? POPside2 : POPside1;
    if (side !== S.BBundID) { S.BBundID = side; flipdisk(); }
    S.level = n;
    var cut = { 2: 1, 4: 2, 6: 3, 8: 8, 9: 4, 12: 5 }[n];
    if (cut !== undefined) jump(function () { startCut(cut, RESTART); });
    jump(RESTART);
  }
  function flipdisk() { S.purpleflag = 1; }
  // the princess's room: the stage-2 data (chtable6, over the background tables) and the room on both pages
  function cutprincess(n) {
    var im = POP.data.images, ch6 = S.BBundID === POPside2 ? im.ch6b : im.ch6a;
    G.tables.ch[5] = ch6; G.tables.bg1 = ch6; G.tables.bg2 = ch6;
    show(0, 'black');
    HR.mem.set(POP.data.proom, 0); HR.mem.copyWithin(0x2000, 0, 0x2000);
    if (events.cutroom) events.cutroom(n);
  }
  function startCut(n, cont) { cutprincess(n); POP.cut.start(n, function () { runJumps(cont); }); setmode('cut'); }
  function runJumps(fn) {
    for (var guard = 0; guard < 16; guard++) {
      try { fn(); return; }
      catch (e) { if (!(e instanceof Jump)) throw e; fn = e.fn; }
    }
    throw new Error('jump loop');
  }
  function yellowcheck() { if (S.NextLevel !== 2) return; showtext(); S.yellowflag = 0x80; }
  function GOATTRACT() { S.BBundID = POPside1; attractmode(); }
  function attractmode() { setmode('title'); }
  function dostartgame() { START(1); }
  function YouLose() { jump(function () { startCut(6, GOATTRACT); }); }
  function YouWin() { jump(function () { startCut(7, epilog); }); }
  function epilog() { S.soundon = 1; S.musicon = 1; setmode('won'); }

  // ---------------------------------------------------------------- NEXT FRAME
  function NextFrame() {
    MV.animmobs(); MV.animtrans(); bonesrise(); checkalert();
    DoKid(); DoShad();
    AU.CheckStrike(); AU.CheckStab();
    addsfx(); chgmeters();
    AU.CutCheck(); PrepCut(); AU.CutGuard();
    var l = S.level;
    if (l === 0) { if (Kid.Scrn === 24) jump(GOATTRACT); }
    else if (l === 6) { if (Kid.Scrn === 1 && Kid.Y < 20) { Kid.Y = 0xFF; S.NextLevel = u8(S.NextLevel + 1); } }
    else if (l === 12) { if (Kid.Scrn === 23) { S.NextLevel = u8(S.NextLevel + 1); S.skipmessage = 1; jump(LoadNext1); } }
    if (l < 14) { if (l < 13 || !S.exitopen) keeptime(); }
    showtime();
    if (l < 13) { if ((S.MinLeft | S.SecLeft) === 0) YouLose(); }
  }
  function FrameAdv() { if (S.cutplan) { DoCleanCut(); return; } DoFast(); PageFlip(); }
  function FirstFrame() { S.cutscrn = Kid.Scrn; PrepCut(); DoCleanCut(); }
  function DoKid() {
    ST.LoadKidwOp(); ST.rereadblocks(); unholy(); ctrlplayer();
    if (S.invert && !(Char.Life & 0x80)) { S.redrawflg = 2; S.invert = 0; HR.inverty(); return; }
    wtlessflash();
    if (Char.Scrn !== 0) {
      CH.animchar(); gravity(); addfall();
      ST.setupchar(); ST.rereadblocks(); ST.getedges();
      firstguard(); CH.checkbarr(); CH.collisions(); CH.checkgate(); CH.checkfloor(); CH.checkpress(); ST.checkspikes(); CH.checkimpale(); CH.checkslice();
      shakeloose();
    }
    ST.SaveKid();
  }
  function DoShad() {
    if (Shad.Face === 86) return;
    ST.LoadShadwOp(); ST.rereadblocks(); unholy(); CH.shadctrl();
    if (Char.Scrn === S.VisScrn) {
      CH.animchar();
      var x = Char.X;
      if (x >= ST.ScrnLeft - 14 && x < ST.ScrnRight + 14) {
        gravity(); addfall(); ST.setupchar(); ST.rereadblocks(); ST.getedges();
        CH.enemycoll(); CH.checkfloor(); CH.checkpress(); ST.checkspikes(); CH.checkimpale(); CH.checkslice2();
      }
    }
    ST.SaveShad();
  }
  function addchars() {
    reflection();
    if (Shad.Face !== 86 && Shad.Scrn === S.VisScrn) {
      setupshad();
      if (S.ChgOppStr & 0x80) BG.setupcomix();
      CH.setupsword();
    }
    if (Kid.Scrn !== 0 && Kid.Scrn === S.VisScrn) {
      setupkid();
      if (S.ChgKidStr & 0x80) BG.setupcomix();
      CH.setupsword();
    }
    checkmeters();
  }
  function setupkid() {
    ST.LoadKid(); ST.rereadblocks();
    if (Char.Posn === 0) { pause(25); return; }
    ST.setupchar(); ST.unevenfloor(); ST.getedges(); ST.indexchar(); ST.quickfg(); ST.quickfloor(); ST.cropchar();
    CH.addkidobj();
  }
  function setupshad() {
    ST.LoadShad(); ST.rereadblocks();
    ST.setupchar(); ST.unevenfloor(); ST.getedges(); ST.indexchar(); ST.quickfg(); ST.quickfloor(); ST.cropchar();
    if (Char.ID === 1) {
      if (S.level === mirlevel && Char.Scrn === mirscrn) S.FCharCL = mirx * 4 + 1;    // clip the shadow at the left as he leaves the mirror
      CH.addshadobj(); return;
    }
    CH.addguardobj();
  }
  function DoCleanCut() {
    P.PAGE = 0x20; drawbg();
    P.PAGE = 0; HR.copyscrn(0x20, 0);
    DoFast();
    PageFlip();
  }
  function drawbg() {
    S.cutplan = 0; S.CUTTIMER = 2;
    lrclse(0xA0); vblank(); show(1, 'text');
    DoSure();
    BG.markmeters();
  }
  function DoSure() {
    S.SCRNUM = S.VisScrn;
    G.zerolsts(); BG.SURE(); G.zeropeels(); ST.zerored(); G.drawall();
  }
  function DoFast() {
    G.zerolsts();
    S.SCRNUM = S.VisScrn;
    develpatch();
    MV.addmobs();
    addchars();
    BG.FAST();
    dispmsg();
    G.drawall();
  }
  function develpatch() { if (!S.redrawflg) return; S.redrawflg = u8(S.redrawflg - 1); BG.markmeters(); BG.SURE(); }
  function flashon() {
    var c;
    if (S.lightning && S.lightcolor) c = S.lightcolor;
    else { if (!(S.ChgKidStr & 0x80)) return; c = 0x11; }
    doflashon(c);
  }
  function flashoff() {
    if (S.lightning) { S.lightning = u8(S.lightning - 1); if (!(S.lightning & 0x80)) { doflashoff(); return; } }
    if (!(S.ChgKidStr & 0x80)) return;
    doflashoff();
  }
  function initCDbuf() {
    for (var x = 9; x >= 0; x--) { S.SNlastframe[x] = 0xFF; S.SNthisframe[x] = 0xFF; S.SNbelow[x] = 0xFF; S.SNabove[x] = 0xFF; }
    S.BlockYlast = 0xFF;
  }
  function PrepCut() {
    var c = S.cutscrn;
    if (c === 0 || c === S.VisScrn) return;
    S.VisScrn = c;
    if (c === 5 && S.level === 14) YouWin();
    S.cutplan = 1;
    ST.getscrns();
    ST.LoadKid(); addslicers(); addtorches(); crumble();
    AU.AddGuard();
  }
  function ctrlplayer() {
    kill0();
    CH.playerctrl();
    if (Char.Life & 0x80) return;
    if (cold(Char.Posn)) return;
    if (Char.Life === 0) deathsong();
    if (Char.Life < deadenough) { Char.Life = u8(Char.Life + 1); return; }
    if (S.level === 0) jump(GOATTRACT);
    if (S.SongCue) return;
    if ((S.MinLeft | S.SecLeft) === 0) YouLose();
    if (!(S.message === ContMsg && S.msgtimer !== 0)) { S.message = ContMsg; S.msgtimer = 255; }
    if (S.msgtimer === 1) jump(GOATTRACT);
    if (!((S.BTN0 | S.BTN1) & 0x80)) return;
    jump(RESTART);
  }
  function deathsong() {
    var s;
    if (Shad.ID === 1) s = SONG.Shadow; else if (S.heroic) s = SONG.Heroic; else s = SONG.Accid;
    cuesong(s, 255);
  }
  function kill0() {
    if (!(Char.Life & 0x80)) return;
    if (Char.Scrn !== 0) return;
    addsound(SND.Splat); decstr(100); S.msgtimer = 0; Char.Life = 0; Char.Posn = 185;
  }
  function shakeloose() {
    var j = S.jarabove;
    if (j & 0x80) { S.jarabove = 0; MV.shakem(Char.BlockY); return; }
    if (j) { S.jarabove = 0; MV.shakem(u8(Char.BlockY - 1)); }
  }
  function checkmeters() { if (S.ChgKidStr) BG.markkidmeter(); if (S.ChgOppStr) BG.markoppmeter(); }
  function chgmeters() {
    if (S.level === 12 && (Op.ID | Char.ID) === 1) {
      if (S.ChgKidStr & 0x80) S.ChgOppStr = S.ChgKidStr;
      else if (S.ChgOppStr & 0x80) S.ChgKidStr = S.ChgOppStr;
    }
    var a = u8(S.KidStrength + S.ChgKidStr);
    if (a === S.MaxKidStr || a < S.MaxKidStr) S.KidStrength = a;
    a = u8(S.OppStrength + S.ChgOppStr);
    if (a === S.MaxOppStr || a < S.MaxOppStr) S.OppStrength = a;
  }
  function entrance() {
    ST.calcblue(Kid.Scrn);
    for (var y = 29; y >= 0; y--) {
      if ((blue[S.BlueType + y] & ST.idmask) !== OBJ.exit) continue;
      S.rdY = y; MV.closeexit(Kid.Scrn); return;
    }
  }
  function addsfx() {
    if (Kid.Posn === 167) { addsound(SND.SwordClash1); return; }
    if (Shad.Posn === 167) addsound(SND.SwordClash2);
  }
  function dispmsg() {
    if (!S.msgtimer) return;
    S.msgtimer = u8(S.msgtimer - 1);
    if (!(Kid.Life & 0x80)) {
      var m = S.msgtimer;
      if (m < contoff) return;
      if (m < contflash) {
        var f = m & 7;
        if (f >= 3) return;
        if (f === 2) { if (!S.soundon) gtone(); addsound(SND.FlashMsg); }
      }
      BG.continuemsg(); return;
    }
    if (S.msgtimer >= leveltimer - 2) return;
    if (S.message === LevelMsg) { BG.printlevel(); return; }
    if (S.message === TimeMsg) BG.timeleftmsg();
  }
  function isstatic(a) { if (a === 0 || a === 15 || a === 229 || a === 109 || a === 171 || a === 166) return 0; return cold(a); }
  function cold(a) { if (a === 185 || a === 177 || a === 178) return 0; return 1; }
  function misctimers() {
    if (S.mergetimer && !(S.mergetimer & 0x80)) { S.mergetimer = u8(S.mergetimer - 1); if (S.mergetimer === 0) S.mergetimer = 0xFF; }
    if (S.level !== 8 || Char.Scrn !== 16 || !S.exitopen) return;
    if (S.exitopen === mousetimer) { mouserescue(); S.exitopen = u8(S.exitopen + 1); return; }
    if (S.exitopen < mousetimer) S.exitopen = u8(S.exitopen + 1);
  }
  function wtlessflash() {
    if (!S.weightless) return;
    var x = 0;
    S.weightless = u8(S.weightless - 1);
    if (S.weightless !== 0) { x = 0xFF; if (S.weightless < wtlflash) x = S.vibes ^ 0xFF; }
    S.vibes = x;
  }

  // ---------------------------------------------------------------- SUBS.S
  function crumble() {
    if (S.level !== 13) return;
    if (S.VisScrn !== 23 && S.VisScrn !== 16) return;
    S.tempscrn = S.scrnAbove; S.tempblocky = 2;
    for (var x = 7; x >= 2; x--) {
      S.tempblockx = x;
      if (ST.rdblock1() === OBJ.loose) MV.breakloose1(u8(-(G.RND() & 0x0F)));
      x = S.tempblockx;
    }
  }
  function addtorches() {
    ST.calcblue(S.VisScrn);
    for (var y = 29; y >= 0; y--) {
      var id = blue[S.BlueType + y] & ST.idmask;
      S.rdY = y;
      if (id === OBJ.torch) MV.trigtorch(S.VisScrn);
      else if (id === OBJ.flask) MV.trigflask(S.VisScrn);
      else if (id === OBJ.sword) MV.trigsword(S.VisScrn);
    }
  }
  var slicetimer = 15, slicersync = 3, tempstate = 0;
  function addslicers() {
    tempstate = slicetimer;
    ST.calcblue(Char.Scrn);
    var by = Char.BlockY; if (by >= 3) return;
    var y = ST.Mult10[by], end = y + 10;
    for (; y < end; y++) {
      if ((blue[S.BlueType + y] & ST.idmask) !== OBJ.slicer) continue;
      var sp = blue[S.BlueSpec + y], f = sp & 0x7F;
      if (f !== 0 && f < ST.slicerRet) continue;
      S.rdY = y;
      MV.trigslicer((sp & 0x80) | tempstate);
      getnextstate();
    }
  }
  function getnextstate() { var a = u8(tempstate - slicersync); if (a < ST.slicerRet) a = u8(a + slicetimer + 1 - ST.slicerRet); tempstate = a; }
  function RemoveObj(a) {
    S.lastpotion = a; S.clrbtn = 1;
    ST.settype(OBJ.floor); ST.setspec(0);
    S.height = 35;
    var ix = { y: S.rdY, cs: false };
    ST.markwipe(ix, 2); ST.markred(ix, 2);
  }
  function setinitials() {
    var n = blue[ST.INFO] - 1;
    for (S.SCRNUM = n; S.SCRNUM !== 0; S.SCRNUM = u8(S.SCRNUM - 1)) DoScrn();
  }
  function DoScrn() {
    ST.calcblue(S.SCRNUM);
    for (var y = 29; y >= 0; y--) { var v = BG.getinitobj(y); if (v !== null) blue[S.BlueSpec + y] = v; }
  }
  function startkid() {
    if (S.level === 3 && S.milestone) {
      blue[ST.KidStartFace] = 0xFF; blue[ST.KidStartScrn] = 2; blue[ST.KidStartBlock] = 6;
      ST.rdblock(7, 4, 0); ST.settype(OBJ.space);
    }
    Char.Scrn = blue[ST.KidStartScrn];
    var ui = ST.unindex(blue[ST.KidStartBlock]);
    Char.BlockX = ui.bx; Char.BlockY = ui.by;
    Char.X = u8(ST.getblockej(Char.BlockX) + ST.angle + 7);
    Char.Face = blue[ST.KidStartFace] ^ 0xFF;
    var str = S.level === 0 ? 4 : S.origstrength;
    S.MaxKidStr = str; S.KidStrength = str;
    if (S.level === 1) { ST.rdblock(5, 2, 0); MV.pushpp(); ST.jumpseq(SEQ.stepfall); }
    else if (S.level === 13) ST.jumpseq(SEQ.running);
    else ST.jumpseq(SEQ.turn);
    startkid1();
  }
  function startkid1() {
    Char.Y = u8(FloorY[u8(Char.BlockY + 1)]);
    Char.Life = 0xFF; Char.ID = 0; Char.XVel = 0; Char.YVel = 0;
    S.waitingtojump = 0; S.weightless = 0; S.invert = 0; S.jarabove = 0; S.droppedout = 0; Char.Sword = 0; S.offguard = 0;
    CH.animchar();
    if (S.level === 7) {
      if (!(S.yellowflag & 0x80)) S.timebomb = 0x40;
      if (Char.Scrn === 17) AU.cut(3);
    }
    ST.SaveKid();
  }
  var TermVelocity = 33, AccelGravity = 3, WtlessTermVel = 4, WtlessGravity = 1;
  function gravity() {
    if (Char.Action !== 4) return;
    if (S.weightless) { var w = u8(Char.YVel + WtlessGravity); if (w >= WtlessTermVel) w = WtlessTermVel; Char.YVel = w; return; }
    var v = u8(Char.YVel + AccelGravity); if (v >= TermVelocity) v = TermVelocity; Char.YVel = v;
  }
  function addfall() {
    Char.Y = u8(Char.YVel + Char.Y);
    if (Char.Action !== 4) return;
    Char.X = ST.addcharx(Char.XVel);
    ST.rereadblocks();
  }
  function initialguards() {
    for (var y = 24; y > 0; y--) {
      var gb = blue[ST.GdStartBlock - 1 + y];
      if (gb >= 30) continue;
      var ui = ST.unindex(gb);
      blue[ST.GdStartX - 1 + y] = u8(ST.getblockej(ui.bx) + ST.angle + 7);
      blue[ST.GdStartSeqH - 1 + y] = 0;
    }
  }
  function deadenemy() {
    if (S.level === 0) { S.milestone = 1; S.PreRecPtr = 0; S.PlayCount = 0; return; }
    if (S.level === 13) {
      cuesong(SONG.Upstairs, 25);
      S.lightcolor = 0xFF; S.lightning = 10; S.exitopen = 1; S.timerequest = 4;
      ST.rdblock(24, 0, 0); MV.pushpp(); return;
    }
    if (Char.ID === 1) return;
    cuesong(SONG.Vict, 25);
  }
  function mirappear() { if (S.level !== 4) return; ST.rdblock(mirscrn, mirx, miry); ST.settype(OBJ.mirror); }
  function getminleft() {
    var fc = S.FrameCount;
    var sub = function (start, unit) {
      var count = start, y = 0x61;
      for (;;) {
        if (count >= fc) return y;
        count = (count + unit) & 0xFFFF;
        y = bcdDec(y);
        if (y & 0x80) return 0;
      }
    };
    S.MinLeft = sub(0, min);
    if (S.MinLeft >= 2) return;
    S.SecLeft = sub(59 * min, sec);
  }
  function bcdDec(y) { var lo = y & 0x0F, hi = y >> 4; if (lo === 0) { lo = 9; hi--; } else lo--; if (hi < 0) return 0xFF; return (hi << 4) | lo; }
  function showtime() {
    if (!S.timerequest) return;
    if (!(Kid.Life & 0x80)) return;
    getminleft();
    if (S.MinLeft < 2) {
      if (S.SecLeft === 0) { if (S.timerequest < 3) return; }
      else if (S.level < 14) {                                          // the countdown of the final minute
        if (S.SecLeft < 2) { S.timerequest = 0; S.msgtimer = 0; return; }
        if (S.message !== TimeMsg) { if (S.msgtimer) return; S.message = TimeMsg; }
        S.timerequest = 1; S.msgtimer = 1; return;
      }
    }
    if (S.msgtimer) return;
    S.message = TimeMsg;
    S.msgtimer = S.timerequest >= 4 ? timemsgtimer + 5 : timemsgtimer;
    S.timerequest = 0;
  }
  function keeptime() {
    if (S.level === 0) return;
    if (!(Kid.Life & 0x80)) return;
    S.FrameCount = (S.FrameCount + 1) & 0xFFFF;
    if (S.FrameCount === 0) S.FrameCount = 0xFFFF;
    var y = S.NextTimeMsg;
    if (y >= nummsg) return;
    var tt = timetable[y >> 1];                                       // the original compares the bytes one after the other, not as one number
    if ((S.FrameCount >> 8) < (tt >> 8)) return;
    if ((S.FrameCount & 0xFF) < (tt & 0xFF)) return;
    if (S.msgtimer) return;
    S.NextTimeMsg = y + 2;
    S.timerequest = 2;
  }
  function shortentime() {
    if (S.NextTimeMsg >= 20) return;
    S.NextTimeMsg = 18; S.FrameCount = timetable[9];
  }
  function cuesong(a, x) { S.SongCue = a; S.SongCount = x; }
  function DoSaveGame() {
    if (S.level < FirstSideB) { addsound(SND.Splat); return; }
    S.SavStrength = S.origstrength; S.SavTimer = S.FrameCount; S.SavNextMsg = S.NextTimeMsg;
    if (events.save) events.save({ level: S.SavLevel, strength: S.SavStrength, timer: S.SavTimer, nextmsg: S.SavNextMsg });
  }

  // ---------------------------------------------------------------- MISC.S
  function VanishChar() { Char.Face = 86; Char.Action = 0; Char.Life = 0; S.ChgOppStr = u8(0 - S.OppStrength); }
  function firstguard() {
    if (S.EnemyAlert < 2) return;
    if (Char.Sword !== 0) return;
    if (Op.Sword === 0) return;
    if (Op.Action >= 2) return;
    if (Char.Face === Op.Face) return;
    if (ST.getopdist() < u8(-15)) return;
    Char.Y = u8(FloorY[u8(Char.BlockY + 1)]);
    ST.jumpseq(SEQ.bump); CH.animchar();
  }
  var wtlesstimer = 200, vibetimer = 3;
  function potioneffect() {
    if (Char.ID !== 0) return;
    var x = S.lastpotion;
    if (x === 0) return;
    if (x & 0x80) { S.gotsword = 1; cuesong(SONG.Sword, 25); S.lightcolor = 0xFF; S.lightning = 3; return; }
    if (x === 1) {
      if (S.KidStrength === S.MaxKidStr) return;
      S.lightcolor = 0x99; S.lightning = 2; cuesong(SONG.ShortPot, 25); S.ChgKidStr = 1; return;
    }
    if (x === 2) { S.lightcolor = 0x99; S.lightning = 5; cuesong(SONG.Potion, 25); ST.boostmeter(); return; }
    if (x === 3) { cuesong(SONG.ShortPot, 25); S.weightless = wtlesstimer; S.vibes = vibetimer; return; }
    if (x === 4) { S.invert ^= 0xFF; S.redrawflg = 2; HR.inverty(); return; }
    if (x === 5) { addsound(SND.Splat); S.ChgKidStr = 0xFF; }
  }
  function mouserescue() {
    ST.LoadKid();
    Char.ID = 24; Char.X = 200; Char.BlockY = 0; Char.Y = u8(FloorY[1]); Char.Face = 0xFF; Char.Life = 0xFF;
    S.OppStrength = 1;
    ST.jumpseq(SEQ.Mscurry); CH.animchar();
    ST.SaveShad();
  }
  function StabChar() {
    if (!(Char.Life & 0x80)) return;
    if (Char.Sword !== 2) { decstr(100); stabkilled(); return; }
    if (Char.ID === 4) { stabwounded(); return; }
    if (decstr(1) !== 0) { stabwounded(); return; }
    if (Char.ID === 0) { stabkilled(); return; }
    if (Char.ID !== 4) { stabkilled(); return; }
    S.ChgOppStr = 0;
  }
  function stabkilled() {
    if (ST.getbehind() === OBJ.space && ST.getdist() >= 4) {
      Char.X = ST.addcharx(u8(ST.getdist() - 14));
      Char.BlockY = u8(Char.BlockY + 1);
      ST.jumpseq(SEQ.fightfall); stab3(); return;
    }
    stab2(SEQ.stabkill);
  }
  function stabwounded() { stab2(SEQ.stabbed); }
  function stab2(seq) { ST.jumpseq(seq); Char.Y = u8(FloorY[u8(Char.BlockY + 1)]); Char.YVel = 0; stab3(); }
  function stab3() { addsound(SND.Splat); CH.animchar(); }
  function unholy() {
    if (S.level !== 12) return;
    if ((Op.ID | Char.ID) !== 1) return;
    if (!(Char.Life & 0x80)) return;
    if (Op.Life & 0x80) return;
    S.lightcolor = 0xFF; S.lightning = 5; addsound(SND.Splat); decstr(100);
  }
  function reflection() {
    ST.LoadKid(); ST.GetFrameInfo();
    if (S.createshad === 0xFF) { CreateShad(); return; }
    if (ST.getunderft() !== OBJ.mirror) return;
    getreflect();
    if (S.dmirr & 0x80) return;
    ST.setupchar();
    var bt = u8(ST.BlockTop[u8(Char.BlockY + 1)]);
    if (bt >= S.FCharY) return;
    S.FCharCU = bt;
    S.FCharCL = u8((Char.BlockX << 2) + 1);
    CH.addreflobj();
  }
  function getreflect() {
    S.mirrx = u8(ST.getblockej(Char.BlockX) + ST.angle + 3);
    var d = ST.getdist();
    if (!(Char.Face & 0x80)) d = u8((d ^ 0xFF) + 14);
    S.dmirr = u8(d - 2);
    Char.X = u8((S.mirrx << 1) - Char.X);
    Char.Face ^= 0xFF;
  }
  function CreateShad() {
    getreflect();
    S.createshad = 0; Char.ID = 1;
    addsound(SND.MirrorCrack);
    ST.SaveShad();
    S.MaxOppStr = S.MaxKidStr; S.OppStrength = S.MaxKidStr; S.KidStrength = 1;
    BG.markmeters();
  }
  var skelscrn = 1, skelx = 5, skely = 1, skeltrig = 2, skelprog = 2;
  function bonesrise() {
    if (S.level !== 3) return;
    if (Shad.Face !== 86) return;
    if (S.VisScrn !== skelscrn) return;
    if (!S.exitopen) return;
    if (Kid.BlockX !== skeltrig && Kid.BlockX !== skeltrig + 1) return;
    var a = ST.rdblock(S.VisScrn, skelx, skely);
    ST.settype(OBJ.floor);
    S.height = 24;
    var ix = { y: S.rdY, cs: false };
    ST.markred(ix, 2); ST.markwipe(ix, 2);
    ix = { y: S.rdY + 1, cs: false };
    ST.markred(ix, 2); ST.markwipe(ix, 2);
    if (a !== OBJ.bones) return;
    Char.Scrn = S.VisScrn; Char.BlockY = skely; Char.Y = u8(FloorY[skely + 1]);
    Char.BlockX = skelx; Char.X = u8(ST.getblockej(skelx) + ST.angle + 7);
    Char.Face = 0xFF;
    ST.jumpseq(SEQ.arise); CH.animchar();
    S.guardprog = skelprog;
    Char.Life = 0xFF; S.OppStrength = 3; S.alertguard = 0; S.refract = 0; Char.XVel = 0; Char.YVel = 0;
    Char.Sword = 2; Char.ID = 4;
    ST.SaveShad();
  }
  // decrease strength by a: returns non-0 if the character lives, 0 if he dies
  function decstr(a) {
    if (Char.ID !== 0) {
      if (a >= S.OppStrength) { S.ChgOppStr = u8(0 - S.OppStrength); return 0; }
      S.ChgOppStr = u8(-a); return S.ChgOppStr;
    }
    if (a >= S.KidStrength) { S.ChgKidStr = u8(0 - S.KidStrength); return 0; }
    S.ChgKidStr = u8(-a); return S.ChgKidStr;
  }
  var gfightthres = 28 * 4;
  function checkalert() {
    var id = Shad.ID;
    if (id === 24) return;
    if (id === 1 && S.level !== 12) { S.EnemyAlert = 0; return; }
    var p = Kid.Posn;
    if (p === 0 || (p >= 219 && p < 229)) { S.EnemyAlert = 0; return; }
    if (Shad.Face === 86) { S.EnemyAlert = 0; return; }
    if (!(Kid.Life & Shad.Life & 0x80)) { S.EnemyAlert = 0; return; }
    if (Kid.Scrn !== Shad.Scrn || Kid.BlockY !== Shad.BlockY) { S.EnemyAlert = 0; return; }
    S.EnemyAlert = 2;
    var xc = u8(ST.getblockej(Kid.BlockX) + 7), xe = u8(ST.getblockej(Shad.BlockX) + 7);
    if (xe < xc) { var tt = xc; xc = xe; xe = tt; }
    var rd = function (x) { return ST.rdblock(Kid.Scrn, u8(ST.getblockxp(x)), Kid.BlockY); };
    if (rd(xc) === OBJ.slicer) xc = u8(xc + 14);
    if (rd(xe) === OBJ.gate) xe = u8(xe - 14);
    if (xe < xc) return;
    var a = xc;
    for (;;) {
      if (a !== xe && a > xe) return;
      var id2 = rd(a);
      if (id2 === OBJ.block || id2 === OBJ.panelwif || id2 === OBJ.panelwof) { S.EnemyAlert = 0; return; }
      var view = false;
      if (id2 === OBJ.loose) view = true;
      else if (id2 === OBJ.gate) view = ST.spec() < gfightthres;
      else if (id2 === OBJ.slicer) view = true;
      else view = ST.cmpspace(id2) === 0;
      if (view) S.EnemyAlert = 1;
      xc = u8(xc + 14); a = xc;
      if (a === 0) return;
    }
  }

  // ---------------------------------------------------------------- music: the game pauses while a song plays, torches burning
  // how many torch burns (mplay iterations) each song lasts, measured in the emulator; 1 when sound or music is off
  var songB7 = { 2: 0, 4: 0, 5: 0, 6: 4, 7: 0, 9: 0, 10: 4, 11: 0, 12: 0, 13: 0, 15: 0, 16: 0 };
  var songTicks = { 1: 56, 2: 128, 3: 45, 4: 114, 5: 136, 6: 158, 7: 135, 8: 39, 9: 238, 10: 146, 11: 90, 12: 40, 13: 292, 14: 363, 15: 150, 16: 136 };
  function songcues() {
    if (!S.SongCue || S.level === 0) return;
    if (S.SongCount === 0) { S.SongCue = 0; return; }
    S.SongCount = u8(S.SongCount - 1);
    if (Kid.Posn === 0 && S.NextLevel !== S.level) return;
    if (isstatic(Kid.Posn)) return;
    if (Shad.Face !== 86 && Shad.Scrn === S.VisScrn && isstatic(Shad.Posn)) return;
    if (S.trobcount || S.nummob || S.lightning) return;
    if (!(S.mergetimer & 0x80)) { if (S.mergetimer) return; if (S.ChgKidStr | S.ChgOppStr) return; }
    P.PAGE ^= 0x20;
    listtorches();
    var song = S.SongCue, n = (S.soundon & S.musicon) ? (songTicks[song] || 0) : 1;
    if (events.song) events.song(song);
    for (var i = 0; i < n; i++) burn();
    S.savekidx = 0; S.leadedge = 0;                                    // the music player uses $AF, $B6 (and for most songs $B7) as scratch
    if (n > 1 && songB7[song] !== undefined) S.leftej = songB7[song];
    S.SongCue = 0;
    P.PAGE ^= 0x20;
    clearjoy();
  }
  var maxtorches = 8, torchx = new Uint8Array(9), torchy = new Uint8Array(9), torchstate = new Uint8Array(9), torchclip = new Uint8Array(9), torchcount = 0;
  function listtorches() {
    var n = 0;
    ST.calcblue(S.VisScrn);
    for (var y = 29; y >= 0; y--) {
      if ((blue[S.BlueType + y] & ST.idmask) === OBJ.torch) {
        var clip = S.fredbuf[y + 1], ui = ST.unindex(y);
        torchy[n] = u8(ST.BlockBot[ui.by + 1] - 3); torchclip[n] = clip;
        var bx = ui.bx + 1;
        if (bx < 10) { torchx[n] = bx << 2; torchstate[n] = blue[S.BlueSpec + y]; n++; }
      }
      if (n >= maxtorches) break;
    }
    torchx[n] = 0xFF; torchcount = 0xFF;
  }
  function burn() {
    if (torchx[0] & 0x80) return;
    var x = u8(torchcount + 1);
    if (torchx[x] & 0x80) x = 0;
    torchcount = x;
    P.XCO = torchx[x]; P.YCO = torchy[x]; P.BOTCUT = torchclip[x];
    torchstate[x] = MV.getflameframe(torchstate[x]);
    BG.setparams(P.XCO, P.YCO);
    var r = BG.setupflame(torchstate[x]);
    var pp = BG.params(); G.setbgimg(pp.IMAGE); P.XCO = pp.XCO; P.YCO = pp.YCO; P.OPACITY = pp.OPACITY;
    if (!torchclip[x]) { HR.fastlay(); return; }
    G.initlay(); P.OFFSET = 0; P.BOTCUT = u8(P.YCO - 4);
    HR.lay();
  }

  return { input: input, events: events, tick: tick, START: START, STARTRESUME: STARTRESUME, RESTART: RESTART, INITSYSTEM: INITSYSTEM, mode: function () { return mode; }, setmode: setmode,
    strobe: strobe, demokeys: demokeys, doflashon: doflashon, doflashoff: doflashoff, jump: jump, runJumps: runJumps, startCut: startCut, GOATTRACT: GOATTRACT,
    songTicks: songTicks, PageFlip: PageFlip, cuesong: cuesong, decstr: decstr, addslicers: addslicers, addtorches: addtorches, potioneffect: potioneffect, RemoveObj: RemoveObj,
    deadenemy: deadenemy, VanishChar: VanishChar, StabChar: StabChar, mirappear: mirappear, addlowersound: addlowersound, attractmode: attractmode, dostartgame: dostartgame,
    facejstk: facejstk, getselect: getselect, getdesel: getdesel, clrjstk: clrjstk, LoadSelect: LoadSelect, SaveSelect: SaveSelect, LoadDesel: LoadDesel, SaveDesel: SaveDesel,
    demo: demo, mainloop: mainloop, NextFrame: NextFrame, FrameAdv: FrameAdv, DoFast: DoFast, DoSure: DoSure, checkalert: checkalert, getminleft: getminleft };

  function addlowersound(a) {
    if (!(a & 1)) return;
    var scrn = S.trscrn[0], y = S.trloc[0];
    if (S.level === 3 && scrn === 2) { addsound(SND.LoweringGate); return; }
    if (scrn === S.scrnLeft) { if (y === 9 || y === 19 || y === 29) addsound(SND.LoweringGate); return; }
    if (scrn !== S.VisScrn) return;
    if (y === 9 || y === 19 || y === 29) return;
    addsound(SND.LoweringGate);
  }
  function demo() { AU.AutoPlayback(DemoProg1); }
})();
var DemoProg1 = (function () {
  var Ctr = 0, Fwd = 1, Back = 2, Up = 3, Down = 4, Upfwd = 5, Press = 6, Release = 7, EndDemo = 0xFF, d1 = 65, d2 = 115, d3 = 193;
  return [0, Ctr, 1, Fwd, 13, Ctr, 30, Fwd, 37, Upfwd, 47, Ctr, 48, Fwd, d1, Ctr, d1 + 8, Back, d1 + 10, Ctr, d1 + 34, Back, d1 + 35, Ctr,
    d2, Upfwd, d2 + 13, Press, d2 + 21, Up, d2 + 42, Release, d2 + 43, Ctr, d2 + 44, Fwd, d2 + 58, Down, d2 + 62, Ctr, d2 + 63, Fwd, d2 + 73, Ctr,
    d3, Fwd, d3 + 12, Ctr, d3 + 40, EndDemo];
})();
