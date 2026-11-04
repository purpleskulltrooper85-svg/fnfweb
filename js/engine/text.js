export const FONT = '"Arial Black", "Segoe UI Black", Impact, sans-serif';
export const VCR_FONT = '"VCR OSD Mono", "Courier New", monospace';

export function drawText(ctx, text, x, y, opts = {}) {
  const {
    size = 32, align = 'center', baseline = 'middle', color = '#fff',
    stroke = '#000', strokeWidth = Math.max(2, size / 6), font = FONT, alpha = 1, weight = '900',
  } = opts;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.lineJoin = 'round';
  if (stroke && strokeWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}
