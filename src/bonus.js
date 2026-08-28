// The bonus board: runs live, side by side with Simon, on the number pad.
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
//
// Round 3 is the last stage: seven gray squares, never labeled, that spell
// a hidden word (JANELIA) once solved. Dial the phone key for each letter
// in order -- same shape as the title-screen password (per-square green,
// one mistake resets and flashes the whole thing red), except the word
// itself is never shown until you've actually gotten there. Solving it is
// worth a single flat bonus point and ends the progression; nothing comes
// after round 3.

import { CONFIG } from './config.js';

const SHAPES = ['●', '■', '▲', '◆'];
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
// Standard phone-keypad letter groups; 0 and 1 have none, so a header drawn
// from those keys can only ever be the bare digit.
const PHONE_KEYS = {
  0: '', 1: '', 2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL',
  6: 'MNO', 7: 'PQRS', 8: 'TUV', 9: 'WXYZ',
};

const JANELIA_WORD = 'JANELIA';
function keyForLetter(letter) {
  return Object.keys(PHONE_KEYS).find((key) => PHONE_KEYS[key].includes(letter));
}
const JANELIA_KEYS = JANELIA_WORD.split('').map(keyForLetter);

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
    this.roundActive = false; // has newRound() run for the current roundIndex yet
    this.cards = [];
    this.rowHeaders = [];  // alnum rounds: see pickHeaderSet
    this.colHeaders = [];
    this.janeliaProgress = 0;
    this.janeliaSolved = false;
    this.revealedPositions = [];
    this.resolveTimer = null;
    this.peekTimer = null;
  }

  newRound(index) {
    const { size, kind } = roundFor(index);
    this.size = size;
    this.kind = kind;
    this.revealedPositions = [];
    this.locked = false;
    this.pendingRowKey = null;
    this.roundActive = true;

    if (kind === 'janelia') {
      this.cards = [];
      this.janeliaProgress = 0;
      this.janeliaSolved = false;
      return;
    }

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
    if (kind === 'alnum') {
      this.rowHeaders = pickHeaderSet(size);
      this.colHeaders = pickHeaderSet(size);
    } else {
      this.rowHeaders = [];
      this.colHeaders = [];
    }
  }

  start() {
    this.stopTimers();
    this.active = true;
    this.peeking = false;
    if (!this.roundActive) this.newRound(this.roundIndex);
    this.render();
  }

  /** A different team: back to round 1 with a fresh board, mirroring
   *  SimonGame.newTeam() zeroing the same run's bonus count. A plain retry
   *  leaves the board exactly as it was -- see start(). */
  newTeam() {
    this.stopTimers();
    this.roundIndex = 0;
    this.roundActive = false;
    this.cards = [];
    this.revealedPositions = [];
    this.locked = false;
    this.pendingRowKey = null;
    this.janeliaProgress = 0;
    this.janeliaSolved = false;
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
    if (!this.active || this.peeking) return;

    if (this.kind === 'janelia') {
      this.handleJaneliaKey(digit);
      return;
    }
    if (this.locked) return;

    if (this.kind === 'shapes') {
      const pos = Number(digit);
      if (!Number.isInteger(pos) || pos < 0 || pos >= this.cards.length) return;
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

  /** Same shape as the title-screen password: dial the right key and this
   *  square goes green and stays that way; dial a wrong one and the whole
   *  row resets and flashes red, one mistake costing all the progress so
   *  far. The word itself never shows until every square is green. */
  handleJaneliaKey(digit) {
    if (this.janeliaSolved) return;

    if (digit === JANELIA_KEYS[this.janeliaProgress]) {
      this.janeliaProgress += 1;
      if (this.janeliaProgress === JANELIA_KEYS.length) {
        this.janeliaSolved = true;
        this.audio.playTone(880, 160); // same chime as a card match
        this.onMatch(); // a single flat bonus point, not one per letter
      } else {
        this.audio.playTone(520, 90); // same tone as a single card reveal
      }
    } else {
      this.janeliaProgress = 0;
      this.audio.playTone(140, 240); // same tone as a card mismatch
      this.ui.flashJaneliaWrong();
    }
    this.render();
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

  /** The 911 cheat: every unmatched card flips face-up for a beat (or, in
   *  round 3, every square shows its letter), purely a look -- no
   *  reveal/matched/progress state actually changes underneath it. */
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
    if (this.kind === 'janelia') {
      this.ui.renderJanelia({
        word: JANELIA_WORD,
        progress: this.janeliaProgress,
        solved: this.janeliaSolved,
        peeking: this.peeking,
      });
      return;
    }
    this.ui.renderBonusBoard({
      size: this.size,
      kind: this.kind,
      cards: this.cards,
      rowHeaders: this.rowHeaders,
      colHeaders: this.colHeaders,
      peeking: this.peeking,
    });
  }
}
