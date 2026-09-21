// raft.js — floating the Columbia, from the FLOAT program on side two of the disk.
// The raft sits in the current and is steered across it (eighteen positions bank to
// bank); rocks come up the river and out of the shallows; three signs pass, then the
// landing.  Hitting a rock or the bank costs people, oxen and supplies (the game
// works those out through `collision`), and after the third sign the raft has to be
// against the far bank to land.
var Raft = (function () {
  'use strict';
  var XI = 8, YI = -4, RF = 15;

  function rnd1(n) { return Math.floor(n * Math.random() + 1); }   // INT(n*RND(1)+1)

  function Raft(screen, libs, screens, collision) {
    this.screen = screen; this.libs = libs; this.background = screens.RIVER; this.collision = collision;
    this.HP = 16; this.DIR = -1; this.TC = 0; this.LP = this.HP; this.COL = 0; this.ROCK = -1;
    this.FL = [0, 0, 0, 0]; this.RX = [0, 0]; this.RY = [0, 0]; this.SX = 0; this.SY = 0; this.TX = 0; this.TY = 0;
    this.keys = []; this.done = false; this.landed = false; this.message = null; this.stopped = false;
  }
  Raft.RX = function (hp) { return 84 + 8 * hp; };
  Raft.RY = function (hp) { return 5 * hp - 6; };
  Raft.prototype.key = function (k) { if (this.keys.length < 3) this.keys.push(k); };
  Raft.prototype.raftBox = function () { var x = Raft.RX(this.HP), y = Raft.RY(this.HP); return { x1: x + 6, y1: y + 18, x2: x + 26, y2: y + 25 }; };
  Raft.prototype.rockBox = function (i) { var x = this.RX[i] + 11, y = this.RY[i] + 1; return { x1: x, y1: y, x2: x + 20, y2: y + 6 }; };
  function hits(a, b) { return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y1 > b.y2 || a.y2 < b.y1); }     // 200
  Raft.prototype.spawnRock = function (i) {                                                          // 300
    this.FL[i] = 1;
    if (rnd1(100) < 14) { this.RY[i] = 175; this.RX[i] = Math.floor(10 * Math.random()); }
    else { this.RX[i] = 0; this.RY[i] = 50 + rnd1(120); }
  };
  // one turn of the loop at 1070; returns 'message' when a collision needs acknowledging, 'done' at the end
  Raft.prototype.tick = function () {
    if (this.done) return 'done';
    this.TC++;
    for (var i = 0; i < 2; i++) if (!this.FL[i] && rnd1(100) <= RF) this.spawnRock(i);
    for (i = 0; i < 2; i++) if (this.FL[i]) { this.RX[i] += XI; this.RY[i] += YI; }
    var KEY = this.keys.shift();
    if (this.HP > 0 && (KEY === 'left')) { this.DIR--; if (this.DIR < -1) this.DIR = -1; }
    if (this.HP < 17 && (KEY === 'right')) { this.DIR++; if (this.DIR > 1) this.DIR = 1; }
    if (this.DIR !== 0) {
      this.HP += this.DIR;
      if (this.HP < 1 || this.HP > 16) { this.COL = 1; this.ROCK = -1; this.DIR = -this.DIR; }            // 400: the bank
    }
    if (this.TC > 205 && this.HP === 17) { this.landed = true; this.done = true; return 'done'; }
    if (this.TC > 225) { this.landed = false; this.done = true; return 'done'; }
    if (!this.COL) for (i = 0; i < 2; i++) if (this.FL[i] && hits(this.raftBox(), this.rockBox(i))) { this.COL = 1; this.ROCK = i; break; }
    if (this.TC === 97 || this.TC === 157) this.FL[2] = 0;
    if (this.TC === 60 || this.TC === 120 || this.TC === 170) { this.FL[2] = 1; this.SX = 62; this.SY = 189; }
    if (this.TC === 175) { this.FL[3] = 1; this.TX = -8; this.TY = 218; }
    if (this.FL[2]) { this.SX += 6; this.SY -= 3; }
    if (this.FL[3]) { this.TX += 6; this.TY -= 3; }
    for (i = 0; i < 2; i++) if (this.FL[i] && !(this.RX[i] < 240 && this.RY[i] > 10)) this.FL[i] = 0;   // 600
    if (this.COL) {                                                                                     // 700
      var r = this.collision(this.ROCK === -1 ? 'shore' : 'rock');
      if (this.ROCK !== -1) this.FL[this.ROCK] = 0;
      this.COL = 0;
      this.message = r;
      if (r.stop) { this.done = true; this.stopped = true; }
      return 'message';
    }
    return null;
  };
  Raft.prototype.draw = function () {
    var scr = this.screen, L = this.libs.ORSPRITE;
    scr.load(this.background);
    if (this.FL[2]) scr.put(L.get(5), this.SX - 6, this.SY + 3, 'or');
    if (this.FL[3]) scr.put(L.get(6), this.TX - 6, this.TY + 3, 'or');
    for (var i = 0; i < 2; i++) if (this.FL[i]) scr.put(L.get(3 + i), this.RX[i], this.RY[i], 'or');
    var x = Raft.RX(this.HP), y = Raft.RY(this.HP);
    scr.put(L.get(1), x, y, 'and'); scr.put(L.get(2), x, y, 'or');
  };
  return Raft;
})();
