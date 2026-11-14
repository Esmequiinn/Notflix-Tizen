import { LocalStore } from "../../../core/storage/localStore.js";
import { ProfileManager } from "../../../core/profile/profileManager.js";
import { TMDB_API_KEY } from "../../../config.js";

const LIMIT_KEY = "notflixAgeLimits";
const RATING_KEY = "notflixAgeRatings";
const MAX_CACHED = 3000;
const TMDB = "https://api.themoviedb.org/3";

export const AGE_LIMITS = Object.freeze(["none", "tp", "7", "12", "16", "18"]);

const LIMIT_AGE = { tp: 0, 7: 7, 12: 12, 16: 16, 18: 18 };

const CERT_AGE = {
  G: 0,
  "TV-Y": 0,
  "TV-G": 0,
  U: 0,
  0: 0,
  TP: 0,
  A: 0,
  "TV-Y7": 7,
  "TV-Y7-FV": 7,
  PG: 7,
  "TV-PG": 7,
  7: 7,
  "PG-13": 13,
  12: 12,
  13: 13,
  "TV-14": 14,
  14: 14,
  15: 15,
  16: 16,
  R: 17,
  17: 17,
  "NC-17": 18,
  "TV-MA": 18,
  18: 18,
  X: 18
};

let ratings = null;
let saveTimer = null;
const inFlight = new Map();

function profileKey() {
  return String(ProfileManager.getActiveProfileId?.() ?? "1").trim() || "1";
}

export function getAgeLimit() {
  const all = LocalStore.get(LIMIT_KEY, {}) || {};
  const value = String(all[profileKey()] || "none");
  return AGE_LIMITS.includes(value) ? value : "none";
}

export function setAgeLimit(value) {
  const all = { ...(LocalStore.get(LIMIT_KEY, {}) || {}) };
  all[profileKey()] = AGE_LIMITS.includes(value) ? value : "none";
  LocalStore.set(LIMIT_KEY, all);
}

export function isAgeLimitActive() {
  return getAgeLimit() !== "none";
}

export function canResolveAges() {
  return Boolean(String(TMDB_API_KEY || "").trim());
}

function store() {
  if (!ratings) {
    const raw = LocalStore.get(RATING_KEY, null);
    ratings = raw && typeof raw === "object" ? raw : {};
  }
  return ratings;
}

function persistSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const keys = Object.keys(store());
    if (keys.length > MAX_CACHED) {
      keys.slice(0, keys.length - MAX_CACHED).forEach((key) => delete ratings[key]);
    }
    LocalStore.set(RATING_KEY, ratings);
  }, 1500);
}

function cacheKey(type, id) {
  const normalized = String(type || "").toLowerCase() === "movie" ? "movie" : "series";
  return `${normalized}:${String(id || "").trim()}`;
}

export function certificationAge(certification) {
  const value = String(certification || "")
    .trim()
    .toUpperCase()
    .replace(/^\+/, "");
  if (!value) return null;
  if (Object.prototype.hasOwnProperty.call(CERT_AGE, value)) return CERT_AGE[value];
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function cachedAge(type, id) {
  const value = store()[cacheKey(type, id)];
  return value === undefined ? undefined : value;
}

export function isAllowedAge(age, limit = getAgeLimit()) {
  if (limit === "none") return true;
  if (age === undefined || age === null || age < 0) return false;
  return age <= LIMIT_AGE[limit];
}

export function isTitleAllowed(type, id, limit = getAgeLimit()) {
  if (limit === "none") return true;
  return isAllowedAge(cachedAge(type, id), limit);
}

function pickCertification(data, isMovie) {
  if (isMovie) {
    const results = Array.isArray(data?.results) ? data.results : [];
    const order = ["US", "ES", "MX", "GB"];
    for (const country of order) {
      const entry = results.find(
        (item) => String(item?.iso_3166_1 || "").toUpperCase() === country
      );
      const cert = (entry?.release_dates || [])
        .map((date) => String(date?.certification || "").trim())
        .find(Boolean);
      if (cert) return cert;
    }
    return "";
  }
  const results = Array.isArray(data?.results) ? data.results : [];
  const order = ["US", "ES", "MX", "GB"];
  for (const country of order) {
    const entry = results.find((item) => String(item?.iso_3166_1 || "").toUpperCase() === country);
    if (entry?.rating) return String(entry.rating);
  }
  return "";
}

async function fetchAge(type, id) {
  const isMovie = String(type || "").toLowerCase() === "movie";
  const apiKey = String(TMDB_API_KEY || "").trim();
  if (!apiKey) return -1;
  const { TmdbService, fetchTmdbJson } = await import("../../../core/tmdb/tmdbService.js");
  let tmdbId = String(id || "").startsWith("tmdb:") ? String(id).slice(5) : "";
  if (!tmdbId) {
    tmdbId = await TmdbService.ensureTmdbId(String(id), isMovie ? "movie" : "series", {
      requireEnabled: false
    }).catch(() => null);
  }
  if (!tmdbId) return -1;
  const path = isMovie ? `movie/${tmdbId}/release_dates` : `tv/${tmdbId}/content_ratings`;
  const data = await fetchTmdbJson(`${TMDB}/${path}?api_key=${encodeURIComponent(apiKey)}`).catch(
    () => null
  );
  const age = certificationAge(pickCertification(data, isMovie));
  return age === null ? -1 : age;
}

export function resolveAge(type, id) {
  const key = cacheKey(type, id);
  const cached = store()[key];
  if (cached !== undefined) return Promise.resolve(cached);
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = fetchAge(type, id)
    .catch(() => -1)
    .then((age) => {
      inFlight.delete(key);
      store()[key] = age;
      persistSoon();
      return age;
    });
  inFlight.set(key, promise);
  return promise;
}

export async function resolveAges(items = [], { concurrency = 4 } = {}) {
  const queue = items.filter((item) => item?.id && cachedAge(item.type, item.id) === undefined);
  let resolved = 0;
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await resolveAge(item.type, item.id);
      resolved += 1;
    }
  });
  await Promise.all(workers);
  return resolved;
}
