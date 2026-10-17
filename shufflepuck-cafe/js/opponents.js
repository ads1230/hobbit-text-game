// Shufflepuck Café — the nine opponents: names, pictures, sounds, face frames,
// idle animations and the keyframed reactions to winning or losing a point.
'use strict';
var OPP = (function () {
  var S = SPC.S, R = SPC.R, tdiv = SPC.tdiv, rnd = SPC.rnd;

  // id -> name, parameter record (data fork), picture series, sounds, blink position
  var INFO = {
    1: { name: 'Skip', full: 'Skip Feeney', rec: 7, pics: 3000, sounds: [3000, 3002] },
    2: { name: 'Visine', full: 'Visine Orb', rec: 5, pics: 7000, sounds: [7000, 7001] },
    3: { name: 'Vinnie', full: 'Vinnie the Dweeb', rec: 6, pics: 4000, sounds: [4000, 4001, 4002] },
    4: { name: 'Lexan', full: 'Lexan Smythe-Worthington', rec: 4, pics: 8000, sounds: [8000] },
    5: { name: 'Eneg', full: 'Eneg Portwood', rec: 2, pics: 2000, sounds: [2000, 2002, 2004] },
    6: { name: 'Nerual', full: 'Nerual', rec: 3, pics: 5000, sounds: [5000, 5001, 5002] },
    7: { name: 'Bejin', full: 'Princess Bejin', rec: 1, pics: 10000, sounds: [10000, 10001, 23] },
    8: { name: 'Biff', full: 'Biff Raunch', rec: 0, pics: 9000, sounds: [9001, 9002, 9003] },
    10: { name: 'DC3', full: 'DC3', rec: 8, pics: 6000, sounds: [6000, 6001, 6002, 6003] }
  };

  // ------------------------------------------------ face drawing (into a port)
  // Each opponent draws its big picture at an intro position, and its animation
  // frames at frame-specific positions (F2_4944 .. F2_52d8 in the original).
  function face(p, left, top, id) { SPC.drawPict(p, left, top, id); }
  var FACE = {
    1: { intro: function (p) { face(p, 233, 53, 3000); }, frame: function (p, n) { face(p, 238, 58, 3000 + n); } },
    2: { intro: function (p) {}, frame: function (p, n) { face(p, 200, 76, 7000 + n); } },
    3: { intro: function (p) { face(p, 184, 0, 4000); },
         frame: function (p, n) {   // F2_4e64 (returns a delay in ticks)
           if (n === 0 || (n >= 5 && n <= 9)) { face(p, 184, 0, 4000 + n); return 6; }
           if (n === 10) { face(p, 223, 39, 4010); return 2; }
           if (n === 11 || n === 12) { face(p, 263, 39, 4000 + n); return 2; }
           if (n === 1) { face(p, 227, 32, 4001); return 0; }
           if (n === 4) { face(p, 225, 29, 4004); return 0; }
           face(p, 230, 33, 4000 + n); return 0;
         } },
    4: { intro: function (p) { face(p, 210, 18, 8000); },
         frame: function (p, n) { if (n > 6) { face(p, 211, 19, 8000 + n); return 4; } face(p, 210, 18, 8000 + n); return 0; } },
    5: { intro: function (p) { face(p, 188, 29, 2000); }, frame: function (p, n) { face(p, 212, 28, 2000 + n); return 4; } },
    6: { intro: function (p) {}, frame: function (p, n) { face(p, 210, 26, 5000 + n); return 4; } },
    7: { intro: function (p) { face(p, 187, -1, 10000); },
         frame: function (p, n) { if (n > 3) face(p, 187, 58, 10000 + n); else face(p, 236, 14, 10000 + n); return 0; },
         hands: function (p, n) { face(p, 180, 52, 10050 + n); if (n === 1) face(p, 135, 82, 10053); if (n === 2) face(p, 135, 82, 10054); } },
    8: { intro: function (p) { face(p, 181, 0, 9000); },
         frame: function (p, n) {   // F2_4c00
           if (n === 0) { face(p, 181, 0, 9000); return 0; }
           if (n < 4) { face(p, 231, 13, 9000 + n); return 0; }
           if (n >= 5) { face(p, 220, 1, 9000 + n); return 5; }
           face(p, 232, 13, 9004); return 0;
         } },
    10: { intro: function (p) { face(p, 210, 7, 6000); }, frame: function (p, n) { if (n < 4) face(p, 241, 6, 6000 + n); else face(p, 209, 62, 6000 + n); return 0; } }
  };

  // small eye frames (G0c12[]) loaded per opponent: picture ids, drawn at fixed positions
  var EYES = {
    1: { pics: [3050, 3051, 3052, 3061, 3070], pos: [248, 65] },          // L2_2204
    3: { pics: [4100, 4101, 4102, 4103, 4104, 4105], pos: [232, 34] },    // L2_208c
    5: { pics: [2051, 2052, 2053, 2060, 2050, 2080, 2081, 2082], pos: [234, 56] },   // L2_2280
    7: { pics: [10100, 10101, 10102, 10103, 10104, 10105, 10106], pos: [239, 20], pos2: [239, 36] },   // F2_2108 / F2_2184
    4: { pics: [8200, 8201, 8202, 8203, 8204, 8205, 8206, 8207, 8208], pos: [281, 41], blink: [8003, 8004, 8005, 8006], blinkPos: [210, 18] }
  };

  // sounds: [id, numerator, denominator]
  var SND = {
    skipGood: [3000, 3, 5], skipAgain: [3002, 3, 5],
    visGiggle: function () { return [7000, 100, 200 + rnd(-50, 50)]; }, visCry: [7001, 1, 2],
    vin0: [4000, 1, 4], vin1: [4001, 1, 2], vin2: [4002, 40, 100],
    hic: [8000, 1, 2],
    gen0: [2000, 1, 2], gen2: [2002, 1, 2], gen4: [2004, 1, 2],
    spec0: [5000, 1, 2], spec1: [5001, 1, 2], spec2: [5002, 1, 2],
    bej0: [10000, 1, 2], bej1: [10001, 1, 2], wallRev: [23, 2, 3],
    biff1: [9001, 2, 5], biff2: [9002, 2, 6], biff3: [9003, 75, 100],
    droidServe: [6000, 1, 2], droidServe12: [6000, 12, 10], r2d1: [6001, 1, 2], r2d2: [6002, 1, 2], r2d3: [6003, 1, 2],
    r2d1s: [6001, 1, 4], r2d2s: [6002, 1, 5], r2d3s: [6003, 1, 5],
    piano: [20002, 1, 2], cheer: [20000, 1, 2], boo: [20001, 1, 2]
  };

  return { INFO: INFO, FACE: FACE, EYES: EYES, SND: SND };
})();
