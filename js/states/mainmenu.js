import { A } from '../engine/assets.js';
import { Audio } from '../engine/audio.js';
import { drawAlphabet } from '../engine/alphabet.js';
import { drawCover, lerp, WIDTH, HEIGHT } from '../engine/draw.js';
import { mobileMode } from '../engine/mobile.js';
import { AnimatedSprite } from '../engine/sprite.js';
import { drawText } from '../engine/text.js';
import { game } from '../game.js';
import { OptionsState } from './options.js';
import { FreeplayState } from './freeplay.js';
import { PlayState } from './playstate.js';
import { StoryModeState } from './storymode.js';

const ITEMS = [
  { id: 'story mode', label: 'Story Mode' },
  { id: 'freeplay', label: 'Freeplay' },
  { id: 'options', label: 'Options' },
];
const MENU_BPM = 102;
const ITEM_SCALE = 0.55;
export const MENU_MUSIC = 'music/Main menu song.mp3';

export class MainMenuState {
  constructor(selected = 0) {
    this.sel = selected;
  }

  enter() {
    this.items = ITEMS.map(it => {
      const s = new AnimatedSprite(A.menuItems);
      s.addAnim('idle', `${it.id} basic`, 24, true);
      s.addAnim('selected', `${it.id} white`, 24, true);
      s.centered = true;
      s.scale = ITEM_SCALE;
      s.play('idle');
      return { ...it, sprite: s };
    });
    this.items.forEach((it, i) => {
      it.sprite.x = WIDTH / 2;
      it.sprite.y = 410 + i * 100;
    });
    this.items[this.sel].sprite.play('selected');
    this.time = 0;
    this.lastBeat = -1;
    this.bump = 0;
    this.camY = 0;
    this.confirming = null;
    this.toast = null;
    // Only (re)start the menu music if it is not already playing. Returning
    // from a song keeps the same track running instead of restarting it.
    if (Audio.musicUrl !== MENU_MUSIC) Audio.playMusic(MENU_MUSIC);
  }

  select(i) {
    if (i === this.sel) return;
    this.items[this.sel].sprite.play('idle');
    this.sel = i;
    this.items[i].sprite.play('selected');
    Audio.playSFX('music/HoverSound.ogg');
  }

  confirm() {
    const it = this.items[this.sel];
    Audio.playSFX('music/ConfirmSound.ogg');
    this.confirming = { t: 0 };
  }

  go() {
    const id = this.items[this.sel].id;
    if (id === 'story mode') game.switchState(new StoryModeState());
    else if (id === 'freeplay') game.switchState(new FreeplayState(0));
    else if (id === 'options') game.switchState(new OptionsState(this.sel));
  }

  update(dt) {
    this.time += dt;
    const beat = Math.floor((this.time * MENU_BPM) / 60);
    if (beat !== this.lastBeat) {
      this.lastBeat = beat;
      this.bump = 1;
    }
    this.bump = Math.max(0, this.bump - dt * 4);
    const target = (this.sel - (this.items.length - 1) / 2) * 14;
    this.camY = lerp(this.camY, target, dt * 6);
    for (const it of this.items) it.sprite.update(dt);

    if (this.confirming) {
      const c = this.confirming;
      c.t += dt;
      this.items.forEach((it, i) => {
        if (i === this.sel) it.sprite.visible = Math.floor(c.t / 0.06) % 2 === 0;
        else it.sprite.alpha = Math.max(0, 1 - c.t / 0.4);
      });
      if (c.t >= 1 && !c.done) {
        c.done = true;
        this.items[this.sel].sprite.visible = true;
        this.go();
      }
    }
    if (this.toast) {
      this.toast.t -= dt;
      if (this.toast.t <= 0) this.toast = null;
    }
  }

  draw(ctx) {
    drawCover(ctx, A.menuBG, 1.08, 0, -this.camY);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const ls = 1.45 * (1 + 0.05 * this.bump * this.bump);
    const lw = A.logo.width * ls, lh = A.logo.height * ls;
    ctx.drawImage(A.logo, WIDTH / 2 - lw / 2, 178 - lh / 2, lw, lh);

    for (const it of this.items) it.sprite.draw(ctx);

    drawText(ctx, 'Friday Night Web v0.1', 12, HEIGHT - 14, { size: 16, align: 'left', strokeWidth: 4 });
    if (!mobileMode()) drawText(ctx, 'UP/DOWN or mouse  -  ENTER or click', WIDTH - 12, HEIGHT - 14, { size: 16, align: 'right', strokeWidth: 4 });

    if (this.toast) {
      drawText(ctx, this.toast.text, WIDTH / 2, HEIGHT - 50, { size: 24, color: '#ffe066', alpha: Math.min(1, this.toast.t * 3) });
    }
  }

  itemAt(x, y) {
    return this.items.findIndex(it => {
      const b = it.sprite.bounds();
      return b && x >= b.x && x <= b.x + b.w && y >= b.y + b.h * 0.15 && y <= b.y + b.h * 0.85;
    });
  }

  onKeyDown(e) {
    if (this.confirming || e.repeat && (e.code === 'Enter' || e.code === 'Space')) return;
    const n = this.items.length;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') this.select((this.sel - 1 + n) % n);
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.select((this.sel + 1) % n);
    else if (e.code === 'Enter' || e.code === 'Space') this.confirm();
  }

  onMouseMove(x, y) {
    if (this.confirming) return;
    const i = this.itemAt(x, y);
    if (i >= 0) this.select(i);
  }

  onMouseDown(x, y) {
    if (this.confirming) return;
    const i = this.itemAt(x, y);
    if (i >= 0) {
      this.select(i);
      this.confirm();
    }
  }
}
