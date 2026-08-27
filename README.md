# Janelia It!

A Bop It–style reflex game about the small daily obstacles of Janelia Research
Campus: doors that give no hint which way they open, soap dispensers that
ignore you, and badge readers that care very much which way you hold the card.

**Play:** https://davidackerman.github.io/designed2perfection/

## Modes

The game defaults to a Simon-style mode: a tone-and-picture sequence over
four of the controls (push/pull/soap/swipe) that grows by one step each round
and speeds up as it goes. Nothing on screen explains the rule — it's meant to
be worked out by watching. See [`src/simon.js`](src/simon.js).

The original reflex game below is still there as **Classic mode**, a toggle
on the title screen (off by default).

## The five commands (Classic mode)

| Command | Cabinet control | Default key | The flaw it re-creates |
| --- | --- | --- | --- |
| **PUSH IT** | arcade button | `A` | Both doors look identical; only the placard tells you |
| **PULL IT** | pull lever | `S` | …and the placard is small, and up high |
| **SOAP IT** | proximity sensor | `D` | Sometimes takes 2–3 waves to do anything |
| **SWIPE IT** | card swiper | `F` / `R` | Stripe up or stripe down, as pictured |
| **TAP IT** | card tap pad | `G` / `T` | Face up or face down, as pictured |

Other keys: `Space` (or `Enter`) start · `H` hard mode (Classic only) · `M` mute · `` ` `` debug · `Esc` quit a run.

Every control is re-bindable from the title screen (**Controls**), and the
mapping persists in `localStorage`.

## Debug mode

Press `` ` `` (backtick) or hit **Debug** on the title screen. A bar appears
under the timer showing:

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

## How a round works

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

- Beat the bottom of the board and you're asked for three initials, arcade
  style, prefilled with the last name entered. Ties don't bump anyone: you have
  to *beat* the tenth place, and equal scores keep the earlier run higher.
- The game-over card shows where you placed and the board around you, with your
  run highlighted.
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
| [`assets/img/`](assets/img/) | Placeholder SVG art (Classic) and photos of the actual hardware (Simon pads) |
| [`assets/audio/`](assets/audio/) | Empty; see its README for the expected filenames |
| [`HARDWARE.md`](HARDWARE.md) | Wiring the physical cabinet as a USB keyboard |

## Deploying

Pushing to `main` deploys via [`.github/workflows/pages.yml`](.github/workflows/pages.yml).
Enable it once at **Settings → Pages → Source: GitHub Actions**.
