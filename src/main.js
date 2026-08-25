import { UI } from './ui.js';
import { Game, STATE } from './game.js';
import { AudioManager } from './audio.js';
import { Input, allBindingSlots } from './input.js';
import { CONFIG } from './config.js';
import { ScoreStore } from './scores.js';

const ui = new UI();
const audio = new AudioManager();
const scores = new ScoreStore();
const game = new Game({ ui, audio, scores, onGameOver: handleGameOver });
const input = new Input(
  (evt) => game.handleInput(evt),
  (raw) => ui.markKey(raw)
);
ui.keyFor = (slot) => input.keyFor(slot);

let screen = 'title'; // title | playing | over | remap | scores
let scoresTab = 'normal';
let pending = null;    // the run awaiting initials

const slots = allBindingSlots();
let debug = localStorage.getItem(CONFIG.storage.debug) === '1';

ui.setHardMode(game.hardMode);
ui.setMuted(audio.muted);
ui.setHud({ score: 0, round: 0, best: scores.best(game.mode) });
ui.clearChallenge();
ui.setDebug(debug, slots);
ui.showOverlay('title');

function toTitle() {
  screen = 'title';
  game.abort();
  ui.showOverlay('title');
}

function startGame() {
  audio.unlock();
  screen = 'playing';
  game.start();
}

function toggleHard() {
  game.setHardMode(!game.hardMode);
  ui.setHardMode(game.hardMode);
  ui.setHud({ best: scores.best(game.mode) });
}

function toggleDebug() {
  debug = !debug;
  localStorage.setItem(CONFIG.storage.debug, debug ? '1' : '0');
  ui.setDebug(debug, slots);
  ui.setDebugExpected(game.challenge); // catch up if toggled mid-round
}

function toggleMute() {
  ui.setMuted(audio.toggleMute());
}

// --- scores ---------------------------------------------------------------

function handleGameOver(result) {
  screen = 'over';
  pending = result.qualifies ? result : null;
  ui.setHud({ best: scores.best(result.mode) });
  ui.showGameOver({
    ...result,
    best: scores.best(result.mode),
    board: scores.board(result.mode),
    rank: -1,                       // assigned once the initials are in
    defaultName: scores.lastName,
  });
}

function saveScore(initials) {
  if (!pending) return;
  const { mode, score } = pending;
  const rank = scores.add(mode, initials, score);
  pending = null;
  ui.setHud({ best: scores.best(mode) });
  ui.confirmEntry({ mode, board: scores.board(mode), rank, best: scores.best(mode) });
}

function showScores(mode = scoresTab) {
  scoresTab = mode;
  screen = 'scores';
  game.abort();
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
  game.abort();
  drawBindings();
  ui.showOverlay('remap');
}

document.querySelector('#startBtn').addEventListener('click', startGame);
document.querySelector('#againBtn').addEventListener('click', startGame);
document.querySelector('#menuBtn').addEventListener('click', toTitle);
document.querySelector('#remapBtn').addEventListener('click', toRemap);
document.querySelector('#remapDoneBtn').addEventListener('click', toTitle);
document.querySelector('#remapResetBtn').addEventListener('click', () => {
  input.reset();
  drawBindings();
  if (debug) ui.renderDebugKeys(slots);
});
document.querySelector('#hardBtn').addEventListener('click', toggleHard);
document.querySelector('#debugBtn').addEventListener('click', toggleDebug);
document.querySelector('#scoresBtn').addEventListener('click', () => showScores(game.mode));
document.querySelector('#scoresDoneBtn').addEventListener('click', toTitle);
document.querySelector('#tabNormal').addEventListener('click', () => showScores('normal'));
document.querySelector('#tabHard').addEventListener('click', () => showScores('hard'));

document.querySelector('#entryRow').addEventListener('submit', (e) => {
  e.preventDefault();
  saveScore(document.querySelector('#initials').value);
});

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

// Global keys. Action keys are consumed by Input before we get here, so these
// only fire for keys that aren't bound to a control.
window.addEventListener('keydown', (e) => {
  if (input.capture) return; // remap screen is eating keys
  if (isTyping(e)) return;   // entering initials
  if (e.defaultPrevented) return;

  if (e.code === 'KeyM') { toggleMute(); return; }
  if (e.code === 'Backquote') { toggleDebug(); return; }

  if (screen === 'remap' || screen === 'scores') {
    if (e.code === 'Escape') toTitle();
    return;
  }

  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    if (game.state !== STATE.PLAYING) startGame();
    return;
  }

  if (e.code === 'KeyH' && game.state !== STATE.PLAYING) { toggleHard(); return; }
  if (e.code === 'Escape' && game.state === STATE.PLAYING) toTitle();
});

function isTyping(e) {
  const el = e.target;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause();
  else game.resume();
});
