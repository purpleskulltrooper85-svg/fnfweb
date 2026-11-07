ARROW SKINS
===========

Drop custom arrow (note) skins in here. Each skin is its own folder:

  arrowskins/
    MySkin/
      arrow.png      <- the sprite sheet (one PNG)
      arrow.xml      <- the Sparrow atlas for it
    AnotherSkin/
      NOTE_assets.png
      NOTE_assets.xml

Then open the game, go to Options > Customization and pick your skin with the
Left / Right arrow keys (or click the < > buttons). It is saved automatically.

The XML must be a normal FNF Sparrow atlas (a list of <SubTexture> entries).
Frame names can be the usual ones (arrowUP, arrowDOWN, arrowLEFT, arrowRIGHT,
left press, left confirm, purple0, "purple hold piece", ...). If your sheet uses
a different naming style, see the notes at the bottom.

The built-in "default" skin is the game's own assets/images/NOTE_assets sheet.


HOLD / SUSTAIN ART
------------------
If your skin ships hold art, add a hold sheet (its own PNG + XML) and list that
XML in arrowskins/skins.json alongside the others. Name the frames per direction:

  left hold piece, down hold piece, up hold piece, right hold piece
  left hold end,   down hold end,   up hold end,   right hold end

Per-colour names work too, and that is what the standard FNF sheet uses:

  purple hold piece / purple hold end   (also blue / green / red)

So the usual NOTE_hold_assets.png (416x87: eight 50x87 tiles at x=1,53,105,157,
209,261,313,365) just needs an XML like:

  <TextureAtlas imagePath="NOTE_hold_assets.png">
    <SubTexture name="purple hold piece0000" x="1"   y="0" width="50" height="87"/>
    <SubTexture name="purple hold end0000"   x="53"  y="0" width="50" height="87"/>
    ... (blue 105/157, green 209/261, red 313/365)
  </TextureAtlas>

A PNG on its own is not enough - without the XML the engine cannot read the
tiles. Any hold frames a skin does not provide fall back to the built-in ones,
so a skin with heads + strums only still shows sustains correctly.


SKINS WITH SEVERAL SHEETS (e.g. Circles)
----------------------------------------
A skin can have more than one XML, and the XMLs do not have to be named
arrow.xml / NOTE_assets.xml. Each XML names its own image via imagePath, so a
skin like Circles can ship circle.xml + light.xml (both pointing at the same
PNG). To list such a skin, add it to arrowskins/skins.json:

  {
    "skins": ["Circles"],
    "xmls": { "Circles": ["circle.xml", "light.xml"] }
  }

The game reads that manifest first, so the same skins appear both when running
through server.js and when hosted statically (GitHub Pages). A skin folder with
no .png in it is skipped, so a half-copied skin never shows up as a broken entry.

Frame names are matched flexibly: note heads may be purple0 / blue0 / ... or
noteLeft / noteDown / noteUp / noteRight, and the strum arrows may be
arrowUP / up press / up confirm (or UP / UP press). Sheets whose art is larger
or smaller than the default are scaled automatically to match.


ADDING A WHOLE FOLDER OF SKINS AT ONCE
--------------------------------------
If you downloaded a pack with lots of skins, run this once from the project
folder (needs Python 3):

  python tools/import_arrow_skins.py "C:\path\to\the_best_custom_arrow_skins"

It copies every skin it recognises into this folder. Then reload the game.

You can also just copy the folders here by hand - the game lists whatever
folders it finds, no code changes needed.

For the game to see them, the game has to be run through server.js (start.bat),
which builds the arrowskins/skins.json list automatically.


IF YOUR SKIN DOESN'T SHOW UP
----------------------------
* Each skin needs its .png art plus the matching .xml (Sparrow atlas). The .xml
  alone is not enough - without the PNG the folder is skipped.
* Supported single-sheet names: arrow.png/arrow.xml, or NOTE_assets.png/.xml.
  Any other sheet names must be listed in arrowskins/skins.json.
* The game also accepts skins whose static frames are named UP/DOWN/LEFT/RIGHT
  instead of arrowUP/arrowDOWN/arrowLEFT/arrowRIGHT.
