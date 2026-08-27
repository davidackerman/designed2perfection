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
    inputWindowMs: 2500,     // time allowed for the first press of a round
    inputMinWindowMs: 1200,  // floor for that same window
    inputDecay: 0.95,        // inputWindowMs *= decay per round
    interRoundMs: 900,       // pause after a correct sequence before it grows
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
    bindings: 'janelia-it:bindings',
    debug: 'janelia-it:debug',
  },
};
