import { A } from '../engine/assets.js';
import { Audio } from '../engine/audio.js';
import { drawAlphabet } from '../engine/alphabet.js';
import { drawCover, WIDTH, HEIGHT } from '../engine/draw.js';
import { drawText } from '../engine/text.js';
import { game } from '../game.js';
import { MainMenuState } from './mainmenu.js';
import { PlayState } from './playstate.js';

const STORY_SONGS = ['Bopeebo', 'Fresh', 'Dad Battle'];

export class StoryModeState {
  constructor(currentSongIndex = 0) {
    this.currentSongIndex = currentSongIndex;
    this.songs = (A.songs && A.songs.songs) || [];
    this.transitioning = false;
    this.loaded = false;
  }

  async enter() {
    if (this.currentSongIndex >= STORY_SONGS.length) {
      game.switchState(new MainMenuState(0));
      return;
    }
    const songTitle = STORY_SONGS[this.currentSongIndex];
    const song = this.songs.find(s => s.title === songTitle);
    if (song) {
      // Immediately switch to the song without showing STORY MODE screen
      game.switchState(new PlayState(song, 'hard', () => new StoryModeState(this.currentSongIndex + 1)));
    } else {
      console.error(`Song not found: ${songTitle}`);
      game.switchState(new MainMenuState(0));
    }
  }

  update(dt) {}

  draw(ctx) {
    // Don't draw anything - we immediately switch to the song
  }

  onKeyDown(e) {
    if (e.code === 'Escape' || e.code === 'Backspace') {
      Audio.cancel();
      game.switchState(new MainMenuState(0));
    }
  }
}
