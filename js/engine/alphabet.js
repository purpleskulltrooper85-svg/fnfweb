import { A } from './assets.js';
import { drawText } from './text.js';

// Bitmap font from assets/images/ui/alphabet (bold = white letters with black outline, like FNF menus).
const cache = new Map();
const LINE = 70;

function framesFor(ch, bold) {
  const key = `${bold ? 1 : 0}${ch}`;
  if (cache.has(key)) return cache.get(key);
  const atlas = A.alphabet;
  let prefixes;
  if (bold) prefixes = [`bold ${ch.toUpperCase()}`];
  else if (/[A-Z]/.test(ch)) prefixes = [`cap ${ch}`];
  else if (/[a-z]/.test(ch)) prefixes = [`low ${ch}`];
  else prefixes = [`num ${ch}`, `sym ${ch}`];
  let frames = null;
  for (const p of prefixes) {
    const f = atlas ? atlas.getFrames(p) : [];
    if (f.length) { frames = f; break; }
  }
  cache.set(key, frames);
  return frames;
}

function glyphs(text, bold, scale) {
  const out = [];
  for (const ch of String(text)) {
    if (ch === ' ') { out.push({ w: 40 * scale }); continue; }
    const frames = framesFor(ch, bold);
    if (frames) out.push({ frames, w: frames[0].fw * scale + 3 * scale });
    else out.push({ ch, w: 46 * scale });
  }
  return out;
}

export function measureAlphabet(text, { scale = 1, bold = true } = {}) {
  return glyphs(text, bold, scale).reduce((s, g) => s + g.w, 0);
}

// y is the vertical centre of the line.
export function drawAlphabet(ctx, text, x, y, { scale = 1, bold = true, align = 'left', alpha = 1, time = performance.now() / 1000 } = {}) {
  const gs = glyphs(text, bold, scale);
  const width = gs.reduce((s, g) => s + g.w, 0);
  let cx = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  const base = y + (LINE * scale) / 2;
  const fi = Math.floor(time * 12);
  ctx.save();
  ctx.globalAlpha *= alpha;
  for (const g of gs) {
    if (g.frames) {
      const f = g.frames[fi % g.frames.length];
      const dw = f.w * scale, dh = f.h * scale;
      const fx = cx + (-f.fx) * scale;
      const fy = base - f.fh * scale + (-f.fy) * scale;
      ctx.drawImage(A.alphabet.image, f.x, f.y, f.w, f.h, fx, fy, dw, dh);
    } else if (g.ch) {
      drawText(ctx, g.ch, cx + g.w / 2, y, { size: 52 * scale, color: bold ? '#fff' : '#000', stroke: bold ? '#000' : null });
    }
    cx += g.w;
  }
  ctx.restore();
  return width;
}
