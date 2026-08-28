# Audio drop-in

`src/audio.js` fetches every file listed below at startup. **Missing files are
skipped silently**, so you can add them one at a time and the game keeps
working. Format is MP3 by default — to use OGG/WAV instead, edit `MANIFEST` in
[`src/audio.js`](../../src/audio.js).

Keep them short (< 700 ms for commands) — at high rounds the whole window is
about 800 ms.

| File | When it plays |
| --- | --- |
| `push.mp3` | "Push it!" — the command call-out |
| `pull.mp3` | "Pull it!" |
| `soap.mp3` | "Soap it!" |
| `swipe.mp3` | "Swipe it!" |
| `tap.mp3` | "Tap it!" |
| `pushit.mp3` | Push button pressed |
| `pullit.mp3` | Pull button pressed |
| `soapit.mp3` | Soap button pressed |
| `swipeit.mp3` | Swipe button pressed |
| `tapit.mp3` | Tap button pressed |
| `success.mp3` | Action completed |
| `nothing.mp3` | Soap dispenser did nothing (a wave that didn't take) |
| `denied.mp3` | Badge read at the wrong orientation |
| `lose.mp3` | A run ends: wrong button or ran out of time |
| `wrong.mp3` | A control pressed at the title screen instead of dialing the number-pad code |
| `gameover.mp3` | Plays alongside `lose` at the end of a run |
| `start.mp3` | A run begins |
| `song.mp3` | Loops in the background for the whole run, quieter than the SFX above. Stops on game over or quitting to menu. |

Playback goes through a single WebAudio gain node, so `M` / the SOUND badge
mutes everything at once.
