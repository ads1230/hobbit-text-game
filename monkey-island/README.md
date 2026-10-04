# The Secret of Monkey Island (Macintosh, 1993), native in the browser

LucasArts' *The Secret of Monkey Island* running on a SCUMM engine written in
JavaScript for this one game: the 1993 Macintosh release's data files are read
directly, and the scripts, rooms, objects, actors, costumes, walk boxes,
dialogue, verbs, inventory, palette effects, transitions and the Macintosh
music are all interpreted by the page itself. No emulator, no WebAssembly build
of anything; `index.html` plus the scripts in `js/` are the whole program.

The engine is a port of the SCUMM version 5 parts of
[ScummVM](https://www.scummvm.org/) to JavaScript, so it is licensed under the
GNU General Public License v3 like ScummVM is (see `LICENSE`). The game itself
is not included: the page asks for your own copy and keeps it in the browser's
storage on your device. Nothing is uploaded anywhere.

## Playing

Open the page and choose the game files. It accepts:

- the StuffIt archive of the Macintosh release (`.sit`, StuffIt 5 with
  "Arsenic" compression — the page unpacks it itself),
- a `.zip` of the files, or
- the files themselves: `MONKEY1.000`, `MONKEY1.001`, and the `Monkey Island`
  application (as a MacBinary, AppleSingle/AppleDouble `._Monkey Island`, or a
  raw `.rsrc` resource fork), which supplies the sampled instruments for the
  music. Without it the game plays silently.

Then *Play*. On a phone: tap to walk, to choose verbs and to use things; long
press for the default action on whatever you touch (what the right button does
with a mouse). The bar under the screen skips a cut-scene (Esc), skips the
current line of dialogue (.), performs the default action, and goes full screen.
*File* has the saves (eight slots with pictures, plus an automatic save whenever
the page is hidden) and *Game* has the sound switch and the controls.

With a keyboard: Esc, `.`, F5 for the File menu, and the verbs' usual hotkeys.

## How it works

`js/scumm_res.js` reads the index and the data file (every byte XOR 0x69, the
room directory, the object owner/state tables) and locates every resource by its
absolute offset, so nothing is ever copied or "loaded"; scripts, costumes,
images and fonts are used in place.

`js/scumm_engine.js` is the interpreter core: variables, the 80 script slots,
nesting, cut-scenes and overrides, object and inventory handling, verbs and the
sentence queue, input, the camera, room changes and the main loop.
`js/scumm_ops.js` is the complete v5 opcode set, with the Monkey Island fixes
that ScummVM applies. `js/scumm_screen.js` keeps the virtual screens (the room
with its scrollable double buffer, the sentence line, the verb area), the
strip-based dirty tracking, z-plane masks, palette, colour cycling, palette
fades and the room transition effects; `js/scumm_gfx.js` decodes the image
strips. `js/scumm_text.js` draws text with the game's own fonts and runs the
dialogue machinery; `js/scumm_actor.js` walks actors through the box network
and renders their costumes, scaled and masked; `js/scumm_sound.js` plays the
Macintosh version's music and effects — four channels of note events played
with the application's sampled instruments, rendered to PCM for Web Audio —
and `js/scumm_save.js` captures and restores the whole state.

`js/stuffit.js` is a StuffIt 5 reader with the Arsenic decompressor
(arithmetic coding, move-to-front and a Burrows–Wheeler transform), ported
from The Unarchiver's XADMaster library (LGPL), so the archive the game is
usually kept in can be used as it is.

The ScummVM source was the reference throughout, and the result was checked
side by side with ScummVM's own WebAssembly build running the same data: the
same scenes, text and credits appear at the same moments. The node scripts in
`tools/` drive the engine without a browser: `boot.js` runs the game headlessly
and writes screenshots, `roomsweep.js` starts in every room, `monkeytest.js`
plays at random for thousands of frames (saving and restoring along the way),
and `savetest.js` checks that a restored game continues identically.

## Credits and licences

- *The Secret of Monkey Island* © Lucasfilm Games / LucasArts. The game data
  is yours and stays on your device.
- Engine code: a JavaScript port of parts of ScummVM, © the ScummVM Team,
  GNU GPL v3 (`LICENSE`).
- `js/stuffit.js`: ported from XADMaster by Dag Ågren and others, LGPL 2.1
  (`LICENSE.LGPL`).
