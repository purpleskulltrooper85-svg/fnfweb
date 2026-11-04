
import { A, loadImage } from '../engine/assets.js';
import { drawAlphabet, measureAlphabet } from '../engine/alphabet.js';
import { Audio } from '../engine/audio.js';
import { drawCover, lerp, WIDTH, HEIGHT } from '../engine/draw.js';
import { drawText, VCR_FONT } from '../engine/text.js';
import { game } from '../game.js';
import { MainMenuState } from './mainmenu.js';
import { PlayState } from './playstate.js';

export class FreeplayState {
  constructor(sel = 0, category = 0, subCategory = 0) {
    this.categories = ['Base Game', 'Mods'];
    this.category = category;
    this.subCategory = subCategory;

    this.baseSongs = (A.songs && A.songs.songs) || [];
    this.modSongs = [];
    this.modCategories = {};

    this.songs = this.baseSongs;

    this.sel = Math.min(sel, Math.max(0, this.songs.length - 1));
    this.scroll = this.sel;

    this.diff = 0;
    this.icons = {};

    this.searchQuery = '';
    this.searching = false;

    this.modSongsLoaded = false;
    this.loadModSongs();
  }

  async loadModSongs() {
    try {
      console.log('Fetching automatically detected mod songs...');

      const response = await fetch('/mods/songs/songs.json?t=' + Date.now(), {
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();

      const songs = Array.isArray(data.songs) ? data.songs : [];

      // Organize songs by mod
      this.modCategories = {};
      this.modSongs = [];

      for (const song of songs) {
        const modName = song.mod || 'Other';
        if (!this.modCategories[modName]) {
          this.modCategories[modName] = [];
        }
        this.modCategories[modName].push(song);
      }

      // If there are multiple mods, show a category view
      const modNames = Object.keys(this.modCategories);
      if (modNames.length === 1) {
        this.modSongs = this.modCategories[modNames[0]];
      } else {
        // Create a "category" for each mod
        this.modSongs = modNames.map(name => ({
          title: name,
          isCategory: true,
          mod: name
        }));
      }

      console.log('Automatically detected mod songs:', this.modSongs);
      console.log('Mod categories:', this.modCategories);

      this.modSongsLoaded = true;
      this.loadIcons(songs);

      if (this.category === 1) {
        this.updateSongList();
      }

    } catch (error) {
      console.error('Failed to fetch mod songs:', error);

      this.modSongs = [];
      this.modSongsLoaded = true;

      if (this.category === 1) {
        this.updateSongList();
      }
    }
  }

  loadIcons(songs) {
    for (const s of songs) {
      if (!s.icon || this.icons[s.icon] !== undefined) continue;

      this.icons[s.icon] = null;

      loadImage(`assets/images/icons/icon-${s.icon}.png`)
        .then(i => {
          this.icons[s.icon] = i;
        })
        .catch(() => {
          loadImage(`assets/images/icons/${s.icon}.png`)
            .then(i => {
              this.icons[s.icon] = i;
            })
            .catch(() => {
              console.warn('Could not load icon:', s.icon);
            });
        });
    }
  }

  enter() {
    this.updateSongList();

    this.loadIcons(this.baseSongs);
    this.loadIcons(this.modSongs);

    this.pickDiff();
  }

  updateSongList() {
    if (this.category === 0) {
      this.songs = this.baseSongs;
    } else {
      // If we have mod categories and the current selection is a category
      if (this.modSongs.length > 0 && this.modSongs[0].isCategory) {
        // Check if we're viewing a specific mod's songs
        const currentMod = this.getCurrentMod();
        if (currentMod && this.modCategories[currentMod]) {
          this.songs = this.modCategories[currentMod];
        } else {
          this.songs = this.modSongs;
        }
      } else {
        this.songs = this.modSongs;
      }
    }

    this.sel = Math.min(
      this.sel,
      Math.max(0, this.songs.length - 1)
    );

    this.scroll = this.sel;
    this.pickDiff();
  }

  exitModCategory() {
    // Go back from viewing a mod's songs to the category list
    if (this.category === 1 && this.modSongs.length > 0 && this.modSongs[0].isCategory) {
      this.songs = this.modSongs;
      this.sel = this.subCategory;
      this.scroll = this.sel;
      this.pickDiff();
    }
  }

  getCurrentMod() {
    // Return the currently selected mod name if viewing a category
    if (this.category === 1 && this.modSongs.length > 0 && this.modSongs[0].isCategory) {
      return this.modSongs[this.sel]?.mod;
    }
    return null;
  }

  getModIndex(modName) {
    // Get the index of a mod in the category list
    if (this.modSongs.length > 0 && this.modSongs[0].isCategory) {
      return this.modSongs.findIndex(s => s.mod === modName);
    }
    return 0;
  }

  filterSongs() {
    const query = this.searchQuery.toLowerCase();
    if (!query) {
      this.updateSongList();
      return;
    }

    const allSongs = this.category === 0 ? this.baseSongs : (this.getCurrentMod() ? this.modCategories[this.getCurrentMod()] : this.modSongs);
    this.songs = allSongs.filter(s => s.title && s.title.toLowerCase().includes(query));

    this.sel = Math.min(this.sel, Math.max(0, this.songs.length - 1));
    this.scroll = this.sel;
    this.pickDiff();
  }

  diffs() {
    const song = this.songs[this.sel];
    return song ? Object.keys(song.charts || {}) : [];
  }

  pickDiff() {
    const difficulties = this.diffs();

    if (!difficulties.length) {
      this.diff = 0;
      return;
    }

    if (this.diff >= difficulties.length) {
      const hardIndex = difficulties.indexOf('hard');
      this.diff = hardIndex >= 0 ? hardIndex : 0;
    }
  }

  onMouseDown(e) {
    const rect = e.target.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Check if clicked on search bar
    const d = this.diffs()[this.diff] || '';
    const label = `< ${d.toUpperCase()} >`;
    const lw = measureAlphabet(label, { scale: 0.5 }) + 40;
    const searchY = 120;
    const searchWidth = 300;
    const searchX = WIDTH - lw / 2 - searchWidth / 2;

    if (x >= searchX && x <= searchX + searchWidth && y >= searchY - 15 && y <= searchY + 15) {
      this.searching = true;
      this.searchQuery = '';
      return;
    }

    // Check if clicked on category
    this.categories.forEach((cat, i) => {
      const catX = WIDTH / 2 - 150 + i * 300;
      const catY = 80;
      const w = measureAlphabet(cat, { scale: 0.6 });

      if (x >= catX - w / 2 - 10 && x <= catX + w / 2 + 10 && y >= catY - 35 && y <= catY + 35) {
        if (i !== this.category) {
          this.category = i;
          this.updateSongList();
          Audio.playSFX('music/HoverSound.ogg');
        }
      }
    });
  }

  onKeyDown(e) {
    const c = e.code;
    const n = this.songs.length;

    if (this.searching) {
      if (c === 'Escape' || c === 'Backspace') {
        if (this.searchQuery.length === 0) {
          this.searching = false;
          this.searchQuery = '';
          this.updateSongList();
        } else {
          this.searchQuery = this.searchQuery.slice(0, -1);
          this.filterSongs();
        }
        return;
      }
      if (c === 'Enter') {
        this.searching = false;
        return;
      }
      if (e.key.length === 1) {
        this.searchQuery += e.key;
        this.filterSongs();
        return;
      }
      return;
    }

    if (c === 'Escape' || c === 'Backspace') {
      // If we're inside a mod category, go back to category list
      if (this.category === 1 && this.modSongs.length > 0 && this.modSongs[0].isCategory && this.getCurrentMod()) {
        Audio.cancel();
        this.exitModCategory();
        return;
      }
      Audio.cancel();
      game.switchState(new MainMenuState(1));
      return;
    }

    if (c === 'KeyQ' || c === 'KeyE') {
      this.category = (
        this.category +
        (c === 'KeyE' ? 1 : this.categories.length - 1)
      ) % this.categories.length;

      this.updateSongList();

      Audio.playSFX('music/HoverSound.ogg');
      return;
    }

    if (!n) return;

    if (c === 'ArrowUp' || c === 'KeyW') {
      this.sel = (this.sel + n - 1) % n;
      this.pickDiff();
      Audio.playSFX('music/HoverSound.ogg');
    }

    else if (c === 'ArrowDown' || c === 'KeyS') {
      this.sel = (this.sel + 1) % n;
      this.pickDiff();
      Audio.playSFX('music/HoverSound.ogg');
    }

    else if (
      c === 'ArrowLeft' ||
      c === 'KeyA' ||
      c === 'ArrowRight' ||
      c === 'KeyD'
    ) {
      const d = this.diffs().length;

      if (!d) return;

      this.diff = (
        this.diff +
        (c === 'ArrowLeft' || c === 'KeyA' ? d - 1 : 1)
      ) % d;

      Audio.playSFX('music/HoverSound.ogg');
    }

    else if (c === 'Enter' || c === 'Space') {
      const song = this.songs[this.sel];

      // If this is a mod category, enter it
      if (song && song.isCategory) {
        Audio.playSFX('music/ConfirmSound.ogg');
        this.songs = this.modCategories[song.mod];
        this.sel = 0;
        this.scroll = 0;
        this.pickDiff();
        return;
      }

      const difficulty = this.diffs()[this.diff];

      if (!song || !difficulty) return;

      Audio.playSFX('music/ConfirmSound.ogg');

      const sel = this.sel;
      const category = this.category;
      const currentMod = this.getCurrentMod();

      game.switchState(
        new PlayState(
          song,
          difficulty,
          () => new FreeplayState(sel, category, currentMod ? this.getModIndex(currentMod) : 0)
        )
      );
    }
  }

  update(dt) {
    this.scroll = lerp(
      this.scroll,
      this.sel,
      Math.min(1, dt * 10)
    );
  }

  draw(ctx) {
    drawCover(ctx, A.menuBG, 1.08);

    ctx.fillStyle = 'rgba(30, 10, 50, 0.65)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    this.categories.forEach((cat, i) => {
      const x = WIDTH / 2 - 150 + i * 300;
      const y = 80;

      const selected = i === this.category;
      const alpha = selected ? 1 : 0.5;

      const w = measureAlphabet(cat, { scale: 0.6 });

      if (selected) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(x - w / 2 - 10, y - 35, w + 20, 70);
      }

      drawAlphabet(ctx, cat, x, y, {
        scale: 0.6,
        align: 'center',
        alpha
      });
    });

    if (!this.songs.length) {
      const message = this.category === 1 && !this.modSongsLoaded
        ? 'Loading mod songs...'
        : 'No songs found';

      drawAlphabet(ctx, message, WIDTH / 2, HEIGHT / 2, {
        align: 'center',
        scale: 0.8
      });

      return;
    }

    this.songs.forEach((s, i) => {
      const off = i - this.scroll;

      const x = 110;
      const y = HEIGHT * 0.48 + off * 130;

      if (y < -100 || y > HEIGHT + 100) return;

      const alpha = i === this.sel ? 1 : 0.6;

      const w = drawAlphabet(ctx, s.title, x, y, {
        scale: 1,
        alpha
      });

      const icon = this.icons[s.icon];

      if (icon) {
        ctx.globalAlpha = alpha;

        ctx.drawImage(
          icon,
          0, 0, 150, 150,
          x + w + 10,
          y - 75,
          150, 150
        );

        ctx.globalAlpha = 1;
      }
    });

    const d = this.diffs()[this.diff] || '';
    const label = `< ${d.toUpperCase()} >`;

    const lw = measureAlphabet(label, { scale: 0.5 }) + 40;

    // Shared black box for difficulty and high score
    const boxWidth = lw + 160 + 20;
    const boxHeight = 110;
    const boxX = WIDTH - boxWidth;
    const boxY = 0;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // Difficulty
    drawText(ctx, label, WIDTH - lw / 2, 30, {
      align: 'center',
      size: 24,
      font: VCR_FONT,
      strokeWidth: 1
    });

    // High score under difficulty
    const song = this.songs[this.sel];
    const difficulty = this.diffs()[this.diff] || '';
    const songKey = song && difficulty ? `${song.title}_${difficulty}` : null;
    const highScore = songKey ? parseInt(localStorage.getItem(`fnw_score_${songKey}`), 10) || 0 : 0;
    const scoreLabel = highScore > 0 ? `HI: ${highScore}` : 'NO SCORE';

    drawText(ctx, scoreLabel, WIDTH - lw / 2, 75, {
      align: 'center',
      size: 24,
      font: VCR_FONT,
      strokeWidth: 1
    });

    // Search bar always visible under both
    const searchY = 120;
    const searchWidth = 300;
    const searchX = WIDTH - lw / 2 - searchWidth / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(searchX, searchY - 15, searchWidth, 30);

    drawText(ctx, this.searching ? `Search: ${this.searchQuery}_` : 'Search...', WIDTH - lw / 2, searchY, {
      align: 'center',
      size: 18,
      font: VCR_FONT,
      strokeWidth: 1
    });

    drawAlphabet(
      ctx,
      'Q/E switch category  -  UP/DOWN song  -  LEFT/RIGHT difficulty  -  ENTER play  -  ESC back  -  TYPE to search',
      WIDTH / 2,
      HEIGHT - 24,
      {
        scale: 0.26,
        align: 'center'
      }
    );
  }
}
