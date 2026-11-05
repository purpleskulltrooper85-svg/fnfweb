import { A } from '../engine/assets.js';
import { Audio } from '../engine/audio.js';
import { drawCover, WIDTH, HEIGHT } from '../engine/draw.js';
import { DEFAULTS, keyName, saveSettings, settings } from '../engine/settings.js';
import { drawAlphabet, measureAlphabet } from '../engine/alphabet.js';
import { game } from '../game.js';
import { MainMenuState } from './mainmenu.js';

const LANE_NAMES = ['Left', 'Down', 'Up', 'Right'];
const PREFERENCE_ROWS = [
  { key: 'downscroll', label: 'Downscroll', type: 'bool' },
  { key: 'middlescroll', label: 'Middlescroll', type: 'bool' },
  { key: 'ghostTapping', label: 'Ghost Tapping', type: 'bool' },
  { key: 'scrollSpeed', label: 'Scroll Speed', type: 'num', min: 0, max: 6, step: 0.1, fmt: v => (v === 0 ? 'Chart' : v.toFixed(1)) },
  { key: 'rate', label: 'Playback Rate', type: 'num', min: 0.5, max: 2, step: 0.05, fmt: v => `${v.toFixed(2)}x` },
  { key: 'offset', label: 'Note Offset', type: 'num', min: -500, max: 500, step: 1, fmt: v => `${v} ms` },
  { key: 'hitsounds', label: 'Hitsounds', type: 'bool' },
  { key: 'showTiming', label: 'Show Hit Timing', type: 'bool' },
  { key: 'showTimer', label: 'Show Timer', type: 'bool' },
  { key: 'botplay', label: 'Botplay', type: 'bool' },
];
const SECTIONS = [
  { name: 'Preferences', rows: PREFERENCE_ROWS },
  { name: 'Controls', rows: LANE_NAMES.map((n, lane) => ({ key: 'keys', lane, label: `${n} Keys`, type: 'key' })) },
  { name: 'Arrows', rows: [], soon: true },
];

export class OptionsState {
  constructor(menuSel = 0, section = 0, sel = 0) {
    this.menuSel = menuSel;
    this.section = Math.min(section, SECTIONS.length - 1);
    this.sel = sel;
    this.binding = null; // { lane, slot }
  }

  enter() {
    // Don't restart music - let it continue from main menu
  }

  get rows() {
    return SECTIONS[this.section].rows;
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
    const row = this.rows[this.sel];
    if (!row) return;
    if (row.type === 'bool') settings[row.key] = !settings[row.key];
    else if (row.type === 'num') {
      const step = row.step * (big ? 10 : 1);
      const v = Math.round((settings[row.key] + dir * step) / row.step) * row.step;
      settings[row.key] = Math.min(row.max, Math.max(row.min, +v.toFixed(3)));
    } else return;
    Audio.playSFX('music/HoverSound.ogg');
    saveSettings();
  }

  changeSection(dir) {
    this.section = (this.section + dir + SECTIONS.length) % SECTIONS.length;
    this.sel = 0;
    this.binding = null;
    Audio.playSFX('music/HoverSound.ogg');
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
    if (e.code === 'KeyQ' || e.code === 'KeyE') {
      this.changeSection(e.code === 'KeyE' ? 1 : -1);
      return;
    }
    const n = this.rows.length;
    const row = this.rows[this.sel];
    switch (e.code) {
      case 'ArrowUp': case 'KeyW': if (n) this.sel = (this.sel - 1 + n) % n; Audio.playSFX('music/HoverSound.ogg'); break;
      case 'ArrowDown': case 'KeyS': if (n) this.sel = (this.sel + 1) % n; Audio.playSFX('music/HoverSound.ogg'); break;
      case 'ArrowLeft': case 'KeyA': if (row) this.change(-1, e.shiftKey); break;
      case 'ArrowRight': case 'KeyD': if (row) this.change(1, e.shiftKey); break;
      case 'Enter': case 'Space':
        if (row && row.type === 'key') { this.binding = { lane: row.lane, slot: 0 }; Audio.playSFX('music/HoverSound.ogg'); }
        else if (row) this.change(1, false);
        break;
      case 'Backspace':
        if (row) {
          if (row.type === 'key') settings.keys[row.lane] = [...DEFAULTS.keys[row.lane]];
          else settings[row.key] = DEFAULTS[row.key];
          saveSettings();
          Audio.cancel();
        }
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
    drawAlphabet(ctx, 'OPTIONS', WIDTH / 2, 52, { scale: 0.8, align: 'center' });

    // Section tabs
    const tabY = 112;
    SECTIONS.forEach((sec, i) => {
      const x = WIDTH / 2 - 340 + i * 340;
      const on = i === this.section;
      const w = measureAlphabet(sec.name, { scale: 0.5 });
      if (on) {
        ctx.fillStyle = 'rgba(255, 230, 102, 0.22)';
        ctx.fillRect(x - w / 2 - 18, tabY - 30, w + 36, 60);
        ctx.strokeStyle = 'rgba(255, 230, 102, 0.9)';
        ctx.lineWidth = 3;
        ctx.strokeRect(x - w / 2 - 18, tabY - 30, w + 36, 60);
      }
      drawAlphabet(ctx, sec.name, x, tabY, { scale: 0.5, align: 'center', alpha: on ? 1 : 0.5 });
    });
    drawAlphabet(ctx, '< Q / E to switch tabs >', WIDTH / 2, 168, { scale: 0.24, align: 'center', alpha: 0.7 });

    if (SECTIONS[this.section].soon) {
      drawAlphabet(ctx, 'Arrows', WIDTH / 2, HEIGHT / 2 - 20, { scale: 0.9, align: 'center', alpha: 0.85 });
      drawAlphabet(ctx, 'Coming soon...', WIDTH / 2, HEIGHT / 2 + 60, { scale: 0.5, align: 'center', alpha: 0.7 });
      return;
    }

    const top = 240, gap = 40;
    this.rows.forEach((row, i) => {
      const y = top + i * gap;
      const on = i === this.sel;
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
    const help = this.binding ? 'Press a key to bind (ESC cancels)' : '';
    if (help) drawAlphabet(ctx, help, WIDTH / 2, HEIGHT - 28, { scale: 0.26, align: 'center' });
  }

  tabAt(x, y) {
    if (y < 82 || y > 142) return -1;
    for (let i = 0; i < SECTIONS.length; i++) {
      const tx = WIDTH / 2 - 340 + i * 340;
      const w = measureAlphabet(SECTIONS[i].name, { scale: 0.5 });
      if (x >= tx - w / 2 - 18 && x <= tx + w / 2 + 18) return i;
    }
    return -1;
  }

  rowAt(x, y) {
    if (x < 260 || x > 1020) return -1;
    const top = 240, gap = 40;
    for (let i = 0; i < this.rows.length; i++) {
      const ry = top + i * gap;
      if (y >= ry - gap / 2 && y <= ry + gap / 2) return i;
    }
    return -1;
  }

  onMouseMove(x, y) {
    if (this.binding) return;
    const i = this.rowAt(x, y);
    if (i >= 0 && i !== this.sel) {
      this.sel = i;
      Audio.playSFX('music/HoverSound.ogg');
    }
  }

  onMouseDown(x, y) {
    if (this.binding) return;
    const t = this.tabAt(x, y);
    if (t >= 0) {
      if (t !== this.section) this.changeSection(t - this.section);
      return;
    }
    if (SECTIONS[this.section].soon) return;
    const i = this.rowAt(x, y);
    if (i < 0) return;
    if (i !== this.sel) {
      this.sel = i;
      Audio.playSFX('music/HoverSound.ogg');
      return;
    }
    const row = this.rows[i];
    if (row.type === 'key') {
      this.binding = { lane: row.lane, slot: 0 };
      Audio.playSFX('music/HoverSound.ogg');
    } else {
      this.change(1, false);
    }
  }
}
