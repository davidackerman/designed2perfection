// The reference "Aaronson Oracle" (see aaronsonoracle.com for the writeup
// this follows): an n-gram frequency model with backoff. For each context
// length 0..maxOrder it keeps a notebook of what bit followed that exact
// run before. To predict, it starts at the longest context and asks "have I
// seen this at least twice, and did it not go both ways equally?" -- if not,
// it gives up on that question and asks a shorter, less specific one, down
// to the empty context. If nothing ever qualifies, it flips a coin.
//
// This exists purely as a yardstick: RotaryPredictor (src/predictor.js) runs
// the game, this runs alongside it in debug mode so the two can be compared
// on the same live sequence -- see Game.handleRotary.

export class AaronsonOracle {
  constructor({ maxOrder = 5, accuracyWindow = 12, stripLength = 50 } = {}) {
    this.maxOrder = maxOrder;
    this.accuracyWindow = accuracyWindow;
    this.stripLength = stripLength;
    this.history = [];
    this.tables = Array.from({ length: maxOrder + 1 }, () => new Map()); // context -> [count0, count1]
    this.recentResults = [];
    this.hitHistory = [];
    this.correct = 0;
    this.total = 0;
    this.lastPrediction = null;
    this.lastUsedOrder = null;
  }

  contextKey(order) {
    return order === 0 ? '' : this.history.slice(-order).join('');
  }

  countsFor(order) {
    return this.tables[order].get(this.contextKey(order)) || [0, 0];
  }

  /** One row per context length, longest first -- what the bands visualize. */
  bands() {
    const rows = [];
    for (let order = this.maxOrder; order >= 0; order--) {
      const [count0, count1] = this.countsFor(order);
      rows.push({ order, count0, count1, total: count0 + count1, active: order === this.lastUsedOrder });
    }
    return rows;
  }

  /** Call once per pick, before update(). Backoff from the longest context down. */
  predict() {
    let choice = null;
    let usedOrder = null;
    for (let order = this.maxOrder; order >= 0; order--) {
      const [count0, count1] = this.countsFor(order);
      if (count0 + count1 < 2) continue; // seen fewer than twice: too thin to trust
      if (count0 === count1) continue;   // seen equally either way: no lean
      choice = count1 > count0 ? 1 : 0;
      usedOrder = order;
      break;
    }
    if (choice === null) choice = Math.random() < 0.5 ? 0 : 1; // never seen this context at all
    this.lastPrediction = { choice, order: usedOrder };
    return this.lastPrediction;
  }

  update(actual) {
    actual = actual ? 1 : 0;
    this.lastUsedOrder = this.lastPrediction ? this.lastPrediction.order : null;

    // One press, every context length gets an entry: the full run down to
    // no context at all. A context of length n needs n prior bits to exist.
    for (let order = 0; order <= Math.min(this.maxOrder, this.history.length); order++) {
      const table = this.tables[order];
      const key = this.contextKey(order);
      if (!table.has(key)) table.set(key, [0, 0]);
      table.get(key)[actual] += 1;
    }

    if (this.lastPrediction) {
      const hit = this.lastPrediction.choice === actual;
      if (hit) this.correct++;
      this.total++;
      this.recentResults.push(hit);
      if (this.recentResults.length > this.accuracyWindow) this.recentResults.shift();
      this.hitHistory.push(hit);
      if (this.hitHistory.length > this.stripLength) this.hitHistory.shift();
    }

    this.history.push(actual);
    this.lastPrediction = null;
  }

  /** Lifetime accuracy -- the number worth comparing against RotaryPredictor. */
  accuracy() {
    return this.total ? this.correct / this.total : 0;
  }

  rollingAccuracy() {
    if (!this.recentResults.length) return 0.5;
    return this.recentResults.filter(Boolean).length / this.recentResults.length;
  }

  reset() {
    this.history = [];
    this.tables = Array.from({ length: this.maxOrder + 1 }, () => new Map());
    this.recentResults = [];
    this.hitHistory = [];
    this.correct = 0;
    this.total = 0;
    this.lastPrediction = null;
    this.lastUsedOrder = null;
  }
}
