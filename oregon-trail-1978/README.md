# The Oregon Trail, 1978

A faithful port of the original text *Oregon Trail* — written in 1971 by Don
Rawitsch, Bill Heinemann and Paul Dillenberger for MECC, from the BASIC listing
published in *Creative Computing* in 1978 — as one self-contained page,
`oregon.html`, that works on a phone. The teletype's numbered questions are
buttons, the rifle still wants the word typed fast, and the journey is kept in
the browser so a reload carries on where it was.

The landmark scenes, the map and the tombstone come from MECC's 1985 Apple II
version, decoded from its disk images. That game measures the trail by eighteen
landmarks; here they are placed at the 1978 game's mileages, with its two
mountain passages (South Pass at 950 miles, the Blue Mountains at 1700) lining
up with theirs. They can be switched off in the menu.

## Files

| File | What it is |
| --- | --- |
| `oregon_src.html` | the page: markup, styles and the program |
| `build.py` | inlines `pics/*.png` into `oregon.html` |
| `pics/` | the pictures as used by the page: `L0`–`L17` the landmarks (top 160 lines, at 2×), `TS` the tombstone, `M0` the map |
| `apple2/` | the packed pictures as found on the disks (`.PCK`) |
| `tools/pck.py` | decodes a `.PCK` into PNGs, in colour (Apple II hi-res rules) and mono |
| `src/` | the 1978 BASIC listing the port follows |

## The 1985 pictures

Each `.PCK` is one 280×192 hi-res screen, run-length coded column by column;
the unpacker is the `DUN` command of the game's `&` package, found by booting
the disk in a 6502 emulator. `tools/pck.py` expands one and renders it the way
an Apple II shows it on a colour monitor. The landmark order, names, mileages
and map positions are the game's own, read from `VAR.BIN`, its saved variable
table.

## Credits and rights

- *The Oregon Trail* is © MECC (the Minnesota Educational Computing
  Consortium); the 1978 listing is theirs, as are the 1985 pictures.
- The page and the tools are released under the MIT licence.
