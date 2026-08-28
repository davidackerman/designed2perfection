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
// Your bonus is judged on the computer's accuracy over the trailing
// historyLen guesses: 10 at 50% (it's not reading you at all) down to 0 at
// 80%+ (it's reading you easily), linear in between. Missing the entry
// window resets the run's history and bonus to 0 -- same as the memory
// board's "wrong pad only freezes Simon" story, this game has no losing
// state, only a bonus that resets and starts climbing back.

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
    this.history = []; // trailing { actual, guess, correct }, capped at historyLen
    this.lastParity = null;
    this.bonus = CONFIG.evenOdd.bonusMax;
    this.last = null;
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
    this.last = { actual, guess, correct };

    this.updateBonus_();
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

  updateBonus_() {
    const { accuracyForMaxBonus: lo, accuracyForZeroBonus: hi, bonusMax } = CONFIG.evenOdd;
    if (!this.history.length) {
      this.bonus = bonusMax;
      return;
    }
    const accuracy = this.history.filter((h) => h.correct).length / this.history.length;
    const clamped = Math.min(Math.max(accuracy, lo), hi);
    this.bonus = Math.round(bonusMax * (hi - clamped) / (hi - lo));
  }

  emit_(timedOut = false) {
    if (!this.onUpdate) return;
    const accuracy = this.history.length
      ? this.history.filter((h) => h.correct).length / this.history.length
      : null;
    this.onUpdate({
      guess: this.guess,
      bonus: this.bonus,
      bonusMax: CONFIG.evenOdd.bonusMax,
      accuracy,
      totalGuesses: this.history.length,
      last: this.last,
      timedOut,
    });
  }
}
