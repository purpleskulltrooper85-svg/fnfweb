import { WIDTH, HEIGHT } from './draw.js';
import { settings } from './settings.js';

// Touch-first device detection. iPadOS 13+ reports itself as a Mac, so the
// touch-point count is checked as well as the user-agent.
let detectedCache = null;
export function detectMobile() {
  if (detectedCache !== null) return detectedCache;
  let result = false;
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || '';
    const touch = (navigator.maxTouchPoints || 0) > 1;
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Silk|Kindle/i.test(ua)) result = true;
    else if (navigator.platform === 'MacIntel' && touch) result = true;
    else if (touch && typeof screen !== 'undefined' && Math.min(screen.width, screen.height) <= 820) result = true;
  }
  detectedCache = result;
  return result;
}

// Effective mobile mode: the user's Options choice, or auto-detection.
export function mobileMode() {
  const mode = settings.mobileSupport || 'auto';
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return detectMobile();
}

// ---- on-screen buttons (drawn only in mobile mode)
const BTN = 74;
const MARGIN = 16;

// Menus put the close/back X in the top-left; the game puts the pause button in
// the top-right, out of the way of the touch lanes.
export function closeButtonRect() {
  return { x: MARGIN, y: MARGIN, w: BTN, h: BTN };
}

export function pauseButtonRect() {
  return { x: WIDTH - BTN - MARGIN, y: MARGIN, w: BTN, h: BTN };
}

function inRect(r, x, y) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function closeButtonHit(x, y) {
  return inRect(closeButtonRect(), x, y);
}

export function pauseButtonHit(x, y) {
  return inRect(pauseButtonRect(), x, y);
}

function buttonBox(ctx, r) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 4;
  ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
  ctx.restore();
}

// A large, easy-to-hit "close/back" X for touch screens.
export function drawCloseButton(ctx) {
  const r = closeButtonRect();
  buttonBox(ctx, r);
  const pad = 22;
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(r.x + pad, r.y + pad);
  ctx.lineTo(r.x + r.w - pad, r.y + r.h - pad);
  ctx.moveTo(r.x + r.w - pad, r.y + pad);
  ctx.lineTo(r.x + pad, r.y + r.h - pad);
  ctx.stroke();
  ctx.restore();
}

// Pause glyph: two vertical bars.
export function drawPauseButton(ctx) {
  const r = pauseButtonRect();
  buttonBox(ctx, r);
  ctx.save();
  ctx.fillStyle = '#fff';
  const bw = 14, bh = 40, gap = 12;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  ctx.fillRect(cx - gap / 2 - bw, cy - bh / 2, bw, bh);
  ctx.fillRect(cx + gap / 2, cy - bh / 2, bw, bh);
  ctx.restore();
}

// In-game touch tile bar (Funky Friday style): four full-height lane buttons
// across the bottom of the screen.
export const MOBILE_TILE_H = 150;

export function tileRect(lane) {
  const w = WIDTH / 4;
  return { x: lane * w, y: HEIGHT - MOBILE_TILE_H, w, h: MOBILE_TILE_H };
}

export function tileLaneAt(x, y) {
  if (y < HEIGHT - MOBILE_TILE_H) return -1;
  const lane = Math.floor(x / (WIDTH / 4));
  return lane < 0 ? 0 : lane > 3 ? 3 : lane;
}
