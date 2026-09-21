// hunt.js — the hunting screen, rebuilt from the machine code the game keeps in the
// Apple II's language card (the & HUNT command).  The hunter walks and turns in eight
// directions; up to two animals at a time wander in from the sides; a shot is one bullet
// that flies until it hits something; the whole thing lasts 2,500 turns of the machine's
// loop.  Sizes, speeds, meat, spawn odds and the obstacles for each stretch of the trail
// are the original's.
var Hunt = (function () {
  'use strict';
  var W = 280, H = 192;
  var DX = [2, 2, 0, -2, -2, -2, 0, 2], DY = [0, -1, -1, -1, 0, 1, 1, 1];                 // E006/E016: a step or a bullet, by direction (E, NE, N, NW, W, SW, S, SE)
  var MUZZLE_X = [21, 19, 13, 0, -2, -2, 7, 21], MUZZLE_Y = [10, 0, 0, 0, 10, 15, 19, 15];   // E026/E036: where the bullet leaves the rifle
  var HUNTER_IMG = [0x87, 0x84, 0x01, 0x04, 0x07, 0x0A, 0x0D, 0x8A];                     // E03E: base image by direction, bit 7 = mirrored
  var WALK_FRAME = [0, 1, 0, 2];                                                         // E046
  // E068: the six kinds of animal — how many loop turns between moves (plus a random extra), and the meat
  var KINDS = [
    { name: 'deer', delay: 100, extra: 0, meat: 40 }, { name: 'bear', delay: 200, extra: 0, meat: 200 }, { name: 'buffalo', delay: 164, extra: 6, meat: 300 },
    { name: 'antelope', delay: 120, extra: 0, meat: 30 }, { name: 'rabbit', delay: 2, extra: 0, meat: 8 }, { name: 'squirrel', delay: 3, extra: 0, meat: 4 }];
  // E04A: which obstacles grow where (image numbers in the THINGS library: 7-9 trees, 10-12 pines, 13-15 bushes, 16-18 cacti, 19-21 rocks)
  var ZONE_THINGS = [[7, 8, 7, 9, 7, 8], [9, 13, 14, 15, 13, 14], [15, 13, 14, 15, 10, 11], [12, 19, 20, 21, 16, 17], [18, 19, 20, 21, 10, 11]];
  var CLOCK = 2500;

  function rnd(n) { return Math.floor(Math.random() * n); }
  function overlap(a, b) { return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y1 > b.y2 || a.y2 < b.y1); }   // E4BB

  function Hunt(screen, libs, params) {
    this.screen = screen; this.libs = libs; this.bullets = params.bullets; this.kills = []; this.done = false;
    var self = this;
    this.hunterImg = function (n) { return libs.HUNTER.get(n); };
    // which kinds may appear: antelope, rabbit and squirrel always; deer, bear and buffalo by the stretch of trail
    this.kindsHere = [3, 4, 5];
    if (params.deer) this.kindsHere.push(0);
    if (params.bear) this.kindsHere.push(1);
    if (params.buffalo) this.kindsHere.push(2);
    this.spawnOdds = 2;                                        // the spawn test passes when the low byte of a random 0..999 is below this
    this.zone = Math.min(4, params.zone || 0);
    // the hunter (E626): a random spot, facing a random way
    var hi = this.hunterImg(1);
    this.hw = hi.px; this.hh = hi.h;
    this.hx = rnd(W - this.hw); this.hy = rnd(H - this.hh);
    this.dir = rnd(8); this.walking = false; this.walkFrame = 0; this.walkSpeed = 8; this.turnSteps = 0; this.turnDelta = 0;
    this.tA = 3; this.tB = 8; this.clock = CLOCK; this.keys = [];
    this.bullet = null; this.dead = []; this.animals = [null, null]; this.countdown = [rnd(7) | 1, rnd(7) | 1];
    // obstacles (E2A7): four to seven, placed on even byte columns, never overlapping anything
    this.things = [];
    var n = rnd(4) + 4, table = ZONE_THINGS[this.zone];
    for (var i = 0; i < n; i++) {
      var img = libs.THINGS.get(table[rnd(6)]);
      for (var tries = 0; tries < 50; tries++) {
        var cols = Math.floor((W - img.px) / 14), x = rnd(cols) * 14, y = rnd(H - img.h);
        var box = { x1: x, y1: y, x2: x + img.px - 1, y2: y + img.h - 1 };
        if (!this.hitAnything(box, null)) { this.things.push({ img: img, x: x, y: y, x1: x, y1: y, x2: box.x2, y2: box.y2 }); break; }
      }
    }
  }
  Hunt.prototype.hunterBox = function () { return { x1: this.hx, y1: this.hy, x2: this.hx + this.hw - 1, y2: this.hy + this.hh - 1 }; };
  // E39D: what a box touches — the hunter, an obstacle, a live animal or a dead one
  Hunt.prototype.hitAnything = function (box, ignoreAnimal) {
    if (ignoreAnimal !== 'hunter' && overlap(box, this.hunterBox())) return { what: 'hunter' };
    for (var i = 0; i < this.things.length; i++) if (overlap(box, this.things[i])) return { what: 'thing', obj: this.things[i] };
    for (i = 0; i < 2; i++) { var a = this.animals[i]; if (a && a !== ignoreAnimal && overlap(box, a)) return { what: 'animal', obj: a, slot: i }; }
    for (i = 0; i < this.dead.length; i++) if (overlap(box, this.dead[i])) return { what: 'dead', obj: this.dead[i] };
    return null;
  };
  Hunt.prototype.inBounds = function (box) { return box.x1 >= 0 && box.x2 < W && box.y1 >= 0 && box.y2 < H; };   // E26D
  // input: keys are queued and read one at a time every three turns, like the Apple's keyboard
  Hunt.prototype.key = function (k) { if (this.keys.length < 4) this.keys.push(k); };
  Hunt.prototype.handleKey = function (k) {
    if (k === 'fire') { if (!this.bullet && this.bullets > 0) this.fire(); return; }
    if (k === 'walk') { this.walking = !this.walking; if (this.walking) { this.walkFrame = 0; this.walkSpeed = 8; } return; }
    if (k === 'left') { this.turnSteps = 1; this.turnDelta = 1; return; }
    if (k === 'right') { this.turnSteps = 1; this.turnDelta = -1; return; }
    if (typeof k === 'number') {                                                          // ECC8: aim straight at a direction, the short way round
      var diff = k - this.dir, delta = 1;
      if (diff === 0) { if (this.walking) { this.walkSpeed -= 2; if (this.walkSpeed < 4) this.walkSpeed = 4; } return; }
      if (diff < 0) { diff = -diff; delta = -1; }
      if (diff >= 5) { diff = 8 - diff; delta = -delta; }
      this.turnSteps = diff; this.turnDelta = delta;
    }
  };
  Hunt.prototype.fire = function () {                                                     // E6F3
    this.bullets--;
    this.bullet = { x: this.hx + MUZZLE_X[this.dir], y: this.hy + MUZZLE_Y[this.dir], dir: this.dir };
  };
  Hunt.prototype.tick = function () {
    if (this.done) return true;
    if (--this.tA === 0) {                                                                // EB5C: a key, then one step of any pending turn
      if (this.keys.length) this.handleKey(this.keys.shift());
      if (this.turnSteps) { this.dir = (this.dir + this.turnDelta) & 7; this.turnSteps--; }
      this.tA = 3;
    }
    if (--this.tB === 0) {                                                                // EB7C: a step of walking
      this.tB = this.walkSpeed;
      if (this.walking) {
        this.walkFrame = (this.walkFrame + 1) & 3;
        var nx = this.hx + DX[this.dir], ny = this.hy + DY[this.dir], box = { x1: nx, y1: ny, x2: nx + this.hw - 1, y2: ny + this.hh - 1 };
        if (!this.inBounds(box) || this.hitAnything(box, 'hunter')) { this.walking = false; this.walkFrame = 0; this.walkSpeed = 8; }
        else { this.hx = nx; this.hy = ny; }
      }
    }
    if (this.bullet) this.bulletStep();
    for (var s = 0; s < 2; s++) {
      if (--this.countdown[s] === 0) { if (this.animals[s]) this.moveAnimal(s); else this.spawn(s); }
    }
    if (--this.clock === 0) this.done = true;
    return this.done;
  };
  Hunt.prototype.spawn = function (s) {                                                   // E150
    if (this.dead.length >= 4 || rnd(1000) % 256 >= this.spawnOdds) { this.countdown[s] = rnd(7) | 1; return; }
    var kind = this.kindsHere[rnd(this.kindsHere.length)], K = KINDS[kind], img = this.libs.ANIMALS.get(kind * 3 + 1);
    var delay = K.delay + rnd(K.extra + 1);
    for (var tries = 0; tries < 20; tries++) {
      var fromRight = (rnd(100) & 1) === 0, x, vx, flip;
      if (fromRight) { x = W; vx = -4; flip = true; } else { x = -img.px; vx = 4; flip = false; }
      var vy = rnd(5) - 2, range = (192 - (vy < 0 ? K.delay : K.extra)) & 0xFF, y = rnd(range || 1);
      var a = { kind: kind, img: img, x: x, y: y, vx: vx, vy: vy, flip: flip, frame: 0, delay: delay, x1: x, y1: y, x2: x + img.px - 1, y2: y + img.h - 1 };
      if (!this.hitAnything(a, a)) { this.animals[s] = a; this.countdown[s] = delay; return; }
    }
    this.countdown[s] = rnd(7) | 1;
  };
  Hunt.prototype.moveAnimal = function (s) {                                              // E7A0
    var a = this.animals[s];
    this.countdown[s] = a.delay;
    a.frame = (a.frame + 1) % 3;
    for (var attempt = 0; attempt < 3; attempt++) {
      var nx = a.x + a.vx, ny = a.y + a.vy, box = { x1: nx, y1: ny, x2: nx + a.img.px - 1, y2: ny + a.img.h - 1 };
      if (!this.hitAnything(box, a)) {
        a.x = nx; a.y = ny; a.x1 = box.x1; a.y1 = box.y1; a.x2 = box.x2; a.y2 = box.y2;
        if (a.x2 < 0 || a.x >= W || a.y >= H || a.y2 < 0) this.animals[s] = null;         // EDC8: gone off the field
        return;
      }
      if (attempt < 2) { a.vy = -a.vy || (rnd(5) - 2); }                                  // steer around it
      else { a.flip = !a.flip; a.vx = -a.vx; a.vy = rnd(5) - 2; }                          // E81D: turn back
    }
  };
  // the pixel of whatever object lies under a point, for the bullet
  Hunt.prototype.pixelAt = function (x, y) {
    if (x < 0 || x >= W || y < 0 || y >= H) return false;
    var self = this;
    function lit(img, ox, oy, flip) {
      var lx = x - ox, ly = y - oy;
      if (lx < 0 || ly < 0 || lx >= img.px || ly >= img.h) return false;
      if (flip) img = A2.flipImage(img);
      return !!(img.rows[ly * img.w + ((lx / 7) | 0)] & (1 << (lx % 7)));
    }
    for (var i = 0; i < this.things.length; i++) if (lit(this.things[i].img, this.things[i].x, this.things[i].y)) return 'thing';
    for (i = 0; i < 2; i++) { var a = this.animals[i]; if (a && lit(this.libs.ANIMALS.get(a.kind * 3 + 1 + a.frame), a.x, a.y, a.flip)) return { slot: i }; }
    for (i = 0; i < this.dead.length; i++) { var d = this.dead[i]; if (lit(d.img, d.x, d.y, d.flip)) return 'dead'; }
    var hb = HUNTER_IMG[this.dir];
    if (lit(this.hunterImg((hb & 0x7F) + WALK_FRAME[this.walkFrame]), this.hx, this.hy, !!(hb & 0x80))) return 'hunter';
    return false;
  };
  Hunt.prototype.bulletStep = function () {                                               // E9BA
    var b = this.bullet;
    var hit = this.pixelAt(b.x, b.y) || this.pixelAt(b.x, b.y + 1);
    if (hit) {
      this.bullet = null;
      if (hit.slot !== undefined) this.kill(hit.slot);
      return;
    }
    b.x += 2 * DX[b.dir]; b.y += 2 * DY[b.dir];
    if (b.x < 0 || b.x + 1 >= W || b.y < 0 || b.y + 1 >= H) this.bullet = null;
  };
  Hunt.prototype.kill = function (s) {                                                    // EA73
    var a = this.animals[s], img = this.libs.THINGS.get(a.kind + 1);
    this.dead.push({ kind: a.kind, img: img, x: a.x, y: a.y, flip: a.flip, x1: a.x, y1: a.y, x2: a.x + img.px - 1, y2: a.y + img.h - 1 });
    this.kills.push(a.kind);
    this.animals[s] = null; this.countdown[s] = rnd(4) | 1;
  };
  // draws the field into the screen
  Hunt.prototype.draw = function () {
    var scr = this.screen, i;
    scr.clear();
    for (i = 0; i < this.things.length; i++) scr.put(this.things[i].img, this.things[i].x, this.things[i].y, 'or');
    for (i = 0; i < this.dead.length; i++) scr.put(this.dead[i].img, this.dead[i].x, this.dead[i].y, 'or', this.dead[i].flip);
    for (i = 0; i < 2; i++) { var a = this.animals[i]; if (a) scr.put(this.libs.ANIMALS.get(a.kind * 3 + 1 + a.frame), a.x, a.y, 'or', a.flip); }
    var hb = HUNTER_IMG[this.dir];
    scr.put(this.hunterImg((hb & 0x7F) + WALK_FRAME[this.walkFrame]), this.hx, this.hy, 'or', !!(hb & 0x80));
    if (this.bullet) scr.box(this.bullet.x, this.bullet.y, this.bullet.x + 1, this.bullet.y + 1, 3);
  };
  Hunt.prototype.result = function () { return { kills: this.kills.slice(), bullets: this.bullets }; };
  Hunt.KINDS = KINDS; Hunt.CLOCK = CLOCK;
  return Hunt;
})();
