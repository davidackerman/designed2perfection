// All DOM writes live here; game.js stays free of element ids.

import { Input } from './input.js';

const $ = (sel) => document.querySelector(sel);

export class UI {
  constructor() {
    this.el = {
      stage: $('#stage'),
      placard: $('#placard'),
      image: $('#stageImage'),
      word: $('#stageWord'),
      timerFill: $('#timerFill'),
      score: $('#score'),
      round: $('#round'),
      best: $('#best'),
      modeBadge: $('#modeBadge'),
      muteBadge: $('#muteBadge'),
      title: $('#titleOverlay'),
      over: $('#overOverlay'),
      remap: $('#remapOverlay'),
      overScore: $('#overScore'),
      overBest: $('#overBest'),
      overReason: $('#overReason'),
      hardToggle: $('#hardToggle'),
      debugToggle: $('#debugToggle'),
      bindingList: $('#bindingList'),
      debugBar: $('#debugBar'),
      debugKeys: $('#debugKeys'),
      debugExpected: $('#debugExpected'),
      debugLast: $('#debugLast'),
    };
    this.flashTimer = null;
    this.debug = false;
    this.chips = new Map();      // slot id -> chip element
    this.chipTimers = new Map();
    this.keyFor = () => null;    // set by main.js so chips track re-binds
  }

  showOverlay(name) {
    for (const key of ['title', 'over', 'remap']) {
      this.el[key].classList.toggle('hidden', key !== name);
    }
    this.el.stage.classList.toggle('idle', name !== null);
  }

  hideOverlays() {
    for (const key of ['title', 'over', 'remap']) this.el[key].classList.add('hidden');
    this.el.stage.classList.remove('idle');
  }

  setHud({ score, round, best }) {
    if (score !== undefined) this.el.score.textContent = score;
    if (round !== undefined) this.el.round.textContent = round;
    if (best !== undefined) this.el.best.textContent = best;
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
  }

  // ---- debug mode -------------------------------------------------------

  setDebug(on, slots) {
    this.debug = on;
    this.el.debugBar.classList.toggle('hidden', !on);
    this.el.debugToggle.textContent = on ? 'ON' : 'OFF';
    this.el.debugToggle.classList.toggle('on', on);
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
    if (!this.debug) return;
    const ch = this.lastCh;
    if (!ch) {
      this.el.debugExpected.innerHTML = '<span class="dim">--</span>';
      return;
    }
    const slot = `${ch.action.id}:${ch.variantId}`;
    const key = this.keyFor(slot);
    const hits = ch.requiredHits > 1 ? ` &times;${ch.requiredHits}` : '';
    const lying = ch.wordIsLying ? ' <span class="no">word lies</span>' : '';
    const done = progress ? ` <span class="ok">${progress}</span>` : '';
    this.el.debugExpected.innerHTML =
      `<b>${key ? Input.keyName(key) : '--'}</b>${hits} <span class="dim">${slot}</span>${lying}${done}`;
  }

  showChallenge(ch) {
    this.el.image.src = ch.image;
    this.el.image.alt = ch.action.id;
    this.el.word.textContent = ch.word;
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
    this.setDebugExpected(null);
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

  showGameOver({ score, best, reason }) {
    this.el.overScore.textContent = score;
    this.el.overBest.textContent = best;
    this.el.overReason.textContent = reason;
    this.showOverlay('over');
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
