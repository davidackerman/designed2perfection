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
      scoreLabel: $('#scoreLabel'),
      score: $('#score'),
      round: $('#round'),
      best: $('#best'),
      bonusStat: $('#bonusStat'),
      bonus: $('#bonus'),
      modeBadge: $('#modeBadge'),
      muteBadge: $('#muteBadge'),
      title: $('#titleOverlay'),
      over: $('#overOverlay'),
      remap: $('#remapOverlay'),
      scores: $('#scoresOverlay'),
      overScore: $('#overScore'),
      overBest: $('#overBest'),
      overBestLine: $('#overBestLine'),
      overPlace: $('#overPlace'),
      overMode: $('#overMode'),
      overReason: $('#overReason'),
      overHeading: $('#overHeading'),
      overBoard: $('#overBoard'),
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
    this.simonPads = {
      push: $('#simonPadPush'),
      pull: $('#simonPadPull'),
      soap: $('#simonPadSoap'),
      swipe: $('#simonPadSwipe'),
    };
    this.flashTimer = null;
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
  }

  hideOverlays() {
    for (const key of OVERLAYS) this.el[key].classList.add('hidden');
    this.el.stage.classList.remove('idle');
  }

  setHud({ score, round, best, bonus, bonusMax }) {
    if (score !== undefined) this.el.score.textContent = score;
    if (round !== undefined) this.el.round.textContent = round;
    if (best !== undefined) this.el.best.textContent = best;
    if (bonus !== undefined || bonusMax !== undefined) {
      const b = bonus !== undefined ? bonus : this._bonus || 0;
      const bMax = bonusMax !== undefined ? bonusMax : this._bonusMax || 0;
      this._bonus = b;
      this._bonusMax = bMax;
      this.el.bonus.textContent = `${b}/${bMax}`;
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
    this.el.bonusStat.classList.toggle('hidden', !on);
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

  showGameOver({ score, best, reason, mode, board, rank, qualifies, defaultName }) {
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
    this.renderBoard(this.el.overBoard, qualifies && !board.length ? [] : board, rank);
    this.el.overBoard.classList.toggle('hidden', qualifies && !board.length);
    this.showOverlay('over');
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
