import { loadAtlas, loadJSON } from './assets.js';
import { AnimatedSprite } from './sprite.js';

const SING = ['singLEFT', 'singDOWN', 'singUP', 'singRIGHT'];

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
    this.healthIcon = json.healthicon || 'icon-bf';
    this.lastSing = -Infinity;
    this.missStartTime = -Infinity;
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
    if (miss) {
      this.missStartTime = Date.now() / 1000;
    }
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
    // Check if miss animation has been playing for 2 seconds
    if (this.curName && this.curName.endsWith('miss') && this.missStartTime > 0) {
      if (Date.now() / 1000 - this.missStartTime >= 2) {
        this.dance();
        this.missStartTime = -Infinity;
      }
    }
  }
}

export async function loadCharacter(name) {
  const json = await loadJSON(`data/characters/${name}.json`);
  const atlas = await loadAtlas('assets/images/' + json.image);
  return new Character(json, atlas);
}
