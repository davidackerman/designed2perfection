# Janelia It!

A Bop It–style reflex game about the small daily obstacles of Janelia Research
Campus: doors that give no hint which way they open, soap dispensers that
ignore you, and badge readers that care very much which way you hold the card.

**Play:** https://davidackerman.github.io/designed2perfection/

## Modes

The game defaults to a Simon-style mode: a tone-and-picture sequence over
four of the controls (push/pull/soap/swipe) that grows by one step each round.
The *playback* speeds up as it goes; your answer isn't timed at all — take as
long as you like over a press, and the only way to lose is to press the wrong
pad. Nothing on screen explains the rule — it's meant to be worked out by
watching. See [`src/simon.js`](src/simon.js).

When a run ends, only the Simon side freezes — a card confined to that half
of the screen lays the round you died on against what you actually pressed,
step by step, so you can see where the two parted company. The bonus board
on the other half keeps running the entire time, so a wrong pad doesn't cost
you a card you were mid-match on. There's no "go again" button to hunt for
and no "new team" reset on offer — score and bonus always carry over from
your best run so far, and pressing any control or key just starts the next
sequence. `Esc` is the one exception: that backs out to the menu instead. The
number pad is the other exception, in Simon mode — a digit keeps driving the
still-live bonus board rather than restarting Simon.

High-score entry is disabled for now: a run's score/best still show on the
game-over card, but nothing prompts for initials or gets added to the board.

The original reflex game below is still there as **Classic mode**, a toggle
on the title screen (off by default).

### Alternate bonus test build

[`inconvenient2.html`](inconvenient2.html) (linked from the real title
screen's hint line) is a test endpoint for trying out a different bonus
minigame in place of the memory-match board: beat the computer's even/odd
guesser. Every few seconds you enter a digit on the number pad; the computer
has already locked in a guess of whether it'll be even or odd, based on a
simple pattern model over what you've entered so far, so staying
unpredictable is the actual game. Bonus is 10 at a coin-flip-or-better 50%
computer accuracy, down to 0 at 80%+, and missing the entry window resets
it to 0. Everything else (Simon, classic mode, the title password, high
scores) is identical to the real page — see [`src/evenodd.js`](src/evenodd.js)
and [`src/main2.js`](src/main2.js).

## The five commands (Classic mode)

| Command | Cabinet control | Default key | The flaw it re-creates |
| --- | --- | --- | --- |
| **PUSH IT** | arcade button | `F` | Both doors look identical; only the placard tells you |
| **PULL IT** | pull lever | `B` | …and the placard is small, and up high |
| **SOAP IT** | proximity sensor | `S` | Sometimes takes 2–3 waves to do anything |
| **SWIPE IT** | card swiper | `C` | The reader is indifferent to how you hold it |
| **TAP IT** | card tap pad | `G` / `T` | Face up or face down, as pictured |

Other keys: `H` hard mode (Classic only) · `M` mute · `` ` `` debug · `Esc` quit a run.

Every control is re-bindable from the title screen (**Controls**), and the
mapping persists in `localStorage`.

## Starting a game

There's no Start button, functionally — outside debug mode, the title screen
only reacts to a number-pad code. It's the title itself: read off the digits
and the one roman numeral in `1nc0nVeni3nt` in order (`1`, `0`, `V` = `5`,
`3`) to get `1053`. The title text never reacts to any of this — instead, a
password-style row of dots below it fills in green one at a time as each
digit lands right; a wrong digit shakes the card, flashes the dots red, and
resets the whole attempt. Get all four and the game begins. In debug mode
the old Start/`Space`/`Enter` shortcuts still work, so testing doesn't
require dialing the code every time.

Dialing `911` on the number pad at any point pops up the title code for a
few seconds — for whoever's running the cabinet, not meant to be found by
players. It's a self-dismissing toast, not a modal: it doesn't pause or
block anything underneath it.

Mid-run, in Simon mode, the same `911` dial instead flips every bonus-board
card face-up (or, in round 3, shows the letters) for a couple of seconds,
showing the answer there too. The bonus board's own controls, for
reference:

- **Round 1** (2x2): no labels shown — dial the four cards as `0`/`1`/`2`/`3`,
  reading order (top-left, top-right, bottom-left, bottom-right).
- **Round 2** (4x4): also no labels on the cards — instead, dial the phone
  key its row's letter/digit is on, then the phone key its column's is on.
  Row/column headers are a random, non-repeating draw of phone-keypad keys
  (a bare digit, or one of its letters), so e.g. rows might read `J7AG` and
  columns `8E09` — since no two headers on the same axis ever share a key,
  one keystroke per axis is always enough.
- **Round 3**, the last round: seven blank squares spelling a hidden word
  (`JANELIA`) once solved. Same idea as the title password — dial the phone
  key for each letter in order; a correct key turns that square green for
  good, a wrong one resets all the progress and flashes red. The word never
  shows until every square is green. Worth a flat 1 bonus point, bringing
  the cap from 10 (rounds 1+2) to 11.

## Debug mode

Add `?debug=1` to the URL, or press `` ` `` (backtick) — there's no button, so
the title screen carries no instructions. A bar appears at the bottom showing:

- **A keycap on the stage** showing the key this moment wants. In Classic mode
  that's the current challenge's `action:variant` slot and how many hits it
  needs, counting up as you wave at a stubborn soap dispenser (`soap:default
  1/3`). In Simon mode it's whichever pad comes next in the sequence, plus
  how far through it you are (`3/5`). It sits where you're already looking,
  and disappears between rounds.
- **A chip per control** with the key it currently listens for. The chip lights
  up on every press, so you can confirm a physical control is wired to what you
  think it is.
- **expected** — the same answer in the bar, plus (Classic only) whether the
  word is currently lying to you.
- **last key** — the raw `KeyboardEvent.code` of the last key pressed and which
  control it resolved to, *including keys bound to nothing* (`Q unbound KeyQ`).
  This is the one to watch when bringing up the cabinet: it shows exactly what
  the hardware is sending.

The setting persists, and the chips re-render after a re-bind.

## How a round works (Classic mode)

Classic is the timed one — Simon puts no clock on your answer, and hides the
timer bar entirely.

The screen shows a **picture** on one side and a **word** on the other, and the
call-out plays. Hit the right control before the timer bar empties.

- The window holds at 4 s for the first 5 rounds, then shrinks every round,
  down to 800 ms — then to 550 ms past round 30.
- Wrong control → run over.
- Right control, wrong card orientation → "denied", and you lose 450 ms.
- Soap that didn't take → nothing happens, keep waving; the clock keeps running.

## High scores

Separate top-10 boards for Simon, normal, and hard, because a hard-mode 20 is
worth a great deal more than a normal-mode 20 — and a Simon score means
something different from either.

Entering a new high score is disabled for now — beating the board doesn't
prompt for initials or add anything to it, so the boards below are frozen
until that's turned back on.

- **High scores** on the title screen shows either board, plus lifetime stats:
  runs played, commands survived, and which command has ended the most runs
  ("most often undone by PULL IT"). Clearing takes two clicks, so a stray elbow
  on the cabinet can't wipe the board.
- The `Best` figure in the HUD is the top score for the mode you're playing.

Scores live in `localStorage`, so they're per-browser — right for a cabinet,
not a campus-wide ladder. Everything goes through one small backend interface
at the bottom of [`src/scores.js`](src/scores.js) (`read()` / `write(data)`),
so pointing it at a shared service later is a change to that one file.

### Hard mode

For the first five rounds the picture and the word agree. After that the
**word starts lying** — with a probability that climbs to 65% by round 30. The
picture and the door placard never lie. It's the reading-comprehension version
of standing at a door labelled PUSH that only pulls.

## Running locally

No build step, no dependencies — but it uses ES modules, so it needs a server
rather than `file://`:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Layout

| Path | What's in it |
| --- | --- |
| [`src/config.js`](src/config.js) | Every tunable: timings, difficulty curve, hard-mode ramp, Simon's pacing/tones |
| [`src/actions.js`](src/actions.js) | The five actions, their variants, and how a round is composed (Classic mode) |
| [`src/game.js`](src/game.js) | Classic mode: round loop, scoring, failure states |
| [`src/simon.js`](src/simon.js) | Simon mode: growing sequence, playback/input timing, scoring |
| [`src/state.js`](src/state.js) | Shared `STATE` enum used by both game engines |
| [`src/input.js`](src/input.js) | Keyboard → action events, re-bindable, HID-friendly |
| [`src/scores.js`](src/scores.js) | High score boards, stats, and the storage backend |
| [`src/audio.js`](src/audio.js) | Sound manifest, playback, and Simon's synthesized tones |
| [`src/ui.js`](src/ui.js) | All DOM writes |
| [`src/evenodd.js`](src/evenodd.js) | Test build's alternate bonus minigame: beat the computer's even/odd guesser |
| [`src/main2.js`](src/main2.js) / [`inconvenient2.html`](inconvenient2.html) | Entry point for the even/odd test build |
| [`assets/img/`](assets/img/) | Placeholder SVG art (Classic) and photos of the actual hardware (Simon pads) |
| [`assets/audio/`](assets/audio/) | Empty; see its README for the expected filenames |
| [`HARDWARE.md`](HARDWARE.md) | Wiring the physical cabinet as a USB keyboard |

## Deploying

Pushing to `main` deploys via [`.github/workflows/pages.yml`](.github/workflows/pages.yml).
Enable it once at **Settings → Pages → Source: GitHub Actions**.
