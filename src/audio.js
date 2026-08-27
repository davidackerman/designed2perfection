// Audio layer. Files are optional: anything missing degrades to silence, so
// the game is playable before a single sample exists.
//
// Drop MP3s (or OGG/WAV -- adjust MANIFEST) into assets/audio/ using the
// filenames in assets/audio/README.md.

import { CONFIG } from './config.js';

export const MANIFEST = {
  // Command call-outs, one per action.
  push: 'assets/audio/push.mp3',
  pull: 'assets/audio/pull.mp3',
  soap: 'assets/audio/soap.mp3',
  swipe: 'assets/audio/swipe.mp3',
  tap: 'assets/audio/tap.mp3',
  // Button-press feedback, one per action.
  pushit: 'assets/audio/pushit.mp3',
  pullit: 'assets/audio/pullit.mp3',
  soapit: 'assets/audio/soapit.mp3',
  swipeit: 'assets/audio/swipeit.mp3',
  tapit: 'assets/audio/tapit.mp3',
  // Feedback.
  success: 'assets/audio/success.mp3',
  nothing: 'assets/audio/nothing.mp3',   // the soap dispenser doing nothing
  denied: 'assets/audio/denied.mp3',     // card read at the wrong orientation
  lose: 'assets/audio/lose.mp3',         // any way a run can end: wrong button or ran out of time
  gameover: 'assets/audio/gameover.mp3',
  start: 'assets/audio/start.mp3',
  song: 'assets/audio/song.mp3', // looping background music for a run
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class AudioManager {
  constructor(manifest = MANIFEST) {
    this.manifest = manifest;
    this.buffers = new Map();
    this.ctx = null;
    this.muted = localStorage.getItem(CONFIG.storage.muted) === '1';
    this.musicVolume = clamp01(parseFloat(localStorage.getItem(CONFIG.storage.musicVolume)) || 0.5);
    this.loaded = false;
    this.preloadPromise = null;
    this.music = null;
    this.musicToken = 0; // invalidates a playMusic() still waiting on preload
  }

  /** Must be called from a user gesture before the first sound. */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
      this.gain.gain.value = this.muted ? 0 : 1;
      // Persistent node so the volume slider can adjust a track that's
      // already playing, not just future ones.
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.gain);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.loaded) this.preloadPromise = this.preload();
  }

  async preload() {
    this.loaded = true;
    await Promise.all(
      Object.entries(this.manifest).map(async ([key, url]) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return; // not recorded yet
          const bytes = await res.arrayBuffer();
          this.buffers.set(key, await this.ctx.decodeAudioData(bytes));
        } catch { /* unplayable or absent: stay silent */ }
      })
    );
  }

  play(key) {
    if (this.muted || !this.ctx) return;
    const buffer = this.buffers.get(key);
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.gain);
    src.start();
  }

  /** Loops until stopMusic(). Waits out preload if this fires before the
   *  (often multi-MB) track has finished decoding, unlike one-shot play(). */
  playMusic(key) {
    this.stopMusic();
    const token = this.musicToken;
    const start = () => {
      if (token !== this.musicToken || !this.ctx) return; // superseded meanwhile
      const buffer = this.buffers.get(key);
      if (!buffer) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(this.musicGain); // routes through both the volume node and mute
      src.start();
      this.music = src;
    };
    if (this.buffers.has(key)) start();
    else if (this.preloadPromise) this.preloadPromise.then(start);
  }

  stopMusic() {
    this.musicToken++; // cancel any playMusic() still waiting on preload
    if (!this.music) return;
    try {
      this.music.stop();
    } catch { /* already stopped */ }
    this.music = null;
  }

  setMusicVolume(volume) {
    this.musicVolume = clamp01(volume);
    if (this.musicGain) this.musicGain.gain.value = this.musicVolume;
    localStorage.setItem(CONFIG.storage.musicVolume, String(this.musicVolume));
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.gain) this.gain.gain.value = muted ? 0 : 1;
    localStorage.setItem(CONFIG.storage.muted, muted ? '1' : '0');
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }
}
