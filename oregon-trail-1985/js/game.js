// game.js — The Oregon Trail (MECC, Apple II, 1985, version 1.4), ported program by program
// from the Applesoft on the disks: MENU, BUY SUPPLIES, OREGON TRAIL and its overlays
// (RIVER, TRADE, BUY, TALK, PACE, RATION, PART, LF, TOMB, MAP, END), FLOAT and WIN.
// Line numbers in comments refer to those listings.  Every formula, probability, price and
// message is theirs; only the way the player answers is different.
var Oregon85 = (function () {
  'use strict';

  var DEAD = 'dead', ARRIVED = 'arrived', QUIT = 'quit';

  function money(v) { v = Math.floor(v * 100 + 0.5); return Math.floor(v / 100) + '.' + ('0' + (v % 100)).slice(-2); }   // 200
  function plural(n, s) { return n + ' ' + s + (n === 1 ? '' : 's'); }

  async function run(io, T) {
    var R = io.rnd, INT = Math.floor;
    var LM$ = T.landmarks, LEG = T.legs, RC = T.rivers, MONTHS = T.months, I$ = T.items, S$ = T.store, AQ$ = T.actions, IL$ = T.ills, H$ = T.health, W$ = T.weathers, P$ = T.paces, R$ = T.rations, WC$ = T.weather;
    var talk = T.talk;

    // ------------------------------------------------------------------ MENU (side 1)
    var occupation = 0, names = [], startMonth = 0;
    while (true) {
      io.stage('title');
      var m = await io.ask({ type: 'choice', prompt: 'You may:', options: [
        { v: 1, num: 1, label: 'Travel the trail' }, { v: 2, num: 2, label: 'Learn about the trail' }, { v: 3, num: 3, label: 'See the Oregon Top Ten' }] });
      if (m === 1) break;
      if (m === 2) {                                                                   // 7000
        await io.notice('Try taking a journey by covered wagon across 2000 miles of plains, rivers, and mountains.  Try!  On the plains, will you slosh your oxen through mud and water-filled ruts or will you plod through dust six inches deep?');
        await io.notice("How will you cross the rivers?  If you have money, you might take a ferry (if there is a ferry).  Or, you can ford the river and hope you and your wagon aren't swallowed alive!");
        await io.notice("What about supplies?  Well, if you're low on food you can hunt.  You might get a buffalo...you might.  And there are bear in the mountains.");
        await io.notice('At the Dalles, you can try navigating the Columbia River, but if running the rapids with a makeshift raft makes you queasy, better take the Barlow Road.');
        await io.notice("If for some reason you don't survive -- your wagon burns, or thieves steal your oxen, or you run out of provisions, or you die of cholera -- don't give up!  Try again...and again...until your name is up with the others on The Oregon Top Ten.");
      } else if (m === 3) {                                                            // 2000
        io.topTen(await io.getTopTen());
        if (await io.ask({ type: 'yesno', prompt: 'Would you like to see how points are earned?' })) await pointsExplained(io);
      }
    }
    // 4000: occupation
    while (true) {
      io.stage('title');
      var o = await io.ask({ type: 'choice', prompt: 'Many kinds of people made the trip to Oregon.  You may:', options: [
        { v: 1, num: 1, label: 'Be a banker from Boston' }, { v: 2, num: 2, label: 'Be a carpenter from Ohio' }, { v: 3, num: 3, label: 'Be a farmer from Illinois' }, { v: 4, num: 4, label: 'Find out the differences between these choices' }] });
      if (o === 4) {
        await io.notice("Traveling to Oregon isn't easy!  But if you're a banker, you'll have more money for supplies and services than a carpenter or a farmer.");
        await io.notice('However, the harder you have to try, the more points you deserve!  Therefore, the farmer earns the greatest number of points and the banker earns the least.');
        continue;
      }
      occupation = o; break;
    }
    var MY = [0, 1600, 800, 400][occupation];                                          // 4030
    // 6000: names
    var pool = ['Zeke', 'Jed', 'Anna', 'Mary', 'Joey', 'Beth', 'John', 'Sara', 'Henry', 'Emily'], slots = [];
    pool.forEach(function (nm) { var z = INT(R() * 10); while (slots[z]) z = (z + 1) % 10; slots[z] = nm; });   // 6000-6015
    names = slots.slice(0, 5);
    while (true) {
      var leader = await io.ask({ type: 'text', prompt: 'What is the first name of the wagon leader?', maxlen: 9, placeholder: names[0] });
      if (leader) names[0] = leader;
      for (var k = 1; k <= 4; k++) {
        var nm = await io.ask({ type: 'text', prompt: 'What are the first names of the four other members in your party?  (Enter names or press Return)  Member ' + (k + 1) + ':', maxlen: 9, placeholder: names[k], allowEmpty: true });
        if (nm === '') break;                                                          // 6030: a blank keeps the rest of the names
        names[k] = nm;
      }
      io.party(names);
      if (await io.ask({ type: 'yesno', prompt: 'Are these names correct?  (' + names.join(', ') + ')' })) break;
      var which = await io.ask({ type: 'choice', prompt: 'Change which name?', options: names.map(function (n, i) { return { v: i, num: i + 1, label: n }; }) });
      var changed = await io.ask({ type: 'text', prompt: 'New name for ' + names[which] + ':', maxlen: 9, placeholder: names[which] });
      if (changed) names[which] = changed;
      if (await io.ask({ type: 'yesno', prompt: 'Are these names correct?  (' + names.join(', ') + ')' })) break;
    }

    // ------------------------------------------------------------------ BUY SUPPLIES
    io.stage('picture', { name: 'L0' });
    while (true) {                                                                     // 6000
      startMonth = await io.ask({ type: 'choice', prompt: 'It is 1848.  Your jumping off place for Oregon is Independence, Missouri.  You must decide which month to leave Independence.', options: [
        { v: 3, num: 1, label: 'March' }, { v: 4, num: 2, label: 'April' }, { v: 5, num: 3, label: 'May' }, { v: 6, num: 4, label: 'June' }, { v: 7, num: 5, label: 'July' }, { v: 0, num: 6, label: 'Ask for advice' }] });
      if (startMonth) break;
      await io.notice('You attend a public meeting held for "folks with the California - Oregon fever."  You\'re told:  If you leave too early, there won\'t be any grass for your oxen to eat.  If you leave too late, you may not get to Oregon before winter comes.  If you leave at just the right time, there will be green grass and the weather will still be cool.');
    }
    var AM = startMonth, AD = 1, AY = 1848;
    await io.notice("Before leaving Independence, you should buy equipment and supplies.  You have $" + money(MY) + " in cash, but you don't have to spend it all now.");
    await io.notice("You can buy whatever you need at Matt's General Store.");
    io.stage('store');
    await io.notice("Hello, I'm Matt.  So you're going to Oregon!  I can fix you up with what you need:\n- a team of oxen to pull your wagon\n- clothing for both summer and winter\n- plenty of food for the trip\n- ammunition for your rifles\n- spare parts for your wagon");
    var yoke = 0, food = 0, clothes = 0, boxes = 0, parts = [0, 0, 0], verb = 'buy';
    function bill() { return 40 * yoke + 0.2 * food + 10 * clothes + 2 * boxes + 10 * (parts[0] + parts[1] + parts[2]); }
    while (true) {                                                                     // 1010
      var TB = bill();
      io.storeSheet({ date: MONTHS[AM - 1] + ' ' + AD + ', ' + AY, lines: [['Oxen', 40 * yoke], ['Food', 0.2 * food], ['Clothing', 10 * clothes], ['Ammunition', 2 * boxes], ['Spare parts', 10 * (parts[0] + parts[1] + parts[2])]], total: TB, cash: MY });
      var z = await io.ask({ type: 'choice', prompt: 'Which item would you like to ' + verb + '?', options: [
        { v: 1, num: 1, label: 'Oxen' }, { v: 2, num: 2, label: 'Food' }, { v: 3, num: 3, label: 'Clothing' }, { v: 4, num: 4, label: 'Ammunition' }, { v: 5, num: 5, label: 'Spare parts' }, { v: 6, label: 'Leave store' }] });
      if (z === 1) yoke = await io.ask({ type: 'number', prompt: 'There are 2 oxen in a yoke; I recommend at least 3 yoke.  I charge $40 a yoke.  How many yoke do you want?', digits: 1, quick: [2, 3, 4, 5] });
      else if (z === 2) {
        while (true) {
          food = await io.ask({ type: 'number', prompt: "I recommend you take at least 200 pounds of food for each person in your family.  I see that you have 5 people in all.  You'll need flour, sugar, bacon, and coffee.  My price is 20 cents a pound.  How many pounds of food do you want?", digits: 4, quick: [500, 1000, 1500, 2000] });
          if (food <= 2000) break;
          await io.notice('Your wagon may only carry 2000 pounds of food.');
        }
      } else if (z === 3) clothes = await io.ask({ type: 'number', prompt: "You'll need warm clothing in the mountains.  I recommend taking at least 2 sets of clothes per person.  Each set is $10.00.  How many sets of clothes do you want?", digits: 2, quick: [5, 10, 15] });
      else if (z === 4) boxes = await io.ask({ type: 'number', prompt: 'I sell ammunition in boxes of 20 bullets.  Each box costs $2.00.  How many boxes do you want?', digits: 2, quick: [5, 10, 20] });
      else if (z === 5) {
        await io.notice("It's a good idea to have a few spare parts for your wagon.  Here are the prices:\n wagon wheel - $10 each\n wagon axle - $10 each\n wagon tongue - $10 each");
        for (var pi = 0; pi < 3; pi++) {
          while (true) {
            var n = await io.ask({ type: 'number', prompt: 'How many ' + ['wagon wheel', 'wagon axle', 'wagon tongue'][pi] + 's?', digits: 1, quick: [0, 1, 2, 3] });
            if (n <= 3) { parts[pi] = n; break; }
            await io.notice('Your wagon may only carry 3 ' + ['wagon wheel', 'wagon axle', 'wagon tongue'][pi] + 's.');
          }
        }
      } else {                                                                         // 5000
        if (MY < TB) { await io.notice('Okay, that comes to a total of $' + money(TB) + '.  But I see that you only have $' + money(MY) + ".  We'd better go over the list again."); verb = 'change'; continue; }
        if (!yoke) { await io.notice("Don't forget, you'll need oxen to pull your wagon."); continue; }
        MY = MY - TB;
        await io.notice("Well then, you're ready to start.  Good luck!  You have a long and difficult journey ahead of you.");
        break;
      }
    }
    io.storeSheet(null);

    // ------------------------------------------------------------------ OREGON TRAIL
    var NP = 5, N$ = names.slice(), H1 = [0, 0, 0, 0, 0], H2 = [0, 0, 0, 0, 0];
    var I = [0, 1, 2 * yoke, clothes, boxes * 20, parts[0], parts[1], parts[2], food];   // 29005: I(2) oxen, I(3) clothing, I(4) bullets, I(5..7) parts, I(8) food
    var PF = I[8];
    var LM = 0, NM = 0, D = 0, DD = 0, MD = 0, M = 0, H = 0, P = 1, RR = 1, FS = 0, AR, AS, W, TM, ZO = 0, SD = 0, B = 0, LL = 0, W1 = 0, F9 = 0, HR = 0, H0 = 0;
    var FC = 0, BS = 0, OP = 0, F0 = 0, QT = 0, QP = 0, PP = 0, TR = 0, TS = 0;
    var RE = [0, 0.007, 0, 0, 0, 0, 0, 0.06, 0, 0.02, 0, 0, 0.01, 0.02, 0];              // 29001
    var visited = [0], SN = 0, DL = -1, LN = -1, graves = io.getTombstones(), scenery = 'PRAIRIE', NI = 0, IX = 0, FX = 0, WG = 1, lastEvent = '', dead = false;
    var A = 0;
    function W_(Z) { var code = WC$[ZO].charCodeAt(AM * 2 + Z - 2); return Z ? 0.003 * (code - 30) : code - 50; }   // FN W: the month's temperature / chance of rain for this stretch
    AS = R() * 12 * (AM < 4 ? 1 : 0); W = INT((W_(0) + 10) / 20); TM = W; AR = 7 - AM + R();                          // 29000, 29004
    function dateText() { return MONTHS[AM - 1] + ' ' + AD + ', ' + AY; }                                             // 250
    function shortName(lm) { var s = LM$.name[lm]; return s.indexOf('the ') === 0 ? s.slice(4) : s; }                // 260
    function recalc() { var v = I[2] / 4; if (v > 1) v = 1; FC = NP * (4 - RR); BS = MD * v * (P + 1) / 2; OP = I[3] / NP; F0 = 2 * (RR - 1); }  // 650
    function healthIdx() { return INT(Math.min(H, 139) / 35); }
    function status() {
      io.status({ date: dateText(), weather: W$[W], health: H$[healthIdx()], food: INT(PF), next: D > 0 ? INT(D) : 0, nextName: NM !== LM ? LM$.name[NM] : '', miles: INT(M), cash: money(MY), lm: LM, nm: NM, party: N$.slice(0, NP), ill: H1.slice(0, NP), travelling: LL });
    }
    function alivePick() {                                                                                               // 11500
      var Z = INT(R() * NP);
      do { Z = (Z + 1) * (Z < NP - 1 ? 1 : 0); } while (H1[Z] < 0);
      return Z + (NP > 1 && Z === 0 ? 1 : 0);
    }
    function findGrave() { DL = -1; graves.forEach(function (g, i) { if (SN === g.sn && DL < g.miles && g.miles < D) { LN = i; DL = g.miles; } }); }   // 450
    async function lose(A$, Z, extra) {                                                                                  // 550-570
      var XX = INT(R() * Z + 1);
      await io.notice(A$ + '.  Lose ' + plural(XX, 'day') + '.', extra);
      SD = XX; await restDays();
    }
    async function restDays() {                                                                                          // 500
      if (!SD) return;
      var ZX = D, ZY = M, DI = P; D = 0; P = 0;
      for (var k = 1; k <= SD; k++) { await day(true); if (dead) break; }
      SD = 0; D = ZX; M = ZY; I[8] = PF; P = DI;
    }
    async function died(Q) {                                                                                             // TOMB.LIB 50000
      if (H > 105) H = 105;
      NP = NP - 1; H1[Q] = H1[NP]; H1[NP] = -1; H2[Q] = H2[NP]; var t = N$[Q]; N$[Q] = N$[NP]; N$[NP] = t;
      recalc();
      if (NP) return false;
      // everyone has died
      io.tune('TS');
      io.stage('tombstone', { name: t });
      var A$ = '';
      if (await io.ask({ type: 'yesno', prompt: 'Here lies ' + t + '.  Would you like to write an epitaph?' })) {
        while (true) {
          A$ = await io.ask({ type: 'text', prompt: 'What would you like on the tombstone?', maxlen: 29, allowEmpty: true });
          io.stage('tombstone', { name: t, epitaph: A$ });
          if (!(await io.ask({ type: 'yesno', prompt: 'Would you like to make changes?' }))) break;
        }
      }
      io.saveTombstone({ sn: NM * 100 + LM, miles: D, name: t, epitaph: A$, date: dateText() });
      await io.notice('All of the people in your party have died.');
      dead = true;
      return true;
    }
    async function illness(resting) {                                                                                    // 10300
      HR = 20;
      var V = INT(R() * 6) + 3, Z = alivePick(), who = N$[Z];
      if (H1[Z]) {
        await io.notice(who + ' has died.', { image: 'EVENTS:8', tag: 'death' });
        H1[Z] = -1; if (await died(Z)) return;
      } else {
        await io.notice(who + ' has ' + IL$[V] + '.', { tag: 'ill' });
        H1[Z] = V; H2[Z] = 10;
      }
    }
    // 4100
    function supplies() { io.supplies({ oxen: I[2], clothing: I[3], bullets: I[4], wheels: I[5], axles: I[6], tongues: I[7], food: I[8], cash: money(MY) }); }
    async function checkSupplies() { supplies(); await io.notice('Your Supplies', { supplies: true }); }
    // 4200 / MAP.LIB
    async function lookAtMap() { io.stage('map', { visited: visited, lm: LM, nm: NM, d: D, dd: DD }); await io.notice('Map of the Oregon Trail', { map: true }); }
    // 4300 PACE.LIB
    async function changePace() {
      while (true) {
        var a = await io.ask({ type: 'choice', prompt: 'Change pace (currently "' + P$[P - 1] + '").  The pace at which you travel can change.  Your choices are:', options: [
          { v: 1, num: 1, label: 'a steady pace' }, { v: 2, num: 2, label: 'a strenuous pace' }, { v: 3, num: 3, label: 'a grueling pace' }, { v: 4, num: 4, label: 'find out what these different paces mean' }] });
        if (a === 4) {
          await io.notice('steady - You travel about 8 hours a day, taking frequent rests.  You take care not to get too tired.\n\nstrenuous - You travel about 12 hours a day, starting just after sunrise and stopping shortly before sunset.  You stop to rest only when necessary.  You finish each day feeling very tired.\n\ngrueling - You travel about 16 hours a day, starting before sunrise and continuing until dark.  You almost never stop to rest.  You do not get enough sleep at night.  You finish each day feeling absolutely exhausted, and your health suffers.');
          continue;
        }
        P = a; recalc(); return;
      }
    }
    // 4400 RATION.LIB
    async function changeRations() {
      RR = await io.ask({ type: 'choice', prompt: 'Change food rations (currently "' + R$[RR - 1] + '").  The amount of food the people in your party eat each day can change.  These amounts are:', options: [
        { v: 1, num: 1, label: 'filling - meals are large and generous.' }, { v: 2, num: 2, label: 'meager - meals are small, but adequate.' }, { v: 3, num: 3, label: 'bare bones - meals are very small; everyone stays hungry.' }] });
      recalc();
    }
    // 4500 rest
    async function stopToRest() {
      SD = await io.ask({ type: 'number', prompt: 'How many days would you like to rest?', digits: 1, quick: [1, 2, 3, 5] });
      if (!SD) return;
      F9 = 0; var JQ = P, ZX = D, ZY = M; P = 0; D = 0;
      for (var k = 1; k <= SD; k++) { await day(true); if (dead) break; }
      SD = 0; D = ZX; M = ZY; P = JQ;
    }
    // 4700 TALK.LIB
    async function talkToPeople() {
      var e = (talk[LM] || [])[A];
      if (!e) return;
      await io.notice(e.who + ' tells you:\n"' + e.text + '"', { talk: true });
    }
    // 4800 BUY.LIB — the fort store: prices rise a quarter for each stage of the trail already passed
    async function buySupplies() {
      var Q = (LM > 2) + (LM > 4) + (LM > 7) + (LM > 10) + (LM > 12) + (LM > 13);
      while (true) {
        var opts = S$.name.map(function (nm, i) { var v = parseFloat(S$.price[i]); v = v + 0.25 * Q * v; return { v: i + 1, num: i + 1, label: nm + ' — $' + money(v) + ' per ' + S$.unit[i] }; });
        opts.push({ v: 8, num: 8, label: 'Leave store' });
        supplies();
        var L = await io.ask({ type: 'choice', prompt: LM$.name[LM] + ', ' + dateText() + '.  You have $' + money(MY) + ' to spend.  You may buy:', options: opts });
        if (L === 8) { PF = I[8]; return; }
        var V = parseFloat(S$.price[L - 1]); V = V + 0.25 * Q * V;
        var Z = await io.ask({ type: 'number', prompt: 'How many ' + S$.unit[L - 1] + S$.plural[L - 1] + '?', digits: L === 7 ? 4 : 3 });
        if (Z * V > MY + 0.001) { await io.notice('You cannot afford that many.'); continue; }
        if (L === 1 && I[2] + Z > 20) { await io.notice('You may only take 20 oxen.'); continue; }
        if (L === 7 && I[8] + Z > 2000) { await io.notice('Your wagon may only carry 2000 pounds of food.'); continue; }
        if (L > 3 && L < 7 && I[L + 1] + Z > 3) { await io.notice('Your wagon may only carry 3 ' + I$[L + 1] + '.'); continue; }
        var K = 1 + 19 * (L === 3 ? 1 : 0);                                              // a box holds twenty bullets
        MY = MY - Z * V; I[L + 1] = I[L + 1] + Z * K;
      }
    }
    // 4900 TRADE.LIB
    async function attemptToTrade() {
      supplies();
      var X = INT(R() * 7), Y = INT(R() * 7); Y = Y + (Y === X ? 1 : 0); Y = Y * (Y < 7 ? 1 : 0);
      var ZX = parseFloat(S$.price[X]) / (1 + 19 * (X === 2 ? 1 : 0)), ZY = parseFloat(S$.price[Y]) / (1 + 19 * (Y === 2 ? 1 : 0));
      var Z = ZX / (ZY * (1 + 1.2 * R())), Q = INT(I[X + 2] + 0.5), V = 1, F = INT(Z);
      if (Z < 1) { V = INT(1 / Z); F = 1; }
      if ((X === 2 && Y === 6) || (Y === 2 && X === 6)) { V = V * 50; F = F * 50; }
      var tooMany = (I[Y + 2] + F > 3 && Y < 6 && Y > 2) || (Y === 6 && I[Y + 2] + F > 2000) || (Y === 0 && I[Y + 2] + F > 20);
      if (R() > 0.95 || tooMany) { await io.notice('No one wants to trade with you today.'); return; }
      var wants = V + ' ' + itemName(X + 2, V), gives = F + ' ' + itemName(Y + 2, F);
      if (Q < V) { await io.notice('You meet another emigrant who wants ' + wants + ".  You don't have this."); return; }
      var he = R() > 0.67 ? 'She' : 'He';
      if (await io.ask({ type: 'yesno', prompt: 'You meet another emigrant who wants ' + wants + '.  ' + he + ' will trade you ' + gives + '.  Are you willing to trade?' })) {
        I[Y + 2] = I[Y + 2] + F; I[X + 2] = Q - V; recalc();
      }
      PF = I[8];
    }
    function itemName(L, n) {                                                                                            // 50250: singular forms of the item names
      var Z$ = I$[L];
      if (n !== 1) return Z$;
      if (L === 8) return 'pound of food';
      if (L === 3) return 'set of clothing';
      if (L === 2) return 'ox';
      return Z$.slice(0, -1);
    }
    // PART.LIB 42000
    async function brokenPart() {
      var part = S$.unit[B - 2];
      if (await io.ask({ type: 'yesno', prompt: 'Broken wagon ' + part + '.  Would you like to try to repair it?', image: 'EVENTS:4' })) {
        if (R() < 0.5) { await io.notice('You were able to repair the wagon ' + part + '.'); B = 0; return; }
        await io.notice('You were unable to repair the broken wagon ' + part + '.  You must replace it with a spare part.');
      } else await io.notice('You did not repair the broken wagon ' + part + '.  You must replace it with a spare part.');
      if (I[B]) { I[B] = I[B] - 1; B = 0; return; }
      await io.notice("Since you don't have a spare " + part + ', you must trade for one.');
    }
    // LF.LIB
    function lossList(Z, list, prefix) { return prefix + (Z ? '\n   ' + list.join('\n   ') : ''); }
    async function wagonFire() {                                                                                         // 50000
      var list = [], Z = 0;
      for (var Y = 3; Y <= 7; Y++) { var YY = I[Y]; if (R() < 0.5 && YY) { var X = INT(R() * YY + 1); I[Y] = YY - X; list.push(X + ' ' + itemName(Y, X)); Z++; } }
      if (PF && R() < 0.5) { var X2 = INT(R() * PF + 1); PF = PF - X2; I[8] = PF; list.push(X2 + ' ' + itemName(8, X2)); Z++; }
      if (Z > 0) await io.notice(lossList(Z, list, 'A fire in the wagon results in loss of:'), { image: 'EVENTS:5' });
    }
    async function abandonedWagon() {                                                                                    // 51000
      var list = [], Z = 0;
      for (var Y = 3; Y <= 7; Y++) if (R() < 0.5) { var X = INT(R() * 3 + 1); X = X + X * (Y === 4 ? 1 : 0) * 20; if (Y < 5 || I[Y] + X < 4) { I[Y] = I[Y] + X; list.push(X + ' ' + itemName(Y, X)); Z++; } }
      await io.notice(Z ? lossList(Z, list, 'You find an abandoned wagon with the following:') : 'You find an abandoned wagon, but it is empty.');
    }
    async function thief() {                                                                                             // 52000
      I[8] = PF; var Z = 0, Y = INT(R() * 4) + 2; Y = Y + 3 * (Y === 5 ? 1 : 0); var YY = I[Y], text = '';
      if (YY) { var X = 100 * (YY > 100 ? 1 : 0) + YY * (YY < 101 ? 1 : 0); X = INT(R() * X + 1); I[Y] = YY - X; PF = PF - X * (Y === 8 ? 1 : 0); text = X + ' ' + itemName(Y, X); Z = 1; if (I[Y] < 0) I[Y] = 0; }
      recalc();
      if (Z) await io.notice('A thief comes during the night and steals ' + text + '.', { image: 'EVENTS:7' });
    }
    async function noOxenCheck() {                                                                                       // 21000
      if (!I[2]) { await io.notice('You are unable to continue your journey.  You have no oxen to pull the wagon.'); B = 2; }
    }
    async function gravesite() {                                                                                         // 10400 + TOMB.LIB 50100
      if (await io.ask({ type: 'yesno', prompt: 'You pass a gravesite.  Would you like to look closer?' })) {
        var g = graves[LN];
        io.stage('tombstone', { name: g.name, epitaph: g.epitaph });
        await io.notice('Here lies ' + g.name + (g.epitaph ? '\n' + g.epitaph : ''), { grave: true });
        io.stage('travel');
      }
      findGrave();
    }
    var eventImages = { 'Severe thunderstorm': 'EVENTS:1', 'Severe blizzard': 'EVENTS:3', 'Hail storm.': 'EVENTS:2', 'Snow bound': 'EVENTS:8' };
    async function event(L8) {                                                                                           // 10000-11400
      switch (L8) {
        case 0: await lose('Snow bound', 10, { image: 'EVENTS:8' }); return;
        case 1: if (TM > 2) { var Z = alivePick(); H1[Z] = 2; H2[Z] = 10; await io.notice(N$[Z] + ' has a snakebite.', { tag: 'ill' }); } return;
        case 3: await illness(); return;
        case 4: await gravesite(); return;
        case 5: PF = PF + 30; await io.notice('Indians help find food.'); return;
        case 6:
          if (TM === 2 || TM === 3) return;
          if (TM < 2) { AR = AR - 1; AS = AS + 8; await lose('Severe blizzard', 1, { image: 'EVENTS:3' }); }
          else { AR = AR + 1; await lose('Severe thunderstorm', 1, { image: 'EVENTS:1' }); }
          return;
        case 7:
          if (LM > 11 && TM < 5) { if (R() > 0.5) await lose('Heavy fog', 1); else await io.notice('Heavy fog'); }
          if (LM <= 11 && TM > 4) await io.notice('Hail storm.', { image: 'EVENTS:2' });
          return;
        case 8:
          if (R() < 0.33) { B = INT(R() * 3) + 5; await brokenPart(); SD = 1; await restDays(); return; }
          if (R() < 0.5) { var Z2 = alivePick(), V = INT(R() * 2); H1[Z2] = V; H2[Z2] = 30; await io.notice(N$[Z2] + ' has ' + IL$[V] + '.', { tag: 'ill' }); return; }
          I[2] = I[2] - 0.5;
          await io.notice('One of the oxen ' + (I[2] === INT(I[2]) ? 'has died.' : 'is injured.'));
          recalc(); await noOxenCheck(); return;
        case 9: await lose(R() < 0.5 ? 'Wrong trail' : 'Lose trail', 5); return;
        case 10: if (R() < 0.5) { HR = 10; await io.notice('Rough trail'); } else await lose('Impassible trail', 10); return;
        case 11: PF = PF + 20; await io.notice('Find wild fruit.', { image: 'EVENTS:6' }); return;
        case 12: {
          var r = INT(R() * 3);
          if (r === 1) { var Z3 = alivePick(); await lose(N$[Z3] + ' is lost', 5); }
          else if (r === 2) await lose('Ox wanders off', 3);
          else await wagonFire();
          return;
        }
        case 13:
          if (R() < 0.5) { await thief(); await noOxenCheck(); } else await abandonedWagon();
          return;
        case 14:
          F9 = 1;
          if (R() < 0.2) { HR = 20; io.print('Bad water'); }
          else if (R() < 0.5) { HR = 10; io.print('Very little water'); }
          else io.print('Inadequate grass');
          return;
      }
    }
    // 4000: sizing up the situation
    async function menu() {
      F9 = 0;
      while (true) {
        B = B * (B !== 1 ? 1 : 0);
        if (H > 139) H = 139;
        var opts = [], L = 1;
        for (var i = 0; i < 7; i++) opts.push({ v: i + 1, num: L++, label: AQ$[i] });
        if (!LL) { opts.push({ v: 8, num: L++, label: AQ$[7] }); if (LM$.type[LM] === 1) opts.push({ v: 9, num: L++, label: AQ$[8] }); }
        if (LL) opts.push({ v: 10, num: L++, label: AQ$[9] });
        io.stage(LL ? 'travel' : 'picture', LL ? undefined : { name: 'L' + LM });
        status();
        var X = await io.ask({ type: 'choice', prompt: (LL ? '' : shortName(LM) + ', ') + dateText() + '.  Weather: ' + W$[W] + '.  Health: ' + H$[healthIdx()] + '.  Pace: ' + P$[P - 1] + '.  Rations: ' + R$[RR - 1] + '.  You may:', options: opts, menu: true });
        if (X === 1) {
          if (!B) B = 2 * (I[2] === 0 ? 1 : 0);
          if (!B) return;
          await io.notice('You must trade for ' + (B === 2 ? 'an ' : 'a ') + S$.unit[B - 2] + ' to be able to continue.');
          continue;
        }
        switch (X) {
          case 2: await checkSupplies(); break;
          case 3: await lookAtMap(); break;
          case 4: await changePace(); break;
          case 5: await changeRations(); break;
          case 6: await stopToRest(); break;
          case 7: await attemptToTrade(); SD = 1; I[2] = I[2] * (I[2] > 0 ? 1 : 0); break;
          case 8: await talkToPeople(); break;
          case 9: await buySupplies(); break;
          case 10: await hunt(); SD = 1; break;
        }
        if (dead) return;
        if (SD > 0) await restDays();
        if (dead) return;
        if (I[B]) { I[B] = I[B] - (B > 2 ? 1 : 0); B = 0; }
      }
    }
    // HUNT.LIB + the machine-code hunt
    async function hunt() {
      var Q = PF, Z = I[4];
      var res = await io.hunt({ bullets: Z, deer: LM > 3 && LM < 13, bear: LM > 6, buffalo: LM < 7, zone: ZO });
      var meat = { 0: 40, 1: 200, 2: 300, 3: 30, 4: 8, 5: 4 };                          // pounds by kind: deer, bear, buffalo, antelope, rabbit, squirrel
      var L = 0; res.kills.forEach(function (k) { L += meat[k]; });
      L = INT(L / (2 - (L < 3 ? 1 : 0)));                                                // 50011
      I[4] = res.bullets;
      var text = '';
      if (L) text = 'From the animals you shot, you got ' + plural(L, 'pound') + ' of meat.  ';
      if (L && I[8] >= 2000) { L = 0; text += 'However, your wagon is full.'; }
      else {
        if (L && L + I[8] > 2000) { L = 2000 - I[8]; if (L && L <= 100) text += 'However, your wagon will only hold another ' + L + ' pounds of food.'; }
        if (L > 100) { text += 'However, you were only able to carry 100 pounds back to the wagon.'; L = 100; }
      }
      if (!L) text += 'You were unable to shoot any food.';
      I[8] = Q + L; PF = I[8];
      await io.notice(text.trim());
    }
    // 3100-3499: one day
    async function day(resting) {
      var SDnow = resting ? 1 : 0;
      QT = W_(0); QP = W_(1);
      if (!SDnow) { if (await io.travelDay(travelState())) { I[8] = PF; await menu(); if (dead) return; PF = I[8]; } }
      if (H > 139) H = 139;
      RE[0] = AS > 30 ? 1 : 0; RE[14] = 0.5 * (AR < 0.1 ? 1 : 0); RE[3] = 0.01 + H / 1500; RE[4] = D < DL ? 1 : 0; RE[5] = 0.05 * (PF === 0 ? 1 : 0); RE[6] = (W > 7 ? 1 : 0) + 0.15 * (TM < 2 ? 1 : 0);
      HR = 0;
      if (!SDnow) {
        for (var L8 = 0; L8 <= 14; L8++) {
          if (R() < RE[L8]) {
            await event(L8);
            if (dead) return;
            if (B > 0) { await menu(); if (dead) return; break; }
          }
        }
      }
      H0 = 0;
      for (var L = 0; L <= 4; L++) if (H1[L] > 0) { H2[L] = H2[L] - 1; H0 = H0 + 1; if (H2[L] < 1) H1[L] = 0; }
      if (R() < 0.5) { TM = QT + INT(R() * 41); PP = R() < QP ? 1 : 0; W = INT((TM + 10) / 20); TM = W; }
      TR = 0; TS = 0;
      if (PP) { var Z = R() < 0.3 ? 1 : 0; W = 6 + Z + Z; TR = 0.2 + 0.6 * Z; if (TM < 2) { W = W + 1; TS = 8 * TR; TR = 0; } }
      var ZT = TM - 3; if (ZT < 0) ZT = 2 - TM;
      var ZC = 5 - TM - TM - OP; if (ZC < 0) ZC = 0;
      var X = ZC > 0.5, Y = PF === 0, ZF = F0; if (Y) ZF = 8;
      var ZP = (W > 5 ? 1 : 0) + (W > 7 ? 1 : 0) + P + P;
      var Zf = FS * 0.5; if (X || Y) Zf = FS + 0.8;
      FS = Zf; H = 0.9 * H + ZT + ZC + ZF + ZP + FS + H0 + HR; PF = PF - FC; if (PF < 0) PF = 0;
      if (!W1 && H > 139) { await illness(resting); if (dead) return; }
      AR = 0.9 * AR + TR; AS = 0.97 * AS + TS;
      if (AS) { if (TM > 2 || W === 8) { AR = AR + 0.5; AS = AS - 5; if (AS < 0) AS = 0; } }
      var Zs = 1 - AS / 40; if (Zs < 0) Zs = 0;
      var V = BS * (1 - 0.1 * H0) * (SDnow ? 0 : 1) * Zs; if (1.1 * V > D) V = D;
      D = D - V; M = M + V;
      if (!SDnow) { var VP = INT(((FX - D * 2 - IX) / 4) + 0.5); if (VP) { for (var L4 = 1; L4 <= VP; L4++) { WG = WG * (WG < 3 ? 1 : 0) + 1; IX = IX + 4; } } }
      if (H > 139) H = 139;
      AD = AD + 1;
      if (AD > 31 || (AD > 28 && AM === 2) || (AD > 30 && (AM === 4 || AM === 6 || AM === 9 || AM === 11))) { AD = 1; AM = AM + 1; AY = AY + (AM > 12 ? 1 : 0); AM = AM * (AM < 13 ? 1 : 0) + (AM > 12 ? 1 : 0); QT = W_(0); QP = W_(1); }
      status();
      if (resting) io.restDay(dateText());
    }
    function travelState() { return { scenery: scenery, landmark: NI, ix: IX, frame: WG, ground: AS >= 1 ? 3 : (AR <= 0.2 ? 5 : 1), weather: W, resting: SD }; }

    // 3500: a river crossing (RIVER.LIB, CROSS.LIB)
    async function river() {
      W1 = 1;
      var rc = (LM === 2 ? 1 : 0) + 2 * (LM === 9 ? 1 : 0) + 3 * (LM === 12 ? 1 : 0), RD, RW, RS, RB, IX2 = 1, Z = 0, F = 0, A$ = '', list = [], anim = 0;
      function measure() { RD = INT((RC.depth[rc] + AR * 2) * 10 + 0.5) / 10; RW = INT(RC.width[rc] + 15 * AR); RS = RC.swift[rc] + AR; RB = RC.bottom[rc]; }
      measure();
      io.stage('river', { rc: rc });
      await io.notice('You must cross the river in order to continue.  The river at this point is currently ' + RW + ' feet across, and ' + RD + ' feet deep in the middle.');
      function loseSupplies(V) { for (var L = 3; L <= 8; L++) { var X = I[L]; if (X && R() < V) { var Y = INT(R() * X + 1); I[L] = X - Y; list.push(Y + ' ' + itemName(L, Y)); Z++; } } }   // 50205
      function loseOxen(V) { var Y = 0, X = I[2]; if (!X) return; for (var L = 1; L <= X; L++) if (R() < V) Y++; if (Y) { list.push(Y === 1 ? '1 ox' : Y + ' oxen'); Z++; I[2] = X - Y; if (I[2] < 0) I[2] = 0; } }   // 50185
      function drown(V) { for (var L = (NP > 1 ? 1 : 0); L <= NP - 1; L++) if (R() < V) { list.push(N$[L] + ' (drowned)'); H1[L] = -2; Z++; V = V * (Z < 11 ? 1 : 0); } }   // 50175
      async function ford() {                                                                                            // 50035
        Z = 0; anim = 2; F = 0; A$ = 'You made the crossing successfully.';
        if (RD < 2.5) {
          if (RB === 1) { A$ = 'It was a muddy crossing, but you did not get stuck.'; if (R() < 0.4 / IX2) { A$ = 'You become stuck in the mud.  Lose 1 day.'; SD = 1; await restDays(); Z = 0; } }
          else if (RB === 2) { A$ = 'It was a rough crossing, but you did not overturn.'; if (R() < 0.16 / IX2) { A$ = 'The wagon tipped over'; var Z$ = ' but you did not lose anything.'; loseSupplies(0.1 + R() * 0.3); if (Z) Z$ = '.  You lose:'; A$ = A$ + Z$; } }
          return;
        }
        if (RD < 3) { A$ = 'Your supplies got wet.  Lose 1 day.'; SD = 1; await restDays(); Z = 0; return; }
        loseSupplies((RD / 10) / IX2); loseOxen(((RD - 1) / 10) / IX2); drown(((RD - 2.5) / 10) / IX2);
        if (Z) A$ = 'The river is too deep to ford.  You lose:';
      }
      async function float_() {                                                                                          // 50080
        Z = 0; anim = 3; F = 0;
        if (RD < 1.5) { F = 1; await io.notice('The river is too shallow to float across.'); return; }
        SD = 1; await restDays(); Z = 0; A$ = 'You had no trouble floating the wagon across.';
        var V = (RD > 2.5 ? 1 : 0) * (RS / 20) / IX2;
        if (R() < V) { loseSupplies((0.4 + RS / 25) / IX2); drown(((RS - 3) / 15) / IX2); }
        if (Z) A$ = 'The wagon tipped over while floating.  You lose:';
      }
      async function ferry() {                                                                                           // 50100
        Z = 0; F = 0;
        if (RD < 2.5) { F = 1; await io.notice('The ferry is not operating today because the river is to shallow.'); return; }
        var X = INT(R() * 5 + 2);
        var yes = await io.ask({ type: 'yesno', prompt: 'The ferry operator says that he will charge you $5.00 and that you will have to wait ' + X + ' days.  Are you willing to do this?' });
        if (yes && MY < 5) { await io.notice('You do not have enough money to pay for the ferry.'); F = 1; return; }
        if (!yes) { F = 1; return; }
        anim = 1; MY = MY - 5; SD = X; await restDays(); Z = 0; F = 0;
        A$ = 'The ferry got your party and wagon safely across.';
        var V = 0.05 * (RS > 5 ? 1 : 0) + 0.1 * (RS > 10 ? 1 : 0);
        if (R() < V) { A$ = 'The ferry broke loose from moorings. You lose:'; loseSupplies(0.8); drown(0.2); loseOxen(0.5); if (!Z) A$ = 'Some trouble in crossing but nothing was lost.'; }
      }
      async function guide() {                                                                                           // 50130
        var X = INT(R() * 2 + 2); F = 1;
        if (I[3] < X) { await io.notice('A Shoshoni guide says that he will take your wagon across the river in exchange for ' + X + " sets of clothing.  You don't have " + X + ' sets of clothing.'); return; }
        if (!(await io.ask({ type: 'yesno', prompt: 'A Shoshoni guide says that he will take your wagon across the river in exchange for ' + X + ' sets of clothing.  Will you accept this offer?' }))) return;
        F = 0; IX2 = 5; I[3] = I[3] - X;
        var V = 1, Z$ = 'ford the river.'; if (RD > 2.4) { Z$ = 'float your wagon across.'; V = 2; }
        await io.notice('The Shoshoni guide will help you ' + Z$);
        Z = 0; if (V === 1) await ford(); else await float_();
      }
      while (true) {                                                                                                     // 50010
        measure();
        var opts = [{ v: 1, num: 1, label: 'attempt to ford the river' }, { v: 2, num: 2, label: 'caulk wagon and float it across' }], n = 3, extra = RC.option[rc];
        if (extra) opts.push({ v: extra === 1 ? 3 : 4, num: n++, label: extra === 1 ? 'hire an Indian to help' : 'take a ferry across' });
        opts.push({ v: 5, num: n++, label: 'wait to see if conditions improve' }); opts.push({ v: 6, num: n++, label: 'get more information' });
        status();
        var V = await io.ask({ type: 'choice', prompt: shortName(LM) + ', ' + dateText() + '.  Weather: ' + W$[W] + '.  River width: ' + RW + ' feet.  River depth: ' + RD + ' feet.  You may:', options: opts, menu: true });
        if (V === 6) {
          await io.notice('To ford a river means to pull your wagon across a shallow part of the river, with the oxen still attached.\n\nTo caulk the wagon means to seal it so that no water can get in.  The wagon can then be floated across like a boat.\n\nTo use a ferry means to put your wagon on top of a flat boat that belongs to someone else.  The owner of the ferry will take your wagon across the river.');
          continue;
        }
        if (V === 5) { await io.notice('You camp near the river for a day.'); SD = 1; await restDays(); if (dead) return; continue; }
        list = []; Z = 0;
        if (V === 1) await ford(); else if (V === 2) await float_(); else if (V === 3) await guide(); else await ferry();
        if (dead) return;
        if (F) continue;
        break;
      }
      W1 = 0;
      io.stage('crossing', { rc: rc, kind: anim, tipped: Z > 0 });
      await io.notice(lossList(Z, list, A$), { crossing: true });
      if (Z) for (var L1 = 0; L1 <= 4; L1++) if (H1[L1] === -2) { if (await died(L1)) return; }
      PF = I[8];
    }

    // 2100-2120: what happens at a landmark before setting out again
    async function beforeLeaving() {
      var Z = 1;
      if (LM === 16) { var r = await theDalles(); if (r) return r; }
      io.stage('picture', { name: 'L' + LM });
      if (!LM$.alt[LM]) return Z;
      while (true) {
        Z = await io.ask({ type: 'choice', prompt: 'The trail divides here.  You may:', options: [
          { v: 1, num: 1, label: 'head for ' + LM$.name[LEG.next[LM$.leg[LM]]] }, { v: 2, num: 2, label: 'head for ' + LM$.name[LEG.next[LM$.alt[LM]]] }, { v: 3, num: 3, label: 'see the map' }] });
        if (Z !== 3) return Z;
        await lookAtMap();
      }
    }
    // END.LIB 50000 at The Dalles
    async function theDalles() {
      while (true) {
        var c = await io.ask({ type: 'choice', prompt: 'The trail divides here.  You may:', options: [{ v: 1, num: 1, label: 'float down the Columbia River' }, { v: 2, num: 2, label: 'take the Barlow Toll Road' }] });
        if (c === 1) return await raft();
        var V = 5 + INT(I[2] + 0.5) * 0.5;
        if (await io.ask({ type: 'yesno', prompt: 'You must pay $' + money(V) + ' to travel the Barlow road.  Are you willing to do this?' })) {
          if (MY > V) { MY = MY - V; return null; }
          await io.notice('You do not have enough cash.');
        }
      }
    }
    // FLOAT: rafting the Columbia
    async function raft() {
      I[8] = PF;
      var list, Z;
      function loseSupplies(V) { for (var L = 3; L <= 8; L++) { var X = I[L]; if (X && R() < V) { var Y = INT(R() * X + 1); I[L] = X - Y; list.push(Y + ' ' + itemName(L, Y)); Z++; } } }
      function loseOxen(V) { var Y = 0, X = I[2]; if (!X) return; for (var L = 1; L <= X; L++) if (R() < V) Y++; if (Y) { list.push(Y === 1 ? '1 ox' : Y + ' oxen'); Z++; I[2] = X - Y; if (I[2] < 0) I[2] = 0; } }
      function drown(V) { for (var L = (NP > 1 ? 1 : 0); L <= NP - 1; L++) if (R() < V) { list.push(N$[L] + ' (drowned)'); H1[L] = -2; Z++; V = V * (Z < 11 ? 1 : 0); } }
      var everyoneDead = false;
      // 700-770: what a collision costs; returns the message to show and whether the raft is finished
      function collision(kind) {
        list = []; Z = 0; var A$;
        if (kind === 'shore') { A$ = 'The raft has hit the shore.'; drown(0.15); loseOxen(0.3); loseSupplies(0.5); }
        else { A$ = 'The raft has hit a rock.'; drown(0.6); loseOxen(0.6); loseSupplies(0.7); }
        var Z$ = Z ? '  You have lost:' : '';
        if (Z > 9) { A$ = 'The raft is destroyed, everything has been lost.'; NP = 0; Z$ = ''; Z = 0; }
        var text = lossList(Z, list, A$ + Z$);
        for (var L = 0; L <= NP - 1; L++) if (H1[L] === -2) { H1[L] = -1; NP = NP - 1; N$[L] = N$[NP]; }
        if (!NP) { everyoneDead = true; return { text: text, stop: true, then: 'Everyone in the party has died.' }; }
        return { text: text, stop: false };
      }
      var res = await io.raft({ collision: collision });
      if (everyoneDead) { dead = true; return DEAD; }
      if (!res.landed) { list = []; Z = 0; loseSupplies(0.5); var A$ = 'The raft has missed the landing.'; if (Z) A$ += '  You have lost:'; await io.notice(lossList(Z, list, A$)); }
      PF = I[8]; I[8] = PF;
      return await win();
    }
    // WIN
    async function win() {
      io.tune('MS17');
      io.stage('picture', { name: 'L17' });
      LM = 17; NM = 17; D = 0; status();
      await io.notice('The Willamette Valley, Oregon.  ' + dateText() + '.\n\nCongratulations!  You have made it to Oregon!  Let\'s see how many points you have received.', { arrived: true });
      var hi = healthIdx(), rows = [];
      var pts = [[NP, NP * (500 - 100 * hi)], [1, 50], [INT(I[2] + 0.5), INT(I[2] + 0.5) * 4], [I[5] + I[6] + I[7], (I[5] + I[6] + I[7]) * 2], [I[3], I[3] * 2], [I[4], INT(I[4] / 50)], [I[8], INT(I[8] / 25)], [MY, INT(MY / 5)]];
      var SC = 0; pts.forEach(function (p) { SC += p[1]; });
      var mult = occupation === 2 ? 2 : occupation === 3 ? 3 : 1;
      rows = [
        [pts[0][0] + (NP > 1 ? ' people' : ' person') + ' in ' + H$[hi] + ' health', pts[0][1] * mult], ['1 wagon', 50 * mult],
        [pts[2][0] + (pts[2][0] === 1 ? ' ox' : ' oxen'), pts[2][1] * mult], [pts[3][0] + ' spare wagon part' + (pts[3][0] === 1 ? '' : 's'), pts[3][1] * mult],
        [pts[4][0] + ' set' + (pts[4][0] === 1 ? '' : 's') + ' of clothing', pts[4][1] * mult], [pts[5][0] + ' bullet' + (pts[5][0] === 1 ? '' : 's'), pts[5][1] * mult],
        [pts[6][0] + ' pounds of food', pts[6][1] * mult], ['$' + money(MY) + ' cash', pts[7][1] * mult]];
      SC = SC * mult;
      var note = mult > 1 ? 'For going as a ' + (mult === 2 ? 'carpenter' : 'farmer') + ', your points are ' + (mult === 2 ? 'doubled' : 'tripled') + '.' : '';
      var rating = SC < 3000 ? 'Greenhorn' : SC < 6000 ? 'Adventurer' : 'Trail guide';
      io.scoreSheet({ rows: rows, total: SC, note: note, rating: rating });
      await io.notice('Points for arriving in Oregon: ' + SC + '.  ' + note + '  Rating: ' + rating + '.', { score: true });
      var top = await io.getTopTen();
      if (SC > parseInt(top[9][1], 10)) {                                                          // 400-540
        var nm = await io.ask({ type: 'text', prompt: 'Congratulations!  Type your name as you would like to see it on the Oregon Top Ten list.', maxlen: 15, placeholder: N$[0] });
        var G = 0;
        for (var L = 9; L >= 1; L--) { if (SC > parseInt(top[L][1], 10)) top[L] = top[L - 1].slice(); if (SC <= parseInt(top[L][1], 10)) { G = L; break; } }
        top[G] = [nm || N$[0], String(SC), rating];
        io.saveTopTen(top);
        io.topTen(top);
        await io.notice('The Oregon Top Ten', { topten: true });
      } else {
        io.topTen(top);
        await io.notice('You have accumulated ' + SC + ' points.  This is not enough to qualify for the Oregon Top Ten.', { topten: true });
      }
      return ARRIVED;
    }

    // ------------------------------------------------------------------ 1000: the trail, landmark by landmark
    recalc();
    D = 0; NM = 0; status();
    while (true) {
      A = INT(R() * 3); ZO = (LM > 2 ? 1 : 0) + (LM > 5 ? 1 : 0) + (LM > 10 ? 1 : 0) + (LM > 13 ? 1 : 0);
      if (LM) {
        io.tune('MS' + LM);
        F9 = 0;
        io.stage('picture', { name: 'L' + LM, caption: shortName(LM) + '\n' + dateText() });
        status();
        var look = await io.ask({ type: 'yesno', prompt: 'You are now at ' + LM$.name[LM] + '.  Would you like to look around?' });
        if (visited.indexOf(LM) < 0) visited.push(LM);
        if (look) { LL = 0; await menu(); if (dead) return DEAD; LL = 1; }
      }
      // 1015
      while (true) {
        if (LM$.type[LM] === 2) { await river(); if (dead) return DEAD; }
        await noOxenCheck();
        if (B > 0) { LL = 0; await menu(); if (dead) return DEAD; LL = 1; }
        var Z = await beforeLeaving();
        if (Z === ARRIVED || Z === DEAD) return Z;
        // 2200
        var leg = Z === 1 ? LM$.leg[LM] : LM$.alt[LM];
        D = LEG.dist[leg]; MD = LEG.daily[leg]; NM = LEG.next[leg];
        status();
        io.stage('picture', { name: 'L' + LM });
        await io.notice('From ' + LM$.name[LM] + ' it is ' + D + ' miles to ' + LM$.name[NM] + '.');
        break;
      }
      // 3000: the days on the trail
      LL = 1; PF = I[8]; SN = NM * 100 + LM; FX = 180 - T.scenery.x[NM - 1]; IX = FX - D * 2; NI = T.scenery.image[NM - 1]; DD = D; SD = 0; WG = 1;
      recalc(); findGrave();
      RE[8] = 0.04 + 0.03 * (ZO > 2 ? 1 : 0); RE[10] = 0.05 * (ZO > 2 ? 1 : 0); RE[11] = 0.04 * (AM > 4 && AM < 10 ? 1 : 0);
      io.stage('travel'); status();
      while (D > 0) { await day(false); if (dead) return DEAD; }
      I[8] = PF;
      LM = NM;
      if (LM === 5) { scenery = 'MOUNTAINS'; graves = io.getTombstones(); }                                             // FLIP.LIB: the second side of the disk
      if (LM === 17) break;
    }
    return await win();
  }

  async function pointsExplained(io) {                                                                                   // 2200-2235
    await io.notice('Your most important resource is the people you have with you.  You receive points for each member of your party who arrives safely; you receive more points if they arrive in good health!\n\nHealth of party — points per person:\n   good  500\n   fair  400\n   poor  300\n   very poor  200');
    await io.notice('The resources you arrive with will help you get started in the new land.  You receive points for each item you bring safely to Oregon.\n\nResources of party — points per item:\n   wagon  50\n   ox  4\n   spare wagon part  2\n   set of clothing  2\n   bullets (each 50)  1\n   food (each 25 pounds)  1\n   cash (each 5 dollars)  1');
    await io.notice('You receive points for your occupation in the new land.  Because more farmers and carpenters were needed than bankers, you receive double points upon arriving in Oregon as a carpenter, and triple points for arriving as a farmer.');
  }

  var ORIGINAL_TOP_TEN = [['Stephen Meek', '7650', 'Trail guide'], ['David Hastings', '5694', 'Adventurer'], ['Andrew Sublette', '4138', 'Adventurer'], ['Celinda Hines', '2945', 'Greenhorn'], ['Ezra Meeker', '2052', 'Greenhorn'], ['William Vaughn', '1401', 'Greenhorn'], ['Mary Bartlett', '937', 'Greenhorn'], ['William Wiggins', '615', 'Greenhorn'], ['Charles Hopper', '396', 'Greenhorn'], ['Elijah White', '250', 'Greenhorn']];
  var ORIGINAL_TOMBSTONES = [{ sn: 100, miles: 69.125, name: 'andy', epitaph: 'peperony and chease' }];

  return { run: run, DEAD: DEAD, ARRIVED: ARRIVED, QUIT: QUIT, ORIGINAL_TOP_TEN: ORIGINAL_TOP_TEN, ORIGINAL_TOMBSTONES: ORIGINAL_TOMBSTONES, money: money };
})();
