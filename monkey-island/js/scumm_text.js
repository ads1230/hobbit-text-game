/*
 * Text: the game's own bitmap fonts (CHAR resources), the string slots,
 * dialogue display (actorTalk / displayDialog), drawString and the message
 * substitution codes. Port of ScummVM's charset.cpp and string.cpp (GPL v3),
 * reduced to the SCUMM v5 paths.
 */
var SCUMM = (function (g) { return g.SCUMM || (g.SCUMM = {}); })(typeof globalThis !== 'undefined' ? globalThis : this);

(function () {
  'use strict';
  var E = SCUMM.Engine, P = E.prototype, V = E.V, C = E.C;
  var kMain = C.kMainVirtScreen;

  function newStringSlot() {
    return { xpos: 0, ypos: 0, right: 0, height: 0, color: 0, charset: 0, center: false, overhead: false, no_talk_anim: false };
  }
  function StringTab() {
    var s = newStringSlot();
    s.def = newStringSlot();
    s.saveDefault = function () { for (var k in s.def) if (s.def.hasOwnProperty(k)) s.def[k] = s[k]; };
    s.loadDefault = function () { for (var k in s.def) if (s.def.hasOwnProperty(k)) s[k] = s.def[k]; };
    return s;
  }

  // ---- the charset renderer (CharsetRendererClassic) ----
  function Charset(vm) {
    this.vm = vm;
    this.top = 0; this.left = 0; this.startLeft = 0; this.right = 0;
    this.color = 0; this.center = false; this.hasMask = false; this.textScreenID = kMain;
    this.firstChar = false; this.disableOffsX = false;
    this.curId = -1; this.fontPtr = -1; this.bpp = 0; this.fontHeight = 0; this.numChars = 0;
    this.str = { left: 0, top: 0, right: 0, bottom: 0 };
    // glyph being drawn
    this.charPtr = 0; this.width = 0; this.height = 0; this.origWidth = 0; this.origHeight = 0; this.offsX = 0; this.offsY = 0;
  }
  Charset.prototype.setCurID = function (id) {
    if (id === -1) return;
    if (id < 0 || id >= this.vm.numCharsets) throw new Error('charset ' + id + ' out of range');
    this.curId = id;
    var ptr = this.vm.charsetPtr(id);
    if (ptr < 0) throw new Error('setCurID: charset ' + id + ' not found');
    this.fontPtr = ptr + 29;
    var d = this.vm.d;
    this.bpp = d[this.fontPtr]; this.fontHeight = d[this.fontPtr + 1]; this.numChars = d[this.fontPtr + 2] | (d[this.fontPtr + 3] << 8);
  };
  Charset.prototype.getCurID = function () { return this.curId; };
  Charset.prototype.getFontHeight = function () { return this.fontHeight; };
  Charset.prototype.setColor = function (c) { this.color = c & 0xFF; };
  Charset.prototype.getColor = function () { return this.color; };
  Charset.prototype.getCharWidth = function (chr) {
    var offs = this.vm.le32(this.fontPtr + chr * 4 + 4), d = this.vm.d;
    if (!offs) return 0;
    var k = d[this.fontPtr + offs + 2];
    return d[this.fontPtr + offs] + (k & 0x80 ? k - 256 : k);
  };
  // width of the text (a byte array) starting at pos, up to the first line break
  Charset.prototype.getStringWidth = function (arg, text, pos) {
    var width = 1, chr, oldID = this.curId;
    pos = pos || 0;
    while ((chr = text[pos++]) !== 0 && chr !== undefined) {
      if (chr === 10 || chr === 13) break;
      if (chr === 64) continue;                       // '@'
      if (chr === 255 || chr === 254) {
        chr = text[pos++];
        if (chr === 3) break;
        if (chr === 8) { if (arg === 1) break; while (text[pos++] === 32) {} continue; }
        if (chr === 10 || chr === 21 || chr === 12 || chr === 13) { pos += 2; continue; }
        if (chr === 9 || chr === 1 || chr === 2) break;
        if (chr === 14) { var set = text[pos] | (text[pos + 1] << 8); pos += 2; this.setCurID(set); continue; }
      }
      width += this.getCharWidth(chr);
    }
    this.setCurID(oldID);
    return width;
  };
  Charset.prototype.addLinebreaks = function (a, str, pos, maxwidth) {
    var lastspace = -1, curw = 1, chr, oldID = this.curId;
    while ((chr = str[pos++]) !== 0 && chr !== undefined) {
      if (chr === 64) continue;
      if (chr === 255 || chr === 254) {
        chr = str[pos++];
        if (chr === 3) break;
        if (chr === 8) {
          if (a === 1) curw = 1; else { while (str[pos] === 32) str[pos++] = 64; }
          continue;
        }
        if (chr === 10 || chr === 21 || chr === 12 || chr === 13) { pos += 2; continue; }
        if (chr === 1) { curw = 1; continue; }
        if (chr === 2) break;
        if (chr === 14) { var set = str[pos] | (str[pos + 1] << 8); pos += 2; this.setCurID(set); continue; }
      }
      if (chr === 32) lastspace = pos - 1;
      curw += this.getCharWidth(chr);
      if (lastspace === -1) continue;
      if (curw > maxwidth) {
        str[lastspace] = 0xD;
        curw = 1;
        pos = lastspace + 1;
        lastspace = -1;
      }
    }
    this.setCurID(oldID);
  };
  Charset.prototype.prepareDraw = function (chr) {
    var charOffs = this.vm.le32(this.fontPtr + chr * 4 + 4), d = this.vm.d;
    if (charOffs >= 0x14000) throw new Error('bad glyph offset');
    if (!charOffs) return false;
    var p = this.fontPtr + charOffs;
    this.width = this.origWidth = d[p]; this.height = this.origHeight = d[p + 1];
    this.offsX = this.disableOffsX ? 0 : (d[p + 2] & 0x80 ? d[p + 2] - 256 : d[p + 2]);
    this.offsY = d[p + 3] & 0x80 ? d[p + 3] - 256 : d[p + 3];
    this.charPtr = p + 4;
    return true;
  };
  Charset.prototype.printChar = function (chr, ignoreCharsetMask) {
    var vm = this.vm;
    if (this.curId < 1 || this.curId >= vm.numCharsets) throw new Error('printChar: charset ' + this.curId);
    var vs = vm.findVirtScreen(this.top);
    if (!vs) vs = vm.findVirtScreen(this.top + this.getFontHeight());
    if (!vs) return;
    if (chr === 64) return;
    vm.charsetColorMap[1] = this.color;
    if (!this.prepareDraw(chr)) return;
    if (this.firstChar) { this.str.left = 0; this.str.top = 0; this.str.right = 0; this.str.bottom = 0; }
    this.top += this.offsY;
    this.left += this.offsX;
    if (this.left + this.origWidth > this.right + 1 || this.left < 0) {
      this.left += this.origWidth;
      this.top -= this.offsY;
      return;
    }
    this.disableOffsX = false;
    if (this.firstChar) { this.str.left = this.left; this.str.top = this.top; this.str.right = this.left; this.str.bottom = this.top; this.firstChar = false; }
    if (this.left < this.str.left) this.str.left = this.left;
    if (this.top < this.str.top) this.str.top = this.top;
    var drawTop = this.top - vs.topline;
    vm.markRectAsDirty(vs.number, this.left, this.left + this.width, drawTop, drawTop + this.height, 0);
    if (!ignoreCharsetMask) { this.hasMask = true; this.textScreenID = vs.number; }
    this.printCharIntern(vs, ignoreCharsetMask);
    this.left += this.origWidth;
    if (this.str.right < this.left) this.str.right = this.left;
    if (this.str.bottom < this.top + this.origHeight) this.str.bottom = this.top + this.origHeight;
    this.top -= this.offsY;
  };
  Charset.prototype.printCharIntern = function (vs, ignoreCharsetMask) {
    var vm = this.vm, drawTop = this.top - vs.topline, dst, dstOff, pitch, surfH;
    if (ignoreCharsetMask || !vs.hasTwoBuffers) {
      dst = vs.pixels; pitch = vs.pitch; surfH = vs.h;
      dstOff = drawTop * vs.pitch + vs.xstart + this.left;
    } else {
      dst = vm.textSurface; pitch = vm.screenWidth; surfH = vm.screenHeight;
      dstOff = (this.top - vm.screenTop) * vm.screenWidth + this.left;
      drawTop = this.top - vm.screenTop;
    }
    this.drawBitsN(dst, dstOff, pitch, surfH, this.charPtr, this.bpp, drawTop, this.origWidth, this.origHeight);
  };
  Charset.prototype.drawBitsN = function (dst, dstOff, pitch, surfH, src, bpp, drawTop, width, height) {
    var d = this.vm.d, cmap = this.vm.charsetColorMap;
    if (bpp !== 1 && bpp !== 2 && bpp !== 4 && bpp !== 8) throw new Error('drawBitsN: bpp ' + bpp);
    var bits = d[src++], numbits = 8, o = dstOff, color;
    for (var y = 0; y < height && y + drawTop < surfH; y++) {
      for (var x = 0; x < width; x++) {
        color = (bits >> (8 - bpp)) & 0xFF;
        if (color && y + drawTop >= 0) dst[o] = cmap[color];
        o++;
        bits = (bits << bpp) & 0xFF;
        numbits -= bpp;
        if (numbits === 0) { bits = d[src++]; numbits = 8; }
      }
      o += pitch - width;
    }
  };
  // Draw one glyph into an arbitrary 8-bit surface (used by the page for the Mac menu / dialogs)
  Charset.prototype.drawChar = function (chr, dst, pitch, surfH, x, y) {
    if (!this.prepareDraw(chr)) return 0;
    this.vm.charsetColorMap[1] = this.color;
    this.drawBitsN(dst, y * pitch + x, pitch, surfH, this.charPtr, this.bpp, y, this.width, this.height);
    return this.width;
  };
  SCUMM.Charset = Charset;

  // ---- engine side ----
  P.initText = function () {
    this.string = [];
    for (var i = 0; i < 6; i++) this.string.push(new StringTab());
    this.charset = new Charset(this);
    this.charsetColorMap = new Uint8Array(16);
    this.charsetData = [];
    for (i = 0; i < this.numCharsets; i++) this.charsetData.push(new Uint8Array(16));
    this.charsetBuffer = new Uint8Array(512);
    this.charsetBufPos = 0;
    this.charsetColor = 0;
    this.msgCount = 0;
    this.useTalkAnims = false;
  };
  P.loadCharset = function (no) {
    if (no < 1 || no >= this.numCharsets) throw new Error('loadCharset: charset ' + no + ' out of range');
    var ptr = this.charsetPtr(no);
    if (ptr < 0) throw new Error('loadCharset: charset ' + no + ' missing');
    for (var i = 0; i < 15; i++) this.charsetData[no][i + 1] = this.d[ptr + i + 14];
  };
  P.initCharset = function (charsetno) {
    this.loadCharset(charsetno);
    this.string[0].def.charset = charsetno;
    this.string[1].def.charset = charsetno;
    this.charsetColorMap.set(this.charsetData[charsetno]);
  };

  P.printString = function (m, msg) {
    switch (m) {
      case 0: this.actorTalk(msg); break;
      case 1: this.drawString(1, msg); break;
      case 2: this.log('debug message: ' + bytesToString(this.convertMessageToString(msg))); break;
      case 3: if (this.opts.onMessageDialog) this.opts.onMessageDialog(bytesToString(this.convertMessageToString(msg))); break;
      default: break;
    }
  };
  function bytesToString(b) {
    var s = '';
    for (var i = 0; i < b.length && b[i] !== 0; i++) s += String.fromCharCode(b[i]);
    return s;
  }
  E.bytesToString = bytesToString;

  // Expand the ^ codes (ints, verbs, names, strings) of a message; returns a zero-terminated Uint8Array.
  P.convertMessageToString = function (msg) {
    var out = [];
    this.convertMessageInto(msg, 0, out);
    out.push(0);
    return Uint8Array.from(out);
  };
  P.convertMessageInto = function (src, num, out) {
    if (!src) { this.warn('Bad message in convertMessageToString, ignoring'); return; }
    var chr, val;
    for (;;) {
      chr = src[num++];
      if (chr === 0 || chr === undefined) break;
      if (chr === 0xFF) {
        chr = src[num++];
        if (chr === 1 || chr === 2 || chr === 3 || chr === 8) { out.push(0xFF, chr); }
        else {
          val = src[num] | (src[num + 1] << 8);
          switch (chr) {
            case 4: this.convertIntMessage(out, val); break;
            case 5: this.convertVerbMessage(out, val); break;
            case 6: this.convertNameMessage(out, val); break;
            case 7: this.convertStringMessage(out, val); break;
            case 9: case 10: case 12: case 13: case 14: out.push(0xFF, chr, src[num], src[num + 1]); break;
            default: num -= 2;
          }
          num += 2;
        }
      } else {
        if (chr !== 64) out.push(chr);
      }
      if (out.length > 4096) throw new Error('convertMessageToString: buffer overflow');
    }
  };
  P.convertIntMessage = function (out, v) {
    var s = String(this.readVar(v));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
  };
  P.convertVerbMessage = function (out, v) {
    var num = this.readVar(v);
    if (num) {
      for (var k = 1; k < this.numVerbs; k++) {
        var vs = this.verbs[k];
        if (num === vs.verbid && !vs.type && !vs.saveid) { this.convertMessageInto(this.verbNames[k], 0, out); return; }
      }
    }
  };
  P.convertNameMessage = function (out, v) {
    var num = this.readVar(v);
    if (num) { var ptr = this.getObjOrActorName(num); if (ptr) this.convertMessageInto(ptr, 0, out); }
  };
  P.convertStringMessage = function (out, v) {
    if (v) { var ptr = this.strings[v]; if (ptr) this.convertMessageInto(ptr, 0, out); }
  };

  P.actorTalk = function (msg) {
    var a, oldact;
    var conv = this.convertMessageToString(msg);
    if (conv.length > this.charsetBuffer.length) throw new Error('actorTalk: message too long');
    this.charsetBuffer.set(conv);
    if (this.actorToPrintStrFor === 0xFF) {
      if (!this.keepText) this.stopTalk();
      this.setTalkingActor(0xFF);
    } else {
      a = this.derefActor(this.actorToPrintStrFor);
      if (!a.isInCurrentRoom()) oldact = 0xFF;
      else {
        if (!this.keepText) this.stopTalk();
        this.setTalkingActor(a.number);
        if (!this.string[0].no_talk_anim) { a.runActorTalkScript(a.talkStartFrame); this.useTalkAnims = true; }
        oldact = this.getTalkingActor();
      }
      if (oldact >= 0x80) return;
    }
    if (this.getTalkingActor() > 0x7F) this.charsetColor = this.string[0].color & 0xFF;
    else { a = this.derefActor(this.getTalkingActor()); this.charsetColor = a.talkColor; }
    this.charsetBufPos = 0;
    this.talkDelay = 0;
    this.haveMsg = 0xFF;
    this.setVAR(V.HAVE_MSG, 0xFF);
    this.haveActorSpeechMsg = true;
    this.displayDialog();
  };

  P.stopTalk = function () {
    this.sound.stopTalkSound();
    this.haveMsg = 0;
    this.talkDelay = 0;
    var act = this.getTalkingActor();
    if (act && act < 0x80) {
      var a = this.derefActor(act);
      if (a.isInCurrentRoom() && this.useTalkAnims) { a.runActorTalkScript(a.talkStopFrame); this.useTalkAnims = false; }
      this.setTalkingActor(0xFF);
    }
    this.keepText = false;
    this.restoreCharsetBg();
  };

  // Returns the next printable code in this.lastCode; false when the message ends or pauses.
  P.handleNextCharsetCode = function (a) {
    var buffer = this.charsetBufPos, buf = this.charsetBuffer, c = 0, endLoop = false, frme, color, oldy;
    while (!endLoop) {
      c = buf[buffer++];
      if (!(c === 0xFF || c === 0xFE)) break;
      c = buf[buffer++];
      switch (c) {
        case 1: c = 13; this.msgCount = this.screenWidth; endLoop = true; break;
        case 2: this.haveMsg = 0; this.keepText = true; endLoop = true; break;
        case 3: this.haveMsg = 0xFF; this.keepText = false; this.msgCount = 0; endLoop = true; break;
        case 8: break;
        case 9: frme = buf[buffer] | (buf[buffer + 1] << 8); buffer += 2; if (a) a.startAnimActor(frme); break;
        case 10: buffer += 14; this.haveActorSpeechMsg = false; break;
        case 12: color = buf[buffer] | (buf[buffer + 1] << 8); buffer += 2; if (color === 0xFF) this.charset.setColor(this.charsetColor); else this.charset.setColor(color); break;
        case 13: buffer += 2; break;
        case 14:
          oldy = this.charset.getFontHeight();
          this.charset.setCurID(buf[buffer++]); buffer += 2;
          if (this.charset.getCurID() !== -1) for (var i = 0; i < 4; i++) this.charsetColorMap[i] = this.charsetData[this.charset.getCurID()][i];
          this.nextTop -= this.charset.getFontHeight() - oldy;
          break;
        default: throw new Error('handleNextCharsetCode: invalid code ' + c);
      }
    }
    this.charsetBufPos = buffer;
    this.lastCode = c;
    return c !== 2 && c !== 3;
  };

  P.newLine = function () {
    this.nextLeft = this.string[0].xpos;
    if (this.charset.center) {
      var stringWidth = this.charset.getStringWidth(0, this.charsetBuffer, this.charsetBufPos);
      this.nextLeft -= (stringWidth / 2) | 0;
      if (this.nextLeft < 0) this.nextLeft = 0;
    }
    if (this.string[0].height) this.nextTop += this.string[0].height;
    else this.nextTop += this.charset.getFontHeight();
    this.charset.disableOffsX = true;
    return true;
  };

  P.displayDialog = function () {
    var a = null, cs = this.charset, s0 = this.string[0];
    if (!this.haveMsg) return;
    if ((this.camera.dest.x >> 3) !== (this.camera.cur.x >> 3) || this.camera.cur.x !== this.camera.last.x) return;
    if (this.getTalkingActor() !== 0xFF && this.isValidActor(this.getTalkingActor())) a = this.actors[this.getTalkingActor()];
    if (a && s0.overhead) {
      s0.xpos = a.pos.x - this.virtscr[kMain].xstart;
      s0.ypos = a.pos.y - a.elevation - this.screenTop;
      var ty = this.VAR(V.V5_TALK_STRING_Y);
      if (ty < 0) {
        var s = cdiv(a.scaley * ty, 0xFF);
        s0.ypos += cdiv(ty - s, 2) + s;
      } else s0.ypos = ty;
      if (s0.ypos < 1) s0.ypos = 1;
      if (s0.xpos < 80) s0.xpos = 80;
      if (s0.xpos > this.screenWidth - 80) s0.xpos = this.screenWidth - 80;
    }
    cs.top = s0.ypos + this.screenTop;
    cs.startLeft = cs.left = s0.xpos;
    cs.right = s0.right;
    cs.center = s0.center;
    cs.setColor(this.charsetColor);
    if (a && a.charset) cs.setCurID(a.charset); else cs.setCurID(s0.charset);
    if (cs.getCurID() !== -1) for (var i = 0; i < 4; i++) this.charsetColorMap[i] = this.charsetData[cs.getCurID()][i];
    if (this.talkDelay) return;
    if (this.haveMsg === 1) { this.stopTalk(); return; }
    if (a && !s0.no_talk_anim) { a.runActorTalkScript(a.talkStartFrame); this.useTalkAnims = true; }
    this.talkDelay = 60;
    if (!this.keepText) { this.restoreCharsetBg(); this.msgCount = 0; }
    var maxWidth = cs.right - s0.xpos - 1;
    if (cs.center) { if (maxWidth > this.nextLeft) maxWidth = this.nextLeft; maxWidth *= 2; }
    cs.addLinebreaks(0, this.charsetBuffer, this.charsetBufPos, maxWidth);
    if (cs.center) {
      var stringWidth = cs.getStringWidth(0, this.charsetBuffer, this.charsetBufPos);
      this.nextLeft -= (stringWidth / 2) | 0;
      if (this.nextLeft < 0) this.nextLeft = 0;
    }
    cs.disableOffsX = cs.firstChar = !this.keepText;
    var c;
    while (this.handleNextCharsetCode(a)) {
      c = this.lastCode;
      if (c === 0) { this.haveMsg = 1; this.keepText = false; this.msgCount = 0; break; }
      if (c === 13) { if (!this.newLine()) break; continue; }
      cs.left = this.nextLeft;
      cs.top = this.nextTop;
      cs.printChar(c, false);
      this.nextLeft = cs.left;
      this.nextTop = cs.top;
      this.talkDelay += this.VAR(V.CHARINC);
    }
  };
  function cdiv(a, b) { return (a / b) | 0; }   // C integer division (truncates toward zero)

  P.drawString = function (a, msg) {
    var buf = this.convertMessageToString(msg), cs = this.charset, st = this.string[a], i, c, color;
    cs.top = st.ypos + this.screenTop;
    cs.startLeft = cs.left = st.xpos;
    cs.right = st.right;
    cs.center = st.center;
    cs.setColor(st.color);
    cs.disableOffsX = cs.firstChar = true;
    cs.setCurID(st.charset);
    if (cs.getCurID() !== -1) for (i = 0; i < 4; i++) this.charsetColorMap[i] = this.charsetData[cs.getCurID()][i];
    var fontHeight = cs.getFontHeight();
    // strip trailing spaces
    var space = -1;
    for (i = 0; buf[i]; i++) { if (buf[i] === 32) { if (space < 0) space = i; } else space = -1; }
    if (space >= 0) buf[space] = 0;
    if (cs.center) cs.left -= (cs.getStringWidth(a, buf, 0) / 2) | 0;
    if (!buf[0]) { buf[0] = 32; buf[1] = 0; }
    for (i = 0; (c = buf[i++]) !== 0;) {
      if (c === 0xFF || c === 0xFE) {
        c = buf[i++];
        switch (c) {
          case 9: case 10: case 13: case 14: i += 2; break;
          case 1: case 8:
            if (cs.center) cs.left = cs.startLeft - cs.getStringWidth(a, buf, i); else cs.left = cs.startLeft;
            if (this.string[0].height) this.nextTop += this.string[0].height; else cs.top += fontHeight;
            break;
          case 12:
            color = buf[i] + (buf[i + 1] << 8); i += 2;
            if (color === 0xFF) cs.setColor(st.color); else cs.setColor(color);
            break;
          default: break;
        }
      } else {
        cs.printChar(c, true);
      }
    }
    if (a === 0) { this.nextLeft = cs.left; this.nextTop = cs.top; }
    st.xpos = cs.str.right;
  };
})();

if (typeof module !== 'undefined') module.exports = SCUMM;
