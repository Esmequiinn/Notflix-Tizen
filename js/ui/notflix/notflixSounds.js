import { isNotflixActive } from "./notflixAppearance.js";
import { getNotflixOptions } from "./notflixOptions.js";
import { Router } from "../navigation/routerState.js";

const TONES = {
  move: { frequency: 1200, duration: 0.045, gain: 0.06 },
  confirm: { frequency: 880, duration: 0.07, gain: 0.08 },
  open: { frequency: 660, duration: 0.08, gain: 0.07 },
  back: { frequency: 560, duration: 0.06, gain: 0.06 }
};

let context = null;
let lastAt = 0;

function audioContext() {
  if (context) return context;
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch (_) {
    context = null;
  }
  return context;
}

export function playUiSound(kind = "move") {
  if (!isNotflixActive() || !getNotflixOptions().uiSounds) return;
  const tone = TONES[kind] || TONES.move;
  const now = Date.now();
  if (now - lastAt < 45) return;
  lastAt = now;
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    const resumed = ctx.resume?.();
    if (resumed && typeof resumed.then === "function") {
      resumed.then(() => emit(ctx, tone)).catch(() => {});
      return;
    }
  }
  emit(ctx, tone);
}

function emit(ctx, tone) {
  try {
    const start = ctx.currentTime + 0.01;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(tone.frequency, start);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(tone.gain, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + tone.duration + 0.02);
  } catch (_) {}
}

const KEY_SOUNDS = {
  37: "move",
  38: "move",
  39: "move",
  40: "move",
  13: "confirm",
  10009: "back",
  461: "back",
  8: "back",
  27: "back"
};

export function installUiSoundKeys() {
  if (!globalThis.document?.addEventListener) return;
  document.addEventListener(
    "keydown",
    (event) => {
      const kind = KEY_SOUNDS[Number(event?.keyCode || 0)];
      if (!kind || (kind === "confirm" && event.repeat)) return;
      if (Router.getCurrent?.() === "player") return;
      playUiSound(kind);
    },
    true
  );
}
