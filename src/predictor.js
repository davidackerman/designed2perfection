// A lightweight ensemble predictor for the rotary-dial minigame: given a
// stream of 0/1 picks, it guesses each next one before it arrives.
//
// Modeled on Scott Aaronson's "human randomness" oracle -- variable-order
// context matching, since people are bad at avoiding patterns when asked to
// pick "randomly" -- blended with a few extra signals (global/recent bias,
// switch-vs-repeat habits, streak behaviour, periodicity) via exponential
// weights (Hedge) combined in log-odds space.
//
// Trimmed from a fuller draft that also had an online logistic-regression
// expert: that needs hundreds of samples to say anything useful, and a play
// session here is a couple dozen picks -- at that length it was just noise,
// so it's gone.
//
// In practice this still loses to the plain backoff in src/aaronsonOracle.js
// (blending across context orders dilutes a sharp n-gram signal that backoff
// commits to fully), so that one drives round speed instead. This module is
// currently disconnected from game.js -- not deleted, just unused for now,
// in case the comparison is worth reviving later.

export class RotaryPredictor {
  constructor({
    maxContext = 8,
    decay = 0.985,
    expertRate = 0.35,
    minProbability = 0.12,
    accuracyWindow = 12,
  } = {}) {
    this.maxContext = maxContext;
    this.decay = decay;
    this.expertRate = expertRate;
    this.minProbability = minProbability;
    this.accuracyWindow = accuracyWindow;

    this.history = [];
    this.contexts = new Map(); // context string -> [weighted 0s, weighted 1s]

    this.expertNames = ['ppm', 'globalBias', 'recentBias', 'switchRepeat', 'streak', 'periodicity'];
    this.expertWeights = Object.fromEntries(this.expertNames.map((n) => [n, 1]));

    this.recentResults = []; // booleans, capped to accuracyWindow
    this.correct = 0;
    this.total = 0;
    this.lastPrediction = null;
  }

  clamp(p) {
    return Math.max(this.minProbability, Math.min(1 - this.minProbability, p));
  }

  sigmoid(x) {
    return x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
  }

  // Beta(1,1) smoothing.
  probability(count0, count1) {
    return (count1 + 1) / (count0 + count1 + 2);
  }

  contextKey(n) {
    return n === 0 ? '' : this.history.slice(-n).join('');
  }

  // Blends every context order it has evidence for; longer, better-evidenced
  // orders get more say.
  predictPPM() {
    if (!this.history.length) return 0.5;
    let numerator = 0;
    let denominator = 0;
    const maxN = Math.min(this.maxContext, this.history.length);
    for (let n = 0; n <= maxN; n++) {
      const counts = this.contexts.get(this.contextKey(n));
      if (!counts) continue;
      const [c0, c1] = counts;
      const evidence = c0 + c1;
      if (evidence <= 0) continue;
      const weight = (1 + n * 0.7) * Math.log1p(evidence);
      numerator += weight * this.probability(c0, c1);
      denominator += weight;
    }
    return denominator ? numerator / denominator : 0.5;
  }

  predictGlobalBias() {
    if (!this.history.length) return 0.5;
    const ones = this.history.reduce((a, b) => a + b, 0);
    return (ones + 1) / (this.history.length + 2);
  }

  predictRecentBias() {
    if (!this.history.length) return 0.5;
    let totalP = 0;
    let totalWeight = 0;
    for (const size of [4, 8, 16, 32]) {
      const h = this.history.slice(-size);
      if (!h.length) continue;
      const ones = h.reduce((a, b) => a + b, 0);
      const weight = 1 / Math.sqrt(size); // short windows adapt fastest
      totalP += ((ones + 1) / (h.length + 2)) * weight;
      totalWeight += weight;
    }
    return totalWeight ? totalP / totalWeight : 0.5;
  }

  predictSwitchRepeat() {
    const h = this.history;
    if (h.length < 2) return 0.5;
    let switches = 0;
    let repeats = 0;
    let weight = 1;
    for (let i = h.length - 1; i >= 1; i--) {
      if (h[i] === h[i - 1]) repeats += weight;
      else switches += weight;
      weight *= this.decay;
    }
    const pSwitch = (switches + 1) / (switches + repeats + 2);
    const last = h[h.length - 1];
    return last === 0 ? pSwitch : 1 - pSwitch;
  }

  predictStreak() {
    const h = this.history;
    if (h.length < 3) return 0.5;
    const current = h[h.length - 1];
    let streakLength = 1;
    for (let i = h.length - 2; i >= 0 && h[i] === current; i--) streakLength++;
    const targetLength = Math.min(streakLength, 5);

    let continueCount = 0;
    let breakCount = 0;
    for (let i = targetLength - 1; i < h.length - 1; i++) {
      const value = h[i];
      let len = 1;
      for (let j = i - 1; j >= 0 && h[j] === value; j--) len++;
      if (Math.min(len, 5) !== targetLength) continue;
      if (h[i + 1] === value) continueCount++;
      else breakCount++;
    }
    if (continueCount + breakCount < 2) return 0.5;
    const pContinue = (continueCount + 1) / (continueCount + breakCount + 2);
    return current === 1 ? pContinue : 1 - pContinue;
  }

  predictPeriodicity() {
    const h = this.history;
    if (h.length < 3) return 0.5;
    let weightedP = 0;
    let totalWeight = 0;
    const maxLag = Math.min(12, h.length);
    for (let lag = 1; lag <= maxLag; lag++) {
      let matches = 0;
      let comparisons = 0;
      const start = Math.max(lag, h.length - 40);
      for (let i = start; i < h.length; i++) {
        if (h[i] === h[i - lag]) matches++;
        comparisons++;
      }
      if (comparisons < 3) continue;
      const matchRate = (matches + 1) / (comparisons + 2);
      const predictedBit = h[h.length - lag];
      const p = predictedBit === 1 ? matchRate : 1 - matchRate;
      const strength = Math.abs(matchRate - 0.5) * 2;
      if (strength < 0.05) continue;
      const weight = (strength * Math.sqrt(comparisons)) / Math.sqrt(lag);
      weightedP += p * weight;
      totalWeight += weight;
    }
    return totalWeight ? weightedP / totalWeight : 0.5;
  }

  expertPredictions() {
    return {
      ppm: this.predictPPM(),
      globalBias: this.predictGlobalBias(),
      recentBias: this.predictRecentBias(),
      switchRepeat: this.predictSwitchRepeat(),
      streak: this.predictStreak(),
      periodicity: this.predictPeriodicity(),
    };
  }

  /** Call once per pick, before update(). */
  predict() {
    const predictions = this.expertPredictions();
    let weightedLogOdds = 0;
    let totalWeight = 0;
    for (const name of this.expertNames) {
      const p = this.clamp(predictions[name]);
      totalWeight += this.expertWeights[name];
      weightedLogOdds += this.expertWeights[name] * Math.log(p / (1 - p));
    }
    const p1 = this.clamp(totalWeight ? this.sigmoid(weightedLogOdds / totalWeight) : 0.5);
    this.lastPrediction = { choice: p1 >= 0.5 ? 1 : 0, probability1: p1, experts: predictions };
    return this.lastPrediction;
  }

  update(actual) {
    actual = actual ? 1 : 0;
    const predictions = this.lastPrediction?.experts || this.expertPredictions();

    // Exponential weights: experts that called this pick well gain influence.
    for (const name of this.expertNames) {
      const p = this.clamp(predictions[name]);
      const probabilityOfActual = actual === 1 ? p : 1 - p;
      this.expertWeights[name] = Math.max(
        1e-6,
        this.expertWeights[name] * probabilityOfActual ** this.expertRate
      );
    }
    const sum = Object.values(this.expertWeights).reduce((a, b) => a + b, 0);
    const scale = this.expertNames.length / sum;
    for (const name of this.expertNames) this.expertWeights[name] *= scale;

    for (const counts of this.contexts.values()) {
      counts[0] *= this.decay;
      counts[1] *= this.decay;
    }
    for (const [key, counts] of this.contexts) {
      if (counts[0] + counts[1] < 0.001) this.contexts.delete(key);
    }
    const maxN = Math.min(this.maxContext, this.history.length);
    for (let n = 0; n <= maxN; n++) {
      const key = this.contextKey(n);
      if (!this.contexts.has(key)) this.contexts.set(key, [0, 0]);
      this.contexts.get(key)[actual] += 1;
    }

    if (this.lastPrediction) {
      const hit = this.lastPrediction.choice === actual;
      if (hit) this.correct++;
      this.total++;
      this.recentResults.push(hit);
      if (this.recentResults.length > this.accuracyWindow) this.recentResults.shift();
    }

    this.history.push(actual);
    this.lastPrediction = null;
  }

  /** Lifetime accuracy -- mostly useful for debug/inspection. */
  accuracy() {
    return this.total ? this.correct / this.total : 0;
  }

  /** Accuracy over the last `accuracyWindow` picks -- the live difficulty signal. */
  rollingAccuracy() {
    if (!this.recentResults.length) return 0.5;
    return this.recentResults.filter(Boolean).length / this.recentResults.length;
  }

  reset() {
    this.history = [];
    this.contexts = new Map();
    this.expertWeights = Object.fromEntries(this.expertNames.map((n) => [n, 1]));
    this.recentResults = [];
    this.correct = 0;
    this.total = 0;
    this.lastPrediction = null;
  }
}
