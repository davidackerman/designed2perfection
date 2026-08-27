// High scores. Separate boards for normal and hard, since a hard-mode 20 is
// worth a great deal more than a normal-mode 20.
//
// Persistence goes through one small interface (read/write a plain object), so
// swapping localStorage for a shared backend later is a change to this file
// only -- see `LocalBackend` at the bottom.

import { CONFIG } from './config.js';

const VERSION = 1;
export const MODES = ['normal', 'hard', 'simon'];

function emptyData() {
  return {
    v: VERSION,
    boards: { normal: [], hard: [], simon: [] },
    deaths: {},        // action id -> how many runs it ended
    games: 0,
    actions: 0,        // lifetime successful commands
    lastName: '',
  };
}

export class ScoreStore {
  constructor(backend = new LocalBackend()) {
    this.backend = backend;
    this.data = this.load();
  }

  load() {
    const data = emptyData();
    const saved = this.backend.read();
    if (saved && saved.v === VERSION) {
      Object.assign(data, saved);
      data.boards = { normal: [], hard: [], simon: [], ...saved.boards };
      return data;
    }
    // First run: carry over the old single-value best, if there is one.
    const legacy = Number(localStorage.getItem(CONFIG.storage.best) || 0);
    if (legacy > 0) {
      data.boards.normal.push({ initials: '---', score: legacy, t: null });
    }
    return data;
  }

  save() {
    this.backend.write(this.data);
  }

  board(mode) {
    return this.data.boards[mode] || [];
  }

  best(mode) {
    const board = this.board(mode);
    return board.length ? board[0].score : 0;
  }

  get lastName() {
    return this.data.lastName;
  }

  /** Arcade rule: you must beat the bottom of a full board, not merely tie it. */
  qualifies(mode, score) {
    if (score <= 0) return false;
    const board = this.board(mode);
    if (board.length < CONFIG.scores.maxEntries) return true;
    return score > board[board.length - 1].score;
  }

  /**
   * Insert a run. Returns its rank index, or -1 if it didn't make the board.
   * Ties keep the earlier run higher -- first to get there owns the spot.
   */
  add(mode, initials, score) {
    if (!this.qualifies(mode, score)) return -1;
    const entry = { initials: normalizeInitials(initials), score, t: Date.now() };
    const board = this.board(mode);
    board.push(entry);
    board.sort((a, b) => b.score - a.score || (a.t || 0) - (b.t || 0));
    board.length = Math.min(board.length, CONFIG.scores.maxEntries);
    this.data.lastName = entry.initials;
    this.save();
    return board.indexOf(entry);
  }

  /** Called at the end of every run, whether or not it placed. */
  recordGame({ score, causeAction }) {
    this.data.games += 1;
    this.data.actions += score;
    if (causeAction) {
      this.data.deaths[causeAction] = (this.data.deaths[causeAction] || 0) + 1;
    }
    this.save();
  }

  /** The command that has ended the most runs. */
  nemesis() {
    const entries = Object.entries(this.data.deaths);
    if (!entries.length) return null;
    const [id, count] = entries.sort((a, b) => b[1] - a[1])[0];
    return { id, count };
  }

  stats() {
    return { games: this.data.games, actions: this.data.actions };
  }

  reset() {
    this.data = emptyData();
    localStorage.removeItem(CONFIG.storage.best);
    this.save();
  }
}

export function normalizeInitials(raw) {
  const cleaned = String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CONFIG.scores.initialsLength);
  return cleaned || '???';
}

class LocalBackend {
  read() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.storage.scores) || 'null');
    } catch {
      return null;
    }
  }

  write(data) {
    try {
      localStorage.setItem(CONFIG.storage.scores, JSON.stringify(data));
    } catch { /* private browsing: scores just won't persist */ }
  }
}
