// Draws one atlas frame; (x, y) is the top-left of the untrimmed frame canvas.
export function drawFrame(ctx, img, f, x, y, s = 1, flipX = false) {
  const dispW = (f.rotated ? f.h : f.w) * s;
  const dispH = (f.rotated ? f.w : f.h) * s;
  ctx.save();
  if (flipX) {
    ctx.translate(x + f.fw * s, y);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(x, y);
  }
  ctx.translate(-f.fx * s, -f.fy * s);
  if (f.rotated) {
    ctx.translate(0, dispH);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w * s, f.h * s);
  } else {
    ctx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, dispW, dispH);
  }
  ctx.restore();
}

export function drawFrameCentered(ctx, img, f, cx, cy, s = 1) {
  drawFrame(ctx, img, f, cx - (f.fw * s) / 2, cy - (f.fh * s) / 2, s);
}

export class AnimatedSprite {
  constructor(atlas) {
    this.atlas = atlas;
    this.anims = {};
    this.cur = null;
    this.curName = null;
    this.frameIdx = 0;
    this.time = 0;
    this.finished = true;
    this.x = 0;
    this.y = 0;
    this.scale = 1;
    this.alpha = 1;
    this.flipX = false;
    this.visible = true;
    this.centered = false; // when true, (x, y) is the centre of the frame
  }

  // offset is in unscaled frame pixels; the sprite is drawn at (x, y) - offset * scale
  addAnim(name, prefix, fps = 24, loop = false, indices = null, offset = [0, 0]) {
    const frames = this.atlas.getFrames(prefix, indices);
    if (!frames.length) {
      console.warn(`No frames found for "${prefix}" (${name})`);
      return false;
    }
    this.anims[name] = { frames, fps, loop, offset };
    return true;
  }

  has(name) {
    return !!this.anims[name];
  }

  play(name, force = false) {
    const a = this.anims[name];
    if (!a) return;
    if (!force && this.curName === name && (!this.finished || !a.loop)) return;
    this.cur = a;
    this.curName = name;
    this.frameIdx = 0;
    this.time = 0;
    this.finished = false;
  }

  update(dt) {
    const a = this.cur;
    if (!a || this.finished) return;
    this.time += dt;
    const fd = 1 / a.fps;
    while (this.time >= fd) {
      this.time -= fd;
      this.frameIdx++;
      if (this.frameIdx >= a.frames.length) {
        if (a.loop) {
          this.frameIdx = 0;
        } else {
          this.frameIdx = a.frames.length - 1;
          this.finished = true;
          break;
        }
      }
    }
  }

  get frame() {
    return this.cur ? this.cur.frames[this.frameIdx] : null;
  }

  // Bounding box of the current frame canvas in screen space.
  bounds() {
    const f = this.frame;
    if (!f) return null;
    const s = this.scale;
    if (this.centered) return { x: this.x - (f.fw * s) / 2, y: this.y - (f.fh * s) / 2, w: f.fw * s, h: f.fh * s };
    const [ox, oy] = this.cur.offset;
    return { x: this.x - ox * s, y: this.y - oy * s, w: f.fw * s, h: f.fh * s };
  }

  draw(ctx) {
    const f = this.frame;
    if (!f || !this.visible || this.alpha <= 0) return;
    const b = this.bounds();
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * this.alpha;
    drawFrame(ctx, this.atlas.image, f, b.x, b.y, this.scale, this.flipX);
    ctx.globalAlpha = prev;
  }
}
