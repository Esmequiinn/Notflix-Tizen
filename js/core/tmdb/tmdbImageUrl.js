import { Platform } from "../../platform/index.js";
import { getTvArtworkPixelRatio } from "../../platform/tvRuntimePerformance.js";

const TMDB_IMAGE_HOST_PATTERN = /^(?:https?:)?\/\/image\.tmdb\.org\//i;

const TMDB_CARD_POSTER_SIZE = "w500";
const TMDB_LEGACY_TV_CARD_POSTER_SIZE = "w342";

let cachedCardPosterSize = null;

function tvCanUseSmallCardPosters() {
  const isTv = Boolean(Platform.isTizen?.() || Platform.isWebOS?.());
  return isTv && typeof OffscreenCanvas === "undefined" && getTvArtworkPixelRatio() === 1;
}

export function preferredTmdbCardPosterSize() {
  if (cachedCardPosterSize === null) {
    cachedCardPosterSize = tvCanUseSmallCardPosters()
      ? TMDB_LEGACY_TV_CARD_POSTER_SIZE
      : TMDB_CARD_POSTER_SIZE;
  }
  return cachedCardPosterSize;
}

export function resetPreferredTmdbCardPosterSizeForTests() {
  cachedCardPosterSize = null;
}

export function normalizeTmdbBackdropUrl(value) {
  const normalized = String(value || "").trim();
  if (!normalized || !TMDB_IMAGE_HOST_PATTERN.test(normalized)) {
    return normalized;
  }
  return normalized.replace(/(\/t\/p\/)(?:original|w780)\//i, "$1w1280/");
}

export function normalizeTmdbPosterUrl(value) {
  const normalized = String(value || "").trim();
  if (!normalized || !TMDB_IMAGE_HOST_PATTERN.test(normalized)) {
    return normalized;
  }
  const size = preferredTmdbCardPosterSize();
  const oversized =
    size === TMDB_CARD_POSTER_SIZE ? /(\/t\/p\/)original\//i : /(\/t\/p\/)(?:original|w500)\//i;
  return normalized.replace(oversized, `$1${size}/`);
}
