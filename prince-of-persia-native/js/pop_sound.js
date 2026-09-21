// pop_sound.js — the sound table of SPECIALK.S/SOUND.S: the effects a frame asks for are queued and
// handed to the page at PLAYBACK time (the page plays recordings of the Apple's speaker).
var POP = POP || {};
POP.sound = (function () {
  'use strict';
  var ST = POP.state, S = ST.S;
  var maxsfx = 0x20, table = new Uint8Array(maxsfx + 1);          // [0] = count, 1.. = sounds
  var events = { play: null };
  function zerosound() { table[0] = 0; }
  function addsound(a) { var x = table[0]; if (x >= maxsfx) return; x++; table[x] = a; table[0] = x; }
  function playback() {
    if (!S.soundon) return;
    var n = table[0]; if (!n) return;
    var list = [];
    for (var i = 1; i <= n; i++) list.push(table[i]);
    if (events.play) events.play(list);
  }
  return { zerosound: zerosound, addsound: addsound, playback: playback, table: table, events: events };
})();
