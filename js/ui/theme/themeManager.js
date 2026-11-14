import { syncLoadingIndicatorPalette } from "../components/loadingIndicator.js";
import { withNotflixPalette, applyAppearanceClass } from "../notflix/notflixAppearance.js";
import { MemberAccessRepository } from "../../data/remote/supabase/memberAccessRepository.js";
import { accentColorForTheme, ThemeStore } from "../../data/local/themeStore.js";
import { syncBrandWordmarks } from "../components/brandWordmark.js";
import { resolveThemeName } from "./themeAccess.js";
import { ThemeColors } from "./themeColors.js";
import { resolveCustomThemeColors } from "../../core/util/customThemeColors.js";

const FONT_STACKS = {
  INTER: '"Inter", "Segoe UI", Arial, sans-serif',
  DM_SANS: '"DM Sans", "Segoe UI", Arial, sans-serif',
  OPEN_SANS: '"Open Sans", "Segoe UI", Arial, sans-serif'
};

const SUPPORTS_CSS_VARS =
  typeof window !== "undefined" &&
  !!window.CSS &&
  typeof window.CSS.supports === "function" &&
  window.CSS.supports("--probe", "0");

function toRgbChannels(hex, fallback = "255 255 255") {
  const value = String(hex || "").trim();
  const match = value.match(/^#([0-9a-f]{6})$/i);
  if (!match) {
    return fallback;
  }
  const normalized = match[1];
  return `${parseInt(normalized.slice(0, 2), 16)} ${parseInt(normalized.slice(2, 4), 16)} ${parseInt(normalized.slice(4, 6), 16)}`;
}

function toLegacyRgbChannels(hex, fallback = "255, 255, 255") {
  const value = String(hex || "").trim();
  const match = value.match(/^#([0-9a-f]{6})$/i);
  if (!match) {
    return fallback;
  }
  const normalized = match[1];
  return `${parseInt(normalized.slice(0, 2), 16)}, ${parseInt(normalized.slice(2, 4), 16)}, ${parseInt(normalized.slice(4, 6), 16)}`;
}

export function buildLegacyThemeCss(colorMap) {
  const {
    bg,
    bgElevated,
    cardBg,
    secondary,
    onSecondary,
    focusColor,
    focusBg,
    text,
    border,
    playerAccent = secondary
  } = colorMap;

  return [
    `html, body { background: ${bg}; color: ${text}; }`,

    `.home-shell, .home-sidebar, .home-main, .profile-screen, .search-screen-shell,` +
      ` .discover-shell, .library-shell { background: ${bg}; }`,

    `.account-info, .sync-card, .status-card, .profile-editor-panel,` +
      ` .nuvio-dialog-panel { background: ${bgElevated}; }`,

    `.card, .account-settings-card, .search-input-field,` +
      ` .library-action-button { background: ${cardBg}; }`,

    `.modern-sidebar-panel, .modern-sidebar-pill-chip,` +
      ` .modern-sidebar-shell.blur-enabled .modern-sidebar-panel,` +
      ` .modern-sidebar-shell.blur-enabled .modern-sidebar-pill-chip,` +
      ` .no-backdrop-filter .modern-sidebar-shell.blur-enabled .modern-sidebar-panel,` +
      ` .no-backdrop-filter .modern-sidebar-shell.blur-enabled .modern-sidebar-pill-chip {` +
      ` background: ${bgElevated}; border-color: ${border}; }`,

    `.profile-overlay-button-primary,` +
      ` .home-sidebar.content-expanded .home-nav-item.selected,` +
      ` .modern-sidebar-nav-item.selected,` +
      ` .modern-sidebar-nav-item.selected.focused,` +
      ` .library-picker-option.focused,` +
      ` .library-watched-badge { background: ${secondary}; color: ${onSecondary}; }`,

    `.modern-sidebar-nav-icon-circle, .modern-sidebar-pill-icon-wrap {` +
      ` background: ${focusBg}; }`,
    `.modern-sidebar-nav-item.selected .modern-sidebar-nav-icon-circle,` +
      ` .modern-sidebar-nav-item.selected.focused .modern-sidebar-nav-icon-circle {` +
      ` background: ${playerAccent}; color: ${onSecondary}; }`,

    `.modern-sidebar-pill-icon-wrap {` + ` background: ${playerAccent}; color: ${onSecondary}; }`,

    `.player-progress-fill, .player-parental-line-fill,` +
      ` .library-watched-badge, .title-watched-badge,` +
      ` .series-episode-status.complete { background: ${playerAccent}; }`,

    `.auth-simple-card.focused,` +
      ` .account-settings-card.focused {` +
      ` background: ${focusBg}; box-shadow: 0 0 0 2px ${focusColor}; }`,

    `.profile-avatar-tile.is-selected,` +
      ` .profile-avatar-tile.focused { box-shadow: inset 0 0 0 0.3125vw ${focusColor}; }`,

    `.library-grid-card.focused .library-grid-poster {` +
      ` box-shadow: 0 0 0 4px ${focusColor}; background-color: ${focusBg}; border-color: ${focusColor}; }`,

    `.library-action-button.focused {` +
      ` border-color: ${focusColor}; box-shadow: 0 0 0 2px ${focusColor}; background: ${focusBg}; }`
  ].join("\n");
}

const LEGACY_STYLE_ID = "nuvio-legacy-theme";
let memberAccessSubscriptionReady = false;
let initialMemberAccessObserved = false;

function ensureMemberAccessSubscription() {
  if (memberAccessSubscriptionReady) return;
  memberAccessSubscriptionReady = true;
  MemberAccessRepository.subscribe((access) => {
    if (!initialMemberAccessObserved) {
      initialMemberAccessObserved = true;
      return;
    }
    if (typeof document !== "undefined") {
      ThemeManager.apply({ enforceAccess: true, access });
    }
  });
}

function injectLegacyTheme(css) {
  let el = document.getElementById(LEGACY_STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = LEGACY_STYLE_ID;
  }
  el.textContent = css;
  document.head.appendChild(el);
}

export const ThemeManager = {
  apply({ enforceAccess = false, access = null } = {}) {
    ensureMemberAccessSubscription();
    applyAppearanceClass();
    const storedTheme = ThemeStore.get();
    const currentAccess = access || MemberAccessRepository.getCurrentAccess();
    const themeName = enforceAccess
      ? resolveThemeName(storedTheme.themeName, currentAccess)
      : String(storedTheme.themeName || "WHITE").toUpperCase();
    const theme =
      themeName === storedTheme.themeName
        ? storedTheme
        : {
            ...storedTheme,
            themeName,
            accentColor: accentColorForTheme(themeName)
          };
    const customColors =
      theme.themeName === "CUSTOM"
        ? resolveCustomThemeColors(theme.customThemeColors, Boolean(currentAccess?.tier))
        : null;
    const colors = withNotflixPalette({
      ...ThemeColors.getPalette(theme.themeName, customColors)
    });
    if (theme.amoledMode) {
      colors["--bg-color"] = "#000000";
      if (theme.amoledSurfacesMode) {
        colors["--bg-elevated"] = "#000000";
        colors["--card-bg"] = "#000000";
      }
    }
    const derivedColors = {
      "--bg-color-rgb": toRgbChannels(colors["--bg-color"], "13 13 13"),
      "--bg-color-rgb-legacy": toLegacyRgbChannels(colors["--bg-color"], "13, 13, 13"),
      "--bg-elevated-rgb": toRgbChannels(colors["--bg-elevated"], "26 26 26"),
      "--bg-elevated-rgb-legacy": toLegacyRgbChannels(colors["--bg-elevated"], "26, 26, 26"),
      "--card-bg-rgb": toRgbChannels(colors["--card-bg"], "34 34 34"),
      "--card-bg-rgb-legacy": toLegacyRgbChannels(colors["--card-bg"], "34, 34, 34"),
      "--secondary-color-rgb": toRgbChannels(colors["--secondary-color"], "245 245 245"),
      "--secondary-color-rgb-legacy": toLegacyRgbChannels(
        colors["--secondary-color"],
        "245, 245, 245"
      ),
      "--focus-color-rgb": toRgbChannels(colors["--focus-color"], "255 255 255"),
      "--focus-color-rgb-legacy": toLegacyRgbChannels(colors["--focus-color"], "255, 255, 255"),
      "--player-secondary": colors["--secondary-color"],
      "--player-accent-gradient": colors["--accent-gradient"] || colors["--secondary-color"],
      "--player-on-secondary": colors["--on-secondary"],
      "--player-focus-ring": colors["--focus-color"],
      "--player-focus-background": colors["--focus-bg"],
      "--player-background-elevated": colors["--bg-elevated"],
      "--player-background-card": colors["--card-bg"],
      "--player-text-primary": colors["--text-color"],
      "--player-text-secondary": colors["--text-secondary"],
      "--player-text-tertiary": colors["--text-tertiary"]
    };

    Object.entries({ ...colors, ...derivedColors }).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });

    document.documentElement.style.setProperty(
      "--app-font-family",
      FONT_STACKS[String(theme.fontFamily || "INTER").toUpperCase()] || FONT_STACKS.INTER
    );
    if (document.documentElement.dataset.nuvioTheme !== themeName) {
      document.documentElement.dataset.nuvioTheme = themeName;
    }
    syncBrandWordmarks(themeName);
    syncLoadingIndicatorPalette(colors);
    document.documentElement.style.setProperty("color-scheme", "dark");

    if (!SUPPORTS_CSS_VARS) {
      const colorMap = {
        bg: colors["--bg-color"],
        bgElevated: colors["--bg-elevated"],
        cardBg: colors["--card-bg"],
        secondary: colors["--secondary-color"],
        onSecondary: colors["--on-secondary"],
        focusColor: colors["--focus-color"],
        focusBg: colors["--focus-bg"],
        text: colors["--text-color"],
        textSecondary: colors["--text-secondary"],
        textTertiary: colors["--text-tertiary"],
        border: colors["--border-color"],
        playerAccent: colors["--accent-gradient"] || colors["--secondary-color"]
      };
      injectLegacyTheme(buildLegacyThemeCss(colorMap));
    }
  }
};
