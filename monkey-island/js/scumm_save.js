/*
 * Save states. Everything the scripts can change is captured; resources are
 * never modified (box data is the one exception, so it is saved too) and all
 * resource references are offsets into the static data file, so a state is a
 * plain object of numbers and typed arrays that structured clone / IndexedDB
 * can store directly. The restore sequence follows ScummVM's loadState.
 */
var SCUMM = (function (g) { return g.SCUMM || (g.SCUMM = {}); })(typeof globalThis !== 'undefined' ? globalThis : this);

(function () {
  'use strict';
  var E = SCUMM.Engine, P = E.prototype, V = E.V, C = E.C;
  var SAVE_VERSION = 1;

  function copy(o) { return o && o.slice ? o.slice() : o; }
  function plain(o) { return JSON.parse(JSON.stringify(o)); }
  function u8(a) { return a ? Uint8Array.from(a) : null; }

  P.saveState = function (name) {
    var i, st = { version: SAVE_VERSION, name: name || '', time: Date.now(), room: this.currentRoom };
    st.vars = copy(this.vars); st.bitVars = copy(this.bitVars);
    st.objectOwnerTable = copy(this.objectOwnerTable); st.objectStateTable = copy(this.objectStateTable); st.classData = copy(this.classData);
    st.slots = plain(this.slots); st.localvar = this.localvar.map(copy);
    st.nest = plain(this.nest); st.numNestedScripts = this.numNestedScripts;
    st.cutSceneStackPointer = this.cutSceneStackPointer; st.cutScenePtr = copy(this.cutScenePtr); st.cutSceneScript = copy(this.cutSceneScript);
    st.cutSceneData = copy(this.cutSceneData); st.cutSceneScriptIndex = this.cutSceneScriptIndex;
    st.sentence = plain(this.sentence); st.sentenceNum = this.sentenceNum;
    st.strings = this.strings.map(u8); st.verbNames = this.verbNames.map(u8); st.newNames = copy(this.newNames); st.newNameStr = this.newNameStr.map(u8);
    st.actorNames = this.actorNames.map(u8);
    st.inventory = copy(this.inventory); st.inventoryObcd = copy(this.inventoryObcd);
    st.resourceMapper = copy(this.resourceMapper);
    st.objs = plain(this.objs); st.numObjectsInRoom = this.numObjectsInRoom;
    st.verbs = plain(this.verbs); st.verbMouseOver = this.verbMouseOver;
    st.camera = plain(this.camera);
    st.currentRoom = this.currentRoom; st.roomResource = this.roomResource;
    st.screenStartStrip = this.screenStartStrip; st.screenEndStrip = this.screenEndStrip; st.screenTop = this.screenTop;
    st.screenB = this.screenB; st.screenH = this.screenH;
    st.egoPositioned = this.egoPositioned;
    st.userPut = this.userPut; st.cursorState = this.cursor.state; st.currentCursor = this.currentCursor;
    st.mouse = plain(this.mouse);
    st.switchRoomEffect = this.switchRoomEffect; st.switchRoomEffect2 = this.switchRoomEffect2; st.newEffect = this.newEffect;
    st.doEffect = this.doEffect; st.screenEffectFlag = this.screenEffectFlag; st.bgNeedsRedraw = this.bgNeedsRedraw;
    st.shakeEnabled = this.shakeEnabled;
    st.talkDelay = this.talkDelay; st.haveMsg = this.haveMsg; st.keepText = this.keepText; st.useTalkAnims = this.useTalkAnims;
    st.haveActorSpeechMsg = this.haveActorSpeechMsg; st.actorToPrintStrFor = this.actorToPrintStrFor;
    st.charsetBuffer = copy(this.charsetBuffer); st.charsetBufPos = this.charsetBufPos; st.charsetColor = this.charsetColor; st.msgCount = this.msgCount;
    st.nextLeft = this.nextLeft; st.nextTop = this.nextTop; st.defaultTextSpeed = this.defaultTextSpeed;
    st.charsetCurId = this.charset.curId; st.charsetColorMap = copy(this.charsetColorMap);
    st.charsetData = this.charsetData.map(copy);
    st.string = this.string.map(function (s) {
      var o = {}, d = {};
      for (var k in s.def) if (s.def.hasOwnProperty(k)) { o[k] = s[k]; d[k] = s.def[k]; }
      o.def = d; return o;
    });
    st.currentPalette = copy(this.currentPalette); st.shadowPalette = copy(this.shadowPalette); st.roomPalette = copy(this.roomPalette);
    st.curPalIndex = this.curPalIndex;
    st.colorCycle = plain(this.colorCycle);
    st.palManipCounter = this.palManipCounter; st.palManipStart = this.palManipStart; st.palManipEnd = this.palManipEnd;
    st.palManipPalette = copy(this.palManipPalette); st.palManipIntermediatePal = copy(this.palManipIntermediatePal);
    st.scaleSlots = plain(this.scaleSlots); st.extraBoxFlags = copy(this.extraBoxFlags);
    st.boxData = copy(this.boxData); st.boxMatrix = copy(this.boxMatrix);
    st.actors = [];
    for (i = 0; i < this.numActors; i++) {
      var a = this.actors[i], o = {};
      for (var k in a) {
        if (!a.hasOwnProperty(k) || k === 'vm') continue;
        var v = a[k];
        if (v && v.buffer) o[k] = copy(v);
        else if (k === 'cost') o[k] = { animType: copy(v.animType), animCounter: v.animCounter, soundCounter: v.soundCounter, soundPos: v.soundPos, stopped: v.stopped,
                                        curpos: copy(v.curpos), start: copy(v.start), end: copy(v.end), frame: copy(v.frame) };
        else if (typeof v === 'object') o[k] = plain(v);
        else o[k] = v;
      }
      st.actors.push(o);
    }
    st.sound = { lastSound: this.sound.lastSound, curSound: this.sound.player.curSound, elapsed: this.sound.player.elapsed,
                 songTimer: this.sound.player.songTimer, blockSfx: this.sound.player.blockSfx,
                 restart: (this.sound.player.curSnd && this.sound.player.curSnd.isMusic && this.sound.player.curSnd.loop) ? this.sound.player.curSound : 0 };
    return st;
  };

  P.loadState = function (st) {
    var i, k;
    if (!st || st.version !== SAVE_VERSION) throw new Error('unsupported save state');
    this.sound.stopAllSounds();
    this.stopTalk();
    this.inventory.fill(0); this.newNames.fill(0);
    this.gfxUsageBits.fill(0);
    this.resetScummVars();
    // -- restore --
    this.vars.set(st.vars); this.bitVars.set(st.bitVars);
    this.objectOwnerTable.set(st.objectOwnerTable); this.objectStateTable.set(st.objectStateTable); this.classData.set(st.classData);
    for (i = 0; i < this.slots.length; i++) this.slots[i] = Object.assign(this.newSlot(), st.slots[i]);
    for (i = 0; i < this.localvar.length; i++) this.localvar[i].set(st.localvar[i]);
    for (i = 0; i < this.nest.length; i++) this.nest[i] = Object.assign({}, st.nest[i]);
    this.numNestedScripts = st.numNestedScripts;
    this.cutSceneStackPointer = st.cutSceneStackPointer; this.cutScenePtr.set(st.cutScenePtr); this.cutSceneScript.set(st.cutSceneScript);
    this.cutSceneData.set(st.cutSceneData); this.cutSceneScriptIndex = st.cutSceneScriptIndex;
    for (i = 0; i < this.sentence.length; i++) this.sentence[i] = Object.assign({}, st.sentence[i]);
    this.sentenceNum = st.sentenceNum;
    this.strings = st.strings.map(u8); this.verbNames = st.verbNames.map(u8); this.newNames.set(st.newNames); this.newNameStr = st.newNameStr.map(u8);
    this.actorNames = st.actorNames.map(u8);
    this.inventory.set(st.inventory); this.inventoryObcd.set(st.inventoryObcd);
    this.resourceMapper.set(st.resourceMapper);
    for (i = 0; i < this.objs.length; i++) this.objs[i] = Object.assign(this.newObj(), st.objs[i]);
    this.numObjectsInRoom = st.numObjectsInRoom;
    for (i = 0; i < this.verbs.length; i++) { var vb = this.newVerb(); Object.assign(vb, st.verbs[i]); vb.curRect = Object.assign({}, st.verbs[i].curRect); vb.oldRect = Object.assign({}, st.verbs[i].oldRect); this.verbs[i] = vb; }
    this.camera = plain(st.camera);
    this.currentRoom = st.currentRoom; this.roomResource = st.roomResource;
    this.screenStartStrip = st.screenStartStrip; this.screenEndStrip = st.screenEndStrip; this.screenTop = st.screenTop;
    this.egoPositioned = st.egoPositioned;
    this.userPut = st.userPut; this.cursor.state = st.cursorState; this.currentCursor = st.currentCursor;
    this.mouse.x = st.mouse.x; this.mouse.y = st.mouse.y;
    this.switchRoomEffect = st.switchRoomEffect; this.switchRoomEffect2 = st.switchRoomEffect2; this.newEffect = st.newEffect;
    this.doEffect = st.doEffect; this.screenEffectFlag = st.screenEffectFlag; this.bgNeedsRedraw = st.bgNeedsRedraw;
    this.setShake(st.shakeEnabled ? 1 : 0);
    this.talkDelay = st.talkDelay; this.haveMsg = st.haveMsg; this.keepText = st.keepText; this.useTalkAnims = st.useTalkAnims;
    this.haveActorSpeechMsg = st.haveActorSpeechMsg; this.actorToPrintStrFor = st.actorToPrintStrFor;
    this.charsetBuffer.set(st.charsetBuffer); this.charsetBufPos = st.charsetBufPos; this.charsetColor = st.charsetColor; this.msgCount = st.msgCount;
    this.nextLeft = st.nextLeft; this.nextTop = st.nextTop; this.defaultTextSpeed = st.defaultTextSpeed;
    this.charsetColorMap.set(st.charsetColorMap);
    for (i = 0; i < this.charsetData.length && i < st.charsetData.length; i++) this.charsetData[i].set(st.charsetData[i]);
    for (i = 0; i < 6; i++) {
      var s = this.string[i], o = st.string[i];
      for (k in s.def) if (s.def.hasOwnProperty(k)) { s[k] = o[k]; s.def[k] = o.def[k]; }
    }
    this.currentPalette.set(st.currentPalette); this.shadowPalette.set(st.shadowPalette); this.roomPalette.set(st.roomPalette);
    this.curPalIndex = st.curPalIndex;
    for (i = 0; i < 16; i++) this.colorCycle[i] = Object.assign({}, st.colorCycle[i]);
    this.palManipCounter = st.palManipCounter; this.palManipStart = st.palManipStart; this.palManipEnd = st.palManipEnd;
    this.palManipPalette = st.palManipPalette ? Uint8Array.from(st.palManipPalette) : null;
    this.palManipIntermediatePal = st.palManipIntermediatePal ? Uint8Array.from(st.palManipIntermediatePal) : null;
    for (i = 0; i < this.scaleSlots.length; i++) this.scaleSlots[i] = st.scaleSlots[i] ? Object.assign({}, st.scaleSlots[i]) : null;
    this.extraBoxFlags.set(st.extraBoxFlags);
    this.boxData = st.boxData ? Uint8Array.from(st.boxData) : null; this.boxMatrix = st.boxMatrix ? Uint8Array.from(st.boxMatrix) : null;
    for (i = 0; i < this.numActors; i++) {
      var a = this.actors[i], o2 = st.actors[i];
      for (k in o2) {
        if (!o2.hasOwnProperty(k)) continue;
        var v = o2[k];
        if (k === 'cost') { a.cost.animType.set(v.animType); a.cost.animCounter = v.animCounter; a.cost.soundCounter = v.soundCounter; a.cost.soundPos = v.soundPos; a.cost.stopped = v.stopped; a.cost.curpos.set(v.curpos); a.cost.start.set(v.start); a.cost.end.set(v.end); a.cost.frame.set(v.frame); }
        else if (a[k] && a[k].buffer) a[k].set(v);
        else if (v && typeof v === 'object') a[k] = plain(v);
        else a[k] = v;
      }
    }
    this.currentScript = 0xFF;
    // -- bring the room back (ScummVM loadState) --
    this.resetPalette();
    if (this.currentRoom !== 0) {
      this.setupRoomSubBlocks();
      if (st.boxData) {} // keep the saved (possibly script-modified) boxes
    } else { this.ENCD_offs = this.EXCD_offs = 0; }
    this.camera.last.x = this.camera.cur.x;
    this.initScreens(0, this.screenHeight);
    var vs = this.virtscr[C.kMainVirtScreen];
    vs.pixels.fill(0); this.setDirtyRange(vs, 0, vs.h); this.updateDirtyScreen(C.kMainVirtScreen);
    this.updatePalette();
    this.initScreens(st.screenB, st.screenH);
    this.completeScreenRedraw = true;
    this.charset.hasMask = false;
    this.clearTextSurface();
    this.drawObjectQue.length = 0;
    this.verbMouseOver = 0;
    this.cameraMoved();
    if (this.currentRoom !== 0) this.initBGBuffers(this.roomHeight);
    this.setVAR(V.ROOM_FLAG, 1);
    this.charset.curId = -1;
    if (st.charsetCurId >= 1 && st.charsetCurId < this.numCharsets && this.charsetPtr(st.charsetCurId) >= 0) this.charset.setCurID(st.charsetCurId);
    this.costumeLoader.id = -1; this.costumeRenderer.loaded.id = -1;
    // post-load steps of ScummEngine_v5::scummLoop_handleSaveLoad
    for (i = 0; i < 256; i++) this.roomPalette[i] = i;
    if (this.currentRoom === 36) this.roomPalette[47] = 15;
    this.clearTextSurface();
    this.charset.hasMask = false;
    this.redrawVerbs();
    this.sound.lastSound = st.sound.lastSound;
    this.sound.player.songTimer = st.sound.songTimer;
    if (st.sound.restart) this.sound.player.startSound(st.sound.restart);
    this.frameQueue.length = 0;
  };
})();

if (typeof module !== 'undefined') module.exports = SCUMM;
