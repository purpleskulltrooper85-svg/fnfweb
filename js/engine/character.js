import { loadAtlas, loadJSON } from './assets.js';
import { AnimatedSprite } from './sprite.js';

const SING = ['singLEFT', 'singDOWN', 'singUP', 'singRIGHT'];
const MISS_HOLD = 1; // seconds the miss animation stays on screen

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

  // centre of the idle frame, used for camera targets
  midpoint() {
    const a = this.anims.idle;
    const f = a ? a.frames[0] : this.frame;
    const s = this.scale;
    return [this.x + (f.fw * s) / 2, this.y + (f.fh * s) / 2];
  }

  get singing() {
    return !!this.curName && this.curName.startsWith('sing');
  }

  update(dt) {
    super.update(dt);
    // Hold the miss animation for MISS_HOLD seconds, then return to idle.
    if (this.missHold > 0) {
      this.missHold -= dt;
      if (this.missHold <= 0) {
        this.missHold = 0;
        this.dance();
      }
    }
  }
}

export async function loadCharacter(name) {
  const json = await loadJSON(`data/characters/${name}.json`);
  // json.image is a full path (assets/... or a mod's shared/... folder).
  const atlas = await loadAtlas(json.image);
  return new Character(json, atlas);
}
