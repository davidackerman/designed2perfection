// The reference "Aaronson Oracle" (see aaronsonoracle.com for the writeup
// this follows): an n-gram frequency model with backoff. For each context
// length 0..maxOrder it keeps a notebook of what bit followed that exact
// run before. To predict, it starts at the longest context and asks "have I
// seen this at least twice, and did it not go both ways equally?" -- if not,
// it gives up on that question and asks a shorter, less specific one, down
// to the empty context. If nothing ever qualifies, it flips a coin.
//
// This is what drives round speed. An ensemble predictor (src/predictor.js)
// runs alongside it in shadow for a debug-mode comparison, but this kept
// winning in practice testing, so it's the only one that affects gameplay.

export class AaronsonOracle {
  constructor({ maxOrder = 5 } = {}) {
    this.maxOrder = maxOrder;
    this.history = [];
    this.tables = Array.from({ length: maxOrder + 1 }, () => new Map()); // context -> [count0, count1]
    this.correct = 0;
    this.total = 0;
    this.lastPrediction = null;
  }

  contextKey(order) {
    return order === 0 ? '' : this.history.slice(-order).join('');
  }

  countsFor(order) {
    return this.tables[order].get(this.contextKey(order)) || [0, 0];
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

    // One press, every context length gets an entry: the full run down to
    // no context at all. A context of length n needs n prior bits to exist.
    for (let order = 0; order <= Math.min(this.maxOrder, this.history.length); order++) {
      const table = this.tables[order];
      const key = this.contextKey(order);
      if (!table.has(key)) table.set(key, [0, 0]);
      table.get(key)[actual] += 1;
    }

    if (this.lastPrediction) {
      if (this.lastPrediction.choice === actual) this.correct++;
      this.total++;
    }

    this.history.push(actual);
    this.lastPrediction = null;
  }

  /** Cumulative accuracy since the run started -- the only accuracy number
   *  this game uses; everywhere it's shown or acted on is this same value. */
  accuracy() {
    return this.total ? this.correct / this.total : 0;
  }

  reset() {
    this.history = [];
    this.tables = Array.from({ length: this.maxOrder + 1 }, () => new Map());
    this.correct = 0;
    this.total = 0;
    this.lastPrediction = null;
  }
}
