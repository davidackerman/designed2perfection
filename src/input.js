// Everything the game sees arrives as a keydown, so the eventual cabinet --
// a Pro Micro / Makey Makey acting as a USB HID keyboard -- needs no code
// change. See HARDWARE.md.

import { ACTIONS } from './actions.js';
import { CONFIG } from './config.js';

export const bindingId = (actionId, variantId) => `${actionId}:${variantId}`;

// The rotary dial isn't a round challenge -- it runs continuously alongside
// one -- so it's bound separately rather than living in ACTIONS/pickAction's
// pool of things a round can demand.
const ROTARY_SLOTS = [
  { id: 'rotary:0', actionId: 'rotary', label: 'Rotary dial: 0', short: '0', key: 'Digit0' },
  { id: 'rotary:1', actionId: 'rotary', label: 'Rotary dial: 1', short: '1', key: 'Digit1' },
];

export function defaultBindings() {
  const map = {};
  for (const action of ACTIONS) {
    for (const variant of action.variants) {
      map[bindingId(action.id, variant.id)] = variant.key;
    }
  }
  for (const slot of ROTARY_SLOTS) map[slot.id] = slot.key;
  return map;
}

export function allBindingSlots() {
  const slots = [];
  for (const action of ACTIONS) {
    for (const variant of action.variants) {
      slots.push({
        id: bindingId(action.id, variant.id),
        actionId: action.id,
        label: variant.label,
        short: variant.short || variant.label,
      });
    }
  }
  for (const slot of ROTARY_SLOTS) {
    slots.push({ id: slot.id, actionId: slot.actionId, label: slot.label, short: slot.short });
  }
  return slots;
}

export class Input {
  constructor(onAction, onRawKey = null) {
    this.onAction = onAction;
    // Fires for *every* keydown, bound or not -- debug mode uses it to show
    // what the cabinet is actually sending.
    this.onRawKey = onRawKey;
    this.bindings = this.load();
    this.capture = null; // set while remapping
    window.addEventListener('keydown', (e) => this.handle(e));
  }

  load() {
    const defaults = defaultBindings();
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG.storage.bindings) || '{}');
      // Only keep slots that still exist, so renaming an action can't brick input.
      for (const slot of Object.keys(defaults)) {
        if (typeof saved[slot] === 'string') defaults[slot] = saved[slot];
      }
    } catch { /* corrupt storage: fall back to defaults */ }
    return defaults;
  }

  save() {
    try {
      localStorage.setItem(CONFIG.storage.bindings, JSON.stringify(this.bindings));
    } catch { /* private browsing: bindings just won't persist */ }
  }

  reset() {
    this.bindings = defaultBindings();
    this.save();
  }

  keyFor(slot) {
    return this.bindings[slot];
  }

  /** Human-readable name for a KeyboardEvent.code. */
  static keyName(code) {
    if (!code) return '--';
    return code
      .replace(/^Key/, '')
      .replace(/^Digit/, '')
      .replace(/^Arrow/, '')
      .replace(/^Numpad/, 'Num ')
      .replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  /** Begin listening for the next key, to bind it to `slot`. */
  beginCapture(slot, done) {
    this.capture = { slot, done };
  }

  cancelCapture() {
    this.capture = null;
  }

  slotForCode(code) {
    for (const [slot, key] of Object.entries(this.bindings)) {
      if (key === code) return slot;
    }
    return null;
  }

  handle(e) {
    // Never eat keys while a text field has focus (entering initials), or the
    // control keys would be preventDefault()ed out of the input.
    const el = e.target;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;

    if (this.capture) {
      e.preventDefault();
      const { slot, done } = this.capture;
      this.capture = null;
      if (e.code !== 'Escape') {
        // A key can only drive one control; steal it from whoever had it.
        for (const [other, key] of Object.entries(this.bindings)) {
          if (key === e.code && other !== slot) this.bindings[other] = null;
        }
        this.bindings[slot] = e.code;
        this.save();
      }
      done();
      return;
    }

    if (e.repeat) return; // held key is one press, not a stream
    const slot = this.slotForCode(e.code);
    if (this.onRawKey) this.onRawKey({ code: e.code, slot });
    if (!slot) return;
    e.preventDefault();
    const [actionId, variantId] = slot.split(':');
    this.onAction({ actionId, variantId });
  }
}
