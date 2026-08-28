// Test entry point (inconvenient2.html): identical to main.js except the
// bonus board (bonus.js, a memory-match minigame) is swapped for an
// even/odd guesser (evenodd.js). Everything else -- Simon, classic mode,
// the title password, high scores, debug mode -- is the same code, just
// duplicated here rather than parameterizing main.js for a one-off try.

import { UI } from './ui.js';
import { Game, STATE } from './game.js';
import { SimonGame } from './simon.js';
import { EvenOddGame } from './evenodd.js';
import { AudioManager } from './audio.js';
import { Input, allBindingSlots } from './input.js';
import { CONFIG } from './config.js';
import { ScoreStore } from './scores.js';

const ui = new UI();
const audio = new AudioManager();
const scores = new ScoreStore();
const reflexGame = new Game({ ui, audio, scores, onGameOver: handleGameOver });
const simonGame = new SimonGame({ ui, audio, scores, onGameOver: handleGameOver });
// Lives on the left half of the Simon screen, worked with the number pad
// while push/pull/soap/swipe drive Simon on the right -- see evenodd.js.
const evenOddGame = new EvenOddGame({ audio, onUpdate: renderEvenOdd });

// Direct DOM refs for the even/odd panel -- kept local to this file rather
// than added to the shared UI class, since this whole panel only exists on
// this test page. The Score/Multiplier/Total line reuses index.html's
// totalScore/totalBonus/total ids (see UI.el), but this page writes them
// directly instead of going through ui.setHud's additive bonus math -- that
// math assumes a flat bonus added to score, not a multiplier applied to it.
const eo = {
  guess: document.querySelector('#eoGuess'),
  bar: document.querySelector('#eoBar'),
  status: document.querySelector('#eoStatus'),
  history: document.querySelector('#eoHistory'),
  plot: document.querySelector('#eoPlot'),
  accuracy: document.querySelector('#eoAccuracy'),
  count: document.querySelector('#eoCount'),
  qualify: document.querySelector('#eoQualify'),
  multiplierHeading: document.querySelector('#bonusHeading'),
  totalScore: document.querySelector('#totalScore'),
  totalMultiplier: document.querySelector('#totalBonus'),
  total: document.querySelector('#total'),
};

let currentMultiplier = CONFIG.evenOdd.multiplierMin;
let guessRevealTimer = null;
const GUESS_REVEAL_MS = 1300; // how long a resolved guess stays shown before going back to "?"

function formatMultiplier(m) {
  return `×${m.toFixed(2)}`;
}

// The computer's guess for the digit you're about to enter is never shown
// ahead of time -- see evenOddGame.guess, which is only ever read directly
// by the 911 operator cheat below, never rendered here. Otherwise pressing
// the opposite of whatever's on screen would be a trivial, unbeatable
// strategy, defeating the entire point of the minigame. Instead #eoGuess
// sits on a plain "?" until a digit resolves it, then briefly reveals what
// the computer guessed against what you actually entered before resetting
// to "?" for the next one -- the history log below keeps every past reveal
// around after that.
function renderEvenOdd(state) {
  currentMultiplier = state.multiplier;
  eo.accuracy.textContent = state.accuracy === null ? '—' : `${Math.round(state.accuracy * 100)}%`;
  eo.count.textContent = state.totalGuesses;
  eo.multiplierHeading.textContent = formatMultiplier(state.multiplier);
  // The multiplier doesn't apply to your score until you've sustained
  // qualifyGuesses guesses since the last reset -- see
  // EvenOddGame.updateMultiplier_. Below that, say so plainly rather than
  // leaving it a mystery why a good run's accuracy isn't moving the total.
  eo.qualify.textContent = state.qualified
    ? ''
    : `Bonus locks in at ${state.qualifyGuesses} guesses without a reset (${state.totalGuesses}/${state.qualifyGuesses})`;
  renderHistory(state.history);
  renderMultiplierPlot(state.multiplierLog, state.multiplierMin, state.multiplierMax);

  const resolved = !state.timedOut && state.history[state.history.length - 1];
  clearTimeout(guessRevealTimer);
  if (resolved) {
    eo.guess.textContent = `Computer: ${resolved.guess.toUpperCase()} · You: ${resolved.actual.toUpperCase()}`;
    eo.guess.className = resolved.correct ? 'eo-guess-value eo-computer-right' : 'eo-guess-value eo-computer-wrong';
    guessRevealTimer = setTimeout(() => {
      eo.guess.textContent = '?';
      eo.guess.className = 'eo-guess-value';
    }, GUESS_REVEAL_MS);
  } else {
    eo.guess.textContent = '?';
    eo.guess.className = 'eo-guess-value';
  }

  if (state.timedOut) {
    eo.status.textContent = `Too slow — multiplier reset to ${formatMultiplier(CONFIG.evenOdd.multiplierMin)}.`;
    eo.status.className = 'eo-status eo-timeout';
  } else {
    eo.status.textContent = '';
    eo.status.className = 'eo-status';
  }
}

/** Two aligned rows, oldest to newest left to right -- same idea as Simon's
 *  own "Wanted vs. You" game-over recap (UI.renderSequenceRecap): a
 *  "Computer" row and a "You" row sharing one column per guess, rather than
 *  a row of two-line boxes, which read as an ambiguous second row wrapping
 *  underneath the first instead of "these two line up". Every cell for a
 *  given guess (both rows) shares one color: red-tinted if the computer got
 *  it right (bad for you), green-tinted if it didn't (good for you).
 *  Rebuilt from scratch each call, same "no diffing" convention as
 *  UI.renderBonusBoard -- at most historyLen (20) columns. */
function renderHistory(history) {
  const letter = (parity) => (parity === 'even' ? 'E' : 'O');
  eo.history.style.setProperty('--eo-steps', Math.max(history.length, 1));
  const cell = (h, parity) => {
    const cls = h.correct ? 'eo-history-cell eo-hist-right' : 'eo-history-cell eo-hist-wrong';
    return `<span class="${cls}">${letter(parity)}</span>`;
  };
  eo.history.innerHTML =
    '<span class="eo-history-label">Computer</span>' +
    history.map((h) => cell(h, h.guess)).join('') +
    '<span class="eo-history-label">You</span>' +
    history.map((h) => cell(h, h.actual)).join('');
}

/** A running line plot of the multiplier over the run so far, oldest to
 *  newest (x axis: running guess count) -- see EvenOddGame.multiplierLog.
 *  Y axis is fixed to [multiplierMin, multiplierMax] (labeled directly on
 *  the chart), not autoscaled, so the line's height is directly comparable
 *  across the whole run. */
function renderMultiplierPlot(log, min, max) {
  if (log.length < 2) {
    eo.plot.innerHTML = '';
    return;
  }
  const w = 200;
  const h = 50;
  const padLeft = 14; // room for the axis labels below
  const padY = 7;
  const plotW = w - padLeft;
  const plotH = h - padY * 2;
  const points = log
    .map((v, i) => {
      const x = padLeft + (i / (log.length - 1)) * plotW;
      const norm = (v - min) / (max - min);
      const y = padY + (1 - norm) * plotH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  eo.plot.innerHTML =
    `<text x="1" y="${padY + 3}" class="eo-plot-axis">${max}&times;</text>` +
    `<text x="1" y="${h - padY + 3}" class="eo-plot-axis">${min}&times;</text>` +
    `<polyline class="eo-plot-line" points="${points}" />`;
}

// Redraws the countdown bar and the Score x Multiplier = Total line every
// frame, rather than having evenOddGame (which has no idea what Simon's
// score is) or SimonGame (which has no idea about the multiplier) push a
// render whenever the other one's value changes.
function tickEvenOddBar() {
  if (evenOddGame.active) {
    const frac = evenOddGame.msRemaining() / CONFIG.evenOdd.entryWindowMs;
    eo.bar.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }
  const score = Number(ui.el.scoreHeading.textContent) || 0;
  eo.totalScore.textContent = score;
  eo.totalMultiplier.textContent = formatMultiplier(currentMultiplier);
  eo.total.textContent = (score * currentMultiplier).toFixed(1);
  requestAnimationFrame(tickEvenOddBar);
}
requestAnimationFrame(tickEvenOddBar);

let classicMode = localStorage.getItem(CONFIG.storage.classicMode) === '1';
const activeGame = () => (classicMode ? reflexGame : simonGame);

const input = new Input(
  (evt) => handleAction(evt),
  (raw) => ui.markKey(raw)
);
ui.keyFor = (slot) => input.keyFor(slot);

let screen = 'title'; // title | playing | over | remap | scores
let scoresTab = 'simon';

// The title screen's number-pad code, in place of a Start button: the digits
// and roman numeral buried in the title itself, in reading order --
// 1nc0nVeni3nt -> 1, 0, V (=5), 3.
const TITLE_CODE = '1053';
// Dial this on the number pad at any point to bring up the answer key.
const ANSWER_KEY_CODE = '911';
let titleCodeProgress = 0;
let answerKeyBuffer = '';

// Real numeric keypad or a keyboard's Numpad row -- accept either, since it's
// not yet decided which one the cabinet ships with.
const DIGIT_KEYS = {};
for (let i = 0; i <= 9; i++) {
  DIGIT_KEYS[`Digit${i}`] = String(i);
  DIGIT_KEYS[`Numpad${i}`] = String(i);
}

function handleDigit(digit) {
  // Game over: a wrong pad only freezes the Simon side -- the even/odd panel
  // keeps running the whole time, so digits still drive it here exactly
  // like mid-run. It's only a control or key press that means "go again"
  // for Simon; see handleAction and the global keydown handler below.
  // Classic has no bonus panel, so there a digit just goes again too.
  if (screen === 'over') {
    if (classicMode) startGame();
    else evenOddGame.handleKey(digit);
    return;
  }

  // 911 rides on top of whatever else digits mean on the current screen --
  // see main.js for the same note about the harmless '9'/'1' overlap.
  answerKeyBuffer = (answerKeyBuffer + digit).slice(-ANSWER_KEY_CODE.length);
  if (answerKeyBuffer === ANSWER_KEY_CODE) {
    answerKeyBuffer = '';
    if (screen === 'title') ui.showAnswerToast('Title code', TITLE_CODE);
    // Nothing is hidden on the even/odd board the way a card's face is --
    // the operator cheat here is just showing the computer's live guess.
    else if (evenOddGame.active) ui.showAnswerToast('Computer guess', evenOddGame.guess.toUpperCase());
    return; // this keystroke dialed 911 -- don't also feed it to the title code or the bonus panel
  }

  if (screen === 'title') {
    if (digit === TITLE_CODE[titleCodeProgress]) {
      ui.markTitleDigitGood(titleCodeProgress, digit);
      audio.play('codeRight');
      titleCodeProgress++;
      if (titleCodeProgress === TITLE_CODE.length) {
        titleCodeProgress = 0;
        setTimeout(() => {
          audio.play('success');
          ui.playDoorOpen();
          startGame({ fromPasswordSuccess: true });
        }, 1000);
      }
    } else {
      ui.resetTitleDigits();
      ui.flashTitleWrong();
      audio.play('codeWrong');
      titleCodeProgress = 0;
    }
    return;
  }

  // Mid-run, in Simon mode: the number pad drives the even/odd panel instead.
  // Classic mode has no bonus panel; the digit means nothing.
  if (screen === 'playing' && !classicMode) evenOddGame.handleKey(digit);
}

const slots = allBindingSlots();
let debug = localStorage.getItem(CONFIG.storage.debug) === '1';

const debugParam = new URLSearchParams(location.search).get('debug');
if (debugParam !== null) {
  debug = debugParam !== '0';
  localStorage.setItem(CONFIG.storage.debug, debug ? '1' : '0');
}

ui.setHardMode(reflexGame.hardMode);
ui.setMuted(audio.muted);
ui.setDebug(debug, slots);
applyModeUI();
ui.showOverlay('title');

audio.unlock();
audio.playMusic('song');

function unlockOnFirstGesture() {
  audio.unlock();
  if (screen === 'title') audio.playMusic('song');
}
window.addEventListener('pointerdown', unlockOnFirstGesture, { once: true });
window.addEventListener('keydown', unlockOnFirstGesture, { once: true });

function applyModeUI() {
  ui.setSimonMode(!classicMode);
  ui.setScoreLabel(classicMode ? 'Score' : 'Pts');
  ui.setHud({ score: 0, round: 0, best: scores.best(activeGame().mode) });
  document.querySelector('#classicToggle').textContent = classicMode ? 'ON' : 'OFF';
  document.querySelector('#classicLegend').classList.toggle('hidden', !classicMode);
  document.querySelector('#classicHint').classList.toggle('hidden', !classicMode);
  document.querySelector('#hardBtn').classList.toggle('hidden', !classicMode);
  currentMultiplier = CONFIG.evenOdd.multiplierMin;
  eo.multiplierHeading.textContent = formatMultiplier(currentMultiplier);
  eo.history.innerHTML = '';
  eo.plot.innerHTML = '';
  eo.accuracy.textContent = '—';
  eo.count.textContent = '0';
  clearTimeout(guessRevealTimer);
  eo.guess.textContent = '?';
  eo.guess.className = 'eo-guess-value';
}

function toggleClassic() {
  classicMode = !classicMode;
  localStorage.setItem(CONFIG.storage.classicMode, classicMode ? '1' : '0');
  toTitle();
  applyModeUI();
}

function toTitle() {
  screen = 'title';
  titleCodeProgress = 0;
  ui.resetTitleDigits();
  activeGame().abort();
  evenOddGame.abort();
  ui.showOverlay('title');
  audio.playMusic('song');
}

function handleAction(evt) {
  if (screen === 'title') {
    audio.play('wrong');
    return;
  }
  if (screen === 'over') {
    startGame();
    return;
  }
  activeGame().handleInput(evt);
}

function startGame(opts) {
  audio.unlock();
  screen = 'playing';
  activeGame().start(opts);
  if (!classicMode) evenOddGame.start();
}

function toggleHard() {
  reflexGame.setHardMode(!reflexGame.hardMode);
  ui.setHardMode(reflexGame.hardMode);
  ui.setHud({ best: scores.best(reflexGame.mode) });
}

function setDebug(on) {
  debug = on;
  localStorage.setItem(CONFIG.storage.debug, debug ? '1' : '0');
  ui.setDebug(debug, slots);
  if (classicMode) ui.setDebugExpected(reflexGame.challenge);
  else ui.setSimonDebugStep(simonGame.lastDebugStep);
}

function toggleDebug() {
  setDebug(!debug);
}

function toggleMute() {
  ui.setMuted(audio.toggleMute());
}

// --- scores ---------------------------------------------------------------

function handleGameOver(result) {
  screen = 'over';
  ui.setHud({ best: scores.best(result.mode) });
  const best = scores.best(result.mode);
  if (result.mode === 'simon') {
    ui.showSimonOver({ ...result, best });
  } else {
    ui.showGameOver({ ...result, best, board: scores.board(result.mode) });
  }
}

function showScores(mode = scoresTab) {
  scoresTab = mode;
  screen = 'scores';
  activeGame().abort();
  evenOddGame.abort();
  ui.showScores({
    mode,
    board: scores.board(mode),
    stats: scores.stats(),
    nemesis: scores.nemesis(),
  });
}

// --- remap screen ---------------------------------------------------------

function drawBindings(capturing = null) {
  ui.renderBindings(slots, input, beginRebind, capturing);
}

function beginRebind(slotId) {
  drawBindings(slotId);
  input.beginCapture(slotId, () => {
    drawBindings();
    if (debug) ui.renderDebugKeys(slots);
  });
}

function toRemap() {
  screen = 'remap';
  activeGame().abort();
  evenOddGame.abort();
  drawBindings();
  ui.showOverlay('remap');
}

document.querySelector('#startBtn').addEventListener('click', () => { if (debug) startGame(); });
document.querySelector('#menuBtn').addEventListener('click', toTitle);
function goAgainOnEmptyClick(e) {
  if (screen !== 'over') return;
  if (e.target.closest('button, input, a')) return;
  startGame();
}
document.querySelector('#overOverlay').addEventListener('click', goAgainOnEmptyClick);
document.querySelector('#simonOver').addEventListener('click', goAgainOnEmptyClick);
document.querySelector('#remapBtn').addEventListener('click', toRemap);
document.querySelector('#remapDoneBtn').addEventListener('click', toTitle);
document.querySelector('#remapResetBtn').addEventListener('click', () => {
  input.reset();
  drawBindings();
  if (debug) ui.renderDebugKeys(slots);
});
document.querySelector('#hardBtn').addEventListener('click', toggleHard);
document.querySelector('#classicBtn').addEventListener('click', toggleClassic);
document.querySelector('#scoresBtn').addEventListener('click', () => showScores(activeGame().mode));
document.querySelector('#scoresDoneBtn').addEventListener('click', toTitle);
document.querySelector('#tabSimon').addEventListener('click', () => showScores('simon'));
document.querySelector('#tabNormal').addEventListener('click', () => showScores('normal'));
document.querySelector('#tabHard').addEventListener('click', () => showScores('hard'));

const clearBtn = document.querySelector('#scoresClearBtn');
let clearArmed = null;
clearBtn.addEventListener('click', () => {
  if (clearArmed) {
    clearTimeout(clearArmed);
    clearArmed = null;
    clearBtn.textContent = 'Clear scores';
    clearBtn.classList.remove('danger');
    scores.reset();
    ui.setHud({ best: 0 });
    showScores(scoresTab);
    return;
  }
  clearBtn.textContent = 'Really clear?';
  clearBtn.classList.add('danger');
  clearArmed = setTimeout(() => {
    clearArmed = null;
    clearBtn.textContent = 'Clear scores';
    clearBtn.classList.remove('danger');
  }, 3000);
});
document.querySelector('#muteBadge').addEventListener('click', toggleMute);

const CHEAT_KEY = 'Space';
window.addEventListener('keydown', (e) => {
  if (e.code !== CHEAT_KEY) return;
  if (!debug || activeGame().state !== STATE.PLAYING) return;
  if (e.repeat) return;

  if (classicMode) {
    if (!reflexGame.challenge) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    reflexGame.handleInput({ actionId: reflexGame.challenge.action.id, variantId: reflexGame.challenge.variantId });
    return;
  }

  e.preventDefault();
  e.stopImmediatePropagation();
  if (!simonGame.lastDebugStep) {
    ui.flash('nothing');
    return;
  }
  simonGame.handleInput({ actionId: simonGame.lastDebugStep.actionId });
}, true);

window.addEventListener('keydown', (e) => {
  if (input.capture) return;
  if (e.defaultPrevented) return;

  const digit = DIGIT_KEYS[e.code];
  if (digit !== undefined && !e.repeat) { handleDigit(digit); return; }

  if (e.code === 'KeyM') { toggleMute(); return; }
  if (e.code === 'Backquote') { toggleDebug(); return; }

  if (screen === 'remap' || screen === 'scores') {
    if (e.code === 'Escape') toTitle();
    return;
  }

  if (screen === 'over') {
    if (e.code === 'Escape') { toTitle(); return; }
    if (!e.repeat) { e.preventDefault(); startGame(); }
    return;
  }

  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    if (activeGame().state === STATE.PLAYING) return;
    if (screen === 'title' && !debug) return;
    startGame();
    return;
  }

  if (e.code === 'KeyH' && classicMode && activeGame().state !== STATE.PLAYING) { toggleHard(); return; }
  if (e.code === 'Escape' && activeGame().state === STATE.PLAYING) toTitle();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    activeGame().pause();
    evenOddGame.pause();
  } else {
    activeGame().resume();
    evenOddGame.resume();
  }
});
