# Hardware notes

The game only ever reads `keydown` events. Anything that enumerates as a **USB
HID keyboard** works with no code changes — an Arduino Pro Micro / Leonardo
(ATmega32U4), an RP2040 board with `Adafruit_TinyUSB`, or a Makey Makey.

## Default keymap

| Control | Physical part | Sends |
| --- | --- | --- |
| Push | arcade button | `A` |
| Pull | pull lever / handle w/ limit switch | `S` |
| Soap | IR proximity sensor | `D` |
| Swipe, stripe up | card slot, orientation sensor A | `F` |
| Swipe, stripe down | card slot, orientation sensor B | `R` |
| Tap, face up | RFID pad, orientation sensor A | `G` |
| Tap, face down | RFID pad, orientation sensor B | `T` |

Any of these can be re-bound in-game (title screen → **Controls**); the mapping
persists in `localStorage`, so you set it once on the cabinet's browser.

## What the firmware must guarantee

- **One press = one keystroke.** The game ignores `event.repeat`, so a held key
  registers once — but a bouncing switch that generates several distinct
  keydowns *will* register several times. Debounce in firmware: ~20 ms for
  buttons and the lever.
- **The proximity sensor must emit discrete pulses, not a held key.** A hand
  lingering in front of the sensor should produce exactly one keystroke, then
  nothing until the hand leaves and returns (or until a re-arm timeout of
  ~250 ms). This matters: "soap it" sometimes needs 2–3 separate waves, and the
  game counts keystrokes.
- **Orientation is a separate keycode, not a modifier.** The swiper and tap pad
  each report *which way the card was presented* by choosing between two
  keycodes. If your reader can't tell orientation, bind both variants to the
  same key — the game then accepts either, and the orientation flaw is
  effectively disabled.

## Bringing up a new control

Turn on **debug mode** (`` ` ``, or the Debug button on the title screen) and
watch the **last key** readout while you actuate each control. It prints the raw
`KeyboardEvent.code` the browser received and which control it mapped to —
`F swipe:stripe-up` for a recognised control, `Q unbound KeyQ` for a keycode the
game doesn't know. That tells you three things at once: whether the switch fires
at all, what code the firmware is really sending, and whether it lands on the
control you intended.

The chip row above it lights up per press, so a bouncing switch shows as a chip
that strobes several times on one actuation — fix that in firmware rather than
in the game.

## Kiosk setup

Run the Pages URL fullscreen (`F11`, or Chrome `--kiosk --app=<url>`). The page
calls `preventDefault()` on every bound key, so the controls won't scroll or
activate browser UI. Audio needs one user gesture before it will play — the
START button counts.
