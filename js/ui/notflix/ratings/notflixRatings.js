import { MdbListSettingsStore } from "../../../data/local/mdbListSettingsStore.js";
import { mdbListRepository } from "../../../data/repository/mdbListRepository.js";
import { mdbListRatingIcon } from "../../../core/util/mdbListRatingStatus.js";

const ORDER = [
  ["imdb", "assets/icons/imdb_logo_2016.svg"],
  ["tmdb", "assets/icons/mdblist_tmdb.svg"],
  ["trakt", "assets/icons/trakt_tv_favicon.svg"]
];

const cache = new Map();
const MAX_CACHE = 300;

function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isMdbListActive() {
  const settings = MdbListSettingsStore.get() || {};
  return Boolean(settings.enabled && String(settings.apiKey || "").trim());
}

function cacheKey(item) {
  return `${String(item?.type || item?.apiType || "movie")}:${String(item?.id || "")}`;
}

export function cachedRatings(item) {
  return cache.get(cacheKey(item)) || null;
}

export function loadRatings(item) {
  if (!item?.id || !isMdbListActive()) return Promise.resolve(null);
  const key = cacheKey(item);
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  return mdbListRepository
    .getRatingsForMeta(item, String(item.id), String(item.type || item.apiType || "movie"))
    .catch(() => null)
    .then((result) => {
      const ratings = result?.ratings || null;
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
      cache.set(key, ratings);
      return ratings;
    });
}

function formatValue(provider, value) {
  const parsed = Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) return String(value);
  if (provider === "imdb" || provider === "tmdb" || provider === "letterboxd")
    return parsed.toFixed(1);
  return parsed.toFixed(1).replace(/\.0$/, "");
}

export function ratingsMarkup(ratings, className = "nf-ratings", limit = 0) {
  if (!ratings) return "";
  const available = ORDER.filter(
    ([key]) => ratings[key] != null && String(ratings[key]).trim() !== ""
  );
  const chips = (limit > 0 ? available.slice(0, limit) : available).map(([key, icon]) => {
    const src = icon || mdbListRatingIcon(key, ratings[key], ratings);
    const suffix = key === "tomatoes" || key === "audience" ? "%" : "";
    return `<span class="nf-rating-chip"><img src="${escapeText(src)}" alt="${escapeText(key)}" decoding="async" /><span>${escapeText(formatValue(key, ratings[key]))}${suffix}</span></span>`;
  });
  return chips.length ? `<span class="${className}">${chips.join("")}</span>` : "";
}
