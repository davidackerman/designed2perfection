// All gameplay tuning lives here. Tweak by feel; nothing else needs to change.

export const CONFIG = {
  timing: {
    startWindowMs: 3000,     // time allowed on round 1
    minWindowMs: 800,        // floor before "brutal" kicks in
    decay: 0.955,            // window *= decay each round
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

  rotary: {
    // The dial you spin at the AI all run: pick 0 or 1, it tries to call
    // your next pick. Hold it near 50/50 and the round windows ease up;
    // let it read you and they tighten -- on top of the normal decay above.
    tickMs: 950,             // suggested pace for the on-screen pulse cue
    accuracyWindow: 12,      // how many recent picks the difficulty knob looks at
    adaptRate: 0.045,        // speed drift per pick, tuned to ~(1 - timing.decay)
    minMultiplier: 0.72,     // predictor reading you well: windows shrink faster
    maxMultiplier: 1.35,     // holding it near 50/50: windows stay generous
    easyAccuracy: 0.5,       // rolling accuracy at/below this drifts toward maxMultiplier
    hardAccuracy: 0.75,      // rolling accuracy at/above this drifts toward minMultiplier
    chartLength: 300,        // debug mode: how many recent picks the accuracy graph keeps
  },

  scores: {
    maxEntries: 10,          // per board
    initialsLength: 3,
  },

  storage: {
    scores: 'janelia-it:scores',
    best: 'janelia-it:best', // legacy single value, migrated into the board
    hardMode: 'janelia-it:hard',
    muted: 'janelia-it:muted',
    bindings: 'janelia-it:bindings',
    debug: 'janelia-it:debug',
  },
};
