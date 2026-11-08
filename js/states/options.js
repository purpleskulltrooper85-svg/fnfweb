import { A } from '../engine/assets.js';
import { Audio } from '../engine/audio.js';
import { drawCover, WIDTH, HEIGHT } from '../engine/draw.js';
import { CHARACTERS, DEFAULTS, STAGES, keyName, saveSettings, settings } from '../engine/settings.js';
import { drawAlphabet, measureAlphabet } from '../engine/alphabet.js';
import { arrowSkins, loadArrowSkin } from '../engine/arrowskins.js';
import { drawFrameCentered } from '../engine/sprite.js';
import { preloadCharacters } from '../engine/character.js';
import { VolumeTray } from '../engine/volumetray.js';
import { game } from '../game.js';
import { MainMenuState, MENU_MUSIC } from './mainmenu.js';

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
// Volume channels mirror the on-screen tray; each is 0-100.
const VOL_FIELD = { master: 'volume', music: 'musicVolume', voices: 'voicesVolume', sfx: 'sfxVolume' };
const AUDIO_ROWS = [
  { channel: 'master', label: 'Master Volume', type: 'vol' },
  { channel: 'music', label: 'Music Volume', type: 'vol' },
  { channel: 'voices', label: 'Voices Volume', type: 'vol' },
  { channel: 'sfx', label: 'Sound Effects', type: 'vol' },
];
const CUSTOM_CATS = ['Arrows', 'Characters', 'Stages'];
const SECTIONS = [
  { name: 'Preferences', rows: PREFERENCE_ROWS },
  { name: 'Audio', rows: AUDIO_ROWS },
  { name: 'Controls', rows: LANE_NAMES.map((n, lane) => ({ key: 'keys', lane, label: `${n} Keys`, type: 'key' })) },
  { name: 'Customization', rows: [], custom: true },
];

// Scrollable list geometry.
const LIST_TOP = 232;
const ROW_GAP = 56;
const VIEW_TOP = 200;
const VIEW_BOTTOM = HEIGHT - 30;
const VIEW_H = VIEW_BOTTOM - VIEW_TOP;
const SCROLLBAR_X = 1044;
const SCROLLBAR_W = 10;

export class OptionsState {
  constructor(menuSel = 0, section = 0, sel = 0) {
    this.menuSel = menuSel;
    this.section = Math.min(section, SECTIONS.length - 1);
    this.sel = sel;
    this.binding = null; // { lane, slot }
    this.customCat = 0;
    this.scroll = 0;
  }

  enter() {
    // Keep the menu track running; restart it if a song had stopped it.
    if (Audio.musicUrl !== MENU_MUSIC) Audio.playMusic(MENU_MUSIC);
    // Preload the picker's character art so the preview is instant.
    if (!OptionsState.chars) {
      OptionsState.chars = {};
      preloadCharacters(CHARACTERS.map(c => c.id)).then(chars => { OptionsState.chars = chars; });
    }
  }

  get rows() {
    const sec = SECTIONS[this.section];
    if (!sec.custom) return sec.rows;
    const rows = [{ type: 'category', label: 'Category' }];
    if (this.customCat === 0) rows.push({ type: 'arrow', label: 'Arrow Skin' });
    else if (this.customCat === 1) rows.push({ type: 'char', slot: 'player1', label: 'Player' });
    else rows.push({ type: 'stage', label: 'Stage' });
    return rows;
  }

  get maxScroll() {
    return Math.max(0, this.rows.length * ROW_GAP - VIEW_H);
  }

  clampScroll() {
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll));
  }

  rowY(i) {
    return LIST_TOP + i * ROW_GAP - this.scroll;
  }

  // Keep the selected row inside the visible window.
  ensureVisible() {
    const i = this.sel;
    const y = this.rowY(i);
    if (y - ROW_GAP / 2 < VIEW_TOP) this.scroll = LIST_TOP + i * ROW_GAP - ROW_GAP / 2 - VIEW_TOP;
    else if (y + ROW_GAP / 2 > VIEW_BOTTOM) this.scroll = LIST_TOP + i * ROW_GAP + ROW_GAP / 2 - VIEW_BOTTOM;
    this.clampScroll();
  }

  // Character/stage rows cycle through the catalogue; the label shown is the
  // human name for the currently-selected id.
  cycleList(slot, dir) {
    const list = slot === 'stage' ? STAGES : CHARACTERS;
    const key = slot === 'stage' ? 'stage' : slot;
    const i = Math.max(0, list.findIndex(e => e.id === settings[key]));
    const next = list[(i + dir + list.length) % list.length];
    settings[key] = next.id;
    saveSettings();
    Audio.playSFX('music/HoverSound.ogg');
  }

  value(row) {
    if (row.type === 'category') return CUSTOM_CATS[this.customCat];
    if (row.type === 'arrow') return settings.arrowSkin;
    if (row.type === 'char') return (CHARACTERS.find(c => c.id === settings[row.slot]) || CHARACTERS[0]).label;
    if (row.type === 'stage') return (STAGES.find(s => s.id === settings.stage) || STAGES[0]).label;
    if (row.type === 'vol') return `${Audio[VOL_FIELD[row.channel]]} / 100`;
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
    if (row.type === 'category') {
      this.customCat = (this.customCat + dir + CUSTOM_CATS.length) % CUSTOM_CATS.length;
      this.sel = 0;
      this.scroll = 0;
    } else if (row.type === 'arrow') {
      this.cycleSkin(dir);
      return;
    } else if (row.type === 'char' || row.type === 'stage') {
      this.cycleList(row.type === 'stage' ? 'stage' : row.slot, dir);
      return;
    } else if (row.type === 'vol') {
      Audio.setChannel(row.channel, Audio[VOL_FIELD[row.channel]] + dir * (big ? 10 : 1));
      VolumeTray.show(row.channel);
    } else if (row.type === 'bool') settings[row.key] = !settings[row.key];
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
    this.scroll = 0;
    Audio.playSFX('music/HoverSound.ogg');
  }

  cycleSkin(dir) {
    const list = arrowSkins.list.length ? arrowSkins.list : ['default'];
    const i = Math.max(0, list.indexOf(settings.arrowSkin));
    settings.arrowSkin = list[(i + dir + list.length) % list.length];
    saveSettings();
    // Load the newly-selected skin so the preview updates right away.
    loadArrowSkin(settings.arrowSkin).catch(() => {});
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
      case 'ArrowUp': case 'KeyW': if (n) this.sel = (this.sel - 1 + n) % n; this.ensureVisible(); Audio.playSFX('music/HoverSound.ogg'); break;
      case 'ArrowDown': case 'KeyS': if (n) this.sel = (this.sel + 1) % n; this.ensureVisible(); Audio.playSFX('music/HoverSound.ogg'); break;
      case 'ArrowLeft': case 'KeyA': if (row) this.change(-1, e.shiftKey); break;
      case 'ArrowRight': case 'KeyD': if (row) this.change(1, e.shiftKey); break;
      case 'Enter': case 'Space':
        if (row && row.type === 'key') { this.binding = { lane: row.lane, slot: 0 }; Audio.playSFX('music/HoverSound.ogg'); }
        else if (row) this.change(1, false);
        break;
      case 'Backspace':
        if (row && row.type === 'arrow') { settings.arrowSkin = DEFAULTS.arrowSkin; saveSettings(); Audio.cancel(); }
        else if (row && row.type === 'char') { settings[row.slot] = DEFAULTS[row.slot]; saveSettings(); Audio.cancel(); }
        else if (row && row.type === 'stage') { settings.stage = DEFAULTS.stage; saveSettings(); Audio.cancel(); }
        else if (row && row.type === 'key') {
          settings.keys[row.lane] = [...DEFAULTS.keys[row.lane]];
          saveSettings();
          Audio.cancel();
        } else if (row && (row.type === 'bool' || row.type === 'num')) {
          settings[row.key] = DEFAULTS[row.key];
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

  onWheel(dy) {
    if (this.maxScroll <= 0) return;
    this.scroll += dy * 0.5;
    this.clampScroll();
  }

  // Animate the character preview. The idle anim is non-looping (in game it is
  // re-triggered on each beat), so restart it when it finishes.
  update(dt) {
    const c = this.previewChar();
    if (!c) return;
    if (c.curName !== 'idle') c.play('idle', true);
    else if (c.finished) c.play('idle', true);
    c.update(dt);
  }

  previewChar() {
    if (!SECTIONS[this.section].custom || this.customCat !== 1) return null;
    const row = this.rows[this.sel];
    const id = row && row.type === 'char' ? settings[row.slot] : settings.player1;
    return (OptionsState.chars && OptionsState.chars[id]) || null;
  }

  // Tabs are laid out with equal gaps between the labels, so a wide label like
  // "Customization" no longer crowds the tab next to it.
  tabLayout() {
    if (this._tabs && this._tabs.n === SECTIONS.length) return this._tabs;
    const ws = SECTIONS.map(s => measureAlphabet(s.name, { scale: 0.5 }));
    const pad = 44;
    const gap = Math.max(24, (WIDTH - pad * 2 - ws.reduce((a, b) => a + b, 0)) / (SECTIONS.length - 1));
    const xs = [];
    let x = pad;
    for (const w of ws) { xs.push(x + w / 2); x += w + gap; }
    this._tabs = { n: SECTIONS.length, xs, ws };
    return this._tabs;
  }

  tabX(i) {
    return this.tabLayout().xs[i];
  }

  draw(ctx) {
    drawCover(ctx, A.menuBG, 1.08);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawAlphabet(ctx, 'OPTIONS', WIDTH / 2, 52, { scale: 0.8, align: 'center' });

    // Section tabs
    const tabY = 112;
    SECTIONS.forEach((sec, i) => {
      const x = this.tabX(i);
      const on = i === this.section;
      const w = measureAlphabet(sec.name, { scale: 0.5 });
      if (on) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(x - w / 2 - 18, tabY - 30, w + 36, 60);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 3;
        ctx.strokeRect(x - w / 2 - 18, tabY - 30, w + 36, 60);
      }
      drawAlphabet(ctx, sec.name, x, tabY, { scale: 0.5, align: 'center', alpha: on ? 1 : 0.5 });
    });
    drawAlphabet(ctx, '< Q / E to switch tabs >', WIDTH / 2, 166, { scale: 0.24, align: 'center', alpha: 0.7 });

    // Scrollable row list.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, VIEW_TOP, WIDTH, VIEW_H);
    ctx.clip();
    this.rows.forEach((row, i) => {
      const y = this.rowY(i);
      const on = i === this.sel;
      if (on) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(260, y - ROW_GAP / 2 + 2, 760, ROW_GAP - 4);
      }
      const a = on ? 1 : 0.6;
      drawAlphabet(ctx, row.label, 290, y, { scale: 0.42, alpha: a });
      const val = this.value(row);
      if (row.type === 'key') drawAlphabet(ctx, val, 990, y, { scale: 0.42, align: 'right', alpha: a });
      else drawAlphabet(ctx, on ? `< ${val} >` : val, 990, y, { scale: 0.42, align: 'right', alpha: a });
    });
    ctx.restore();

    this.drawScrollbar(ctx);

    // Preview under the list: arrows, or the selected character/stage.
    if (SECTIONS[this.section].custom) {
      if (this.customCat === 0) this.drawArrowPreview(ctx);
      else if (this.customCat === 1) this.drawCharPreview(ctx);
    }

    const help = this.binding ? 'Press a key to bind (ESC cancels)' : '';
    if (help) drawAlphabet(ctx, help, WIDTH / 2, HEIGHT - 16, { scale: 0.26, align: 'center' });
  }

  drawCharPreview(ctx) {
    const char = this.previewChar();
    const baseY = Math.min(VIEW_BOTTOM + 30, HEIGHT - 90);
    if (!char) {
      drawAlphabet(ctx, 'Loading...', WIDTH / 2, baseY, { scale: 0.4, align: 'center', alpha: 0.7 });
      return;
    }
    const f = char.frame;
    if (!f) return;
    const s = Math.min(0.45, 150 / f.fh);
    char.centered = false;
    char.scale = s;
    char.alpha = 1;
    // placeAt positions the separate legs sprite as well, so the bottom half of
    // characters like Purple Shaggy no longer lands in the corner. Centre the
    // frame horizontally and stand the feet on baseY.
    const gx = WIDTH / 2 + (char.anchor[0] - f.fw / 2) * s;
    char.placeAt(gx, baseY);
    char.draw(ctx);
  }

  drawScrollbar(ctx) {
    const max = this.maxScroll;
    if (max <= 0) return;
    const trackX = SCROLLBAR_X;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(trackX, VIEW_TOP, SCROLLBAR_W, VIEW_H);
    const thumbH = Math.max(40, VIEW_H * (VIEW_H / (this.rows.length * ROW_GAP)));
    const thumbY = VIEW_TOP + (VIEW_H - thumbH) * (this.scroll / max);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fillRect(trackX, thumbY, SCROLLBAR_W, thumbH);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(trackX + 1, thumbY + 1, SCROLLBAR_W - 2, thumbH - 2);
  }

  drawArrowPreview(ctx) {
    const atlas = arrowSkins.loaded[settings.arrowSkin] || null;
    const baseY = Math.min(VIEW_BOTTOM + 26, HEIGHT - 70);
    if (!atlas) {
      drawAlphabet(ctx, 'Default arrows', WIDTH / 2, baseY, { scale: 0.4, align: 'center', alpha: 0.7 });
      return;
    }
    for (let lane = 0; lane < 4; lane++) {
      const fr = atlas.getFrames(`arrow${['LEFT', 'DOWN', 'UP', 'RIGHT'][lane]}`)[0]
        || atlas.getFrames(`note${['Left', 'Down', 'Up', 'Right'][lane]}`)[0]
        || atlas.getFrames(['left', 'down', 'up', 'right'][lane])[0];
      if (fr) {
        const px = WIDTH / 2 + (lane - 1.5) * 110;
        drawFrameCentered(ctx, fr.img || atlas.image, fr, px, baseY, 0.5 * (fr.scale || 1));
      }
    }
  }

  tabAt(x, y) {
    if (y < 82 || y > 142) return -1;
    for (let i = 0; i < SECTIONS.length; i++) {
      const tx = this.tabX(i);
      const w = measureAlphabet(SECTIONS[i].name, { scale: 0.5 });
      if (x >= tx - w / 2 - 18 && x <= tx + w / 2 + 18) return i;
    }
    return -1;
  }

  scrollbarAt(x, y) {
    return this.maxScroll > 0 && x >= SCROLLBAR_X - 8 && x <= SCROLLBAR_X + SCROLLBAR_W + 8 && y >= VIEW_TOP && y <= VIEW_BOTTOM;
  }

  rowAt(x, y) {
    if (y < VIEW_TOP || y > VIEW_BOTTOM) return -1;
    for (let i = 0; i < this.rows.length; i++) {
      const ry = this.rowY(i);
      if (y >= ry - ROW_GAP / 2 && y <= ry + ROW_GAP / 2) return i;
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
    if (this.scrollbarAt(x, y)) {
      // Jump the view so the click maps to the matching scroll position.
      this.scroll = ((y - VIEW_TOP) / VIEW_H) * this.maxScroll;
      this.clampScroll();
      return;
    }
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
