// All DOM writes live here; game.js stays free of element ids.

import { Input } from './input.js';

const $ = (sel) => document.querySelector(sel);

const OVERLAYS = ['title', 'over', 'remap', 'scores'];

// The classic game is about getting through a door, so "you did not get in"
// is the joke. Simon isn't -- you just lost the thread of the sequence.
const OVER_HEADINGS = {
  simon: 'OUT OF SEQUENCE',
  normal: 'YOU DID NOT GET IN',
  hard: 'YOU DID NOT GET IN',
};

// What each Simon pad is called in the game-over recap.
const PAD_LABEL = { push: 'PUSH', pull: 'PULL', soap: 'SOAP', swipe: 'SWIPE' };

const ORDINALS = ['1st', '2nd', '3rd'];
const place = (rank) => ORDINALS[rank] || `${rank + 1}th`;

function formatDate(t) {
  if (!t) return '';
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export class UI {
  constructor() {
    this.el = {
      stage: $('#stage'),
      placard: $('#placard'),
      image: $('#stageImage'),
      word: $('#stageWord'),
      timerFill: $('#timerFill'),
      scoreStat: $('#scoreStat'),
      scoreLabel: $('#scoreLabel'),
      score: $('#score'),
      scoreHeading: $('#scoreHeading'),
      round: $('#round'),
      best: $('#best'),
      totalStat: $('#totalStat'),
      total: $('#total'),
      totalScore: $('#totalScore'),
      totalBonus: $('#totalBonus'),
      bonusHeading: $('#bonusHeading'),
      bonusBoard: $('#bonusBoard'),
      modeBadge: $('#modeBadge'),
      muteBadge: $('#muteBadge'),
      title: $('#titleOverlay'),
      titleCard: document.querySelector('#titleOverlay .card'),
      over: $('#overOverlay'),
      remap: $('#remapOverlay'),
      scores: $('#scoresOverlay'),
      answerToast: $('#answerToast'),
      overScore: $('#overScore'),
      overBest: $('#overBest'),
      overBestLine: $('#overBestLine'),
      overPlace: $('#overPlace'),
      overMode: $('#overMode'),
      overReason: $('#overReason'),
      overHeading: $('#overHeading'),
      overBoard: $('#overBoard'),
      overSequence: $('#overSequence'),
      entryRow: $('#entryRow'),
      initials: $('#initials'),
      scoresBoard: $('#scoresBoard'),
      scoresStats: $('#scoresStats'),
      tabNormal: $('#tabNormal'),
      tabHard: $('#tabHard'),
      tabSimon: $('#tabSimon'),
      hardToggle: $('#hardToggle'),
      bindingList: $('#bindingList'),
      debugBar: $('#debugBar'),
      debugKeys: $('#debugKeys'),
      debugExpected: $('#debugExpected'),
      keyHint: $('#keyHint'),
      keyHintKey: $('#keyHintKey'),
      keyHintSlot: $('#keyHintSlot'),
      debugLast: $('#debugLast'),
    };
    // The four marked characters in the title that spell out the number-pad
    // code, in reading order -- see index.html. Index lines up with the code
    // string in main.js.
    this.titleCodeDigits = Array.from(document.querySelectorAll('#titleHeading .code-digit'));
    // The rest of the title ("nc", "n", "eni", "nt"), grouped between the
    // code digits -- greened out too once the whole code is right.
    this.titleFillerEls = Array.from(document.querySelectorAll('#titleHeading .code-filler'));
    this.simonPads = {
      push: $('#simonPadPush'),
      pull: $('#simonPadPull'),
      soap: $('#simonPadSoap'),
      swipe: $('#simonPadSwipe'),
    };
    this.flashTimer = null;
    this.titleShakeTimer = null;
    this.hintFrame = null;
    this.debug = false;
    this.chips = new Map();      // slot id -> chip element
    this.chipTimers = new Map();
    this.keyFor = () => null;    // set by main.js so chips track re-binds
  }

  showOverlay(name) {
    for (const key of OVERLAYS) {
      this.el[key].classList.toggle('hidden', key !== name);
    }
    this.el.stage.classList.toggle('idle', name !== null);
    if (name === 'title') this.startTitleHint();
  }

  /** A minute of the title sitting untouched, then over the following minute
   *  the code digits grow to 1.5x and the rest of the word shrinks to 0.5x --
   *  an increasingly obvious nudge for a team that's stuck. Restarts every
   *  time the title is (re)shown; stops itself once it's hidden again. */
  startTitleHint() {
    const shownAt = Date.now();
    cancelAnimationFrame(this.hintFrame);
    const HINT_DELAY_MS = 60000;
    const HINT_RAMP_MS = 60000;
    const tick = () => {
      if (this.el.title.classList.contains('hidden')) return; // left the title
      const elapsed = Date.now() - shownAt;
      const progress = Math.min(1, Math.max(0, (elapsed - HINT_DELAY_MS) / HINT_RAMP_MS));
      this.el.title.style.setProperty('--hint-progress', progress);
      this.hintFrame = requestAnimationFrame(tick);
    };
    this.el.title.style.setProperty('--hint-progress', 0);
    this.hintFrame = requestAnimationFrame(tick);
  }

  hideOverlays() {
    for (const key of OVERLAYS) this.el[key].classList.add('hidden');
    this.el.stage.classList.remove('idle');
  }

  /** Score and Bonus each live over their own half of the Simon screen (see
   *  the .panel-heading spans) instead of the top HUD -- Total, up top, is
   *  just the two of them added together, recomputed here from whichever
   *  one just changed so callers never have to compute it themselves. */
  setHud({ score, round, best, bonus, bonusMax, total }) {
    if (score !== undefined) {
      this.el.score.textContent = score;
      this.el.scoreHeading.textContent = score;
      this._score = score;
    }
    if (round !== undefined) this.el.round.textContent = round;
    if (best !== undefined) this.el.best.textContent = best;
    if (bonus !== undefined || bonusMax !== undefined) {
      const b = bonus !== undefined ? bonus : this._bonus || 0;
      const bMax = bonusMax !== undefined ? bonusMax : this._bonusMax || 0;
      this._bonus = b;
      this._bonusMax = bMax;
      this.el.bonusHeading.textContent = `${b}/${bMax}`;
    }
    if (total !== undefined) {
      this.el.total.textContent = total;
    } else if (score !== undefined || bonus !== undefined) {
      const s = this._score || 0;
      const b = this._bonus || 0;
      this.el.totalScore.textContent = s;
      this.el.totalBonus.textContent = b;
      this.el.total.textContent = s + b;
    }
  }

  setScoreLabel(text) {
    this.el.scoreLabel.textContent = text;
  }

  /** Toggles the stage between the two-panel classic layout (image + word
   *  video) and Simon's single flashing pad, and shows/hides the HUD bits
   *  that only make sense in one mode or the other. */
  setSimonMode(on) {
    this.el.stage.classList.toggle('simon-mode', on);
    this.el.scoreStat.classList.toggle('hidden', on); // moves to the Score panel heading instead
    this.el.totalStat.classList.toggle('hidden', !on);
    this.el.modeBadge.classList.toggle('hidden', on);
  }

  setHardMode(on) {
    this.el.modeBadge.textContent = on ? 'HARD' : 'NORMAL';
    this.el.modeBadge.classList.toggle('hard', on);
    this.el.hardToggle.textContent = on ? 'ON' : 'OFF';
    this.el.hardToggle.classList.toggle('on', on);
  }

  setMuted(muted) {
    this.el.muteBadge.textContent = muted ? 'MUTED' : 'SOUND';
    this.el.muteBadge.classList.toggle('off', muted);
    this.el.word.muted = muted;
  }

  // ---- debug mode -------------------------------------------------------

  setDebug(on, slots) {
    this.debug = on;
    this.el.debugBar.classList.toggle('hidden', !on);
    // Also gates the title screen's buttons/hints -- see main.css.
    document.body.classList.toggle('debug-mode', on);
    if (on) this.renderDebugKeys(slots);
  }

  /** One chip per control, showing the key it currently listens for. */
  renderDebugKeys(slots) {
    this.el.debugKeys.innerHTML = '';
    this.chips.clear();
    for (const slot of slots) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      const key = this.keyFor(slot.id);
      chip.innerHTML =
        `<b>${key ? Input.keyName(key) : '--'}</b><span>${slot.short}</span>`;
      this.el.debugKeys.appendChild(chip);
      this.chips.set(slot.id, chip);
    }
  }

  /** Light up the chip for a press; also log the raw code, bound or not. */
  markKey({ code, slot }) {
    if (!this.debug) return;
    const name = Input.keyName(code);
    this.el.debugLast.innerHTML = slot
      ? `<b>${name}</b> <span class="ok">${slot}</span> <span class="dim">${code}</span>`
      : `<b>${name}</b> <span class="no">unbound</span> <span class="dim">${code}</span>`;
    const chip = slot && this.chips.get(slot);
    if (!chip) return;
    chip.classList.remove('hit');
    void chip.offsetWidth;
    chip.classList.add('hit');
    clearTimeout(this.chipTimers.get(slot));
    this.chipTimers.set(slot, setTimeout(() => chip.classList.remove('hit'), 220));
  }

  setDebugExpected(ch) {
    this.lastCh = ch;
    this.renderDebugExpected();
  }

  setDebugProgress(done, required) {
    this.renderDebugExpected(required > 1 ? `${done}/${required}` : null);
  }

  renderDebugExpected(progress = null) {
    if (!this.debug) {
      this.el.keyHint.classList.add('hidden');
      return;
    }
    const ch = this.lastCh;
    if (!ch) {
      this.el.debugExpected.innerHTML = '<span class="dim">--</span>';
      this.el.keyHint.classList.add('hidden');
      return;
    }
    const slot = `${ch.action.id}:${ch.variantId}`;
    const key = this.keyFor(slot);
    const keyName = key ? Input.keyName(key) : '--';
    const hits = ch.requiredHits > 1 ? ` &times;${ch.requiredHits}` : '';
    const lying = ch.wordIsLying ? ' <span class="no">word lies</span>' : '';
    const done = progress ? ` <span class="ok">${progress}</span>` : '';

    this.el.debugExpected.innerHTML =
      `<b>${keyName}</b>${hits} <span class="dim">${slot}</span>${lying}${done}`;

    // Same answer, but on the stage: press this.
    this.el.keyHintKey.textContent = keyName;
    this.el.keyHintKey.classList.toggle('wide', keyName.length > 2);
    this.el.keyHintSlot.innerHTML = progress
      ? `${slot} <span class="ok">${progress}</span>`
      : `${slot}${hits}`;
    this.el.keyHint.classList.remove('hidden');
  }

  showChallenge(ch) {
    this.el.image.src = ch.image;
    this.el.image.alt = ch.action.id;
    if (this.el.word.getAttribute('src') === ch.video) {
      this.el.word.currentTime = 0;
    } else {
      this.el.word.src = ch.video;
    }
    this.el.word.play().catch(() => {}); // autoplay-with-sound can be blocked; fail silently
    if (ch.placard) {
      this.el.placard.textContent = ch.placard;
      this.el.placard.classList.remove('hidden');
    } else {
      this.el.placard.classList.add('hidden');
    }
    this.el.stage.classList.remove('blank');
    this.setDebugExpected(ch);
  }

  clearChallenge() {
    this.el.stage.classList.add('blank');
    this.el.placard.classList.add('hidden');
    this.el.word.pause();
    this.setDebugExpected(null);
  }

  /** Brighten one pad -- whether the game is playing it back
   *  or you just pressed its control, it lights up the same way.
   *
   *  `press` additionally restarts the hit animation. Playback always has a
   *  dark gap between steps, so two of the same pad in a row read as two
   *  flashes for free; presses don't, and toggling a class that's already on
   *  is a no-op, so pressing the same pad twice quickly used to look like one
   *  long glow -- i.e. like the second press never registered. */
  flashSimonStep(actionId, { press = false } = {}) {
    for (const [id, el] of Object.entries(this.simonPads)) {
      const on = id === actionId;
      el.classList.toggle('active', on);
      if (!on) el.classList.remove('hit');
    }
    const el = this.simonPads[actionId];
    if (!press || !el) return;
    el.classList.remove('hit');
    void el.offsetWidth; // force reflow so the animation retriggers
    el.classList.add('hit');
  }

  clearSimonStep() {
    for (const el of Object.values(this.simonPads)) el.classList.remove('active', 'hit');
  }

  /** Debug mode only: which key(s) resolve the pad Simon is currently
   *  waiting on, plus how far through the sequence you are. `step` is
   *  `{ actionId, slots, index, total }` or null between/outside rounds. */
  setSimonDebugStep(step) {
    this.lastSimonStep = step;
    this.renderSimonDebugStep();
  }

  renderSimonDebugStep() {
    if (!this.debug) {
      this.el.keyHint.classList.add('hidden');
      return;
    }
    const step = this.lastSimonStep;
    if (!step) {
      this.el.debugExpected.innerHTML = '<span class="dim">--</span>';
      this.el.keyHint.classList.add('hidden');
      return;
    }
    const keyName = step.slots
      .map((slot) => this.keyFor(slot))
      .map((key) => (key ? Input.keyName(key) : '--'))
      .join(' / ');
    const progress = ` <span class="ok">${step.index}/${step.total}</span>`;

    this.el.debugExpected.innerHTML = `<b>${keyName}</b> <span class="dim">${step.actionId}</span>${progress}`;
    this.el.keyHintKey.textContent = keyName;
    this.el.keyHintKey.classList.toggle('wide', keyName.length > 2);
    this.el.keyHintSlot.innerHTML = `${step.actionId}${progress}`;
    this.el.keyHint.classList.remove('hidden');
  }

  setTimer(fraction) {
    const pct = Math.max(0, Math.min(1, fraction)) * 100;
    this.el.timerFill.style.width = `${pct}%`;
    this.el.timerFill.classList.toggle('critical', fraction < 0.25);
  }

  flash(kind) {
    const stage = this.el.stage;
    stage.classList.remove('flash-good', 'flash-bad', 'flash-nothing', 'flash-deny');
    // Force reflow so the same flash can retrigger back to back.
    void stage.offsetWidth;
    stage.classList.add(`flash-${kind}`);
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      stage.classList.remove(`flash-${kind}`);
    }, 260);
  }

  /** Title screen's number-pad code, entered instead of pressing Start: each
   *  correct digit turns its character in the title green and stays that
   *  way. Nothing marks a wrong digit individually -- see flashTitleWrong. */
  markTitleDigitGood(index) {
    const el = this.titleCodeDigits[index];
    if (!el) return;
    el.classList.remove('code-bad');
    el.classList.add('code-good');
  }

  /** The "wrong digit" cue for the title screen: the whole card shakes and
   *  the title word turns solid red for the beat, covering over whatever
   *  digits were green -- not just the offending one (caller also clears
   *  progress -- see resetTitleDigits). Pressing a control instead of a
   *  digit gets only the wrong sound, not this -- see main.js's
   *  handleAction -- so the two mistakes don't look identical. */
  flashTitleWrong() {
    const card = this.el.titleCard;
    card.classList.remove('wrong-shake');
    void card.offsetWidth; // reflow, so back-to-back mistakes each re-shake
    card.classList.add('wrong-shake');
    clearTimeout(this.titleShakeTimer);
    this.titleShakeTimer = setTimeout(() => card.classList.remove('wrong-shake'), 500);
  }

  resetTitleDigits() {
    for (const el of this.titleCodeDigits) el.classList.remove('code-good', 'code-bad');
    for (const el of this.titleFillerEls) el.classList.remove('code-good');
  }

  /** The whole code is right: green the rest of the title too, so the entire
   *  word reads as done rather than just the four marked digits. */
  markTitleAllGood() {
    for (const el of this.titleFillerEls) el.classList.add('code-good');
  }

  /** A pair of doors sweeping open over whatever's about to appear
   *  underneath -- call this right as the real transition (start()) happens,
   *  so what's revealed as they part is the game already set up behind them.
   *  Purely a temporary full-screen element; doesn't touch overlay state. */
  playDoorOpen() {
    const wrap = document.createElement('div');
    wrap.className = 'door-open';
    wrap.innerHTML = '<div class="door-panel door-panel-left"></div><div class="door-panel door-panel-right"></div>';
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('opening'));
    setTimeout(() => wrap.remove(), 700);
  }

  /** The 911 easter egg: a brief, self-dismissing popup -- for whoever's
   *  running the cabinet, not a real in-game element. Not part of the
   *  overlay system: doesn't pause or block anything, just fades on its
   *  own after `ms`. Retriggering (a second 911 mid-toast) restarts the
   *  clock rather than stacking. */
  showAnswerToast(label, value, ms = 3000) {
    const el = this.el.answerToast;
    el.innerHTML = `<span class="answer-toast-label">${label}</span><span class="answer-toast-value">${value}</span>`;
    el.classList.remove('hidden');
    clearTimeout(this.answerToastTimer);
    this.answerToastTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  /** The bonus board: rebuilt from scratch every call, same as renderBoard/
   *  renderBindings below -- there are at most 16 cards, so there's no need
   *  to diff. Cards never show their own address -- a card is just a card,
   *  no printed hint on it. `peeking` (the 911 cheat) shows every unmatched
   *  card's face without touching its real revealed/matched state.
   *
   *  'shapes' rounds are just the 2x2 of cards, nothing else -- no captions,
   *  no headers, you dial 0-3 and work out which is which by watching what
   *  flips. 'alnum' rounds get shared row/column headers around the grid,
   *  since a blind 4x4 would be unreasonable -- see BonusGame.handleKey/
   *  pickHeaderSet. */
  renderBonusBoard({ size, kind, cards, rowHeaders, colHeaders, peeking }) {
    const el = this.el.bonusBoard;
    el.style.setProperty('--bonus-size', size);
    el.classList.toggle('bonus-board-flat', kind === 'shapes');
    const cardHtml = (card) => {
      const flipped = peeking || card.revealed || card.matched;
      const cls = ['bonus-card', flipped && 'flipped', card.matched && 'matched']
        .filter(Boolean)
        .join(' ');
      const decoy = card.decoy ? `<span class="decoy">${card.decoy}</span>` : '';
      return (
        `<div class="${cls}"><div class="bonus-card-inner">` +
        `<div class="bonus-card-back">${decoy}</div>` +
        `<div class="bonus-card-face">${card.faceSymbol}</div>` +
        '</div></div>'
      );
    };
    let html;
    if (kind === 'shapes') {
      html = cards.map(cardHtml).join('');
    } else {
      const header = (h) => `<div class="bonus-header">${h.char}</div>`;
      html = '<div class="bonus-corner"></div>' + colHeaders.map(header).join('');
      for (let r = 0; r < size; r++) {
        html += header(rowHeaders[r]);
        for (let c = 0; c < size; c++) html += cardHtml(cards[r * size + c]);
      }
    }
    el.innerHTML = html;
  }

  /** Render one board as a table; `highlight` marks the run just played. */
  renderBoard(target, entries, highlight = -1) {
    if (!entries.length) {
      target.innerHTML = '<p class="board-empty">No scores yet.</p>';
      return;
    }
    const rows = entries
      .map((e, i) => {
        const cls = i === highlight ? ' class="new"' : '';
        return (
          `<tr${cls}><td class="rank">${i + 1}</td>` +
          `<td class="who">${e.initials}</td>` +
          `<td class="pts">${e.score}</td>` +
          `<td class="when">${formatDate(e.t)}</td></tr>`
        );
      })
      .join('');
    target.innerHTML = `<table class="board"><tbody>${rows}</tbody></table>`;
  }

  showGameOver({ score, best, reason, mode, board, rank, qualifies, defaultName, sequence, pressed }) {
    this.setDebugExpected(null);   // the round is over; don't leave the hint up
    this.el.overScore.textContent = score;
    this.el.overBest.textContent = best;
    this.el.overReason.textContent = reason;
    this.el.overMode.textContent = mode;
    this.el.overHeading.textContent = OVER_HEADINGS[mode] || OVER_HEADINGS.simon;
    this.el.overPlace.innerHTML =
      rank >= 0
        ? `<b class="accent">${place(rank)}</b> on the ${mode} board`
        : qualifies
          ? 'That makes the board.'
          : 'Not good enough for the board.';

    // While the initials form is up, the best/board lines are about to change
    // anyway -- one less thing competing with the input for attention.
    this.el.entryRow.classList.toggle('hidden', !qualifies);
    this.el.overBestLine.classList.toggle('hidden', qualifies);
    if (qualifies) {
      this.el.initials.value = defaultName || '';
      // Autofocus so you can just type and hit Enter.
      setTimeout(() => this.el.initials.focus(), 0);
    }
    this.renderSequenceRecap(sequence, pressed);
    this.renderBoard(this.el.overBoard, qualifies && !board.length ? [] : board, rank);
    this.el.overBoard.classList.toggle('hidden', qualifies && !board.length);
    this.showOverlay('over');
  }

  /** Simon only: the round you died on laid out against what you actually
   *  pressed, one column per step so the two rows line up and the divergence
   *  is visible instead of remembered. Classic passes no sequence and gets
   *  nothing. */
  renderSequenceRecap(sequence, pressed = []) {
    const el = this.el.overSequence;
    if (!sequence || !sequence.length) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    // One shared column track per step, so "You" sits under "Sequence".
    el.style.setProperty('--steps', sequence.length);
    const wrongAt = sequence.findIndex((id, i) => i < pressed.length && pressed[i] !== id);
    const cell = (id, i) => {
      // &nbsp; so a step you never reached still has a text line's height and
      // the two rows stay level.
      if (!id) return '<span class="seq-cell seq-none">&nbsp;</span>';
      const bad = i === wrongAt ? ' bad' : '';
      return `<span class="seq-cell seq-${id}${bad}">${PAD_LABEL[id] || id}</span>`;
    };
    el.innerHTML =
      '<span class="seq-label">Wanted</span>' +
      sequence.map(cell).join('') +
      '<span class="seq-label">You</span>' +
      sequence.map((_, i) => cell(pressed[i], i)).join('');
    el.classList.remove('hidden');
  }

  /** After the initials are saved: swap the form out for the placement line. */
  confirmEntry({ mode, board, rank, best }) {
    this.el.entryRow.classList.add('hidden');
    this.el.overBestLine.classList.remove('hidden');
    this.el.overBoard.classList.remove('hidden');
    this.el.overBest.textContent = best;
    this.el.overPlace.innerHTML = `<b class="accent">${place(rank)}</b> on the ${mode} board`;
    this.renderBoard(this.el.overBoard, board, rank);
  }

  showScores({ mode, board, stats, nemesis }) {
    this.el.tabNormal.classList.toggle('on', mode === 'normal');
    this.el.tabHard.classList.toggle('on', mode === 'hard');
    this.el.tabSimon.classList.toggle('on', mode === 'simon');
    this.renderBoard(this.el.scoresBoard, board);
    const bits = [`${stats.games} run${stats.games === 1 ? '' : 's'}`,
                  `${stats.actions} commands survived`];
    if (nemesis) bits.push(`most often undone by <b>${nemesis.id.toUpperCase()} IT</b> (${nemesis.count}&times;)`);
    this.el.scoresStats.innerHTML = bits.join(' · ');
    this.showOverlay('scores');
  }

  /** Render the remap screen. `onRebind(slot)` is called when a row is clicked. */
  renderBindings(slots, input, onRebind, capturingSlot = null) {
    this.el.bindingList.innerHTML = '';
    for (const slot of slots) {
      const row = document.createElement('button');
      row.className = 'binding';
      row.type = 'button';
      const capturing = capturingSlot === slot.id;
      if (capturing) row.classList.add('capturing');
      const key = input.keyFor(slot.id);
      row.innerHTML =
        `<span class="binding-label">${slot.label}</span>` +
        `<span class="binding-key">${capturing ? 'press a key…' : Input.keyName(key)}</span>`;
      row.addEventListener('click', () => onRebind(slot.id));
      this.el.bindingList.appendChild(row);
    }
  }
}
