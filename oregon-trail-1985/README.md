# The Oregon Trail, 1985

MECC's *The Oregon Trail* for the Apple II (1985, version 1.4) as one self-contained
page, `oregon85.html`, that works on a phone. It is a port, not an emulator: the
game's Applesoft BASIC was translated program by program, so every price,
probability, formula and message is the original's, and the disks' own pictures,
sprites and tunes are drawn and played the way an Apple II showed them. The
numbered questions are buttons; the hunting and rafting screens take touch as
well as keys; the journey is kept in the browser so a reload carries on where it
was, and the Oregon Top Ten and the tombstones you leave persist between games.

## What is in the port

- **MENU / BUY SUPPLIES** — occupation (banker, carpenter, farmer), the party's
  names, the departure month, Matt's General Store.
- **OREGON TRAIL** — the day-by-day travel with its weather tables (six stretches
  of trail, twelve months), the health score fed by temperature, clothing, rations,
  pace, fatigue and illness, the fifteen kinds of mishap with their exact odds, the
  eighteen landmarks and two forks, the fort stores with rising prices, trading,
  resting, the map, and the people to talk to at each landmark.
- **RIVER.LIB / CROSS.LIB** — the four crossings: fording, caulking, the ferry, the
  Shoshoni guide, waiting; depths and widths that follow the rain.
- **PART, LF, TOMB, END** — broken wagon parts, fires, thieves, abandoned wagons,
  deaths and epitaphs, the Barlow Road.
- **The hunt** — rebuilt from the machine code the game keeps in the language card
  (the `& HUNT` command): six animals with their sizes, speeds and meat, the
  obstacles that grow in each region, the eight-direction hunter, bullets that fly
  until they hit something, and the 2,500-turn clock.
- **FLOAT** — rafting the Columbia, line for line.
- **WIN** — the points, the occupation multiplier, the ratings and the Top Ten.

## Files

| File | What it is |
| --- | --- |
| `oregon85_src.html` | the page: markup, styles and the interface script |
| `js/engine.js` | the Apple II side: hi-res screen, decoders, sprite blits, colour rules, tunes |
| `js/game.js` | the game, transliterated from the BASIC (line numbers in the comments) |
| `js/hunt.js` | the hunting screen |
| `js/raft.js` | the Columbia |
| `build.py` | inlines the scripts and `data.json` into `oregon85.html` |
| `tools/pack.py` | makes `data.json` from `apple2/`: pictures, image libraries, tunes, the variable table, the talk texts |
| `tools/pck.py`, `tools/ima.py` | decode the picture and image formats to PNG |
| `apple2/` | the files from the disks the page uses |
| `src/` | the Applesoft listings the port follows |

## Notes on the formats

A `.PCK` is one 280×192 hi-res screen, run-length coded column by column. An
`.IMA` library is a count, an offset per image (bit 15 marks a raw image), then
each image as a width in 7-pixel bytes, a height, and its bytes — row by row for
raw images, column by column and coded like the screens otherwise. `VAR.BIN` is
the game's saved Applesoft variable table (landmarks, distances, rivers, weather
codes, prices). `MS*.BIN` are the landmark tunes: pairs of note and duration.

## Credits and rights

- *The Oregon Trail* is © MECC (the Minnesota Educational Computing Consortium);
  the program, pictures, sprites, texts and tunes are theirs.
- The page and the tools are released under the MIT licence.
