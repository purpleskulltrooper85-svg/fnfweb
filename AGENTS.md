# Friday Night Web — agent notes

Vanilla-JS (ES modules, no build step) browser FNF engine. Live at
`https://purpleskulltrooper85-svg.github.io/fnfweb/` (GitHub Pages, static).
Locally served by `server.js` (`PORT=12000 node server.js`).

## Layout
- `js/engine/` — assets, sprite/atlas, audio, character, settings, arrowskins.
- `js/states/` — `mainmenu.js`, `freeplay.js`, `options.js`, `playstate.js`.
- `assets/images/` — default note sheet `NOTE_assets.*`, alphabet, UI.
- `arrowskins/<Name>/` — custom note skins (one PNG + one or more XMLs).
- `songs/<folder>/` — charts + audio; `songs/songs.json` lists base songs.

## Conventions / gotchas
- **Two ways to run**: through `server.js` (scans folders, builds
  `arrowskins/skins.json`) or static (GitHub Pages — no server code). Anything
  that needs discovery must also work from a committed JSON manifest, because
  the live site never runs `server.js`.
- **Arrow skins**: a skin is a folder with a PNG plus Sparrow XML(s). Frame
  names are matched flexibly — note heads `purple0`/`blue0`… or
  `noteLeft`/`noteDown`/`noteUp`/`noteRight`; strum arrows `arrowUP` or `UP`,
  plus `<dir> press` / `<dir> confirm`. Sheets are auto-scaled to the default
  note size per source XML. Skins may use multiple PNGs (each XML's `imagePath`
  is honoured; frames carry their own `img`). A folder with no PNG is skipped.
- **Menu music**: single track, `MENU_MUSIC` in `mainmenu.js`. States only call
  `Audio.playMusic(MENU_MUSIC)` when `Audio.musicUrl !== MENU_MUSIC`, so moving
  between menu/freeplay/options does not restart it. `Audio` guards async loads
  with `musicToken`.
- **Story mode**: plays songs in `songs.json` order (Bopeebo → Fresh →
  Dad Battle), auto-advancing on song end, then returns to the main menu.
- **Input**: every state handles both keyboard and mouse (`onMouseDown` /
  `onMouseMove`); on-screen hit-test helpers (`itemAt`, `rowAt`, `tabAt`,
  `pauseItemAt`) must stay in sync with the drawn layout constants.
- **Scale**: canvas is a fixed 1280×720 design space, letterboxed via
  `viewScale`; convert mouse coords with the inverse of that transform.

## Verify changes
```
node --check js/states/playstate.js   # (any edited file)
PORT=12000 node server.js &           # then drive with puppeteer-core + /usr/bin/chromium
```
Puppeteer is test-only (not shipped). Push is done by the user from Windows
PowerShell 5.x (`;` not `&&`); the agent cannot push (read-only token).
