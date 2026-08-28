# Handoff: Simon mode

What changed, why, and what's still open. Written after the session that
added the Simon-style default mode on top of the original reflex game.
Read [README.md](README.md) first for the overall project; this is the
delta on top of it.

## The big picture

The game now has two modes:

- **Simon (default)** — a tone-and-picture sequence that grows by one step
  every round and speeds up, like the classic handheld. Nothing on screen
  explains the rule anywhere; first-timers are meant to work it out by
  watching a round or two.
- **Classic** — the original five-command reflex game (push/pull/soap/
  swipe/tap, placards, hard mode, high score boards). Unchanged in behavior,
  just no longer the default. Toggle it on the title screen ("Classic mode:
  OFF/ON" — off by default).

Both modes share the same `UI`/`AudioManager`/`ScoreStore`/`Input` plumbing,
but are otherwise separate engines: [`src/game.js`](src/game.js) (Classic)
and [`src/simon.js`](src/simon.js) (Simon). `main.js` picks whichever is
active via `classicMode` and routes almost everything through
`activeGame()`.

## What's new, file by file

- **`src/simon.js`** (new) — the whole Simon engine: growing sequence,
  playback timing, input timing, scoring (score = longest sequence
  completed), bonus meter scaffold. See `CONFIG.simon` in
  [`src/config.js`](src/config.js) for every timing knob.
- **`src/state.js`** (new) — the `STATE` enum (`title`/`playing`/`over`),
  factored out so both engines and `main.js` share one definition.
- **`src/audio.js`** — added `playTone(freq, durationMs)`, a synthesized
  oscillator note (no sample needed) used for Simon's four pad tones.
- **`src/ui.js`** — added Simon-specific rendering: `flashSimonStep`/
  `clearSimonStep` (toggle `.active` on the four pad `<img>`s),
  `setSimonMode` (swaps the stage layout), `setSimonDebugStep` (debug hint
  for Simon, parallel to the existing classic one), bonus/score-label HUD
  bits. The old rotary-dial/oracle-chart rendering is gone.
- **`assets/img/pushit.jpeg`, `pullit.jpeg`, `soapit.jpeg`, `swipeit.jpeg`**
  (new) — real photos of the actual hardware (door frame, soap dispenser,
  card reader), used as the four Simon pad images. All four are 768×1024.
  Classic mode's placeholder SVGs (`door.svg`, `soap.svg`, `swipe-*.svg`,
  `tap-*.svg`) are untouched and still used there.
- **`index.html` / `styles/main.css`** — the stage now has a third panel
  (`.panel-simon`) holding `.simon-diamond`: all four pad photos shown at
  once, arranged top/left/right/bottom, full brightness at rest. A pad's
  edge lights up with its own color (green/red/yellow/blue) when it's
  active — same visual whether the game is playing it back or you just
  pressed its control (right *or* wrong). The two-panel classic layout
  (`.panel-image` + `.panel-word`) is hidden while Simon is active and
  vice versa, via `#stage.simon-mode`.
- **Removed entirely**: `src/aaronsonOracle.js`, `src/predictor.js`, the
  rotary 0/1 dial UI, the debug oracle chart, and "Practice: the line" —
  see below.

## Deliberate removals

**"The line"** (the rotary 0/1 dial that tried to predict your picks and
sped/slowed rounds accordingly) is gone completely, not just hidden. If you
're looking for it in history: `git show ab119dc~1:src/game.js` etc. still
has it, or just `git log --all --oneline -- src/predictor.js`. Classic mode
keeps its ordinary per-round timing decay but no longer has any speed-up/
ease-off tied to reading your picks.

## Debug mode: now a link, not a button

There's no visible "Debug" button or documented key anymore — by design, so
the title screen carries zero instructions. To get in:

- `?debug=1` in the URL (e.g. `.../designed2perfection/?debug=1`). Persists
  via `localStorage` same as before. `?debug=0` turns it off.
- The backtick key (`` ` ``) still toggles it too, just isn't advertised
  anywhere.

Once on, the debug bar at the bottom shows every control's bound key, and a
badge on the stage shows what's expected right now — in Simon that's the
next pad in the sequence plus your progress (`S pull 1/1`); in Classic it's
the current challenge. The `D`-always-right cheat (any other key = instant
wrong) works in **both** modes now — press `D` to drive straight to a win/
loss without hunting for the real binding.

## Known incomplete piece: the bonus meter

The HUD shows **Bonus X/10** in Simon mode. The display, persistence rules,
and config ceiling (`CONFIG.simon.bonusMax`) are all wired up:

- Starts at 0 when a team steps up (`newTeam()`).
- Carries across "Go again" within the same team's turn.
- **There is no scoring logic behind it yet** — nothing currently
  increments `this.bonus` in `SimonGame`. The user mentioned "something for
  the bonuses" they'd explain later; that mechanic was never specified, so
  it's a stub. Whoever picks this up needs to ask what should award bonus
  points (a timing thing? a pattern in the sequence? something with the
  physical cabinet?) before wiring in `this.bonus += n; this.ui.setHud({
  bonus: this.bonus })`.

## Design decisions worth knowing before you change things

- **Simon ignores which variant fired.** Swipe has two physical variants
  (stripe up/down, bound to `F`/`R` by default) but Simon treats either as
  the same "swipe" pad — no orientation check, no separate up/down. Tap is
  excluded from Simon entirely (only push/pull/soap/swipe are pads). See
  `PADS` and `PAD_SLOTS` at the top of `simon.js`.
- **Press feedback duration matches playback, not a fixed constant.** A
  correct or wrong press lights the pad and plays its tone for exactly
  `stepMsFor(round)` — the same length that round's own playback used —
  not a separate ack constant. There used to be a fixed `CONFIG.simon.ackMs`
  (160ms); it was removed in favor of this so the feedback never feels
  different from what the game itself just showed you.
- **No Bop-It-style click sfx in Simon.** Classic mode still plays
  `pushit.mp3`/`pullit.mp3`/etc. on every press. Simon deliberately doesn't
  — a correct press's only feedback is the pad relighting with its own
  flash + tone, matching a real Simon console.
- **Music**: plays only on the title screen, silent the instant a Simon
  round starts (`SimonGame.start()` calls `audio.stopMusic()`). Classic
  mode is unaffected — it still starts the same track itself, and picks up
  a title-screen instance already playing seamlessly (same `musicKey`, see
  `AudioManager.playMusic`). The page attempts to start music with zero
  gesture on load (works only where autoplay is allowed, e.g. a
  permissively configured kiosk); otherwise the first click/keypress
  anywhere resumes it.
- **Title heading is "1nc0nVeni3nt"**, replacing "Janelia It!" as the H1.
  The page `<title>` tag and meta description still say "Janelia It!" —
  those weren't touched, only the on-screen heading.

## Running / testing locally

Same as [README.md](README.md) says — no build step:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/?debug=1 to skip hunting for how to enable debug
```

There's no test suite. This session's verification was all manual/scripted
browser checks (Playwright driving a headless Chromium) — screenshotting
the diamond layout, scripting full playthroughs by reading the debug hint
and pressing the right keys, checking `AudioContext` calls to confirm music
timing. None of that is committed anywhere; if you want repeatable checks,
that'd be a good thing to add.

## Everything else

High score boards now have a third `simon` board alongside `normal`/`hard`
(see `MODES` in [`src/scores.js`](src/scores.js)). Score = longest sequence
completed for that run. `HARDWARE.md` and `README.md` were updated to drop
references to the removed rotary dial and describe the two-mode split;
they should still be accurate.
