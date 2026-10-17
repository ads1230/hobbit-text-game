// Scripted flow checks: loss, new game (eraser), menus, about, roster, quit.
var h = require('./harness.js'), fs = require('fs');
var S = h.S, F = h.F, SPC = h.SPC, SC = h.SCENES;
var out = __dirname + '/../shots';
function shot(n) { h.png(SPC.screen, out + '/flow_' + n + '.png'); console.log('shot', n, 'tick', h.tickNow(), 'cmd', F.getCmd(), 'running', S.running, 'score', S.score, S.oscore, 'opp', S.opp); }
h.advance(1800);
F.pushEvent({ type: 'click', x: 80, y: 220 });  // Skip
h.advance(400);
S.oscore = 14;
function setPaddle(x, z) { SPC.mouse.x = Math.max(0, Math.min(511, x + S.box.l - S.plHw + 250)); SPC.mouse.y = Math.max(0, Math.min(341, S.box.t + 300 - z)); }
for (var z = 40; z < 300; z += 12) { setPaddle(0, z); h.advance(2); }   // serve
setPaddle(-200, 40);                                                     // then hide in the corner so the opponent scores
for (var i = 0; i < 40 && S.oscore < 15; i++) h.advance(60);
console.log('lost at', h.tickNow(), 'running', S.running);
h.advance(400); shot('loss');
console.log('reaction', S.reaction, 'seqTime', S.seqTime);
// click to start a new game: the eraser wipes the board
F.pushEvent({ type: 'click', x: 256, y: 200 });
h.advance(60); shot('erase1'); h.advance(120); shot('erase2'); h.advance(400); shot('newgame');
// menu: New Opponent -> back to the bar
F.pushEvent({ type: 'menu', menu: 'game', item: 2 }); h.advance(300); shot('bar_again');
// menu: roster
F.pushEvent({ type: 'menu', menu: 'file', item: 1 }); h.advance(200); shot('roster');
F.pushEvent({ type: 'click', x: 256, y: 200 }); h.advance(100);
// about box
F.pushEvent({ type: 'menu', menu: 'apple', item: 1 }); h.advance(200); shot('about');
F.pushEvent({ type: 'click', x: 256, y: 200 }); h.advance(200); shot('after_about');
// pick DC3 then the droid menu is enabled; paddle menu size
F.pushEvent({ type: 'click', x: 130, y: 90 }); h.advance(400); shot('dc3');
F.pushEvent({ type: 'menu', menu: 'paddle', item: 1 }); h.advance(100);
F.pushEvent({ type: 'menu', menu: 'blocker', item: 3 }); h.advance(100); shot('blocker');
console.log('blocker', S.blockerOn, S.bHw, S.bWeight, 'plHw', S.plHw);
// quit via the door
F.pushEvent({ type: 'menu', menu: 'game', item: 2 }); h.advance(300);
F.pushEvent({ type: 'click', x: 480, y: 60 }); h.advance(300); shot('quit');
console.log('quit', S.quit, 'done', h.isDone());
