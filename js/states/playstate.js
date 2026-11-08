import { A, loadImage, loadJSON } from '../engine/assets.js';
import { drawAlphabet, measureAlphabet } from '../engine/alphabet.js';
import { Audio } from '../engine/audio.js';
import { loadCharacter } from '../engine/character.js';
import { lerp, withZoom, WIDTH, HEIGHT } from '../engine/draw.js';
import { mobileMode, drawPauseButton, pauseButtonHit, drawCloseButton, closeButtonHit, tileRect, tileLaneAt, MOBILE_TILE_H } from '../engine/mobile.js';
import { laneForCode, settings } from '../engine/settings.js';
import { loadArrowSkin } from '../engine/arrowskins.js';
import { AnimatedSprite, drawFrameCentered } from '../engine/sprite.js';
import { loadStage, updateLayer, layerFrame } from '../engine/stage.js';
import { drawText, VCR_FONT } from '../engine/text.js';
import { game } from '../game.js';
import { MainMenuState } from './mainmenu.js';
import { StoryModeState } from './storymode.js';

const DIRS = ['LEFT', 'DOWN', 'UP', 'RIGHT'];
const COLORS = ['purple', 'blue', 'green', 'red'];

// Pause menu layout: left-aligned list.
const PAUSE_X = 140;
const SING = ['singLEFT', 'singDOWN', 'singUP', 'singRIGHT'];
const PAUSE_ITEMS = ['Resume', 'Restart Song', 'Exit to Menu'];
const PAUSE_ROW_H = 70;
const PAUSE_GAP = 90;
const PAUSE_TOP = 330;
// The highlight box hugs the widest label so the text never spills out of it.
const pauseBoxWidth = () => Math.max(...PAUSE_ITEMS.map(t => measureAlphabet(t, { scale: 0.8 }))) + 56;
const JUDGES = [
  { name: 'Sick', win: 45, score: 350, acc: 1, health: 0.023, sprite: 'sick' },
  { name: 'Good', win: 90, score: 200, acc: 0.67, health: 0.012, sprite: 'good' },
  { name: 'Bad', win: 135, score: 100, acc: 0.34, health: 0, sprite: 'bad' },
  { name: 'Shit', win: 166, score: 50, acc: 0, health: -0.01, sprite: 'shit' },
];
const HIT_WINDOW = 166; // ms either side of a note
const NOTE_SCALE = 0.7;
const LANE_GAP = 112;
const COUNTDOWN = [null, 'ready', 'set', 'go'];
const rand = (a, b) => a + Math.random() * (b - a);

// Base-game / Psych style charts: { song: { bpm, speed, notes: [ { mustHitSection, lengthInSteps, sectionNotes: [[ms, lane, sustain]] } ] } }
export function parseChart(json) {
  const song = json.song || json;
  const bpm = song.bpm || 100;
  // Psych 1.0 charts ("psych_v1*") always put the player on lanes 0-3; older charts swap by mustHitSection.
  const fixedLanes = String(song.format || '').startsWith('psych_v1');
  const player = [], opponent = [], sections = [];
  let start = 0, curBpm = bpm;
  for (const sec of song.notes || []) {
    if (sec.changeBPM && sec.bpm > 0) curBpm = sec.bpm;
    sections.push({ start, mustHit: !!sec.mustHitSection });
    const steps = sec.sectionBeats ? sec.sectionBeats * 4 : sec.lengthInSteps || 16;
    start += steps * (60000 / curBpm / 4);
    for (const n of sec.sectionNotes || []) {
      const [time, data, sustain] = n;
      if (typeof data !== 'number' || data < 0 || data > 7) continue;
      const isPlayer = fixedLanes || sec.mustHitSection ? data < 4 : data >= 4;
      (isPlayer ? player : opponent).push({ time, lane: data % 4, sustain: Math.max(0, sustain || 0) });
    }
  }
  const clean = list => {
    list.sort((a, b) => a.time - b.time);
    return list.filter((n, i) => !list.slice(Math.max(0, i - 4), i).some(o => o.lane === n.lane && Math.abs(o.time - n.time) < 2));
  };
  return {
    name: song.song || 'Unknown', bpm, speed: song.speed || 1,
    player1: song.player1 || 'bf', player2: song.player2 || 'dad', stage: song.stage || 'stage',
    notes: clean(player), oppNotes: clean(opponent), sections,
  };
}

const prepNotes = list => list.map(n => ({ ...n, hit: false, missed: false, holding: false, holdDone: n.sustain <= 0, dropped: false }));

export class PlayState {
  // song: entry from songs/songs.json; returnTo: factory for the state to go back to
  constructor(song = null, diff = null, returnTo = null, story = false) {
    this.song = song || { title: 'Test Chart', folder: 'data/songs/test', charts: { normal: 'test.json' } };
    this.diff = diff && this.song.charts[diff] ? diff : Object.keys(this.song.charts)[0];
    this.returnTo = returnTo;
    this.story = story;
    this.sources = [];
    this.vocalGains = {};
    this.ready = false;
  }

  async enter() {
    Audio.stopMusic();
    try {
      const base = `${this.song.folder}/`;
      const audioP = this.loadSongAudio(base);
      const chart = parseChart(await loadJSON(base + this.song.charts[this.diff]));
      // The player picks their own character and stage; the opponent stays as
      // the song defines it (mods set a specific Shaggy form per song).
      chart.player1 = settings.player1 || chart.player1;
      if (this.song.player2) chart.player2 = this.song.player2;
      chart.stage = settings.stage || chart.stage;
      const skinP = loadArrowSkin(settings.arrowSkin).catch(() => null);
      const [stage, bf, dad] = await Promise.all([loadStage(chart.stage), loadCharacter(chart.player1), loadCharacter(chart.player2)]);
      const [iconP1, iconP2] = await Promise.all([bf, dad].map(c => loadImage(`${c.healthIcon}.png`)));
      const music = await audioP;
      const notes = await skinP;
      if (notes) { this.noteAtlas = notes; }
      if (this.left) return;
      this.setup(chart, stage, bf, dad, iconP1, iconP2, music);
    } catch (err) {
      console.error(err);
      this.error = err.message;
    }
  }

  async loadSongAudio(base) {
    const s = this.song;
    if (!s.inst) return null;
    const inst = await Audio.loadBuffer(base + s.inst);
    const voices = {};
    const voiceFiles = s.voices || {};
    const loadVoice = async file => {
      if (!file) return null;
      try {
        const v = await Audio.loadBuffer(base + file);
        if (v.fingerprint === inst.fingerprint && v.buffer.length === inst.buffer.length) {
          console.warn(`${file} is the same file as ${s.inst}; skipping it`);
          return null;
        }
        return v.buffer;
      } catch (err) {
        console.warn(`Could not load ${base + file}: ${err.message}`);
        return null;
      }
    };
    let opponent = await loadVoice(voiceFiles.opponent);
    let player = await loadVoice(voiceFiles.player);
    if (!opponent || !player) {
      const shared = await loadVoice(voiceFiles.default);
      if (shared) {
        if (!opponent) opponent = shared;
        if (!player) player = shared;
      }
    }
    if (opponent) voices.opponent = opponent;
    if (player) voices.player = player;
    return { inst: inst.buffer, voices };
  }
  
  setup(chart, stage, bf, dad, iconP1, iconP2, music) {
    this.chart = chart;
    this.music = music;
    this.crochet = 60000 / chart.bpm;
    this.stepCrochet = this.crochet / 4;
    this.speed = settings.scrollSpeed > 0 ? settings.scrollSpeed : chart.speed;
    this.rate = settings.rate;
    this.bot = settings.botplay;
    // Mobile mode forces a phone-friendly layout: notes scroll down the middle
    // of the screen into receptors just above the touch tiles.
    this.mobile = mobileMode();
    this.down = this.mobile ? true : settings.downscroll;
    this.middle = this.mobile ? true : settings.middlescroll;
    this.tileLanes = new Map(); // pointerId -> lane, for touch tiles
    this.notes = prepNotes(chart.notes);
    this.oppNotes = prepNotes(chart.oppNotes);
    const last = [...this.notes, ...this.oppNotes].reduce((m, n) => Math.max(m, n.time + n.sustain), 0);
    this.songEnd = Math.max(last + this.crochet * 2, music ? music.inst.duration * 1000 : 0);
    this.firstIdx = 0;
    this.oppFirstIdx = 0;

    this.stage = stage;
    this.bf = bf;
    this.dad = dad;
    // Both performers render at 95% of their authored size so they sit a little
    // more comfortably against the stage.
    this.bf.scale *= 0.95;
    this.dad.scale *= 0.95;
    this.bf.placeAt(...stage.boyfriend);
    this.dad.placeAt(...stage.opponent);
    this.iconP1 = iconP1;
    this.iconP2 = iconP2;

    this.noteAtlas = this.noteAtlas || A.notes;
    // In mobile mode the receptors sit just above the touch tiles at the bottom.
    this.strumY = this.mobile ? HEIGHT - MOBILE_TILE_H - 70 : (this.down ? HEIGHT - 110 : 110);
    const playerCenter = this.middle ? WIDTH / 2 : WIDTH - 324;
    this.strums = this.makeStrums(playerCenter);
    this.oppStrums = this.makeStrums(324);
    if (this.middle) for (const s of this.oppStrums) s.visible = false;
    this.noteFrames = COLORS.map((c, i) => {
      const head = this.noteAtlas.getFrames(`${c}0`)[0] || this.noteHeadFrame(DIRS[i]);
      // Skins often ship note heads + strum lights only; fall back to the
      // built-in hold frames so sustain tails still render. Tag those frames
      // with their own sheet so drawHold samples the right image.
      const builtin = (name) => {
        const f = A.notes.getFrames(name)[0];
        if (f && !f.img) f.img = A.notes.image;
        return f;
      };
      return {
        head,
        piece: this.holdFrame(DIRS[i], c, 'piece') || builtin(`${c} hold piece`),
        end: this.holdFrame(DIRS[i], c, 'end') || builtin(`${c} hold end`),
      };
    });
    this.splashes = [];
    this.popups = [];
    this.ratingSprites = [];
    this.countdownSprite = null;
    this.keysHeld = [false, false, false, false];

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.misses = 0;
    this.health = 1;
    this.counts = { Sick: 0, Good: 0, Bad: 0, Shit: 0 };
    this.accSum = 0;
    this.accCount = 0;
    this.hitErrors = [];

    this.camBump = 0;
    this.hudZoom = 1;
    this.iconScale = 1;
    this.vocalsMuteTimer = 0;
    const first = chart.sections[0];
    this.cam = this.camTarget(first ? first.mustHit : false);
    this.paused = false;
    this.ended = false;
    this.dead = false;
    this.autoAdvance = 0;
    this.menuSel = 0;

    this.anchor(-this.crochet * 5);
    this.lastBeat = Math.floor(this.anchorPos / this.crochet) - 1;
    this.pos = this.notePos();
    this.ready = true;
    this.startMusic();
  }

  // ---- song audio: buffers are scheduled on the AudioContext to line up with the performance.now() song clock
  startMusic() {
    const ctx = Audio.ctx;
    if (!this.music || !ctx) return;
    this.stopMusic();
    let at = ctx.currentTime + 0.05;
    let pos = this.anchorPos + (at + Audio.latency - this.anchorAudio) * 1000 * this.rate;
    if (pos < 0) {
      at = this.audioTimeFor(0);
      pos = 0;
    }
    if (pos / 1000 >= this.music.inst.duration) return;
    this.musicStart = { at, pos };
    this.resyncTimer = 0;
    const play = (buffer, dest) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = this.rate;
      src.connect(dest);
      src.start(at, pos / 1000);
      this.sources.push(src);
    };
    play(this.music.inst, Audio.music);
    for (const [role, buf] of Object.entries(this.music.voices)) {
      const g = ctx.createGain();
      g.connect(Audio.voice);
      this.vocalGains[role] = g;
      play(buf, g);
    }
  }

  stopMusic() {
    for (const src of this.sources) {
      try { src.stop(); } catch { /* not started */ }
      src.disconnect();
    }
    this.sources = [];
    this.vocalGains = {};
    this.musicStart = null;
  }

  // keep the game clock locked to what the speakers are actually playing
  resyncMusic(dt) {
    const ctx = Audio.ctx;
    this.resyncTimer += dt;
    if (!this.musicStart || !ctx || !ctx.getOutputTimestamp || this.resyncTimer < 0.5) return;
    this.resyncTimer = 0;
    const ts = ctx.getOutputTimestamp();
    if (!ts.contextTime || !ts.performanceTime || ts.contextTime < this.musicStart.at) return;
    const heard = this.musicStart.pos + (ts.contextTime - this.musicStart.at) * 1000 * this.rate;
    if (heard > this.music.inst.duration * 1000) return;
    const drift = heard - this.rawPos(ts.performanceTime);
    if (Math.abs(drift) > 30) this.anchorPos += drift;
  }

  setPlayerVocals(on) {
    for (const role of ['player', 'shared']) if (this.vocalGains[role]) this.vocalGains[role].gain.value = on ? 1 : 0;
  }

  leave() {
    this.left = true;
    this.stopMusic();
  }

  makeStrums(center) {
    return DIRS.map((d, i) => {
      const s = new AnimatedSprite(this.noteAtlas);
      s.addAnim('static', this.staticFrameName(d));
      s.addAnim('pressed', `${d.toLowerCase()} press`, 24, false);
      s.addAnim('confirm', `${d.toLowerCase()} confirm`, 24, false);
      s.centered = true;
      s.scale = NOTE_SCALE;
      s.x = center + (i - 1.5) * LANE_GAP;
      s.y = this.strumY;
      s.play('static');
      s.resetAt = Infinity;
      return s;
    });
  }

  // Custom skins name the idle arrow differently ("arrowUP", "UP", "up static").
  staticFrameName(dir) {
    for (const n of [`arrow${dir}`, dir, dir.toLowerCase(), `${dir.toLowerCase()} static`]) {
      if (this.noteAtlas.getFrames(n).length) return n;
    }
    return `arrow${dir}`;
  }

  // Note heads may be named per colour (purple0) or per direction (noteLeft,
  // as in the Circles skin), so try both spellings before giving up.
  noteHeadFrame(dir) {
    const lower = dir.toLowerCase();
    const title = dir[0] + lower.slice(1);
    for (const n of [`note${dir}`, `note${title}`, `arrow${dir}`, dir, lower]) {
      const f = this.noteAtlas.getFrames(n)[0];
      if (f) return f;
    }
    return null;
  }

  // Sustain frames in a custom skin may be named per direction ("left hold
  // piece") or per colour ("purple hold piece"); try both before falling back.
  holdFrame(dir, color, kind) {
    const lower = dir.toLowerCase();
    for (const n of [`${lower} hold ${kind}`, `${color} hold ${kind}`, `arrow${dir} hold ${kind}`]) {
      const f = this.noteAtlas.getFrames(n)[0];
      if (f) return f;
    }
    return null;
  }

  // ---- camera (FNF style: follows whoever owns the current section)
  camTarget(mustHit) {
    const ch = mustHit ? this.bf : this.dad;
    const off = mustHit ? this.stage.camera_boyfriend : this.stage.camera_opponent;
    const [mx, my] = ch.midpoint();
    return [mx + off[0], my + off[1]];
  }

  currentSection() {
    const secs = this.chart.sections;
    let cur = secs[0];
    for (const s of secs) {
      if (s.start > this.pos) break;
      cur = s;
    }
    return cur;
  }

  // ---- timing: performance.now() is the master clock, audio is scheduled to match it
  anchor(songPos) {
    const ctx = Audio.ensure();
    this.anchorPerf = performance.now();
    this.anchorPos = songPos;
    this.anchorAudio = ctx ? ctx.currentTime : 0;
    this.nextHalfBeat = Math.ceil(songPos / (this.crochet / 2));
  }

  rawPos(perf = performance.now()) {
    return this.anchorPos + (perf - this.anchorPerf) * this.rate;
  }

  notePos(perf) {
    return this.rawPos(perf) - settings.offset;
  }

  audioTimeFor(ms) {
    return this.anchorAudio + (ms - this.anchorPos) / this.rate / 1000 - Audio.latency;
  }

  scheduleAudio() {
    const c = Audio.ctx;
    if (!c) return;
    const half = this.crochet / 2;
    for (;;) {
      const hb = this.nextHalfBeat;
      const ms = hb * half;
      const at = this.audioTimeFor(ms);
      if (at > c.currentTime + 0.2) break;
      this.nextHalfBeat++;
      if (at < c.currentTime - 0.02 || ms > this.songEnd - this.crochet) continue;
      const beat = hb / 2;
      if (this.music && beat >= 0) continue;
      if (hb % 2 === 0) {
        if (beat < 0) {
          if (beat >= -4) Audio.countdown(at, beat + 4);
        } else {
          Audio.kick(at);
          if (beat % 2 === 1) Audio.snare(at);
        }
      } else if (beat > 0) {
        Audio.hat(at);
      }
    }
  }

  onBeat(beat) {
    if (beat < 0 && beat >= -4) {
      const name = COUNTDOWN[beat + 4];
      const frame = name && A.gameText.getFrames(name)[0];
      this.countdownSprite = frame ? { frame, t: 0, life: this.crochet / 1000 / this.rate } : null;
    }
    if (beat >= 0 && beat % 4 === 0 && this.pos < this.songEnd) {
      this.camBump += 0.015;
      this.hudZoom += 0.03;
    }
    this.iconScale = 1.2;
    if (beat % 2 === 0) {
      if (!this.bf.singing && !(this.ended && this.bf.curName === 'hey')) this.bf.dance();
      if (!this.dad.singing) this.dad.dance();
    }
  }

  // ---- gameplay
  judgeFor(err) {
    const ad = Math.abs(err);
    return JUDGES.find(j => ad <= j.win) || JUDGES[JUDGES.length - 1];
  }

  hitNote(note, hitError) {
    note.hit = true;
    const j = this.bot ? JUDGES[0] : this.judgeFor(hitError);
    this.score += j.score;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.counts[j.name]++;
    this.accSum += j.acc;
    this.accCount++;
    this.health = Math.min(2, this.health + j.health);
    if (!this.bot) this.hitErrors.push(hitError);
    this.setPlayerVocals(true);
    this.showRating(j, hitError);
    if (j.name === 'Sick') this.spawnSplash(note.lane);
    const strum = this.strums[note.lane];
    strum.play('confirm', true);
    strum.resetAt = this.bot ? this.pos + this.stepCrochet * 1.5 + note.sustain : Infinity;
    this.bf.sing(note.lane, this.pos);
    if (note.sustain > 0) note.holding = true;
    if (settings.hitsounds) Audio.hit();
  }

  oppHit(note) {
    note.hit = true;
    this.dad.sing(note.lane, this.pos);
    const strum = this.oppStrums[note.lane];
    strum.play('confirm', true);
    strum.resetAt = this.pos + this.stepCrochet * 1.5 + note.sustain;
    if (note.sustain > 0) note.holding = true;
  }

  registerMiss(lane) {
    this.combo = 0;
    this.misses++;
    this.accCount++;
    this.score -= 10;
    this.health = Math.max(0, this.health - 0.0475);
    this.bf.sing(lane, this.pos, true);
    this.setPlayerVocals(false);
    this.vocalsMuteTimer = 1;
    Audio.miss();
    this.popups = this.popups.filter(p => !p.rating);
    this.popups.push({ text: 'MISS', x: this.ratingX(), y: this.ratingY() + 20, vy: -60, size: 36, color: '#ff4d4d', t: 0, life: 0.6, rating: true });
  }

  ratingX() {
    return this.middle ? WIDTH / 2 - 340 : WIDTH / 2 - 170;
  }

  ratingY() {
    return HEIGHT / 2 - 70;
  }

  // FNF-style popups: rating sprite + combo digits that jump up and fall with gravity
  showRating(j, err) {
    const x = this.ratingX(), y = this.ratingY();
    const fade = this.crochet / 1000;
    this.ratingSprites = [];
    this.popups = this.popups.filter(p => !p.rating);
    const rf = A.gameText.getFrames(j.sprite)[0];
    this.ratingSprites.push({ frame: rf, x, y, vx: -rand(0, 10), vy: -rand(140, 175), ay: 550, s: 0.7, t: 0, fadeAt: fade, life: fade + 0.2 });
    if (this.combo >= 2) {
      const digits = String(this.combo).padStart(3, '0');
      [...digits].forEach((d, i) => {
        const f = A.gameText.getFrames(`num${d}`)[0];
        this.ratingSprites.push({ frame: f, x: x - 90 + 46 * i + 40, y: y + 95, vx: rand(-5, 5), vy: -rand(140, 160), ay: rand(200, 300), s: 0.5, t: 0, fadeAt: fade * 2, life: fade * 2 + 0.2 });
      });
    }
    if (settings.showTiming && !this.bot) {
      const ms = Math.round(err);
      this.popups.push({ text: `${ms > 0 ? '+' : ''}${ms} ms`, x: x + 220, y: y + 95, vy: 0, size: 22, color: ms < 0 ? '#9fd8ff' : '#ffd29f', t: 0, life: 0.5, rating: true });
    }
  }

  spawnSplash(lane) {
    const s = new AnimatedSprite(A.splashes);
    const v = Math.random() < 0.5 ? 1 : 2;
    s.addAnim('splash', `note impact ${v} ${COLORS[lane]}`, 24 + Math.floor(Math.random() * 4), false);
    s.centered = true;
    s.scale = 0.95;
    s.alpha = 0.7;
    s.x = this.strums[lane].x;
    s.y = this.strums[lane].y;
    s.play('splash');
    this.splashes.push(s);
  }

  pressLane(lane, perfTime) {
    this.keysHeld[lane] = true;
    const t = this.notePos(perfTime);
    let target = null;
    for (let i = this.firstIdx; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.time - t > HIT_WINDOW) break;
      if (n.lane !== lane || n.hit || n.missed || t - n.time > HIT_WINDOW) continue;
      target = n;
      break;
    }
    if (target) {
      this.hitNote(target, t - target.time);
    } else {
      this.strums[lane].play('pressed', true);
      if (!settings.ghostTapping) this.registerMiss(lane);
    }
  }

  releaseLane(lane) {
    this.keysHeld[lane] = false;
    this.strums[lane].play('static', true);
    const t = this.notePos();
    for (const n of this.notes) {
      if (n.lane !== lane || !n.holding) continue;
      n.holding = false;
      if (t < n.time + n.sustain - 120) {
        n.dropped = true;
        this.registerMiss(lane);
      } else {
        n.holdDone = true;
      }
    }
  }

  updateHold(n, ch, strum, pos) {
    if (pos >= n.time + n.sustain) {
      n.holding = false;
      n.holdDone = true;
      return false;
    }
    ch.lastSing = pos;
    if (strum.finished) strum.play('confirm', true);
    if (!ch.curName.startsWith(SING[n.lane])) ch.sing(n.lane, pos);
    return true;
  }

  update(dt) {
    if (!this.ready || this.paused) return;
    this.bf.update(dt);
    this.dad.update(dt);
    for (const l of this.stage.layers) updateLayer(l, dt);
    for (const s of this.strums) s.update(dt);
    for (const s of this.oppStrums) s.update(dt);
    for (const s of this.splashes) s.update(dt);
    this.splashes = this.splashes.filter(s => !s.finished);
    for (const p of this.popups) {
      p.t += dt;
      p.y += p.vy * dt;
    }
    this.popups = this.popups.filter(p => p.t < p.life);
    for (const r of this.ratingSprites) {
      r.t += dt;
      r.vy += r.ay * dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
    }
    this.ratingSprites = this.ratingSprites.filter(r => r.t < r.life);
    if (this.countdownSprite) {
      this.countdownSprite.t += dt;
      if (this.countdownSprite.t >= this.countdownSprite.life) this.countdownSprite = null;
    }
    this.camBump = lerp(this.camBump, 0, dt * 3);
    this.hudZoom = lerp(this.hudZoom, 1, dt * 3);
    this.iconScale = lerp(this.iconScale, 1, dt * 9);
    // Player vocals drop on a miss; bring them back once the miss animation ends.
    if (this.vocalsMuteTimer > 0) {
      this.vocalsMuteTimer -= dt;
      if (this.vocalsMuteTimer <= 0) {
        this.vocalsMuteTimer = 0;
        this.setPlayerVocals(true);
      }
    }
    if (this.dead) return;

    if (this.autoAdvance > 0) {
      this.autoAdvance -= dt;
      if (this.autoAdvance <= 0) { this.autoAdvance = 0; this.exitToMenu(); return; }
    }

    this.resyncMusic(dt);
    this.pos = this.notePos();
    const sec = this.currentSection();
    if (sec) {
      const [tx, ty] = this.camTarget(sec.mustHit);
      const k = 1 - Math.exp(-dt * 2.4);
      this.cam[0] += (tx - this.cam[0]) * k;
      this.cam[1] += (ty - this.cam[1]) * k;
    }
    if (!this.ended) this.scheduleAudio();
    const beat = Math.floor(this.rawPos() / this.crochet);
    while (this.lastBeat < beat) this.onBeat(++this.lastBeat);
    if (this.ended) return;

    const pos = this.pos;
    for (let i = this.firstIdx; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.time > pos + HIT_WINDOW) break;
      if (this.bot && !n.hit && !n.missed && pos >= n.time) this.hitNote(n, 0);
      if (!n.hit && !n.missed && pos - n.time > HIT_WINDOW) {
        n.missed = true;
        this.registerMiss(n.lane);
      }
      if (n.holding && this.updateHold(n, this.bf, this.strums[n.lane], pos)) {
        this.health = Math.min(2, this.health + dt * 0.12);
        this.score += Math.round(dt * 250);
      }
    }
    while (this.firstIdx < this.notes.length) {
      const n = this.notes[this.firstIdx];
      const resolved = n.missed || n.dropped || (n.hit && n.holdDone);
      if (!resolved || pos - (n.time + n.sustain) < 1000) break;
      this.firstIdx++;
    }

    for (let i = this.oppFirstIdx; i < this.oppNotes.length; i++) {
      const n = this.oppNotes[i];
      if (n.time > pos) break;
      if (!n.hit) this.oppHit(n);
      if (n.holding) this.updateHold(n, this.dad, this.oppStrums[n.lane], pos);
    }
    while (this.oppFirstIdx < this.oppNotes.length) {
      const n = this.oppNotes[this.oppFirstIdx];
      if (!(n.hit && n.holdDone) || pos - (n.time + n.sustain) < 1000) break;
      this.oppFirstIdx++;
    }

    for (const s of this.oppStrums) if (s.curName === 'confirm' && pos >= s.resetAt) s.play('static');
    if (this.bot) for (const s of this.strums) if (s.curName === 'confirm' && pos >= s.resetAt) s.play('static');

    const holdingKey = !this.bot && this.keysHeld.some(Boolean);
    if (this.bf.singing && !this.bf.curName.endsWith('miss') && !holdingKey && pos - this.bf.lastSing > this.stepCrochet * this.bf.singDuration * 1.1) {
      this.bf.dance();
    }
    if (this.dad.singing && pos - this.dad.lastSing > this.stepCrochet * this.dad.singDuration) this.dad.dance();

    if (this.health <= 0 && !this.bot) this.die();
    else if (pos >= this.songEnd) this.finish();
  }

  finish() {
    this.ended = true;
    this.bf.play('hey', true);
    Audio.playSFX('music/ConfirmSound.ogg');

    // Save high score
    const songKey = `${this.chart.name}_${this.diff}`;
    const currentHigh = parseInt(localStorage.getItem(`fnw_score_${songKey}`), 10) || 0;
    if (this.score > currentHigh) {
      localStorage.setItem(`fnw_score_${songKey}`, String(this.score));
    }

    // Story mode: keep playing the set list automatically, then back to the menu
    if (this.story) this.autoAdvance = 3.5;
  }

  die() {
    this.dead = true;
    this.stopMusic();
    this.bf.play('singDOWNmiss', true);
    Audio.miss();
  }

  pause() {
    this.paused = true;
    this.pausedPos = this.rawPos();
    this.stopMusic();
    this.menuSel = 0;
    this.tileLanes.clear();
    for (let i = 0; i < 4; i++) {
      this.keysHeld[i] = false;
      this.strums[i].play('static', true);
    }
    for (const n of this.notes) {
      if (n.holding) {
        n.holding = false;
        n.holdDone = true;
      }
    }
  }

  resume() {
    this.paused = false;
    this.anchor(this.pausedPos);
    this.startMusic();
  }

  restart() {
    game.switchState(new PlayState(this.song, this.diff, this.returnTo, this.story));
  }

  exitToMenu(quit = false) {
    if (this.returnTo) {
      const nextState = this.returnTo();
      if (nextState instanceof StoryModeState) {
        // Manually leaving a story song (pause menu "Exit to Menu") quits the
        // week back to the main menu; finishing the song advances the set list.
        if (quit || nextState.currentSongIndex >= 3) {
          game.switchState(new MainMenuState(0));
        } else {
          game.switchState(nextState);
        }
      } else {
        game.switchState(nextState);
      }
    } else {
      game.switchState(new MainMenuState(0));
    }
  }

  onBlur() {
    if (this.ready && !this.paused && !this.ended && !this.dead) this.pause();
  }

  onKeyDown(e) {
    if (!this.ready) {
      if (this.error && e.code === 'Escape') this.exitToMenu(true);
      return;
    }
    if (e.repeat) return;
    const code = e.code;
    if (this.ended || this.dead) {
      if (code === 'Enter' || code === 'Space') this.restart();
      else if (code === 'Escape' || code === 'Backspace') this.exitToMenu(true);
      return;
    }
    if (this.paused) {
      const opts = 3;
      if (code === 'ArrowUp' || code === 'KeyW') { this.menuSel = (this.menuSel + opts - 1) % opts; Audio.playSFX('music/HoverSound.ogg'); }
      else if (code === 'ArrowDown' || code === 'KeyS') { this.menuSel = (this.menuSel + 1) % opts; Audio.playSFX('music/HoverSound.ogg'); }
      else if (code === 'Escape') this.resume();
      else if (code === 'Enter' || code === 'Space') {
        if (this.menuSel === 1) {
          Audio.playSFX('music/ConfirmSound.ogg');
          this.restart();
        } else if (this.menuSel === 2) {
          Audio.playSFX('music/ConfirmSound.ogg');
          this.exitToMenu(true);
        } else {
          this.resume();
        }
      }
      return;
    }
    if (code === 'Escape' || code === 'Enter') { this.pause(); return; }
    if (code === 'F1') { this.bot = !this.bot; return; }
    if (code === 'KeyR' && e.shiftKey) { this.restart(); return; }
    const lane = laneForCode(code);
    if (lane < 0 || this.bot) return;
    this.pressLane(lane, e.timeStamp);
  }

  onKeyUp(e) {
    if (!this.ready || this.paused || this.bot) return;
    const lane = laneForCode(e.code);
    if (lane >= 0 && this.keysHeld[lane]) this.releaseLane(lane);
  }

  pauseItemAt(x, y) {
    const w = pauseBoxWidth();
    if (x < PAUSE_X - 40 || x > PAUSE_X - 24 + w) return -1;
    for (let i = 0; i < PAUSE_ITEMS.length; i++) {
      const cy = PAUSE_TOP + i * PAUSE_GAP;
      if (y >= cy - PAUSE_ROW_H / 2 && y <= cy + PAUSE_ROW_H / 2) return i;
    }
    return -1;
  }

  onMouseMove(x, y) {
    if (!this.ready || !this.paused) return;
    const i = this.pauseItemAt(x, y);
    if (i >= 0 && i !== this.menuSel) {
      this.menuSel = i;
      Audio.playSFX('music/HoverSound.ogg');
    }
  }

  onMouseDown(x, y) {
    if (!this.ready) return;
    if (this.mobile && closeButtonHit(x, y) && (this.paused || this.ended || this.dead)) {
      Audio.playSFX('music/ConfirmSound.ogg');
      this.exitToMenu(true);
      return;
    }
    if (this.ended || this.dead) {
      // In story mode the cleared screen auto-advances to the next song, so a
      // tap should not restart the song that just ended.
      if (this.story && this.ended) return;
      if (this.mobile || y >= HEIGHT - 150) this.restart();
      return;
    }
    if (!this.paused) return;
    const i = this.pauseItemAt(x, y);
    if (i < 0) return;
    this.menuSel = i;
    if (i === 1) {
      Audio.playSFX('music/ConfirmSound.ogg');
      this.restart();
    } else if (i === 2) {
      Audio.playSFX('music/ConfirmSound.ogg');
      this.exitToMenu(true);
    } else {
      this.resume();
    }
  }

  // Mobile: the pause button (top-right) and the four full-height note tiles
  // across the bottom. Each finger is tracked by pointerId so multiple lanes can
  // be held at once.
  onPointerDown(x, y, e) {
    if (!this.ready) return;
    if (this.mobile && !this.paused && !this.ended && !this.dead && pauseButtonHit(x, y)) {
      Audio.playSFX('music/ConfirmSound.ogg');
      this.pause();
      return;
    }
    if (this.mobile && !this.paused && !this.ended && !this.dead && !this.bot) {
      const lane = tileLaneAt(x, y);
      if (lane >= 0) {
        this.tileLanes.set(e.pointerId, lane);
        this.pressLane(lane, e.timeStamp);
        return;
      }
    }
    this.onMouseDown(x, y, e);
  }

  onPointerUp(x, y, e) {
    if (!this.ready) return;
    const lane = this.tileLanes.get(e.pointerId);
    if (lane !== undefined) {
      this.tileLanes.delete(e.pointerId);
      if (this.keysHeld[lane]) this.releaseLane(lane);
    }
  }

  // ---- drawing
  draw(ctx) {
    if (!this.ready) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      drawText(ctx, this.error ? 'Failed to load song' : 'Loading...', WIDTH / 2, HEIGHT / 2, { size: 40 });
      if (this.error) drawText(ctx, `${this.error}  (ESC to go back)`, WIDTH / 2, HEIGHT / 2 + 50, { size: 18 });
      return;
    }
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (const l of this.stage.layers) if (!l.front) this.drawLayer(ctx, l);
    for (const l of this.stage.layers) if (l.front) this.drawLayer(ctx, l);
    // Characters are always drawn on top of every stage layer (including
    // "front" ones like curtains), so they are never hidden behind the stage.
    this.inWorld(ctx, 1, () => {
      this.dad.draw(ctx);
      this.bf.draw(ctx);
    });
    withZoom(ctx, this.hudZoom, () => this.drawHUD(ctx));
    if (this.mobile) this.drawMobileControls(ctx);
    this.drawOverlay(ctx);
  }

  // Touch controls: pause button (top-right) plus the four note tiles. A tile
  // lights up while its lane is held.
  drawMobileControls(ctx) {
    for (let lane = 0; lane < 4; lane++) {
      const r = tileRect(lane);
      const held = this.keysHeld[lane];
      ctx.fillStyle = held ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.07)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 3;
      ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      const fr = this.noteFrames[lane] && this.noteFrames[lane].head;
      if (fr) {
        ctx.globalAlpha = held ? 0.95 : 0.5;
        drawFrameCentered(ctx, fr.img || this.noteAtlas.image, fr, r.x + r.w / 2, r.y + r.h / 2, 0.9);
        ctx.globalAlpha = 1;
      }
    }
    if (!this.paused && !this.ended && !this.dead) drawPauseButton(ctx);
  }

  // Flixel camera: scroll = follow point - half screen, scaled by each layer's scroll factor, zoomed around the centre.
  inWorld(ctx, scroll, fn) {
    const z = this.stage.zoom + this.camBump;
    ctx.save();
    ctx.translate(WIDTH / 2, HEIGHT / 2);
    ctx.scale(z, z);
    ctx.translate(-WIDTH / 2, -HEIGHT / 2);
    ctx.translate(-(this.cam[0] - WIDTH / 2) * scroll, -(this.cam[1] - HEIGHT / 2) * scroll);
    fn();
    ctx.restore();
  }

  drawLayer(ctx, l) {
    this.inWorld(ctx, l.scroll, () => {
      if (l.atlas) {
        const f = layerFrame(l);
        if (f) ctx.drawImage(l.img, f.x, f.y, f.w, f.h, l.x, l.y, f.w * l.scale, f.h * l.scale);
      } else {
        ctx.drawImage(l.img, l.x, l.y, l.img.width * l.scale, l.img.height * l.scale);
      }
    });
  }

  drawHUD(ctx) {
    for (const s of this.oppStrums) s.draw(ctx);
    for (const s of this.strums) s.draw(ctx);
    if (!this.middle) this.drawNotes(ctx, this.oppNotes, this.oppStrums, this.oppFirstIdx);
    this.drawNotes(ctx, this.notes, this.strums, this.firstIdx);
    for (const s of this.splashes) s.draw(ctx);
    this.drawHealthBar(ctx);

    const img = A.gameText.image;
    for (const r of this.ratingSprites) {
      ctx.globalAlpha = r.t > r.fadeAt ? Math.max(0, 1 - (r.t - r.fadeAt) / 0.2) : 1;
      drawFrameCentered(ctx, img, r.frame, r.x, r.y, r.s);
    }
    ctx.globalAlpha = 1;
    for (const p of this.popups) {
      const k = p.t / p.life;
      drawText(ctx, p.text, p.x, p.y, { size: p.size, color: p.color, alpha: k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1 });
    }

    const acc = this.accCount ? (this.accSum / this.accCount) * 100 : 0;
    drawText(ctx, `FPS ${game.fps}  Rate ${this.rate}x`, 10, 18, { size: 20, font: VCR_FONT, strokeWidth: 0 });
    drawText(ctx, `${this.chart.name} - ${this.diff.toUpperCase()}`, WIDTH - 10, 18, { size: 20, font: VCR_FONT, align: 'right', strokeWidth: 0 });
    if (this.bot) drawAlphabet(ctx, 'BOTPLAY', WIDTH / 2, this.down ? HEIGHT - 190 : 190, { scale: 0.6, align: 'center', alpha: 0.7 });
    const pct = this.accCount ? `${acc.toFixed(2)}%` : '?';
    drawText(ctx, `Score: ${this.score}  -  Misses: ${this.misses}  -  Accuracy: ${pct} ${this.fcLabel()}`,
      WIDTH / 2, this.healthY() + 40, { size: 28, font: VCR_FONT, align: 'center', strokeWidth: 0 });

    // Draw timer
    if (settings.showTimer) {
      const songTime = Math.max(0, this.pos);
      const songLength = this.songEnd || 1;
      const remaining = Math.max(0, songLength - songTime);
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      const timerWidth = 420;
      const timerHeight = 28;
      const timerX = WIDTH / 2 - timerWidth / 2;
      // Sits just below the arrow row (centred), on whichever side the notes
      // scroll, so it never overlaps the strums or the score line.
      const timerY = this.strumY + 62;

      // Dark box with a black outline.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(timerX, timerY, timerWidth, timerHeight);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeRect(timerX + 1.5, timerY + 1.5, timerWidth - 3, timerHeight - 3);

      // Progress fill growing left to right as the song plays
      const progress = Math.min(1, songTime / songLength);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fillRect(timerX + 3, timerY + 3, (timerWidth - 6) * progress, timerHeight - 6);

      drawText(ctx, timeStr, WIDTH / 2, timerY + timerHeight / 2, { size: 26, font: VCR_FONT, align: 'center', color: '#fff', stroke: '#000', strokeWidth: 5 });
    }
  }

  fcLabel() {
    if (!this.accCount) return '';
    if (this.misses === 0) {
      if (this.counts.Good + this.counts.Bad + this.counts.Shit === 0) return '[SFC]';
      if (this.counts.Bad + this.counts.Shit === 0) return '[GFC]';
      return '[FC]';
    }
    return this.misses < 10 ? '[SDCB]' : '[Clear]';
  }

  healthY() {
    return this.down ? 70 : HEIGHT - 72;
  }

  drawHealthBar(ctx) {
    const bw = 593, bh = 11, bx = (WIDTH - bw) / 2, by = this.healthY();
    if (A.healthBar) ctx.drawImage(A.healthBar, bx - 4, by - 4);
    else {
      ctx.fillStyle = '#000';
      ctx.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
    }
    const split = bx + bw * (1 - this.health / 2);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(bx, by, split - bx, bh);
    ctx.fillStyle = '#66ff33';
    ctx.fillRect(split, by, bx + bw - split, bh);
    const size = 150 * this.iconScale;
    const cy = by + bh / 2 - size / 2;
    const p1 = this.health < 0.4 ? 1 : 0;
    const p2 = this.health > 1.6 ? 1 : 0;
    // Player icon sits on the right of the split and faces the opponent, so it
    // is mirrored (the sheets are drawn facing right).
    ctx.save();
    ctx.translate(split - 26 + size, cy);
    ctx.scale(-1, 1);
    ctx.drawImage(this.iconP1, p1 * 150, 0, 150, 150, 0, 0, size, size);
    ctx.restore();
    ctx.drawImage(this.iconP2, p2 * 150, 0, 150, 150, split - size + 26, cy, size, size);
  }

  noteY(time) {
    return this.strumY + (this.down ? -1 : 1) * (time - this.pos) * 0.45 * this.speed;
  }

  drawNotes(ctx, notes, strums, firstIdx) {
    const img = this.noteAtlas.image;
    const range = (HEIGHT + 200) / (0.45 * this.speed);
    for (let i = firstIdx; i < notes.length; i++) {
      const n = notes[i];
      if (n.time - this.pos > range) break;
      const fr = this.noteFrames[n.lane];
      const x = strums[n.lane].x;
      if (n.sustain > 0 && !n.holdDone && !(n.hit && !n.holding && !n.dropped)) {
        const start = n.holding ? this.strumY : this.noteY(n.time);
        const end = this.noteY(n.time + n.sustain);
        if (fr.piece && fr.end && (end - start) * (this.down ? -1 : 1) > 0) {
          this.drawHold(ctx, fr, x, start, end, n.missed || n.dropped ? 0.25 : 0.6);
        }
      }
      if (!n.hit) {
        const y = this.noteY(n.time);
        ctx.globalAlpha = n.missed ? 0.35 : 1;
        drawFrameCentered(ctx, fr.head.img || img, fr.head, x, y, NOTE_SCALE * (fr.head.scale || 1));
        ctx.globalAlpha = 1;
      }
    }
  }

  drawHold(ctx, fr, x, y0, y1, alpha) {
    const { piece, end } = fr;
    const s = NOTE_SCALE;
    const w = piece.w * s;
    const len = Math.abs(y1 - y0);
    const endH = Math.min(end.h * s, len);
    const bodyLen = len - endH;
    const pImg = piece.img || this.noteAtlas.image;
    const eImg = end.img || this.noteAtlas.image;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (!this.down) {
      if (bodyLen > 0) ctx.drawImage(pImg, piece.x, piece.y + 1, piece.w, piece.h - 2, x - w / 2, y0, w, bodyLen + 1);
      ctx.drawImage(eImg, end.x, end.y + end.h - endH / s, end.w, endH / s, x - (end.w * s) / 2, y0 + bodyLen, end.w * s, endH);
    } else {
      if (bodyLen > 0) ctx.drawImage(pImg, piece.x, piece.y + 1, piece.w, piece.h - 2, x - w / 2, y0 - bodyLen - 1, w, bodyLen + 1);
      ctx.translate(x, y0 - bodyLen);
      ctx.scale(1, -1);
      ctx.drawImage(eImg, end.x, end.y + end.h - endH / s, end.w, endH / s, -(end.w * s) / 2, 0, end.w * s, endH);
    }
    ctx.restore();
  }

  drawOverlay(ctx) {
    const cd = this.countdownSprite;
    if (cd && !this.paused) {
      const k = cd.t / cd.life;
      ctx.globalAlpha = 1 - k * k * (3 - 2 * k);
      drawFrameCentered(ctx, A.gameText.image, cd.frame, WIDTH / 2, HEIGHT / 2, 0.75);
      ctx.globalAlpha = 1;
    }
    if (this.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      drawAlphabet(ctx, 'PAUSED', PAUSE_X, 190, { align: 'left', scale: 1.1 });
      const boxW = pauseBoxWidth();
      PAUSE_ITEMS.forEach((t, i) => {
        const cy = PAUSE_TOP + i * PAUSE_GAP;
        // Left-aligned list with a black selection box sized to the text.
        if (i === this.menuSel) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
          ctx.fillRect(PAUSE_X - 24, cy - PAUSE_ROW_H / 2, boxW, PAUSE_ROW_H);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.lineWidth = 3;
          ctx.strokeRect(PAUSE_X - 24, cy - PAUSE_ROW_H / 2, boxW, PAUSE_ROW_H);
        }
        drawAlphabet(ctx, t, PAUSE_X, cy, { align: 'left', scale: 0.8, alpha: i === this.menuSel ? 1 : 0.45 });
      });
      if (this.mobile) drawCloseButton(ctx);
    } else if (this.ended || this.dead) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      if (this.dead) {
        drawAlphabet(ctx, 'GAME OVER', WIDTH / 2, 280, { align: 'center', scale: 1.1 });
      } else {
        const acc = this.accCount ? ((this.accSum / this.accCount) * 100).toFixed(2) : '0.00';
        const avg = this.hitErrors.length ? this.hitErrors.reduce((a, b) => a + b, 0) / this.hitErrors.length : 0;
        drawAlphabet(ctx, 'SONG CLEARED!', WIDTH / 2, 130, { align: 'center', scale: 1 });
        drawAlphabet(ctx, `Score: ${this.score}`, WIDTH / 2, 240, { align: 'center', scale: 0.55 });
        drawAlphabet(ctx, `Accuracy: ${acc}% ${this.fcLabel()}`, WIDTH / 2, 300, { align: 'center', scale: 0.55 });
        const lines = [
          `Sick: ${this.counts.Sick}   Good: ${this.counts.Good}   Bad: ${this.counts.Bad}   Shit: ${this.counts.Shit}   Misses: ${this.misses}`,
          `Max Combo: ${this.maxCombo}   Average hit: ${avg >= 0 ? '+' : ''}${avg.toFixed(1)} ms ${avg < 0 ? '(early)' : avg > 0 ? '(late)' : ''}`,
        ];
        lines.forEach((l, i) => drawAlphabet(ctx, l, WIDTH / 2, 380 + i * 50, { scale: 0.36, align: 'center' }));
      }
      drawAlphabet(ctx, this.mobile ? 'TAP to play again' : 'ENTER to play again  -  ESC to go back', WIDTH / 2, HEIGHT - 110, { scale: 0.4, align: 'center' });
      if (this.mobile) drawCloseButton(ctx);
    }
  }
}
