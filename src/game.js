// Round loop and state machine. Knows nothing about the DOM or about keys --
// it takes {actionId, variantId} events in and drives the UI out.

import { CONFIG } from './config.js';
import { pickAction, makeChallenge } from './actions.js';
import { AaronsonOracle } from './aaronsonOracle.js';

export const STATE = { TITLE: 'title', PLAYING: 'playing', OVER: 'over' };

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
    this.aaronson = new AaronsonOracle({ accuracyWindow: CONFIG.rotary.accuracyWindow });
    this.accuracyHistory = []; // debug-mode graph: lifetime accuracy per pick
    this.hitHistory = [];      // debug-mode graph: hit/miss per pick, same window
    this.rotarySpeed = 1;
    this.practice = false;
  }

  /** A different team steps up: wipe what "the line" has learned so far.
   *  Everyday retries ("go again") deliberately don't touch this -- the read
   *  it has on a team is supposed to persist across their attempts. */
  newTeam() {
    this.aaronson.reset();
    this.accuracyHistory = [];
    this.hitHistory = [];
    this.rotarySpeed = 1;
    this.pushOracleDebug();
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
    const base = Math.max(floor, t.startWindowMs * Math.pow(t.decay, round - 1));
    const extraHits = Math.max(0, challenge.requiredHits - 1);
    return (base + extraHits * CONFIG.soap.perExtraHitMs) * this.rotarySpeed;
  }

  start() {
    this.stopTimers();
    this.state = STATE.PLAYING;
    this.paused = false;
    this.practice = false;
    this.round = 0;
    this.score = 0;
    this.lastActionId = null;
    this.ui.hideOverlays();
    this.ui.setHud({ score: 0, round: 0, best: this.scores.best(this.mode) });
    this.audio.play('start');
    this.nextRound();
    this.frame = requestAnimationFrame(() => this.tick());
  }

  /** Skip the reflex challenges entirely: just "the line", nothing to fail. */
  startPractice() {
    this.stopTimers();
    this.state = STATE.PLAYING;
    this.paused = false;
    this.practice = true;
    this.round = 0;
    this.score = 0;
    this.challenge = null;
    this.ui.hideOverlays();
    this.ui.clearChallenge();
    this.ui.setTimer(0);
    this.ui.setHud({ score: 0, round: 0, best: this.scores.best(this.mode) });
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

  /** One pick on the rotary dial: 0 or 1. Runs alongside whatever round is live. */
  handleRotary(bit) {
    if (this.state !== STATE.PLAYING) return;
    const guess = this.aaronson.predict();
    this.aaronson.update(bit);
    const correct = guess.choice === bit;
    const accuracy = this.aaronson.rollingAccuracy();

    const r = CONFIG.rotary;
    if (this.aaronson.total > r.warmupPicks) {
      const edgePoints = (accuracy - 0.5) * 100; // + = it's reading you, - = you're fooling it
      const factor = r.perPointFactor ** Math.abs(edgePoints); // compounds per point past 50%
      const target =
        edgePoints >= 0
          ? Math.max(r.minMultiplier, factor) // reading you: rounds speed up
          : Math.min(r.maxMultiplier, 1 / factor); // fooling it: rounds slow down
      this.rotarySpeed += (target - this.rotarySpeed) * r.adaptRate;
    }

    // Rolling, not lifetime: the same value driving speed above, so the
    // graph actually moves instead of crawling like a large-N average would.
    this.accuracyHistory.push(accuracy);
    this.hitHistory.push(correct);
    const overflow = this.accuracyHistory.length - CONFIG.rotary.chartLength;
    if (overflow > 0) {
      this.accuracyHistory.splice(0, overflow);
      this.hitHistory.splice(0, overflow);
    }

    this.ui.setRotary({ bit, correct, accuracy });
    this.pushOracleDebug();
  }

  /** Also called from main.js when debug mode is toggled on, to catch up. */
  pushOracleDebug() {
    this.ui.setOracleDebug({
      aaronsonAcc: this.aaronson.accuracy(),
      aaronsonN: this.aaronson.total,
      accuracyHistory: this.accuracyHistory,
      hitHistory: this.hitHistory,
    });
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
    if (this.practice) return; // nothing timed to resume -- just "the line"
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
