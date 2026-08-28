// The bonus board: a Concentration-style memory match that runs live, side
// by side with Simon, on the number pad. It never ends on its own -- it just
// keeps producing bonus points (see onMatch) until the run itself does.
//
// Cards never carry their own address -- that would give away that a card
// is "special" before it's even flipped, which doesn't read as a real
// face-down card. Instead the grid's row/column headers (see UI.
// renderBonusBoard) are what you dial: a row digit, then a column digit,
// the same two-key shape for every round regardless of size.

import { CONFIG } from './config.js';

const SHAPES = ['●', '■', '▲', '◆'];
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pairedSymbols(pool, pairCount) {
  const picked = shuffled(pool).slice(0, pairCount);
  return shuffled([...picked, ...picked]);
}

function roundFor(index) {
  const rounds = CONFIG.bonus.rounds;
  return rounds[Math.min(index, rounds.length - 1)];
}

export class BonusGame {
  constructor({ ui, audio, onMatch }) {
    this.ui = ui;
    this.audio = audio;
    this.onMatch = onMatch;
    this.active = false;
    this.peeking = false;
    this.locked = false;
    this.pendingRow = null;
    this.roundIndex = 0;
    this.cards = [];
    this.revealedPositions = [];
    this.resolveTimer = null;
    this.peekTimer = null;
  }

  newRound(index) {
    const { size, kind } = roundFor(index);
    const n = size * size;
    const faces = kind === 'shapes'
      ? pairedSymbols(SHAPES, n / 2)
      : pairedSymbols(ALNUM, n / 2);
    this.cards = faces.map((faceSymbol, pos) => {
      let decoy = null;
      if (kind === 'alnum') {
        do { decoy = ALNUM[Math.floor(Math.random() * ALNUM.length)]; }
        while (decoy === faceSymbol);
      }
      return { pos, faceSymbol, decoy, revealed: false, matched: false };
    });
    this.size = size;
    this.kind = kind;
    this.revealedPositions = [];
    this.locked = false;
    this.pendingRow = null;
  }

  start() {
    this.stopTimers();
    this.active = true;
    this.peeking = false;
    if (!this.cards.length) this.newRound(this.roundIndex);
    this.render();
  }

  /** A different team: back to round 1 with a fresh board, mirroring
   *  SimonGame.newTeam() zeroing the same run's bonus count. A plain retry
   *  leaves the board exactly as it was -- see start(). */
  newTeam() {
    this.stopTimers();
    this.roundIndex = 0;
    this.cards = [];
    this.revealedPositions = [];
    this.locked = false;
    this.pendingRow = null;
  }

  abort() {
    this.stopTimers();
    this.active = false;
    this.peeking = false;
  }

  pause() {
    if (!this.active) return;
    this.stopTimers();
  }

  resume() {
    if (!this.active) return;
    this.render();
  }

  stopTimers() {
    clearTimeout(this.resolveTimer);
    this.resolveTimer = null;
    clearTimeout(this.peekTimer);
    this.peekTimer = null;
  }

  /** Every round is dialed the same way: a row digit, then a column digit --
   *  see the grid headers UI.renderBonusBoard draws around the board. */
  handleKey(digit) {
    if (!this.active || this.locked || this.peeking) return;

    if (this.pendingRow === null) {
      this.pendingRow = digit;
      return;
    }
    const row = Number(this.pendingRow);
    const col = Number(digit);
    this.pendingRow = null;
    if (row >= this.size || col >= this.size) return; // not a real row/column for this round

    const card = this.cards[row * this.size + col];
    if (!card || card.matched || card.revealed) return;

    card.revealed = true;
    this.revealedPositions.push(card.pos);
    this.render();

    if (this.revealedPositions.length === 1) {
      this.audio.playTone(520, 90);
      return;
    }

    this.locked = true;
    const [aPos, bPos] = this.revealedPositions;
    const a = this.cards.find((c) => c.pos === aPos);
    const b = this.cards.find((c) => c.pos === bPos);
    const isMatch = a.faceSymbol === b.faceSymbol;
    this.audio.playTone(isMatch ? 880 : 140, isMatch ? 160 : 240);

    this.resolveTimer = setTimeout(() => {
      if (isMatch) {
        a.matched = true;
        b.matched = true;
        this.onMatch();
      } else {
        a.revealed = false;
        b.revealed = false;
      }
      this.revealedPositions = [];
      this.locked = false;
      if (isMatch && this.cards.every((c) => c.matched)) {
        this.roundIndex += 1;
        this.newRound(this.roundIndex);
      }
      this.render();
    }, CONFIG.bonus.resultHoldMs);
  }

  /** The 911 cheat: every unmatched card flips face-up for a beat, purely a
   *  look -- no reveal/matched state actually changes underneath it. */
  peekAll(ms = CONFIG.bonus.peekMs) {
    if (!this.active) return;
    this.peeking = true;
    this.render();
    clearTimeout(this.peekTimer);
    this.peekTimer = setTimeout(() => {
      this.peeking = false;
      this.render();
    }, ms);
  }

  render() {
    if (!this.active) return;
    this.ui.renderBonusBoard({ size: this.size, cards: this.cards, peeking: this.peeking });
  }
}
