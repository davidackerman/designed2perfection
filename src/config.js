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
    firstStepHoldMultiplier: 4, // the very first step after dialing in stays lit this many times as long, so the transition is unmistakable
    failShowMs: 2000,        // a fail shows the round's score/best for this long, then the next sequence starts on its own -- no "press anything" needed
    bonusMax: 11,            // 2 (round 1) + 8 (round 2) + 1 flat point for solving round 3's JANELIA
    tones: {
      // One tone per pad, in a rough Simon-style spread across an octave-ish
      // range so they're easy to tell apart by ear.
      push: 329.63,  // E4
      pull: 277.18,  // C#4
      soap: 220.0,   // A3
      swipe: 164.81, // E3
    },
  },

  // The bonus board: runs live, side by side with Simon, on the number pad.
  // Rounds 1-2 are memory-match card grids; round 3 is a hidden-word
  // challenge (JANELIA) and the end of the progression -- see bonus.js.
  bonus: {
    resultHoldMs: 1200,  // a resolved pair (match or mismatch) stays face-up this long before it clears/flips back
    matchClearMs: 400,   // fade-out duration once a match is confirmed
    peekMs: 2000,        // the 911 cheat: how long every card flips face-up
    janeliaPoints: 1,    // flat bonus for solving round 3's JANELIA
    rounds: [
      { size: 2, kind: 'shapes' },  // 2x2, 2 pairs of simple shapes
      { size: 4, kind: 'alnum' },   // 4x4, 8 pairs from 0-9/A-Z, plus a faint decoy character per card back
      { kind: 'janelia' },         // 7 blank squares spelling JANELIA; the last round -- nothing after it
    ],
  },

  // Test build's own bonus board (inconvenient2.html/main2.js): the same
  // memory-match engine (bonus.js), reconfigured -- pictures instead of
  // shapes/letters on the cards (and no decoy character on the back, since
  // there's no printed alnum content to hide among), and JANELIA worth more
  // (a deliberate top-off, not just parity with the other two rounds).
  memory: {
    resultHoldMs: 1200,
    matchClearMs: 400,
    peekMs: 2000,
    janeliaPoints: 2,
    picturePool: [
      'assets/img/labs/lab1.png',
      'assets/img/labs/lab2.png',
      'assets/img/labs/lab3.png',
      'assets/img/labs/lab4.png',
      'assets/img/labs/lab5.png',
      'assets/img/labs/lab6.png',
      'assets/img/labs/lab7.png',
      'assets/img/labs/lab8.png',
      'assets/img/labs/lab9.png',
      'assets/img/labs/lab10.png',
    ],
    rounds: [
      { size: 2, kind: 'pictures' },
      { size: 4, kind: 'pictures' },
      { kind: 'janelia' },
    ],
  },

  // Alternate bonus minigame, tried out at inconvenient2.html/main2.js
  // instead of the memory-match board: beat the computer's even/odd guesser.
  // Score multiplier, not a flat bonus -- see src/evenodd.js. Not currently
  // wired up to any page (superseded by the memory board above), but left
  // in place in case it's worth revisiting.
  evenOdd: {
    entryWindowMs: 5000,          // must enter a digit within this window, or the run's multiplier resets to min
    historyLen: 20,                 // how many recent guesses the on-screen log shows -- display cap only; accuracy/multiplier are cumulative since the last reset, not windowed to this
    plotLen: 40,                  // how many past multiplier values the running plot keeps
    accuracyForMaxMultiplier: 0.4,  // computer at or below this accuracy -> x2 (wrong 60%+ of the time -- actually beating it, not just a coin flip)
    accuracyForMinMultiplier: 0.75, // computer at or above this accuracy -> x1 (it's reading you)
    multiplierMax: 2,
    multiplierMin: 1,
    // The multiplier doesn't actually apply to your score until you've
    // sustained this many guesses since the last reset -- short of that,
    // the applied multiplier stays pinned at multiplierMin (1) no matter
    // how well you're doing, so a reset before qualifying costs nothing
    // (there was nothing locked in yet) and one past it keeps applying
    // the live number continuously, same as it does today.
    qualifyGuesses: 20,
  },

  // Third test build (inconvenient3.html/main3.js/typing.js): Simon stays on
  // the right, unchanged; the left half swaps the memory board for a
  // ZType-style typing minigame -- AI logos fall toward a cursor "ship" at
  // the bottom and you shoot them down by dialing the phone-keypad key for
  // each letter of the word printed on them (same key-for-letter idea as
  // JANELIA in bonus.js, just duplicated here rather than shared, per this
  // codebase's usual one-off-test-build approach).
  typing: {
    maxAlive: 5,                 // ships on screen at once, ceiling
    spawnMsStart: 2900,          // ms between spawns at the very start
    spawnMsMin: 1200,            // floor, once spawnRampKills is reached
    spawnRampKills: 25,
    fallMsStart: 19000,          // ms to cross from top to the cursor at the start
    fallMsMin: 7500,             // floor, once fallRampKills is reached
    fallRampKills: 25,
    escapeY: 92,                 // % down the field a ship counts as having reached the cursor
    wordLengthThreshold: 10,     // kills before 3-letter words start appearing instead of single letters
    // No Q or Z -- a rotary dial never had letters for either (see
    // typing.js's PHONE_KEYS), so neither could ever be shot down.
    letters: 'ABCDEFGHIJKLMNOPRSTUVWXY'.split(''),
    words3: [
      'DOG', 'CAT', 'FOX', 'OWL', 'BEE', 'ANT', 'BAT', 'COW', 'PIG', 'RAM',
      'YAK', 'ELK', 'JAY', 'KOI', 'EEL', 'HEN', 'SOW', 'DOE', 'EWE', 'BOT',
      'APE', 'COD', 'ORC', 'ODD', 'EGO', 'ICE', 'JOB',
    ],
    // The enemies -- nessie.png is the player's own ship (see #typingCursor
    // in inconvenient3.html/CSS's .typing-cursor), not one of these.
    icons: [
      'assets/img/ai/chatgpt.png',
      'assets/img/ai/claude.png',
      'assets/img/ai/gemini.png',
      'assets/img/ai/grok.png',
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
    typingBest: 'janelia-it:typing-best', // inconvenient3.html's own persisted best -- see main3.js
    muted: 'janelia-it:muted',
    musicVolume: 'janelia-it:music-volume',
    // Bumped when the default keymap changes: Input.load() prefers whatever is
    // saved here over the defaults, so without a new key a cabinet that had
    // ever visited the Controls screen would silently keep the old mapping.
    bindings: 'janelia-it:bindings:v2',
    debug: 'janelia-it:debug',
  },
};
