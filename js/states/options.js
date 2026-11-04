import { A } from '../engine/assets.js';
import { Audio } from '../engine/audio.js';
import { drawCover, WIDTH, HEIGHT } from '../engine/draw.js';
import { DEFAULTS, keyName, saveSettings, settings } from '../engine/settings.js';
import { drawText } from '../engine/text.js';
import { drawAlphabet } from '../engine/alphabet.js';
import { game } from '../game.js';
import { MainMenuState } from './mainmenu.js';

const LANE_NAMES = ['Left', 'Down', 'Up', 'Right'];
const ROWS = [
  { key: 'downscroll', label: 'Downscroll', type: 'bool' },
  { key: 'middlescroll', label: 'Middlescroll', type: 'bool' },
  { key: 'ghostTapping', label: 'Ghost Tapping', type: 'bool' },
  { key: 'scrollSpeed', label: 'Scroll Speed', type: 'num', min: 0, max: 6, step: 0.1, fmt: v => (v === 0 ? 'Chart' : v.toFixed(1)) },
  { key: 'rate', label: 'Playback Rate', type: 'num', min: 0.5, max: 2, step: 0.05, fmt: v => `${v.toFixed(2)}x` },
  { key: 'offset', label: 'Note Offset', type: 'num', min: -500, max: 500, step: 1, fmt: v => `${v} ms` },
  { key: 'hitsounds', label: 'Hitsounds', type: 'bool' },
  { key: 'showTiming', label: 'Show Hit Timing', type: 'bool' },
  { key: 'botplay', label: 'Botplay', type: 'bool' },
  ...LANE_NAMES.map((n, lane) => ({ key: 'keys', lane, label: `${n} Keys`, type: 'key' })),
];

export class OptionsState {
  constructor(menuSel = 0) {
    this.menuSel = menuSel;
    this.sel = 0;
    this.binding = null; // { lane, slot }
  }

  enter() {
    // Don't restart music - let it continue from main menu
  }

  value(row) {
    const v = settings[row.key];
    if (row.type === 'bool') return v ? 'ON' : 'OFF';
    if (row.type === 'num') return row.fmt(v);
    const [a, b] = v[row.lane];
    if (this.binding && this.binding.lane === row.lane) return this.binding.slot === 0 ? '[press key] / ' + keyName(b) : `${keyName(a)} / [press key]`;
    return `${keyName(a)} / ${keyName(b)}`;
  }

  change(dir, big) {
    const row = ROWS[this.sel];
    if (row.type === 'bool') settings[row.key] = !settings[row.key];
    else if (row.type === 'num') {
      const step = row.step * (big ? 10 : 1);
      const v = Math.round((settings[row.key] + dir * step) / row.step) * row.step;
      settings[row.key] = Math.min(row.max, Math.max(row.min, +v.toFixed(3)));
    } else return;
    Audio.playSFX('music/HoverSound.ogg');
    saveSettings();
  }

  onKeyDown(e) {
    if (this.binding) {
      e.preventDefault();
      if (e.code === 'Escape') { this.binding = null; Audio.cancel(); return; }
      const { lane, slot } = this.binding;
      // a key can only belong to one lane
      settings.keys.forEach(pair => pair.forEach((c, i) => { if (c === e.code) pair[i] = null; }));
      settings.keys[lane][slot] = e.code;
      if (slot === 0) this.binding.slot = 1;
      else this.binding = null;
      Audio.playSFX('music/HoverSound.ogg');
      saveSettings();
      return;
    }
    const n = ROWS.length;
    const row = ROWS[this.sel];
    switch (e.code) {
      case 'ArrowUp': case 'KeyW': this.sel = (this.sel - 1 + n) % n; Audio.playSFX('music/HoverSound.ogg'); break;
      case 'ArrowDown': case 'KeyS': this.sel = (this.sel + 1) % n; Audio.playSFX('music/HoverSound.ogg'); break;
      case 'ArrowLeft': case 'KeyA': this.change(-1, e.shiftKey); break;
      case 'ArrowRight': case 'KeyD': this.change(1, e.shiftKey); break;
      case 'Enter': case 'Space':
        if (row.type === 'key') { this.binding = { lane: row.lane, slot: 0 }; Audio.playSFX('music/HoverSound.ogg'); } else this.change(1, false);
        break;
      case 'Backspace':
        settings[row.key] = row.type === 'key' ? (settings.keys[row.lane] = [...DEFAULTS.keys[row.lane]], settings.keys) : DEFAULTS[row.key];
        saveSettings();
        Audio.cancel();
        break;
      case 'Escape':
        saveSettings();
        Audio.cancel();
        game.switchState(new MainMenuState(this.menuSel));
        break;
      default: break;
    }
  }

  update() {}

  draw(ctx) {
    drawCover(ctx, A.menuBG, 1.08);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawAlphabet(ctx, 'OPTIONS', WIDTH / 2, 58, { scale: 0.9, align: 'center' });
    const top = 130, gap = 40;
    ROWS.forEach((row, i) => {
      const y = top + i * gap;
      const on = i === this.sel;
      const color = on ? '#ffe066' : '#ffffff';
      if (on) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(260, y - gap / 2 + 2, 760, gap - 4);
      }
      const a = on ? 1 : 0.6;
      drawAlphabet(ctx, row.label, 290, y, { scale: 0.42, alpha: a });
      const val = this.value(row);
      if (row.type === 'key') drawAlphabet(ctx, val, 990, y, { scale: 0.42, align: 'right', alpha: a });
      else drawAlphabet(ctx, on ? `< ${val} >` : val, 990, y, { scale: 0.42, align: 'right', alpha: a });
    });
    const help = this.binding
      ? 'Press a key to bind (ESC cancels)'
      : 'UP/DOWN select  -  LEFT/RIGHT change (SHIFT = x10)  -  ENTER toggle/rebind  -  BACKSPACE reset  -  ESC back';
    drawAlphabet(ctx, help, WIDTH / 2, HEIGHT - 28, { scale: 0.26, align: 'center' });
  }
}
