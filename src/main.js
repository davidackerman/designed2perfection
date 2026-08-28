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
// Lives on the left half of the Simon screen, worked with the number pad
// while push/pull/soap/swipe drive Simon on the right -- see bonus.js.
const bonusGame = new BonusGame({ ui, audio, onMatch: handleBonusMatch });

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
  // Game over: a wrong pad only freezes the Simon side -- the bonus board
  // keeps running the whole time (see handleGameOver/ui.showSimonOver), so
  // digits still drive it here exactly like mid-run. It's only a control or
  // key press that means "go again" for Simon; see handleAction and the
  // global keydown handler below. Classic has no bonus board, so there a
  // digit just goes again too, same as anything else.
  if (screen === 'over') {
    if (classicMode) startGame();
    else bonusGame.handleKey(digit);
    return;
  }

  // 911 rides on top of whatever else digits mean on the current screen --
  // mid-run, that's the bonus board (below), so the '9' and the first '1'
  // of a mid-game 911 dial also land there as ordinary row/column presses
  // (only the completing keystroke is caught in time to skip it, just
  // below). In practice row 9 is never valid for a 2x2 or 4x4 board, so
  // this is a harmless no-op today -- flagged here in case a future round
  // ever grows to 10+ rows, at which point it's worth a closer look.
  answerKeyBuffer = (answerKeyBuffer + digit).slice(-ANSWER_KEY_CODE.length);
  if (answerKeyBuffer === ANSWER_KEY_CODE) {
    answerKeyBuffer = '';
    // The title code only means anything on the title screen -- mid-run
    // the bonus board's own cards are the thing worth showing an answer
    // for, and peekAll() (below) does that on its own, no text needed.
    if (screen === 'title') ui.showAnswerToast('Title code', TITLE_CODE);
    bonusGame.peekAll(); // also flash the bonus board's hidden faces, for whoever's running it
    return; // this keystroke dialed 911 -- don't also feed it to the title code or the bonus board
  }

  if (screen === 'title') {
    if (digit === TITLE_CODE[titleCodeProgress]) {
      ui.markTitleDigitGood(titleCodeProgress, digit);
      audio.play('codeRight');
      titleCodeProgress++;
      if (titleCodeProgress === TITLE_CODE.length) {
        titleCodeProgress = 0;
        // Hold on the all-green moment for a beat -- time to orient yourself --
        // before the success tone and the game itself begin, rather than
        // firing both immediately.
        setTimeout(() => {
          audio.play('success');
          ui.playDoorOpen();
          startGame({ fromPasswordSuccess: true });
        }, 1000);
      }
    } else {
      ui.resetTitleDigits(); // clear any green already earned -- one miss costs the whole attempt
      ui.flashTitleWrong();
      audio.play('codeWrong');
      titleCodeProgress = 0;
    }
    return;
  }

  // Mid-run, in Simon mode: the number pad drives the bonus board instead --
  // see bonus.js. Classic mode has no bonus board; the digit means nothing.
  if (screen === 'playing' && !classicMode) bonusGame.handleKey(digit);
}

function handleBonusMatch(count = 1) {
  simonGame.bonus = Math.min(simonGame.bonus + count, simonGame.bonusMax);
  refreshBonusHud();
}

/** Bonus is Simon-only; Total (score + bonus) is recomputed inside
 *  ui.setHud itself whenever either half changes. */
function refreshBonusHud() {
  ui.setHud({ bonus: simonGame.bonus, bonusMax: simonGame.bonusMax });
}

const slots = allBindingSlots();
let debug = localStorage.getItem(CONFIG.storage.debug) === '1';

// No visible button, no documented shortcut -- just a link:
// ?debug=1 turns it on (and remembers that), ?debug=0 turns it off.
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

// Try right away, on load, with no gesture at all: a kiosk browser with
// autoplay allowed will actually start playing. Most browsers still block
// this, so it just leaves a suspended context with buffers preloading.
audio.unlock();
audio.playMusic('song');

// Catch the first interaction of any kind (not just START) and resume it.
function unlockOnFirstGesture() {
  audio.unlock();
  if (screen === 'title') audio.playMusic('song');
}
window.addEventListener('pointerdown', unlockOnFirstGesture, { once: true });
window.addEventListener('keydown', unlockOnFirstGesture, { once: true });

/** Everything on the title screen (and HUD) that differs between the
 *  default Simon mode and the classic reflex game. */
function applyModeUI() {
  ui.setSimonMode(!classicMode);
  ui.setScoreLabel(classicMode ? 'Score' : 'Pts');
  ui.setHud({ score: 0, round: 0, best: scores.best(activeGame().mode) });
  document.querySelector('#classicToggle').textContent = classicMode ? 'ON' : 'OFF';
  document.querySelector('#classicLegend').classList.toggle('hidden', !classicMode);
  document.querySelector('#classicHint').classList.toggle('hidden', !classicMode);
  document.querySelector('#hardBtn').classList.toggle('hidden', !classicMode);
  refreshBonusHud();
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
  titleCodeProgress = 0; // don't carry a half-typed code across screens
  ui.resetTitleDigits();
  activeGame().abort(); // stops any run music
  bonusGame.abort();
  ui.showOverlay('title');
  audio.playMusic('song');
}

// Push/pull/soap/swipe (and tap, in classic) only mean something once a run
// is live. At the title, the number-pad code is the only thing listening --
// pressing a control there is "doing something else", so it gets a buzzer
// instead of being silently ignored.
function handleAction(evt) {
  if (screen === 'title') {
    // Sound only, no shake/red -- that cue means "wrong digit of the code",
    // and a control press isn't a digit at all, so it shouldn't look like one.
    audio.play('wrong');
    return;
  }
  // Game over: whatever control you just pressed also just means "go
  // again" -- see handleDigit for the number pad's own rule during Simon's
  // game over (it keeps driving the still-live bonus board instead).
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
    refreshBonusHud();
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
  // Catch the key hint up if toggled mid-round.
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
  // Simon's own game-over view is confined to .panel-simon -- the bonus
  // board keeps running underneath it the whole time. Classic has no bonus
  // board to protect, so it keeps the full-screen card.
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

// Outside debug mode these two no longer start anything -- the title-screen
// code (see handleDigit above) is the only way in. Debug mode keeps the old
// one-click behavior so testing doesn't require dialing a code every time.
document.querySelector('#startBtn').addEventListener('click', () => { if (debug) startGame(); });
document.querySelector('#menuBtn').addEventListener('click', toTitle);
// No "GO AGAIN" button -- clicking anywhere on the game-over card that isn't
// itself an interactive element (Menu, ...) does the same thing a keypress
// or a control press does. See handleDigit/handleAction for the keyboard/
// cabinet side of the same rule. Two elements because Simon's own game-over
// view is a separate, panel-confined element (see #simonOver/handleGameOver),
// not this classic-only full-screen overlay.
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

// Two-step clear, so a stray click on the cabinet can't wipe the board.
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
// Debug cheat: while debug mode is on and a round is live, Space resolves as
// whatever this round actually wants -- drive a run forward without hunting
// for the real binding. Space and only Space; every other key falls through
// to normal input, so the keys the debug bar tells you to press keep working,
// and a genuinely wrong one still ends the run the ordinary way.
//
// Space is free during a round (outside one it starts a game, below), and
// isn't bound to any pad. Capture phase + stopImmediatePropagation keeps that
// start-game handler -- and the page's own scroll -- out of it. Both modes.
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

  // Simon: no variants, no tap pad, and swipe doesn't care which way --
  // just push/pull/soap/swipe, so lastDebugStep.actionId is enough.
  e.preventDefault();
  e.stopImmediatePropagation();
  // No step pending means it's playback or the between-rounds gap. Give the
  // same "not yet" cue a real pad press gets there, rather than nothing.
  if (!simonGame.lastDebugStep) {
    ui.flash('nothing');
    return;
  }
  simonGame.handleInput({ actionId: simonGame.lastDebugStep.actionId });
}, true);

// Global keys. Action keys are consumed by Input before we get here, so these
// only fire for keys that aren't bound to a control.
window.addEventListener('keydown', (e) => {
  if (input.capture) return; // remap screen is eating keys
  if (e.defaultPrevented) return;

  // Any keypress at all, while the title is up, is what starts the title's
  // own grow/shrink/gray hint counting -- see UI.noteTitleActivity. A
  // title nobody's touched yet should never look mid-hint.
  if (screen === 'title') ui.noteTitleActivity();

  // The 911 easter egg works from anywhere; a digit is otherwise unbound to
  // any control, so this never steals a keystroke another handler wants.
  const digit = DIGIT_KEYS[e.code];
  if (digit !== undefined && !e.repeat) { handleDigit(digit); return; }


  if (e.code === 'KeyM') { toggleMute(); return; }
  if (e.code === 'Backquote') { toggleDebug(); return; }

  if (screen === 'remap' || screen === 'scores') {
    if (e.code === 'Escape') toTitle();
    return;
  }

  // Game over: Escape backs out to the menu; literally anything else just
  // goes again -- there's no "go again" button to find, and no "new team"
  // reset on offer, since a retry already carries the score and bonus
  // forward on its own (see SimonGame.start()'s resuming check). Digits
  // never reach here -- they're handled above by handleDigit, which keeps
  // driving the still-live bonus board instead (Simon mode only).
  if (screen === 'over') {
    if (e.code === 'Escape') { toTitle(); return; }
    if (!e.repeat) { e.preventDefault(); startGame(); }
    return;
  }

  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    if (activeGame().state === STATE.PLAYING) return;
    // Title screen now takes the number-pad code instead, unless debugging.
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
