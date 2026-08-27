import { UI } from './ui.js';
import { Game, STATE } from './game.js';
import { SimonGame } from './simon.js';
import { AudioManager } from './audio.js';
import { Input, allBindingSlots } from './input.js';
import { CONFIG } from './config.js';
import { ScoreStore } from './scores.js';

const ui = new UI();
const audio = new AudioManager();
const scores = new ScoreStore();
const reflexGame = new Game({ ui, audio, scores, onGameOver: handleGameOver });
const simonGame = new SimonGame({ ui, audio, scores, onGameOver: handleGameOver });

let classicMode = localStorage.getItem(CONFIG.storage.classicMode) === '1';
const activeGame = () => (classicMode ? reflexGame : simonGame);

const input = new Input(
  (evt) => activeGame().handleInput(evt),
  (raw) => ui.markKey(raw)
);
ui.keyFor = (slot) => input.keyFor(slot);

let screen = 'title'; // title | playing | over | remap | scores
let scoresTab = 'simon';
let pending = null;    // the run awaiting initials

const slots = allBindingSlots();
let debug = localStorage.getItem(CONFIG.storage.debug) === '1';

ui.setHardMode(reflexGame.hardMode);
ui.setMuted(audio.muted);
ui.setDebug(debug, slots);
applyModeUI();
ui.showOverlay('title');
audio.playMusic('song'); // silently does nothing pre-unlock; the very first load is muted until then

/** Everything on the title screen (and HUD) that differs between the
 *  default Simon mode and the classic reflex game. */
function applyModeUI() {
  ui.setSimonMode(!classicMode);
  ui.setScoreLabel(classicMode ? 'Score' : 'Pts');
  ui.setHud({ score: 0, round: 0, best: scores.best(activeGame().mode) });
  document.querySelector('#classicToggle').textContent = classicMode ? 'ON' : 'OFF';
  document.querySelector('#simonTagline').classList.toggle('hidden', classicMode);
  document.querySelector('#classicLegend').classList.toggle('hidden', !classicMode);
  document.querySelector('#classicHint').classList.toggle('hidden', !classicMode);
  document.querySelector('#hardBtn').classList.toggle('hidden', !classicMode);
}

function toggleClassic() {
  classicMode = !classicMode;
  localStorage.setItem(CONFIG.storage.classicMode, classicMode ? '1' : '0');
  toTitle();
  applyModeUI();
}

function toTitle() {
  screen = 'title';
  activeGame().abort(); // stops any run music
  ui.showOverlay('title');
  audio.playMusic('song');
}

function startGame() {
  audio.unlock();
  screen = 'playing';
  activeGame().start();
}

function newTeam() {
  activeGame().newTeam();
  startGame();
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
  activeGame().abort();
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
  drawBindings();
  ui.showOverlay('remap');
}

document.querySelector('#startBtn').addEventListener('click', startGame);
document.querySelector('#againBtn').addEventListener('click', startGame);
document.querySelector('#overNewTeamBtn').addEventListener('click', newTeam);
document.querySelector('#newTeamBtn').addEventListener('click', newTeam);
document.querySelector('#menuBtn').addEventListener('click', toTitle);
document.querySelector('#remapBtn').addEventListener('click', toRemap);
document.querySelector('#remapDoneBtn').addEventListener('click', toTitle);
document.querySelector('#remapResetBtn').addEventListener('click', () => {
  input.reset();
  drawBindings();
  if (debug) ui.renderDebugKeys(slots);
});
document.querySelector('#hardBtn').addEventListener('click', toggleHard);
document.querySelector('#classicBtn').addEventListener('click', toggleClassic);
document.querySelector('#debugBtn').addEventListener('click', toggleDebug);
document.querySelector('#scoresBtn').addEventListener('click', () => showScores(activeGame().mode));
document.querySelector('#scoresDoneBtn').addEventListener('click', toTitle);
document.querySelector('#tabSimon').addEventListener('click', () => showScores('simon'));
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
const musicVolumeInput = document.querySelector('#musicVolume');
musicVolumeInput.value = audio.musicVolume;
musicVolumeInput.addEventListener('input', (e) => {
  audio.setMusicVolume(parseFloat(e.target.value));
});
// Debug cheat: while debug mode is on and a round is live, D always resolves
// as correct and every other key as wrong -- drive the win/lose paths without
// hunting for the real binding. Capture phase + stopImmediatePropagation so
// this fully replaces normal input handling for the event instead of also
// letting Input's own listener process it. Classic mode only: Simon has no
// `challenge` object shaped like this to resolve.
window.addEventListener('keydown', (e) => {
  if (!debug || !classicMode || reflexGame.state !== STATE.PLAYING || !reflexGame.challenge) return;
  if (isTyping(e) || e.repeat) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.code === 'KeyD') {
    reflexGame.handleInput({ actionId: reflexGame.challenge.action.id, variantId: reflexGame.challenge.variantId });
  } else {
    reflexGame.fail('wrong');
  }
}, true);

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
    if (activeGame().state !== STATE.PLAYING) startGame();
    return;
  }

  if (e.code === 'KeyH' && classicMode && activeGame().state !== STATE.PLAYING) { toggleHard(); return; }
  if (e.code === 'Escape' && activeGame().state === STATE.PLAYING) toTitle();
});

function isTyping(e) {
  const el = e.target;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) activeGame().pause();
  else activeGame().resume();
});
