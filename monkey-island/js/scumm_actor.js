/*
 * Actors: positions, walking through the box network, facing, animation
 * state, and the classic costume loader/renderer. Port of ScummVM's
 * actor.cpp, boxes.cpp (walking parts), costume.cpp and base-costume.cpp
 * (GPL v3), reduced to the SCUMM v5 paths.
 */
var SCUMM = (function (g) { return g.SCUMM || (g.SCUMM = {}); })(typeof globalThis !== 'undefined' ? globalThis : this);

(function () {
  'use strict';
  var E = SCUMM.Engine, P = E.prototype, V = E.V, C = E.C;
  var kMain = C.kMainVirtScreen;
  var MF_NEW_LEG = 1, MF_IN_LEG = 2, MF_TURN = 4, MF_LAST_LEG = 8;
  var kInvalidBox = 0, kOldInvalidBox = 255;
  var kBoxXFlip = 0x08, kBoxYFlip = 0x10, kBoxPlayerOnly = 0x20, kBoxInvisible = 0x80;
  var CHORE_REDIRECT_INIT = 56, CHORE_REDIRECT_WALK = 57, CHORE_REDIRECT_STAND = 58, CHORE_REDIRECT_START_TALK = 59, CHORE_REDIRECT_STOP_TALK = 60;
  var newDirToOldDir = E.newDirToOldDir, oldDirToNewDir = E.oldDirToNewDir;
  var LIGHTMODE_actor_use_colors = C.LIGHTMODE_actor_use_colors;

  var smallCostumeScaleTable = new Uint8Array([
    0xFF, 0xFD, 0x7D, 0xBD, 0x3D, 0xDD, 0x5D, 0x9D, 0x1D, 0xED, 0x6D, 0xAD, 0x2D, 0xCD, 0x4D, 0x8D,
    0x0D, 0xF5, 0x75, 0xB5, 0x35, 0xD5, 0x55, 0x95, 0x15, 0xE5, 0x65, 0xA5, 0x25, 0xC5, 0x45, 0x85,
    0x05, 0xF9, 0x79, 0xB9, 0x39, 0xD9, 0x59, 0x99, 0x19, 0xE9, 0x69, 0xA9, 0x29, 0xC9, 0x49, 0x89,
    0x09, 0xF1, 0x71, 0xB1, 0x31, 0xD1, 0x51, 0x91, 0x11, 0xE1, 0x61, 0xA1, 0x21, 0xC1, 0x41, 0x81,
    0x01, 0xFB, 0x7B, 0xBB, 0x3B, 0xDB, 0x5B, 0x9B, 0x1B, 0xEB, 0x6B, 0xAB, 0x2B, 0xCB, 0x4B, 0x8B,
    0x0B, 0xF3, 0x73, 0xB3, 0x33, 0xD3, 0x53, 0x93, 0x13, 0xE3, 0x63, 0xA3, 0x23, 0xC3, 0x43, 0x83,
    0x03, 0xF7, 0x77, 0xB7, 0x37, 0xD7, 0x57, 0x97, 0x17, 0xE7, 0x67, 0xA7, 0x27, 0xC7, 0x47, 0x87,
    0x07, 0xEF, 0x6F, 0xAF, 0x2F, 0xCF, 0x4F, 0x8F, 0x0F, 0xDF, 0x5F, 0x9F, 0x1F, 0xBF, 0x3F, 0x7F,
    0x00, 0x80, 0x40, 0xC0, 0x20, 0xA0, 0x60, 0xE0, 0x10, 0x90, 0x50, 0xD0, 0x30, 0xB0, 0x70, 0xF0,
    0x08, 0x88, 0x48, 0xC8, 0x28, 0xA8, 0x68, 0xE8, 0x18, 0x98, 0x58, 0xD8, 0x38, 0xB8, 0x78, 0xF8,
    0x04, 0x84, 0x44, 0xC4, 0x24, 0xA4, 0x64, 0xE4, 0x14, 0x94, 0x54, 0xD4, 0x34, 0xB4, 0x74, 0xF4,
    0x0C, 0x8C, 0x4C, 0xCC, 0x2C, 0xAC, 0x6C, 0xEC, 0x1C, 0x9C, 0x5C, 0xDC, 0x3C, 0xBC, 0x7C, 0xFC,
    0x02, 0x82, 0x42, 0xC2, 0x22, 0xA2, 0x62, 0xE2, 0x12, 0x92, 0x52, 0xD2, 0x32, 0xB2, 0x72, 0xF2,
    0x0A, 0x8A, 0x4A, 0xCA, 0x2A, 0xAA, 0x6A, 0xEA, 0x1A, 0x9A, 0x5A, 0xDA, 0x3A, 0xBA, 0x7A, 0xFA,
    0x06, 0x86, 0x46, 0xC6, 0x26, 0xA6, 0x66, 0xE6, 0x16, 0x96, 0x56, 0xD6, 0x36, 0xB6, 0x76, 0xF6,
    0x0E, 0x8E, 0x4E, 0xCE, 0x2E, 0xAE, 0x6E, 0xEE, 0x1E, 0x9E, 0x5E, 0xDE, 0x3E, 0xBE, 0x7E, 0xFE
  ]);

  function s16(v) { return (v << 16) >> 16; }
  function s8(v) { return (v << 24) >> 24; }
  function cdiv(a, b) { return (a / b) | 0; }
  function abs(a) { return a < 0 ? -a : a; }

  function newCost() {
    var c = { animType: new Uint8Array(16), animCounter: 0, soundCounter: 0, soundPos: 0, stopped: 0,
              curpos: new Uint16Array(16), start: new Uint16Array(16), end: new Uint16Array(16), frame: new Uint16Array(16) };
    c.reset = function () {
      c.animCounter = 0; c.soundCounter = 0; c.soundPos = 0; c.stopped = 0;
      c.animType.fill(0); c.curpos.fill(0xFFFF); c.start.fill(0xFFFF); c.end.fill(0xFFFF); c.frame.fill(0xFFFF);
    };
    c.reset();
    return c;
  }

  // ---- Actor ----
  function Actor(vm, id) {
    this.vm = vm; this.number = id;
    this.pos = { x: 0, y: 0 };
    this.top = 0; this.bottom = 0; this.elevation = 0; this.width = 24; this.facing = 180; this.costume = 0; this.room = 0;
    this.talkColor = 15; this.talkFrequency = 256; this.talkPan = 64; this.talkVolume = 127;
    this.boxscale = 0xFF; this.scalex = 0xFF; this.scaley = 0xFF; this.charset = 0;
    this.sound = new Int32Array(32);
    this.initFrame = 1; this.walkFrame = 2; this.standFrame = 3; this.talkStartFrame = 4; this.talkStopFrame = 5;
    this.needRedraw = false; this.needBgReset = false; this.visible = false; this.shadowMode = 0; this.flip = false;
    this.frame = 0; this.walkbox = 0; this.animProgress = 0; this.animSpeed = 0; this.drawToBackBuf = false;
    this.animVariable = new Int32Array(27);
    this.targetFacing = 180; this.moving = 0; this.ignoreBoxes = false; this.forceClip = 0; this.ignoreTurns = false; this.layer = 0;
    this.lastValidX = 0; this.lastValidY = 0; this.speedx = 8; this.speedy = 2;
    this.walkdata = { dest: { x: 0, y: 0 }, destbox: 0, destdir: 0, cur: { x: 0, y: 0 }, next: { x: 0, y: 0 }, point3: { x: 32000, y: 0 },
                      curbox: 0, deltaXFactor: 0, deltaYFactor: 0, xfrac: 0, yfrac: 0 };
    this.cost = newCost();
    this.palette = new Uint16Array(256);
    this.walkScript = 0; this.talkScript = 0; this.talkPosX = 0; this.talkPosY = -80; this.costumeNeedsInit = false;
  }
  SCUMM.Actor = Actor;

  Actor.prototype.initActor = function (mode) {
    if (mode === -1) {
      this.top = this.bottom = 0;
      this.needRedraw = false; this.needBgReset = false; this.costumeNeedsInit = false; this.visible = false; this.flip = false;
      this.speedx = 8; this.speedy = 2; this.frame = 0; this.walkbox = 0; this.animProgress = 0; this.drawToBackBuf = false;
      this.animVariable.fill(0); this.palette.fill(0); this.sound.fill(0);
      this.cost.reset();
      var w = this.walkdata;
      w.dest.x = w.dest.y = 0; w.destbox = 0; w.destdir = 0; w.cur.x = w.cur.y = 0; w.next.x = w.next.y = 0; w.point3.x = 32000; w.point3.y = 0;
      w.curbox = 0; w.deltaXFactor = w.deltaYFactor = 0; w.xfrac = w.yfrac = 0;
      this.walkScript = 0;
    }
    if (mode === 1 || mode === -1) { this.costume = 0; this.room = 0; this.pos.x = 0; this.pos.y = 0; this.facing = 180; }
    else if (mode === 2) this.facing = 180;
    this.elevation = 0; this.width = 24; this.talkColor = 15; this.talkPosX = 0; this.talkPosY = -80;
    this.boxscale = this.scaley = this.scalex = 0xFF; this.charset = 0;
    this.sound.fill(0);
    this.targetFacing = this.facing;
    this.lastValidX = 0; this.lastValidY = 0;
    this.shadowMode = 0; this.layer = 0;
    this.stopActorMoving();
    this.setActorWalkSpeed(8, 2);
    this.animSpeed = 0;
    this.ignoreBoxes = false; this.forceClip = 0; this.ignoreTurns = false;
    this.talkFrequency = 256; this.talkPan = 64; this.talkVolume = 127;
    this.initFrame = 1; this.walkFrame = 2; this.standFrame = 3; this.talkStartFrame = 4; this.talkStopFrame = 5;
    this.walkScript = 0; this.talkScript = 0;
    this.vm.classData[this.number] = 0;
  };
  Actor.prototype.isInCurrentRoom = function () { return this.room === this.vm.currentRoom; };
  Actor.prototype.isInClass = function (cls) { return this.vm.getClass(this.number, cls); };
  Actor.prototype.isPlayer = function () { return this.isInClass(C.kObjectClassPlayer); };
  Actor.prototype.classChanged = function (cls, value) {
    if (cls === C.kObjectClassAlwaysClip) this.forceClip = value ? 1 : 0;
    if (cls === C.kObjectClassIgnoreBoxes) this.ignoreBoxes = !!value;
  };
  Actor.prototype.setBox = function (box) { this.walkbox = box; this.setupActorScale(); };
  Actor.prototype.setupActorScale = function () {
    if (this.ignoreBoxes) return;
    this.boxscale = this.vm.getBoxScale(this.walkbox);
    var scale = this.vm.getScale(this.walkbox, this.pos.x, this.pos.y);
    if (scale > 0xFF) throw new Error('bad scale');
    this.scalex = this.scaley = scale & 0xFF;
  };
  Actor.prototype.setElevation = function (e) { if (this.elevation !== e) { this.elevation = e; this.needRedraw = true; } };
  Actor.prototype.setScale = function (sx, sy) { if (sx !== -1) this.scalex = sx; if (sy !== -1) this.scaley = sy; this.needRedraw = true; };
  Actor.prototype.setPalette = function (idx, val) { this.palette[idx] = val; this.needRedraw = true; };
  Actor.prototype.setAnimSpeed = function (s) { this.animSpeed = s; this.animProgress = 0; };

  // -- walking --
  Actor.prototype.stopActorMoving = function () {
    if (this.walkScript) this.vm.stopScript(this.walkScript);
    this.moving = 0;
  };
  Actor.prototype.setActorWalkSpeed = function (newSpeedX, newSpeedY) {
    if (newSpeedX === this.speedx && newSpeedY === this.speedy) return;
    this.speedx = newSpeedX; this.speedy = newSpeedY;
    if (this.moving) this.calcMovementFactor(this.walkdata.next);
  };
  Actor.prototype.calcMovementFactor = function (next) {
    if (this.pos.x === next.x && this.pos.y === next.y) return 0;
    var diffX = next.x - this.pos.x, diffY = next.y - this.pos.y;
    var deltaYFactor = this.speedy << 16;
    if (diffY < 0) deltaYFactor = -deltaYFactor;
    var deltaXFactor = deltaYFactor * diffX;
    if (diffY !== 0) deltaXFactor = cdiv(deltaXFactor, diffY); else deltaYFactor = 0;
    if (abs(cdiv(deltaXFactor, 0x10000)) > this.speedx) {
      deltaXFactor = this.speedx << 16;
      if (diffX < 0) deltaXFactor = -deltaXFactor;
      deltaYFactor = deltaXFactor * diffY;
      if (diffX !== 0) deltaYFactor = cdiv(deltaYFactor, diffX); else deltaXFactor = 0;
    }
    var w = this.walkdata;
    w.xfrac = 0; w.yfrac = 0;
    w.cur.x = this.pos.x; w.cur.y = this.pos.y;
    w.next.x = next.x; w.next.y = next.y;
    w.deltaXFactor = deltaXFactor | 0; w.deltaYFactor = deltaYFactor | 0;
    this.targetFacing = (abs(diffY) * 3 > abs(diffX)) ? (deltaYFactor > 0 ? 180 : 0) : (deltaXFactor > 0 ? 90 : 270);
    return this.actorWalkStep();
  };
  Actor.prototype.actorWalkStep = function () {
    this.needRedraw = true;
    var nextFacing = this.updateActorDirection(true);
    if ((this.walkFrame !== this.frame && !(this.moving & MF_IN_LEG)) || this.facing !== nextFacing) this.startWalkAnim(1, nextFacing);
    this.moving |= MF_IN_LEG;
    var w = this.walkdata;
    if (this.walkbox !== w.curbox && this.vm.checkXYInBoxBounds(w.curbox, this.pos.x, this.pos.y)) this.setBox(w.curbox);
    var distX = abs(w.next.x - w.cur.x), distY = abs(w.next.y - w.cur.y);
    if (abs(this.pos.x - w.cur.x) >= distX && abs(this.pos.y - w.cur.y) >= distY) { this.moving &= ~MF_IN_LEG; return 0; }
    var tmpX = (this.pos.x * 0x10000 + w.xfrac + (w.deltaXFactor >> 8) * this.scalex) | 0;
    w.xfrac = tmpX & 0xFFFF;
    this.pos.x = tmpX >> 16;
    var tmpY = (this.pos.y * 0x10000 + w.yfrac + (w.deltaYFactor >> 8) * this.scaley) | 0;
    w.yfrac = tmpY & 0xFFFF;
    this.pos.y = tmpY >> 16;
    if (abs(this.pos.x - w.cur.x) > distX) this.pos.x = w.next.x;
    if (abs(this.pos.y - w.cur.y) > distY) this.pos.y = w.next.y;
    if (this.pos.x === w.next.x && this.pos.y === w.next.y) { this.moving &= ~MF_IN_LEG; return 0; }
    return 1;
  };
  Actor.prototype.startWalkActor = function (destX, destY, dir) {
    var abr = this.adjustXYToBeInBox(destX, destY), w = this.walkdata;
    if (!this.isInCurrentRoom()) {
      this.pos.x = abr.x; this.pos.y = abr.y;
      if (!this.ignoreTurns && dir !== -1) this.facing = dir;
      return;
    }
    if (this.ignoreBoxes) { abr.box = kInvalidBox; this.walkbox = kInvalidBox; }
    else {
      if (this.vm.checkXYInBoxBounds(w.destbox, abr.x, abr.y)) abr.box = w.destbox;
      else abr = this.adjustXYToBeInBox(abr.x, abr.y);
      if (this.moving && w.destdir === dir && w.dest.x === abr.x && w.dest.y === abr.y) return;
    }
    if (this.pos.x === abr.x && this.pos.y === abr.y) {
      if (dir !== this.facing) this.turnToDirection(dir);
      return;
    }
    w.dest.x = abr.x; w.dest.y = abr.y; w.destbox = abr.box; w.destdir = dir;
    w.point3.x = 32000;
    w.curbox = this.walkbox;
    this.moving = (this.moving & MF_IN_LEG) | MF_NEW_LEG;
  };
  Actor.prototype.startWalkAnim = function (cmd, angle) {
    if (angle === -1) angle = this.facing;
    if (this.walkScript) {
      var args = new Int32Array(C.NUM_SCRIPT_LOCAL);
      args[0] = this.number; args[1] = cmd; args[2] = angle;
      this.vm.runScript(this.walkScript, 1, 0, args);
    } else {
      if (cmd === 3) this.turnToDirection(angle); else this.setDirection(angle);
      if (cmd === 1) this.startAnimActor(this.walkFrame);
      else if (cmd === 3) this.startAnimActor(this.standFrame);
    }
  };
  Actor.prototype.walkActor = function () {
    var w = this.walkdata, newDir, nextBox, foundPath = { x: 0, y: 0 };
    if (!this.moving) return;
    if (!(this.moving & MF_NEW_LEG)) {
      if ((this.moving & MF_IN_LEG) && this.actorWalkStep()) return;
      if (this.moving & MF_LAST_LEG) {
        this.moving = 0;
        this.setBox(w.destbox);
        this.startAnimActor(this.standFrame);
        if (this.targetFacing !== w.destdir) this.turnToDirection(w.destdir);
        return;
      }
      if (this.moving & MF_TURN) {
        newDir = this.updateActorDirection(false);
        if (this.facing !== newDir) this.setDirection(newDir); else this.moving = 0;
        return;
      }
      this.setBox(w.curbox);
      this.moving &= MF_IN_LEG;
    }
    this.moving &= ~MF_NEW_LEG;
    do {
      if (this.walkbox === kInvalidBox) { this.setBox(w.destbox); w.curbox = w.destbox; break; }
      if (this.walkbox === w.destbox) break;
      nextBox = this.vm.getNextBox(this.walkbox, w.destbox);
      if (nextBox < 0) { w.destbox = this.walkbox; this.moving |= MF_LAST_LEG; return; }
      w.curbox = nextBox;
      if (this.findPathTowards(this.walkbox, nextBox, w.destbox, foundPath)) break;
      if (this.calcMovementFactor(foundPath)) return;
      this.setBox(w.curbox);
    } while (true);
    this.moving |= MF_LAST_LEG;
    this.calcMovementFactor(w.dest);
  };
  function swapY(b) { var t = b.ul.y; b.ul.y = b.ur.y; b.ur.y = t; }
  function swapX(b) { var t = b.ul.x; b.ul.x = b.ur.x; b.ur.x = t; }
  function rotBox(b) { var t = b.ul; b.ul = b.ur; b.ur = b.lr; b.lr = b.ll; b.ll = t; }
  Actor.prototype.findPathTowards = function (box1nr, box2nr, box3nr, foundPath) {
    var box1 = this.vm.getBoxCoordinates(box1nr), box2 = this.vm.getBoxCoordinates(box2nr), w = this.walkdata;
    var i, j, flag, q, pos, diffX, diffY, boxDiffX, boxDiffY, t;
    for (i = 0; i < 4; i++) {
      for (j = 0; j < 4; j++) {
        if (box1.ul.x === box1.ur.x && box1.ul.x === box2.ul.x && box1.ul.x === box2.ur.x) {
          flag = 0;
          if (box1.ul.y > box1.ur.y) { swapY(box1); flag |= 1; }
          if (box2.ul.y > box2.ur.y) { swapY(box2); flag |= 2; }
          if (box1.ul.y > box2.ur.y || box2.ul.y > box1.ur.y ||
              ((box1.ur.y === box2.ul.y || box2.ur.y === box1.ul.y) && box1.ul.y !== box1.ur.y && box2.ul.y !== box2.ur.y)) {
            if (flag & 1) swapY(box1);
            if (flag & 2) swapY(box2);
          } else {
            pos = this.pos.y;
            if (box2nr === box3nr) {
              diffX = w.dest.x - this.pos.x; diffY = w.dest.y - this.pos.y; boxDiffX = box1.ul.x - this.pos.x;
              if (diffX !== 0) {
                diffY *= boxDiffX;
                t = cdiv(diffY, diffX);
                if (t === 0 && (diffY <= 0 || diffX <= 0) && (diffY >= 0 || diffX >= 0)) t = -1;
                pos = this.pos.y + t;
              }
            }
            q = pos;
            if (q < box2.ul.y) q = box2.ul.y;
            if (q > box2.ur.y) q = box2.ur.y;
            if (q < box1.ul.y) q = box1.ul.y;
            if (q > box1.ur.y) q = box1.ur.y;
            if (q === pos && box2nr === box3nr) return true;
            foundPath.y = q; foundPath.x = box1.ul.x;
            return false;
          }
        }
        if (box1.ul.y === box1.ur.y && box1.ul.y === box2.ul.y && box1.ul.y === box2.ur.y) {
          flag = 0;
          if (box1.ul.x > box1.ur.x) { swapX(box1); flag |= 1; }
          if (box2.ul.x > box2.ur.x) { swapX(box2); flag |= 2; }
          if (box1.ul.x > box2.ur.x || box2.ul.x > box1.ur.x ||
              ((box1.ur.x === box2.ul.x || box2.ur.x === box1.ul.x) && box1.ul.x !== box1.ur.x && box2.ul.x !== box2.ur.x)) {
            if (flag & 1) swapX(box1);
            if (flag & 2) swapX(box2);
          } else {
            if (box2nr === box3nr) {
              diffX = w.dest.x - this.pos.x; diffY = w.dest.y - this.pos.y; boxDiffY = box1.ul.y - this.pos.y;
              pos = this.pos.x;
              if (diffY !== 0) pos += cdiv(diffX * boxDiffY, diffY);
            } else pos = this.pos.x;
            q = pos;
            if (q < box2.ul.x) q = box2.ul.x;
            if (q > box2.ur.x) q = box2.ur.x;
            if (q < box1.ul.x) q = box1.ul.x;
            if (q > box1.ur.x) q = box1.ur.x;
            if (q === pos && box2nr === box3nr) return true;
            foundPath.x = q; foundPath.y = box1.ul.y;
            return false;
          }
        }
        rotBox(box1);
      }
      rotBox(box2);
    }
    return false;
  };
  Actor.prototype.remapDirection = function (dir, isWalking) {
    var vm = this.vm, specdir, flags, flipX, flipY;
    if (!this.ignoreBoxes) {
      if (this.walkbox !== kOldInvalidBox) {
        specdir = vm.extraBoxFlags[this.walkbox];
        if (specdir) {
          if (specdir & 0x8000) dir = specdir & 0x3FFF;
          else {
            specdir = specdir & 0x3FFF;
            if (specdir - 90 < dir && dir < specdir + 90) dir = specdir; else dir = specdir + 180;
          }
        }
      }
      flags = vm.getBoxFlags(this.walkbox);
      flipX = this.walkdata.deltaXFactor > 0;
      flipY = this.walkdata.deltaYFactor > 0;
      if ((flags & kBoxXFlip) || this.isInClass(C.kObjectClassXFlip)) { dir = 360 - dir; flipX = !flipX; }
      if ((flags & kBoxYFlip) || this.isInClass(C.kObjectClassYFlip)) { dir = 180 - dir; flipY = !flipY; }
      switch (flags & 7) {
        case 1: if (isWalking) return flipX ? 90 : 270; return dir === 90 ? 90 : 270;
        case 2: if (isWalking) return flipY ? 180 : 0; return dir === 0 ? 0 : 180;
        case 3: return 270;
        case 4: return 90;
        case 5: return 0;
        case 6: return 180;
        default: break;
      }
    }
    dir = ((dir % 360) + 360) % 360;
    return dir | 0x400;
  };
  var actorTurnInterpolateTable = [0, 2, 2, 3, 2, 1, 2, 3, 0, 1, 2, 1, 0, 1, 0, 3];
  Actor.prototype.updateActorDirection = function (isWalking) {
    var dir = this.remapDirection(this.targetFacing, isWalking);
    if (dir & 0x400) dir = oldDirToNewDir(actorTurnInterpolateTable[newDirToOldDir(dir & 0x3FF) | (newDirToOldDir(this.facing) << 2)]);
    return dir;
  };
  Actor.prototype.setDirection = function (direction) {
    direction = ((direction % 360) + 360) % 360;
    if (this.facing === direction) return;
    this.facing = direction;
    if (this.costume === 0) return;
    if (!this.isInCurrentRoom()) return;
    var aMask = 0x8000;
    for (var i = 0; i < 16; i++, aMask >>= 1) {
      var vald = this.cost.frame[i];
      if (vald === 0xFFFF) continue;
      if ((vald & 3) === newDirToOldDir(this.facing)) continue;
      vald >>= 2;
      this.vm.costumeLoader.costumeDecodeData(this, vald, aMask);
    }
    this.needRedraw = true;
  };
  Actor.prototype.faceToObject = function (obj) {
    if (!this.isInCurrentRoom()) return;
    var p = this.vm.getObjectOrActorXY(obj);
    if (!p) return;
    this.turnToDirection(p.x > this.pos.x ? 90 : 270);
  };
  Actor.prototype.turnToDirection = function (newdir) {
    if (newdir === -1 || this.ignoreTurns) return;
    this.targetFacing = newdir;
    this.moving = MF_TURN;
  };

  // -- position --
  Actor.prototype.putActor = function (dstX, dstY, newRoom) {
    var vm = this.vm;
    if (this.visible && vm.currentRoom !== newRoom && vm.getTalkingActor() === this.number) vm.stopTalk();
    this.pos.x = dstX; this.pos.y = dstY; this.room = newRoom;
    this.needRedraw = true;
    if (vm.VAR(V.EGO) === this.number) vm.egoPositioned = true;
    if (this.visible) {
      if (this.isInCurrentRoom()) {
        if (this.moving) { this.stopActorMoving(); this.startAnimActor(this.standFrame); }
        this.adjustActorPos();
      } else this.hideActor();
    } else {
      if (this.isInCurrentRoom()) this.showActor();
    }
  };
  Actor.prototype.putActorInRoom = function (room) { this.putActor(this.pos.x, this.pos.y, room); };
  function inBoxQuickReject(box, x, y, threshold) {
    var t = x - threshold;
    if (t > box.ul.x && t > box.ur.x && t > box.lr.x && t > box.ll.x) return true;
    t = x + threshold;
    if (t < box.ul.x && t < box.ur.x && t < box.lr.x && t < box.ll.x) return true;
    t = y - threshold;
    if (t > box.ul.y && t > box.ur.y && t > box.lr.y && t > box.ll.y) return true;
    t = y + threshold;
    if (t < box.ul.y && t < box.ur.y && t < box.lr.y && t < box.ll.y) return true;
    return false;
  }
  var thresholdTable = [30, 80, 0];
  Actor.prototype.adjustXYToBeInBox = function (dstX, dstY) {
    var vm = this.vm, abr = { x: dstX, y: dstY, box: kInvalidBox };
    if (this.ignoreBoxes) return abr;
    for (var tIdx = 0; tIdx < 3; tIdx++) {
      var threshold = thresholdTable[tIdx];
      var numBoxes = vm.getNumBoxes() - 1;
      if (numBoxes < 1) return abr;
      var bestDist = 0xFFFF, bestBox = kInvalidBox;
      for (var box = numBoxes; box >= 1; box--) {
        var flags = vm.getBoxFlags(box);
        if ((flags & kBoxInvisible) && !((flags & kBoxPlayerOnly) && !this.isPlayer())) continue;
        if (threshold > 0 && inBoxQuickReject(vm.getBoxCoordinates(box), dstX, dstY, threshold)) continue;
        if (vm.checkXYInBoxBounds(box, dstX, dstY)) {
          this.lastValidX = dstX; this.lastValidY = dstY;
          abr.x = dstX; abr.y = dstY; abr.box = box;
          return abr;
        }
        var r = vm.getClosestPtOnBox(vm.getBoxCoordinates(box), dstX, dstY);
        if (r.dist < bestDist) {
          this.lastValidX = r.x; this.lastValidY = r.y;
          abr.x = r.x; abr.y = r.y;
          if (r.dist === 0) { abr.box = box; return abr; }
          bestDist = r.dist; bestBox = box;
        }
      }
      if (threshold === 0 || threshold * threshold >= bestDist) { abr.box = bestBox; return abr; }
    }
    return abr;
  };
  Actor.prototype.adjustActorPos = function () {
    var abr = this.adjustXYToBeInBox(this.pos.x, this.pos.y);
    this.pos.x = abr.x; this.pos.y = abr.y;
    this.walkdata.destbox = abr.box;
    this.setBox(abr.box);
    this.walkdata.dest.x = -1;
    this.stopActorMoving();
    this.cost.soundCounter = 0; this.cost.soundPos = 0;
    if (this.walkbox !== kInvalidBox) {
      var flags = this.vm.getBoxFlags(this.walkbox);
      if (flags & 7) this.turnToDirection(this.facing);
    }
  };
  Actor.prototype.hideActor = function () {
    if (!this.visible) return;
    if (this.moving) { this.stopActorMoving(); this.startAnimActor(this.standFrame); }
    this.visible = false;
    this.cost.soundCounter = 0; this.cost.soundPos = 0;
    this.needRedraw = false; this.needBgReset = true;
  };
  Actor.prototype.showActor = function () {
    if (this.vm.currentRoom === 0 || this.visible) return;
    this.adjustActorPos();
    if (this.costumeNeedsInit) { this.startAnimActor(this.initFrame); this.costumeNeedsInit = false; }
    this.stopActorMoving();
    this.visible = true;
    this.needRedraw = true;
  };

  // -- animation --
  Actor.prototype.startAnimActor = function (f) {
    switch (f) {
      case CHORE_REDIRECT_INIT: f = this.initFrame; break;
      case CHORE_REDIRECT_WALK: f = this.walkFrame; break;
      case CHORE_REDIRECT_STAND: f = this.standFrame; break;
      case CHORE_REDIRECT_START_TALK: f = this.talkStartFrame; break;
      case CHORE_REDIRECT_STOP_TALK: f = this.talkStopFrame; break;
      default: break;
    }
    if (f === 0x3E) throw new Error('startAnimActor: frame 0x3E');
    if (this.isInCurrentRoom() && this.costume !== 0) {
      this.animProgress = 0;
      this.needRedraw = true;
      this.cost.animCounter = 0;
      if (f === this.initFrame) this.cost.reset();
      this.vm.costumeLoader.costumeDecodeData(this, f, 0xFFFFFFFF);
      this.frame = f;
    }
  };
  Actor.prototype.animateActor = function (anim) {
    var chore = anim >> 2, dir = oldDirToNewDir(anim & 3);
    chore = 0x3F - chore + 2;
    switch (chore) {
      case 2: if (this.isInCurrentRoom()) { this.startAnimActor(this.standFrame); this.stopActorMoving(); } break;
      case 3: if (this.isInCurrentRoom()) this.moving &= ~MF_TURN; this.setDirection(dir); break;
      case 4: if (this.isInCurrentRoom()) this.turnToDirection(dir); break;
      default: this.startAnimActor(anim);
    }
  };
  Actor.prototype.animateCostume = function () {
    if (this.costume === 0) return;
    this.animProgress++;
    if (this.animProgress >= this.animSpeed) {
      this.animProgress = 0;
      this.vm.costumeLoader.loadCostume(this.costume);
      if (this.vm.costumeLoader.increaseAnims(this)) this.needRedraw = true;
    }
  };
  Actor.prototype.runActorTalkScript = function (f) {
    var vm = this.vm;
    if (!vm.getTalkingActor() || this.room !== vm.currentRoom || this.frame === f) return;
    if (this.talkScript) {
      var args = new Int32Array(C.NUM_SCRIPT_LOCAL);
      args[0] = this.number; args[1] = f;
      vm.runScript(this.talkScript, 1, 0, args);
    } else this.startAnimActor(f);
  };
  Actor.prototype.setActorCostume = function (c) {
    this.costumeNeedsInit = true;
    if (this.visible) { this.hideActor(); this.cost.reset(); this.costume = c; this.showActor(); }
    else { this.costume = c; this.cost.reset(); }
    for (var i = 0; i < 32; i++) this.palette[i] = 0xFF;
  };
  Actor.prototype.drawActorCostume = function () {
    if (this.costume === 0) return;
    if (!this.needRedraw) return;
    this.needRedraw = false;
    this.setupActorScale();
    var bcr = this.vm.costumeRenderer;
    this.prepareDrawActorCostume(bcr);
    if (bcr.drawCostume(this.vm.virtscr[kMain], this.vm.numStrips, this, this.drawToBackBuf) & 1) this.needRedraw = true;
    this.top = bcr.drawTop; this.bottom = bcr.drawBottom;
  };
  Actor.prototype.prepareDrawActorCostume = function (bcr) {
    var vm = this.vm;
    bcr.actorID = this.number;
    bcr.actorX = this.pos.x - vm.virtscr[kMain].xstart;
    bcr.actorY = this.pos.y - this.elevation;
    bcr.scaleX = this.scalex; bcr.scaleY = this.scaley;
    bcr.shadowMode = this.shadowMode;
    bcr.shadowTable = vm.shadowPalette;
    bcr.setCostume(this.costume);
    bcr.setPalette(this.palette);
    bcr.setFacing(this);
    if (this.forceClip) bcr.zbuf = this.forceClip;
    else if (this.isInClass(C.kObjectClassNeverClip)) bcr.zbuf = 0;
    else {
      bcr.zbuf = vm.getMaskFromBox(this.walkbox);
      if (bcr.zbuf > vm.numZBuffer - 1) bcr.zbuf = vm.numZBuffer - 1;
    }
    bcr.drawTop = 0x7FFFFFFF; bcr.drawBottom = 0;
  };

  // ---- costume loader (ClassicCostumeLoader) ----
  function CostumeLoader(vm) {
    this.vm = vm; this.id = -1; this.baseptr = 0; this.animCmds = 0; this.frameOffsets = 0; this.palette = 0; this.dataOffsets = 0;
    this.numColors = 0; this.numAnim = 0; this.format = 0; this.mirror = false;
  }
  CostumeLoader.prototype.loadCostume = function (id) {
    var vm = this.vm, d = vm.d;
    if (this.id === id) return;
    this.id = id;
    var ptr = vm.costumePtr(id);
    if (ptr < 0) throw new Error('costume ' + id + ' not found');
    ptr += 2;
    this.baseptr = ptr;
    this.numAnim = d[ptr + 6];
    this.format = d[ptr + 7] & 0x7F;
    this.mirror = (d[ptr + 7] & 0x80) !== 0;
    this.palette = ptr + 8;
    switch (this.format) {
      case 0x58: this.numColors = 16; break;
      case 0x59: this.numColors = 32; break;
      case 0x60: this.numColors = 16; break;
      case 0x61: this.numColors = 32; break;
      default: throw new Error('Costume ' + id + ' with format 0x' + this.format.toString(16) + ' is invalid');
    }
    ptr += 8 + this.numColors;
    this.frameOffsets = ptr + 2;
    this.dataOffsets = ptr + 34;
    this.animCmds = this.baseptr + vm.le16(ptr);
  };
  CostumeLoader.prototype.costumeDecodeData = function (a, frame, usemask) {
    var vm = this.vm, d = vm.d;
    this.loadCostume(a.costume);
    var anim = newDirToOldDir(a.facing) + frame * 4;
    if (anim > this.numAnim) return;
    var r = this.baseptr + vm.le16(this.dataOffsets + anim * 2);
    if (r === this.baseptr) return;
    var mask = vm.le16(r); r += 2;
    var i = 0, j, extra, cmd;
    usemask = usemask >>> 0;
    do {
      if (mask & 0x8000) {
        j = vm.le16(r); r += 2;
        if (usemask & 0x8000) {
          if (j === 0xFFFF) { a.cost.curpos[i] = 0xFFFF; a.cost.start[i] = 0; a.cost.frame[i] = anim; }
          else {
            extra = d[r++];
            cmd = d[this.animCmds + j];
            if (cmd === 0x7A) a.cost.stopped &= ~(1 << i);
            else if (cmd === 0x79) a.cost.stopped |= (1 << i);
            else {
              a.cost.curpos[i] = a.cost.start[i] = j;
              a.cost.end[i] = j + (extra & 0x7F);
              if (extra & 0x80) a.cost.curpos[i] |= 0x8000;
              a.cost.frame[i] = anim;
            }
          }
        } else {
          if (j !== 0xFFFF) r++;
        }
      }
      i++;
      usemask = (usemask << 1) >>> 0;
      mask = (mask << 1) & 0xFFFF;
    } while (mask);
  };
  CostumeLoader.prototype.increaseAnims = function (a) {
    var r = false;
    for (var i = 0; i !== 16; i++) if (a.cost.curpos[i] !== 0xFFFF) r = this.increaseAnim(a, i) || r;
    return r;
  };
  CostumeLoader.prototype.increaseAnim = function (a, slot) {
    var d = this.vm.d, cost = a.cost;
    if (cost.curpos[slot] === 0xFFFF) return false;
    var highflag = cost.curpos[slot] & 0x8000, i = cost.curpos[slot] & 0x7FFF, end = cost.end[slot];
    var code = d[this.animCmds + i] & 0x7F, nc;
    do {
      if (!highflag) { if (i++ >= end) i = cost.start[slot]; }
      else { if (i !== end) i++; }
      nc = d[this.animCmds + i];
      if (nc === 0x7C) {
        cost.animCounter++;
        if (cost.start[slot] !== end) continue;
      } else {
        if (nc === 0x78) {
          cost.soundCounter++;
          if (cost.start[slot] !== end) continue;
        }
      }
      cost.curpos[slot] = i | highflag;
      return (d[this.animCmds + i] & 0x7F) !== code;
    } while (true);
  };
  SCUMM.CostumeLoader = CostumeLoader;

  // ---- costume renderer (ClassicCostumeRenderer) ----
  function CostumeRenderer(vm) {
    this.vm = vm;
    this.loaded = new CostumeLoader(vm);
    this.actorID = 0; this.shadowMode = 0; this.shadowTable = null; this.actorX = 0; this.actorY = 0; this.zbuf = 0;
    this.scaleX = 0; this.scaleY = 0; this.drawTop = 0; this.drawBottom = 0;
    this.palette = new Uint8Array(256);
    this.srcPtr = 0; this.xMove = 0; this.yMove = 0; this.mirror = false; this.width = 0; this.height = 0;
    this.scaleIndexX = 0; this.scaleIndexY = 0; this.numStrips = -1;
    this.out = { pixels: null, base: 0, pitch: 0, w: 0, h: 0 };
  }
  CostumeRenderer.prototype.setCostume = function (costume) { this.loaded.loadCostume(costume); };
  CostumeRenderer.prototype.setFacing = function (a) { this.mirror = newDirToOldDir(a.facing) !== 0 || this.loaded.mirror; };
  CostumeRenderer.prototype.setPalette = function (palette) {
    var d = this.vm.d, L = this.loaded;
    if (this.vm.getCurrentLights() & LIGHTMODE_actor_use_colors) {
      for (var i = 0; i < L.numColors; i++) {
        var color = palette[i];
        if (color === 255) color = d[L.palette + i];
        this.palette[i] = color;
      }
    } else {
      this.palette.fill(8, 0, L.numColors);
      this.palette[12] = 0;
    }
  };
  CostumeRenderer.prototype.drawCostume = function (vs, numStrips, a, drawToBackBuf) {
    var result = 0, xs = this.vm.virtscr[kMain].xstart;
    this.out.pixels = drawToBackBuf ? vs.backBuf : vs.pixels;
    this.out.pitch = vs.pitch; this.out.h = vs.h;
    this.actorX += xs & 7;
    this.out.w = vs.pitch;
    this.out.base = xs - (xs & 7);
    this.numStrips = numStrips;
    this.xMove = this.yMove = 0;
    for (var i = 0; i < 16; i++) result |= this.drawLimb(a, i);
    return result;
  };
  CostumeRenderer.prototype.drawLimb = function (a, limb) {
    var vm = this.vm, d = vm.d, cost = a.cost, L = this.loaded;
    if (cost.curpos[limb] === 0xFFFF || (cost.stopped & (1 << limb))) return 0;
    var i = cost.curpos[limb] & 0x7FFF;
    var baseptr = L.baseptr;
    var frameptr = baseptr + vm.le16(L.frameOffsets + limb * 2);
    var code = d[L.animCmds + i] & 0x7F;
    if (code !== 0x7B) {
      this.srcPtr = baseptr + vm.le16(frameptr + code * 2);
      var p = this.srcPtr;
      this.width = vm.le16(p); this.height = vm.le16(p + 2);
      var xmoveCur = this.xMove + s16(vm.le16(p + 4)), ymoveCur = this.yMove + s16(vm.le16(p + 6));
      this.xMove += s16(vm.le16(p + 8));
      this.yMove -= s16(vm.le16(p + 10));
      this.srcPtr += 12;
      return this.mainRoutine(xmoveCur, ymoveCur);
    }
    return 0;
  };
  CostumeRenderer.prototype.mainRoutine = function (xmoveCur, ymoveCur) {
    var vm = this.vm, d = vm.d, L = this.loaded, out = this.out;
    var i, skip = 0, drawFlag = 1, startScaleIndexX, step;
    var rect = { left: 0, top: 0, right: 0, bottom: 0 };
    var scaletableSize = 128;
    var cd = { x: 0, y: 0, scaleTable: smallCostumeScaleTable, height: 0, width: 0, skipWidth: 0, destOff: 0, maskOff: 0, scaleXStep: 0,
               mask: 0, shr: 0, repColor: 0, repLen: 0 };
    if (L.numColors === 32) { cd.mask = 7; cd.shr = 3; } else { cd.mask = 15; cd.shr = 4; }
    if (L.format === 0x60 || L.format === 0x61) {
      var ex1 = d[this.srcPtr], ex2 = d[this.srcPtr + 1];
      this.srcPtr += 2;
      if (ex1 !== 0xFF || ex2 !== 0xFF) {
        ex1 = vm.le16(L.frameOffsets + ex1 * 2);
        this.srcPtr = L.baseptr + vm.le16(L.baseptr + ex1 + ex2 * 2) + 14;
      }
    }
    var useScaling = (this.scaleX !== 0xFF) || (this.scaleY !== 0xFF);
    cd.x = this.actorX; cd.y = this.actorY;
    if (useScaling) {
      cd.scaleXStep = -1;
      if (xmoveCur < 0) { xmoveCur = -xmoveCur; cd.scaleXStep = 1; }
      if (this.mirror) {
        startScaleIndexX = this.scaleIndexX = (scaletableSize - xmoveCur) & 0xFF;
        for (i = 0; i < xmoveCur; i++) {
          if (cd.scaleTable[this.scaleIndexX] < this.scaleX) cd.x -= cd.scaleXStep;
          this.scaleIndexX = (this.scaleIndexX + 1) & 0xFF;
        }
        rect.left = rect.right = cd.x;
        this.scaleIndexX = startScaleIndexX;
        for (i = 0; i < this.width; i++) {
          if (rect.right < 0) { skip++; startScaleIndexX = this.scaleIndexX; }
          if (cd.scaleTable[this.scaleIndexX] < this.scaleX) rect.right++;
          this.scaleIndexX = (this.scaleIndexX + 1) & 0xFF;
        }
      } else {
        startScaleIndexX = this.scaleIndexX = (xmoveCur + scaletableSize) & 0xFF;
        for (i = 0; i < xmoveCur; i++) {
          if (cd.scaleTable[this.scaleIndexX] < this.scaleX) cd.x += cd.scaleXStep;
          this.scaleIndexX = (this.scaleIndexX - 1) & 0xFF;
        }
        rect.left = rect.right = cd.x;
        this.scaleIndexX = startScaleIndexX;
        for (i = 0; i < this.width; i++) {
          if (rect.left >= out.w) { startScaleIndexX = this.scaleIndexX; skip++; }
          if (cd.scaleTable[this.scaleIndexX] < this.scaleX) rect.left--;
          this.scaleIndexX = (this.scaleIndexX - 1) & 0xFF;
        }
      }
      this.scaleIndexX = startScaleIndexX;
      if (skip) skip--;
      step = -1;
      if (ymoveCur < 0) { ymoveCur = -ymoveCur; step = 1; }
      this.scaleIndexY = (scaletableSize - ymoveCur) & 0xFF;
      for (i = 0; i < ymoveCur; i++) {
        if (cd.scaleTable[this.scaleIndexY] < this.scaleY) cd.y -= step;
        this.scaleIndexY = (this.scaleIndexY + 1) & 0xFF;
      }
      rect.top = rect.bottom = cd.y;
      this.scaleIndexY = (scaletableSize - ymoveCur) & 0xFF;
      for (i = 0; i < this.height; i++) {
        if (cd.scaleTable[this.scaleIndexY] < this.scaleY) rect.bottom++;
        this.scaleIndexY = (this.scaleIndexY + 1) & 0xFF;
      }
      this.scaleIndexY = (scaletableSize - ymoveCur) & 0xFF;
    } else {
      if (!this.mirror) xmoveCur = -xmoveCur;
      cd.x += xmoveCur; cd.y += ymoveCur;
      if (this.mirror) { rect.left = cd.x; rect.right = cd.x + this.width; }
      else { rect.left = cd.x - this.width; rect.right = cd.x; }
      rect.top = cd.y; rect.bottom = rect.top + this.height;
    }
    cd.skipWidth = this.width;
    cd.scaleXStep = this.mirror ? 1 : -1;
    vm.markRectAsDirty(kMain, rect.left, rect.right + 1, rect.top, rect.bottom, this.actorID);
    if (rect.top >= out.h || rect.bottom <= 0) return 0;
    if (rect.left >= out.w || rect.right <= 0) return 0;
    cd.repLen = 0;
    if (this.mirror) {
      if (!useScaling) skip = -cd.x;
      if (skip > 0) { cd.skipWidth -= skip; this.skipCelLines(cd, skip); cd.x = 0; }
      else { skip = rect.right - out.w; if (skip <= 0) drawFlag = 2; else cd.skipWidth -= skip; }
    } else {
      if (!useScaling) skip = rect.right - out.w;
      if (skip > 0) { cd.skipWidth -= skip; this.skipCelLines(cd, skip); cd.x = out.w - 1; }
      else { skip = -1 - rect.left; if (skip <= 0) drawFlag = 2; else cd.skipWidth -= skip; }
    }
    if (cd.skipWidth <= 0) return 0;
    if (rect.left < 0) rect.left = 0;
    if (rect.top < 0) rect.top = 0;
    if (rect.top > out.h) rect.top = out.h;
    if (rect.bottom > out.h) rect.bottom = out.h;
    if (this.drawTop > rect.top) this.drawTop = rect.top;
    if (this.drawBottom < rect.bottom) this.drawBottom = rect.bottom;
    if (this.height + rect.top >= 256) return 2;
    cd.width = out.w; cd.height = out.h;
    cd.destOff = out.base + cd.y * out.pitch + cd.x;
    cd.maskOff = vm.getMaskBufferOffset(0, cd.y, this.zbuf);
    this.proc3(cd);
    return drawFlag;
  };
  CostumeRenderer.prototype.skipCelLines = function (cd, num) {
    var d = this.vm.d;
    num *= this.height;
    do {
      cd.repLen = d[this.srcPtr++];
      cd.repColor = cd.repLen >> cd.shr;
      cd.repLen &= cd.mask;
      if (!cd.repLen) cd.repLen = d[this.srcPtr++];
      do { if (!--num) return; } while (--cd.repLen);
    } while (true);
  };
  CostumeRenderer.prototype.proc3 = function (cd) {
    var d = this.vm.d, mb = this.vm.maskBuf, out = this.out, pixels = out.pixels, pitch = out.pitch;
    var y = cd.y, src = this.srcPtr, dst = cd.destOff, len = cd.repLen, color = cd.repColor, height = this.height;
    var scaleIndexY = this.scaleIndexY, maskbit = 0x80 >> (cd.x & 7), mask = cd.maskOff + (cd.x >> 3);
    var masked, pcolor, startPos = len !== 0;
    var shadowTable = this.shadowTable, palette = this.palette, numStrips = this.numStrips, scaleTable = cd.scaleTable;
    var scaleX = this.scaleX, scaleY = this.scaleY, shadowMode = this.shadowMode, H = this.height, outH = out.h, outW = out.w;
    for (;;) {
      if (!startPos) {
        len = d[src++];
        color = len >> cd.shr;
        len &= cd.mask;
        if (!len) len = d[src++];
      }
      do {
        if (startPos) { startPos = false; }
        else {
          if (scaleY === 255 || scaleTable[scaleIndexY] < scaleY) {
            if (scaleY !== 255) scaleIndexY = (scaleIndexY + 1) & 0xFF;
            masked = (y < 0 || y >= outH) || (cd.x < 0 || cd.x >= outW) || ((mb[mask] & maskbit) !== 0);
            if (color && !masked) {
              if (shadowMode & 0x20) pcolor = shadowTable[pixels[dst]];
              else { pcolor = palette[color]; if (pcolor === 13 && shadowTable) pcolor = shadowTable[pixels[dst]]; }
              pixels[dst] = pcolor;
            }
            dst += pitch;
            mask += numStrips;
            y++;
          } else if (scaleY !== 255) scaleIndexY = (scaleIndexY + 1) & 0xFF;
          if (!--height) {
            if (!--cd.skipWidth) { this.scaleIndexX = this.scaleIndexX; return; }
            height = H;
            y = cd.y;
            scaleIndexY = this.scaleIndexY;
            if (scaleX === 255 || scaleTable[this.scaleIndexX] < scaleX) {
              cd.x += cd.scaleXStep;
              if (cd.x < 0 || cd.x >= outW) return;
              maskbit = 0x80 >> (cd.x & 7);
              cd.destOff += cd.scaleXStep;
            }
            this.scaleIndexX = (this.scaleIndexX + cd.scaleXStep) & 0xFF;
            dst = cd.destOff;
            mask = cd.maskOff + (cd.x >> 3);
          }
        }
        len = (len - 1) & 0xFF;
      } while (len);
    }
  };
  SCUMM.CostumeRenderer = CostumeRenderer;

  // ---- engine side ----
  P.initActors = function () {
    this.actors = [];
    for (var i = 0; i < this.numActors; i++) this.actors.push(new Actor(this, i));
    this.costumeLoader = new CostumeLoader(this);
    this.costumeRenderer = new CostumeRenderer(this);
    this.sortedActors = [];
  };
  P.createActors = function () {
    for (var i = 0; i < this.numActors; i++) { this.actors[i] = new Actor(this, i); this.actors[i].initActor(-1); }
    this.costumeLoader.id = -1; this.costumeRenderer.loaded.id = -1;
  };
  P.isValidActor = function (id) { return id >= 0 && id < this.numActors && this.actors[id].number === id; };
  P.derefActor = function (id, msg) {
    if (!this.isValidActor(id)) throw new Error('Invalid actor ' + id + (msg ? ' in ' + msg : ''));
    return this.actors[id];
  };
  P.walkActors = function () {
    for (var i = 1; i < this.numActors; ++i) if (this.actors[i].isInCurrentRoom()) this.actors[i].walkActor();
  };
  P.showActors = function () {
    for (var i = 1; i < this.numActors; i++) if (this.actors[i].isInCurrentRoom()) this.actors[i].showActor();
  };
  P.playActorSounds = function () {
    for (var i = 1; i < this.numActors; i++) {
      var a = this.actors[i];
      if (a.cost.soundCounter && a.isInCurrentRoom()) {
        this.currentScript = 0xFF;
        if (!this.fastMode) this.sound.startSound(a.sound[0]);
        for (var j = 1; j < this.numActors; j++) this.actors[j].cost.soundCounter = 0;
        return;
      }
    }
  };
  P.getActorFromPos = function (x, y) {
    if (!this.testGfxAnyUsageBits(x >> 3)) return 0;
    for (var i = 1; i < this.numActors; i++) {
      var a = this.actors[i];
      if (this.testGfxUsageBit(x >> 3, i) && !this.getClass(i, C.kObjectClassUntouchable) && y >= a.top && y <= a.bottom) return i;
    }
    return 0;
  };
  P.processActors = function () {
    var sorted = this.sortedActors, n = 0, i, j;
    sorted.length = 0;
    for (i = 1; i < this.numActors; i++) if (this.actors[i].isInCurrentRoom()) sorted.push(this.actors[i]);
    n = sorted.length;
    if (!n) return;
    for (j = 0; j < n; ++j) {
      for (i = 0; i < n; ++i) {
        var s1 = sorted[j].pos.y - sorted[j].layer * 2000, s2 = sorted[i].pos.y - sorted[i].layer * 2000;
        if (s1 < s2) { var t = sorted[i]; sorted[i] = sorted[j]; sorted[j] = t; }
      }
    }
    for (i = 0; i < n; i++) {
      var a = sorted[i];
      if (a.costume) { a.drawActorCostume(); a.animateCostume(); }
    }
  };
  P.setActorRedrawFlags = function () {
    var j;
    if (this.fullRedraw) { for (j = 1; j < this.numActors; j++) this.actors[j].needRedraw = true; }
    else {
      for (var i = 0; i < this.numStrips; i++) {
        var strip = this.screenStartStrip + i;
        if (this.testGfxAnyUsageBits(strip)) {
          for (j = 1; j < this.numActors; j++) {
            if (this.testGfxUsageBit(strip, j) && this.testGfxOtherUsageBits(strip, j)) this.actors[j].needRedraw = true;
          }
        }
      }
    }
  };
  P.resetActorBgs = function () {
    for (var i = 0; i < this.numStrips; i++) {
      var strip = this.screenStartStrip + i;
      this.clearGfxUsageBit(strip, C.USAGE_BIT_DIRTY);
      this.clearGfxUsageBit(strip, C.USAGE_BIT_RESTORED);
      for (var j = 1; j < this.numActors; j++) {
        var a = this.actors[j];
        if (this.testGfxUsageBit(strip, j) && ((a.top !== 0x7FFFFFFF && a.needRedraw) || a.needBgReset)) {
          this.clearGfxUsageBit(strip, j);
          if ((a.bottom - a.top) >= 0) this.resetBackground(a.top, a.bottom, i);
        }
      }
    }
    for (i = 1; i < this.numActors; i++) this.actors[i].needBgReset = false;
  };
  // putClass hook: classes that change actor behaviour (ScummVM: version <= 4 only, kept for parity of the data)
  P.actorClassChanged = function (obj, cls, set) {
    if (obj >= 1 && obj < this.numActors) this.actors[obj].classChanged(cls, set);
  };
})();

if (typeof module !== 'undefined') module.exports = SCUMM;
