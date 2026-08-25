import { UI } from './ui.js';
import { Game, STATE } from './game.js';
import { AudioManager } from './audio.js';
import { Input, allBindingSlots } from './input.js';

const ui = new UI();
const audio = new AudioManager();
const game = new Game({ ui, audio });
const input = new Input((evt) => game.handleInput(evt));

let screen = 'title'; // title | playing | over | remap

ui.setHardMode(game.hardMode);
ui.setMuted(audio.muted);
ui.setHud({ score: 0, round: 0, best: game.best });
ui.clearChallenge();
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
}

function toggleMute() {
  ui.setMuted(audio.toggleMute());
}

// --- remap screen ---------------------------------------------------------

const slots = allBindingSlots();

function drawBindings(capturing = null) {
  ui.renderBindings(slots, input, beginRebind, capturing);
}

function beginRebind(slotId) {
  drawBindings(slotId);
  input.beginCapture(slotId, () => drawBindings());
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
});
document.querySelector('#hardBtn').addEventListener('click', toggleHard);
document.querySelector('#muteBadge').addEventListener('click', toggleMute);

// Global keys. Action keys are consumed by Input before we get here, so these
// only fire for keys that aren't bound to a control.
window.addEventListener('keydown', (e) => {
  if (input.capture) return; // remap screen is eating keys
  if (e.defaultPrevented) return;

  if (e.code === 'KeyM') { toggleMute(); return; }

  if (screen === 'remap') {
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

// Game over is reached from inside the game loop, so mirror it into `screen`.
const origFail = game.fail.bind(game);
game.fail = (reason) => { screen = 'over'; origFail(reason); };

document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause();
  else game.resume();
});
