import { LocalStore } from "../../core/storage/localStore.js";
import { getNotflixOptions } from "./notflixOptions.js";

const STORE_KEY = "notflixAppearance";
const ROOT_CLASS = "notflix-ui";

export const NOTFLIX_STYLE = "notflix";
export const NUVIO_STYLE = "nuvio";

export const NOTFLIX_PALETTE = Object.freeze({
  "--bg-color": "#0b0b0d",
  "--bg-elevated": "#18181d",
  "--card-bg": "#18181d",
  "--secondary-color": "#f4f4f5",
  "--secondary-variant": "#e50914",
  "--on-secondary": "#0b0b0d",
  "--text-color": "#f4f4f5",
  "--text-secondary": "#c4c4cc",
  "--text-tertiary": "#8e8e96",
  "--border-color": "#26262c",
  "--focus-color": "#ffffff",
  "--focus-bg": "#3a3a42",
  "--accent-gradient": "#e50914"
});

const LAYOUT_OVERRIDES = Object.freeze({
  homeLayout: "classic",
  heroSectionEnabled: true,
  posterLabelsEnabled: false,
  catalogAddonNameEnabled: false,
  modernSidebar: false,
  modernSidebarBlur: false,
  collapseSidebar: false,
  focusedPosterBackdropExpandEnabled: false,
  focusedPosterBackdropTrailerEnabled: false,
  classicFocusGradientEnabled: false,
  cardDepthEnabled: false,
  continueWatchingCardStyle: "poster"
});

let cachedStyle = null;

function readStyle() {
  if (cachedStyle) return cachedStyle;
  const stored = String(LocalStore.get(STORE_KEY, NOTFLIX_STYLE) || "");
  cachedStyle = stored === NUVIO_STYLE ? NUVIO_STYLE : NOTFLIX_STYLE;
  return cachedStyle;
}

export function getAppearanceStyle() {
  return readStyle();
}

export function isNotflixActive() {
  return readStyle() === NOTFLIX_STYLE;
}

export function setAppearanceStyle(style) {
  const next = style === NUVIO_STYLE ? NUVIO_STYLE : NOTFLIX_STYLE;
  LocalStore.set(STORE_KEY, next);
  cachedStyle = next;
  applyAppearanceClass();
  return next;
}

export function applyAppearanceClass() {
  const active = isNotflixActive();
  const roots = [globalThis.document?.documentElement, globalThis.document?.body];
  roots.forEach((node) => {
    if (node && node.classList.contains(ROOT_CLASS) !== active) {
      node.classList.toggle(ROOT_CLASS, active);
    }
  });
}

export function withNotflixPalette(colors) {
  return isNotflixActive() ? { ...colors, ...NOTFLIX_PALETTE } : colors;
}

export function withNotflixLayout(settings) {
  if (!isNotflixActive() || !settings) return settings;
  return {
    ...settings,
    ...LAYOUT_OVERRIDES,
    focusedPosterBackdropTrailerMuted: !getNotflixOptions().previewSound
  };
}
