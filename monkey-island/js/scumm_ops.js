/*
 * SCUMM v5 opcodes (port of ScummVM's engines/scumm/script_v5.cpp, GPL v3),
 * trimmed to what The Secret of Monkey Island uses, with the Monkey Island
 * specific fixes ScummVM applies kept in place.
 */
var SCUMM = (function (g) { return g.SCUMM || (g.SCUMM = {}); })(typeof globalThis !== 'undefined' ? globalThis : this);

(function () {
  'use strict';
  var E = SCUMM.Engine, P = E.prototype, V = E.V, C = E.C;
  var PARAM_1 = C.PARAM_1, PARAM_2 = C.PARAM_2, PARAM_3 = C.PARAM_3;
  var kObjectClassUntouchable = C.kObjectClassUntouchable;
  function s16(v) { return (v << 16) >> 16; }

  P.o5_actorFollowCamera = function () { this.actorFollowCamera(this.getVarOrDirectByte(0x80)); };
  P.o5_actorFromPos = function () {
    this.getResultPos();
    var x = this.getVarOrDirectWord(PARAM_1), y = this.getVarOrDirectWord(PARAM_2);
    this.setResult(this.getActorFromPos(x, y));
  };

  P.o5_actorOps = function () {
    var act = this.getVarOrDirectByte(PARAM_1);
    var a = this.actors[act];
    if (!a) throw new Error('o5_actorOps: invalid actor ' + act);
    var i, j;
    if (this.workaroundMonkey1JollyRoger(0x13, a.number)) { this.stopObjectCode(); return; }
    while ((this.opcode = this.fetchByte()) !== 0xFF) {
      switch (this.opcode & 0x1F) {
        case 0: this.getVarOrDirectByte(PARAM_1); break;
        case 1: // costume
          i = this.getVarOrDirectByte(PARAM_1);
          if (this.currentRoom === 76 && act === 12 && i === 0) i = 76; // captain Smirk's cigar smoke
          a.setActorCostume(i); break;
        case 2: i = this.getVarOrDirectByte(PARAM_1); j = this.getVarOrDirectByte(PARAM_2); a.setActorWalkSpeed(i, j); break;
        case 3: a.sound[0] = this.getVarOrDirectByte(PARAM_1); break;
        case 4: a.walkFrame = this.getVarOrDirectByte(PARAM_1); break;
        case 5: a.talkStartFrame = this.getVarOrDirectByte(PARAM_1); a.talkStopFrame = this.getVarOrDirectByte(PARAM_2); break;
        case 6: a.standFrame = this.getVarOrDirectByte(PARAM_1); break;
        case 7: this.getVarOrDirectByte(PARAM_1); this.getVarOrDirectByte(PARAM_2); this.getVarOrDirectByte(PARAM_3); break;
        case 8: a.initActor(0); break;
        case 9: a.setElevation(this.getVarOrDirectWord(PARAM_1)); break;
        case 10: a.initFrame = 1; a.walkFrame = 2; a.standFrame = 3; a.talkStartFrame = 4; a.talkStopFrame = 5; break;
        case 11: // palette
          i = this.getVarOrDirectByte(PARAM_1); j = this.getVarOrDirectByte(PARAM_2);
          if (i < 0 || i > 31) throw new Error('o5_actorOps: palette slot ' + i);
          if (this.currentRoom === 76) { // smoke colours in the Smirk close-up
            if (i === 3) i = 1; else if (i === 9) i = 3;
            if (j === 3) j = this.findClosestPaletteColor(0, 171, 171); else if (j === 7) j = this.findClosestPaletteColor(171, 171, 171);
          }
          a.setPalette(i, j); break;
        case 12: a.talkColor = this.getVarOrDirectByte(PARAM_1); break;
        case 13: this.actorNames[a.number] = this.copyScriptString(); break;
        case 14: a.initFrame = this.getVarOrDirectByte(PARAM_1); break;
        case 16: a.width = this.getVarOrDirectByte(PARAM_1); break;
        case 17: i = this.getVarOrDirectByte(PARAM_1); j = this.getVarOrDirectByte(PARAM_2); a.boxscale = i; a.setScale(i, j); break;
        case 18: a.forceClip = 0; break;
        case 19: a.forceClip = this.getVarOrDirectByte(PARAM_1); break;
        case 20: case 21:
          a.ignoreBoxes = !(this.opcode & 1); a.forceClip = 0;
          if (a.isInCurrentRoom()) a.putActor(a.pos.x, a.pos.y, a.room);
          break;
        case 22: a.setAnimSpeed(this.getVarOrDirectByte(PARAM_1)); break;
        case 23: a.shadowMode = this.getVarOrDirectByte(PARAM_1); break;
        default: throw new Error('o5_actorOps: default case ' + (this.opcode & 0x1F));
      }
    }
  };

  P.o5_setClass = function () {
    var obj = this.getVarOrDirectWord(PARAM_1), cls;
    while ((this.opcode = this.fetchByte()) !== 0xFF) {
      cls = this.getVarOrDirectWord(PARAM_1);
      if (this.roomResource === 59 && this.currentScript !== 0xFF && this.slots[this.currentScript].number === 10002 &&
          obj === 915 && cls === 6 && this.currentPalette[251 * 3] === 0) {
        // Stan's: inventory colours (Ultimate Talkie fix carried by ScummVM)
        if (this.vars[260] < 8) { this.setPalColor(245, 68, 68, 68); this.setPalColor(247, 252, 244, 0); this.setPalColor(249, 112, 212, 0); }
        this.setPalColor(251, 32, 84, 0);
      }
      if (cls === 0) this.classData[obj] = 0;
      else this.putClass(obj, cls, (cls & 0x80) !== 0);
    }
  };

  P.o5_add = function () {
    this.getResultPos();
    var a = this.getVarOrDirectWord(PARAM_1);
    if (this.currentScript !== 0xFF && this.slots[this.currentScript].number === 210 && this.currentRoom === 35 && this.resultVarNumber === 248 && a === 1) a = 0; // clock tower
    this.setResult(this.readVar(this.resultVarNumber) + a);
  };
  P.o5_and = function () { this.getResultPos(); var a = this.getVarOrDirectWord(PARAM_1); this.setResult(this.readVar(this.resultVarNumber) & a); };
  P.o5_animateActor = function () {
    var act = this.getVarOrDirectByte(PARAM_1), anim = this.getVarOrDirectByte(PARAM_2);
    if (!this.isValidActor(act)) return;
    this.actors[act].animateActor(anim);
  };
  P.o5_breakHere = function () { this.updateScriptPtr(); this.currentScript = 0xFF; };
  P.o5_chainScript = function () {
    var script = this.getVarOrDirectByte(PARAM_1);
    var vars = this.getWordVararg();
    var cur = this.currentScript;
    this.slots[cur].number = 0; this.slots[cur].status = C.ssDead;
    this.currentScript = 0xFF;
    this.runScript(script, this.slots[cur].freezeResistant, this.slots[cur].recursive, vars);
  };

  P.o5_cursorCommand = function () {
    var i, j, k, table;
    switch ((this.opcode = this.fetchByte()) & 0x1F) {
      case 1: this.cursor.state = 1; this.verbMouseOverFn(0); break;
      case 2: this.cursor.state = 1; this.verbMouseOverFn(0); break;   // Mac MI1 never hides the cursor
      case 3: this.userPut = 1; break;
      case 4: this.userPut = 0; break;
      case 5: this.cursor.state++; this.verbMouseOverFn(0); break;
      case 6: this.cursor.state--; if (this.cursor.state === 0) this.cursor.state = 1; this.verbMouseOverFn(0); break;
      case 7: this.userPut++; break;
      case 8: this.userPut--; break;
      case 10: i = this.getVarOrDirectByte(PARAM_1); j = this.getVarOrDirectByte(PARAM_2); this.redefineBuiltinCursorFromChar(i, j); break;
      case 11: i = this.getVarOrDirectByte(PARAM_1); j = this.getVarOrDirectByte(PARAM_2); k = this.getVarOrDirectByte(PARAM_3); this.redefineBuiltinCursorHotspot(i, j, k); break;
      case 12: i = this.getVarOrDirectByte(PARAM_1); if (i >= 0 && i <= 3) this.currentCursor = i; else throw new Error('SO_CURSOR_SET: unsupported cursor id ' + i); break;
      case 13: this.initCharset(this.getVarOrDirectByte(PARAM_1)); break;
      case 14:
        table = this.getWordVararg();
        for (i = 0; i < 16; i++) this.charsetColorMap[i] = this.charsetData[this.string[1].def.charset][i] = table[i] & 0xFF;
        break;
      default: break;
    }
    this.setVAR(V.CURSORSTATE, this.cursor.state);
    this.setVAR(V.USERPUT, this.userPut);
  };

  P.o5_cutscene = function () { var args = this.getWordVararg(); this.beginCutscene(args); };
  P.o5_endCutscene = function () { this.endCutscene(); };
  P.o5_debug = function () { this.getVarOrDirectWord(PARAM_1); };
  P.o5_decrement = function () { this.getResultPos(); this.setResult(this.readVar(this.resultVarNumber) - 1); };
  P.o5_delay = function () {
    var delay = this.fetchByte(); delay |= this.fetchByte() << 8; delay |= this.fetchByte() << 16;
    this.slots[this.currentScript].delay = delay;
    this.slots[this.currentScript].status = C.ssPaused;
    this.o5_breakHere();
  };
  P.o5_delayVariable = function () {
    this.slots[this.currentScript].delay = this.getVar();
    this.slots[this.currentScript].status = C.ssPaused;
    this.o5_breakHere();
  };
  P.o5_divide = function () {
    this.getResultPos();
    var a = this.getVarOrDirectWord(PARAM_1);
    if (a === 0) { this.warn('Divide by zero'); this.setResult(0); }
    else this.setResult((this.readVar(this.resultVarNumber) / a) | 0);
  };
  P.o5_doSentence = function () {
    var verb = this.getVarOrDirectByte(PARAM_1);
    if (verb === 0xFE) { this.sentenceNum = 0; this.stopScript(this.VAR(V.SENTENCE_SCRIPT)); this.clearClickedStatus(); return; }
    var objectA = this.getVarOrDirectWord(PARAM_2), objectB = this.getVarOrDirectWord(PARAM_3);
    this.doSentence(verb, objectA, objectB);
  };
  P.o5_drawBox = function () {
    var x = this.getVarOrDirectWord(PARAM_1), y = this.getVarOrDirectWord(PARAM_2);
    this.opcode = this.fetchByte();
    var x2 = this.getVarOrDirectWord(PARAM_1), y2 = this.getVarOrDirectWord(PARAM_2), color = this.getVarOrDirectByte(PARAM_3);
    this.drawBox(x, y, x2, y2, color);
  };
  P.o5_drawObject = function () {
    var state = 1, xpos = 255, ypos = 255;
    var obj = this.getVarOrDirectWord(PARAM_1);
    this.opcode = this.fetchByte();
    switch (this.opcode & 0x1F) {
      case 1: xpos = this.getVarOrDirectWord(PARAM_1); ypos = this.getVarOrDirectWord(PARAM_2); break;
      case 2: state = this.getVarOrDirectWord(PARAM_1); break;
      case 0x1F: break;
      default: throw new Error('o5_drawObject: unknown subopcode ' + (this.opcode & 0x1F));
    }
    var idx = this.getObjectIndex(obj);
    if (idx === -1) return;
    var od = this.objs[idx];
    if (xpos !== 0xFF) {
      od.walk_x += (xpos * 8) - od.x_pos; od.x_pos = xpos * 8;
      od.walk_y += (ypos * 8) - od.y_pos; od.y_pos = ypos * 8;
    }
    this.addObjectToDrawQue(idx);
    var x = od.x_pos, y = od.y_pos, w = od.width, h = od.height;
    for (var i = this.numLocalObjects - 1; i > 0; i--) {
      var o = this.objs[i];
      if (o.obj_nr && o.x_pos === x && o.y_pos === y && o.width === w && o.height === h) this.putState(o.obj_nr, 0);
    }
    this.putState(obj, state);
  };
  P.o5_dummy = function () { this.warn('o5_dummy invoked (opcode ' + this.opcode + ')'); };
  P.o5_getStringWidth = function () {
    this.getResultPos();
    var string = this.getVarOrDirectByte(PARAM_1);
    var ptr = this.strings[string];
    if (!ptr) throw new Error('o5_getStringWidth: string ' + string + ' missing');
    this.setResult(this.charset.getStringWidth(0, ptr, 0));
  };
  P.o5_expression = function () {
    this.stackPos = 0;
    this.getResultPos();
    var dst = this.resultVarNumber, i;
    while ((this.opcode = this.fetchByte()) !== 0xFF) {
      switch (this.opcode & 0x1F) {
        case 1: this.push(this.getVarOrDirectWord(PARAM_1)); break;
        case 2: i = this.pop(); this.push(i + this.pop()); break;
        case 3: i = this.pop(); this.push(this.pop() - i); break;
        case 4: i = this.pop(); this.push(i * this.pop()); break;
        case 5: i = this.pop(); if (i === 0) throw new Error('Divide by zero'); this.push((this.pop() / i) | 0); break;
        case 6: this.opcode = this.fetchByte(); this.executeOpcode(this.opcode); this.push(this.vars[0]); break;
        default: break;
      }
    }
    this.resultVarNumber = dst;
    this.setResult(this.pop());
  };
  P.o5_faceActor = function () {
    var act = this.getVarOrDirectByte(PARAM_1), obj = this.getVarOrDirectWord(PARAM_2);
    var a = this.isValidActor(act) ? this.actors[act] : null;
    if (a) a.faceToObject(obj);
  };
  P.o5_findInventory = function () {
    this.getResultPos();
    var x = this.getVarOrDirectByte(PARAM_1), y = this.getVarOrDirectByte(PARAM_2);
    this.setResult(this.findInventory(x, y));
  };
  P.o5_findObject = function () {
    this.getResultPos();
    var x = this.getVarOrDirectByte(PARAM_1), y = this.getVarOrDirectByte(PARAM_2);
    this.setResult(this.findObject(x, y));
  };
  P.o5_freezeScripts = function () { var scr = this.getVarOrDirectByte(PARAM_1); if (scr !== 0) this.freezeScripts(scr); else this.unfreezeScripts(); };
  P.o5_getActorCostume = function () { this.getResultPos(); var act = this.getVarOrDirectByte(PARAM_1); this.setResult(this.derefActor(act).costume); };
  P.o5_getActorElevation = function () { this.getResultPos(); var act = this.getVarOrDirectByte(PARAM_1); this.setResult(this.derefActor(act).elevation); };
  P.o5_getActorFacing = function () { this.getResultPos(); var act = this.getVarOrDirectByte(PARAM_1); this.setResult(E.newDirToOldDir(this.derefActor(act).facing)); };
  P.o5_getActorMoving = function () { this.getResultPos(); var act = this.getVarOrDirectByte(PARAM_1); this.setResult(this.derefActor(act).moving); };
  P.o5_getActorRoom = function () {
    this.getResultPos();
    var act = this.getVarOrDirectByte(PARAM_1);
    if (!this.isValidActor(act)) { this.setResult(0); return; }
    this.setResult(this.actors[act].room);
  };
  P.o5_getActorScale = function () { this.getResultPos(); var act = this.getVarOrDirectByte(PARAM_1); this.setResult(this.derefActor(act).scalex); };
  P.o5_getActorWalkBox = function () { this.getResultPos(); var act = this.getVarOrDirectByte(PARAM_1); this.setResult(this.derefActor(act).walkbox); };
  P.o5_getActorWidth = function () { this.getResultPos(); var act = this.getVarOrDirectByte(PARAM_1); this.setResult(this.derefActor(act).width); };
  P.o5_getActorX = function () { this.getResultPos(); var a = this.getVarOrDirectWord(PARAM_1); this.setResult(this.getObjX(a)); };
  P.o5_getActorY = function () { this.getResultPos(); var a = this.getVarOrDirectWord(PARAM_1); this.setResult(this.getObjY(a)); };
  P.o5_getAnimCounter = function () { this.getResultPos(); var act = this.getVarOrDirectByte(PARAM_1); this.setResult(this.derefActor(act).cost.animCounter); };
  P.o5_getClosestObjActor = function () {
    var closest_obj = 0xFF, closest_dist = 0xFF;
    this.getResultPos();
    var act = this.getVarOrDirectWord(PARAM_1), obj = this.VAR(V.ACTOR_RANGE_MAX);
    do {
      var dist = this.getObjActToObjActDist(act, obj);
      if (dist < closest_dist) { closest_dist = dist; closest_obj = obj; }
    } while (--obj >= this.VAR(V.ACTOR_RANGE_MIN));
    this.setResult(closest_obj);
  };
  P.o5_getDist = function () {
    this.getResultPos();
    var o1 = this.getVarOrDirectWord(PARAM_1), o2 = this.getVarOrDirectWord(PARAM_2);
    this.setResult(this.getObjActToObjActDist(o1, o2));
  };
  P.o5_getInventoryCount = function () { this.getResultPos(); this.setResult(this.getInventoryCount(this.getVarOrDirectByte(PARAM_1))); };
  P.o5_getObjectOwner = function () { this.getResultPos(); this.setResult(this.getOwner(this.getVarOrDirectWord(PARAM_1))); };
  P.o5_getObjectState = function () { this.getResultPos(); this.setResult(this.getState(this.getVarOrDirectWord(PARAM_1))); };
  P.o5_getRandomNr = function () { this.getResultPos(); var max = this.getVarOrDirectByte(PARAM_1); this.setResult(this.getRandomNumber(max)); };
  P.o5_isScriptRunning = function () {
    this.getResultPos();
    var scriptNr = this.getVarOrDirectByte(PARAM_1);
    this.setResult(this.isScriptRunning(scriptNr) ? 1 : 0);
    // Cannibal village: wait for inventory scripts in a cutscene state (ScummVM bug #346)
    if (this.currentScript !== 0xFF && this.slots[this.currentScript].number === 204 && this.currentRoom === 25) {
      for (var i = 0; i < C.NUM_SCRIPT_SLOT; i++) {
        var ss = this.slots[i];
        if (ss.status !== C.ssDead && ss.where === C.WIO_INVENTORY && ss.cutsceneOverride) { this.setResult(1); return; }
      }
    }
    this.workaroundMonkey1JollyRoger(0x68, scriptNr);
  };
  P.o5_getVerbEntrypoint = function () {
    this.getResultPos();
    var a = this.getVarOrDirectWord(PARAM_1), b = this.getVarOrDirectWord(PARAM_2);
    this.setResult(this.getVerbEntrypoint(a, b));
  };
  P.o5_ifClassOfIs = function () {
    var obj = this.getVarOrDirectWord(PARAM_1), cls, cond = true;
    while ((this.opcode = this.fetchByte()) !== 0xFF) {
      cls = this.getVarOrDirectWord(PARAM_1);
      var b = this.getClass(obj, cls);
      if (((cls & 0x80) && !b) || (!(cls & 0x80) && b)) cond = false;
    }
    this.jumpRelative(cond);
  };
  P.o5_increment = function () { this.getResultPos(); this.setResult(this.readVar(this.resultVarNumber) + 1); };
  P.o5_isActorInBox = function () {
    var act = this.getVarOrDirectByte(PARAM_1), box = this.getVarOrDirectByte(PARAM_2);
    var a = this.derefActor(act);
    this.jumpRelative(this.checkXYInBoxBounds(box, a.pos.x, a.pos.y));
  };
  P.o5_isEqual = function () {
    var vr = this.fetchWord();
    var a = s16(this.readVar(vr)), b = s16(this.getVarOrDirectWord(PARAM_1));
    this.jumpRelative(b === a);
  };
  P.o5_isGreater = function () { var a = s16(this.getVar()), b = s16(this.getVarOrDirectWord(PARAM_1)); this.jumpRelative(b > a); };
  P.o5_isGreaterEqual = function () { var a = s16(this.getVar()), b = s16(this.getVarOrDirectWord(PARAM_1)); this.jumpRelative(b >= a); };
  P.o5_isLess = function () { var a = s16(this.getVar()), b = s16(this.getVarOrDirectWord(PARAM_1)); this.jumpRelative(b < a); };
  P.o5_isLessEqual = function () { var a = s16(this.getVar()), b = s16(this.getVarOrDirectWord(PARAM_1)); this.jumpRelative(b <= a); };
  P.o5_isNotEqual = function () { var a = s16(this.getVar()), b = s16(this.getVarOrDirectWord(PARAM_1)); this.jumpRelative(b !== a); };
  P.o5_notEqualZero = function () { var a = this.getVar(); this.jumpRelative(a !== 0); };
  P.o5_equalZero = function () { var a = this.getVar(); this.jumpRelative(a === 0); };
  P.o5_jumpRelative = function () { this.jumpRelative(false); };
  P.o5_lights = function () {
    var a = this.getVarOrDirectByte(PARAM_1), b = this.fetchByte(), c = this.fetchByte();
    if (c === 0) this.setVAR(V.CURRENT_LIGHTS, a);
    else if (c === 1) { this.flashlight.xStrips = a; this.flashlight.yStrips = b; }
    this.fullRedraw = true;
  };
  P.o5_loadRoom = function () {
    var room = this.getVarOrDirectByte(PARAM_1);
    this.startScene(room, null, 0);
    this.fullRedraw = true;
  };
  P.o5_loadRoomWithEgo = function () {
    var obj = this.getVarOrDirectWord(PARAM_1), room = this.getVarOrDirectByte(PARAM_2);
    var a = this.derefActor(this.VAR(V.EGO));
    a.putActorInRoom(room);
    var oldDir = a.facing;
    this.egoPositioned = false;
    var x = this.fetchWordSigned(), y = this.fetchWordSigned();
    this.setVAR(V.WALKTO_OBJ, obj);
    this.startScene(a.room, a, obj);
    this.setVAR(V.WALKTO_OBJ, 0);
    this.camera.cur.x = this.camera.dest.x = a.pos.x;
    this.setCameraFollows(a, false);
    this.fullRedraw = true;
    if (x !== -1) a.startWalkActor(x, y, -1);
  };
  P.o5_matrixOps = function () {
    var a, b;
    this.opcode = this.fetchByte();
    switch (this.opcode & 0x1F) {
      case 1: a = this.getVarOrDirectByte(PARAM_1); b = this.getVarOrDirectByte(PARAM_2); this.setBoxFlags(a, b); break;
      case 2: a = this.getVarOrDirectByte(PARAM_1); b = this.getVarOrDirectByte(PARAM_2); this.setBoxScale(a, b); break;
      case 3: a = this.getVarOrDirectByte(PARAM_1); b = this.getVarOrDirectByte(PARAM_2); this.setBoxScale(a, (b - 1) | 0x8000); break;
      case 4: this.createBoxMatrix(); break;
      default: break;
    }
  };
  P.o5_move = function () { this.getResultPos(); this.setResult(this.getVarOrDirectWord(PARAM_1)); };
  P.o5_multiply = function () { this.getResultPos(); var a = this.getVarOrDirectWord(PARAM_1); this.setResult(this.readVar(this.resultVarNumber) * a); };
  P.o5_or = function () { this.getResultPos(); var a = this.getVarOrDirectWord(PARAM_1); this.setResult(this.readVar(this.resultVarNumber) | a); };
  P.o5_beginOverride = function () { if (this.fetchByte() !== 0) this.beginOverride(); else this.endOverride(); };
  P.o5_panCameraTo = function () { this.panCameraTo(this.getVarOrDirectWord(PARAM_1), 0); };
  P.o5_pickupObject = function () {
    var obj = this.getVarOrDirectWord(PARAM_1), room = this.getVarOrDirectByte(PARAM_2);
    if (room === 0) room = this.roomResource;
    this.addObjectToInventory(obj, room);
    this.putOwner(obj, this.VAR(V.EGO));
    this.putClass(obj, kObjectClassUntouchable, 1);
    this.putState(obj, 1);
    this.markObjectRectAsDirty(obj);
    this.clearDrawObjectQueue();
    this.runInventoryScript(1);
  };
  P.o5_print = function () { this.actorToPrintStrFor = this.getVarOrDirectByte(PARAM_1); this.decodeParseString(); };
  P.o5_printEgo = function () { this.actorToPrintStrFor = this.VAR(V.EGO) & 0xFF; this.decodeParseString(); };
  P.o5_pseudoRoom = function () {
    var i = this.fetchByte(), j;
    while ((j = this.fetchByte()) !== 0) if (j >= 0x80) this.resourceMapper[j & 0x7F] = i;
  };
  P.o5_putActor = function () {
    var act = this.getVarOrDirectByte(PARAM_1), x = this.getVarOrDirectWord(PARAM_2), y = this.getVarOrDirectWord(PARAM_3);
    if (this.currentRoom === 76 && act === 12) { // Smirk close-up positions from the VGA floppy version
      if (x === 176 && y === 80) { x = 174; y = 86; } else if (x === 176 && y === 78) x = 172;
    }
    var a = this.derefActor(act);
    a.putActor(x, y, a.room);
  };
  P.o5_putActorAtObject = function () {
    var a = this.derefActor(this.getVarOrDirectByte(PARAM_1));
    var obj = this.getVarOrDirectWord(PARAM_2), x, y;
    if (this.whereIsObject(obj) !== C.WIO_NOT_FOUND) { var p = this.getObjectXYPos(obj); x = p.x; y = p.y; }
    else { x = 240; y = 120; }
    a.putActor(x, y, a.room);
  };
  P.o5_putActorInRoom = function () {
    var act = this.getVarOrDirectByte(PARAM_1), room = this.getVarOrDirectByte(PARAM_2);
    var a = this.derefActor(act);
    if (a.visible && this.currentRoom !== room && this.getTalkingActor() === a.number) this.stopTalk();
    a.room = room;
    if (!room) a.putActor(0, 0, 0);
  };
  P.o5_systemOps = function () {
    var subOp = this.fetchByte();
    switch (subOp) {
      case 1: this.restartFlag = true; this.currentScript = 0xFF; break;
      case 2: if (this.opts.onPause) this.opts.onPause(); break;
      case 3: this.quitFlag = true; this.currentScript = 0xFF; break;
      default: throw new Error('o5_systemOps: unknown subopcode ' + subOp);
    }
  };
  P.o5_resourceRoutines = function () {
    var resid = 0;
    this.opcode = this.fetchByte();
    if (this.opcode !== 17) resid = this.getVarOrDirectByte(PARAM_1);
    var op = this.opcode & 0x3F;
    switch (op) {
      case 1: case 2: case 3: case 4: break;            // load: everything is always in memory
      case 5: case 6: case 7: case 8: break;            // nuke
      case 9: case 10: case 11: case 12: break;         // lock
      case 13: case 14: case 15: case 16: break;        // unlock
      case 17: break;                                   // clear heap
      case 18: this.loadCharset(resid); break;
      case 19: break;                                   // nuke charset
      case 20: this.loadFlObject(this.getVarOrDirectWord(PARAM_2), resid); break;
      default: throw new Error('o5_resourceRoutines: default case ' + op);
    }
  };
  P.o5_roomOps = function () {
    var a = 0, b = 0, c, d, e;
    this.opcode = this.fetchByte();
    switch (this.opcode & 0x1F) {
      case 1:
        a = this.getVarOrDirectWord(PARAM_1); b = this.getVarOrDirectWord(PARAM_2);
        if (a < this.screenWidth / 2) a = this.screenWidth / 2;
        if (b < this.screenWidth / 2) b = this.screenWidth / 2;
        if (a > this.roomWidth - this.screenWidth / 2) a = this.roomWidth - this.screenWidth / 2;
        if (b > this.roomWidth - this.screenWidth / 2) b = this.roomWidth - this.screenWidth / 2;
        this.setVAR(V.CAMERA_MIN_X, a); this.setVAR(V.CAMERA_MAX_X, b);
        break;
      case 2: throw new Error('room-color is no longer a valid command');
      case 3: a = this.getVarOrDirectWord(PARAM_1); b = this.getVarOrDirectWord(PARAM_2); this.initScreens(a, b); break;
      case 4:
        a = this.getVarOrDirectWord(PARAM_1); b = this.getVarOrDirectWord(PARAM_2); c = this.getVarOrDirectWord(PARAM_3);
        this.opcode = this.fetchByte(); d = this.getVarOrDirectByte(PARAM_1);
        if (this.currentRoom === 76 && d === 3) { /* keep the smoke colours */ } else this.setPalColor(d, a, b, c);
        break;
      case 5: this.setShake(1); break;
      case 6: this.setShake(0); break;
      case 7:
        a = this.getVarOrDirectByte(PARAM_1); b = this.getVarOrDirectByte(PARAM_2);
        this.opcode = this.fetchByte(); c = this.getVarOrDirectByte(PARAM_1); d = this.getVarOrDirectByte(PARAM_2);
        this.opcode = this.fetchByte(); e = this.getVarOrDirectByte(PARAM_2);
        this.setScaleSlot(e - 1, 0, b, a, 0, d, c);
        break;
      case 8: a = this.getVarOrDirectByte(PARAM_1); b = this.getVarOrDirectByte(PARAM_2); c = this.getVarOrDirectByte(PARAM_3); this.darkenPalette(a, a, a, b, c); break;
      case 9: this.saveLoadFlag = this.getVarOrDirectByte(PARAM_1); this.saveLoadSlot = this.getVarOrDirectByte(PARAM_2); this.saveLoadSlot = 99; break;
      case 10:
        a = this.getVarOrDirectWord(PARAM_1);
        if (a) { this.switchRoomEffect = a & 0xFF; this.switchRoomEffect2 = (a >> 8) & 0xFF; }
        else this.fadeIn(this.newEffect);
        break;
      case 11:
        a = this.getVarOrDirectWord(PARAM_1); b = this.getVarOrDirectWord(PARAM_2); c = this.getVarOrDirectWord(PARAM_3);
        this.opcode = this.fetchByte(); d = this.getVarOrDirectByte(PARAM_1); e = this.getVarOrDirectByte(PARAM_2);
        this.darkenPalette(a, b, c, d, e);
        break;
      case 12:
        a = this.getVarOrDirectWord(PARAM_1); b = this.getVarOrDirectWord(PARAM_2); c = this.getVarOrDirectWord(PARAM_3);
        this.opcode = this.fetchByte(); d = this.getVarOrDirectByte(PARAM_1); e = this.getVarOrDirectByte(PARAM_2);
        this.setShadowPalette(a, b, c, d, e, 0, 256);
        break;
      case 13: { // save string (monkey.cfg)
        a = this.getVarOrDirectByte(PARAM_1);
        var fn = ''; var ch;
        while ((ch = this.fetchByte())) fn += String.fromCharCode(ch);
        if (this.opts.saveString) this.opts.saveString(this.strings[a]);
        this.setVAR(V.SOUNDRESULT, 0);
        break;
      }
      case 14: {
        a = this.getVarOrDirectByte(PARAM_1);
        fn = ''; while ((ch = this.fetchByte())) fn += String.fromCharCode(ch);
        var data = this.opts.loadString ? this.opts.loadString() : null;
        if (data) this.strings[a] = data;
        break;
      }
      case 15:
        a = this.getVarOrDirectByte(PARAM_1); this.opcode = this.fetchByte();
        b = this.getVarOrDirectByte(PARAM_1); c = this.getVarOrDirectByte(PARAM_2);
        this.opcode = this.fetchByte(); d = this.getVarOrDirectByte(PARAM_1);
        this.palManipulateInit(a, b, c, d);
        break;
      case 16:
        a = this.getVarOrDirectByte(PARAM_1); b = this.getVarOrDirectByte(PARAM_2);
        if (a < 1 || a > 16) throw new Error('o5_roomOps: 16: color cycle');
        this.colorCycle[a - 1].delay = (b !== 0) ? ((0x4000 / (b * 0x4C)) | 0) : 0;
        break;
      default: throw new Error('o5_roomOps: unknown subopcode ' + (this.opcode & 0x1F));
    }
  };
  P.o5_saveRestoreVerbs = function () {
    var slot, slot2;
    this.opcode = this.fetchByte();
    var a = this.getVarOrDirectByte(PARAM_1), b = this.getVarOrDirectByte(PARAM_2), c = this.getVarOrDirectByte(PARAM_3);
    switch (this.opcode) {
      case 1:
        while (a <= b) {
          slot = this.getVerbSlot(a, 0);
          if (slot && this.verbs[slot].saveid === 0) { this.verbs[slot].saveid = c; this.drawVerb(slot, 0); this.verbMouseOverFn(0); }
          a++;
        }
        break;
      case 2:
        while (a <= b) {
          slot = this.getVerbSlot(a, c);
          if (slot) {
            slot2 = this.getVerbSlot(a, 0);
            if (slot2) this.killVerb(slot2);
            slot = this.getVerbSlot(a, c);
            this.verbs[slot].saveid = 0; this.drawVerb(slot, 0); this.verbMouseOverFn(0);
          }
          a++;
        }
        break;
      case 3:
        while (a <= b) { slot = this.getVerbSlot(a, c); if (slot) this.killVerb(slot); a++; }
        break;
      default: throw new Error('o5_saveRestoreVerbs: unknown subopcode ' + this.opcode);
    }
  };
  P.o5_setCameraAt = function () { this.setCameraAtEx(this.getVarOrDirectWord(PARAM_1)); };
  P.o5_setObjectName = function () {
    if (this.currentScript !== 0xFF && this.slots[this.currentScript].number === 68) { // mugs vs inventory cutscenes (ScummVM bug #10571)
      for (var i = 0; i < C.NUM_SCRIPT_SLOT; i++) {
        var ss = this.slots[i];
        if (ss.status !== C.ssDead && ss.where === C.WIO_INVENTORY && ss.cutsceneOverride) { this.pc--; this.o5_breakHere(); return; }
      }
    }
    var obj = this.getVarOrDirectWord(PARAM_1);
    this.setObjectName(obj);
  };
  P.o5_setOwnerOf = function () { var obj = this.getVarOrDirectWord(PARAM_1), owner = this.getVarOrDirectByte(PARAM_2); this.setOwnerOf(obj, owner); };
  P.o5_setState = function () {
    var obj = this.getVarOrDirectWord(PARAM_1), state = this.getVarOrDirectByte(PARAM_2);
    this.putState(obj, state);
    this.markObjectRectAsDirty(obj);
    if (this.bgNeedsRedraw) this.clearDrawObjectQueue();
  };
  P.o5_setVarRange = function () {
    this.getResultPos();
    var a = this.fetchByte(), b;
    do {
      if (this.opcode & 0x80) b = this.fetchWordSigned(); else b = this.fetchByte();
      this.setResult(b);
      this.resultVarNumber++;
    } while (--a);
  };
  P.o5_startMusic = function () { this.sound.startSound(this.getVarOrDirectByte(PARAM_1)); };
  P.o5_startSound = function () {
    var snd = this.getVarOrDirectByte(PARAM_1);
    this.setVAR(V.MUSIC_TIMER, 0);
    this.sound.startSound(snd);
  };
  P.o5_stopMusic = function () { this.sound.stopAllSounds(); };
  P.o5_stopSound = function () { this.sound.stopSound(this.getVarOrDirectByte(PARAM_1)); };
  P.o5_isSoundRunning = function () {
    this.getResultPos();
    var snd = this.getVarOrDirectByte(PARAM_1);
    if (snd) snd = this.sound.isSoundRunning(snd) ? 1 : 0;
    this.setResult(snd);
  };
  P.o5_soundKludge = function () { var items = this.getWordVararg(); this.sound.soundKludge(items, items.count); };
  P.o5_startObject = function () {
    var obj = this.getVarOrDirectWord(PARAM_1), script = this.getVarOrDirectByte(PARAM_2);
    var data = this.getWordVararg();
    this.runObjectScript(obj, script, 0, 0, data);
  };
  P.o5_startScript = function () {
    var op = this.opcode;
    var script = this.getVarOrDirectByte(PARAM_1);
    var data = this.getWordVararg();
    if (!this.copyProtection && script === 155) return; // Mac copy protection (disabled in the Mac CD Game Pack too)
    this.runScript(script, (op & 0x20) !== 0, (op & 0x40) !== 0, data);
  };
  P.o5_stopObjectCode = function () { this.stopObjectCode(); };
  P.o5_stopObjectScript = function () { this.stopObjectScript(this.getVarOrDirectWord(PARAM_1)); };
  P.o5_stopScript = function () {
    var script = this.getVarOrDirectByte(PARAM_1);
    if (!script) this.stopObjectCode(); else this.stopScript(script);
  };
  P.o5_stringOps = function () {
    var a, b, c, ptr;
    this.opcode = this.fetchByte();
    switch (this.opcode & 0x1F) {
      case 1: a = this.getVarOrDirectByte(PARAM_1); this.strings[a] = this.copyScriptString(); break;
      case 2:
        a = this.getVarOrDirectByte(PARAM_1); b = this.getVarOrDirectByte(PARAM_2);
        this.strings[a] = null;
        ptr = this.strings[b];
        if (ptr) this.strings[a] = new Uint8Array(ptr);
        break;
      case 3:
        a = this.getVarOrDirectByte(PARAM_1); b = this.getVarOrDirectByte(PARAM_2); c = this.getVarOrDirectByte(PARAM_3);
        ptr = this.strings[a];
        if (!ptr) throw new Error('String ' + a + ' does not exist');
        if (b >= ptr.length) { var n = new Uint8Array(b + 2); n.set(ptr); ptr = this.strings[a] = n; }
        ptr[b] = c;
        break;
      case 4:
        this.getResultPos();
        a = this.getVarOrDirectByte(PARAM_1); b = this.getVarOrDirectByte(PARAM_2);
        ptr = this.strings[a];
        if (!ptr) throw new Error('String ' + a + ' does not exist');
        this.setResult(ptr[b] || 0);
        break;
      case 5:
        a = this.getVarOrDirectByte(PARAM_1); b = this.getVarOrDirectByte(PARAM_2);
        this.strings[a] = null;
        if (b) this.strings[a] = new Uint8Array(b + 1);
        break;
      default: break;
    }
  };
  P.o5_subtract = function () { this.getResultPos(); var a = this.getVarOrDirectWord(PARAM_1); this.setResult(this.readVar(this.resultVarNumber) - a); };
  P.o5_verbOps = function () {
    var verb = this.getVarOrDirectByte(PARAM_1);
    var slot = this.getVerbSlot(verb, 0);
    if (slot < 0 || slot >= this.numVerbs) throw new Error('new verb slot');
    var vs = this.verbs[slot];
    vs.verbid = verb;
    var a, b, ptr;
    while ((this.opcode = this.fetchByte()) !== 0xFF) {
      switch (this.opcode & 0x1F) {
        case 1:
          a = this.getVarOrDirectWord(PARAM_1);
          if (slot) { this.setVerbObject(this.roomResource, a, slot); vs.type = C.kImageVerbType; }
          break;
        case 2:
          this.verbNames[slot] = this.copyScriptString();
          if (slot === 0) this.verbNames[slot] = null;
          vs.type = C.kTextVerbType; vs.imgindex = 0;
          break;
        case 3: vs.color = this.getVarOrDirectByte(PARAM_1); break;
        case 4: vs.hicolor = this.getVarOrDirectByte(PARAM_1); break;
        case 5:
          vs.curRect.left = this.getVarOrDirectWord(PARAM_1); vs.curRect.top = this.getVarOrDirectWord(PARAM_2);
          vs.origLeft = vs.curRect.left;
          break;
        case 6: vs.curmode = 1; break;
        case 7: vs.curmode = 0; break;
        case 8: this.killVerb(slot); break;
        case 9:
          slot = this.getVerbSlot(verb, 0);
          if (slot === 0) {
            for (slot = 1; slot < this.numVerbs; slot++) if (this.verbs[slot].verbid === 0) break;
            if (slot === this.numVerbs) throw new Error('Too many verbs');
          }
          vs = this.verbs[slot];
          vs.verbid = verb; vs.color = 2; vs.hicolor = 0; vs.dimcolor = 8; vs.type = C.kTextVerbType;
          vs.charset_nr = this.string[0].def.charset; vs.curmode = 0; vs.saveid = 0; vs.key = 0; vs.center = 0; vs.imgindex = 0;
          break;
        case 16: vs.dimcolor = this.getVarOrDirectByte(PARAM_1); break;
        case 17: vs.curmode = 2; break;
        case 18: vs.key = this.getVarOrDirectByte(PARAM_1); break;
        case 19: vs.center = 1; break;
        case 20:
          ptr = this.strings[this.getVarOrDirectWord(PARAM_1)];
          if (!ptr) this.verbNames[slot] = null; else this.verbNames[slot] = new Uint8Array(ptr);
          if (slot === 0) this.verbNames[slot] = null;
          vs.type = C.kTextVerbType; vs.imgindex = 0;
          break;
        case 22:
          a = this.getVarOrDirectWord(PARAM_1); b = this.getVarOrDirectByte(PARAM_2);
          if (slot && vs.imgindex !== a) { this.setVerbObject(b, a, slot); vs.type = C.kImageVerbType; vs.imgindex = a; }
          break;
        case 23: vs.bkcolor = this.getVarOrDirectByte(PARAM_1); break;
        default: throw new Error('o5_verbOps: unknown subopcode ' + (this.opcode & 0x1F));
      }
    }
    this.drawVerb(slot, 0);
    this.verbMouseOverFn(0);
  };
  P.o5_wait = function () {
    var oldaddr = this.pc - 1;
    this.opcode = this.fetchByte();
    switch (this.opcode & 0x1F) {
      case 1: { var act = this.getVarOrDirectByte(PARAM_1); var a = this.isValidActor(act) ? this.actors[act] : null; if (a && a.moving) break; return; }
      case 2: if (this.VAR(V.HAVE_MSG)) break; return;
      case 3: if ((this.camera.cur.x >> 3) !== (this.camera.dest.x >> 3)) break; return;
      case 4:
        if (this.sentenceNum) { if (this.sentence[this.sentenceNum - 1].freezeCount && !this.isScriptInUse(this.VAR(V.SENTENCE_SCRIPT))) return; }
        else if (!this.isScriptInUse(this.VAR(V.SENTENCE_SCRIPT))) return;
        break;
      default: throw new Error('o5_wait: unknown subopcode ' + (this.opcode & 0x1F));
    }
    this.pc = oldaddr;
    this.o5_breakHere();
  };
  P.o5_walkActorTo = function () {
    var a = this.derefActor(this.getVarOrDirectByte(PARAM_1));
    var x = this.getVarOrDirectWord(PARAM_2), y = this.getVarOrDirectWord(PARAM_3);
    // the storekeeper closes the door before walking back to the counter (ScummVM enhancement)
    if (this.currentRoom === 30 && this.currentScript !== 0xFF && this.slots[this.currentScript].number === 207 && a.number === 11 && x === 232 && y === 141) {
      if (this.whereIsObject(387) === C.WIO_ROOM && this.getState(387) === 1 && this.getState(437) === 1) {
        var args = new Int32Array(C.NUM_SCRIPT_LOCAL); args[0] = 387; args[1] = 437;
        this.runScript(26, 0, 0, args);
      }
    }
    a.startWalkActor(x, y, -1);
  };
  P.walkActorToActor = function (actor, toActor, dist) {
    var a = this.derefActor(actor), to = this.derefActor(toActor);
    if (dist === 0xFF) {
      dist = (a.scalex * a.width / 0xFF) | 0;
      dist += ((to.scalex * to.width / 0xFF) | 0) >> 1;
    }
    var x = to.pos.x, y = to.pos.y;
    if (x < a.pos.x) x += dist; else x -= dist;
    a.startWalkActor(x, y, -1);
  };
  P.o5_walkActorToActor = function () {
    var nr = this.getVarOrDirectByte(PARAM_1), nr2 = this.getVarOrDirectByte(PARAM_2), dist = this.fetchByte();
    if (!this.isValidActor(nr)) return;
    var a = this.actors[nr];
    if (!a.isInCurrentRoom()) return;
    if (!this.isValidActor(nr2)) return;
    var a2 = this.actors[nr2];
    if (!a2.isInCurrentRoom()) return;
    this.walkActorToActor(nr, nr2, dist);
  };
  P.o5_walkActorToObject = function () {
    var a = this.derefActor(this.getVarOrDirectByte(PARAM_1));
    var obj = this.getVarOrDirectWord(PARAM_2);
    if (this.whereIsObject(obj) !== C.WIO_NOT_FOUND) { var p = this.getObjectXYPos(obj); a.startWalkActor(p.x, p.y, p.dir); }
  };

  // Jolly Roger continuity fix (ScummVM): the flag only appears the first time the Sea Monkey is shown
  P.workaroundMonkey1JollyRoger = function (callerOpcode, arg) {
    if (this.roomResource === 87 && this.currentScript !== 0xFF && this.slots[this.currentScript].number === 10002) {
      var scriptNr = -1, actNr = -1;
      if (callerOpcode === 0x13) { actNr = arg; scriptNr = 122; }
      else if (callerOpcode === 0x68) { scriptNr = arg; actNr = 9; }
      if (scriptNr !== 122 || actNr !== 9) return false;
      var a = this.isValidActor(actNr) ? this.actors[actNr] : null;
      if (a && !this.isScriptRunning(scriptNr)) { a.putActorInRoom(0); return true; }
    }
    return false;
  };

  // print-string parameter parsing
  P.decodeParseString = function () {
    var textSlot;
    switch (this.actorToPrintStrFor) { case 252: textSlot = 3; break; case 253: textSlot = 2; break; case 254: textSlot = 1; break; default: textSlot = 0; }
    var st = this.string[textSlot];
    st.loadDefault();
    while ((this.opcode = this.fetchByte()) !== 0xFF) {
      switch (this.opcode & 0xF) {
        case 0: st.xpos = this.getVarOrDirectWord(PARAM_1); st.ypos = this.getVarOrDirectWord(PARAM_2); st.overhead = false; break;
        case 1: st.color = this.getVarOrDirectByte(PARAM_1); break;
        case 2: st.right = this.getVarOrDirectWord(PARAM_1); break;
        case 3: { var w = this.getVarOrDirectWord(PARAM_1), h = this.getVarOrDirectWord(PARAM_2); throw new Error('decodeParseString: unhandled case 3: ' + w + ',' + h); }
        case 4: st.center = true; st.overhead = false; break;
        case 6: st.center = false; st.overhead = false; break;
        case 7: st.overhead = true; break;
        case 8: this.getVarOrDirectWord(PARAM_1); this.getVarOrDirectWord(PARAM_2); break;
        case 15: this.decodeParseStringTextString(textSlot); return;
        default: throw new Error('decodeParseString: unhandled case ' + (this.opcode & 0xF));
      }
    }
    st.saveDefault();
  };
  P.decodeParseStringTextString = function (textSlot) {
    var len = this.resStrLen(this.pc);
    var st = this.string[textSlot];
    var msg = this.strFromData(this.pc);
    if (this.currentScript !== 0xFF && ((this.roomResource === 78 && this.slots[this.currentScript].number === 201) ||
        (this.roomResource === 45 && this.slots[this.currentScript].number === 200 && this.isValidActor(10) && this.actors[10].isInCurrentRoom())) &&
        this.actorToPrintStrFor === 255 && st.color !== 0x0F) {
      st.color = 0xF9; // the ghost priest's colour in the church
    } else if (this.currentScript !== 0xFF && (this.slots[this.currentScript].number === 140 || this.slots[this.currentScript].number === 294) &&
        this.actorToPrintStrFor === 255 && st.color === 0x06) {
      st.color = 0xEA; // navigator head
    }
    if (this.roomResource === 25 && this.currentScript !== 0xFF && this.slots[this.currentScript].number === 205) msg = this.patchedCannibalString(msg);
    this.printString(textSlot, msg);
    this.pc += len + 1;
  };
  P.patchedCannibalString = function (msg) {
    var s = String.fromCharCode.apply(null, msg.subarray(0, Math.min(8, msg.length)));
    var text = null;
    if (s === '/LH.ENG/') text = 'Oooh, that\'s nice.\xFF\x03Simple.  Just like one of mine.\xFF\x03And little.  Like mine.';
    if (!text) return msg;
    var out = new Uint8Array(text.length + 1);
    for (var i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
    return out;
  };

  // the opcode table (script_v5.cpp setupOpcodes)
  var names = {};
  var T = [
    [0x00, 'stopObjectCode'], [0x01, 'putActor'], [0x02, 'startMusic'], [0x03, 'getActorRoom'],
    [0x04, 'isGreaterEqual'], [0x05, 'drawObject'], [0x06, 'getActorElevation'], [0x07, 'setState'],
    [0x08, 'isNotEqual'], [0x09, 'faceActor'], [0x0a, 'startScript'], [0x0b, 'getVerbEntrypoint'],
    [0x0c, 'resourceRoutines'], [0x0d, 'walkActorToActor'], [0x0e, 'putActorAtObject'], [0x0f, 'getObjectState'],
    [0x10, 'getObjectOwner'], [0x11, 'animateActor'], [0x12, 'panCameraTo'], [0x13, 'actorOps'],
    [0x14, 'print'], [0x15, 'actorFromPos'], [0x16, 'getRandomNr'], [0x17, 'and'],
    [0x18, 'jumpRelative'], [0x19, 'doSentence'], [0x1a, 'move'], [0x1b, 'multiply'],
    [0x1c, 'startSound'], [0x1d, 'ifClassOfIs'], [0x1e, 'walkActorTo'], [0x1f, 'isActorInBox'],
    [0x20, 'stopMusic'], [0x21, 'putActor'], [0x22, 'getAnimCounter'], [0x23, 'getActorY'],
    [0x24, 'loadRoomWithEgo'], [0x25, 'pickupObject'], [0x26, 'setVarRange'], [0x27, 'stringOps'],
    [0x28, 'equalZero'], [0x29, 'setOwnerOf'], [0x2a, 'startScript'], [0x2b, 'delayVariable'],
    [0x2c, 'cursorCommand'], [0x2d, 'putActorInRoom'], [0x2e, 'delay'],
    [0x30, 'matrixOps'], [0x31, 'getInventoryCount'], [0x32, 'setCameraAt'], [0x33, 'roomOps'],
    [0x34, 'getDist'], [0x35, 'findObject'], [0x36, 'walkActorToObject'], [0x37, 'startObject'],
    [0x38, 'isLessEqual'], [0x39, 'doSentence'], [0x3a, 'subtract'], [0x3b, 'getActorScale'],
    [0x3c, 'stopSound'], [0x3d, 'findInventory'], [0x3e, 'walkActorTo'], [0x3f, 'drawBox'],
    [0x40, 'cutscene'], [0x41, 'putActor'], [0x42, 'chainScript'], [0x43, 'getActorX'],
    [0x44, 'isLess'], [0x46, 'increment'], [0x47, 'setState'],
    [0x48, 'isEqual'], [0x49, 'faceActor'], [0x4a, 'startScript'], [0x4b, 'getVerbEntrypoint'],
    [0x4c, 'soundKludge'], [0x4d, 'walkActorToActor'], [0x4e, 'putActorAtObject'],
    [0x51, 'animateActor'], [0x52, 'actorFollowCamera'], [0x53, 'actorOps'],
    [0x54, 'setObjectName'], [0x55, 'actorFromPos'], [0x56, 'getActorMoving'], [0x57, 'or'],
    [0x58, 'beginOverride'], [0x59, 'doSentence'], [0x5a, 'add'], [0x5b, 'divide'],
    [0x5d, 'setClass'], [0x5e, 'walkActorTo'], [0x5f, 'isActorInBox'],
    [0x60, 'freezeScripts'], [0x61, 'putActor'], [0x62, 'stopScript'], [0x63, 'getActorFacing'],
    [0x64, 'loadRoomWithEgo'], [0x65, 'pickupObject'], [0x66, 'getClosestObjActor'], [0x67, 'getStringWidth'],
    [0x68, 'isScriptRunning'], [0x69, 'setOwnerOf'], [0x6a, 'startScript'], [0x6b, 'debug'],
    [0x6c, 'getActorWidth'], [0x6d, 'putActorInRoom'], [0x6e, 'stopObjectScript'],
    [0x70, 'lights'], [0x71, 'getActorCostume'], [0x72, 'loadRoom'], [0x73, 'roomOps'],
    [0x74, 'getDist'], [0x75, 'findObject'], [0x76, 'walkActorToObject'], [0x77, 'startObject'],
    [0x78, 'isGreater'], [0x79, 'doSentence'], [0x7a, 'verbOps'], [0x7b, 'getActorWalkBox'],
    [0x7c, 'isSoundRunning'], [0x7d, 'findInventory'], [0x7e, 'walkActorTo'], [0x7f, 'drawBox'],
    [0x80, 'breakHere'], [0x81, 'putActor'], [0x82, 'startMusic'], [0x83, 'getActorRoom'],
    [0x84, 'isGreaterEqual'], [0x85, 'drawObject'], [0x86, 'getActorElevation'], [0x87, 'setState'],
    [0x88, 'isNotEqual'], [0x89, 'faceActor'], [0x8a, 'startScript'], [0x8b, 'getVerbEntrypoint'],
    [0x8c, 'resourceRoutines'], [0x8d, 'walkActorToActor'], [0x8e, 'putActorAtObject'], [0x8f, 'getObjectState'],
    [0x90, 'getObjectOwner'], [0x91, 'animateActor'], [0x92, 'panCameraTo'], [0x93, 'actorOps'],
    [0x94, 'print'], [0x95, 'actorFromPos'], [0x96, 'getRandomNr'], [0x97, 'and'],
    [0x98, 'systemOps'], [0x99, 'doSentence'], [0x9a, 'move'], [0x9b, 'multiply'],
    [0x9c, 'startSound'], [0x9d, 'ifClassOfIs'], [0x9e, 'walkActorTo'], [0x9f, 'isActorInBox'],
    [0xa0, 'stopObjectCode'], [0xa1, 'putActor'], [0xa2, 'getAnimCounter'], [0xa3, 'getActorY'],
    [0xa4, 'loadRoomWithEgo'], [0xa5, 'pickupObject'], [0xa6, 'setVarRange'], [0xa7, 'dummy'],
    [0xa8, 'notEqualZero'], [0xa9, 'setOwnerOf'], [0xaa, 'startScript'], [0xab, 'saveRestoreVerbs'],
    [0xac, 'expression'], [0xad, 'putActorInRoom'], [0xae, 'wait'],
    [0xb0, 'matrixOps'], [0xb1, 'getInventoryCount'], [0xb2, 'setCameraAt'], [0xb3, 'roomOps'],
    [0xb4, 'getDist'], [0xb5, 'findObject'], [0xb6, 'walkActorToObject'], [0xb7, 'startObject'],
    [0xb8, 'isLessEqual'], [0xb9, 'doSentence'], [0xba, 'subtract'], [0xbb, 'getActorScale'],
    [0xbc, 'stopSound'], [0xbd, 'findInventory'], [0xbe, 'walkActorTo'], [0xbf, 'drawBox'],
    [0xc0, 'endCutscene'], [0xc1, 'putActor'], [0xc2, 'chainScript'], [0xc3, 'getActorX'],
    [0xc4, 'isLess'], [0xc6, 'decrement'], [0xc7, 'setState'],
    [0xc8, 'isEqual'], [0xc9, 'faceActor'], [0xca, 'startScript'], [0xcb, 'getVerbEntrypoint'],
    [0xcc, 'pseudoRoom'], [0xcd, 'walkActorToActor'], [0xce, 'putActorAtObject'],
    [0xd1, 'animateActor'], [0xd2, 'actorFollowCamera'], [0xd3, 'actorOps'],
    [0xd4, 'setObjectName'], [0xd5, 'actorFromPos'], [0xd6, 'getActorMoving'], [0xd7, 'or'],
    [0xd8, 'printEgo'], [0xd9, 'doSentence'], [0xda, 'add'], [0xdb, 'divide'],
    [0xdd, 'setClass'], [0xde, 'walkActorTo'], [0xdf, 'isActorInBox'],
    [0xe0, 'freezeScripts'], [0xe1, 'putActor'], [0xe2, 'stopScript'], [0xe3, 'getActorFacing'],
    [0xe4, 'loadRoomWithEgo'], [0xe5, 'pickupObject'], [0xe6, 'getClosestObjActor'], [0xe7, 'getStringWidth'],
    [0xe8, 'isScriptRunning'], [0xe9, 'setOwnerOf'], [0xea, 'startScript'], [0xeb, 'debug'],
    [0xec, 'getActorWidth'], [0xed, 'putActorInRoom'], [0xee, 'stopObjectScript'],
    [0xf0, 'lights'], [0xf1, 'getActorCostume'], [0xf2, 'loadRoom'], [0xf3, 'roomOps'],
    [0xf4, 'getDist'], [0xf5, 'findObject'], [0xf6, 'walkActorToObject'], [0xf7, 'startObject'],
    [0xf8, 'isGreater'], [0xf9, 'doSentence'], [0xfa, 'verbOps'], [0xfb, 'getActorWalkBox'],
    [0xfc, 'isSoundRunning'], [0xfd, 'findInventory'], [0xfe, 'walkActorTo'], [0xff, 'drawBox']
  ];
  var table = new Array(256);
  for (var i = 0; i < T.length; i++) { table[T[i][0]] = P['o5_' + T[i][1]]; names[T[i][0]] = T[i][1]; if (!table[T[i][0]]) throw new Error('missing opcode handler ' + T[i][1]); }
  P.opcodes = table;
  E.opcodeNames = names;
})();

if (typeof module !== 'undefined') module.exports = SCUMM;
