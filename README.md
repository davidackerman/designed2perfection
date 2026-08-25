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

Other keys: `Space` (or `Enter`) start · `H` hard mode · `M` mute · `` ` `` debug · `Esc` quit a run.

Every control is re-bindable from the title screen (**Controls**), and the
mapping persists in `localStorage`.

## Debug mode

Press `` ` `` (backtick) or hit **Debug** on the title screen. A bar appears
under the timer showing:

- **A chip per control** with the key it currently listens for. The chip lights
  up on every press, so you can confirm a physical control is wired to what you
  think it is.
- **expected** — the key this round actually wants, its `action:variant` slot,
  how many hits it needs (`×3` for a stubborn soap dispenser, counting up as
  you wave), and whether the word is currently lying to you.
- **last key** — the raw `KeyboardEvent.code` of the last key pressed and which
  control it resolved to, *including keys bound to nothing* (`Q unbound KeyQ`).
  This is the one to watch when bringing up the cabinet: it shows exactly what
  the hardware is sending.

The setting persists, and the chips re-render after a re-bind.

## How a round works

The screen shows a **picture** on one side and a **word** on the other, and the
call-out plays. Hit the right control before the timer bar empties.

- The window starts at 3 s and shrinks every round, down to 800 ms — then to
  550 ms past round 30.
- Wrong control → run over.
- Right control, wrong card orientation → "denied", and you lose 450 ms.
- Soap that didn't take → nothing happens, keep waving; the clock keeps running.

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
| [`src/audio.js`](src/audio.js) | Sound manifest and playback |
| [`src/ui.js`](src/ui.js) | All DOM writes |
| [`assets/img/`](assets/img/) | Placeholder SVG art — swap for photos of the actual doors |
| [`assets/audio/`](assets/audio/) | Empty; see its README for the expected filenames |
| [`HARDWARE.md`](HARDWARE.md) | Wiring the physical cabinet as a USB keyboard |

## Deploying

Pushing to `main` deploys via [`.github/workflows/pages.yml`](.github/workflows/pages.yml).
Enable it once at **Settings → Pages → Source: GitHub Actions**.
