# Prince of Persia (Apple II, 1989), native in the browser

Jordan Mechner's *Prince of Persia* (Brøderbund, 1989) re-implemented in
JavaScript from his published Apple II source, in one self-contained page,
`pop.html`, with touch controls for a phone. Not an emulator this time: the
game's own logic — the sequence tables and frame definitions that animate the
prince, the collision rules, the guards' programs, the movers (gates, plates,
spikes, slicers, loose floors), the level blueprints — runs as JavaScript, and
the screen is drawn with the same hi-res routines, byte for byte, into two
Apple hi-res pages that the page renders with an NTSC monitor's colour rules.

The same game can also be drawn with the art of the 1992 Macintosh version
(*Graphics* in the menu): its black-and-white shapes at 512 × 334 or its
256-colour ones at 640 × 400, placed by the Mac version's own piece tables and
drawing rules, with its title pages, its princess's room, and its band of
strength meters and messages in its own typeface. See *The Macintosh art*
below.

Every frame has been checked against the real program running on the Apple IIe
emulator in [`../prince-of-persia/`](../prince-of-persia/): the same inputs
into both, and the two hi-res pages and the game's variables compared after
every pass of the main loop (see *Checking it* below). The title, story and
epilog screens, the princess's room, the music and the sound effects are
captured from the game running there too, since the published source does not
contain them.

Open the page and press *Start*: the title sequence, the story, the princess's
room and the demo play as the Apple's attract mode did; any key or a tap on
the screen starts the game. The menu pauses the game and can start any of the
fourteen levels; the game's own save (Ctrl-G, from level 3) is kept in the
browser and offered on the front door.

## Controls

On a phone: the round pad moves (up is jump, down crouches, the diagonals are
the diagonal jumps), the Action button is the Apple's button — hold it to grab
a ledge, step carefully, or fight — and a tap on the screen is "any key"
(start, skip the story, unpause).

With a keyboard:

| Key | Does |
| --- | --- |
| Arrows, or `J` `L` `I` `K` | left, right, up (jump), down (crouch) |
| `U`, `O` | jump up-left, up-right |
| `Shift`, `Alt` or `Z` | the Apple button (grab, careful step, fight) |
| `Esc` | pause (Esc again steps one frame; any other key resumes) |
| `Space` | show the time left |
| `Ctrl-A` | restart the level |
| `Ctrl-R` | back to the title |
| `Ctrl-S`, `Ctrl-N` | the game's own sound and music on/off |
| `Ctrl-G` | save the game (from level 3); `Ctrl-L` at the title continues it |

These are the game's own keys, read by its own key routine (`SPECIALK.S`), so
`SKIP` typed on level 1-3 still does what it did.

## How it works

`js/` is the game, module by module after the source files it comes from:

| File | From | What it is |
| --- | --- | --- |
| `pop_hires.js` | `HIRES.S` | the two hi-res pages and the drawing primitives: LAY (general, mask and XOR opacity, each with its mirrored twin), FASTLAY, FASTMASK, FASTBLACK, LAYRSAVE and PEEL, CLS, the page copy — in unsigned 8-bit arithmetic, as the 6502 did it |
| `pop_grafix.js` | `GRAFIX.S` | the image lists (wipe, background, middle, foreground, message) and DRAWALL, with the peel lists that restore what characters covered |
| `pop_state.js` | `EQ`, `GAMEEQ`, `TABLES`, `BGDATA`, `MOVEDATA`, `SEQDATA`, `SOUNDNAMES`, `CTRLSUBS.S` | the game's memory: every constant and table, the level blueprint, the character records and the globals the original kept in zero page and pages 2-3 |
| `pop_bg.js` | `FRAMEADV.S`, `GAMEBG.S` | assembling the image lists for a screen, whole or from the redraw buffers, the pieces of each block, the objects among them, the strength meters and the messages |
| `pop_char.js` | `COLL.S`, `CTRL.S`, `CTRLSUBS.S` | the sequence interpreter ANIMCHAR, barrier collisions, slicers and gates, and what the player's commands and the ground do to a character |
| `pop_mover.js` | `MOVER.S` | the transitional objects (gates, plates, spikes, slicers, loose floors, torches, flasks, the exit) and the moving objects (falling floors) |
| `pop_auto.js` | `AUTO.S` | the guards' and the shadow's minds, sword contact, the pre-recorded shadow scenes, and the cuts between screens |
| `pop_sound.js` | `SOUND.S` | the sound table: the effects a frame asks for, handed to the page |
| `pop_cut.js` | `SUBS.S` (PlayCut0-8), `GAMEBG.S` | the princess's room: the hourglass, the sand, the stars and the torches, and the eight cut scenes as lists of steps played a frame at a time |
| `pop_top.js` | `TOPCTRL.S`, `SUBS.S`, `MISC.S`, `SPECIALK.S`, `GRAFIX.S` | the main loop, starting and restarting levels, the keys, the timers and messages, the songs' cues |

The original's non-local jumps (a RESTART from inside a key handler, the cut
to the next level) are thrown as exceptions and caught by the frame function
the page calls. The page (`pop_src.html`) sets the input, calls one frame at a
time, paints whichever page the game shows, and plays the sounds.

**Data.** `assets/pop_data.json` is built from the published source by
`tools/assets.py`: the sixteen image tables (`Images/IMG.*`, decoded by
`tools/imgtab.py`), the fifteen level blueprints (`Levels/LEVEL0-14`), and
`SEQTABLE.S` and `FRAMEDEF.S` assembled by `tools/asm.py`, a small assembler
for those two data-only Merlin files. The sequence table is the same bytecode
the original interpreted; the frame definitions are its five-byte records.

**Pictures and sound.** `assets/pop_pics.json` holds the double hi-res title,
story and epilog screens and the princess's room (a hi-res page), captured by
`tools/pics.js` from the game running in the emulator. `assets/pop_audio.json`
holds the Apple's speaker, recorded by `tools/record.js` as lists of toggle
times in CPU cycles: the twenty sound effects and the sixteen game tunes are
played by calling the game's own routines; the title, story and epilog tunes
are captured as the attract sequence and the ending play them; and the tunes
of the princess's room are captured there, because they run slower than in the
game — the room is redrawn between the notes, and the page keeps that pace.
The page turns each recording into a square wave.

**The Macintosh art.** `js/pop_mac.js` is a second renderer that runs
alongside the Apple's. The Macintosh version (Brøderbund, 1992; programmed by
Presage Software) is a translation of the same 6502 program to C, with the same
background routines — a block is drawn as its A, B, C, D and front pieces, the
gate as a bottom and bars, the loose floor and the spikes from their own
tables — but with its own piece tables, its own shapes and its own placement
(x in a 320-wide space, 8 per Apple byte and 8/7 of an Apple pixel for the
characters; the 512-wide modes stretch both axes through two scale tables, the
640-wide one doubles them). Those routines were read from the application's
68000 code and written again in JavaScript: the Apple's background routines
report each block they draw (hooks in `pop_bg.js`), the Mac routines decide
which of the Mac's shapes stand for it and where, and DRAWALL then draws the
Mac's lists — wipes, background, characters, the palace's coloured brick
bands, foreground — onto a Mac-sized page with the Mac's own peel-and-restore
of what the characters cover. The characters use the Mac's frame and sword
tables (which Mac shape each frame is), the guards the level's shape set
(guard, skeleton, fat guard, shadow, vizier) and the screen's guard palette,
the shadow the Mac's recolouring of the prince's thirteen colours. The
princess's room, the title pages and the credits are the Mac's, the band under
the play area shows the meters and the messages ("Level 1", "59 minutes
left", "Press any key to continue") the way the Mac wrote them, in its Persian
typeface from the application's font resource.

`assets/pop_mac.json` is extracted by `tools/mac.py` from a disk image of the
Macintosh version (an HFS volume read with `machfs`): the shape files
`Persia(BW)` and `Persia(COLOR)` as the game kept them — each set LZSS-packed,
with the resource fork's shape directories — and, from the application's
resources and initialised data, the palette and the eight guard palettes, the
frame, sword and block-piece tables, the animation tables, the two scale
tables, the guard colour of every screen, and the font. The shapes are
unpacked and decoded in the page (the colour ones are run-length coded, the
black-and-white ones AND/OR word pairs). `tools/macshot.js` renders any
screen of any level to a PNG headlessly, `tools/macfuzz.js` plays every
level at random with the renderer on, and `tools/pagetest_mac.js` drives the
built page through both Mac modes.

**Time.** The game's logic is per frame, and the Apple's frame took as long as
the drawing did. The page keeps that: a frame lasts a base of 26.5 ms plus the
bytes each primitive drew at a cost per byte, fitted by `tools/frametime.js`
against the game in the emulator (6 ms r.m.s. over frames of 43-760 ms), so an
empty corridor runs faster than a screen with a guard and a screen change takes
its 0.6 s. While a tune plays the world stands still, as it did.

**What is not here.** The disk and the copy protection (levels load from the
data), the joystick (the pad stands in for it), the IIGS's fast mode, the
development keys that the shipped disk does not have, and the version screen.

## Checking it

The emulator in `../prince-of-persia/` is the oracle. `tools/oracle.js` boots
the disks headlessly, plays through the intro to the first frame of level 1,
and then runs the game one pass of its main loop at a time with a given key
and button, capturing the pages it shows (reads of `$C054`/`$C055`) and the
game's variables from the auxiliary bank. Set `POP_EMU` to the emulator's
folder if it is not beside this one.

```
node tools/compare.js 700 "30:L 90:- 100:I 120:- 130:J"   # scripted play: the first frame that differs, if any
node tools/fuzz.js 1 2000 5 4 warp                        # random play, 5 runs of 2000 frames on level 4, teleporting the kid
node tools/frametime.js 400 "30:L 90:-"                  # the frame-time fit
```

`compare.js` and `fuzz.js` report the first frame where a shown page differs
by a byte, or where the character records, the random seed or any of some
eighty variables differ. Level 1 (scripted and idle), random play across
levels 1-13 with the kid teleported around each level, and the cut scenes
before levels 2, 4, 6, 8, 9 and 12 all match; `tools/sync.js` re-aligns the
two after a level load, which is not compared frame by frame.
`tools/pagetest.js` and `tools/pagetest2.js` drive the built page in
Playwright on a phone-sized viewport (the front door, the title sequence, a
tap into the game, the pad, the menu, saving and continuing; the whole attract
sequence, a level change, a death).

## Building

```
python3 build.py        # inlines js/ and assets/ into pop.html
```

To rebuild the assets: clone Mechner's source
(`github.com/jmechner/Prince-of-Persia-Apple-II`) beside the repository, or
point `POP_SRC` at its `01 POP Source` folder, and run `python3 tools/assets.py`;
`node tools/pics.js` and `node tools/record.js` need the emulator and the disks.

## Credits and rights

- *Prince of Persia* is © Brøderbund Software / Jordan Mechner, and an
  ongoing Ubisoft franchise; the game's art, levels, animation, music and
  design are theirs. The 6502 source was published by Jordan Mechner for study,
  which is not a grant of rights in the game, and this port is offered in the
  same spirit.
- The Macintosh graphics are © Brøderbund Software, 1992 (Macintosh
  programming by Scott Shumway of Presage Software; art direction Leila Joslyn;
  graphics Marcela Evans, Gail Rathbun and Arsys Software). They are used here
  only as the game's own art, taken from its shape files, and remain their
  owners'.
- The JavaScript, the page and the tools are released under the MIT licence.
