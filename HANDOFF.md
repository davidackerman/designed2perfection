# Handoff: Simon mode

What changed, why, and what's still open. Written after the session that
added the Simon-style default mode on top of the original reflex game.
Read [README.md](README.md) first for the overall project; this is the
delta on top of it.

## The big picture

The game now has two modes:

- **Simon (default)** — a tone-and-picture sequence that grows by one step
  every round, with playback speeding up as it goes, like the classic
  handheld. Your answer is untimed: only a wrong pad ends a run. Nothing on
  screen explains the rule anywhere; first-timers are meant to work it out by
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
  (`.panel-simon`) holding `.simon-grid`: all four pad photos shown at
  once in a 2x2 block — push top-left, soap top-right, pull bottom-left,
  swipe bottom-right — full brightness at rest. A pad's
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
the current challenge. `Space` is a cheat in **both** modes: it resolves as
whatever the round actually wants, so you can drive a run forward without
hunting for the real binding.

`Space` and only `Space`. Every other key falls through to normal input, so
the keys the debug bar just told you to press keep working, and a genuinely
wrong one ends the run the ordinary way — debug mode is fully playable. This
used to be `D`, which was a bad pick twice over: it's soap's real binding, and
back then *every* non-`D` key was forced to count as wrong, so the real
bindings lost you the run instantly. `Space` collides with nothing (outside a
round it starts a game; `CHEAT_KEY` is at the top of the handler in
`main.js`).

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

- **No Simon pad has variants.** The card slot can't sense orientation, so
  swipe is one control on one key; push, pull and soap always were. Tap is the
  only action with variants left, and it's excluded from Simon entirely. See
  `PADS` and `PAD_SLOTS` at the top of `simon.js`.
- **Press feedback duration matches playback, not a fixed constant.** A
  correct or wrong press lights the pad and plays its tone for exactly
  `stepMsFor(round)` — the same length that round's own playback used —
  not a separate ack constant. There used to be a fixed `CONFIG.simon.ackMs`
  (160ms); it was removed in favor of this so the feedback never feels
  different from what the game itself just showed you.
- **A press always retriggers, even on the pad that's already lit.** Playback
  gets a dark gap between steps for free, so two of the same pad in a row read
  as two flashes. Presses don't: `.active` was already set, and toggling a
  class that's on is a no-op, so hammering one pad twice looked like a single
  held glow — i.e. like the second press had been dropped. `flashSimonStep(id,
  { press: true })` now restarts a `.hit` keyframe animation (remove / reflow /
  re-add, the same trick as `ui.flash`), and `AudioManager.playTone` cuts the
  note still ringing before starting the next one. Presses are not, and never
  were, rate-limited — this was purely a feedback bug.
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
- **"1nc0nVeni3nt" everywhere**: the H1, the page `<title>`, and the meta
  description. "Janelia It!" is gone from the shipped page.
- **The game-over heading is per-mode** (`OVER_HEADINGS` in `ui.js`, written
  into `#overHeading` by `showGameOver`). Classic keeps "YOU DID NOT GET IN" —
  you were trying to get through a door. Simon says "OUT OF SEQUENCE", because
  you weren't.
- **Nothing clips the lit pad.** `.simon-grid` deliberately has no
  `overflow: hidden`: a lit pad scales to 1.05 and throws a ~36px glow, and all
  four pads sit flush against the block's edges, so clipping there sliced the
  ring — and the photo under it — right off. `.simon-pad`'s
  `min-width/min-height: 0` is what actually keeps the grid tracks from
  overflowing. `.panel-simon` carries 46px of padding purely as glow room.
- **The block is 3:4 portrait**, because that's the shape a 2x2 of 3:4 pad
  photos wants — the cells then match the images and nothing letterboxes. It's
  sized off a single `--w: min(100cqw, 75cqh, 560px)` against `.panel-simon`
  (which is `container-type: size` for exactly this): widest that still fits
  the panel horizontally, and via the `75cqh` term vertically too once the
  height is derived as `--w * 4/3`.
- **Pad placement is explicit** (`.simon-pos-tl` … `-br`), not source order, so
  re-ordering the markup can't silently move a pad to another quadrant.

## The default keymap changed

`F` push, `B` pull, `S` soap, `C` card — see the table in
[HARDWARE.md](HARDWARE.md). `A`, `D`, `R` are all unbound now: swipe used to
have stripe-up/stripe-down variants on two keys, but the real reader can't tell
which way the card went in, so it's one control on one key.

`CONFIG.storage.bindings` moved to `janelia-it:bindings:v2` at the same time.
That matters: `Input.load()` prefers a saved mapping over the defaults, so
without a new storage key any browser that had ever opened the Controls screen
would quietly keep the old keys and the change would look like it hadn't
landed. Bump it again next time the table changes.

## No clock on the answer

Simon used to time each press (`inputWindowMs` and friends, a rAF loop driving
the timer bar, `fail('timeout')`). All of it is gone: `awaitPress()` just
publishes which step is outstanding and waits. The only way to lose is a wrong
pad, so `fail()` takes no reason. Consequences worth knowing:

- The timer bar has nothing to say in Simon and is hidden there
  (`#stage.simon-mode + #timer`), rather than sitting at zero.
- `pause()`/`resume()` only have the two timed phases left to handle; a run
  waiting on a press needs nothing done to it when the tab comes back.
- Playback still speeds up per round (`stepMsFor`), which is the whole of the
  difficulty curve now.

## The game-over recap

`SimonGame.fail()` hands `sequence` and `pressed` (the round you died on, and
your presses in it) to `onGameOver`, and `ui.renderSequenceRecap` lays them out
as two aligned rows — one grid column per step, so "You" sits under "Wanted"
and the step where they diverge is ringed. Steps you never reached are dashed
placeholders. Classic passes no sequence and the block stays hidden.

Pad colours moved to `--pad-push`/`-pull`/`-soap`/`-swipe` in `:root` so the
recap chips and the lit pads can't drift apart.

## Presses that land out of turn

Simon ignores input during playback and during the gap between rounds
(`interRoundMs` + the lead-in gap ~= 1.25s after every cleared round). That's
deliberate, but at low rounds it's most of the wall clock, and swallowing a
press in silence is indistinguishable from dropping it — it's what made the
input feel broken. An out-of-turn press now gets the existing `flash('nothing')`
nudge, in both the real-key and `Space` paths. It still costs you nothing.

## Cache-busting

GitHub Pages serves every file with `max-age=600` and a reload only revalidates
the document, so a fresh `index.html` could run against ten-minute-old JS — the
game "randomly misbehaving" when it was really a half-updated cache. Every
`src/` module and the stylesheet is now loaded through a `?v=__BUILD__` query
(via an import map in `index.html`; import maps don't cover a module script's
own `src`, so the entry point carries its version directly). The deploy
workflow rewrites `__BUILD__` with the commit SHA. Locally it stays literal,
which is fine.

**Adding a module to `src/` means adding a line to that import map.** Missing
one just means it isn't cache-busted; nothing breaks.

## Running / testing locally

Same as [README.md](README.md) says — no build step:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/?debug=1 to skip hunting for how to enable debug
```

There's no test suite. This session's verification was all manual/scripted
browser checks (Playwright driving a headless Chromium) — screenshotting
the pad layout, scripting full playthroughs by reading the debug hint
and pressing the right keys, checking `AudioContext` calls to confirm music
timing. None of that is committed anywhere; if you want repeatable checks,
that'd be a good thing to add.

## Everything else

High score boards now have a third `simon` board alongside `normal`/`hard`
(see `MODES` in [`src/scores.js`](src/scores.js)). Score = longest sequence
completed for that run. `HARDWARE.md` and `README.md` were updated to drop
references to the removed rotary dial and describe the two-mode split;
they should still be accurate.
