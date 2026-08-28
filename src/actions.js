// The five things Janelia asks of you every day.
//
// An action may have several *variants* (e.g. which way the card is facing).
// Each variant is a separate physical input, so each gets its own key / HID
// keycode. The image always tells the truth about which variant is required.

import { CONFIG } from './config.js';

export const ACTIONS = [
  {
    id: 'push',
    audioKey: 'push',
    video: 'assets/video/pushit.mp4',
    // Both doors look identical. The only tell is the placard, way up there.
    placard: 'PUSH',
    variants: [
      { id: 'default', key: 'KeyF', label: 'Push', short: 'PUSH', image: 'assets/img/door.svg' },
    ],
  },
  {
    id: 'pull',
    audioKey: 'pull',
    video: 'assets/video/pullit.mp4',
    placard: 'PULL',
    variants: [
      { id: 'default', key: 'KeyB', label: 'Pull', short: 'PULL', image: 'assets/img/door.svg' },
    ],
  },
  {
    id: 'soap',
    audioKey: 'soap',
    video: 'assets/video/soapit.mp4',
    repeatable: true,
    variants: [
      { id: 'default', key: 'KeyS', label: 'Wave', short: 'SOAP', image: 'assets/img/soap.svg' },
    ],
  },
  {
    id: 'swipe',
    audioKey: 'swipe',
    video: 'assets/video/swipeit.mp4',
    // The card slot can't tell which way the card went in, so unlike the tap
    // pad this is one control with one keycode -- no orientation flaw here.
    variants: [
      { id: 'default', key: 'KeyC', label: 'Swipe', short: 'SWIPE', image: 'assets/img/swipe-up.svg' },
    ],
  },
  {
    id: 'tap',
    audioKey: 'tap',
    video: 'assets/video/tapit.mp4',
    variants: [
      { id: 'face-up', key: 'KeyG', label: 'Tap face up', short: 'TAP \u2191', image: 'assets/img/tap-up.svg' },
      { id: 'face-down', key: 'KeyT', label: 'Tap face down', short: 'TAP \u2193', image: 'assets/img/tap-down.svg' },
    ],
  },
];

export const byId = (id) => ACTIONS.find((a) => a.id === id);

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function pickAction(excludeId) {
  const pool = ACTIONS.length > 1 ? ACTIONS.filter((a) => a.id !== excludeId) : ACTIONS;
  return pick(pool);
}

function rollHits(action, round) {
  if (!action.repeatable) return 1;
  const { minHits, maxHits, hitsRampRound } = CONFIG.soap;
  if (round < hitsRampRound) return minHits;
  return minHits + Math.floor(Math.random() * (maxHits - minHits + 1));
}

// Disabled for now: the call-out video must always match the true action.
function mismatchChance() {
  return 0;
}

/**
 * Build one round's demand. The image, placard, and call-out video always
 * agree (see mismatchChance -- the hard-mode lie is disabled for now).
 */
export function makeChallenge(action, round, hardMode) {
  const variant = pick(action.variants);
  const requiredHits = rollHits(action, round);

  let wordAction = action;
  if (Math.random() < mismatchChance(round, hardMode)) {
    wordAction = pick(ACTIONS.filter((a) => a.id !== action.id));
  }

  return {
    action,
    variantId: variant.id,
    image: variant.image,
    placard: action.placard || null,
    video: wordAction.video,
    wordIsLying: wordAction.id !== action.id,
    requiredHits,
    hitsDone: 0,
  };
}
