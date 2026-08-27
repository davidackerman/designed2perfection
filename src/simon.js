// The default game: a tone-and-picture sequence that grows by one every
// round. Repeat it back in order; get it right and it plays again with one
// more step added, faster than last time. Miss a step, or take too long
// between presses, and the run ends.
//
// Deliberately not narrated anywhere in the UI -- first-timers work out the
// rule by watching a round or two. See ui.js for the flash/tone-only stage
// treatment that keeps it that way (no placard, no instructional video).

import { CONFIG } from './config.js';
import { STATE } from './state.js';

const PADS = ['push', 'pull', 'soap', 'swipe'];

// Placeholder art: the existing door/soap images, mirrored where needed so
// all four pads are at least visually distinct until real per-pad images
// exist. Deliberately NOT using the swipe/tap art here -- those have their
// "STRIPE UP" / "FACE DOWN" labels baked into the SVG, which would spell out
// the answer on screen. Swap all four for real images once they exist, and
// `flip` can go once each pad has its own source image.
const PAD_ART = {
  push: { image: 'assets/img/door.svg', flip: false },
  pull: { image: 'assets/img/door.svg', flip: true },
  soap: { image: 'assets/img/soap.svg', flip: false },
  swipe: { image: 'assets/img/soap.svg', flip: true },
};

const REASONS = {
  timeout: 'Too slow. Everyone saw.',
  wrong: 'Wrong one. Everyone saw.',
};

export class SimonGame {
  constructor({ ui, audio, scores, onGameOver }) {
    this.ui = ui;
    this.audio = audio;
    this.scores = scores;
    this.onGameOver = onGameOver;
    this.state = STATE.TITLE;
    this.sequence = [];
    this.round = 0;
    this.score = 0;
    this.inputIndex = 0;
    this.phase = null; // 'playback' | 'input' | 'gap'
    this.frame = null;
    this.playbackTimer = null;
    this.gapTimer = null;
    this.paused = false;
    this.remainingOnPause = null;
    this.bonus = 0;
    this.bonusMax = CONFIG.simon.bonusMax;
  }

  /** A different team steps up: the bonus meter is per-team, same as "the
   *  line"'s read in the classic game. Everyday retries don't touch it. */
  newTeam() {
    this.bonus = 0;
  }

  get mode() {
    return 'simon';
  }

  stepMsFor(round) {
    const s = CONFIG.simon;
    return Math.max(s.minStepMs, s.startStepMs * Math.pow(s.decay, Math.max(0, round - 1)));
  }

  inputWindowFor(round) {
    const s = CONFIG.simon;
    return Math.max(s.inputMinWindowMs, s.inputWindowMs * Math.pow(s.inputDecay, Math.max(0, round - 1)));
  }

  start() {
    this.stopTimers();
    this.state = STATE.PLAYING;
    this.paused = false;
    this.sequence = [];
    this.round = 0;
    this.score = 0;
    this.ui.hideOverlays();
    this.ui.setSimonMode(true);
    this.ui.clearSimonStep();
    this.ui.setHud({
      score: 0,
      round: 0,
      best: this.scores.best(this.mode),
      bonus: this.bonus,
      bonusMax: this.bonusMax,
    });
    this.audio.play('start');
    // No background music once a round is live -- title screen only.
    this.audio.stopMusic();
    this.nextRound();
  }

  nextRound() {
    this.round += 1;
    this.sequence.push(PADS[Math.floor(Math.random() * PADS.length)]);
    this.inputIndex = 0;
    this.ui.setHud({ round: this.round });
    this.playSequence();
  }

  playSequence() {
    this.phase = 'playback';
    this.ui.setTimer(0);
    const stepMs = this.stepMsFor(this.round);
    const gapMs = stepMs * CONFIG.simon.gapRatio;
    let i = 0;
    const playStep = () => {
      if (this.state !== STATE.PLAYING || this.paused) return;
      if (i >= this.sequence.length) {
        this.beginInput();
        return;
      }
      const actionId = this.sequence[i];
      i += 1;
      this.lightPad(actionId, stepMs);
      this.playbackTimer = setTimeout(() => {
        this.ui.clearSimonStep();
        this.playbackTimer = setTimeout(playStep, gapMs);
      }, stepMs);
    };
    this.ui.clearSimonStep();
    this.playbackTimer = setTimeout(playStep, gapMs);
  }

  lightPad(actionId, durationMs) {
    const art = PAD_ART[actionId];
    this.ui.flashSimonStep(actionId, art.image, art.flip);
    this.audio.playTone(CONFIG.simon.tones[actionId], durationMs);
  }

  beginInput() {
    this.phase = 'input';
    this.armInputWindow();
  }

  armInputWindow() {
    this.windowMs = this.inputWindowFor(this.round);
    this.deadline = performance.now() + this.windowMs;
    this.frame = requestAnimationFrame(() => this.tickInput());
  }

  tickInput() {
    if (this.state !== STATE.PLAYING || this.phase !== 'input') return;
    const remaining = this.deadline - performance.now();
    this.ui.setTimer(remaining / this.windowMs);
    if (remaining <= 0) {
      this.fail('timeout');
      return;
    }
    this.frame = requestAnimationFrame(() => this.tickInput());
  }

  /** Simon mode ignores which variant fired (e.g. swipe orientation) -- only
   *  which of the four pads it was. */
  handleInput({ actionId }) {
    if (this.state !== STATE.PLAYING || this.phase !== 'input') return;
    this.audio.play(`${actionId}it`);

    const expected = this.sequence[this.inputIndex];
    if (actionId !== expected) {
      this.fail('wrong');
      return;
    }

    this.lightPad(actionId, CONFIG.simon.ackMs);
    clearTimeout(this.ackTimer);
    this.ackTimer = setTimeout(() => this.ui.clearSimonStep(), CONFIG.simon.ackMs);

    this.inputIndex += 1;
    if (this.inputIndex >= this.sequence.length) {
      this.succeed();
    } else {
      this.armInputWindow();
    }
  }

  succeed() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.phase = 'gap';
    this.score = this.round;
    this.ui.setHud({ score: this.score });
    this.ui.setTimer(0);
    this.ui.flash('good');
    this.audio.play('success');
    this.gapTimer = setTimeout(() => {
      if (this.state === STATE.PLAYING) this.nextRound();
    }, CONFIG.simon.interRoundMs);
  }

  fail(reason) {
    const causeAction = this.sequence[this.inputIndex] || null;
    this.stopTimers();
    this.state = STATE.OVER;
    this.ui.setTimer(0);
    this.ui.clearSimonStep();
    this.ui.flash('bad');
    this.audio.stopMusic();
    this.audio.play('lose');
    this.audio.play('gameover');

    this.scores.recordGame({ score: this.score, causeAction });
    this.onGameOver({
      score: this.score,
      mode: this.mode,
      causeAction,
      reason: REASONS[reason] || REASONS.wrong,
      qualifies: this.scores.qualifies(this.mode, this.score),
    });
  }

  /** Tab hidden: freeze the clock instead of dying on return, same as the
   *  classic game. Mid-playback, simplest correct thing is to just replay
   *  the sequence from the top once we're back. */
  pause() {
    if (this.state !== STATE.PLAYING || this.paused) return;
    this.paused = true;
    this.remainingOnPause = this.phase === 'input' ? this.deadline - performance.now() : null;
    this.stopTimers();
  }

  resume() {
    if (this.state !== STATE.PLAYING || !this.paused) return;
    this.paused = false;
    if (this.phase === 'input') {
      this.deadline = performance.now() + Math.max(this.remainingOnPause ?? 0, 0);
      this.frame = requestAnimationFrame(() => this.tickInput());
    } else if (this.phase === 'gap') {
      this.gapTimer = setTimeout(() => {
        if (this.state === STATE.PLAYING) this.nextRound();
      }, CONFIG.simon.interRoundMs);
    } else {
      this.playSequence();
    }
  }

  abort() {
    this.stopTimers();
    this.audio.stopMusic();
    this.state = STATE.TITLE;
    this.ui.clearSimonStep();
    this.ui.setTimer(0);
  }

  stopTimers() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
    clearTimeout(this.playbackTimer);
    this.playbackTimer = null;
    clearTimeout(this.gapTimer);
    this.gapTimer = null;
    clearTimeout(this.ackTimer);
    this.ackTimer = null;
  }
}
