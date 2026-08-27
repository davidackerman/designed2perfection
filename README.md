# Janelia It!

A Bop It–style reflex game about the small daily obstacles of Janelia Research
Campus: doors that give no hint which way they open, soap dispensers that
ignore you, and badge readers that care very much which way you hold the card.

**Play:** https://davidackerman.github.io/designed2perfection/

## The five commands

| Command | Cabinet control | Default key | The flaw it re-creates |
| --- | --- | --- | --- |
| **PUSH IT** | arcade button | `A` | Both doors look identical; only the placard tells you |
| **PULL IT** | pull lever | `S` | …and the placard is small, and up high |
| **SOAP IT** | proximity sensor | `D` | Sometimes takes 2–3 waves to do anything |
| **SWIPE IT** | card swiper | `F` / `R` | Stripe up or stripe down, as pictured |
| **TAP IT** | card tap pad | `G` / `T` | Face up or face down, as pictured |

Alongside all five, **the line** runs the whole time you're playing: a dial
with two positions, `0` and `1` (default keys `0`/`1`), and a predictor that's
trying to call your next pick from your history so far. Hold it near a 50/50
guess rate and the round windows above ease up; let it read you and they
tighten — see [`src/predictor.js`](src/predictor.js) for how it guesses and
`CONFIG.rotary` in [`src/config.js`](src/config.js) for how much that's worth.

Other keys: `Space` (or `Enter`) start · `H` hard mode · `M` mute · `` ` `` debug · `Esc` quit a run.

Every control is re-bindable from the title screen (**Controls**), and the
mapping persists in `localStorage`.

## Debug mode

Press `` ` `` (backtick) or hit **Debug** on the title screen. A bar appears
under the timer showing:

- **A keycap on the stage** showing the key this round wants, its
  `action:variant` slot, and how many hits it needs — counting up as you wave
  at a stubborn soap dispenser (`soap:default 1/3`). It sits where you're
  already looking, and disappears between rounds.
- **A chip per control** with the key it currently listens for. The chip lights
  up on every press, so you can confirm a physical control is wired to what you
  think it is.
- **expected** — the same answer in the bar, plus whether the word is currently
  lying to you.
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

Separate top-10 boards for normal and hard, because a hard-mode 20 is worth a
great deal more than a normal-mode 20.

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
| [`src/config.js`](src/config.js) | Every tunable: timings, difficulty curve, hard-mode ramp |
| [`src/actions.js`](src/actions.js) | The five actions, their variants, and how a round is composed |
| [`src/game.js`](src/game.js) | Round loop, scoring, failure states |
| [`src/input.js`](src/input.js) | Keyboard → action events, re-bindable, HID-friendly |
| [`src/scores.js`](src/scores.js) | High score boards, stats, and the storage backend |
| [`src/predictor.js`](src/predictor.js) | The 0/1 predictor behind "the line" |
| [`src/audio.js`](src/audio.js) | Sound manifest and playback |
| [`src/ui.js`](src/ui.js) | All DOM writes |
| [`assets/img/`](assets/img/) | Placeholder SVG art — swap for photos of the actual doors |
| [`assets/audio/`](assets/audio/) | Empty; see its README for the expected filenames |
| [`HARDWARE.md`](HARDWARE.md) | Wiring the physical cabinet as a USB keyboard |

## Deploying

Pushing to `main` deploys via [`.github/workflows/pages.yml`](.github/workflows/pages.yml).
Enable it once at **Settings → Pages → Source: GitHub Actions**.
