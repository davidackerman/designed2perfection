// Alternate bonus minigame (test endpoint, see inconvenient2.html/main2.js):
// beat the computer's even/odd guesser instead of matching cards.
//
// Every CONFIG.evenOdd.entryWindowMs you have to enter a digit on the number
// pad. Before you do, the computer has already locked in a guess of whether
// that digit will be even or odd -- it isn't a coin flip on the computer's
// side, it's a simple order-1 Markov model over the parity of what you've
// entered so far (falling back to your overall even/odd lean, and to an
// actual coin flip if there's no history yet), so a genuinely unpredictable
// player keeps it near 50/50 while any pattern (e.g. alternating, or leaning
// odd) lets it climb well past that.
//
// Instead of a flat bonus, this run's whole score gets a multiplier, judged
// on the computer's accuracy over the trailing historyLen guesses: x2 at
// 50% (it's not reading you at all) down to x1 at 75%+ (it's reading you
// easily), linear in between -- clamped at both ends, so it never goes
// above x2 or below x1. Missing the entry window resets the run's history
// and multiplier back to the x2 default -- same as the memory board's
// "wrong pad only freezes Simon" story, this game has no losing state, only
// a multiplier that resets and starts climbing back.

import { CONFIG } from './config.js';

export class EvenOddGame {
  constructor({ audio, onUpdate }) {
    this.audio = audio;
    this.onUpdate = onUpdate;
    this.active = false;
    this.deadline = 0;
    this.timeoutId = null;
    this.guess = null;
    this.resetRun_();
  }

  resetRun_() {
    // Order-1 Markov counts: transitions[prevParity][nextParity] -> count.
    this.transitions = { even: { even: 0, odd: 0 }, odd: { even: 0, odd: 0 } };
    this.history = []; // trailing { actual, guess, correct }, capped at historyLen -- this is what both the multiplier and the on-screen log are computed from
    this.lastParity = null;
    this.multiplier = CONFIG.evenOdd.multiplierMax;
    this.multiplierLog = []; // one point per resolved guess, capped at plotLen, for the running plot
  }

  start() {
    this.clearTimer_();
    this.active = true;
    this.resetRun_();
    this.guess = this.computeGuess_();
    this.armDeadline_();
    this.emit_();
  }

  abort() {
    this.active = false;
    this.clearTimer_();
  }

  pause() {
    if (!this.active) return;
    this.clearTimer_();
  }

  resume() {
    if (!this.active) return;
    this.armDeadline_(); // a fresh window rather than resuming a stale one mid-tick
    this.emit_();
  }

  clearTimer_() {
    clearTimeout(this.timeoutId);
    this.timeoutId = null;
  }

  armDeadline_() {
    this.clearTimer_();
    this.deadline = performance.now() + CONFIG.evenOdd.entryWindowMs;
    this.timeoutId = setTimeout(() => this.handleTimeout_(), CONFIG.evenOdd.entryWindowMs);
  }

  /** For the UI's countdown bar to poll on its own animation frame, rather
   *  than this class pushing a render every tick. */
  msRemaining() {
    if (!this.active) return 0;
    return Math.max(0, this.deadline - performance.now());
  }

  computeGuess_() {
    if (this.lastParity) {
      const t = this.transitions[this.lastParity];
      const seen = t.even + t.odd;
      if (seen >= 3 && t.even !== t.odd) return t.even > t.odd ? 'even' : 'odd';
    }
    if (this.history.length >= 3) {
      const evens = this.history.filter((h) => h.actual === 'even').length;
      const odds = this.history.length - evens;
      if (evens !== odds) return evens > odds ? 'even' : 'odd';
    }
    return Math.random() < 0.5 ? 'even' : 'odd'; // nothing to exploit yet
  }

  handleKey(digit) {
    if (!this.active) return;
    const actual = Number(digit) % 2 === 0 ? 'even' : 'odd';
    const guess = this.guess;
    const correct = guess === actual;

    if (this.lastParity) this.transitions[this.lastParity][actual] += 1;
    this.lastParity = actual;
    this.history.push({ actual, guess, correct });
    if (this.history.length > CONFIG.evenOdd.historyLen) this.history.shift();

    this.updateMultiplier_();
    // Computer right is bad news for you (low tone); computer wrong is good
    // news (high tone) -- same "high = good" convention as the card match.
    this.audio?.playTone(correct ? 160 : 660, correct ? 220 : 160);

    this.guess = this.computeGuess_();
    this.armDeadline_();
    this.emit_();
  }

  handleTimeout_() {
    this.resetRun_();
    this.audio?.playTone(110, 320);
    this.guess = this.computeGuess_();
    this.armDeadline_();
    this.emit_(true);
  }

  /** x2 at accuracyForMaxMultiplier (0.5) down to x1 at accuracyForMinMultiplier
   *  (0.75), linear in between; accuracy is clamped to that range first, so
   *  a computer doing *worse* than a coin flip still caps at x2 (there's no
   *  "extra credit" beyond the max), and one reading you well past 75% still
   *  only costs you down to x1, never further. With no history yet, default
   *  to the best case (x2) -- there's nothing to judge it against. */
  updateMultiplier_() {
    const { accuracyForMaxMultiplier: lo, accuracyForMinMultiplier: hi, multiplierMax: max, multiplierMin: min } = CONFIG.evenOdd;
    if (!this.history.length) {
      this.multiplier = max;
    } else {
      const accuracy = this.history.filter((h) => h.correct).length / this.history.length;
      const clamped = Math.min(Math.max(accuracy, lo), hi);
      const t = (clamped - lo) / (hi - lo); // 0 at lo (best for you) -> 1 at hi (worst for you)
      this.multiplier = max - t * (max - min);
    }
    this.multiplierLog.push(this.multiplier);
    if (this.multiplierLog.length > CONFIG.evenOdd.plotLen) this.multiplierLog.shift();
  }

  emit_(timedOut = false) {
    if (!this.onUpdate) return;
    const accuracy = this.history.length
      ? this.history.filter((h) => h.correct).length / this.history.length
      : null;
    this.onUpdate({
      guess: this.guess,
      multiplier: this.multiplier,
      multiplierMax: CONFIG.evenOdd.multiplierMax,
      multiplierMin: CONFIG.evenOdd.multiplierMin,
      multiplierLog: this.multiplierLog.slice(),
      history: this.history.slice(),
      accuracy,
      totalGuesses: this.history.length,
      timedOut,
    });
  }
}
