// Test entry point (inconvenient2.html): identical to main.js except the
// two games are laid out side by side and separately labeled ("GAME 1:
// MEMORY" / "GAME 2: REPEAT AFTER ME") instead of sharing one HUD, the
// bonus board is a picture-card variant of the same engine (see bonus.js's
// `config` option -- this page passes CONFIG.memory instead of
// CONFIG.bonus), and the two games' totals are spelled out across the top
// instead of tucked into one panel's corner. Everything else -- Simon,
// classic mode, the title password, high scores, debug mode -- is the same
// code, just duplicated here rather than parameterizing main.js for a
// one-off try.

import { UI } from './ui.js';
import { Game, STATE } from './game.js';
import { SimonGame } from './simon.js';
import { BonusGame } from './bonus.js';
import { AudioManager } from './audio.js';
import { Input, allBindingSlots } from './input.js';
import { CONFIG } from './config.js';
import { ScoreStore } from './scores.js';

const ui = new UI();
const audio = new AudioManager();
const scores = new ScoreStore();
const reflexGame = new Game({ ui, audio, scores, onGameOver: handleGameOver });
const simonGame = new SimonGame({ ui, audio, scores, onGameOver: handleGameOver });
// Game 1: the picture memory board -- same engine as the real page's bonus
// board, just handed CONFIG.memory instead of CONFIG.bonus.
const bonusGame = new BonusGame({
  ui, audio, config: CONFIG.memory,
  onMatch: handleBonusMatch,
  onRoundChange: refreshTotal, // catches the round2 -> JANELIA transition itself, before any point is scored
});

const JANELIA_POINTS = CONFIG.memory.janeliaPoints ?? 1;
// How many matches JANELIA is worth, on top of -- not counted as part of --
// the matching rounds; see updateGame1Heading below.
const MATCH_ONLY_MAX = CONFIG.memory.rounds.reduce((sum, r) => {
  return r.kind === 'janelia' ? sum : sum + (r.size * r.size) / 2;
}, 0);
const MATCH_MAX = MATCH_ONLY_MAX + JANELIA_POINTS;
let matches = 0;

// Direct DOM refs for this page's own Total banner -- kept local here
// rather than added to the shared UI class, since it only exists on this
// test page (see #totalStat/inconvenient2.html). Game 1 is the memory
// board's running total (matches, plus JANELIA's own +2 once solved); Game
// 2 is Simon's live, ongoing Score -- not Best -- so it moves mid-round
// instead of sitting frozen until a run actually ends.
const totalEls = {
  game1: document.querySelector('#totalGame1'),
  game2: document.querySelector('#totalGame2'),
  value: document.querySelector('#totalValue'),
};
const game1Tag = document.querySelector('#game1Tag');
const bonusLabel = document.querySelector('#bonusLabel');

/** Once round 3 (JANELIA) starts, this panel stops billing itself as
 *  "matching" -- it's a flat +2, not one more pair -- so the tag and label
 *  swap to "Bonus" and the fraction re-bases to just that +2 instead of
 *  folding it into the same X/12 the matching rounds were using. */
function updateGame1Heading() {
  const isBonus = bonusGame.kind === 'janelia';
  game1Tag.textContent = isBonus ? 'GAME 1: BONUS' : 'GAME 1: MEMORY';
  bonusLabel.textContent = isBonus ? 'Bonus' : 'Matches';
  ui.el.bonusHeading.textContent = isBonus
    ? `${Math.max(0, matches - MATCH_ONLY_MAX)}/${JANELIA_POINTS}`
    : `${matches}/${MATCH_ONLY_MAX}`;
}

function refreshTotal() {
  const score = Number(ui.el.scoreHeading.textContent) || 0;
  updateGame1Heading();
  totalEls.game1.textContent = `${matches}/${MATCH_MAX}`;
  totalEls.game2.textContent = score;
  totalEls.value.textContent = score + matches;
}

// Simon's own Score changes every round (simon.js writes straight to
// #scoreHeading, with no callback out to this file), so refreshTotal() alone
// -- called only on bonus-board events -- would leave the banner's Game 2
// stuck between them. A per-frame tick keeps it live without needing Simon
// to know this banner exists, same idea as the even/odd test build's old
// tickEvenOddBar.
function tickTotalBanner() {
  refreshTotal();
  requestAnimationFrame(tickTotalBanner);
}
requestAnimationFrame(tickTotalBanner);

function handleBonusMatch(count = 1) {
  matches = Math.min(matches + count, MATCH_MAX);
  refreshTotal();
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
  // Game over: a wrong pad only freezes the Simon side -- the memory board
  // keeps running the whole time, so digits still drive it here exactly
  // like mid-run. It's only a control or key press that means "go again"
  // for Simon; see handleAction and the global keydown handler below.
  // Classic has no bonus board, so there a digit just goes again too.
  if (screen === 'over') {
    if (classicMode) startGame();
    else bonusGame.handleKey(digit);
    return;
  }

  // 911 rides on top of whatever else digits mean on the current screen --
  // see main.js for the same note about the harmless '9'/'1' overlap.
  answerKeyBuffer = (answerKeyBuffer + digit).slice(-ANSWER_KEY_CODE.length);
  if (answerKeyBuffer === ANSWER_KEY_CODE) {
    answerKeyBuffer = '';
    if (screen === 'title') ui.showAnswerToast('Title code', TITLE_CODE);
    bonusGame.peekAll(); // also flash the memory board's hidden faces, for whoever's running it
    return; // this keystroke dialed 911 -- don't also feed it to the title code or the bonus board
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

  // Mid-run, in Simon mode: the number pad drives the memory board instead.
  // Classic mode has no bonus board; the digit means nothing.
  if (screen === 'playing' && !classicMode) bonusGame.handleKey(digit);
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
  document.querySelector('#totalStat').classList.toggle('hidden', classicMode);
  matches = 0;
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
  bonusGame.abort();
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
  clearTimeout(simonAutoRestartTimer);
  audio.unlock();
  screen = 'playing';
  activeGame().start(opts);
  if (!classicMode) {
    bonusGame.start();
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
  ui.setHud({ best: scores.best(result.mode) });
  const best = scores.best(result.mode);
  refreshTotal();
  if (result.mode === 'simon') {
    ui.showSimonOver({ ...result, best });
    // No "press anything" any more -- the score/best flash on their own for
    // a beat, then the next sequence just starts. A manual press (handled
    // elsewhere, same as always) gets there sooner and clears this first.
    clearTimeout(simonAutoRestartTimer);
    simonAutoRestartTimer = setTimeout(() => {
      if (screen === 'over') startGame();
    }, CONFIG.simon.failShowMs);
  } else {
    ui.showGameOver({ ...result, best, board: scores.board(result.mode) });
  }
}

function showScores(mode = scoresTab) {
  clearTimeout(simonAutoRestartTimer);
  scoresTab = mode;
  screen = 'scores';
  activeGame().abort();
  bonusGame.abort();
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
  clearTimeout(simonAutoRestartTimer);
  screen = 'remap';
  activeGame().abort();
  bonusGame.abort();
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
    bonusGame.pause();
  } else {
    activeGame().resume();
    bonusGame.resume();
  }
});
