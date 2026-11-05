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

import { loadAtlas, loadJSON } from './assets.js';

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

export const arrowSkins = { list: [], loaded: {} };

// Discover every skin folder listed by the server (arrowskins/skins.json).
export async function discoverArrowSkins() {
  if (arrowSkins.list.length) return arrowSkins.list;
  const names = ['default'];
  try {
    const data = await loadJSON('arrowskins/skins.json');
    for (const n of data.skins || []) if (!names.includes(n)) names.push(n);
  } catch {
    // No manifest (e.g. static hosting) - default skin only.
  }
  arrowSkins.list = names;
  return names;
}

// Load (and cache) a skin atlas. Returns null for the default sheet (A.notes).
export async function loadArrowSkin(name) {
  if (name === 'default' || !name) return null;
  if (arrowSkins.loaded[name]) return arrowSkins.loaded[name];
  const base = `arrowskins/${name}/`;
  let atlas;
  try {
    atlas = await loadAtlas(`${base}arrow`);
  } catch {
    atlas = await loadAtlas(`${base}NOTE_assets`);
  }
  uniqueNames(atlas.frames);
  renameFrames(atlas);
  arrowSkins.loaded[name] = atlas;
  return atlas;
}
