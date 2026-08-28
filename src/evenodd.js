// Alternate bonus minigame (test endpoint, see inconvenient2.html/main2.js):
// beat the computer's even/odd guesser instead of matching cards.
//
// Every CONFIG.evenOdd.entryWindowMs you have to press 0 or 1 on the number
// pad -- restricted to just those two, not any digit, since a two-way choice
// is harder to disguise than picking freely among ten. Before you press,
// the computer has already locked in a guess of which -- see AaronsonOracle
// below for how.
//
// The multiplier applies to your Simon score instead of a flat bonus added
// to it: it starts (and resets, on a missed window) at the neutral x1
// baseline, climbs toward x2 once the computer is wrong 60%+ of the time
// (actually beating it, not just a coin flip), and falls back toward x1
// once it's reading you 75%+ of the time -- clamped at both ends, so it
// never goes below x1 or above x2. Same "wrong pad only freezes Simon"
// story as the memory board: this game has no losing state, only a
// multiplier that resets and starts climbing back.
//
// It doesn't actually apply, though, until you've sustained
// qualifyGuesses guesses since the last reset -- short of that the
// *applied* multiplier stays pinned at x1 no matter how well the raw
// number is doing, so a reset before qualifying costs nothing (nothing
// was locked in yet) and crossing the threshold just starts applying the
// live number from then on, continuously, same as it does today.

import { CONFIG } from './config.js';

/** The "Aaronson Oracle": the human-unpredictability demo popularized by
 *  Scott Aaronson, re-implemented here as the even/odd predictor. It's an
 *  ensemble of finite-context predictors (orders 1 through maxOrder, i.e.
 *  "the last k bits you entered"), each one's own hit rate tracked
 *  independently across the whole run regardless of whether it was ever put
 *  in charge. Every guess, whichever order currently has the best track
 *  record gets to make the call (falling back to a coin flip once no order
 *  has enough data to have an opinion) -- so a player who's unpredictable at
 *  every context length keeps it near 50/50, while any pattern at *any*
 *  context length (alternating, repeating, a slight lean) eventually gets
 *  picked up by whichever order best exploits it. */
class AaronsonOracle {
  constructor(maxOrder = 5) {
    this.maxOrder = maxOrder;
    this.sequence = [];                                     // actual bits this run: '0' (even) / '1' (odd)
    this.tables = Array.from({ length: maxOrder }, () => new Map()); // tables[k-1]: context (k bits, as a string) -> { '0': count, '1': count }
    this.orderHits = new Array(maxOrder).fill(0);
    this.orderSeen = new Array(maxOrder).fill(0);
  }

  /** Whichever order has the best hit rate so far calls this guess (ties
   *  favor more context); an order only ever has an opinion once its table
   *  has a non-tied count for the current context. No order with a real
   *  track record yet -- or the best one is tied for its current context --
   *  falls back to a genuine coin flip. */
  predict() {
    let bestOrder = 0;
    let bestRate = -1;
    for (let k = this.maxOrder; k >= 1; k--) {
      if (this.orderSeen[k - 1] === 0) continue;
      const rate = this.orderHits[k - 1] / this.orderSeen[k - 1];
      if (rate > bestRate) {
        bestRate = rate;
        bestOrder = k;
      }
    }
    if (bestOrder > 0 && this.sequence.length >= bestOrder) {
      const context = this.sequence.slice(-bestOrder).join('');
      const counts = this.tables[bestOrder - 1].get(context);
      if (counts && counts['0'] !== counts['1']) {
        return counts['0'] > counts['1'] ? '0' : '1';
      }
    }
    return Math.random() < 0.5 ? '0' : '1';
  }

  /** Score every order's own prediction against the real outcome (whether or
   *  not it was actually in charge this round), then fold the outcome into
   *  each order's context table for next time. */
  update(actualBit) {
    for (let k = 1; k <= this.maxOrder; k++) {
      if (this.sequence.length < k) continue;
      const context = this.sequence.slice(-k).join('');
      const table = this.tables[k - 1];
      const counts = table.get(context);
      if (counts && counts['0'] !== counts['1']) {
        const predicted = counts['0'] > counts['1'] ? '0' : '1';
        this.orderSeen[k - 1] += 1;
        if (predicted === actualBit) this.orderHits[k - 1] += 1;
      }
      if (!counts) table.set(context, { '0': 0, '1': 0 });
      table.get(context)[actualBit] += 1;
    }
    this.sequence.push(actualBit);
  }
}

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
    this.oracle = new AaronsonOracle();
    this.history = []; // recent { actual, guess, correct }, capped at historyLen -- only for the on-screen guess-vs-you log
    // correctCount/totalCount are cumulative since this reset and never
    // trimmed -- the multiplier and the accuracy readout are both computed
    // from these, NOT from the (display-capped) history array above, so
    // "accuracy" always means "since the last reset", not "over the last
    // historyLen guesses".
    this.correctCount = 0;
    this.totalCount = 0;
    // rawMultiplier is the live accuracy-derived number (see
    // updateMultiplier_); appliedMultiplier is what actually counts toward
    // score -- pinned at the neutral baseline until qualifyGuesses is hit,
    // see updateMultiplier_ again.
    this.rawMultiplier = CONFIG.evenOdd.multiplierMin;
    this.appliedMultiplier = CONFIG.evenOdd.multiplierMin;
    this.multiplierLog = []; // one point (of appliedMultiplier) per resolved guess, capped at plotLen, for the running plot
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
    return this.oracle.predict() === '0' ? 'even' : 'odd';
  }

  handleKey(digit) {
    if (!this.active) return;
    // Restricted to 0/1 (not any digit) on purpose -- a two-way choice is
    // harder to disguise than picking freely among ten, so it's a stiffer
    // test of how random you actually are. Anything else is just dropped,
    // same as an unmatched combo on the memory board.
    if (digit !== '0' && digit !== '1') return;
    const actual = Number(digit) % 2 === 0 ? 'even' : 'odd';
    const guess = this.guess;
    const correct = guess === actual;

    this.oracle.update(actual === 'even' ? '0' : '1');
    this.history.push({ actual, guess, correct });
    if (this.history.length > CONFIG.evenOdd.historyLen) this.history.shift();
    this.totalCount += 1;
    if (correct) this.correctCount += 1;

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
    // No sound here -- it read as one more right/wrong tone and was
    // confusing next to the per-guess ones.
    this.guess = this.computeGuess_();
    this.armDeadline_();
    this.emit_(true);
  }

  /** x2 at accuracyForMaxMultiplier (0.4 -- the computer wrong 60%+ of the
   *  time, actually beaten, not just at a coin flip) down to x1 at
   *  accuracyForMinMultiplier (0.75), linear in between; accuracy is
   *  clamped to that range first, so a computer doing even better than 60%
   *  wrong still caps at x2 (there's no "extra credit" beyond the max), and
   *  one reading you well past 75% still only costs you down to x1, never
   *  further. With no guesses yet, this is
   *  the neutral x1 baseline -- there's nothing yet to judge it against.
   *  Uses correctCount/totalCount (cumulative since the last reset), not
   *  the display-capped history array -- so a long run's multiplier keeps
   *  reflecting the whole run, not just its last historyLen guesses.
   *
   *  rawMultiplier is that number, always live. appliedMultiplier -- what
   *  actually feeds the Score x Multiplier = Total line -- only starts
   *  tracking it once totalCount reaches qualifyGuesses; short of that it
   *  stays pinned at the baseline, so nothing you're doing counts toward
   *  score until you've sustained it a while. */
  updateMultiplier_() {
    const { accuracyForMaxMultiplier: lo, accuracyForMinMultiplier: hi, multiplierMax: max, multiplierMin: min, qualifyGuesses } = CONFIG.evenOdd;
    if (!this.totalCount) {
      this.rawMultiplier = min;
    } else {
      const accuracy = this.correctCount / this.totalCount;
      const clamped = Math.min(Math.max(accuracy, lo), hi);
      const t = (clamped - lo) / (hi - lo); // 0 at lo (best for you) -> 1 at hi (worst for you)
      this.rawMultiplier = max - t * (max - min);
    }
    this.appliedMultiplier = this.totalCount >= qualifyGuesses ? this.rawMultiplier : min;
    this.multiplierLog.push(this.appliedMultiplier);
    if (this.multiplierLog.length > CONFIG.evenOdd.plotLen) this.multiplierLog.shift();
  }

  emit_(timedOut = false) {
    if (!this.onUpdate) return;
    this.onUpdate({
      guess: this.guess,
      multiplier: this.appliedMultiplier, // what actually counts toward score -- see updateMultiplier_
      rawMultiplier: this.rawMultiplier,
      qualified: this.totalCount >= CONFIG.evenOdd.qualifyGuesses,
      qualifyGuesses: CONFIG.evenOdd.qualifyGuesses,
      multiplierMax: CONFIG.evenOdd.multiplierMax,
      multiplierMin: CONFIG.evenOdd.multiplierMin,
      multiplierLog: this.multiplierLog.slice(),
      history: this.history.slice(), // recent guesses only, for the on-screen log
      accuracy: this.totalCount ? this.correctCount / this.totalCount : null, // cumulative since last reset
      totalGuesses: this.totalCount, // cumulative, not this.history.length
      timedOut,
    });
  }
}
