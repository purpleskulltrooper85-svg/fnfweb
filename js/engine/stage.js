import { loadImage, loadJSON } from './assets.js';

// Stage JSON: layers are drawn in world space with FNF-style scroll factors (parallax).
export async function loadStage(name) {
  const json = await loadJSON(`data/stages/${name}.json`);
  const layers = await Promise.all(json.layers.map(async l => ({
    scale: 1, scroll: 1, front: false, ...l, img: await loadImage(`assets/images/${l.image}.png`),
  })));
  return { zoom: 1, camera_boyfriend: [0, 0], camera_opponent: [0, 0], ...json, layers };
}
