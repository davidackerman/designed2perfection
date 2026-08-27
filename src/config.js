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
    // your next pick. Its accuracy is cumulative since the run started --
    // "reading you," the speed knob, and the debug graph all read that same
    // number. Every point it holds above 50% compounds the round windows
    // tighter; every point below compounds them looser -- on top of the
    // normal decay above. No effect for the first warmupPicks, since
    // accuracy over a handful of picks is mostly noise.
    tickMs: 950,             // suggested pace for the on-screen pulse cue
    adaptRate: 0.045,        // speed drift per pick, tuned to ~(1 - timing.decay)
    warmupPicks: 10,         // picks before the speed effect kicks in at all
    perPointFactor: 0.8,     // window *= this per point of accuracy past 50%, compounding
    minMultiplier: 0.35,     // floor: fastest the line can push rounds
    maxMultiplier: 3,        // ceiling: most generous the line can make rounds
    chartLength: 10,         // debug mode: how many recent picks the accuracy graph/hit strip show
    chartRangeMin: 0.4,      // debug mode: fixed y-axis floor for the accuracy graph
    chartRangeMax: 0.7,      // debug mode: fixed y-axis ceiling for the accuracy graph
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
    musicVolume: 'janelia-it:music-volume',
    bindings: 'janelia-it:bindings',
    debug: 'janelia-it:debug',
  },
};
