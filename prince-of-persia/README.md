# Prince of Persia (Apple II, 1989) in the browser

Jordan Mechner's *Prince of Persia* (Brøderbund, 1989) — the real Apple II
program, from its three disk sides — running on a small Apple IIe emulator in
one self-contained page, `prince.html`, with touch controls for a phone.

Open the page, press *Start the game*, and the machine boots: the sides are
swapped for you whenever the game asks for one, the game's own loader does the
rest, and the title, the story and level 1 follow. Snapshots of the whole
machine can be kept in the browser (the page also takes one when it is hidden,
and offers to resume from it), and the game's own save (Ctrl-G from level 3)
is written back into the disk image and kept too.

## Controls

On a phone: the round pad moves (up is jump, down crouches, the diagonals are
the diagonal jumps), the Action button is the Apple's button — hold it to grab
a ledge, step carefully, or fight — and a tap on the screen is "any key"
(start, skip the story, unpause). The keyboard icon brings up the phone's
keyboard for any other key; the menu pauses the game and holds the commands.

With a keyboard:

| Key | Does |
| --- | --- |
| Arrows, or `J` `L` `I` `K` | left, right, up (jump), down (crouch) |
| `U`, `O` | jump up-left, up-right |
| `Shift`, `Alt` or `Z` | the Apple button (grab, careful step, fight) |
| `Esc` | pause (any key resumes) |
| `Space` | show the time left |
| `Ctrl-A` | restart the level |
| `Ctrl-R` | back to the title |
| `Ctrl-S` | the game's own sound on/off |
| `Ctrl-G` | save the game (from level 3); `Ctrl-L` at the title loads it |

These are the game's own keys; the page only maps the arrows, the button keys
and the touch pad onto them.

## How it works

`js/` holds the machine, written for this page:

- `cpu6502.js` — a 65C02 (all the documented 6502 instructions, decimal mode,
  and the 65C02 additions the game's code uses).
- `apple2.js` — an Apple IIe with 128K: main and auxiliary memory with the
  soft switches (80STORE, RAMRD/RAMWRT, ALTZP, the text/graphics switches),
  the language card with its two banks, the keyboard with the IIe's
  any-key-down flag, the buttons, the speaker, and a Disk II controller in
  slot 6 driven at the nibble level — the `.dsk` images are encoded into
  6&2 nibble tracks and the game's RWTS reads them the way it would a real
  drive. Tracks the program writes are decoded back into the sector image.
- `video.js` — the screen: hi-res with the colour rules of an NTSC monitor,
  low-resolution blocks, and 40-column text with a typeface of the page's own,
  in any of the mixed arrangements.

There is no Apple ROM in the page. The dozen or so monitor entry points a DOS
3.3 boot passes through (text output, key input, the I/O vectors, the
low-resolution plot routines the crack's intro uses) and the disk controller's
boot code are stood in for by native code, only while the ROM is what is
mapped at those addresses; the language card, once the game turns it on, is
the game's. The machine identifies itself as an enhanced IIe, which is what
the game checks for.

The disk sides are the ones in `disks/` (`boot.dsk`, `a.dsk`, `b.dsk`), inlined
into the page at build time. The page watches for the loader's *Please insert
side …* prompt and inserts the side it names; the crack group's intro screens
are skipped by default and can be shown from the settings.

`tools/boot.js` boots an image headlessly in Node and writes screenshots,
which is how the boot was worked out:

```
node tools/boot.js disks/boot.dsk 2400 out.png --keyat=407a:8d:1 --keyat=b71f:8d:2 --swapat=d286:disks/a.dsk:2 --keyat=d286:8d:5 --shot=1600
```

## Building

```
python3 build.py        # inlines js/ and the disks into prince.html
```
