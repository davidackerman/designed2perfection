// inconvenient3.html's own minigame: a ZType-style shooter live in the left
// half, opposite Simon. AI logos fall toward the cursor "ship" at the bottom;
// you shoot letters off a ship by dialing the phone-keypad key for each one,
// in order, same key-for-letter idea as JANELIA in bonus.js. Only one ship
// is ever "live" for input at a time -- see handleKey -- and no two ships
// on screen ever want the same next key, so every keystroke is unambiguous.
//
// Scoring itself (current-run count, best, resets on a miss) lives in
// main3.js, not here -- this class only reports onDestroy()/onMiss() events,
// same shape as BonusGame's onMatch callback.

const PHONE_KEYS = {
  2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL',
  6: 'MNO', 7: 'PQRS', 8: 'TUV', 9: 'WXYZ',
};

function keyForLetter(letter) {
  return Object.keys(PHONE_KEYS).find((key) => PHONE_KEYS[key].includes(letter));
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rampedMs(kills, start, min, rampKills) {
  const t = Math.min(1, kills / rampKills);
  return start + (min - start) * t;
}

export class TypingInvasion {
  constructor({ fieldEl, cursorEl, audio, config, onDestroy, onMiss }) {
    this.fieldEl = fieldEl;
    this.cursorEl = cursorEl;
    this.audio = audio;
    this.config = config;
    this.onDestroy = onDestroy;
    this.onMiss = onMiss;
    this.active = false;
    this.ships = [];
    this.idSeq = 0;
    this.kills = 0;
    this.lockedId = null;
    this.spawnCountdown = 0;
    this.lastTs = null;
    this.rafId = null;
    this.boundTick = (ts) => this.tick(ts);
  }

  start() {
    this.active = true;
    this.kills = 0;
    this.lockedId = null;
    this.ships.forEach((s) => s.el.remove());
    this.ships = [];
    this.spawnCountdown = 500; // a quick first spawn, not an instant one
    this.lastTs = null;
    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(this.boundTick);
  }

  abort() {
    this.active = false;
    cancelAnimationFrame(this.rafId);
    this.ships.forEach((s) => s.el.remove());
    this.ships = [];
    this.lockedId = null;
    this.lastTs = null;
  }

  pause() {
    if (!this.active) return;
    cancelAnimationFrame(this.rafId);
  }

  resume() {
    if (!this.active) return;
    this.lastTs = null; // don't charge the paused interval as fall time
    this.rafId = requestAnimationFrame(this.boundTick);
  }

  nextKey(ship) {
    const letter = ship.letters[ship.hitCount];
    return letter ? letter.key : null;
  }

  tick(ts) {
    if (!this.active) return;
    if (this.lastTs == null) this.lastTs = ts;
    const dt = Math.min(ts - this.lastTs, 100); // clamp a stalled tab's first frame
    this.lastTs = ts;

    this.spawnCountdown -= dt;
    if (this.spawnCountdown <= 0) {
      this.trySpawn();
      this.spawnCountdown = rampedMs(this.kills, this.config.spawnMsStart, this.config.spawnMsMin, this.config.spawnRampKills);
    }

    for (const ship of [...this.ships]) {
      ship.y += (100 / ship.fallMs) * dt;
      ship.el.style.top = `${ship.y}%`;
      if (ship.y >= this.config.escapeY) this.escape(ship);
    }

    this.rafId = requestAnimationFrame(this.boundTick);
  }

  /** Picks a word whose first letter's key isn't already wanted by some
   *  other ship on screen -- see the file header. Silently skips this spawn
   *  if nothing fits (every key busy); the next countdown tries again. */
  trySpawn() {
    if (this.ships.length >= this.config.maxAlive) return;
    const usedKeys = new Set(this.ships.map((s) => this.nextKey(s)).filter(Boolean));
    const wordLen = this.kills >= this.config.wordLengthThreshold ? 3 : 1;
    const pool = wordLen === 1 ? this.config.letters : this.config.words3;
    const word = shuffled(pool).find((w) => !usedKeys.has(keyForLetter(w[0])));
    if (!word) return;
    this.spawn(word);
  }

  spawn(word) {
    const letters = word.split('').map((ch) => ({ ch, key: keyForLetter(ch) }));
    const icon = this.config.icons[Math.floor(Math.random() * this.config.icons.length)];
    const x = 10 + Math.random() * 80;

    const el = document.createElement('div');
    el.className = 'ai-ship';
    el.style.left = `${x}%`;
    el.style.top = '-10%';
    el.innerHTML =
      `<img class="ai-ship-icon" src="${icon}" alt="" />` +
      `<div class="ai-ship-word">${letters.map((l) => `<span class="ai-letter">${l.ch}</span>`).join('')}</div>`;
    this.fieldEl.appendChild(el);

    this.ships.push({
      id: ++this.idSeq,
      el,
      letterEls: Array.from(el.querySelectorAll('.ai-letter')),
      letters,
      hitCount: 0,
      y: -10,
      fallMs: rampedMs(this.kills, this.config.fallMsStart, this.config.fallMsMin, this.config.fallRampKills),
    });
  }

  /** Digits only ever mean something in one of two situations: nothing is
   *  locked yet and this digit is the next key some ship wants (locks onto
   *  it), or something is already locked and this digit is its next key.
   *  Anything else is a no-op -- there's no "wrong key" penalty, just no
   *  effect, so trying keys costs nothing. */
  handleKey(digit) {
    if (!this.active) return;

    let ship;
    if (this.lockedId != null) {
      ship = this.ships.find((s) => s.id === this.lockedId);
      if (!ship) { this.lockedId = null; return; }
    } else {
      ship = this.ships.find((s) => this.nextKey(s) === digit);
      if (!ship) return;
      this.lockedId = ship.id;
    }
    if (this.nextKey(ship) !== digit) return;
    this.hit(ship);
  }

  hit(ship) {
    this.fireBlast(ship);
    ship.letterEls[ship.hitCount].classList.add('hit');
    ship.hitCount += 1;
    this.audio.playTone(660, 70);
    if (ship.hitCount === ship.letters.length) this.destroy(ship);
  }

  destroy(ship) {
    this.lockedId = null;
    this.ships = this.ships.filter((s) => s !== ship);
    this.kills += 1;
    this.audio.playTone(880, 160);
    ship.el.classList.add('exploding');
    setTimeout(() => ship.el.remove(), 360);
    this.onDestroy?.();
  }

  /** Reaching the cursor without being finished off: same shape as a card
   *  mismatch in bonus.js -- a beat of "wrong" audio and visual, then gone.
   *  Doesn't stop the game; see main3.js's onMiss for what actually resets. */
  escape(ship) {
    if (this.lockedId === ship.id) this.lockedId = null;
    this.ships = this.ships.filter((s) => s !== ship);
    this.audio.playTone(140, 220);
    ship.el.classList.add('escaping');
    setTimeout(() => ship.el.remove(), 340);
    this.onMiss?.();
  }

  /** Purely cosmetic: a beam shoots out from the tip of the cursor arrow
   *  toward wherever the target ship's icon actually is right now, then
   *  fades. Drawn as a single line rotated/scaled to span exactly that
   *  distance, so it reads unmistakably as fired *from the arrow*, not just
   *  a dot that happens to appear near the target. Fire-and-forget -- it
   *  doesn't touch any game state, that already happened in hit(). */
  fireBlast(ship) {
    const fieldRect = this.fieldEl.getBoundingClientRect();
    const from = this.cursorEl.getBoundingClientRect();
    const to = ship.el.getBoundingClientRect();
    // The tip of the arrow glyph is near the top-left of its box, not the
    // center -- see the cursor.png artwork itself.
    const startX = from.left + from.width * 0.3 - fieldRect.left;
    const startY = from.top + from.height * 0.08 - fieldRect.top;
    const endX = to.left + to.width / 2 - fieldRect.left;
    const endY = to.top + to.height / 2 - fieldRect.top;
    const dist = Math.hypot(endX - startX, endY - startY);
    const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);

    const blast = document.createElement('div');
    blast.className = 'ai-blast';
    blast.style.left = `${startX}px`;
    blast.style.top = `${startY}px`;
    blast.style.width = `${dist}px`;
    blast.style.transform = `rotate(${angle}deg) scaleX(0)`;
    this.fieldEl.appendChild(blast);
    requestAnimationFrame(() => {
      blast.style.transform = `rotate(${angle}deg) scaleX(1)`;
    });
    setTimeout(() => blast.classList.add('ai-blast-fade'), 90);
    setTimeout(() => blast.remove(), 280);
  }
}
