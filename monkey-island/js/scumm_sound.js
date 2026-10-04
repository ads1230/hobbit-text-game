/*
 * Sound: the v5 sound queue (sound.cpp) and the Macintosh Monkey Island
 * music/effects player (players/player_mac_loom_monkey.cpp, player_mac_new.cpp),
 * ported from ScummVM (GPL v3).
 *
 * Mac MI1 sounds are "Mac0"/"Mac1" resources: up to four channels of
 * (duration, note) events played with sampled instruments. The instruments
 * come from the 'snd ' resources of the game's executable (its resource fork,
 * supplied by the user as "Monkey Island.rsrc"), or are embedded in the sound.
 * Durations are in Sound Manager units of 1/2000 s.
 *
 * The engine side tracks timing only; the page renders PCM with MacSound.render.
 */
var SCUMM = (function (g) { return g.SCUMM || (g.SCUMM = {}); })(typeof globalThis !== 'undefined' ? globalThis : this);

(function () {
  'use strict';
  var E = SCUMM.Engine, P = E.prototype, V = E.V;

  function be16(b, o) { return (b[o] << 8) | b[o + 1]; }
  function be32(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }
  function tag(b, o) { return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]); }

  // ---- instruments ----
  // Parse one 'snd ' resource (format 1) at b[o..o+len): returns {len, rate, loopst, loopend, baseFreq, data}
  function parseSnd(b, o, len) {
    if (be16(b, o) !== 1) return null;
    var numTypes = be16(b, o + 2);
    var p = o + numTypes * 6 + 4;
    var ncmd = be16(b, p);
    var h = o + ncmd * 8 + numTypes * 6 + 10;
    var n = be32(b, h), rate = be32(b, h + 4) / 65536, loopst = be32(b, h + 8), loopend = be32(b, h + 12), baseFreq = b[h + 17];
    if (h + 18 + n > o + len) n = Math.max(0, o + len - (h + 18));
    return { len: n, rate: rate, loopst: loopst, loopend: loopend, baseFreq: baseFreq, data: b.subarray(h + 18, h + 18 + n) };
  }
  // Read the instruments out of the executable's resource fork (raw, or inside an AppleSingle/AppleDouble file).
  function parseInstruments(bytes) {
    var b = bytes, base = 0, size = b.length;
    var magic = be32(b, 0);
    if (magic === 0x00051607 || magic === 0x00051600) {
      var n = be16(b, 24);
      for (var i = 0; i < n; i++) {
        var id = be32(b, 26 + i * 12), off = be32(b, 30 + i * 12), ln = be32(b, 34 + i * 12);
        if (id === 2) { base = off; size = ln; }
      }
    } else if (b.length > 128 && b[0] === 0 && b[74] === 0 && b[82] === 0 && b[1] > 0 && b[1] < 64) {
      // MacBinary: data fork length at 83, resource fork at 87
      var dlen = be32(b, 83), rlen = be32(b, 87);
      base = 128 + ((dlen + 127) & ~127); size = rlen;
    }
    var d = b.subarray(base, base + size);
    var dataOff = be32(d, 0), mapOff = be32(d, 4);
    var m = mapOff, typeListOff = be16(d, m + 24), nameListOff = be16(d, m + 26), tl = m + typeListOff;
    var numTypes = be16(d, tl) + 1, out = {};
    for (i = 0; i < numTypes; i++) {
      var e = tl + 2 + i * 8;
      if (tag(d, e) !== 'snd ') continue;
      var cnt = be16(d, e + 4) + 1, ro = be16(d, e + 6);
      for (var j = 0; j < cnt; j++) {
        var r = tl + ro + j * 12;
        var nameOff = (d[r + 2] << 8) | d[r + 3]; if (nameOff & 0x8000) nameOff -= 0x10000;
        var off = (d[r + 5] << 16) | (d[r + 6] << 8) | d[r + 7];
        var name = '';
        if (nameOff !== -1) { var p = m + nameListOff + nameOff; for (var k = 0; k < d[p]; k++) name += String.fromCharCode(d[p + 1 + k]); }
        var dl = be32(d, dataOff + off);
        var snd = parseSnd(d, dataOff + off + 4, dl);
        if (!snd) continue;
        var t = (name + '    ').substr(0, 4);
        snd.name = name;
        out[t] = snd;
      }
    }
    return out;
  }

  // ---- sound resources ----
  // data: bytes starting at the 'Mac0'/'Mac1' tag. Returns null when not playable.
  function parseMacSound(data, instruments, dataSize) {
    dataSize = dataSize || data.length;
    if (dataSize < 32) return null;
    var t = tag(data, 0);
    if (t !== 'Mac0' && t !== 'Mac1') return null;
    var snd = { isMusic: data[13] !== 0, chanSetup: data[11], timbre: data[12], loop: false, channels: [] };
    for (var i = 0; i < 4; i++) {
      var offs = be32(data, 16 + 4 * i);
      if (!offs) { snd.channels.push(null); continue; }
      if (dataSize < offs + 12) return null;
      var instrRef = be32(data, offs + 8), instr = null;
      if (instrRef & ~0x7FFFFF) {
        var tg = tag(data, offs + 8);
        instr = instruments ? (instruments[tg] || instruments['sile'] || null) : null;
        if (instr) instr = Object.assign({ tag: tg }, instr);
      } else if (dataSize >= instrRef + 8) {
        instr = parseSnd(data, instrRef + 8, be32(data, instrRef + 4));
        if (instr) instr.tag = tag(data, instrRef);
      }
      var events = [], p = offs + 12;
      while (p < dataSize - 4) {
        var in4 = tag(data, p);
        if (in4 === 'Loop' || in4 === 'Done') { if (i === 1) snd.loop = in4 === 'Loop'; break; }
        events.push({ dur: be16(data, p), note: data[p + 2] });
        p += 4;
      }
      snd.channels.push({ instr: instr, events: events });
    }
    // resolve the sampled-synth event rules (parseNextEvent with synth type 4)
    var total = 0;
    for (i = 0; i < 4; i++) {
      var ch = snd.channels[i];
      if (!ch) continue;
      var out = [], ev = ch.events, time = 0;
      for (var k = 0; k < ev.length; k++) {
        var dur = ev[k].dur, note = ev[k].note, skip = false, silent = false;
        if (dur === 0 && k === ev.length - 1) skip = true;
        if (!skip && note === 0) { note = 60; silent = true; }
        if (note === 1) skip = true;
        else if (k + 1 < ev.length && ev[k + 1].note === 1) dur += ev[k + 1].dur;
        if (skip) continue;
        out.push({ note: note, dur: dur, silent: silent, start: time });
        time += dur;
      }
      ch.events = out;
      ch.length = time;          // in 1/2000 s
      if (time > total) total = time;
    }
    snd.length = total;
    return snd;
  }

  // Render a parsed sound to mono float samples at `rate` Hz (the Mac sampled synth, without the
  // original's linear interpolation quirks). Returns Float32Array.
  function render(snd, rate) {
    var secs = snd.length / 2000, n = Math.ceil(secs * rate) + 1, out = new Float32Array(n);
    for (var c = 1; c < 4; c++) {
      var ch = snd.channels[c];
      if (!ch || !ch.instr) continue;
      var instr = ch.instr;
      for (var k = 0; k < ch.events.length; k++) {
        var ev = ch.events[k];
        if (ev.silent || instr.tag === 'sile' || instr.len === 0) continue;
        var start = Math.floor(ev.start / 2000 * rate), len = Math.floor(ev.dur / 2000 * rate);
        var step = instr.rate * Math.pow(2, (ev.note - instr.baseFreq) / 12) / rate;
        var loopLen = (instr.loopend - instr.loopst >= 2 && instr.loopend >= instr.loopst && instr.loopend <= instr.len) ? instr.loopend - instr.loopst : 0;
        var pos = 0, data = instr.data;
        for (var s = 0; s < len && start + s < n; s++) {
          var ip = pos | 0;
          if (ip >= instr.len) {
            if (loopLen) { pos = instr.loopst + ((pos - instr.loopst) % loopLen); ip = pos | 0; }
            else break;
          }
          out[start + s] += (data[ip] - 128) / 128;
          pos += step;
          if (loopLen && pos >= instr.loopend) pos = instr.loopst + (pos - instr.loopend);
        }
      }
    }
    for (var i = 0; i < n; i++) { var v = out[i] * 0.4; out[i] = v > 1 ? 1 : v < -1 ? -1 : v; }
    return out;
  }

  // ---- the player (timing model of LoomMonkeyMacSnd) ----
  function MacPlayer(vm) {
    this.vm = vm;
    this.instruments = null;
    this.curSound = 0; this.curSnd = null; this.blockSfx = false;
    this.elapsed = 0;                // 1/2000 s units into the current sound
    this.songTimer = 0; this.songTimerInternal = 0;
    this.cache = {};
    this.onStart = null; this.onStop = null;
  }
  MacPlayer.prototype.setInstruments = function (bytes) { this.instruments = bytes ? parseInstruments(bytes) : null; this.cache = {}; };
  MacPlayer.prototype.getParsed = function (id) {
    if (this.cache[id] !== undefined) return this.cache[id];
    var vm = this.vm, ptr = vm.soundPtr(id), snd = null;
    if (ptr >= 0 && vm.res.tag(ptr) === 'SOUN') {
      var size = vm.blockSize(ptr) - 8;
      snd = parseMacSound(vm.d.subarray(ptr + 8, ptr + 8 + size), this.instruments, size);
    }
    this.cache[id] = snd;
    return snd;
  };
  MacPlayer.prototype.startSound = function (id) {
    if (id < 1 || id >= 200) { this.vm.warn('MacPlayer.startSound: sound id ' + id + ' out of range'); return; }
    var snd = this.getParsed(id);
    if (!snd) { this.vm.warn('MacPlayer.startSound: sound resource ' + id + ' cannot be played'); return; }
    if (this.blockSfx && !snd.isMusic) return;
    if (this.curSound) this.stopActiveSound();
    this.blockSfx = snd.isMusic;
    this.curSound = id; this.curSnd = snd; this.elapsed = 0;
    this.songTimer = 0; this.songTimerInternal = 0;
    if (this.onStart) this.onStart(id, snd);
  };
  MacPlayer.prototype.stopActiveSound = function () {
    var was = this.curSound;
    this.curSound = 0; this.curSnd = null; this.blockSfx = false;
    if (was && this.onStop) this.onStop(was);
  };
  MacPlayer.prototype.stopSound = function (id) { if (id === this.curSound) this.stopActiveSound(); };
  MacPlayer.prototype.stopAllSounds = function () { this.stopActiveSound(); };
  MacPlayer.prototype.getMusicTimer = function () { return this.songTimer; };
  MacPlayer.prototype.getSoundStatus = function (id) { return this.curSound === id ? 1 : 0; };
  // advance the clock by `jiffies` (1/60 s)
  MacPlayer.prototype.advance = function (jiffies) {
    for (var i = 0; i < jiffies; i++) {
      if (this.songTimerInternal++ === 29) { this.songTimerInternal = 0; ++this.songTimer; }
    }
    if (!this.curSound) return;
    this.elapsed += jiffies * (2000 / 60);
    if (this.elapsed >= this.curSnd.length) {
      if (this.curSnd.loop) { this.elapsed -= this.curSnd.length; if (this.curSnd.length <= 0) this.elapsed = 0; }
      else this.stopActiveSound();
    }
  };
  SCUMM.MacSound = { parseInstruments: parseInstruments, parseSound: parseMacSound, render: render, Player: MacPlayer };

  // ---- Sound (sound.cpp) ----
  function Sound(vm) {
    this.vm = vm;
    this.player = new MacPlayer(vm);
    this.soundQueue = []; this.midiQueue = [];
    this.lastSound = 0;
    this.digiSndMode = 0;
  }
  Sound.prototype.startSound = function (sound) {
    this.vm.setVAR(V.LAST_SOUND, sound);
    this.lastSound = sound;
    this.addSoundToQueue(sound);
  };
  Sound.prototype.addSoundToQueue = function (sound) { if (this.soundQueue.length >= 10) throw new Error('sound queue overflow'); this.soundQueue.push(sound); };
  Sound.prototype.processSound = function () { this.processSoundQueues(); };
  Sound.prototype.processSoundQueues = function () {
    while (this.soundQueue.length) {
      var snd = this.soundQueue.pop();
      if (snd) this.triggerSound(snd);
    }
    this.midiQueue.length = 0;   // no iMuse on the Macintosh: sound kludge commands are ignored
  };
  Sound.prototype.triggerSound = function (soundID) {
    var ptr = this.vm.soundPtr(soundID);
    if (ptr < 0) { this.vm.warn('triggerSound: sound ' + soundID + ' missing'); return; }
    this.player.startSound(soundID);
  };
  Sound.prototype.isSoundInQueue = function (sound) {
    for (var i = 0; i < this.soundQueue.length; i++) if (this.soundQueue[i] === sound) return true;
    return false;
  };
  Sound.prototype.isSoundRunning = function (sound) {
    if (this.isSoundInQueue(sound)) return 1;
    if (sound >= this.vm.res.sounds.length || this.vm.soundPtr(sound) < 0) return 0;
    return this.player.getSoundStatus(sound);
  };
  Sound.prototype.stopSound = function (sound) {
    this.player.stopSound(sound);
    for (var i = 0; i < this.soundQueue.length; i++) if (this.soundQueue[i] === sound) this.soundQueue[i] = 0;
  };
  Sound.prototype.stopAllSounds = function () {
    this.lastSound = 0;
    this.soundQueue.length = 0;
    this.player.stopAllSounds();
  };
  Sound.prototype.soundKludge = function (list, num) {
    if (list[0] === -1) { this.processSound(); return; }
    this.midiQueue.push(num);
    for (var i = 0; i < num; i++) this.midiQueue.push(list[i]);
  };
  Sound.prototype.stopTalkSound = function () {};
  Sound.prototype.setupSound = function () {};
  Sound.prototype.getMusicTimer = function () { return this.player.getMusicTimer(); };
  Sound.prototype.advance = function (jiffies) { this.player.advance(jiffies); };
  SCUMM.Sound = Sound;

  P.initSound = function () { this.sound = new Sound(this); };
  P.setInstrumentData = function (bytes) { this.sound.player.setInstruments(bytes); };
})();

if (typeof module !== 'undefined') module.exports = SCUMM;
