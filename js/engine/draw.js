export const WIDTH = 1280;
export const HEIGHT = 720;

// Draw an image scaled to cover the whole screen (like CSS background-size: cover).
export function drawCover(ctx, img, zoom = 1, ox = 0, oy = 0) {
  const s = Math.max(WIDTH / img.width, HEIGHT / img.height) * zoom;
  const w = img.width * s, h = img.height * s;
  ctx.drawImage(img, (WIDTH - w) / 2 + ox, (HEIGHT - h) / 2 + oy, w, h);
  return { s, x: (WIDTH - w) / 2 + ox, y: (HEIGHT - h) / 2 + oy };
}

export function withZoom(ctx, zoom, fn) {
  ctx.save();
  ctx.translate(WIDTH / 2, HEIGHT / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-WIDTH / 2, -HEIGHT / 2);
  fn();
  ctx.restore();
}

export function lerp(a, b, t) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}
