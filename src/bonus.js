// The bonus board: a Concentration-style memory match that runs live, side
// by side with Simon, on the number pad. It never ends on its own -- it just
// keeps producing bonus points (see onMatch) until the run itself does.
//
// Round 1 (2x2, shapes) is dialed with one flat digit per card, 0-3, plain
// and sequential -- it's the trivial onboarding round. Round 2 on (4x4,
// alnum) is dialed with a row key then a column key, read off headers
// around the grid rather than printed on any card. Those headers are a
// random, non-repeating draw of phone-keypad keys, one random character
// (the bare digit, or one of its letters) per key -- see pickHeaderSet --
// so within either axis, no two headers ever share a key: a single
// keystroke per axis is always enough, no second "which letter on this
// key" digit needed, unlike a phone's own multi-tap entry.

import { CONFIG } from './config.js';

const SHAPES = ['●', '■', '▲', '◆'];
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
// Standard phone-keypad letter groups; 0 and 1 have none, so a header drawn
// from those keys can only ever be the bare digit.
const PHONE_KEYS = {
  0: '', 1: '', 2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL',
  6: 'MNO', 7: 'PQRS', 8: 'TUV', 9: 'WXYZ',
};

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

/** `size` headers, each on its own phone key (sampled without replacement,
 *  so a single keystroke always resolves unambiguously within this axis).
 *  Each header's displayed character is a random pick from that key's own
 *  digit plus whatever letters it has. */
function pickHeaderSet(size) {
  const keys = shuffled(Object.keys(PHONE_KEYS)).slice(0, size);
  return keys.map((key) => {
    const options = [key, ...PHONE_KEYS[key].split('')];
    const char = options[Math.floor(Math.random() * options.length)];
    return { key, char };
  });
}

export class BonusGame {
  constructor({ ui, audio, onMatch }) {
    this.ui = ui;
    this.audio = audio;
    this.onMatch = onMatch;
    this.active = false;
    this.peeking = false;
    this.locked = false;
    this.pendingRowKey = null;
    this.roundIndex = 0;
    this.cards = [];
    this.headers = [];     // shapes rounds: one flat digit label per card
    this.rowHeaders = [];  // alnum rounds: see pickHeaderSet
    this.colHeaders = [];
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
    if (kind === 'shapes') {
      this.headers = Array.from({ length: n }, (_, i) => String(i));
      this.rowHeaders = [];
      this.colHeaders = [];
    } else {
      this.headers = [];
      this.rowHeaders = pickHeaderSet(size);
      this.colHeaders = pickHeaderSet(size);
    }
    this.revealedPositions = [];
    this.locked = false;
    this.pendingRowKey = null;
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
    this.pendingRowKey = null;
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

  handleKey(digit) {
    if (!this.active || this.locked || this.peeking) return;

    if (this.kind === 'shapes') {
      const pos = this.headers.indexOf(digit);
      if (pos === -1) return;
      this.reveal(pos);
      return;
    }

    if (this.pendingRowKey === null) {
      this.pendingRowKey = digit;
      return;
    }
    const rowKey = this.pendingRowKey;
    const colKey = digit;
    this.pendingRowKey = null;
    const row = this.rowHeaders.findIndex((h) => h.key === rowKey);
    const col = this.colHeaders.findIndex((h) => h.key === colKey);
    if (row === -1 || col === -1) return;
    this.reveal(row * this.size + col);
  }

  reveal(pos) {
    const card = this.cards[pos];
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
    this.ui.renderBonusBoard({
      size: this.size,
      kind: this.kind,
      cards: this.cards,
      headers: this.headers,
      rowHeaders: this.rowHeaders,
      colHeaders: this.colHeaders,
      peeking: this.peeking,
    });
  }
}
