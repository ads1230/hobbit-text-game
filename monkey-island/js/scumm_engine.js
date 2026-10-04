/*
 * SCUMM v5 engine core: state, variables, script threads, the v5 opcode set,
 * objects, inventory, verbs, sentences, camera, input and the main loop.
 * A JavaScript port of the relevant parts of ScummVM's engines/scumm
 * (GPL v3) for The Secret of Monkey Island (Macintosh, 1993).
 *
 * Resources never move: every "resource address" is an absolute offset into
 * the decoded data file (res.d), and script slots keep base + offs.
 */
var SCUMM = (function (g) { return g.SCUMM || (g.SCUMM = {}); })(typeof globalThis !== 'undefined' ? globalThis : this);

(function () {
  'use strict';

  // ---- constants ----
  var NUM_SCRIPT_SLOT = 80, NUM_SCRIPT_LOCAL = 25, NUM_SENTENCE = 6, MAX_CUTSCENE = 5, MAX_NESTING = 15;
  var ssDead = 0, ssPaused = 1, ssRunning = 2;
  var WIO_NOT_FOUND = -1, WIO_INVENTORY = 0, WIO_ROOM = 1, WIO_GLOBAL = 2, WIO_LOCAL = 3, WIO_FLOBJECT = 4;
  var OF_OWNER_ROOM = 0x0F;
  var kObjectClassNeverClip = 20, kObjectClassAlwaysClip = 21, kObjectClassIgnoreBoxes = 22, kObjectClassYFlip = 29,
      kObjectClassXFlip = 30, kObjectClassPlayer = 31, kObjectClassUntouchable = 32;
  var MBS_LEFT_CLICK = 0x8000, MBS_RIGHT_CLICK = 0x4000, MBS_MOUSE_MASK = 0xC000, MBS_MAX_KEY = 0x200;
  var kVerbClickArea = 1, kSceneClickArea = 2, kInventoryClickArea = 3, kKeyClickArea = 4;
  var PARAM_1 = 0x80, PARAM_2 = 0x40, PARAM_3 = 0x20;
  var kNormalCameraMode = 1, kFollowActorCameraMode = 2, kPanningCameraMode = 3;
  var USAGE_BIT_DIRTY = 96, USAGE_BIT_RESTORED = 95;
  var kMainVirtScreen = 0, kTextVirtScreen = 1, kVerbVirtScreen = 2, kBannerVirtScreen = 3;
  var kTextVerbType = 0, kImageVerbType = 1;
  var LIGHTMODE_actor_use_base_palette = 1, LIGHTMODE_room_lights_on = 2, LIGHTMODE_flashlight_on = 4, LIGHTMODE_actor_use_colors = 8;

  // v5 variable numbers
  var V = {
    KEYPRESS: 0, EGO: 1, CAMERA_POS_X: 2, HAVE_MSG: 3, ROOM: 4, OVERRIDE: 5, MACHINE_SPEED: 6, ME: 7, NUM_ACTOR: 8,
    CURRENT_LIGHTS: 9, CURRENTDRIVE: 10, TMR_1: 11, TMR_2: 12, TMR_3: 13, MUSIC_TIMER: 14, ACTOR_RANGE_MIN: 15,
    ACTOR_RANGE_MAX: 16, CAMERA_MIN_X: 17, CAMERA_MAX_X: 18, TIMER_NEXT: 19, VIRT_MOUSE_X: 20, VIRT_MOUSE_Y: 21,
    ROOM_RESOURCE: 22, LAST_SOUND: 23, CUTSCENEEXIT_KEY: 24, TALK_ACTOR: 25, CAMERA_FAST_X: 26, SCROLL_SCRIPT: 27,
    ENTRY_SCRIPT: 28, ENTRY_SCRIPT2: 29, EXIT_SCRIPT: 30, EXIT_SCRIPT2: 31, VERB_SCRIPT: 32, SENTENCE_SCRIPT: 33,
    INVENTORY_SCRIPT: 34, CUTSCENE_START_SCRIPT: 35, CUTSCENE_END_SCRIPT: 36, CHARINC: 37, WALKTO_OBJ: 38,
    DEBUGMODE: 39, HEAPSPACE: 40, RESTART_KEY: 42, PAUSE_KEY: 43, MOUSE_X: 44, MOUSE_Y: 45, TIMER: 46,
    TIMER_TOTAL: 47, SOUNDCARD: 48, VIDEOMODE: 49, MAINMENU_KEY: 50, FIXEDDISK: 51, CURSORSTATE: 52, USERPUT: 53,
    V5_TALK_STRING_Y: 54, SOUNDRESULT: 56, TALKSTOP_KEY: 57, FADE_DELAY: 59, NOSUBTITLES: 60, SOUNDPARAM: 64,
    SOUNDPARAM2: 65, SOUNDPARAM3: 66, INPUTMODE: 67, MEMORY_PERFORMANCE: 68, VIDEO_PERFORMANCE: 69, ROOM_FLAG: 70,
    GAME_LOADED: 71, NEW_ROOM: 72
  };

  function Engine(res, opts) {
    this.res = res;
    this.d = res.d;
    this.opts = opts || {};
    this.log = this.opts.log || function () {};
    this.warn = this.opts.warn || function (s) { if (typeof console !== 'undefined') console.warn(s); };
    this.screenWidth = 320; this.screenHeight = 200;
    this.numActors = 13;
    this.numVariables = res.maxs.numVariables || 800;
    this.numBitVariables = res.maxs.numBitVariables || 2048;
    this.numLocalObjects = res.maxs.numLocalObjects || 200;
    this.numInventory = res.maxs.numInventory || 80;
    this.numVerbs = 100; this.numNewNames = 150; this.numGlobalScripts = 200; this.numFlObject = 50; this.numArray = 50;
    this.numGlobalObjects = res.numGlobalObjects;
    this.numCharsets = res.maxs.numCharsets || 9;

    this.vars = new Int32Array(this.numVariables);
    this.bitVars = new Uint8Array(this.numBitVariables >> 3);
    this.objectOwnerTable = new Uint8Array(res.objOwner);
    this.objectStateTable = new Uint8Array(res.objState);
    this.classData = new Uint32Array(res.classData);
    this.classDataInit = new Uint32Array(res.classData);

    // script VM
    this.slots = [];
    for (var i = 0; i < NUM_SCRIPT_SLOT; i++) this.slots.push(this.newSlot());
    this.localvar = [];
    for (i = 0; i < NUM_SCRIPT_SLOT; i++) this.localvar.push(new Int32Array(NUM_SCRIPT_LOCAL));
    this.nest = [];
    for (i = 0; i < MAX_NESTING + 1; i++) this.nest.push({ number: 0, where: 0xFF, slot: 0xFF });
    this.numNestedScripts = 0;
    this.cutSceneStackPointer = 0;
    this.cutScenePtr = new Int32Array(MAX_CUTSCENE); this.cutSceneScript = new Int32Array(MAX_CUTSCENE); this.cutSceneData = new Int32Array(MAX_CUTSCENE);
    this.cutSceneScriptIndex = 0xFF;
    this.currentScript = 0xFF;
    this.scriptOrg = 0; this.pc = 0; this.opcode = 0; this.resultVarNumber = 0;
    this.stack = new Int32Array(150); this.stackPos = 0;
    this.sentence = []; for (i = 0; i < NUM_SENTENCE; i++) this.sentence.push({ verb: 0, preposition: 0, objectA: 0, objectB: 0, freezeCount: 0 });
    this.sentenceNum = 0;

    // string resources etc.
    this.strings = []; this.verbNames = []; this.newNames = new Int32Array(this.numNewNames); this.newNameStr = []; this.actorNames = [];
    this.inventory = new Int32Array(this.numInventory); this.inventoryObcd = new Int32Array(this.numInventory);
    this.localScriptOffsets = new Int32Array(200);
    this.resourceMapper = new Uint8Array(128);

    // objects in room
    this.objs = [];
    for (i = 0; i < this.numLocalObjects; i++) this.objs.push(this.newObj());
    this.drawObjectQue = []; this.numObjectsInRoom = 0;

    // verbs
    this.verbs = [];
    for (i = 0; i < this.numVerbs; i++) this.verbs.push(this.newVerb());
    this.verbMouseOver = 0;

    this.camera = { cur: { x: 0, y: 0 }, dest: { x: 0, y: 0 }, last: { x: 0, y: 0 }, mode: 0, follows: 0, leftTrigger: 10, rightTrigger: 30, movingToActor: false };

    this.currentRoom = 0; this.roomResource = 0; this.roomWidth = 0; this.roomHeight = 0;
    this.ENCD_offs = 0; this.EXCD_offs = 0; this.IM00_offs = 0; this.CLUT_offs = 0; this.EPAL_offs = 0;
    this.fullRedraw = false; this.bgNeedsRedraw = false; this.completeScreenRedraw = false;
    this.egoPositioned = false;
    this.userPut = 0; this.cursor = { state: 0, animate: 1, animateIndex: 0 }; this.currentCursor = 0;
    this.mouse = { x: 104, y: 56 }; this.virtualMouse = { x: 0, y: 0 };
    this.mouseAndKeyboardStat = 0; this.leftBtnPressed = 0; this.rightBtnPressed = 0; this.keyPressed = null;
    this.inputQueue = [];
    this.switchRoomEffect = 0; this.switchRoomEffect2 = 0; this.newEffect = 129; this.doEffect = false; this.screenEffectFlag = false;
    this.shakeEnabled = false; this.shakeFrame = 0;
    this.saveLoadFlag = 0; this.saveLoadSlot = 0;
    this.talkDelay = 0; this.haveMsg = 0; this.keepText = false; this.useTalkAnims = false; this.haveActorSpeechMsg = false;
    this.actorToPrintStrFor = 0; this.charsetBuffer = new Uint8Array(512); this.charsetBufPos = 0; this.charsetColor = 0; this.msgCount = 0;
    this.nextLeft = 0; this.nextTop = 0; this.defaultTextSpeed = 6;
    this.flashlight = { xStrips: 0, yStrips: 0, isDrawn: false };
    this.rndState = 0x12345678;
    this.quitFlag = false; this.restartFlag = false;
    this.copyProtection = false;
    this.fastMode = false;
    this.snapScroll = false;

    this.initScreenState();
    this.initText();
    this.initActors();
    this.initSound();
    this.resetScumm();
    this.resetScummVars();
  }

  Engine.V = V;
  Engine.prototype.newSlot = function () {
    return { number: 0, offs: 0, base: 0, status: ssDead, where: 0, freezeResistant: false, recursive: false,
             freezeCount: 0, delayFrameCount: 0, cycle: 1, delay: 0, didexec: false, cutsceneOverride: 0 };
  };
  Engine.prototype.newObj = function () {
    return { obj_nr: 0, x_pos: 0, y_pos: 0, width: 0, height: 0, walk_x: 0, walk_y: 0, actordir: 0, parent: 0,
             parentstate: 0, state: 0, flags: 0, obcd: 0, obim: 0, fl_object_index: 0, room: 0 };
  };
  Engine.prototype.newVerb = function () {
    return { verbid: 0, curRect: { left: 0, top: 0, right: 319, bottom: 0 }, oldRect: { left: -1, top: 0, right: 0, bottom: 0 },
             color: 2, hicolor: 0, dimcolor: 8, bkcolor: 0, type: 0, charset_nr: 1, curmode: 0, saveid: 0, key: 0, center: 0,
             prep: 0, imgindex: 0, origLeft: 0, image: 0 };
  };

  // ---- random numbers (same generator as ScummVM's Common::RandomSource) ----
  Engine.prototype.getRandomNumber = function (max) {
    // xorshift-based, period doesn't matter for the game
    var s = this.rndState;
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    this.rndState = s;
    return s % (max + 1);
  };

  // ---- variables ----
  Engine.prototype.VAR = function (n) { return this.vars[n]; };
  Engine.prototype.setVAR = function (n, v) { this.vars[n] = v; };

  Engine.prototype.readVar = function (v) {
    if (v & 0x2000) {
      var a = this.fetchWord();
      if (a & 0x2000) v += this.readVar(a & ~0x2000); else v += a & 0xFFF;
      v &= ~0x2000;
    }
    if (!(v & 0xF000)) {
      if (v === V.NOSUBTITLES) return 0;
      if (v < 0 || v >= this.numVariables) throw new Error('variable (reading) ' + v + ' out of range');
      return this.vars[v];
    }
    if (v & 0x8000) {
      v &= 0x7FFF;
      if (v >= this.numBitVariables) throw new Error('bit variable (reading) ' + v + ' out of range');
      return (this.bitVars[v >> 3] & (1 << (v & 7))) ? 1 : 0;
    }
    if (v & 0x4000) {
      v &= 0xFFF;
      if (v > 20) throw new Error('local variable (reading) ' + v + ' out of range');
      return this.localvar[this.currentScript][v];
    }
    throw new Error('Illegal varbits (r)');
  };

  Engine.prototype.writeVar = function (v, value) {
    if (!(v & 0xF000)) {
      if (v < 0 || v >= this.numVariables) throw new Error('variable (writing) ' + v + ' out of range');
      if (v === V.CHARINC) { if (this.opts.talkSpeed !== undefined && this.currentRoom === 0) value = 9 - this.opts.talkSpeed; }
      this.vars[v] = value;
      return;
    }
    if (v & 0x8000) {
      v &= 0x7FFF;
      if (v >= this.numBitVariables) throw new Error('bit variable (writing) ' + v + ' out of range');
      if (value) this.bitVars[v >> 3] |= (1 << (v & 7)); else this.bitVars[v >> 3] &= ~(1 << (v & 7));
      return;
    }
    if (v & 0x4000) {
      v &= 0xFFF;
      if (v > 20) throw new Error('local variable (writing) ' + v + ' out of range');
      this.localvar[this.currentScript][v] = value;
      return;
    }
    throw new Error('Illegal varbits (w)');
  };

  // ---- script byte fetching (pc is absolute) ----
  Engine.prototype.fetchByte = function () { return this.d[this.pc++]; };
  Engine.prototype.fetchWord = function () { var a = this.d[this.pc] | (this.d[this.pc + 1] << 8); this.pc += 2; return a; };
  Engine.prototype.fetchWordSigned = function () { var a = this.fetchWord(); return a & 0x8000 ? a - 0x10000 : a; };
  Engine.prototype.getVar = function () { return this.readVar(this.fetchWord()); };
  Engine.prototype.getVarOrDirectByte = function (mask) { if (this.opcode & mask) return this.getVar(); return this.fetchByte(); };
  Engine.prototype.getVarOrDirectWord = function (mask) { if (this.opcode & mask) return this.getVar(); return this.fetchWordSigned(); };
  Engine.prototype.getResultPos = function () {
    this.resultVarNumber = this.fetchWord();
    if (this.resultVarNumber & 0x2000) {
      var a = this.fetchWord();
      if (a & 0x2000) this.resultVarNumber += this.readVar(a & ~0x2000); else this.resultVarNumber += a & 0xFFF;
      this.resultVarNumber &= ~0x2000;
    }
  };
  Engine.prototype.setResult = function (value) { this.writeVar(this.resultVarNumber, value); };
  Engine.prototype.jumpRelative = function (cond) {
    var offset = this.fetchWordSigned();
    if (!cond) this.pc += offset;
  };
  Engine.prototype.getWordVararg = function () {
    var out = new Int32Array(NUM_SCRIPT_LOCAL), i = 0;
    while ((this.opcode = this.fetchByte()) !== 0xFF) out[i++] = this.getVarOrDirectWord(PARAM_1);
    out.count = i;
    return out;
  };
  Engine.prototype.push = function (a) { this.stack[this.stackPos++] = a; };
  Engine.prototype.pop = function () { return this.stack[--this.stackPos]; };

  // ---- resource addresses ----
  Engine.prototype.roomPtr = function (r) { return this.res.roomOffset(r); };
  Engine.prototype.scriptPtr = function (id) { return this.res.scriptOffset(id); };
  Engine.prototype.costumePtr = function (id) { return this.res.costumeOffset(id); };
  Engine.prototype.soundPtr = function (id) { return this.res.soundOffset(id); };
  Engine.prototype.charsetPtr = function (id) { return this.res.charsetOffset(id); };
  Engine.prototype.find = function (o, tag) { return this.res.find(o, tag); };
  Engine.prototype.le16 = function (o) { return this.d[o] | (this.d[o + 1] << 8); };
  Engine.prototype.s16 = function (o) { var v = this.le16(o); return v & 0x8000 ? v - 0x10000 : v; };
  Engine.prototype.le32 = function (o) { return (this.d[o] | (this.d[o + 1] << 8) | (this.d[o + 2] << 16) | (this.d[o + 3] << 24)) >>> 0; };
  Engine.prototype.be32 = function (o) { return ((this.d[o] << 24) | (this.d[o + 1] << 16) | (this.d[o + 2] << 8) | this.d[o + 3]) >>> 0; };
  Engine.prototype.blockSize = function (o) { return this.be32(o + 4); };

  // copy a zero-terminated SCUMM string (with embedded control codes) from the script
  Engine.prototype.resStrLen = function (src) {
    var d = this.d, num = 0, chr;
    while ((chr = d[src++]) !== 0) {
      num++;
      if (chr === 0xFF) {
        chr = d[src++]; num++;
        if (chr !== 1 && chr !== 2 && chr !== 3 && chr !== 8) { src += 2; num += 2; }
      }
    }
    return num;
  };
  Engine.prototype.copyScriptString = function () {
    var len = this.resStrLen(this.pc);
    var out = new Uint8Array(len + 1);
    for (var i = 0; i < len; i++) out[i] = this.d[this.pc + i];
    this.pc += len + 1;
    return out;
  };
  Engine.prototype.strFromData = function (p) {
    var len = this.resStrLen(p), out = new Uint8Array(len + 1);
    for (var i = 0; i < len; i++) out[i] = this.d[p + i];
    return out;
  };

  // ---- script scheduling (script.cpp) ----
  Engine.prototype.runScript = function (script, freezeResistant, recursive, lvars) {
    if (!script) return;
    if (!recursive) this.stopScript(script);
    var scriptOffs, scriptType, base;
    if (script < this.numGlobalScripts) {
      base = this.scriptPtr(script);
      if (base < 0) throw new Error('global script ' + script + ' not found');
      scriptOffs = 8; scriptType = WIO_GLOBAL;
    } else {
      scriptOffs = this.localScriptOffsets[script - this.numGlobalScripts];
      if (scriptOffs === 0) throw new Error('Local script ' + script + ' is not in room ' + this.roomResource);
      base = this.roomPtr(this.roomResource); scriptType = WIO_LOCAL;
    }
    var slot = this.getScriptSlot(), s = this.slots[slot];
    s.number = script; s.offs = scriptOffs; s.base = base; s.status = ssRunning; s.where = scriptType;
    s.freezeResistant = !!freezeResistant; s.recursive = !!recursive; s.freezeCount = 0; s.delayFrameCount = 0; s.cycle = 1; s.cutsceneOverride = 0;
    this.initializeLocals(slot, lvars);
    this.runScriptNested(slot);
  };

  Engine.prototype.runObjectScript = function (object, entry, freezeResistant, recursive, lvars, slot) {
    if (!object) return;
    if (!recursive) this.stopObjectScript(object);
    var where = this.whereIsObject(object);
    if (where === WIO_NOT_FOUND) { this.warn('Code for object ' + object + ' not in room ' + this.roomResource); return; }
    var obcd = this.getOBCDFromObject(object);
    if (slot === undefined || slot === -1) slot = this.getScriptSlot();
    var offs = this.getVerbEntrypoint(object, entry);
    if (offs === 0) return;
    var s = this.slots[slot];
    s.number = object; s.base = obcd; s.offs = offs; s.status = ssRunning; s.where = where;
    s.freezeResistant = !!freezeResistant; s.recursive = !!recursive; s.freezeCount = 0; s.delayFrameCount = 0; s.cycle = 1; s.cutsceneOverride = 0;
    this.initializeLocals(slot, lvars);
    this.runScriptNested(slot);
  };

  Engine.prototype.initializeLocals = function (slot, lvars) {
    var lv = this.localvar[slot];
    for (var i = 0; i < NUM_SCRIPT_LOCAL; i++) lv[i] = lvars ? lvars[i] : 0;
  };

  // offset of the verb's code relative to the OBCD block, or 0
  Engine.prototype.getVerbEntrypoint = function (obj, entry) {
    if (this.whereIsObject(obj) === WIO_NOT_FOUND) return 0;
    var objptr = this.getOBCDFromObject(obj);
    var verbptr = this.find(objptr, 'VERB');
    if (verbptr < 0) return 0;
    var verboffs = verbptr - objptr;
    var p = verbptr + 8, d = this.d;
    for (;;) {
      if (!d[p]) return 0;
      if (d[p] === entry || d[p] === 0xFF) break;
      p += 3;
    }
    return verboffs + this.le16(p + 1);
  };

  Engine.prototype.stopScript = function (script) {
    if (script === 0) return;
    for (var i = 0; i < NUM_SCRIPT_SLOT; i++) {
      var ss = this.slots[i];
      if (script === ss.number && ss.status !== ssDead && (ss.where === WIO_GLOBAL || ss.where === WIO_LOCAL)) {
        if (ss.cutsceneOverride) throw new Error('Script ' + script + ' stopped with active cutscene/override');
        ss.number = 0; ss.status = ssDead;
        if (this.currentScript === i) this.currentScript = 0xFF;
      }
    }
    for (i = 0; i < this.numNestedScripts; ++i) {
      var n = this.nest[i];
      if (n.number === script && (n.where === WIO_GLOBAL || n.where === WIO_LOCAL)) { n.number = 0; n.slot = 0xFF; n.where = 0xFF; }
    }
  };

  Engine.prototype.stopObjectScript = function (script) {
    if (script === 0) return;
    for (var i = 0; i < NUM_SCRIPT_SLOT; i++) {
      var ss = this.slots[i];
      if (script === ss.number && ss.status !== ssDead && (ss.where === WIO_ROOM || ss.where === WIO_INVENTORY || ss.where === WIO_FLOBJECT)) {
        if (ss.cutsceneOverride) throw new Error('Object ' + script + ' stopped with active cutscene/override');
        ss.number = 0; ss.status = ssDead;
        if (this.currentScript === i) this.currentScript = 0xFF;
      }
    }
    for (i = 0; i < this.numNestedScripts; ++i) {
      var n = this.nest[i];
      if (n.number === script && (n.where === WIO_ROOM || n.where === WIO_INVENTORY || n.where === WIO_FLOBJECT)) { n.number = 0; n.slot = 0xFF; n.where = 0xFF; }
    }
  };

  Engine.prototype.getScriptSlot = function () {
    for (var i = 1; i < NUM_SCRIPT_SLOT; i++) if (this.slots[i].status === ssDead) return i;
    throw new Error('Too many scripts running');
  };

  Engine.prototype.runScriptNested = function (slot) {
    this.updateScriptPtr();
    if (this.numNestedScripts >= MAX_NESTING) throw new Error('Too many nested scripts');
    var nest = this.nest[this.numNestedScripts];
    if (this.currentScript === 0xFF) { nest.number = 0; nest.where = 0xFF; }
    else { var cur = this.slots[this.currentScript]; nest.number = cur.number; nest.where = cur.where; nest.slot = this.currentScript; }
    this.numNestedScripts++;
    this.currentScript = slot;
    this.getScriptBaseAddress();
    this.resetScriptPointer();
    this.executeScript();
    if (this.numNestedScripts !== 0) this.numNestedScripts--;
    if (nest.number) {
      var s = this.slots[nest.slot];
      if (s.number === nest.number && s.where === nest.where && s.status !== ssDead && s.freezeCount === 0) {
        this.currentScript = nest.slot;
        this.getScriptBaseAddress();
        this.resetScriptPointer();
        return;
      }
    }
    this.currentScript = 0xFF;
  };

  Engine.prototype.updateScriptPtr = function () {
    if (this.currentScript === 0xFF) return;
    this.slots[this.currentScript].offs = this.pc - this.scriptOrg;
  };
  Engine.prototype.getScriptBaseAddress = function () {
    if (this.currentScript === 0xFF) return;
    var ss = this.slots[this.currentScript];
    switch (ss.where) {
      case WIO_INVENTORY: case WIO_ROOM: case WIO_FLOBJECT: this.scriptOrg = ss.base; break;
      case WIO_LOCAL: this.scriptOrg = this.roomPtr(this.roomResource); break;
      case WIO_GLOBAL: this.scriptOrg = ss.base; break;
      default: throw new Error('Bad type while getting base address');
    }
  };
  Engine.prototype.resetScriptPointer = function () {
    if (this.currentScript === 0xFF) return;
    this.pc = this.scriptOrg + this.slots[this.currentScript].offs;
  };

  Engine.prototype.executeScript = function () {
    var ops = this.opcodes;
    while (this.currentScript !== 0xFF) {
      this.opcode = this.fetchByte();
      this.slots[this.currentScript].didexec = true;
      if (this.traceOps) this.log('script ' + this.slots[this.currentScript].number + ' @' + (this.pc - 1 - this.scriptOrg).toString(16) + ' op ' + this.opcode.toString(16));
      var fn = ops[this.opcode];
      if (!fn) throw new Error('Invalid opcode ' + this.opcode.toString(16) + ' at ' + (this.pc - 1 - this.scriptOrg).toString(16) + ' in script ' + this.slots[this.currentScript].number);
      fn.call(this);
    }
  };
  Engine.prototype.executeOpcode = function (op) {
    var fn = this.opcodes[op];
    if (!fn) throw new Error('Invalid opcode ' + op.toString(16));
    fn.call(this);
  };

  Engine.prototype.stopObjectCode = function () {
    var ss = this.slots[this.currentScript];
    if (ss.where !== WIO_GLOBAL && ss.where !== WIO_LOCAL) {
      this.stopObjectScript(ss.number);
    } else {
      if (ss.cutsceneOverride) throw new Error('Script ' + ss.number + ' ending with active cutscene/override (' + ss.cutsceneOverride + ')');
      ss.number = 0; ss.status = ssDead;
    }
    this.currentScript = 0xFF;
  };

  Engine.prototype.runInventoryScript = function (i) {
    if (this.VAR(V.INVENTORY_SCRIPT)) {
      var args = new Int32Array(NUM_SCRIPT_LOCAL); args[0] = i;
      this.runScript(this.VAR(V.INVENTORY_SCRIPT), 0, 0, args);
    }
  };

  Engine.prototype.freezeScripts = function (flag) {
    for (var i = 0; i < NUM_SCRIPT_SLOT; i++) {
      var s = this.slots[i];
      if (this.currentScript !== i && s.status !== ssDead && (!s.freezeResistant || flag >= 0x80)) { s.status |= 0x80; s.freezeCount++; }
    }
    for (i = 0; i < NUM_SENTENCE; i++) this.sentence[i].freezeCount++;
    if (this.cutSceneScriptIndex !== 0xFF) { this.slots[this.cutSceneScriptIndex].status &= 0x7F; this.slots[this.cutSceneScriptIndex].freezeCount = 0; }
  };
  Engine.prototype.unfreezeScripts = function () {
    for (var i = 0; i < NUM_SCRIPT_SLOT; i++) {
      var s = this.slots[i];
      if (s.status & 0x80) { if (!--s.freezeCount) s.status &= 0x7F; }
    }
    for (i = 0; i < NUM_SENTENCE; i++) if (this.sentence[i].freezeCount > 0) this.sentence[i].freezeCount--;
  };

  Engine.prototype.runAllScripts = function () {
    for (var i = 0; i < NUM_SCRIPT_SLOT; i++) this.slots[i].didexec = false;
    this.currentScript = 0xFF;
    for (i = 0; i < NUM_SCRIPT_SLOT; i++) {
      var s = this.slots[i];
      if (s.cycle === 1 && s.status === ssRunning && !s.didexec) {
        this.currentScript = i;
        this.getScriptBaseAddress();
        this.resetScriptPointer();
        this.executeScript();
      }
    }
  };

  Engine.prototype.runExitScript = function () {
    if (this.VAR(V.EXIT_SCRIPT)) this.runScript(this.VAR(V.EXIT_SCRIPT), 0, 0, null);
    if (this.EXCD_offs) {
      var slot = this.getScriptSlot(), s = this.slots[slot];
      s.status = ssRunning; s.number = 10001; s.where = WIO_ROOM; s.base = this.roomPtr(this.roomResource); s.offs = this.EXCD_offs;
      s.freezeResistant = false; s.recursive = false; s.freezeCount = 0; s.delayFrameCount = 0; s.cycle = 1; s.cutsceneOverride = 0;
      this.initializeLocals(slot, null);
      this.runScriptNested(slot);
    }
    if (this.VAR(V.EXIT_SCRIPT2)) this.runScript(this.VAR(V.EXIT_SCRIPT2), 0, 0, null);
  };
  Engine.prototype.runEntryScript = function () {
    if (this.VAR(V.ENTRY_SCRIPT)) this.runScript(this.VAR(V.ENTRY_SCRIPT), 0, 0, null);
    if (this.ENCD_offs) {
      var slot = this.getScriptSlot(), s = this.slots[slot];
      s.status = ssRunning; s.number = 10002; s.where = WIO_ROOM; s.base = this.roomPtr(this.roomResource); s.offs = this.ENCD_offs;
      s.freezeResistant = false; s.recursive = false; s.freezeCount = 0; s.delayFrameCount = 0; s.cycle = 1; s.cutsceneOverride = 0;
      this.initializeLocals(slot, null);
      this.runScriptNested(slot);
    }
    if (this.VAR(V.ENTRY_SCRIPT2)) this.runScript(this.VAR(V.ENTRY_SCRIPT2), 0, 0, null);
  };

  Engine.prototype.killScriptsAndResources = function () {
    for (var i = 0; i < NUM_SCRIPT_SLOT; i++) {
      var ss = this.slots[i];
      if (ss.where === WIO_ROOM || ss.where === WIO_FLOBJECT || ss.where === WIO_LOCAL) {
        if (ss.cutsceneOverride) { this.warn('Script ' + ss.number + ' stopped with active cutscene/override in exit'); ss.cutsceneOverride = 0; }
        ss.status = ssDead;
      }
    }
    for (i = 0; i < this.numNewNames; i++) {
      var obj = this.newNames[i];
      if (obj) {
        var owner = this.getOwner(obj);
        if (owner === 0 || owner === OF_OWNER_ROOM) { this.newNames[i] = 0; this.newNameStr[i] = null; }
      }
    }
  };
  Engine.prototype.killAllScriptsExceptCurrent = function () {
    for (var i = 0; i < NUM_SCRIPT_SLOT; i++) if (i !== this.currentScript) { this.slots[i].status = ssDead; this.slots[i].cutsceneOverride = 0; }
  };

  Engine.prototype.doSentence = function (verb, objectA, objectB) {
    if (this.sentenceNum >= NUM_SENTENCE) throw new Error('sentence queue overflow');
    var st = this.sentence[this.sentenceNum++];
    st.verb = verb; st.objectA = objectA; st.objectB = objectB; st.preposition = objectB !== 0 ? 1 : 0; st.freezeCount = 0;
  };

  Engine.prototype.checkAndRunSentenceScript = function () {
    var sentenceScript = this.VAR(V.SENTENCE_SCRIPT);
    if (this.isScriptInUse(sentenceScript)) {
      for (var i = 0; i < NUM_SCRIPT_SLOT; i++) {
        var ss = this.slots[i];
        if (ss.number === sentenceScript && ss.status !== ssDead && ss.freezeCount === 0) return;
      }
    }
    if (!this.sentenceNum || this.sentence[this.sentenceNum - 1].freezeCount) return;
    this.sentenceNum--;
    var st = this.sentence[this.sentenceNum];
    if (st.preposition && st.objectB === st.objectA) return;
    var args = new Int32Array(NUM_SCRIPT_LOCAL);
    args[0] = st.verb; args[1] = st.objectA; args[2] = st.objectB;
    this.currentScript = 0xFF;
    if (sentenceScript) this.runScript(sentenceScript, 0, 0, args);
  };

  Engine.prototype.runInputScript = function (clickArea, val, mode) {
    var verbScript = this.VAR(V.VERB_SCRIPT);
    var args = new Int32Array(NUM_SCRIPT_LOCAL);
    args[0] = clickArea; args[1] = val; args[2] = mode;
    if (verbScript) this.runScript(verbScript, 0, 0, args);
  };

  Engine.prototype.decreaseScriptDelay = function (amount) {
    for (var i = 0; i < NUM_SCRIPT_SLOT; i++) {
      var ss = this.slots[i];
      if (ss.status === ssPaused) {
        ss.delay -= amount;
        if (ss.delay < 0) { ss.status = ssRunning; ss.delay = 0; }
      }
    }
  };
  Engine.prototype.isScriptInUse = function (script) {
    for (var i = 0; i < NUM_SCRIPT_SLOT; i++) if (this.slots[i].number === script) return true;
    return false;
  };
  Engine.prototype.isScriptRunning = function (script) {
    for (var i = 0; i < NUM_SCRIPT_SLOT; i++) {
      var ss = this.slots[i];
      if (ss.number === script && (ss.where === WIO_GLOBAL || ss.where === WIO_LOCAL) && ss.status !== ssDead) return true;
    }
    return false;
  };
  Engine.prototype.isRoomScriptRunning = function (script) {
    for (var i = 0; i < NUM_SCRIPT_SLOT; i++) {
      var ss = this.slots[i];
      if (ss.number === script && ss.where === WIO_ROOM && ss.status !== ssDead) return true;
    }
    return false;
  };

  Engine.prototype.beginCutscene = function (args) {
    var scr = this.currentScript;
    this.slots[scr].cutsceneOverride++;
    ++this.cutSceneStackPointer;
    if (this.cutSceneStackPointer >= MAX_CUTSCENE) throw new Error('Cutscene stack overflow');
    this.cutSceneData[this.cutSceneStackPointer] = args[0];
    this.cutSceneScript[this.cutSceneStackPointer] = 0;
    this.cutScenePtr[this.cutSceneStackPointer] = 0;
    this.cutSceneScriptIndex = scr;
    if (this.VAR(V.CUTSCENE_START_SCRIPT)) this.runScript(this.VAR(V.CUTSCENE_START_SCRIPT), 0, 0, args);
    this.cutSceneScriptIndex = 0xFF;
  };
  Engine.prototype.endCutscene = function () {
    var ss = this.slots[this.currentScript];
    if (ss.cutsceneOverride > 0) ss.cutsceneOverride--;
    var args = new Int32Array(NUM_SCRIPT_LOCAL);
    args[0] = this.cutSceneData[this.cutSceneStackPointer];
    this.setVAR(V.OVERRIDE, 0);
    if (this.cutScenePtr[this.cutSceneStackPointer] && ss.cutsceneOverride > 0) ss.cutsceneOverride--;
    this.cutSceneScript[this.cutSceneStackPointer] = 0;
    this.cutScenePtr[this.cutSceneStackPointer] = 0;
    if (this.cutSceneStackPointer === 0) throw new Error('Cutscene stack underflow');
    this.cutSceneStackPointer--;
    if (this.VAR(V.CUTSCENE_END_SCRIPT)) this.runScript(this.VAR(V.CUTSCENE_END_SCRIPT), 0, 0, args);
  };
  Engine.prototype.abortCutscene = function () {
    var idx = this.cutSceneStackPointer;
    var offs = this.cutScenePtr[idx];
    if (offs) {
      var ss = this.slots[this.cutSceneScript[idx]];
      ss.offs = offs; ss.status = ssRunning; ss.freezeCount = 0;
      if (ss.cutsceneOverride > 0) ss.cutsceneOverride--;
      this.setVAR(V.OVERRIDE, 1);
      this.cutScenePtr[idx] = 0;
    }
  };
  Engine.prototype.beginOverride = function () {
    var idx = this.cutSceneStackPointer;
    this.cutScenePtr[idx] = this.pc - this.scriptOrg;
    this.cutSceneScript[idx] = this.currentScript;
    this.fetchByte(); this.fetchWord();
    this.setVAR(V.OVERRIDE, 0);
  };
  Engine.prototype.endOverride = function () {
    var idx = this.cutSceneStackPointer;
    this.cutScenePtr[idx] = 0; this.cutSceneScript[idx] = 0;
    this.setVAR(V.OVERRIDE, 0);
  };

  // ---- objects (object.cpp) ----
  Engine.prototype.getOwner = function (obj) { return this.objectOwnerTable[obj]; };
  Engine.prototype.putOwner = function (obj, owner) { this.objectOwnerTable[obj] = owner; };
  Engine.prototype.getState = function (obj) { return this.objectStateTable[obj]; };
  Engine.prototype.putState = function (obj, state) { this.objectStateTable[obj] = state; };
  Engine.prototype.getClass = function (obj, cls) {
    cls &= 0x7F;
    return (this.classData[obj] & (1 << (cls - 1))) !== 0;
  };
  Engine.prototype.putClass = function (obj, cls, set) {
    cls &= 0x7F;
    if (set) this.classData[obj] |= (1 << (cls - 1)); else this.classData[obj] &= ~(1 << (cls - 1));
  };
  Engine.prototype.objIsActor = function (obj) { return obj < this.numActors; };

  Engine.prototype.getObjectIndex = function (object) {
    if (object < 1) return -1;
    for (var i = this.numLocalObjects - 1; i > 0; i--) if (this.objs[i].obj_nr === object) return i;
    return -1;
  };
  Engine.prototype.whereIsObject = function (object) {
    if (object >= this.numGlobalObjects || object < 1) return WIO_NOT_FOUND;
    if (this.objectOwnerTable[object] !== OF_OWNER_ROOM) {
      for (var i = 0; i < this.numInventory; i++) if (this.inventory[i] === object) return WIO_INVENTORY;
      return WIO_NOT_FOUND;
    }
    for (i = this.numLocalObjects - 1; i > 0; i--) {
      if (this.objs[i].obj_nr === object) return this.objs[i].fl_object_index ? WIO_FLOBJECT : WIO_ROOM;
    }
    return WIO_NOT_FOUND;
  };
  // absolute offset of the object's OBCD block, or -1
  Engine.prototype.getOBCDFromObject = function (obj) {
    if (this.objectOwnerTable[obj] !== OF_OWNER_ROOM) {
      for (var i = 0; i < this.numInventory; i++) if (this.inventory[i] === obj) return this.inventoryObcd[i];
    } else {
      for (i = this.numLocalObjects - 1; i > 0; --i) if (this.objs[i].obj_nr === obj) return this.objs[i].obcd;
    }
    return -1;
  };

  Engine.prototype.addObjectToInventory = function (obj, room) {
    var obcd;
    if (this.whereIsObject(obj) === WIO_FLOBJECT) obcd = this.objs[this.getObjectIndex(obj)].obcd;
    else obcd = this.findObjectInRoom(obj, room).obcd;
    var slot = -1;
    for (var i = 0; i < this.numInventory; i++) if (this.inventory[i] === 0) { slot = i; break; }
    if (slot < 0) throw new Error('Inventory full');
    this.inventory[slot] = obj; this.inventoryObcd[slot] = obcd;
  };
  Engine.prototype.findInventory = function (owner, idx) {
    var count = 1;
    for (var i = 0; i < this.numInventory; i++) {
      var obj = this.inventory[i];
      if (obj && this.getOwner(obj) === owner && count++ === idx) return obj;
    }
    return 0;
  };
  Engine.prototype.getInventoryCount = function (owner) {
    var count = 0;
    for (var i = 0; i < this.numInventory; i++) { var obj = this.inventory[i]; if (obj && this.getOwner(obj) === owner) count++; }
    return count;
  };
  Engine.prototype.setOwnerOf = function (obj, owner) {
    if (owner === 0) {
      this.clearOwnerOf(obj);
      var ss = this.currentScript !== 0xFF ? this.slots[this.currentScript] : null;
      if (ss && ss.where === WIO_INVENTORY && ss.number === obj) throw new Error('Odd setOwnerOf case #2');
    }
    this.putOwner(obj, owner);
    this.runInventoryScript(0);
  };
  Engine.prototype.clearOwnerOf = function (obj) {
    this.stopObjectScript(obj);
    if (this.getOwner(obj) === OF_OWNER_ROOM) {
      for (var i = 0; i < this.numLocalObjects; i++) {
        if (this.objs[i].obj_nr === obj && this.objs[i].fl_object_index) { this.objs[i].obj_nr = 0; this.objs[i].fl_object_index = 0; }
      }
    } else {
      for (i = 0; i < this.numInventory; i++) {
        if (this.inventory[i] === obj) {
          this.inventory[i] = 0; this.inventoryObcd[i] = 0;
          for (i = 0; i < this.numInventory - 1; i++) {
            if (!this.inventory[i] && this.inventory[i + 1]) {
              this.inventory[i] = this.inventory[i + 1]; this.inventory[i + 1] = 0;
              this.inventoryObcd[i] = this.inventoryObcd[i + 1]; this.inventoryObcd[i + 1] = 0;
            }
          }
          break;
        }
      }
    }
  };

  // returns {x, y, dir}
  Engine.prototype.getObjectXYPos = function (object) {
    var idx = this.getObjectIndex(object);
    if (idx < 0) throw new Error('getObjectXYPos: object ' + object + ' not in room');
    var od = this.objs[idx];
    return { x: od.walk_x, y: od.walk_y, dir: oldDirToNewDir(od.actordir & 3) };
  };
  // returns {x,y} or null
  Engine.prototype.getObjectOrActorXY = function (object) {
    if (this.objIsActor(object)) {
      var act = this.actors[object];
      if (act && act.isInCurrentRoom()) return { x: act.pos.x, y: act.pos.y };
      return null;
    }
    switch (this.whereIsObject(object)) {
      case WIO_NOT_FOUND: return null;
      case WIO_INVENTORY:
        if (this.objIsActor(this.objectOwnerTable[object])) {
          var a = this.actors[this.objectOwnerTable[object]];
          if (a && a.isInCurrentRoom()) return { x: a.pos.x, y: a.pos.y };
        }
        return null;
    }
    var p = this.getObjectXYPos(object);
    return { x: p.x, y: p.y };
  };
  Engine.prototype.getDist = function (x, y, x2, y2) { return Math.max(Math.abs(y - y2), Math.abs(x - x2)); };
  Engine.prototype.getObjActToObjActDist = function (a, b) {
    var acta = this.objIsActor(a) ? this.actors[a] : null, actb = this.objIsActor(b) ? this.actors[b] : null;
    if (acta && actb && acta.room === actb.room && acta.room && !acta.isInCurrentRoom()) return 0;
    var p1 = this.getObjectOrActorXY(a); if (!p1) return 0xFF;
    var p2 = this.getObjectOrActorXY(b); if (!p2) return 0xFF;
    var x2 = p2.x, y2 = p2.y;
    if (acta && !actb) { var r = acta.adjustXYToBeInBox(x2, y2); x2 = r.x; y2 = r.y; }
    return this.getDist(p1.x, p1.y, x2, y2);
  };
  Engine.prototype.findObject = function (x, y) {
    for (var i = 1; i < this.numLocalObjects; i++) {
      var o = this.objs[i];
      if (o.obj_nr < 1 || this.getClass(o.obj_nr, kObjectClassUntouchable)) continue;
      var b = i;
      do {
        var a = this.objs[b].parentstate;
        b = this.objs[b].parent;
        if (b === 0) {
          if (o.x_pos <= x && o.width + o.x_pos > x && o.y_pos <= y && o.height + o.y_pos > y) return o.obj_nr;
          break;
        }
      } while ((this.objs[b].state & 0xF) === a);
    }
    return 0;
  };
  Engine.prototype.getObjX = function (obj) {
    if (obj < 1) return 0;
    if (this.objIsActor(obj)) return this.actors[obj].pos.x;
    if (this.whereIsObject(obj) === WIO_NOT_FOUND) return -1;
    var p = this.getObjectOrActorXY(obj); return p ? p.x : -1;
  };
  Engine.prototype.getObjY = function (obj) {
    if (obj < 1) return 0;
    if (this.objIsActor(obj)) return this.actors[obj].pos.y;
    if (this.whereIsObject(obj) === WIO_NOT_FOUND) return -1;
    var p = this.getObjectOrActorXY(obj); return p ? p.y : -1;
  };

  Engine.prototype.getObjOrActorName = function (obj) {
    if (this.objIsActor(obj)) return this.actorNames[obj] || null;
    for (var i = 0; i < this.numNewNames; i++) if (this.newNames[i] === obj) return this.newNameStr[i];
    var objptr = this.getOBCDFromObject(obj);
    if (objptr < 0) return null;
    var na = this.find(objptr, 'OBNA');
    if (na < 0) return null;
    return this.strFromData(na + 8);
  };
  Engine.prototype.setObjectName = function (obj) {
    if (this.objIsActor(obj)) throw new Error("Can't set actor name with new-name-of");
    for (var i = 0; i < this.numNewNames; i++) if (this.newNames[i] === obj) { this.newNames[i] = 0; this.newNameStr[i] = null; break; }
    for (i = 0; i < this.numNewNames; i++) {
      if (this.newNames[i] === 0) {
        this.newNameStr[i] = this.copyScriptString();
        this.newNames[i] = obj;
        this.runInventoryScript(0);
        return;
      }
    }
    throw new Error('New name table overflow');
  };

  Engine.prototype.addObjectToDrawQue = function (object) { this.drawObjectQue.push(object); };
  Engine.prototype.clearDrawObjectQueue = function () { this.drawObjectQue.length = 0; };
  Engine.prototype.processDrawQue = function () {
    for (var i = 0; i < this.drawObjectQue.length; i++) { var j = this.drawObjectQue[i]; if (j) this.drawObject(j, 0); }
    this.drawObjectQue.length = 0;
  };

  // Locate an object's OBCD/OBIM blocks in any room (for inventory/flobjects)
  Engine.prototype.findObjectInRoom = function (id, room) {
    var roomptr = this.roomPtr(room);
    if (roomptr < 0) throw new Error('findObjectInRoom: no room ' + room);
    var obcds = this.res.findAll(roomptr, 'OBCD'), obims = this.res.findAll(roomptr, 'OBIM');
    var r = { obcd: -1, obim: -1 };
    for (var i = 0; i < obcds.length; i++) {
      var cd = this.find(obcds[i], 'CDHD');
      if (this.le16(cd + 8) === id) { r.obcd = obcds[i]; break; }
    }
    for (i = 0; i < obims.length; i++) {
      var ih = this.find(obims[i], 'IMHD');
      if (this.le16(ih + 8) === id) { r.obim = obims[i]; break; }
    }
    if (r.obcd < 0) throw new Error('findObjectInRoom: object ' + id + ' not in room ' + room);
    return r;
  };
  Engine.prototype.loadFlObject = function (object, room) {
    if (this.getObjectIndex(object) !== -1) return;
    var f = this.findObjectInRoom(object, room);
    var slot = this.findLocalObjectSlot();
    if (slot === -1) throw new Error('loadFlObject: Local Object Table overflow');
    var od = this.objs[slot];
    od.obcd = f.obcd; od.obim = f.obim; od.room = room;
    od.fl_object_index = 1;
    this.resetRoomObject(od);
    od.fl_object_index = 1;
    od.obj_nr = object;
  };
  Engine.prototype.findLocalObjectSlot = function () {
    for (var i = 1; i < this.numLocalObjects; i++) if (!this.objs[i].obj_nr) { this.objs[i] = this.newObj(); return i; }
    return -1;
  };

  Engine.prototype.clearRoomObjects = function () {
    for (var i = 0; i < this.numLocalObjects; i++) {
      var o = this.objs[i];
      if (o.obj_nr < 1) continue;
      if (o.fl_object_index) { o.obj_nr = 0; o.fl_object_index = 0; }
      else o.obj_nr = 0;
    }
  };
  Engine.prototype.resetRoomObjects = function () {
    var room = this.roomPtr(this.roomResource);
    if (this.numObjectsInRoom === 0) return;
    if (this.numObjectsInRoom > this.numLocalObjects) throw new Error('More than ' + this.numLocalObjects + ' objects in room');
    var obcds = this.res.findAll(room, 'OBCD'), obims = this.res.findAll(room, 'OBIM');
    for (var i = 0; i < this.numObjectsInRoom; i++) {
      var slot = this.findLocalObjectSlot(), od = this.objs[slot];
      var ptr = obcds[i];
      if (ptr === undefined) throw new Error('Room ' + this.roomResource + ' missing object code block(s)');
      od.obcd = ptr; od.room = this.roomResource;
      od.obj_nr = this.le16(this.find(ptr, 'CDHD') + 8);
    }
    for (i = 0; i < this.numObjectsInRoom; i++) {
      ptr = obims[i];
      if (ptr === undefined) throw new Error('Room ' + this.roomResource + ' missing image blocks(s)');
      var id = this.le16(this.find(ptr, 'IMHD') + 8);
      for (var j = 1; j < this.numLocalObjects; j++) if (this.objs[j].obj_nr === id) this.objs[j].obim = ptr;
    }
    for (i = 1; i < this.numLocalObjects; i++) if (this.objs[i].obj_nr && !this.objs[i].fl_object_index) this.resetRoomObject(this.objs[i]);
  };
  Engine.prototype.resetRoomObject = function (od) {
    var cd = this.find(od.obcd, 'CDHD') + 8, d = this.d;
    od.flags = 1; // dbAllowMaskOr
    od.obj_nr = this.le16(cd);
    od.width = d[cd + 4] * 8; od.height = d[cd + 5] * 8; od.x_pos = d[cd + 2] * 8; od.y_pos = d[cd + 3] * 8;
    od.parentstate = d[cd + 6] === 0x80 ? 1 : (d[cd + 6] & 0xF);
    od.parent = d[cd + 7];
    od.walk_x = this.le16(cd + 8); od.walk_y = this.le16(cd + 10); od.actordir = d[cd + 12];
    od.fl_object_index = 0;
  };
  Engine.prototype.updateObjectStates = function () {
    for (var i = 1; i < this.numLocalObjects; i++) { var od = this.objs[i]; if (od.obj_nr > 0) od.state = this.getState(od.obj_nr); }
  };
  Engine.prototype.getObjectImage = function (obim, state) {
    var tag = 'IM' + (state < 10 ? '0' + state : state.toString(16).toUpperCase());
    return this.find(obim, tag);
  };

  // ---- verbs (verbs.cpp) ----
  Engine.prototype.getVerbSlot = function (id, mode) {
    for (var i = 1; i < this.numVerbs; i++) if (this.verbs[i].verbid === id && this.verbs[i].saveid === mode) return i;
    return 0;
  };
  Engine.prototype.killVerb = function (slot) {
    if (slot === 0) return;
    var vs = this.verbs[slot];
    vs.verbid = 0; vs.curmode = 0; this.verbNames[slot] = null;
    if (vs.saveid === 0) { this.drawVerb(slot, 0); this.verbMouseOverFn(0); }
    vs.saveid = 0;
  };
  Engine.prototype.findVerbAtPos = function (x, y) {
    for (var i = this.numVerbs - 1; i >= 1; i--) {
      var vs = this.verbs[i];
      if (vs.curmode !== 1 || !vs.verbid || vs.saveid || y < vs.curRect.top || y >= vs.curRect.bottom) continue;
      if (vs.center) { if (x < -(vs.curRect.right - 2 * vs.curRect.left) || x >= vs.curRect.right) continue; }
      else if (x < vs.curRect.left || x >= vs.curRect.right) continue;
      return i;
    }
    return 0;
  };
  Engine.prototype.verbMouseOverFn = function (verb) {
    if (this.verbMouseOver !== verb) {
      if (this.verbs[this.verbMouseOver].type !== kImageVerbType) { this.drawVerb(this.verbMouseOver, 0); this.verbMouseOver = verb; }
      if (this.verbs[verb].type !== kImageVerbType && this.verbs[verb].hicolor) { this.drawVerb(verb, 1); this.verbMouseOver = verb; }
    }
  };
  Engine.prototype.handleMouseOver = function () {
    if (this.completeScreenRedraw) this.verbMouseOverFn(0);
    else if (this.cursor.state > 0) this.verbMouseOverFn(this.findVerbAtPos(this.mouse.x, this.mouse.y));
  };
  Engine.prototype.redrawVerbs = function () {
    var verb = 0;
    if (this.cursor.state > 0) verb = this.findVerbAtPos(this.mouse.x, this.mouse.y);
    for (var i = 0; i < this.numVerbs; i++) {
      if (i === verb && this.verbs[verb].hicolor) this.drawVerb(i, 1); else this.drawVerb(i, 0);
    }
    this.verbMouseOver = verb;
  };
  Engine.prototype.checkExecVerbs = function () {
    if (this.userPut <= 0 || this.mouseAndKeyboardStat === 0) return;
    if (this.mouseAndKeyboardStat < MBS_MAX_KEY) {
      for (var i = 1; i < this.numVerbs; i++) {
        var vs = this.verbs[i];
        if (vs.verbid && vs.saveid === 0 && vs.curmode === 1 && this.mouseAndKeyboardStat === vs.key) {
          this.runInputScript(kVerbClickArea, vs.verbid, 1);
          return;
        }
      }
      this.runInputScript(kKeyClickArea, this.mouseAndKeyboardStat, 1);
    } else if (this.mouseAndKeyboardStat & MBS_MOUSE_MASK) {
      var code = (this.mouseAndKeyboardStat & MBS_LEFT_CLICK) ? 1 : 2;
      var zone = this.findVirtScreen(this.mouse.y);
      if (!zone) return;
      var over = this.findVerbAtPos(this.mouse.x, this.mouse.y);
      if (over !== 0) this.runInputScript(kVerbClickArea, this.verbs[over].verbid, code);
      else this.runInputScript(zone.number === kMainVirtScreen ? kSceneClickArea : kVerbClickArea, 0, code);
    }
  };
  Engine.prototype.setVerbObject = function (room, object, verb) {
    if (this.whereIsObject(object) === WIO_FLOBJECT) throw new Error("Can't grab verb image from flobject");
    var f = this.findObjectInRoom(object, room);
    this.verbs[verb].image = f.obim;
  };

  // ---- input (input.cpp) ----
  Engine.prototype.processInput = function () {
    var lastKeyHit = this.keyPressed;
    this.keyPressed = null;
    if (this.mouse.x < 0) this.mouse.x = 0;
    if (this.mouse.x > this.screenWidth - 1) this.mouse.x = this.screenWidth - 1;
    if (this.mouse.y < 0) this.mouse.y = 0;
    if (this.mouse.y > this.screenHeight - 1) this.mouse.y = this.screenHeight - 1;
    var vs = this.virtscr[kMainVirtScreen];
    this.virtualMouse.x = this.mouse.x + vs.xstart;
    this.virtualMouse.y = this.mouse.y - vs.topline;
    if (this.virtualMouse.y < 0) this.virtualMouse.y = -1;
    if (this.virtualMouse.y >= vs.h) this.virtualMouse.y = -1;
    this.mouseAndKeyboardStat = 0;
    if ((this.leftBtnPressed & 1) && (this.rightBtnPressed & 1)) { this.mouseAndKeyboardStat = 0; lastKeyHit = { key: 'Escape', ascii: 27 }; }
    else if (this.leftBtnPressed & 1) this.mouseAndKeyboardStat = MBS_LEFT_CLICK;
    else if (this.rightBtnPressed & 1) this.mouseAndKeyboardStat = MBS_RIGHT_CLICK;
    this.leftBtnPressed &= ~1; this.rightBtnPressed &= ~1;
    if (!lastKeyHit || !lastKeyHit.ascii) return;
    this.processKeyboard(lastKeyHit);
  };
  Engine.prototype.clearClickedStatus = function () {
    this.keyPressed = null; this.mouseAndKeyboardStat = 0; this.leftBtnPressed &= ~1; this.rightBtnPressed &= ~1;
  };
  Engine.prototype.processKeyboard = function (k) {
    var talkstopKeyEnabled = this.VAR(V.TALKSTOP_KEY) !== 0;
    var cutsceneExitKeyEnabled = this.VAR(V.CUTSCENEEXIT_KEY) !== 0;
    var restartKeyEnabled = this.VAR(V.RESTART_KEY) !== 0, pauseKeyEnabled = this.VAR(V.PAUSE_KEY) !== 0;
    if (k.key === 'F5') { if (this.opts.onMenu) this.opts.onMenu(); return; }
    if (k.key === 'F8' && restartKeyEnabled) { if (this.opts.onRestart) this.opts.onRestart(); return; }
    if (k.ascii === 32 && pauseKeyEnabled) { if (this.opts.onPause) this.opts.onPause(); return; }
    if (talkstopKeyEnabled && k.ascii === 46) { this.talkDelay = 0; return; }
    if (k.ascii === 43 || k.ascii === 45) {   // text speed
      if (k.ascii === 45 && this.defaultTextSpeed > 0) this.defaultTextSpeed--;
      else if (k.ascii === 43 && this.defaultTextSpeed < 9) this.defaultTextSpeed++;
      this.setVAR(V.CHARINC, 9 - this.defaultTextSpeed);
      if (this.opts.onTextSpeed) this.opts.onTextSpeed(this.defaultTextSpeed);
      return;
    }
    if (cutsceneExitKeyEnabled && k.ascii === 27) { this.abortCutscene(); this.mouseAndKeyboardStat = this.VAR(V.CUTSCENEEXIT_KEY); return; }
    if (k.key && /^F[1-9]$/.test(k.key)) { this.mouseAndKeyboardStat = parseInt(k.key.substr(1), 10) - 1 + 315; return; }
    if (k.ctrl && k.ascii >= 97 && k.ascii <= 122) { this.mouseAndKeyboardStat = k.ascii & 0x1f; return; }
    this.mouseAndKeyboardStat = k.ascii;
  };
  // page-facing input API
  Engine.prototype.mouseMove = function (x, y) { this.mouse.x = x | 0; this.mouse.y = y | 0; };
  Engine.prototype.mouseButton = function (button, down) {
    if (button === 0) { if (down) this.leftBtnPressed |= 3; else this.leftBtnPressed &= ~2; }
    else { if (down) this.rightBtnPressed |= 3; else this.rightBtnPressed &= ~2; }
  };
  Engine.prototype.keyDown = function (key, ascii, ctrl) { this.keyPressed = { key: key, ascii: ascii, ctrl: !!ctrl }; };

  // ---- camera (camera.cpp) ----
  Engine.prototype.setCameraAtEx = function (at) {
    this.camera.mode = kNormalCameraMode;
    this.camera.cur.x = at;
    this.setCameraAt(at, 0);
    this.camera.movingToActor = false;
  };
  Engine.prototype.setCameraAt = function (posX, posY) {
    var c = this.camera;
    if (c.mode !== kFollowActorCameraMode || Math.abs(posX - c.cur.x) > (this.screenWidth / 2)) c.cur.x = posX;
    c.dest.x = posX;
    if (c.cur.x < this.VAR(V.CAMERA_MIN_X)) c.cur.x = this.VAR(V.CAMERA_MIN_X);
    if (c.cur.x > this.VAR(V.CAMERA_MAX_X)) c.cur.x = this.VAR(V.CAMERA_MAX_X);
    if (this.VAR(V.SCROLL_SCRIPT)) { this.setVAR(V.CAMERA_POS_X, c.cur.x); this.runScript(this.VAR(V.SCROLL_SCRIPT), 0, 0, null); }
    if (c.cur.x !== c.last.x && this.charset.hasMask) this.stopTalk();
  };
  Engine.prototype.setCameraFollows = function (a, setCamera) {
    var c = this.camera;
    c.mode = kFollowActorCameraMode; c.follows = a.number;
    if (!a.isInCurrentRoom()) {
      this.startScene(a.room, null, 0);
      c.mode = kFollowActorCameraMode; c.cur.x = a.pos.x;
      this.setCameraAt(c.cur.x, 0);
    }
    var t = (a.pos.x >> 3) - this.screenStartStrip;
    if (t < c.leftTrigger || t > c.rightTrigger || setCamera === true) this.setCameraAt(a.pos.x, 0);
    for (var i = 1; i < this.numActors; i++) if (this.actors[i].isInCurrentRoom()) this.actors[i].needRedraw = true;
    this.runInventoryScript(0);
  };
  Engine.prototype.moveCamera = function () {
    var c = this.camera, pos = c.cur.x, a = null;
    var snapToX = this.snapScroll || this.VAR(V.CAMERA_FAST_X);
    c.cur.x &= 0xFFF8;
    if (c.cur.x < this.VAR(V.CAMERA_MIN_X)) { if (snapToX) c.cur.x = this.VAR(V.CAMERA_MIN_X); else c.cur.x += 8; this.cameraMoved(); return; }
    if (c.cur.x > this.VAR(V.CAMERA_MAX_X)) { if (snapToX) c.cur.x = this.VAR(V.CAMERA_MAX_X); else c.cur.x -= 8; this.cameraMoved(); return; }
    if (c.mode === kFollowActorCameraMode) {
      a = this.actors[c.follows];
      var actorx = a.pos.x, t = (actorx >> 3) - this.screenStartStrip;
      if (t < c.leftTrigger || t > c.rightTrigger) {
        if (snapToX) { if (t > 40 - 5) c.dest.x = actorx + 80; if (t < 5) c.dest.x = actorx - 80; }
        else c.movingToActor = true;
      }
    }
    if (c.movingToActor) { a = this.actors[c.follows]; c.dest.x = a.pos.x; }
    if (c.dest.x < this.VAR(V.CAMERA_MIN_X)) c.dest.x = this.VAR(V.CAMERA_MIN_X);
    if (c.dest.x > this.VAR(V.CAMERA_MAX_X)) c.dest.x = this.VAR(V.CAMERA_MAX_X);
    if (snapToX) c.cur.x = c.dest.x;
    else { if (c.cur.x < c.dest.x) c.cur.x += 8; if (c.cur.x > c.dest.x) c.cur.x -= 8; }
    if (c.movingToActor && (c.cur.x >> 3) === (a.pos.x >> 3)) c.movingToActor = false;
    this.cameraMoved();
    if (this.VAR(V.SCROLL_SCRIPT) && pos !== c.cur.x) { this.setVAR(V.CAMERA_POS_X, c.cur.x); this.runScript(this.VAR(V.SCROLL_SCRIPT), 0, 0, null); }
  };
  Engine.prototype.cameraMoved = function () {
    var c = this.camera;
    if (c.cur.x < this.screenWidth / 2) c.cur.x = this.screenWidth / 2;
    else if (c.cur.x > this.roomWidth - this.screenWidth / 2) c.cur.x = this.roomWidth - this.screenWidth / 2;
    this.screenStartStrip = (c.cur.x >> 3) - (this.numStrips >> 1);
    this.screenEndStrip = this.screenStartStrip + this.numStrips - 1;
    this.screenTop = c.cur.y - (this.screenHeight >> 1);
    this.virtscr[kMainVirtScreen].xstart = this.screenStartStrip * 8;
  };
  Engine.prototype.panCameraTo = function (x, y) { this.camera.dest.x = x; this.camera.mode = kPanningCameraMode; this.camera.movingToActor = false; };
  Engine.prototype.actorFollowCamera = function (act) {
    var old = this.camera.follows;
    this.setCameraFollows(this.actors[act], false);
    if (this.camera.follows !== old) this.runInventoryScript(0);
    this.camera.movingToActor = false;
  };

  // ---- rooms (room.cpp) ----
  Engine.prototype.startScene = function (room, a, objectNr) {
    this.log('Loading room ' + room);
    this.stopTalk();
    this.fadeOut(this.switchRoomEffect2);
    this.newEffect = this.switchRoomEffect;
    if (this.currentScript !== 0xFF) {
      var ss = this.slots[this.currentScript];
      if (ss.where === WIO_ROOM || ss.where === WIO_FLOBJECT || ss.where === WIO_LOCAL) {
        if (ss.cutsceneOverride) throw new Error('Script ' + ss.number + ' stopped with active cutscene/override in exit');
        this.currentScript = 0xFF;
      }
    }
    this.setVAR(V.NEW_ROOM, room);
    this.runExitScript();
    this.killScriptsAndResources();
    this.stopCycle(0);
    this.clearDrawObjectQueue();
    for (var i = 1; i < this.numActors; i++) this.actors[i].hideActor();
    for (i = 0; i < 256; i++) { this.roomPalette[i] = i; this.shadowPalette[i] = i; }
    if (room === 36) this.roomPalette[47] = 15;   // the Mac interpreter's fix for the mansion's notice sign
    this.setVAR(V.ROOM, room);
    this.fullRedraw = true;
    this.currentRoom = room;
    this.roomResource = room >= 0x80 ? this.resourceMapper[room & 0x7F] : room;
    this.setVAR(V.ROOM_RESOURCE, this.roomResource);
    this.clearRoomObjects();
    if (this.currentRoom === 0) { this.ENCD_offs = this.EXCD_offs = 0; this.numObjectsInRoom = 0; return; }
    this.setupRoomSubBlocks();
    this.resetRoomSubBlocks();
    this.initBGBuffers(this.roomHeight);
    this.resetRoomObjects();
    this.setVAR(V.CAMERA_MIN_X, this.screenWidth / 2);
    this.setVAR(V.CAMERA_MAX_X, this.roomWidth - this.screenWidth / 2);
    this.camera.mode = kNormalCameraMode;
    this.camera.cur.x = this.camera.dest.x = this.screenWidth / 2;
    this.camera.cur.y = this.camera.dest.y = this.screenHeight / 2;
    if (this.roomResource === 0) return;
    this.gfxUsageBits.fill(0);
    if (a) {
      var where = this.whereIsObject(objectNr);
      if (where !== WIO_ROOM && where !== WIO_FLOBJECT) throw new Error('startScene: Object ' + objectNr + ' is not in room ' + this.currentRoom);
      var p = this.getObjectXYPos(objectNr);
      a.putActor(p.x, p.y, this.currentRoom);
      a.setDirection(p.dir + 180);
      a.stopActorMoving();
    }
    this.showActors();
    this.egoPositioned = false;
    this.runEntryScript();
    if (a && !this.egoPositioned) { var p2 = this.getObjectXYPos(objectNr); a.putActor(p2.x, p2.y, this.currentRoom); a.moving = 0; }
    this.doEffect = true;
  };

  Engine.prototype.setupRoomSubBlocks = function () {
    this.ENCD_offs = this.EXCD_offs = this.EPAL_offs = this.CLUT_offs = 0;
    var roomptr = this.roomPtr(this.roomResource);
    if (roomptr < 0) throw new Error('Room ' + this.roomResource + ': data not found');
    var rmhd = this.find(roomptr, 'RMHD');
    this.roomWidth = this.le16(rmhd + 8); this.roomHeight = this.le16(rmhd + 10); this.numObjectsInRoom = this.le16(rmhd + 12) & 0xFF;
    this.IM00_offs = this.find(this.find(roomptr, 'RMIM'), 'IM00') - roomptr;
    var p = this.find(roomptr, 'EXCD'); if (p >= 0) this.EXCD_offs = p + 8 - roomptr;
    p = this.find(roomptr, 'ENCD'); if (p >= 0) this.ENCD_offs = p + 8 - roomptr;
    this.localScriptOffsets.fill(0);
    var lscrs = this.res.findAll(roomptr, 'LSCR');
    for (var i = 0; i < lscrs.length; i++) {
      var ptr = lscrs[i] + 8, id = this.d[ptr];
      this.localScriptOffsets[id - this.numGlobalScripts] = ptr + 1 - roomptr;
    }
    p = this.find(roomptr, 'EPAL'); if (p >= 0) this.EPAL_offs = p + 8 - roomptr;
    p = this.find(roomptr, 'CLUT'); if (p >= 0) this.CLUT_offs = p + 8 - roomptr;
    p = this.find(roomptr, 'TRNS'); this.transparentColor = p >= 0 ? this.d[p + 8] : 255;
  };

  Engine.prototype.resetRoomSubBlocks = function () {
    var roomptr = this.roomPtr(this.roomResource);
    this.extraBoxFlags.fill(0);
    this.boxData = null; this.boxMatrix = null;
    var p = this.find(roomptr, 'BOXD');
    if (p >= 0) this.boxData = this.d.slice(p + 8, p + this.blockSize(p));
    p = this.find(roomptr, 'BOXM');
    if (p >= 0) this.boxMatrix = this.d.slice(p + 8, p + this.blockSize(p));
    for (var i = 1; i < this.scaleSlots.length; i++) this.scaleSlots[i] = null;
    p = this.find(roomptr, 'SCAL');
    if (p >= 0) {
      var q = p + 8;
      for (i = 1; i < this.scaleSlots.length; i++, q += 8) {
        if (q + 8 > p + this.blockSize(p)) break;
        var s1 = this.le16(q), y1 = this.le16(q + 2), s2 = this.le16(q + 4), y2 = this.le16(q + 6);
        if (s1 || y1 || s2 || y2) this.setScaleSlot(i, 0, y1, s1, 0, y2, s2);
      }
    }
    if (this.CLUT_offs) this.setCurrentPalette(0);
    p = this.find(roomptr, 'CYCL');
    if (p >= 0) this.initCycl(p + 8);
  };

  // ---- main loop (scumm.cpp) ----
  Engine.prototype.runBootscript = function () {
    var args = new Int32Array(NUM_SCRIPT_LOCAL);
    args[0] = this.opts.bootParam || 0;
    this.runScript(1, 0, 0, args);
  };

  // One iteration of the main loop; returns the delta (in jiffies, 1/60 s) to wait before the next.
  Engine.prototype.frameDelta = function () {
    var delta = this.VAR(V.TIMER_NEXT);
    if (delta < 1) delta = 1;
    return delta;
  };

  Engine.prototype.scummLoop = function (delta) {
    this.setVAR(V.TIMER, delta);
    this.sound.advance(delta);
    this.vars[V.TIMER_TOTAL] += delta;
    this.vars[V.TMR_1] += delta; this.vars[V.TMR_2] += delta; this.vars[V.TMR_3] += delta;
    if (delta > 15) delta = 15;
    this.decreaseScriptDelay(delta);
    this.talkDelay -= delta; if (this.talkDelay < 0) this.talkDelay = 0;
    var oldEgo = this.VAR(V.EGO);
    this.processInput();
    this.scummLoop_updateScummVars();
    this.setVAR(V.MUSIC_TIMER, this.sound.getMusicTimer());
    this.scummLoop_handleSaveLoad();
    if (this.completeScreenRedraw) { this.handleMouseOver(); this.completeScreenRedraw = false; this.fullRedraw = true; }
    this.runAllScripts();
    this.checkExecVerbs();
    this.checkAndRunSentenceScript();
    if (this.quitFlag) return;
    if (this.saveLoadFlag && this.saveLoadFlag !== 1) { this.scummLoop_handleSaveLoad(); }
    if (this.currentRoom === 0) {
      this.displayDialog();
      this.drawDirtyScreenParts();
    } else {
      this.walkActors();
      this.moveCamera();
      this.updateObjectStates();
      this.displayDialog();
      this.scummLoop_handleDrawing();
      this.scummLoop_handleActors();
      this.fullRedraw = false;
      this.scummLoop_handleEffects();
      this.handleMouseOver(oldEgo !== this.VAR(V.EGO));
      this.updatePalette();
      this.drawDirtyScreenParts();
      this.playActorSounds();
    }
    this.sound.processSound();
    this.camera.last.x = this.camera.cur.x;
    this.animateCursor();
  };
  Engine.prototype.scummLoop_updateScummVars = function () {
    this.setVAR(V.CAMERA_POS_X, this.camera.cur.x);
    this.setVAR(V.HAVE_MSG, this.haveMsg);
    this.setVAR(V.VIRT_MOUSE_X, this.virtualMouse.x); this.setVAR(V.VIRT_MOUSE_Y, this.virtualMouse.y);
    this.setVAR(V.MOUSE_X, this.mouse.x); this.setVAR(V.MOUSE_Y, this.mouse.y);
    this.setVAR(V.DEBUGMODE, 0);
  };
  Engine.prototype.scummLoop_handleSaveLoad = function () {
    if (!this.saveLoadFlag) return;
    var flag = this.saveLoadFlag;
    this.saveLoadFlag = 0;
    if (this.opts.onSaveLoad) this.opts.onSaveLoad(flag, this.saveLoadSlot);
  };
  Engine.prototype.scummLoop_handleDrawing = function () {
    if (this.camera.cur.x !== this.camera.last.x || this.bgNeedsRedraw || this.fullRedraw) this.redrawBGAreas();
    this.processDrawQue();
  };
  Engine.prototype.scummLoop_handleActors = function () {
    this.setActorRedrawFlags();
    this.resetActorBgs();
    if (!(this.getCurrentLights() & LIGHTMODE_room_lights_on) && (this.getCurrentLights() & LIGHTMODE_flashlight_on)) {
      this.drawFlashlight();
      this.setActorRedrawFlags();
    }
    this.processActors();
  };
  Engine.prototype.scummLoop_handleEffects = function () {
    this.cyclePalette();
    this.palManipulate();
    if (this.doEffect) { this.doEffect = false; this.fadeIn(this.newEffect); this.clearClickedStatus(); }
  };
  Engine.prototype.getCurrentLights = function () { return this.VAR(V.CURRENT_LIGHTS); };
  Engine.prototype.isLightOn = function () { return (this.getCurrentLights() & LIGHTMODE_room_lights_on) !== 0; };

  Engine.prototype.resetScumm = function () {
    this.initScreens(16, 144);
    this.palManipCounter = 0;
    for (var i = 0; i < 256; i++) this.roomPalette[i] = i;
    this.resetPalette();
    this.loadCharset(1);
    this.setShake(0);
    this.cursor.animate = 1;
    this.createActors();
    this.numNestedScripts = 0;
    this.cutSceneStackPointer = 0;
    this.cutScenePtr.fill(0); this.cutSceneData.fill(0);
    for (i = 0; i < this.numVerbs; i++) {
      var v = this.verbs[i];
      v.verbid = 0; v.curRect.right = this.screenWidth - 1; v.oldRect.left = -1; v.type = 0; v.color = 2; v.hicolor = 0;
      v.charset_nr = 1; v.curmode = 0; v.saveid = 0; v.center = 0; v.key = 0;
    }
    this.camera.leftTrigger = 10; this.camera.rightTrigger = 30; this.camera.mode = 0; this.camera.follows = 0;
    this.virtscr[0].xstart = 0;
    this.mouse.x = 104; this.mouse.y = 56;
    this.ENCD_offs = 0; this.EXCD_offs = 0;
    this.currentScript = 0xFF;
    this.sentenceNum = 0;
    this.currentRoom = 0; this.numObjectsInRoom = 0;
    this.actorToPrintStrFor = 0; this.charsetBufPos = 0; this.haveMsg = 0; this.haveActorSpeechMsg = false;
    this.screenStartStrip = 0;
    this.defaultTextSpeed = 6; this.talkDelay = 0; this.keepText = false; this.nextLeft = 0; this.nextTop = 0;
    this.currentCursor = 0;
    this.cursor.state = 1; // Mac MI1 keeps the cursor on
    this.userPut = 0;
    this.newEffect = 129;
    this.fullRedraw = true;
    this.clearDrawObjectQueue();
    for (i = 0; i < 6; i++) {
      var s = this.string[i];
      s.def.xpos = 2; s.def.ypos = 5; s.def.right = this.screenWidth - 1; s.def.height = 0; s.def.color = 0xF; s.def.center = 0; s.def.charset = 0;
      s.def.overhead = false; s.def.no_talk_anim = false;
    }
  };
  Engine.prototype.resetScummVars = function () {
    this.setVAR(V.SOUNDCARD, 0xFFFF); // Macintosh: sound card id used by the Mac MI1 scripts
    this.setVAR(V.VIDEOMODE, 19);
    this.setVAR(V.HEAPSPACE, 1400);
    this.setVAR(V.FIXEDDISK, 1);
    this.setVAR(V.INPUTMODE, 3);
    this.setVAR(V.DEBUGMODE, 0);
    this.setVAR(V.FADE_DELAY, 3);
    this.setVAR(V.CHARINC, 4);
    this.setTalkingActor(0);
    this.setVAR(V.V5_TALK_STRING_Y, -0x50);
    this.setVAR(V.CURRENT_LIGHTS, LIGHTMODE_actor_use_base_palette | LIGHTMODE_actor_use_colors | LIGHTMODE_room_lights_on);
    this.vars[74] = 1225;
  };
  Engine.prototype.restart = function () {
    this.currentRoom = 0; this.currentScript = 0xFF;
    this.killAllScriptsExceptCurrent();
    this.setShake(0);
    this.sound.stopAllSounds();
    for (var i = 0; i < this.numVariables; i++) this.vars[i] = 0;
    this.bitVars.fill(0);
    for (i = 1; i < this.numGlobalObjects; i++) this.clearOwnerOf(i);
    this.objectOwnerTable.set(this.res.objOwner); this.objectStateTable.set(this.res.objState); this.classData.set(this.classDataInit);
    this.inventory.fill(0); this.inventoryObcd.fill(0);
    this.newNames.fill(0); this.newNameStr = []; this.strings = []; this.verbNames = []; this.actorNames = [];
    for (i = 0; i < NUM_SCRIPT_SLOT; i++) this.slots[i] = this.newSlot();
    for (i = 0; i < this.numLocalObjects; i++) this.objs[i] = this.newObj();
    this.resetScumm();
    this.resetScummVars();
    this.sound.setupSound();
    this.runBootscript();
  };

  Engine.prototype.getTalkingActor = function () { return this.VAR(V.TALK_ACTOR); };
  // The Macintosh version uses the system arrow cursor; nothing to animate or redefine.
  Engine.prototype.animateCursor = function () {};
  Engine.prototype.redefineBuiltinCursorFromChar = function () {};
  Engine.prototype.redefineBuiltinCursorHotspot = function () {};
  Engine.prototype.setTalkingActor = function (i) { this.setVAR(V.TALK_ACTOR, i); };

  // direction helpers (util.cpp)
  function newDirToOldDir(dir) {
    if (dir >= 71 && dir <= 109) return 1;
    if (dir >= 109 && dir <= 251) return 2;
    if (dir >= 251 && dir <= 289) return 0;
    return 3;
  }
  function oldDirToNewDir(dir) { return [270, 90, 180, 0][dir]; }
  Engine.newDirToOldDir = newDirToOldDir; Engine.oldDirToNewDir = oldDirToNewDir;

  // exported constants for the other modules
  Engine.C = {
    NUM_SCRIPT_SLOT: NUM_SCRIPT_SLOT, NUM_SCRIPT_LOCAL: NUM_SCRIPT_LOCAL, ssDead: ssDead, ssPaused: ssPaused, ssRunning: ssRunning,
    WIO_NOT_FOUND: WIO_NOT_FOUND, WIO_INVENTORY: WIO_INVENTORY, WIO_ROOM: WIO_ROOM, WIO_GLOBAL: WIO_GLOBAL, WIO_LOCAL: WIO_LOCAL, WIO_FLOBJECT: WIO_FLOBJECT,
    OF_OWNER_ROOM: OF_OWNER_ROOM, kObjectClassNeverClip: kObjectClassNeverClip, kObjectClassAlwaysClip: kObjectClassAlwaysClip,
    kObjectClassIgnoreBoxes: kObjectClassIgnoreBoxes, kObjectClassYFlip: kObjectClassYFlip, kObjectClassXFlip: kObjectClassXFlip,
    kObjectClassPlayer: kObjectClassPlayer, kObjectClassUntouchable: kObjectClassUntouchable,
    kMainVirtScreen: kMainVirtScreen, kTextVirtScreen: kTextVirtScreen, kVerbVirtScreen: kVerbVirtScreen, kBannerVirtScreen: kBannerVirtScreen,
    USAGE_BIT_DIRTY: USAGE_BIT_DIRTY, USAGE_BIT_RESTORED: USAGE_BIT_RESTORED, kTextVerbType: kTextVerbType, kImageVerbType: kImageVerbType,
    LIGHTMODE_room_lights_on: LIGHTMODE_room_lights_on, LIGHTMODE_actor_use_colors: LIGHTMODE_actor_use_colors, LIGHTMODE_flashlight_on: LIGHTMODE_flashlight_on,
    PARAM_1: PARAM_1, PARAM_2: PARAM_2, PARAM_3: PARAM_3, kNormalCameraMode: kNormalCameraMode, kFollowActorCameraMode: kFollowActorCameraMode, kPanningCameraMode: kPanningCameraMode
  };

  SCUMM.Engine = Engine;
})();

if (typeof module !== 'undefined') module.exports = SCUMM;
