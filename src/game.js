// Round loop and state machine. Knows nothing about the DOM or about keys --
// it takes {actionId, variantId} events in and drives the UI out.

import { CONFIG } from './config.js';
import { pickAction, makeChallenge } from './actions.js';
import { STATE } from './state.js';

export { STATE };

const REASONS = {
  timeout: 'Too slow. The door closed.',
  wrong: 'Wrong thing. Everyone saw.',
  wrongDoor: 'You read the sign wrong. Again.',
};

export class Game {
  constructor({ ui, audio, scores, onGameOver }) {
    this.ui = ui;
    this.audio = audio;
    this.scores = scores;
    this.onGameOver = onGameOver;
    this.state = STATE.TITLE;
    this.hardMode = localStorage.getItem(CONFIG.storage.hardMode) === '1';
    this.challenge = null;
    this.frame = null;
    this.gapTimer = null;
    this.paused = false;
    this.remainingOnPause = null;
  }

  setHardMode(on) {
    this.hardMode = on;
    localStorage.setItem(CONFIG.storage.hardMode, on ? '1' : '0');
  }

  get mode() {
    return this.hardMode ? 'hard' : 'normal';
  }

  windowFor(round, challenge) {
    const t = CONFIG.timing;
    const floor = round >= t.brutalRound ? t.brutalMinWindowMs : t.minWindowMs;
    const decayRounds = Math.max(0, round - t.warmupRounds); // flat through warmupRounds
    const base = Math.max(floor, t.startWindowMs * Math.pow(t.decay, decayRounds));
    const extraHits = Math.max(0, challenge.requiredHits - 1);
    return base + extraHits * CONFIG.soap.perExtraHitMs;
  }

  start() {
    this.stopTimers();
    this.state = STATE.PLAYING;
    this.paused = false;
    this.round = 0;
    this.score = 0;
    this.lastActionId = null;
    this.ui.hideOverlays();
    this.ui.setHud({ score: 0, round: 0, best: this.scores.best(this.mode) });
    this.audio.play('start');
    this.audio.playMusic('song');
    this.nextRound();
    this.frame = requestAnimationFrame(() => this.tick());
  }

  nextRound() {
    this.round += 1;
    const action = pickAction(this.lastActionId);
    this.lastActionId = action.id;
    this.challenge = makeChallenge(action, this.round, this.hardMode);
    this.windowMs = this.windowFor(this.round, this.challenge);
    this.deadline = performance.now() + this.windowMs;
    this.ui.setHud({ round: this.round });
    this.ui.showChallenge(this.challenge);
    this.ui.setTimer(1);
    this.audio.play(action.audioKey);
  }

  tick() {
    if (this.state !== STATE.PLAYING) return;
    if (this.challenge) {
      const remaining = this.deadline - performance.now();
      this.ui.setTimer(remaining / this.windowMs);
      if (remaining <= 0) {
        this.fail('timeout');
        return;
      }
    }
    this.frame = requestAnimationFrame(() => this.tick());
  }

  handleInput({ actionId, variantId }) {
    if (this.state !== STATE.PLAYING || !this.challenge) return;
    const ch = this.challenge;
    this.audio.play(`${actionId}it`);

    if (actionId !== ch.action.id) {
      const doorMixUp =
        (ch.action.id === 'push' && actionId === 'pull') ||
        (ch.action.id === 'pull' && actionId === 'push');
      this.fail(doorMixUp ? 'wrongDoor' : 'wrong');
      return;
    }

    if (variantId !== ch.variantId) {
      // Right reader, wrong way round. Costs time, not the run.
      this.deadline -= CONFIG.timing.denyPenaltyMs;
      this.audio.play('denied');
      this.ui.flash('deny');
      if (this.deadline <= performance.now()) this.fail('timeout');
      return;
    }

    ch.hitsDone += 1;
    if (ch.hitsDone < ch.requiredHits) {
      // The dispenser considers your request and declines.
      this.audio.play('nothing');
      this.ui.flash('nothing');
      this.ui.setDebugProgress(ch.hitsDone, ch.requiredHits);
      return;
    }

    this.succeed();
  }

  succeed() {
    this.score += 1;
    this.challenge = null;
    this.ui.setHud({ score: this.score });
    this.ui.clearChallenge();
    this.ui.setTimer(0);
    this.ui.flash('good');
    this.audio.play('success');
    this.gapTimer = setTimeout(() => {
      if (this.state === STATE.PLAYING) this.nextRound();
    }, CONFIG.timing.interRoundMs);
  }

  fail(reason) {
    const causeAction = this.challenge ? this.challenge.action.id : null;
    this.stopTimers();
    this.state = STATE.OVER;
    this.challenge = null;
    this.ui.setTimer(0);
    this.ui.flash('bad');
    this.audio.stopMusic();
    this.audio.play('lose');
    this.audio.play('gameover');

    const mode = this.mode;
    this.scores.recordGame({ score: this.score, causeAction });
    this.onGameOver({
      score: this.score,
      mode,
      causeAction,
      reason: REASONS[reason] || REASONS.wrong,
      qualifies: this.scores.qualifies(mode, this.score),
    });
  }

  /** Tab hidden: rAF stops, so freeze the clock instead of dying on return. */
  pause() {
    if (this.state !== STATE.PLAYING || this.paused) return;
    this.paused = true;
    this.remainingOnPause = this.challenge ? this.deadline - performance.now() : null;
    this.stopTimers();
  }

  resume() {
    if (this.state !== STATE.PLAYING || !this.paused) return;
    this.paused = false;
    if (this.remainingOnPause !== null) {
      this.deadline = performance.now() + Math.max(this.remainingOnPause, 0);
    } else {
      // Paused during the gap between rounds; just carry on.
      this.gapTimer = setTimeout(() => {
        if (this.state === STATE.PLAYING) this.nextRound();
      }, CONFIG.timing.interRoundMs);
    }
    this.frame = requestAnimationFrame(() => this.tick());
  }

  abort() {
    this.stopTimers();
    this.audio.stopMusic();
    this.state = STATE.TITLE;
    this.challenge = null;
    this.ui.clearChallenge();
    this.ui.setTimer(0);
  }

  stopTimers() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
    clearTimeout(this.gapTimer);
    this.gapTimer = null;
  }
}
