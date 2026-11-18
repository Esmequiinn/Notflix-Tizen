import { LocalStore } from "../../core/storage/localStore.js";
import { ProfileManager } from "../../core/profile/profileManager.js";

const STORE_KEY = "notflixOptions";

export const CARD_OPENING = Object.freeze({ instant: 80, normal: 1200, slow: 2000 });
export const CARD_SIZE = Object.freeze({ tiny: 55, small: 66, medium: 78, large: 100 });
export const TRAILER_IDLE = Object.freeze({ short: 3000, normal: 5000, long: 8000 });
export const HERO_ROTATION = Object.freeze({ off: 0, normal: 9000, slow: 15000 });

const DEFAULTS = Object.freeze({
  homeMotion: "normal",
  cardOpening: "instant",
  cardSize: "medium",
  trailerIdle: "normal",
  heroRotation: "normal",
  heroTrailer: true,
  introEnabled: false,
  introSound: true,
  previewEnabled: true,
  previewSound: true,
  uiSounds: false,
  wikipediaEnabled: true
});

const listeners = new Set();
let cache = null;

function profileKey() {
  const id = String(ProfileManager.getActiveProfileId?.() ?? "1").trim();
  return id || "1";
}

function readAll() {
  if (cache) return cache;
  const raw = LocalStore.get(STORE_KEY, null);
  cache = raw && typeof raw === "object" ? raw : {};
  let migrated = false;
  Object.keys(cache).forEach((id) => {
    const entry = cache[id];
    if (!entry || typeof entry !== "object") return;
    if (entry.sizeVersion !== 2) {
      cache[id] = {
        ...entry,
        sizeVersion: 2,
        cardSize: entry.cardSize === "tiny" ? "medium" : entry.cardSize
      };
      migrated = true;
    }
    if (cache[id].openingVersion !== 1) {
      cache[id] = { ...cache[id], openingVersion: 1, cardOpening: "instant" };
      migrated = true;
    }
    if (cache[id].soundVersion !== 1) {
      cache[id] = { ...cache[id], soundVersion: 1, previewSound: true };
      migrated = true;
    }
  });
  if (migrated) LocalStore.set(STORE_KEY, cache);
  return cache;
}

function sanitize(options) {
  const out = { ...DEFAULTS, ...(options || {}) };
  if (!["normal", "reduced"].includes(out.homeMotion)) out.homeMotion = DEFAULTS.homeMotion;
  if (!CARD_OPENING[out.cardOpening]) out.cardOpening = DEFAULTS.cardOpening;
  if (!CARD_SIZE[out.cardSize]) out.cardSize = DEFAULTS.cardSize;
  if (!TRAILER_IDLE[out.trailerIdle]) out.trailerIdle = DEFAULTS.trailerIdle;
  if (!(out.heroRotation in HERO_ROTATION)) out.heroRotation = DEFAULTS.heroRotation;
  [
    "introEnabled",
    "introSound",
    "previewEnabled",
    "previewSound",
    "uiSounds",
    "wikipediaEnabled",
    "heroTrailer"
  ].forEach((key) => {
    out[key] = Boolean(out[key]);
  });
  return out;
}

export function getNotflixOptions() {
  return sanitize(readAll()[profileKey()]);
}

export function setNotflixOption(key, value) {
  if (!(key in DEFAULTS)) return getNotflixOptions();
  const all = { ...readAll() };
  const id = profileKey();
  all[id] = {
    ...sanitize({ ...all[id], [key]: value }),
    sizeVersion: 2,
    soundVersion: 1,
    openingVersion: 1
  };
  cache = all;
  LocalStore.set(STORE_KEY, all);
  listeners.forEach((listener) => {
    try {
      listener(all[id]);
    } catch (_) {}
  });
  return all[id];
}

export function onNotflixOptionsChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCardOpeningDelayMs(options = getNotflixOptions()) {
  return CARD_OPENING[options.cardOpening] || CARD_OPENING.normal;
}

export function getCardImageWaitMs(fallback, options = getNotflixOptions()) {
  return options.cardOpening === "instant" ? 140 : fallback;
}

export function getCardScale(options = getNotflixOptions()) {
  return (CARD_SIZE[options.cardSize] || 100) / 100;
}

export function getTrailerIdleMs(options = getNotflixOptions()) {
  return TRAILER_IDLE[options.trailerIdle] || TRAILER_IDLE.normal;
}

export function getHeroRotationMs(options = getNotflixOptions()) {
  return HERO_ROTATION[options.heroRotation] ?? HERO_ROTATION.normal;
}
