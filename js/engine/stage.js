import { loadImage, loadJSON, loadText, parseSparrow } from './assets.js';

// Stage JSON: layers are drawn in world space with FNF-style scroll factors
// (parallax). A layer is either a still image or a spritesheet:
//
//   still:  { "image": "stages/stage/stageback", "x": .., "y": .. }
//   sheet:  { "sheet": "stages/spooky/Spooky Spritesheet", "xml": "...",
//             "frames": [0, 1, 2], "fps": 12,
//             "flashes": [ { "frames": [1, 2], "fps": 24, "every": 25 } ] }
//
// `flashes` are short bursts played on a timer (the spooky stage's lightning):
// every `every` seconds the layer plays `frames` for one pass, then returns to
// its idle `frames`.
export async function loadStage(name) {
  const json = await loadJSON(`data/stages/${name}.json`);
  const layers = await Promise.all(json.layers.map(loadLayer));
  return { zoom: 1, camera_boyfriend: [0, 0], camera_opponent: [0, 0], ...json, layers };
}

async function loadLayer(l) {
  const base = { scale: 1, scroll: 1, front: false, ...l };
  if (!l.sheet) {
    return { ...base, img: await loadImage(`assets/images/${l.image}.png`) };
  }
  const xmlFile = l.xml || `${l.sheet}.xml`;
  const xml = await loadText(`assets/images/${xmlFile}`);
  const img = await loadImage(`assets/images/${l.sheet}.png`);
  const atlas = parseSparrow(img, xml);
  const idle = l.frames && l.frames.length
    ? l.frames.map(i => atlas.frames[i]).filter(Boolean)
    : atlas.frames;
  const flashes = (l.flashes || []).map(f => ({
    frames: (f.frames || []).map(i => atlas.frames[i]).filter(Boolean),
    fps: f.fps || 24,
    every: f.every || 25,
  })).filter(f => f.frames.length);
  return { ...base, atlas, img, frames: idle, idle, flashes };
}

// Advance a spritesheet layer's animation. Still layers are untouched.
export function updateLayer(l, dt) {
  if (!l.frames || !l.frames.length || !l.atlas) return;
  if (l.flashT > 0) {
    l.flashT -= dt;
    l.flashIdx += dt * (l.flashFps || 24);
    if (l.flashT <= 0 || l.flashIdx >= l.flashFrames.length) {
      l.frames = l.idle;
      l.flashT = 0;
    }
    return;
  }
  if (l.flashes && l.flashes.length) {
    if (l.flashClock === undefined) l.flashClock = l.flashes[0].every;
    l.flashClock -= dt;
    if (l.flashClock <= 0) {
      const f = l.flashes[0];
      l.flashFrames = f.frames;
      l.flashFps = f.fps;
      l.flashT = f.frames.length / f.fps;
      l.flashIdx = 0;
      l.frames = f.frames;
      l.flashClock = f.every;
      return;
    }
  }
  l.idleIdx = ((l.idleIdx || 0) + dt * (l.fps || 12)) % Math.max(1, l.idle.length);
  l.frames = [l.idle[Math.floor(l.idleIdx)] || l.idle[0]];
}

// The frame a spritesheet layer should draw right now.
export function layerFrame(l) {
  if (!l.frames || !l.frames.length) return null;
  if (l.flashT > 0) return l.flashFrames[Math.min(l.flashFrames.length - 1, Math.floor(l.flashIdx))];
  return l.frames[0];
}
