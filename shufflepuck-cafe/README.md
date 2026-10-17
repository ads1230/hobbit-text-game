# Shufflepuck Café (Macintosh, 1988), native in the browser

Christopher Gross's *Shufflepuck Café* (Brøderbund, 1988) — air hockey against
the regulars of a space-port bar — re-implemented in JavaScript from the 68000
program of the Macintosh release, in one page that works on a phone. Not an
emulator: the game's own logic runs as JavaScript — the table and its
projection, the puck's physics, the paddle collisions, the nine opponents'
reflexes and habits from their own parameter tables, their serves, their
animated reactions, the chalk hand that keeps the score, the bar — and the
screen is drawn into a 512 × 342 one-bit bitmap with a small QuickDraw written
for the page, from the game's own pictures, patterns, fonts and sounds.

Open `index.html` (or the single file `shufflepuck.html`, which stands on its
own and can be opened from disk). After the title, the café: click or tap an
opponent at the bar to play them, the *Tournament* sign on the wall to take
on all eight in order, the robot behind the bar for a practice droid whose
play can be adjusted from a menu, or the door to leave. A game is to fifteen
points. Beat the whole tournament and your name goes on the sign over the bar
and into the roster of champions, which the browser keeps.

## Controls

The paddle follows the mouse, as on the Mac: left and right across the table,
forward and back along it. As on the Mac, the pointer is hidden during play —
the paddle is the cursor — and a click on the table locks the mouse to the
page, so a fast swing cannot run off into the browser; any key pauses the
game and gives the pointer back (so does `Esc`). The puck is hit by moving
the paddle through it — the faster the paddle, the harder the shot, and
sideways movement puts sideways speed on the puck. Holding the mouse button
while hitting uses the *Button Down* paddle settings (a little more forward
power by default); both sets can be changed from the *Paddle* menu. To serve,
push the puck.

On a phone, drag anywhere on the screen (including the black area around the
table): the paddle moves with the finger, a little faster, so the hand never
covers the play. A second finger held down anywhere is the mouse button. Taps
are clicks, for the bar and the menus.

| Key | Does |
| --- | --- |
| any key | pause (the game stops; a click, a key or *Pause / Resume* carries on) |
| `Ctrl`/`⌘`+`N` | new game (the board is wiped) |
| `Ctrl`/`⌘`+`O` | new opponent (back to the bar) |
| `Ctrl`/`⌘`+`R` | the roster of champions |
| `Ctrl`/`⌘`+`S` | sound on or off |
| `Ctrl`/`⌘`+`Q` | quit |

The menu bar is the game's: *About* (the credits, with the flickering neon
sign), *File* (roster, quit), *Game* (new game, new opponent, sound),
*Paddle* (size, the two sets of bounce and power, the tournament paddle),
*Blocker* (an optional bar across the middle of the table that bounces the
puck and slides when hit — small, medium, large or custom size and weight),
and *Droid* while playing DC3 (its paddle, idling, speed, returns and serves).
Paddle and blocker settings are fixed in the tournament.

## The opponents

Each is a record of thirty-five numbers in the game's data fork — paddle
width, how far and fast they wander while idle, how early they react to a
shot, how well they predict where it will arrive, how much their aim and speed
jitter, how hard and where they return, where they serve — fed to one AI
state machine (idle, track, backswing, strike), plus their own pictures,
sounds and quirks:

- **Skip Feeney**, the kid in glasses: slow, and often wrong about where the
  puck is going.
- **Visine Orb**, the eye that comes up from under the table: never still, and
  only reacts when the puck is nearly there; giggles when it scores, cries when
  it doesn't.
- **Vinnie the Dweeb**: a sure eye and slow, careful returns.
- **Lexan Smythe-Worthington**, the lizard with the martini: a good player who
  drinks when a point goes against him and plays a little worse after every
  glass; he slides under the table when the game ends.
- **Eneg Portwood**, the big one with the horns: hard, wide returns.
- **Nerual**, the hooded one: dissolves in and out, wanders the whole width of
  the table, and serves your own last serve back at you.
- **Princess Bejin**: a narrow paddle, and a serve thrown by hand from the
  middle of the table, hard and at an angle.
- **Biff Raunch**, the champion: the strongest hitter, who aims his serves by
  the score.
- **DC3**, the droid behind the bar: not in the tournament; its numbers are
  the *Droid* menu, for practice.

## How it was made

The Macintosh program is THINK C code in five `CODE` segments, kept encrypted
on the disk by its copy-protection loader (HLS Duplication), which decrypted
each segment as the Segment Loader asked for it. To get at the code, the
loader was run on a 68000 emulator (Unicorn) with just enough of the Mac
Toolbox — the Resource and Memory Managers, the traps it calls — for it to
decrypt the segments for us. The decrypted segments were disassembled and
annotated (jump-table calls resolved to functions, A5-relative globals named,
the strings block, the `DATA`/`ZERO` initialisers), and then ported function
by function:

- **The world.** A table 500 wide and 1500 long, the player at z = 0 and the
  opponent at 1500, the puck 24 across, all projected to the screen with the
  game's own fixed-point formula; the puck's step, the wall bounces, the
  blocker's momentum exchange, the paddle collisions with their bounce and
  power percentages, the five-frame cooldown — the integer arithmetic kept as
  the 68000 did it (truncating divisions, 16-bit wraps where the original had
  them).
- **The opponents.** The parameter block and the state machine above, the
  prediction loop that simulates the puck ahead to pick a point to meet it,
  the random jitter from the game's own random routine (so an opponent is as
  good or as bad as on the Mac), the pre-serve wander, and the special serves
  of Biff, Nerual, Bejin and the droid.
- **The show.** Each opponent's keyframed reactions to winning and losing a
  point (face frames, sounds, Lexan's drinking and its effect on his numbers),
  the blinking and glancing between points, the chalk hand that writes and
  wipes the tally while the puck glides back to the server, the game's fades
  and dissolves, the title and credits, the bar's seven little animations,
  the roster.
- **QuickDraw.** Patterns aligned to the bitmap, pen modes, `CopyBits` with
  its transfer modes (the sprites are masked exactly as the game masks them),
  ovals, a PICT (version 1) decoder for the game's pictures, and the game's
  bitmap fonts drawn from their `FONT` resources, bold included.
- **Sound.** The game's sampled sounds (`ASND` resources and three samples in
  the data fork) are 8-bit free-form synthesizer records for the Sound
  Driver, played at rates the game sets per sound (the crack of a goal pitched
  by the puck's speed, Visine's giggle at a random pitch); the page plays
  them through Web Audio at the same rates.

The program is written as cooperative generators driven by a 60 Hz tick, like
the Mac's `TickCount`, so the game's frame limiter (two ticks a frame) and its
timed sequences keep the original's pace. A headless harness
(`tools/harness.js`) runs the same program under Node with a virtual clock,
scripted clicks and a bot on the player's side, and writes screenshots; that
is how the flows were checked (every opponent, the tournament end to end, the
champion sequence, the menus and dialogs, the blocker). The physics and AI
were ported from the disassembly by hand and checked by play rather than
compared frame by frame against the original running in an emulator.

## Files

| File | What it is |
| --- | --- |
| `index.html` | the page: markup, styles, the menu bar and dialogs |
| `shufflepuck.html` | the same with everything inlined (made by `build.py`) |
| `js/qd.js` | the QuickDraw subset: bitmaps, ports, patterns, pens, `CopyBits`, PICT decoding, fonts |
| `js/engine.js` | the world: globals, projection, sprites, paddles, puck physics, collisions, the AI, rendering, the scoreboard |
| `js/opponents.js` | the nine opponents: pictures, sounds, face frames and eyes |
| `js/flow.js` | the game: serving, the rally, scoring, reactions, blinks, the chalk hand, the fades |
| `js/scenes.js` | around the game: title, bar, roster, menus, dialogs, the about box, the main program |
| `js/app.js` | the page: Web Audio, mouse/touch/keyboard, the HTML menu bar and dialogs, the runner |
| `js/data.js` | the game's own pictures, sounds, fonts, patterns and tables (made by `tools/build_data.py`) |
| `tools/extract.py` | takes the program's forks out of the disk image (StuffIt or Disk Copy 4.2) and dumps its resources |
| `tools/rsrc.py` | the resource-fork reader |
| `tools/build_data.py` | packs the resources and the data fork into `js/data.js` |
| `tools/harness.js`, `playtest.js`, `flowtest.js` | the headless checks |

## Building

```
python3 -I tools/extract.py shufflepuck_cafe_1.0_dc42.sit extracted   # needs unar and the machfs package
python3 -I tools/build_data.py extracted js/data.js
python3 build.py                                                       # inlines the scripts into shufflepuck.html
node tools/harness.js                                                  # a quick headless run with screenshots in shots/
node tools/playtest.js 4                                               # a bot plays Lexan
```

## Credits and rights

- *Shufflepuck Café* is © 1988 Brøderbund Software, by Christopher Gross with
  Gene Portwood and Lauren Elliott. The pictures, sounds, fonts and tables in
  `js/data.js` are the game's own and are theirs.
- The port — the QuickDraw subset, the engine, the page and the tools — is
  released under the MIT licence (see the repository's `LICENSE`).
