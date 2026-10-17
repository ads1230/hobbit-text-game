// Plays a game with a simple bot on the player's side, logging the physics.
//   node tools/playtest.js [opp] [maxTicks] [startScore-startOscore]
var h = require('./harness.js'), fs = require('fs');
var S = h.S, F = h.F, SPC = h.SPC;
var out = __dirname + '/../shots';
h.advance(1800);
var tour = process.argv[2] === 'tour';
var opp = tour ? 1 : parseInt(process.argv[2] || '1', 10);
var maxT = parseInt(process.argv[3] || '20000', 10);
var start = (process.argv[4] || '0-0').split('-').map(Number);
var clicks = { 1: [80, 220], 2: [400, 330], 3: [380, 220], 4: [50, 150], 5: [170, 190], 6: [40, 80], 7: [260, 200], 8: [470, 200], 10: [130, 90] };
if (tour) F.pushEvent({ type: 'click', x: 230, y: 50 }); else F.pushEvent({ type: 'click', x: clicks[opp][0], y: clicks[opp][1] });
h.advance(400);
console.log('opp', S.opp, S.oppName, 'running', S.running);
if (start[0] || start[1]) { S.score = start[0]; S.oscore = start[1]; }
function setPaddle(x, z) { SPC.mouse.x = Math.max(0, Math.min(511, x + S.box.l - S.plHw + 250)); SPC.mouse.y = Math.max(0, Math.min(341, S.box.t + 300 - z)); }
var swingX = 0, shotAt = -1, log = [], shots = 0, lastScore = '', swing = 0, pz = 40, sweepDir = 1, lastOpp = 0;
for (var t = 0; t < maxT && !h.isDone(); t += 2) {
  // bot: follow the puck in x; when the puck comes close, swing forward through it
  var tx = S.px + (S.pvx * 2);
  if (swing > 0) { pz += 45; swing--; tx += swingX; }
  else if (S.pvz === 0 && S.pvx === 0 && S.pz < 400 && S.running) {    // serve: sweep through the waiting puck
    pz += 12 * sweepDir; if (pz > 300) sweepDir = -1; if (pz < 40) sweepDir = 1;
    tx = S.px;
  }
  else if (S.pvz < 0 && S.pz + S.pvz * 3 < 150) { swing = 5; pz = 40; swingX = Math.floor(Math.random() * 160) - 80; }
  else pz = Math.max(40, pz - 60);
  setPaddle(tx, pz);
  h.advance(2);
  var sc = S.score + '-' + S.oscore;
  if (sc !== lastScore) { lastScore = sc; console.log('t', h.tickNow(), 'score', sc, 'running', S.running); if (shots < 6) h.png(SPC.screen, out + '/game_' + opp + '_' + (shots++) + '.png'); }
  if (t % 400 === 0) log.push([h.tickNow(), S.px, S.pz, S.pvx, S.pvz, S.ox, S.oz, S.aiState, S.plx, S.plz].join(' '));
  if (!S.running && F.getCmd() === 0 && (S.score < 15 && S.oscore < 15 || (t % 600) === 0)) { F.pushEvent({ type: 'click', x: 256, y: 200 }); }
  if (tour) {
    if (S.running && S.score === 0 && S.oscore === 0 && (start[0] || start[1])) { S.score = start[0]; S.oscore = start[1]; console.log('t', h.tickNow(), 'forced score vs', S.opp, S.oppName); }
    if (start[0] && S.running && S.pvz > 0 && S.pz > 1000 && S.pz < 1200) { S.px = S.ox < 0 ? 200 : -200; S.pvx = 0; }   // cheat: the opponent misses
    if (S.opp !== lastOpp) { lastOpp = S.opp; console.log('t', h.tickNow(), 'now playing', S.opp, S.oppName, 'tournament', S.tournament); shotAt = t + 260; }
    if (t === shotAt) h.png(SPC.screen, out + '/tour_' + S.opp + '.png');
    if (F.getCmd() === 3 || S.quit) { h.advance(600); break; }
  } else if (S.score >= 15 || S.oscore >= 15) { h.advance(900); break; }
}
console.log(log.slice(0, 30).join('\n'));
console.log('final', S.score, S.oscore, 'cmd', F.getCmd(), 'tick', h.tickNow(), 'quit', S.quit, 'opp', S.opp, 'tournament', S.tournament, 'champion', S.champion);
h.png(SPC.screen, out + '/game_' + opp + '_end.png');
console.log('sounds', h.sounds.length, JSON.stringify(h.sounds.slice(-16)));
