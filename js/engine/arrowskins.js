// Arrow (note) skin support.
//
// Skins live under arrowskins/<name>/ and are discovered at runtime. A skin
// folder can either:
//   * ship a single Sparrow sheet `arrow.png` + `arrow.xml` (any frame names,
//     the most common shape for custom arrow skins), or
//   * mirror the game's NOTE_assets layout (arrowUP, purple0,
//     "purple hold piece", up press, up confirm, ...).
//
// Drop a folder into arrowskins/ and it appears in Options > Arrows with no
// code changes. "default" is the built-in assets/images/NOTE_assets sheet.

import { Atlas, loadAtlas, loadImage, loadJSON, loadText, parseSparrow } from './assets.js';

// Maps a custom sheet's frame names onto the names the game expects.
const ALIASES = [
  [/^arrow\s*left$/i, 'arrowLEFT'], [/^arrow\s*down$/i, 'arrowDOWN'],
  [/^arrow\s*up$/i, 'arrowUP'], [/^arrow\s*right$/i, 'arrowRIGHT'],
  [/^left\s*confirm$/i, 'left confirm'], [/^down\s*confirm$/i, 'down confirm'],
  [/^up\s*confirm$/i, 'up confirm'], [/^right\s*confirm$/i, 'right confirm'],
  [/^left\s*press$/i, 'left press'], [/^down\s*press$/i, 'down press'],
  [/^up\s*press$/i, 'up press'], [/^right\s*press$/i, 'right press'],
];

function renameFrames(atlas) {
  for (const f of atlas.frames) {
    for (const [re, to] of ALIASES) {
      if (re.test(f.name)) { f.name = to; break; }
    }
  }
  return atlas;
}

// Some sheets repeat frame names; make them unique so getFrames() stays sane.
function uniqueNames(frames) {
  const seen = new Set();
  for (const f of frames) {
    if (!seen.has(f.name)) { seen.add(f.name); continue; }
    let i = 2;
    while (seen.has(`${f.name}_${i}`)) i++;
    f.name = `${f.name}_${i}`;
    seen.add(f.name);
  }
  return frames;
}

export const arrowSkins = { list: [], loaded: {}, xmls: {} };

// Discover every skin folder listed by the server (arrowskins/skins.json).
export async function discoverArrowSkins() {
  if (arrowSkins.list.length) return arrowSkins.list;
  let names = ['default'];
  try {
    const data = await loadJSON('arrowskins/skins.json');
    for (const n of data.skins || []) if (!names.includes(n)) names.push(n);
    // Optional per-skin list of XML files, so folders with arbitrary sheet
    // names (circle.xml, light.xml, ...) load without a naming convention.
    arrowSkins.xmls = data.xmls || {};
  } catch {
    // No manifest (e.g. static hosting) - default skin only.
  }
  // Keep only skins whose artwork actually loads, so a skin copied without its
  // PNG never shows up as a dead entry. Loading here also warms the cache.
  const usable = ['default'];
  for (const n of names.slice(1)) {
    try {
      if (await loadArrowSkin(n)) usable.push(n);
    } catch {
      console.warn(`Arrow skin "${n}" could not be loaded (missing image?)`);
    }
  }
  arrowSkins.list = usable;
  return usable;
}

// A skin folder may hold several sheets (e.g. notes.xml + light.xml), each with
// its own PNG. We read each XML's imagePath and tag its frames with that image,
// so a merged atlas can draw frames that come from different files.
async function loadSheet(base, xmlFile) {
  const xmlText = await loadText(`${base}${xmlFile}`);
  const imagePath = /imagePath\s*=\s*"([^"]+)"/i.exec(xmlText);
  if (!imagePath) throw new Error(`${xmlFile}: no imagePath`);
  const image = await loadImage(`${base}${imagePath[1]}`);
  const atlas = parseSparrow(image, xmlText);
  for (const f of atlas.frames) { f.img = image; f.sheet = xmlFile; }
  return atlas;
}

// Load (and cache) a skin atlas. Returns null for the default sheet (A.notes).
export async function loadArrowSkin(name) {
  if (name === 'default' || !name) return null;
  if (arrowSkins.loaded[name]) return arrowSkins.loaded[name];
  const base = `arrowskins/${name}/`;
  const declared = arrowSkins.xmls[name];

  // Prefer the single-sheet shapes; otherwise merge every XML the manifest
  // lists for this skin onto one atlas. When the manifest already names the
  // sheets, skip the conventional probes so we do not request files that are
  // not there.
  let atlas;
  if (declared && declared.length) {
    const sheets = await Promise.all(declared.map(f => loadSheet(base, f)));
    atlas = new Atlas(sheets[0]?.image, sheets.flatMap(s => s.frames));
  } else {
    try {
      atlas = await loadAtlas(`${base}arrow`);
    } catch {
      atlas = await loadAtlas(`${base}NOTE_assets`);
    }
  }
  uniqueNames(atlas.frames);
  renameFrames(atlas);
  // Scale each source sheet to the default note size, so a skin whose art is
  // bigger or smaller than the built-in sheet still lines up with the strums.
  normalizeFrameScale(atlas);
  arrowSkins.loaded[name] = atlas;
  return atlas;
}

// Default note art fills a ~155px canvas. Each sheet is scaled so its visible
// art matches that size. We measure the opaque content, not the canvas, because
// some sheets (e.g. Circles' circle.xml) pad an 890px circle inside a 1100px
// canvas - normalising by canvas would render the note ~20% too small.
function contentExtent(img, f) {
  const fallback = Math.max(f.w, f.h);
  if (!img || fallback > 2048) return fallback;
  const c = document.createElement('canvas');
  c.width = f.w; c.height = f.h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  let data;
  try { data = ctx.getImageData(0, 0, f.w, f.h).data; } catch { return fallback; }
  let minx = f.w, miny = f.h, maxx = -1, maxy = -1;
  for (let y = 0; y < f.h; y++) {
    const row = y * f.w * 4;
    for (let x = 0; x < f.w; x++) {
      if (data[row + x * 4 + 3] > 16) {
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
      }
    }
  }
  if (maxx < 0) return fallback;
  return Math.max(maxx - minx + 1, maxy - miny + 1);
}

function normalizeFrameScale(atlas) {
  const bySheet = new Map();
  for (const f of atlas.frames) {
    const key = f.sheet || '';
    if (!bySheet.has(key)) bySheet.set(key, []);
    bySheet.get(key).push(f);
  }
  for (const frames of bySheet.values()) {
    const arrows = frames.filter(f => /^arrow(LEFT|DOWN|UP|RIGHT)/i.test(f.name));
    const sample = arrows.length ? arrows : frames;
    const sizes = sample.map(f => contentExtent(f.img || atlas.image, f)).sort((a, b) => a - b);
    const median = sizes[Math.floor(sizes.length / 2)] || 1;
    const factor = 155 / median;
    for (const f of frames) f.scale = factor;
  }
}
