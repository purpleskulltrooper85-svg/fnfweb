import { WIDTH, HEIGHT } from './engine/draw.js';
import { VolumeTray } from './engine/volumetray.js';

// Holds the active state and handles fade transitions between states.
export const game = {
  state: null,
  next: null,
  fade: 0,
  fadeDir: 0,
  fps: 0,

  setState(s) {
    if (this.state && this.state.leave) this.state.leave();
    this.state = s;
    if (s.enter) s.enter();
  },

  switchState(s) {
    if (this.fadeDir === 1) return;
    this.next = s;
    this.fadeDir = 1;
  },

  get busy() {
    return this.fadeDir === 1;
  },

  update(dt) {
    if (this.fadeDir === 1) {
      this.fade += dt / 0.25;
      if (this.fade >= 1) {
        this.fade = 1;
        this.setState(this.next);
        this.next = null;
        this.fadeDir = -1;
      }
    } else if (this.fadeDir === -1) {
      this.fade -= dt / 0.3;
      if (this.fade <= 0) {
        this.fade = 0;
        this.fadeDir = 0;
      }
    }
    if (this.state && this.state.update) this.state.update(dt);
    VolumeTray.update(dt);
  },

  draw(ctx) {
    if (this.state && this.state.draw) this.state.draw(ctx);
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${this.fade})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    VolumeTray.draw(ctx);
  },
};
