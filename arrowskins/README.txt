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

Then open the game, go to Options > Arrows, and pick your skin with the
Left / Right arrow keys (or click the < > buttons). It is saved automatically.

The XML must be a normal FNF Sparrow atlas (a list of <SubTexture> entries).
Frame names can be the usual ones (arrowUP, arrowDOWN, arrowLEFT, arrowRIGHT,
left press, left confirm, purple0, "purple hold piece", ...). If your sheet uses
a different naming style, see the notes at the bottom.

The built-in "default" skin is the game's own assets/images/NOTE_assets sheet.


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
* Each skin needs a .png and a matching .xml (Sparrow atlas) in the same folder.
* Supported sheet file names: arrow.png/arrow.xml, or NOTE_assets.png/.xml,
  or noteSplashes-style sheets are ignored.
* The game also accepts skins whose static frames are named UP/DOWN/LEFT/RIGHT
  instead of arrowUP/arrowDOWN/arrowLEFT/arrowRIGHT.
