// The bonus board: a Concentration-style memory match that runs live, side
// by side with Simon, on the number pad. It never ends on its own -- it just
// keeps producing bonus points (see onMatch) until the run itself does.
//
// Every card has two independent identities:
//  - `label`: always visible, face-down. What you dial to pick this card.
//  - `faceSymbol`: hidden until flipped. What has to match another card's.
// Round 1 makes those the same idea (dial 0-3, get shapes back) so the
// mechanic reads as trivial; round 2 splits them so memorizing "where"
// isn't the same as memorizing "what's under there" -- see config.js.

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

/** Which key(s) dial a label: a bare digit is itself + '0'; a letter is
 *  found on a phone key at some 1-based index -> that key + that index. */
function keysFor(label) {
  if (/^[0-9]$/.test(label)) return [label, '0'];
  for (const [key, letters] of Object.entries(CONFIG.bonus.phoneKeys)) {
    const i = letters.indexOf(label);
    if (i !== -1) return [key, String(i + 1)];
  }
  return null; // unreachable given how labels are generated
}

export class BonusGame {
  constructor({ ui, audio, onMatch }) {
    this.ui = ui;
    this.audio = audio;
    this.onMatch = onMatch;
    this.active = false;
    this.peeking = false;
    this.locked = false;
    this.pendingKey = null;
    this.roundIndex = 0;
    this.cards = [];
    this.revealedPositions = [];
    this.resolveTimer = null;
    this.peekTimer = null;
  }

  newRound(index) {
    const { size, kind } = roundFor(index);
    const n = size * size;
    const labels = kind === 'shapes'
      ? Array.from({ length: n }, (_, i) => String(i))
      : shuffled(ALNUM).slice(0, n);
    const faces = kind === 'shapes'
      ? pairedSymbols(SHAPES, n / 2)
      : pairedSymbols(ALNUM, n / 2);
    this.cards = labels.map((label, pos) => {
      const faceSymbol = faces[pos];
      let decoy = null;
      if (kind === 'alnum') {
        do { decoy = ALNUM[Math.floor(Math.random() * ALNUM.length)]; }
        while (decoy === faceSymbol || decoy === label);
      }
      return { pos, label, faceSymbol, decoy, revealed: false, matched: false };
    });
    this.size = size;
    this.kind = kind;
    this.revealedPositions = [];
    this.locked = false;
    this.pendingKey = null;
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
    this.pendingKey = null;
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

    let card;
    if (this.kind === 'shapes') {
      card = this.cards.find((c) => c.label === digit);
    } else {
      if (this.pendingKey === null) {
        this.pendingKey = digit;
        return;
      }
      const first = this.pendingKey;
      this.pendingKey = null;
      card = this.cards.find((c) => {
        const keys = keysFor(c.label);
        return keys && keys[0] === first && keys[1] === digit;
      });
    }
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
