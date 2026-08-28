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
// this test page.
const eo = {
  guess: document.querySelector('#eoGuess'),
  bar: document.querySelector('#eoBar'),
  result: document.querySelector('#eoResult'),
  accuracy: document.querySelector('#eoAccuracy'),
  count: document.querySelector('#eoCount'),
};

function renderEvenOdd(state) {
  ui.setHud({ bonus: state.bonus, bonusMax: state.bonusMax });
  eo.guess.textContent = state.guess.toUpperCase();
  eo.accuracy.textContent = state.accuracy === null ? '—' : `${Math.round(state.accuracy * 100)}%`;
  eo.count.textContent = state.totalGuesses;
  if (state.timedOut) {
    eo.result.textContent = 'Too slow — bonus reset to 0.';
    eo.result.className = 'eo-result eo-timeout';
  } else if (state.last) {
    const { actual, guess, correct } = state.last;
    eo.result.textContent = correct
      ? `Computer guessed ${guess.toUpperCase()} — right. You entered ${actual}.`
      : `Computer guessed ${guess.toUpperCase()} — wrong. You entered ${actual}.`;
    eo.result.className = correct ? 'eo-result eo-computer-right' : 'eo-result eo-computer-wrong';
  } else {
    eo.result.textContent = '';
    eo.result.className = 'eo-result';
  }
}

// Redraws the countdown bar every frame while a guess is pending, rather
// than having evenOddGame push a render on a timer of its own.
function tickEvenOddBar() {
  if (evenOddGame.active) {
    const frac = evenOddGame.msRemaining() / CONFIG.evenOdd.entryWindowMs;
    eo.bar.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }
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
  ui.setHud({ bonus: 0, bonusMax: CONFIG.evenOdd.bonusMax });
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
