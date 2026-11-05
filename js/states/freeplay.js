import { A, loadImage } from '../engine/assets.js';
import { drawAlphabet, measureAlphabet } from '../engine/alphabet.js';
import { Audio } from '../engine/audio.js';
import { drawCover, lerp, WIDTH, HEIGHT } from '../engine/draw.js';
import { drawText, VCR_FONT } from '../engine/text.js';
import { game } from '../game.js';
import { MainMenuState } from './mainmenu.js';
import { PlayState } from './playstate.js';

const ROW_GAP = 96;
const LIST_TOP = HEIGHT * 0.42;

export class FreeplayState {
  constructor(sel = 0, category = 0, expanded = null) {
    this.categories = ['Base Game', 'Mods'];
    this.category = category;

    this.baseSongs = (A.songs && A.songs.songs) || [];
    this.modSongs = [];
    this.modCategories = {};
    this.expanded = expanded || {}; // mod name -> bool

    this.rows = [];
    this.sel = sel;
    this.scroll = sel;

    this.diff = 0;
    this.icons = {};

    this.searchQuery = '';
    this.searching = false;

    this.modSongsLoaded = false;
    this.loadModSongs();
    this.buildRows();
  }

  async loadModSongs() {
    try {
      const response = await fetch('mods/songs/songs.json?t=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const data = await response.json();
      const songs = Array.isArray(data.songs) ? data.songs : [];

      this.modCategories = {};
      this.modSongs = [];
      for (const song of songs) {
        const modName = song.mod || 'Other';
        (this.modCategories[modName] ||= []).push(song);
      }
      this.modSongs = songs;
      this.modSongsLoaded = true;
      this.loadIcons(songs);
      if (this.category === 1) this.buildRows();
    } catch (error) {
      console.error('Failed to fetch mod songs:', error);
      this.modSongs = [];
      this.modSongsLoaded = true;
      if (this.category === 1) this.buildRows();
    }
  }

  loadIcons(songs) {
    for (const s of songs) {
      if (!s.icon || this.icons[s.icon] !== undefined) continue;
      this.icons[s.icon] = null;
      // s.icon is a full path without extension (assets/... or a mod folder).
      loadImage(`${s.icon}.png`)
        .then(i => { this.icons[s.icon] = i; })
        .catch(() => console.warn('Could not load icon:', s.icon));
    }
  }

  enter() {
    this.buildRows();
    this.loadIcons(this.baseSongs);
    this.loadIcons(this.modSongs);
    this.pickDiff();
  }

  // Build the visible row list. Section headers toggle to reveal a mod's songs.
  buildRows() {
    const query = this.searchQuery.trim().toLowerCase();
    if (query) {
      const pool = this.category === 0 ? this.baseSongs : this.modSongs;
      this.rows = pool
        .filter(s => s.title && s.title.toLowerCase().includes(query))
        .map(song => ({ kind: 'song', song }));
    } else if (this.category === 0) {
      this.rows = this.baseSongs.map(song => ({ kind: 'song', song }));
    } else {
      this.rows = [];
      for (const name of Object.keys(this.modCategories)) {
        const songs = this.modCategories[name];
        this.rows.push({ kind: 'header', mod: name, count: songs.length });
        if (this.expanded[name]) for (const song of songs) this.rows.push({ kind: 'song', song });
      }
    }
    this.sel = Math.min(this.sel, Math.max(0, this.rows.length - 1));
    this.scroll = this.sel;
    this.pickDiff();
  }

  toggleSection(i) {
    const row = this.rows[i];
    if (!row || row.kind !== 'header') return;
    this.expanded[row.mod] = !this.expanded[row.mod];
    Audio.playSFX('music/ConfirmSound.ogg');
    this.buildRows();
    // keep the cursor on the header we just toggled
    const idx = this.rows.findIndex(r => r.kind === 'header' && r.mod === row.mod);
    this.sel = idx < 0 ? 0 : idx;
    this.scroll = this.sel;
  }

  diffs() {
    const row = this.rows[this.sel];
    const song = row && row.kind === 'song' ? row.song : null;
    return song ? Object.keys(song.charts || {}) : [];
  }

  pickDiff() {
    const difficulties = this.diffs();
    if (!difficulties.length) { this.diff = 0; return; }
    if (this.diff >= difficulties.length) {
      const hardIndex = difficulties.indexOf('hard');
      this.diff = hardIndex >= 0 ? hardIndex : 0;
    }
  }

  rowAt(x, y) {
    if (x < 40 || x > WIDTH - 340) return -1;
    for (let i = 0; i < this.rows.length; i++) {
      const sy = LIST_TOP + (i - this.scroll) * ROW_GAP;
      if (y >= sy - ROW_GAP / 2 && y <= sy + ROW_GAP / 2) return i;
    }
    return -1;
  }

  searchBar() {
    const w = 560, h = 46;
    return { x: WIDTH / 2 - w / 2, y: 128, w, h };
  }

  categoryAt(x, y) {
    if (y < 50 || y > 116) return -1;
    for (let i = 0; i < this.categories.length; i++) {
      const cx = WIDTH / 2 - 150 + i * 300;
      const w = measureAlphabet(this.categories[i], { scale: 0.6 });
      if (x >= cx - w / 2 - 14 && x <= cx + w / 2 + 14) return i;
    }
    return -1;
  }

  onMouseDown(x, y) {
    const bar = this.searchBar();
    if (x >= bar.x && x <= bar.x + bar.w && y >= bar.y && y <= bar.y + bar.h) {
      this.searching = true;
      this.searchQuery = '';
      this.buildRows();
      return;
    }

    const cat = this.categoryAt(x, y);
    if (cat >= 0) {
      if (cat !== this.category) {
        this.category = cat;
        this.sel = 0;
        this.searching = false;
        this.searchQuery = '';
        this.buildRows();
        Audio.playSFX('music/HoverSound.ogg');
      }
      return;
    }

    const hit = this.rowAt(x, y);
    if (hit < 0) return;
    if (hit !== this.sel) {
      this.sel = hit;
      this.pickDiff();
      Audio.playSFX('music/HoverSound.ogg');
      return;
    }
    if (this.rows[hit].kind === 'header') this.toggleSection(hit);
    else this.playSelected();
  }

  // Selection is moved with the arrow keys only; hovering does not scroll the
  // list, and there is no mouse-wheel scrolling. Clicking still selects/plays.
  onMouseMove() {}

  onWheel() {}

  playSelected() {
    const row = this.rows[this.sel];
    if (!row) return;
    if (row.kind === 'header') { this.toggleSection(this.sel); return; }

    const song = row.song;
    const difficulty = this.diffs()[this.diff];
    if (!difficulty) return;
    Audio.playSFX('music/ConfirmSound.ogg');

    const sel = this.sel;
    const category = this.category;
    const expanded = { ...this.expanded };
    game.switchState(new PlayState(song, difficulty, () => new FreeplayState(sel, category, expanded)));
  }

  onKeyDown(e) {
    const c = e.code;
    const n = this.rows.length;

    if (this.searching) {
      if (c === 'Escape' || c === 'Backspace') {
        if (this.searchQuery.length === 0) {
          this.searching = false;
          this.searchQuery = '';
          this.buildRows();
        } else {
          this.searchQuery = this.searchQuery.slice(0, -1);
          this.buildRows();
        }
        return;
      }
      if (c === 'Enter') { this.searching = false; return; }
      if (e.key && e.key.length === 1) {
        this.searchQuery += e.key;
        this.buildRows();
        return;
      }
      return;
    }

    if (c === 'Escape' || c === 'Backspace') {
      Audio.cancel();
      game.switchState(new MainMenuState(1));
      return;
    }

    if (c === 'KeyQ' || c === 'KeyE') {
      this.category = (this.category + (c === 'KeyE' ? 1 : this.categories.length - 1)) % this.categories.length;
      this.sel = 0;
      this.buildRows();
      Audio.playSFX('music/HoverSound.ogg');
      return;
    }

    if (c === 'Slash' || c === 'KeyF') {
      this.searching = true;
      this.searchQuery = '';
      this.buildRows();
      return;
    }

    if (!n) return;

    if (c === 'ArrowUp' || c === 'KeyW') {
      this.sel = (this.sel + n - 1) % n;
      this.pickDiff();
      Audio.playSFX('music/HoverSound.ogg');
    } else if (c === 'ArrowDown' || c === 'KeyS') {
      this.sel = (this.sel + 1) % n;
      this.pickDiff();
      Audio.playSFX('music/HoverSound.ogg');
    } else if (c === 'ArrowLeft' || c === 'KeyA' || c === 'ArrowRight' || c === 'KeyD') {
      const d = this.diffs().length;
      if (!d) return;
      this.diff = (this.diff + (c === 'ArrowLeft' || c === 'KeyA' ? d - 1 : 1)) % d;
      Audio.playSFX('music/HoverSound.ogg');
    } else if (c === 'Enter' || c === 'Space') {
      this.playSelected();
    }
  }

  update(dt) {
    this.scroll = lerp(this.scroll, this.sel, Math.min(1, dt * 10));
  }

  draw(ctx) {
    drawCover(ctx, A.menuBG, 1.08);
    ctx.fillStyle = 'rgba(30, 10, 50, 0.65)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Category tabs
    this.categories.forEach((cat, i) => {
      const x = WIDTH / 2 - 150 + i * 300;
      const y = 80;
      const selected = i === this.category;
      const w = measureAlphabet(cat, { scale: 0.6 });
      if (selected) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(x - w / 2 - 14, y - 35, w + 28, 70);
      }
      drawAlphabet(ctx, cat, x, y, { scale: 0.6, align: 'center', alpha: selected ? 1 : 0.5 });
    });

    // Search bar
    const bar = this.searchBar();
    ctx.fillStyle = this.searching ? 'rgba(20, 20, 20, 0.95)' : 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
    ctx.strokeStyle = this.searching ? '#ffe066' : 'rgba(255,255,255,0.85)';
    ctx.lineWidth = this.searching ? 4 : 2;
    ctx.strokeRect(bar.x + 1, bar.y + 1, bar.w - 2, bar.h - 2);
    const caret = this.searching && Math.floor(performance.now() / 500) % 2 === 0 ? '_' : '';
    const label = this.searchQuery || (this.searching ? '' : 'Search songs...  (press / )');
    drawText(ctx, this.searching ? label + caret : label, bar.x + 18, bar.y + bar.h / 2, {
      align: 'left', size: 22, font: VCR_FONT, color: this.searchQuery ? '#fff' : 'rgba(255,255,255,0.55)', strokeWidth: 2,
    });

    if (!this.rows.length) {
      const message = this.category === 1 && !this.modSongsLoaded ? 'Loading mod songs...'
        : this.searchQuery ? 'No songs match your search'
        : 'No songs found';
      drawAlphabet(ctx, message, WIDTH / 2, HEIGHT / 2, { align: 'center', scale: 0.8 });
      this.drawSideBox(ctx);
      return;
    }

    this.rows.forEach((row, i) => {
      const off = i - this.scroll;
      const y = LIST_TOP + off * ROW_GAP;
      if (y < 30 || y > HEIGHT + 100) return;
      const on = i === this.sel;

      if (row.kind === 'header') {
        const expanded = !!this.expanded[row.mod];
        const w = Math.min(760, measureAlphabet(row.mod, { scale: 0.6 }) + 260);
        if (on) {
          ctx.fillStyle = 'rgba(255, 230, 102, 0.18)';
          ctx.fillRect(60, y - 34, w, 68);
          ctx.strokeStyle = 'rgba(255, 230, 102, 0.9)';
          ctx.lineWidth = 3;
          ctx.strokeRect(60, y - 34, w, 68);
        } else {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.fillRect(60, y - 34, w, 68);
        }
        drawText(ctx, expanded ? '-' : '+', 92, y, { align: 'center', size: 40, color: '#fff', strokeWidth: 4 });
        drawAlphabet(ctx, row.mod, 130, y, { scale: 0.6, alpha: on ? 1 : 0.8 });
        drawText(ctx, `${row.count} songs`, 60 + w - 20, y, { align: 'right', size: 20, font: VCR_FONT, color: 'rgba(255,255,255,0.7)', strokeWidth: 2 });
        return;
      }

      const s = row.song;
      const alpha = on ? 1 : 0.6;
      const x = 100;
      const w = drawAlphabet(ctx, s.title, x, y, { scale: 1, alpha });
      const icon = this.icons[s.icon];
      if (icon) {
        ctx.globalAlpha = alpha;
        ctx.drawImage(icon, 0, 0, 150, 150, x + w + 10, y - 75, 150, 150);
        ctx.globalAlpha = 1;
      }
    });

    this.drawSideBox(ctx);
  }

  // Difficulty picker + high score, top-right.
  drawSideBox(ctx) {
    const d = this.diffs()[this.diff] || '';
    const label = d ? `< ${d.toUpperCase()} >` : '< - >';
    const lw = measureAlphabet(label, { scale: 0.5 }) + 40;
    const boxWidth = lw + 180;
    const boxHeight = 120;
    const boxX = WIDTH - boxWidth;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(boxX, 0, boxWidth, boxHeight);
    drawText(ctx, label, WIDTH - lw / 2 - 20, 32, { align: 'center', size: 24, font: VCR_FONT, strokeWidth: 1 });

    const row = this.rows[this.sel];
    const song = row && row.kind === 'song' ? row.song : null;
    const difficulty = this.diffs()[this.diff] || '';
    const songKey = song && difficulty ? `${song.title}_${difficulty}` : null;
    const highScore = songKey ? parseInt(localStorage.getItem(`fnw_score_${songKey}`), 10) || 0 : 0;
    const scoreLabel = highScore > 0 ? `HI: ${highScore}` : 'NO SCORE';
    drawText(ctx, scoreLabel, WIDTH - lw / 2 - 20, 78, { align: 'center', size: 22, font: VCR_FONT, strokeWidth: 1 });
  }
}
