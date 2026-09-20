// Maps Jacob Gunness's 1990 walkthrough onto the game's room numbers by
// replaying each movement step in the emulator (teleporting Bilbo to the
// step's room first, so NPC luck does not matter). Writes walkthrough.json.
const fs = require('fs'), vm = require('vm');
const ctx = { console, Math, Date, Uint8Array, Uint8ClampedArray, Array, String }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../z80.js', 'utf8') + '\nglobalThis.Z80 = Z80;', ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../machine.js', 'utf8'), ctx);

const TEXT = `READ MAP, E, E, N, WAIT (till dawn breaks. The trolls have now turned to stone. He-he!), S, GET KEY, N, UNLOCK DOOR, OPEN IT, N, GET ROPE AND SWORD, S, S, SE, GIVE MAP TO ELROND, SAY TO ELROND "HELLO", SAY TO ELROND "READ MAP" (this gives you a hint), WAIT (until Elrond gives you some lunch), EAT LUNCH, SAY TO ELROND "GIVE ME MAP", E, S, E, N, NW, N, SE, D, D, D, D, E, GET GOLDEN KEY, U, N, W, S, E, N, WAIT (till the crack opens and you are captured. You are thrown into a dungeon), DIG, SMASH TRAP DOOR (until it breaks. Under it is Curious Key, which Thorin takes), SAY TO THORIN "OPEN WINDOW", SAY TO THORIN "PICK ME UP", SAY TO THORIN "WEST", SE, WAIT (until a goblin enters), E, SE, E, GET RING, N, S, NW, E, OPEN DOOR, U, CLOSE DOOR, E, E, OPEN CURTAIN, OPEN CUPBOARD, GET FOOD, EAT IT, NE, E, E, LOOK ACROSS RIVER (you spot a boat), THROW ROPE ACROSS RIVER (keep trying until you hit it), PULL ROPE (you pull the boat across the river), SAY TO THORIN "CLIMB INTO BOAT", CLIMB INTO BOAT (it floats to the other shore), CLIMB OUT, E, SMASH WEB (till it breaks), NE, SMASH WEB, N, WEAR RING, EXAMINE DOOR, WAIT (until the door opens), NE, WEAR RING (the game seems to have a bug which makes this necessary), S, KILL BUTLER WITH SWORD, GET RED KEY, UNLOCK RED DOOR WITH RED KEY, OPEN DOOR (if Thorin has been caught, he should come out now), OPEN BARREL, OPEN TRAP DOOR, GET BARREL, THROW IT THROUGH TRAP DOOR, SAY TO THORIN "JUMP ONTO BARREL", GET BARREL, THROW IT THROUGH TRAP DOOR, JUMP ONTO BARREL (you sail down to Long Lake), E, PICK UP BARD, W, N, U, N, NW, N, W, E, NW, N, WAIT (until the sun shines on the rock and opens Secret Door), SAY TO THORIN "UNLOCK DOOR WITH CURIOUS KEY", DROP BARD (it's a good idea to save your game here, since Thorin has a bad habit of walking down to the dragon and becoming toast!), E, SAY TO THORIN "WEST", WEAR RING, E, GET TREASURE, U, W, PICK UP BARD, U, DROP BARD, SAY TO BARD "GET STRONG ARROW FROM QUIVER" (if he takes too long, restore), WAIT (till the dragon appears), SAY TO BARD "SHOOT DRAGON", S, S, S, D, S, S, S, WEAR RING, W, WAIT, WAIT (watch out for those spiders!), W, WAIT, WAIT, W, N, SW, W, W, W, W, SW, W, OPEN CHEST, PUT TREASURE IN CHEST (Congratulations. You have killed Smaug and found the treasure - a real thief!)`;

// split on commas that are not inside quotes or parentheses
const steps = [];
let cur = '', depth = 0, quote = false;
for (const ch of TEXT) {
  if (ch === '"') quote = !quote;
  if (ch === '(') depth++;
  if (ch === ')') depth--;
  if (ch === ',' && !quote && depth === 0) { steps.push(cur.trim()); cur = ''; } else cur += ch;
}
if (cur.trim()) steps.push(cur.trim());
const parsed = steps.map(s => { const m = /^(.*?)\s*(\((.*)\))?$/.exec(s); return { cmd: m[1].trim(), note: m[3] ? m[3].trim() : '' }; });

const m = new ctx.HobbitMachine();
m.setCharset(new Uint8Array(fs.readFileSync(__dirname + '/../charset/CharSetSpectrum8x8.bin')));
m.loadTape(new Uint8Array(fs.readFileSync(process.argv[2] || '/tmp/realtape/HOBBIT12.TAP')));
let out = ''; m.onText = t => out += t; m.onLower = t => out += t;
const run = () => { let n = 0; while (!m.parked && n++ < 400) m.run(1e6, 0); };
run();
const you = m.objectRecord(0);
const DIRS = { N: 'n', S: 's', E: 'e', W: 'w', NE: 'ne', NW: 'nw', SE: 'se', SW: 'sw', U: 'up', D: 'down' };
const DIRCODE = { n: 1, s: 2, e: 3, w: 4, ne: 5, nw: 6, se: 7, sw: 8, up: 9, down: 10 };
function exitTo(room, dir) { // destination from the exits table, doors or not
  const rec = m.w16(m.addr.locIndex + room * 2);
  for (let q = rec + 10, n = 0; m.mem[q] !== 0xff && n < 12; q += 3, n++) if ((m.mem[q] & 0x7f) === DIRCODE[dir]) return m.mem[q + 2];
  return null;
}
const SPECIAL = { 'WAIT (till the crack opens and you are captured. You are thrown into a dungeon)': 0x0d, 'CLIMB INTO BOAT (it floats to the other shore)': 0x43, 'JUMP ONTO BARREL (you sail down to Long Lake)': 0x22 };
let room = m.mem[you + 0x10], result = [];
for (const st of parsed) {
  const full = st.cmd + (st.note ? ' (' + st.note + ')' : '');
  let next = room, how = '';
  if (SPECIAL[full] !== undefined) { next = SPECIAL[full]; how = 'special'; }
  else if (DIRS[st.cmd]) {
    // the exits table is the map itself; doors and NPCs do not change where a direction leads
    const t = exitTo(room, DIRS[st.cmd]); if (t !== null) { next = t; how = 'table'; } else how = 'no exit';
  } else if (/^SAY TO THORIN "WEST"$/.test(st.cmd)) { const t = exitTo(room, 'w'); if (t !== null) { next = t; how = 'carried'; } }
  result.push({ cmd: st.cmd, note: st.note, room: room, to: next });
  if (how === 'no exit') console.error('no exit for', st.cmd, 'from room', room.toString(16));
  room = next;
}
// The last leg was written for the DOS version, whose map around the Lonely
// Mountain and the way home differs a little; these place those steps on the
// Spectrum's rooms and note the differences.
const OVERRIDE = { 106: 0x2a, 107: 0x2a, 108: 0x2a, 109: 0x2a, 110: 0x2a, 111: 0x2a, 112: 0x2a, 113: 0x2a, 114: 0x2b, 115: 0x2b, 116: 0x2b, 117: 0x29, 118: 0x29, 119: 0x2c, 120: 0x2a, 121: 0x2a, 122: 0x2c, 123: 0x2c, 124: 0x2c, 125: 0x2c,
  126: 0x2c, 127: 0x27, 128: 0x26, 129: 0x25, 130: 0x24, 131: 0x22, 132: 0x2d, 133: 0x08, 134: 0x08, 135: 0x03, 136: 0x03, 137: 0x03, 138: 0x02, 139: 0x02, 140: 0x02, 141: 0x2e, 142: 0x18, 143: 0x16, 144: 0x0c, 145: 0x0b, 146: 0x0a, 147: 0x09, 148: 0x05, 149: 0x01, 150: 0x01 };
const FIX = { 106: 'not needed on the Spectrum', 107: 'not needed on the Spectrum', 108: 'not needed on the Spectrum', 109: 'not needed on the Spectrum', 121: 'on the Spectrum go N then U', 142: 'on the Spectrum: W', 143: 'on the Spectrum: SW', 147: 'on the Spectrum: W', 148: 'on the Spectrum: SW, then W' };
result.forEach((r, i) => { const n = i + 1; if (OVERRIDE[n] !== undefined) r.room = OVERRIDE[n]; if (FIX[n]) r.note = (r.note ? r.note + '; ' : '') + FIX[n]; });
for (let i = 0; i < result.length - 1; i++) result[i].to = result[i + 1].room;
result.forEach((r, i) => console.log(String(i + 1).padStart(3), r.room.toString(16).padStart(2, '0'), (r.to !== r.room ? '->' + r.to.toString(16) : '   ').padEnd(5), r.cmd, r.note ? '(' + r.note + ')' : ''));
fs.writeFileSync(__dirname + '/../walkthrough.json', JSON.stringify({ credit: 'Jacob Gunness, 1 April 1990', steps: result.map(r => ({ c: r.cmd, n: r.note, r: r.room })) }));
