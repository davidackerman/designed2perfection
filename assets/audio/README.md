# Audio drop-in

`src/audio.js` fetches every file listed below at startup. **Missing files are
skipped silently**, so you can add them one at a time and the game keeps
working. Format is MP3 by default — to use OGG/WAV instead, edit `MANIFEST` in
[`src/audio.js`](../../src/audio.js).

Keep them short (< 700 ms for commands) — at high rounds the whole window is
about 800 ms.

| File | When it plays |
| --- | --- |
| `pushit.mp3` | "Push it!" — the command call-out |
| `pullit.mp3` | "Pull it!" |
| `soapit.mp3` | "Soap it!" |
| `swipeit.mp3` | "Swipe it!" |
| `tapit.mp3` | "Tap it!" |
| `success.mp3` | Action completed |
| `nothing.mp3` | Soap dispenser did nothing (a wave that didn't take) |
| `denied.mp3` | Badge read at the wrong orientation |
| `lose.mp3` | A run ends: wrong button or ran out of time |
| `gameover.mp3` | Plays alongside `lose` at the end of a run |
| `start.mp3` | A run begins |

Playback goes through a single WebAudio gain node, so `M` / the SOUND badge
mutes everything at once.
