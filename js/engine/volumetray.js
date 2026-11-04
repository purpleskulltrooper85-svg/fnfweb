import { A } from './assets.js';
import { Audio } from './audio.js';
import { WIDTH } from './draw.js';

// FNF-style volume tray: slides down from the top when the volume changes (- / + / 0 keys).
export const VolumeTray = {
  t: 0,
  y: 0,

  show() {
    this.t = 1.5;
  },

  update(dt) {
    this.t = Math.max(0, this.t - dt);
    this.y += ((this.t > 0 ? 1 : 0) - this.y) * Math.min(1, dt * 12);
  },

  draw(ctx) {
    const box = A.volumeBox;
    if (this.y < 0.01 || !box) return;
    const s = 0.6, w = box.width * s, h = box.height * s;
    const x = (WIDTH - w) / 2, y = -h + (h + 8) * this.y;
    ctx.drawImage(box, x, y, w, h);
    const level = Audio.muted ? 0 : Audio.volume;
    const bars = A.volumeBars && A.volumeBars[level - 1];
    if (bars) ctx.drawImage(bars, x + 28 * s, y + 15 * s, bars.width * s, bars.height * s);
  },
};
