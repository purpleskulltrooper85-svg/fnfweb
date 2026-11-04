// Asset loading + Sparrow (FNF .png/.xml) texture atlas support.
const cache = new Map();

function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

export function loadImage(src) {
  return cached('img:' + src, () => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image ' + src));
    img.src = src;
  }));
}

export async function loadText(src) {
  const res = await fetch(src, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ${src} (${res.status})`);
  return res.text();
}

export async function loadJSON(src) {
  return JSON.parse(await loadText(src));
}

export class Atlas {
  constructor(image, frames) {
    this.image = image;
    this.frames = frames;
  }

  // Frames for an animation prefix (like Flixel's addByPrefix). Names that are exactly
  // prefix + digits win, so "BF NOTE LEFT" does not swallow "BF NOTE LEFT MISS".
  getFrames(prefix, indices = null) {
    let list = this.frames.filter(f => f.name.startsWith(prefix) && /^\d+$/.test(f.name.slice(prefix.length)));
    if (!list.length) list = this.frames.filter(f => f.name.startsWith(prefix));
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (indices && indices.length) list = indices.map(i => list[i]).filter(Boolean);
    return list;
  }
}

export function parseSparrow(image, xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const frames = [];
  for (const st of doc.getElementsByTagName('SubTexture')) {
    const num = (n, d = 0) => (st.hasAttribute(n) ? parseFloat(st.getAttribute(n)) : d);
    const w = num('width'), h = num('height');
    const rotated = st.getAttribute('rotated') === 'true';
    frames.push({
      name: st.getAttribute('name'),
      x: num('x'), y: num('y'), w, h,
      fx: num('frameX'), fy: num('frameY'),
      fw: num('frameWidth', rotated ? h : w), fh: num('frameHeight', rotated ? w : h),
      rotated,
    });
  }
  return new Atlas(image, frames);
}

// path without extension, e.g. "assets/images/NOTE_assets"
export function loadAtlas(path) {
  return cached('atlas:' + path, async () => {
    const [img, xml] = await Promise.all([loadImage(path + '.png'), loadText(path + '.xml')]);
    return parseSparrow(img, xml);
  });
}

// Shared, preloaded assets.
export const A = {};
