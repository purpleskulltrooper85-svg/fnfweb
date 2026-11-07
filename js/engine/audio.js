
// Volumes are stored 0-100. Values saved by older builds were 0-10, so the
// first time the new build runs they are scaled up once ("8" becomes 80) and
// written back, so the migration is not repeated on the next load.
const SCALE_FLAG = 'fnw-vol-v2';
const LEGACY = !localStorage.getItem(SCALE_FLAG);
function storedVolume(key, dflt) {
  let v = parseInt(localStorage.getItem(key), 10);
  if (Number.isNaN(v)) return dflt;
  if (LEGACY && v <= 10) {
    v *= 10;
    localStorage.setItem(key, String(v));
  }
  return Math.max(0, Math.min(100, v));
}
localStorage.setItem(SCALE_FLAG, '1');

// Web Audio: master volume, decoded song buffers, and synthesised menu blips / metronome / hitsounds.
export const Audio = {
  ctx: null,
  master: null,
  sfx: null,
  music: null,
  voice: null,
  muted: false,

  // Each channel is 0-100, matching the Options sliders.
  volume: storedVolume('fnw-volume', 80),
  musicVolume: storedVolume('fnw-vol-music', 100),
  voicesVolume: storedVolume('fnw-vol-voices', 100),
  sfxVolume: storedVolume('fnw-vol-sfx', 100),

  buffers: new Map(),
  noiseBuf: null,
  musicSource: null,
  musicBuffer: null,
  musicUrl: null,
  musicToken: 0,

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;

      this.ctx = new AC({ latencyHint: 'interactive' });

      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyVolume();

      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.master);

      this.music = this.ctx.createGain();
      this.music.connect(this.master);

      this.voice = this.ctx.createGain();
      this.voice.connect(this.master);
      this.applyChannelVolumes();

      const len = Math.floor(this.ctx.sampleRate * 0.5);
      this.noiseBuf = this.ctx.createBuffer(
        1,
        len,
        this.ctx.sampleRate
      );

      const d = this.noiseBuf.getChannelData(0);

      for (let i = 0; i < len; i++) {
        d[i] = Math.random() * 2 - 1;
      }
    }

    return this.ctx;
  },

  // Call this from a user click or key press.
  async unlock() {
    const ctx = this.ensure();
    if (!ctx) return false;

    if (ctx.state !== 'running') {
      await ctx.resume();
    }

    return ctx.state === 'running';
  },

  applyVolume() {
    if (this.master) {
      this.master.gain.value = this.muted ? 0 : this.volume / 100;
    }
  },

  // Per-channel trim, applied on top of the master gain. Values are 0-100.
  applyChannelVolumes() {
    if (this.music) this.music.gain.value = this.musicVolume / 100;
    if (this.voice) this.voice.gain.value = this.voicesVolume / 100;
    if (this.sfx) this.sfx.gain.value = 0.5 * (this.sfxVolume / 100);
  },

  setChannel(channel, value) {
    const v = Math.max(0, Math.min(100, value));
    localStorage.setItem(SCALE_FLAG, '1');
    if (channel === 'music') { this.musicVolume = v; localStorage.setItem('fnw-vol-music', String(v)); }
    else if (channel === 'voices') { this.voicesVolume = v; localStorage.setItem('fnw-vol-voices', String(v)); }
    else if (channel === 'sfx') { this.sfxVolume = v; localStorage.setItem('fnw-vol-sfx', String(v)); }
    else { this.volume = v; localStorage.setItem('fnw-volume', String(v)); }
    this.applyVolume();
    this.applyChannelVolumes();
  },

  changeVolume(delta) {
    this.muted = false;
    this.volume = Math.max(0, Math.min(100, this.volume + delta));

    localStorage.setItem('fnw-volume', String(this.volume));
    this.applyVolume();
  },

  toggleMute() {
    this.muted = !this.muted;
    this.applyVolume();
  },

  // Fetch + decode an audio file once.
  loadBuffer(url) {
    if (!this.buffers.has(url)) {
      const p = (async () => {
        const r = await fetch(url);

        if (!r.ok) {
          throw new Error(`${url}: HTTP ${r.status}`);
        }

        const data = await r.arrayBuffer();

        let fingerprint = data.byteLength;

        for (
          const b of new Uint8Array(
            data,
            0,
            Math.min(4096, data.byteLength)
          )
        ) {
          fingerprint = (fingerprint * 31 + b) >>> 0;
        }

        const ctx = this.ensure();

        if (!ctx) {
          throw new Error('Web Audio is not supported.');
        }

        const buffer = await ctx.decodeAudioData(data);

        return { buffer, fingerprint };
      })();

      p.catch(() => this.buffers.delete(url));
      this.buffers.set(url, p);
    }

    return this.buffers.get(url);
  },

  get latency() {
    return this.ctx
      ? (this.ctx.outputLatency || this.ctx.baseLatency || 0)
      : 0;
  },

  tone(freq, dur, {
    type = 'square',
    vol = 0.2,
    when = 0,
    slideTo = null
  } = {}) {
    const c = this.ensure();
    if (!c || c.state !== 'running') return;

    const t = Math.max(when || 0, c.currentTime);

    const o = c.createOscillator();
    const g = c.createGain();

    o.type = type;
    o.frequency.setValueAtTime(freq, t);

    if (slideTo) {
      o.frequency.exponentialRampToValueAtTime(
        slideTo,
        t + dur
      );
    }

    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o.connect(g).connect(this.sfx);

    o.start(t);
    o.stop(t + dur + 0.02);
  },

  noise(dur, {
    vol = 0.2,
    when = 0,
    hp = 6000
  } = {}) {
    const c = this.ensure();
    if (!c || c.state !== 'running') return;

    const t = Math.max(when || 0, c.currentTime);

    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;

    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;

    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    s.connect(f).connect(g).connect(this.sfx);

    s.start(t, 0, dur + 0.02);
  },

  kick(when) {
    this.tone(150, 0.18, {
      type: 'sine',
      vol: 0.9,
      when,
      slideTo: 40
    });
  },

  snare(when) {
    this.noise(0.12, {
      vol: 0.3,
      when,
      hp: 1500
    });

    this.tone(200, 0.08, {
      type: 'triangle',
      vol: 0.2,
      when
    });
  },

  hat(when) {
    this.noise(0.04, {
      vol: 0.1,
      when,
      hp: 7000
    });
  },

  countdown(when, i) {
    this.tone(i < 3 ? 440 : 880, 0.14, {
      type: 'square',
      vol: 0.12,
      when
    });
  },

  scroll() {
    this.tone(660, 0.05, { vol: 0.08 });
  },

  confirm() {
    const c = this.ensure();
    if (!c || c.state !== 'running') return;

    this.tone(523, 0.08, { vol: 0.1 });
    this.tone(784, 0.25, {
      vol: 0.1,
      when: c.currentTime + 0.08
    });
  },

  cancel() {
    this.tone(330, 0.12, {
      vol: 0.1,
      slideTo: 200
    });
  },

  hit() {
    this.tone(1300, 0.035, {
      type: 'triangle',
      vol: 0.3
    });
  },

  miss() {
    const missSounds = [
      'music/missnote1.ogg',
      'music/missnote2.ogg',
      'music/missnote3.ogg'
    ];
    const randomSound = missSounds[Math.floor(Math.random() * missSounds.length)];
    this.playSFX(randomSound);
  },

  async playMusic(url, loop = true) {
    const c = this.ensure();
    if (!c) return;

    this.stopMusic();
    this.musicUrl = url;
    const token = ++this.musicToken;

    try {
      const r = await fetch(url);
      if (!r.ok) {
        throw new Error(`${url}: HTTP ${r.status}`);
      }

      const data = await r.arrayBuffer();
      const buffer = await c.decodeAudioData(data);
      if (token !== this.musicToken) return; // superseded by a newer request

      this.musicBuffer = buffer;
      this.musicSource = c.createBufferSource();
      this.musicSource.buffer = this.musicBuffer;
      this.musicSource.loop = loop;
      this.musicSource.connect(this.music);
      this.musicSource.start(0);
    } catch (e) {
      console.error('Failed to play music:', e);
    }
  },

  stopMusic() {
    this.musicToken = (this.musicToken || 0) + 1;
    this.musicUrl = null;
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      this.musicSource = null;
    }
    this.musicBuffer = null;
  },

  async playSFX(url) {
    const c = this.ensure();
    if (!c || c.state !== 'running') return;

    try {
      const r = await fetch(url);
      if (!r.ok) {
        throw new Error(`${url}: HTTP ${r.status}`);
      }

      const data = await r.arrayBuffer();
      const buffer = await c.decodeAudioData(data);

      const source = c.createBufferSource();
      source.buffer = buffer;
      source.connect(this.sfx);
      source.start(0);
    } catch (e) {
      console.error('Failed to play SFX:', e);
    }
  }
};
