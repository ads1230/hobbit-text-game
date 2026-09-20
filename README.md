# Hobbit Text Game Spectrum

Melbourne House's *The Hobbit* (ZX Spectrum, 1982) running in the browser as a
readable text game: a transcript instead of a Spectrum screen, a proper text box
that works on a phone, tap-to-play options for the exits and things around you,
hints, and the location illustrations from the 1985 Macintosh version, in colour.

Everything is one self-contained file, `hobbit.html`, with version 1.2 of the
tape (the bug-fixed release) built in: open it and play. Another tape image can be
loaded from the menu and is then remembered by the browser. Nothing is uploaded
anywhere; saved games stay in the browser's storage and can be exported as files.

## How it works

The page contains a small ZX Spectrum 48K emulator (a Z80 core plus just enough
of the machine for this one game) that runs the real program from the tape
image. Instead of showing the Spectrum screen, it hooks the game's own routines:

- **Text** — the game's print routines are intercepted, so the transcript is the
  game's real output, re-flowed and set in a readable typeface.
- **Input** — the game's keyboard routine is fed from the page's text box, so
  the parser is the original, quirks and all. Compound directions are shortened
  (`southwest` → `sw`) because the parser only reads the first letters of a word.
- **Options** — the exits, the things present and the verbs each thing answers
  to are read from the game's own data structures every turn, so the buttons
  offer only what is possible right now.
- **Hints** — Jacob Gunness's 1990 walkthrough, mapped onto the game's rooms so
  the relevant steps are shown for wherever Bilbo is.
- **Pictures** — the Spectrum's own drawings (captured from the emulated screen
  when the game draws them), or the Macintosh illustrations, which appear exactly
  when the original would draw a picture: the first time a place is visited, and
  on `LOOK`.
- **Saves** — the game is kept in the browser after every turn, so reloading the
  page carries on where you were; the game's own `SAVE`/`LOAD` go to a tape slot,
  and snapshots capture the whole machine and the transcript on demand.

The built-in tape is whichever image is in `tape/` at build time. Any other copy
can be loaded from the menu (`.tap`, `.tzx`, or a `.zip` of one; `.z80` and `.sna`
snapshots also work): version 1.2 is the bug-fixed release; the 1982 releases (Melbourne House's
own and Sinclair Research Ltd's) share the earlier code.

## Building

```
python3 build.py        # inlines the JS, the character set, the hints and the pictures into hobbit.html
```

| File | What it is |
| --- | --- |
| `index_src.html` | the page: markup, styles and the interface script |
| `machine.js` | the Spectrum machine, the game hooks and the readers for the game's data |
| `z80.js` | Molly Howell's Z80 core (MIT), with register accessors added |
| `charset/` | the 768-byte Spectrum character set the game prints with |
| `tape/` | the tape image built into the page |
| `walkthrough.json` | the hints, produced by `test/walkthrough.js` |
| `locpics/` | one picture per location, named `<room number> <description>.png` |
| `locpics.json` | the pictures packed for the page, produced by `tools/locpics.py locpics` |
| `tools/macpics.py` | decodes the pictures from the Macintosh version's data fork |
| `test/` | headless checks: `play.js` runs commands against a tape, `browser.js` drives the page in Playwright |

To change a picture, edit its PNG in `locpics/` (240×128, or an exact multiple such
as the 960×512 they are kept at), then run `python3 tools/locpics.py locpics` and
`python3 build.py`.

## The Macintosh pictures

The 1985 Macintosh version stores its 55 illustrations in a format of its own:
each is a 240×128 image in 16 "inks", which the Mac showed as black-and-white
dither patterns. `tools/macpics.py` decodes them (the format was worked out from
the program's 68000 code). The inks turned out to be a painter's palette used
consistently across the set — one ink is always sky, one water, one foliage —
so the pictures could be coloured; the ones here were then finished by hand.
The Mac numbers its pictures differently from the Spectrum's rooms, so they were
paired with the Spectrum's locations by comparing them with the Spectrum's own
drawings of the same places.

## Credits and rights

- *The Hobbit* is © Melbourne House / Beam Software (Philip Mitchell, Veronika
  Megler; graphics Kent Rees). The tape image and the illustrations (derived from
  the Macintosh release) are theirs.
- The Z80 core is © Molly Howell, MIT licence.
- The Spectrum character set is © Amstrad plc, who permit its distribution for
  emulation.
- The hints are Jacob Gunness's walkthrough (1 April 1990).
- The emulator, the game hooks and the page are released under the MIT licence
  (see `LICENSE`).
