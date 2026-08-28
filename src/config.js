// All gameplay tuning lives here. Tweak by feel; nothing else needs to change.

export const CONFIG = {
  timing: {
    startWindowMs: 4000,     // flat time allowed during the first warmupRounds
    warmupRounds: 5,         // rounds held at startWindowMs before decay begins
    minWindowMs: 800,        // floor before "brutal" kicks in
    decay: 0.955,            // window *= decay each round, once warmupRounds has passed
    brutalRound: 30,         // past this round the floor drops again
    brutalMinWindowMs: 550,
    interRoundMs: 380,       // pause between a success and the next command
    denyPenaltyMs: 450,      // cost of a wrong card orientation
  },

  hardMode: {
    graceRounds: 5,          // rounds where picture and word still agree
    rampRounds: 25,          // rounds over which the lying ramps to maxMismatch
    maxMismatch: 0.65,       // eventual chance the word is a decoy
  },

  soap: {
    // The dispenser is, as ever, ineffective.
    minHits: 1,
    maxHits: 3,
    hitsRampRound: 8,        // before this round it is always 1 hit
    perExtraHitMs: 420,      // extra time granted per required extra wave
  },

  // The default mode: a growing tone-and-picture sequence you repeat back,
  // exactly like the classic. Deliberately not explained anywhere on
  // screen -- first-timers are meant to work out the rule by watching.
  simon: {
    startStepMs: 700,        // how long the first step of a run stays lit
    minStepMs: 300,          // floor -- playback never gets faster than this
    decay: 0.93,             // stepMs *= decay per round (i.e. per sequence length)
    gapRatio: 0.5,           // dark gap between steps, as a fraction of stepMs
    // No knobs for the answer clock: there isn't one. Take as long as you
    // like over a press -- only a wrong pad ends the run.
    interRoundMs: 900,       // pause after a correct sequence before it grows
    orientPauseMs: 1500,     // pause after the title transition before the first round plays, so it isn't sprung on you
    bonusMax: 10,            // bonus meter ceiling; scoring TBD
    tones: {
      // One tone per pad, in a rough Simon-style spread across an octave-ish
      // range so they're easy to tell apart by ear.
      push: 329.63,  // E4
      pull: 277.18,  // C#4
      soap: 220.0,   // A3
      swipe: 164.81, // E3
    },
  },

  // The bonus board: a memory-match minigame that runs live, side by side
  // with Simon, on the number pad. Round 1 is a trivial 2x2 (labels double
  // as the match positions); round 2 on is a 4x4 where the label you dial
  // and the symbol you're matching are two independent random draws.
  bonus: {
    resultHoldMs: 1200,  // a resolved pair (match or mismatch) stays face-up this long before it clears/flips back
    matchClearMs: 400,   // fade-out duration once a match is confirmed
    peekMs: 1000,        // the 911 cheat: how long every card flips face-up
    // Standard phone-keypad letter groups. 0 and 1 have no letters -- a bare
    // digit label is dialed as "<digit>,0" so entry is always exactly two
    // keys once round 2 mixes digits and letters. See the 911 answer key.
    phoneKeys: { 2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL', 6: 'MNO', 7: 'PQRS', 8: 'TUV', 9: 'WXYZ' },
    rounds: [
      { size: 2, kind: 'shapes' }, // 2x2, 2 pairs, positions dialed as a single digit 0-3
      { size: 4, kind: 'alnum' },  // 4x4, 8 pairs, positions dialed as two keys (see phoneKeys)
    ],
  },

  scores: {
    maxEntries: 10,          // per board
    initialsLength: 3,
  },

  storage: {
    scores: 'janelia-it:scores',
    best: 'janelia-it:best', // legacy single value, migrated into the board
    hardMode: 'janelia-it:hard',
    classicMode: 'janelia-it:classic',
    muted: 'janelia-it:muted',
    musicVolume: 'janelia-it:music-volume',
    // Bumped when the default keymap changes: Input.load() prefers whatever is
    // saved here over the defaults, so without a new key a cabinet that had
    // ever visited the Controls screen would silently keep the old mapping.
    bindings: 'janelia-it:bindings:v2',
    debug: 'janelia-it:debug',
  },
};
