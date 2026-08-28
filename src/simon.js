// The default game: a tone-and-picture sequence that grows by one every
// round. Repeat it back in order; get it right and it plays again with one
// more step added, faster than last time. There is no clock on your answer --
// take as long as you like; the only way to lose is to press the wrong pad.
//
// Deliberately not narrated anywhere in the UI -- first-timers work out the
// rule by watching a round or two. See ui.js for the flash/tone-only stage
// treatment that keeps it that way (no placard, no instructional video).

import { CONFIG } from './config.js';
import { STATE } from './state.js';

const PADS = ['push', 'pull', 'soap', 'swipe'];

// Debug hint only: which bound key counts as this pad. Every Simon pad is a
// single control -- tap, the one action with real variants, isn't a pad.
const PAD_SLOTS = {
  push: ['push:default'],
  pull: ['pull:default'],
  soap: ['soap:default'],
  swipe: ['swipe:default'],
};

const WRONG = 'Wrong one. Everyone saw.';

export class SimonGame {
  constructor({ ui, audio, scores, onGameOver }) {
    this.ui = ui;
    this.audio = audio;
    this.scores = scores;
    this.onGameOver = onGameOver;
    this.state = STATE.TITLE;
    this.sequence = [];
    this.round = 0;
    this.score = 0;
    this.inputIndex = 0;
    this.pressed = [];  // this round's presses, for the game-over recap
    this.phase = null; // 'playback' | 'input' | 'gap'
    this.playbackTimer = null;
    this.gapTimer = null;
    this.paused = false;
    this.bonus = 0;
    this.bonusMax = CONFIG.simon.bonusMax;
    this.lastDebugStep = null; // for main.js to catch the debug hint up when toggled mid-round
    this.holdFirstStep = false; // set by start(): double the very next step's duration
  }

  get mode() {
    return 'simon';
  }

  stepMsFor(round) {
    const s = CONFIG.simon;
    return Math.max(s.minStepMs, s.startStepMs * Math.pow(s.decay, Math.max(0, round - 1)));
  }

  start({ fromPasswordSuccess = false } = {}) {
    this.stopTimers();
    this.state = STATE.PLAYING;
    this.paused = false;
    // A run already in progress (failed, then started again) picks back up
    // at the round it ended on, replaying the same sequence, rather than
    // starting over at round 1 -- score and bonus carry over the same way.
    // Nothing ever resets this mid-session; only a fresh page load does.
    const resuming = this.sequence.length > 0;
    if (!resuming) {
      this.sequence = [];
      this.round = 0;
      this.score = 0;
    }
    // Whatever round this is, its first step is the first thing you see
    // right after dialing the code -- hold it twice as long (tone and
    // highlight both) so the transition obviously landed somewhere.
    this.holdFirstStep = fromPasswordSuccess;
    this.ui.hideOverlays();
    this.ui.setSimonMode(true);
    this.ui.clearSimonStep();
    this.ui.setHud({
      score: this.score,
      round: this.round,
      best: this.scores.best(this.mode),
      bonus: this.bonus,
      bonusMax: this.bonusMax,
    });
    this.audio.play('start');
    // No background music once a round is live -- title screen only.
    this.audio.stopMusic();
    const begin = () => {
      if (resuming) {
        this.inputIndex = 0;
        this.pressed = [];
        this.playSequence();
      } else {
        this.nextRound();
      }
    };
    if (fromPasswordSuccess) {
      // A beat to take in the stage -- the four pads sitting there, nothing
      // happening yet -- before the first round starts throwing tones at you.
      this.playbackTimer = setTimeout(begin, CONFIG.simon.orientPauseMs);
    } else {
      begin();
    }
  }

  nextRound() {
    this.round += 1;
    this.sequence.push(PADS[Math.floor(Math.random() * PADS.length)]);
    this.inputIndex = 0;
    this.pressed = [];
    this.ui.setHud({ round: this.round });
    this.playSequence();
  }

  playSequence() {
    this.phase = 'playback';
    this.ui.setTimer(0);
    const stepMs = this.stepMsFor(this.round);
    const gapMs = stepMs * CONFIG.simon.gapRatio;
    let i = 0;
    const playStep = () => {
      if (this.state !== STATE.PLAYING || this.paused) return;
      if (i >= this.sequence.length) {
        this.beginInput();
        return;
      }
      const actionId = this.sequence[i];
      // The first step right after dialing the code in is the most jarring
      // transition players see -- hold it several times as long (tone +
      // highlight both) so it can't be missed the way a normal-speed flash
      // could be. Only that one step: clear the flag the instant it's used.
      const thisStepMs = (i === 0 && this.holdFirstStep)
        ? stepMs * CONFIG.simon.firstStepHoldMultiplier
        : stepMs;
      if (i === 0) this.holdFirstStep = false;
      i += 1;
      this.lightPad(actionId, thisStepMs);
      this.playbackTimer = setTimeout(() => {
        this.ui.clearSimonStep();
        this.playbackTimer = setTimeout(playStep, gapMs);
      }, thisStepMs);
    };
    this.ui.clearSimonStep();
    this.playbackTimer = setTimeout(playStep, gapMs);
  }

  lightPad(actionId, durationMs, { press = false } = {}) {
    this.ui.flashSimonStep(actionId, { press });
    this.audio.playTone(CONFIG.simon.tones[actionId], durationMs);
  }

  beginInput() {
    this.phase = 'input';
    this.awaitPress();
  }

  /** Wait for the next press. There's no clock here on purpose -- you can
   *  stand and think about it as long as you like; only a wrong pad ends the
   *  run. All this does is publish which step is outstanding, for debug mode. */
  awaitPress() {
    const actionId = this.sequence[this.inputIndex];
    this.lastDebugStep = {
      actionId,
      slots: PAD_SLOTS[actionId],
      index: this.inputIndex + 1,
      total: this.sequence.length,
    };
    this.ui.setSimonDebugStep(this.lastDebugStep);
  }

  /** Simon mode keys off the action only, never the variant -- none of the
   *  four pads has one. No Bop-It-style press sfx here -- whatever
   *  pad you press lights up with its own flash+tone, same as a real Simon
   *  console, whether you turn out to be right or wrong. Lit for the same
   *  duration as this round's own playback step, not a separate fixed length.
   *
   *  Presses are never rate-limited: the flash and tone both retrigger, so
   *  hammering the same pad twice in a row reads as two distinct presses
   *  rather than one held glow. */
  handleInput({ actionId }) {
    if (this.state !== STATE.PLAYING) return;
    if (this.phase !== 'input') {
      // Playback, or the gap between rounds. Pressing here isn't a mistake and
      // costs nothing -- but at low rounds it's most of the wall clock, and
      // swallowing it in silence is indistinguishable from a dropped input.
      // Say "not yet" instead of nothing -- a stage-wide nudge plus an
      // explicit "WAIT" label, so it reads as "hang on" rather than "did
      // that even register?".
      this.ui.flash('nothing');
      this.ui.showSimonWaitHint();
      return;
    }

    const stepMs = this.stepMsFor(this.round);
    this.lightPad(actionId, stepMs, { press: true });
    clearTimeout(this.ackTimer);
    this.ackTimer = setTimeout(() => this.ui.clearSimonStep(), stepMs);

    this.pressed.push(actionId);

    const expected = this.sequence[this.inputIndex];
    if (actionId !== expected) {
      this.fail('wrong');
      return;
    }

    this.inputIndex += 1;
    if (this.inputIndex >= this.sequence.length) {
      this.succeed();
    } else {
      this.awaitPress();
    }
  }

  succeed() {
    this.phase = 'gap';
    this.score = this.round;
    this.ui.setHud({ score: this.score });
    this.ui.setTimer(0);
    this.ui.flash('good');
    // No sound here on purpose -- Simon's only feedback for a correct round
    // is the flash, same as the no-click-sfx rule on individual presses.
    this.lastDebugStep = null;
    this.ui.setSimonDebugStep(null);
    this.gapTimer = setTimeout(() => {
      if (this.state === STATE.PLAYING) this.nextRound();
    }, CONFIG.simon.interRoundMs);
  }

  fail() {
    const causeAction = this.sequence[this.inputIndex] || null;
    this.stopTimers();
    this.state = STATE.OVER;
    this.ui.setTimer(0);
    this.ui.clearSimonStep();
    this.ui.flash('bad');
    this.audio.stopTone(); // don't leave the last pad's note ringing over the loss sfx
    this.audio.stopMusic();
    this.audio.play('lose');
    this.audio.play('gameover');
    this.lastDebugStep = null;
    this.ui.setSimonDebugStep(null);

    this.scores.recordGame({ score: this.score, causeAction });
    this.onGameOver({
      score: this.score,
      mode: this.mode,
      causeAction,
      reason: WRONG,
      // The round you died on, against what you actually pressed -- ui.js lays
      // the two out step by step so the divergence is visible, not remembered.
      sequence: this.sequence.slice(),
      pressed: this.pressed.slice(),
      qualifies: this.scores.qualifies(this.mode, this.score),
    });
  }

  /** Tab hidden. Waiting on a press needs no handling at all now that there's
   *  no clock on it -- only the two timed phases do. Mid-playback, the simplest
   *  correct thing is to replay the sequence from the top once we're back. */
  pause() {
    if (this.state !== STATE.PLAYING || this.paused) return;
    this.paused = true;
    this.stopTimers();
  }

  resume() {
    if (this.state !== STATE.PLAYING || !this.paused) return;
    this.paused = false;
    if (this.phase === 'input') return; // nothing was running; the press still stands
    if (this.phase === 'gap') {
      this.gapTimer = setTimeout(() => {
        if (this.state === STATE.PLAYING) this.nextRound();
      }, CONFIG.simon.interRoundMs);
    } else {
      this.playSequence();
    }
  }

  abort() {
    this.stopTimers();
    this.audio.stopTone();
    this.audio.stopMusic();
    this.state = STATE.TITLE;
    this.ui.clearSimonStep();
    this.ui.setTimer(0);
    this.lastDebugStep = null;
    this.ui.setSimonDebugStep(null);
  }

  stopTimers() {
    clearTimeout(this.playbackTimer);
    this.playbackTimer = null;
    clearTimeout(this.gapTimer);
    this.gapTimer = null;
    clearTimeout(this.ackTimer);
    this.ackTimer = null;
  }
}
