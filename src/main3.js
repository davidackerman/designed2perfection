// Third test entry point (inconvenient3.html): same shell as main2.js --
// title password, classic mode, high scores, debug, remap, all identical --
// and the right half is the exact same Simon ("GAME 2: REPEAT AFTER ME").
// The left half swaps the picture memory board for a ZType-style shooter
// (see typing.js): AI logos fall toward a cursor ship and you shoot letters
// off them by dialing the phone-keypad key for each one, in order.
//
// Scoring there works differently from the memory board it replaces: a ship
// that reaches the cursor is a miss, which resets the *current* run's count
// back to 0 -- but never the persisted best, which only ever grows (see
// handleShipEscaped). So Game 1's own total (both in its own heading and in
// the shared Total banner up top) is best + current, not just current: a
// miss visibly costs the live count but never actually erases progress
// already banked.

import { UI } from './ui.js';
import { Game, STATE } from './game.js';
import { SimonGame } from './simon.js';
import { TypingInvasion } from './typing.js';
import { AudioManager } from './audio.js';
import { Input, allBindingSlots } from './input.js';
import { CONFIG } from './config.js';
import { ScoreStore } from './scores.js';

const ui = new UI();
const audio = new AudioManager();
const scores = new ScoreStore();
const reflexGame = new Game({ ui, audio, scores, onGameOver: handleGameOver });
const simonGame = new SimonGame({ ui, audio, scores, onGameOver: handleGameOver });

// Game 1: the AI-invasion shooter -- see typing.js.
const typingGame = new TypingInvasion({
  fieldEl: document.querySelector('#typingField'),
  cursorEl: document.querySelector('#typingCursor'),
  config: CONFIG.typing,
  onDestroy: handleShipDestroyed,
  onMiss: handleShipEscaped,
});

// Both bests are plain persisted high-water marks, entirely independent of
// ScoreStore -- Simon's own "Best" was actually always reading
// scores.best('simon'), which is always 0 (nothing ever calls scores.add()
// any more; see UI.showGameOver's own comment about that), so whenever a
// run ended, UI.setHud({best: scores.best(...)}) was stomping the display
// back to 0. Tracking it ourselves, the same way typingBest already
// was, sidesteps that entirely.
let simonBest = Number(localStorage.getItem(CONFIG.storage.simonBest) || 0);
let typingBest = Number(localStorage.getItem(CONFIG.storage.typingBest) || 0);
let typingCurrent = 0;

// Direct DOM refs for this page's own Total banner -- same approach as
// main2.js's totalEls, kept local here rather than added to the shared UI
// class since only this test page has it.
const totalEls = {
  game1: document.querySelector('#totalGame1'),
  game2: document.querySelector('#totalGame2'),
  value: document.querySelector('#totalValue'),
};
const typingBestHeading = document.querySelector('#typingBestHeading');
const typingPanel = document.querySelector('.panel-typing');

// Ratchets both bests up live, mid-run, the instant the current run passes
// the old one -- not just when the run ends -- and re-asserts #bestHeading's
// text every single frame (this runs off tickTotalBanner below), so it
// can't be left showing a stale/wrong value by anything else that writes to
// it (see the comment on simonBest above). Only ever goes up; never reset
// to 0 except by an explicit high score clear, which this page doesn't have.
function refreshTotal() {
  const simonScore = Number(ui.el.scoreHeading.textContent) || 0;
  if (simonScore > simonBest) {
    simonBest = simonScore;
    localStorage.setItem(CONFIG.storage.simonBest, String(simonBest));
  }
  if (typingCurrent > typingBest) {
    typingBest = typingCurrent;
    localStorage.setItem(CONFIG.storage.typingBest, String(typingBest));
  }
  ui.el.bestHeading.textContent = simonBest;
  typingBestHeading.textContent = typingBest;
  totalEls.game1.textContent = typingBest;
  totalEls.game2.textContent = simonBest;
  totalEls.value.textContent = simonBest + typingBest;
}

// Simon's own Score changes every round (simon.js writes straight to
// #scoreHeading, with no callback out to this file) and can pass simonBest
// mid-run at any moment -- a per-frame tick is what makes refreshTotal's
// ratchet actually live rather than only catching up on the next shooter
// event, same idea as main2.js's ticker.
function tickTotalBanner() {
  refreshTotal();
  requestAnimationFrame(tickTotalBanner);
}
requestAnimationFrame(tickTotalBanner);

function handleShipDestroyed() {
  typingCurrent += 1;
  refreshTotal();
}

function handleShipEscaped() {
  // refreshTotal()'s own ratchet already caught typingBest up to this run's
  // peak on some earlier frame, before this reset -- nothing to compare here.
  typingCurrent = 0;
  refreshTotal();
  typingPanel.classList.remove('miss-flash');
  void typingPanel.offsetWidth;
  typingPanel.classList.add('miss-flash');
}

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
  // Game over: a wrong pad only freezes the Simon side -- the shooter keeps
  // running the whole time, so digits still drive it here exactly like
  // mid-run. Classic has no shooter, so there a digit just goes again too.
  if (screen === 'over') {
    if (classicMode) startGame();
    else typingGame.handleKey(digit);
    return;
  }

  // 911 rides on top of whatever else digits mean on the current screen --
  // see main.js for the same note about the harmless '9'/'1' overlap.
  answerKeyBuffer = (answerKeyBuffer + digit).slice(-ANSWER_KEY_CODE.length);
  if (answerKeyBuffer === ANSWER_KEY_CODE) {
    answerKeyBuffer = '';
    if (screen === 'title') ui.showAnswerToast('Title code', TITLE_CODE);
    return; // this keystroke dialed 911 -- don't also feed it to the title code or the shooter
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

  // Mid-run, in Simon mode: the number pad drives the shooter instead.
  // Classic mode has no shooter; the digit means nothing.
  if (screen === 'playing' && !classicMode) typingGame.handleKey(digit);
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

// No background music on this build -- see toTitle(), which would otherwise
// restart it every time you back out to the title screen.
audio.unlock();

function unlockOnFirstGesture() {
  audio.unlock();
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
  document.querySelector('#totalStat').classList.toggle('hidden', classicMode);
  typingCurrent = 0;
  refreshTotal();
}

function toggleClassic() {
  classicMode = !classicMode;
  localStorage.setItem(CONFIG.storage.classicMode, classicMode ? '1' : '0');
  toTitle();
  applyModeUI();
}

function toTitle() {
  clearTimeout(simonAutoRestartTimer);
  screen = 'title';
  titleCodeProgress = 0;
  ui.resetTitleDigits();
  activeGame().abort();
  typingGame.abort();
  ui.showOverlay('title');
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
  clearTimeout(simonAutoRestartTimer);
  audio.unlock();
  screen = 'playing';
  activeGame().start(opts);
  if (!classicMode) {
    // Simon failing calls this again to auto-restart itself (see
    // handleGameOver/simonAutoRestartTimer), but the shooter is meant to
    // keep running straight through that -- only (re)start it if it isn't
    // already live, i.e. actually coming in from the title/remap/scores
    // screens, which do call typingGame.abort().
    if (!typingGame.active) typingGame.start();
    refreshTotal();
  }
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

let simonAutoRestartTimer = null;

function handleGameOver(result) {
  screen = 'over';
  // Catches this run's final score into simonBest (if it's a new one)
  // before reading it below -- see refreshTotal's ratchet.
  refreshTotal();
  if (result.mode === 'simon') {
    // Not scores.best('simon') -- see the comment on simonBest above; that's
    // always 0 (nothing calls scores.add() any more) and would overwrite
    // this transient "just failed" readout with the wrong number.
    ui.showSimonOver({ ...result, best: simonBest });
    // No "press anything" any more -- the score/best flash on their own for
    // a beat, then the next sequence just starts. A manual press (handled
    // elsewhere, same as always) gets there sooner and clears this first.
    clearTimeout(simonAutoRestartTimer);
    simonAutoRestartTimer = setTimeout(() => {
      if (screen === 'over') startGame();
    }, CONFIG.simon.failShowMs);
  } else {
    const best = scores.best(result.mode);
    ui.setHud({ best });
    ui.showGameOver({ ...result, best, board: scores.board(result.mode) });
  }
}

function showScores(mode = scoresTab) {
  clearTimeout(simonAutoRestartTimer);
  scoresTab = mode;
  screen = 'scores';
  activeGame().abort();
  typingGame.abort();
  ui.showScores({
    mode,
    board: scores.board(mode),
    stats: scores.stats(),
    nemesis: scores.nemesis(),
  });
}

// --- remap screen -----------------------------------------------------------

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
  clearTimeout(simonAutoRestartTimer);
  screen = 'remap';
  activeGame().abort();
  typingGame.abort();
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

  // Any keypress at all, while the title is up, is what starts the title's
  // own grow/shrink/gray hint counting -- see UI.noteTitleActivity. A
  // title nobody's touched yet should never look mid-hint.
  if (screen === 'title') ui.noteTitleActivity();

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
    typingGame.pause();
  } else {
    activeGame().resume();
    typingGame.resume();
  }
});
