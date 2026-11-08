import { loadAtlas, loadJSON } from './assets.js';
import { AnimatedSprite } from './sprite.js';

const SING = ['singLEFT', 'singDOWN', 'singUP', 'singRIGHT'];
const MISS_HOLD = 0.5; // seconds the miss animation stays on screen

export class Character extends AnimatedSprite {
  constructor(json, atlas) {
    super(atlas);
    this.json = json;
    this.scale = json.scale || 1;
    this.flipX = !!json.flip_x;
    this.anchor = json.anchor || [0, 0];
    this.healthColor = json.healthbar_colors || [161, 161, 161];
    for (const a of json.animations) {
      this.addAnim(a.anim, a.name, a.fps || 24, !!a.loop, a.indices && a.indices.length ? a.indices : null, a.offsets || [0, 0]);
    }
    this.singDuration = json.sing_duration || 4;
    this.healthIcon = json.healthicon || 'assets/images/icons/icon-bf';
    this.lastSing = -Infinity;
    this.missHold = 0;
    // Some characters keep their legs on a separate sheet and leave them out of
    // the idle frames (e.g. Purple Shaggy's "solo_legs"). `json.legs` names that
    // animation; it is drawn behind the body with its feet at the anchor, and
    // hidden while a sing pose (which already has its own legs) is showing.
    this.legs = null;
    if (json.legs && json.legs.name) {
      const lg = new AnimatedSprite(atlas);
      if (lg.addAnim('legs', json.legs.name, json.legs.fps || 24, true)) {
        lg.play('legs', true);
        this.legs = lg;
      }
    }
    this.dance();
  }

  // Return to the idle loop (also used when a miss hold is cut short).
  resumeIdle() {
    this.missHold = 0;
    this.dance();
  }

  // Put the character's feet (idle anchor) on a point of the stage.
  placeAt(x, y) {
    this.x = x - this.anchor[0] * this.scale;
    this.y = y - this.anchor[1] * this.scale;
    if (this.legs) {
      // Feet of the leg art sit on the anchor, centred horizontally. The scale
      // must be set before measuring, otherwise the bounds are unscaled and the
      // legs land above the anchor whenever the character is scaled down.
      this.legs.scale = this.scale;
      this.legs.flipX = this.flipX;
      const b = this.legs.bounds();
      const off = this.legsOffset();
      this.legs.x = x - b.w / 2 + off[0] * this.scale;
      this.legs.y = y - b.h + off[1] * this.scale;
    }
  }

  legsOffset() {
    const o = this.json && this.json.legs && this.json.legs.offset;
    return Array.isArray(o) ? o : [0, 0];
  }

  dance() {
    this.play('idle', true);
  }

  sing(lane, now, miss = false) {
    const name = SING[lane] + (miss ? 'miss' : '');
    this.play(this.has(name) ? name : SING[lane], true);
    this.lastSing = now;
    this.missHold = miss ? MISS_HOLD : 0;
  }

  // centre of the idle frame, used for camera targets. Characters whose legs
  // live on a separate sprite (Purple Shaggy) measure the whole body, otherwise
  // the camera frames only the torso and the legs hang below the screen.
  midpoint() {
    const a = this.anims.idle;
    const f = a ? a.frames[0] : this.frame;
    const s = this.scale;
    let top = this.y;
    let bottom = this.y + f.fh * s;
    if (this.legs) {
      const lb = this.legs.bounds();
      if (lb) {
        top = Math.min(top, lb.y);
        bottom = Math.max(bottom, lb.y + lb.h);
      }
    }
    return [this.x + (f.fw * s) / 2, (top + bottom) / 2];
  }

  get singing() {
    return !!this.curName && this.curName.startsWith('sing');
  }

  // Legs show only while the idle body (which has none) is playing.
  legsVisible() {
    return !!this.legs && this.curName === 'idle';
  }

  update(dt) {
    super.update(dt);
    if (this.legs) {
      this.legs.visible = this.legsVisible();
      this.legs.alpha = this.alpha;
      if (this.legs.visible) this.legs.update(dt);
    }
    // Hold the miss animation for MISS_HOLD seconds, then return to idle.
    if (this.missHold > 0) {
      this.missHold -= dt;
      if (this.missHold <= 0) {
        this.missHold = 0;
        this.dance();
      }
    }
  }

  draw(ctx) {
    if (this.legs && this.legs.visible) this.legs.draw(ctx);
    super.draw(ctx);
  }
}

export async function loadCharacter(name) {
  const json = await loadJSON(`data/characters/${name}.json`);
  // json.image is a full path (assets/... or a mod's shared/... folder).
  const atlas = await loadAtlas(json.image);
  return new Character(json, atlas);
}

// Preload every character in the picker so its art is ready the moment it is
// chosen (and so a character whose art is missing is skipped, not shown broken).
export async function preloadCharacters(ids) {
  const out = {};
  await Promise.all(ids.map(async id => {
    try { out[id] = await loadCharacter(id); } catch { /* skip missing art */ }
  }));
  return out;
}
