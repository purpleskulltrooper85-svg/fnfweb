# Friday Night Web

Browser FNF engine (vanilla JS, no build step).

## Run
Double-click `start.bat` (uses Node, falls back to Python) and open http://localhost:8080.
Opening `index.html` directly won't work - browsers block loading assets over `file://`.

## Controls
- Menu: Up/Down (or W/S) + Enter, or mouse. Esc goes back.
- Play: A S W D or arrow keys. Enter/Esc = pause, F1 = botplay, Shift+R = restart.

## Layout
- `assets/` - your original sheets; `assets/images/` - generated Sparrow atlases (PNG + XML)
- `data/characters/*.json` - character animations/offsets (Psych-style): `bf`, `dad`
- `data/stages/*.json` - stage layers (scroll factors), character positions, camera zoom/offsets
- `data/songs/<song>/<song>.json` - charts (base-game/Psych `song.notes[].sectionNotes` format)
- `js/states/` - main menu, options, play state
- `tools/slice_sheets.py` - rebuilds the atlases from the raw sheets (`pip install pillow numpy scipy`); pass a step name (e.g. `dad`, `stage`, `alphabet`) to rebuild just that
- `tools/make_test_chart.py` - regenerates the Dad/BF call-and-response test chart
