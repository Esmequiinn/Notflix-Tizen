import { LocalStore } from "../../../core/storage/localStore.js";
import { normalizeTmdbBackdropUrl } from "../../../core/tmdb/tmdbImageUrl.js";
import { I18n } from "../../../i18n/index.js";
import { TMDB_API_KEY } from "../../../config.js";

const STORE_KEY = "notflixShowcase";
const MAX_ITEMS = 12;
const MIN_SAVE_INTERVAL_MS = 10 * 60 * 1000;

let lastSignature = "";
let lastSavedAt = 0;

function isCollection(item) {
  const type = String(item?.type || item?.apiType || "").toLowerCase();
  return (
    type === "collection_folder" ||
    type === "collection" ||
    String(item?.heroSource || "").toLowerCase() === "collection" ||
    Boolean(item?.collectionId || item?.folderId)
  );
}

function toEntry(item) {
  if (!item || isCollection(item)) return null;
  const type = String(item?.type || item?.apiType || "").toLowerCase();
  if (type && type !== "movie" && type !== "series" && type !== "tv" && type !== "anime")
    return null;
  const description = String(item?.description || "").trim();
  const background = normalizeTmdbBackdropUrl(item?.background || item?.backdrop || "");
  if (!background) return null;
  const genres = (Array.isArray(item?.genres) ? item.genres : [])
    .map((genre) => String(genre?.name || genre || "").trim())
    .filter(Boolean)
    .slice(0, 3);
  return {
    id: String(item?.id || ""),
    name: String(item?.name || item?.title || ""),
    background,
    logo: String(item?.logo || ""),
    genres,
    description: description.length > 320 ? `${description.slice(0, 317)}…` : description
  };
}

export function saveShowcase(items = []) {
  const entries = [];
  const seen = new Set();
  for (const item of items) {
    if (entries.length >= MAX_ITEMS) break;
    const entry = toEntry(item);
    if (!entry || !entry.id || seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  if (entries.length < 2) return;
  const signature = entries
    .map((entry) => `${entry.id}${entry.logo ? "+" : ""}${entry.description.length}`)
    .join(",");
  const now = Date.now();
  if (signature === lastSignature) return;
  if (lastSignature && now - lastSavedAt < MIN_SAVE_INTERVAL_MS) return;
  lastSignature = signature;
  lastSavedAt = now;
  LocalStore.set(STORE_KEY, entries);
}

export function readShowcase() {
  const raw = LocalStore.get(STORE_KEY, null);
  return Array.isArray(raw)
    ? raw.filter((entry) => entry?.background && entry?.name && !isCollection(entry))
    : [];
}

const TRENDING_KEY = "notflixShowcaseTrending2";
const TRENDING_TTL_MS = 12 * 60 * 60 * 1000;
const TMDB = "https://api.themoviedb.org/3";
let trendingPromise = null;

function tmdbLanguage() {
  const locale = String(I18n.getLocale?.() || "es").toLowerCase();
  if (locale.startsWith("es")) return "es-MX";
  if (locale.startsWith("pt")) return "pt-BR";
  return locale.split("-")[0] || "en";
}

async function buildTrending() {
  const apiKey = String(TMDB_API_KEY || "").trim();
  if (!apiKey) return [];
  const { fetchTmdbJson } = await import("../../../core/tmdb/tmdbService.js");
  const language = tmdbLanguage();
  const query = `api_key=${encodeURIComponent(apiKey)}&language=${encodeURIComponent(language)}`;
  const [trending, movieGenres, tvGenres] = await Promise.all([
    fetchTmdbJson(`${TMDB}/trending/all/week?${query}`).catch(() => null),
    fetchTmdbJson(`${TMDB}/genre/movie/list?${query}`).catch(() => null),
    fetchTmdbJson(`${TMDB}/genre/tv/list?${query}`).catch(() => null)
  ]);
  const genreNames = new Map();
  [...(movieGenres?.genres || []), ...(tvGenres?.genres || [])].forEach((genre) =>
    genreNames.set(genre.id, genre.name)
  );
  const results = (Array.isArray(trending?.results) ? trending.results : [])
    .filter(
      (item) =>
        item?.backdrop_path &&
        (item.media_type === "movie" || item.media_type === "tv") &&
        item.overview
    )
    .slice(0, MAX_ITEMS);
  const logoLanguage = language.split("-")[0];
  const entries = await Promise.all(
    results.map(async (item) => {
      const images = await fetchTmdbJson(
        `${TMDB}/${item.media_type}/${item.id}/images?api_key=${encodeURIComponent(apiKey)}&include_image_language=${logoLanguage},en,null`
      ).catch(() => null);
      const logos = Array.isArray(images?.logos) ? images.logos : [];
      const logo =
        logos.find((entry) => entry?.iso_639_1 === logoLanguage) ||
        logos.find((entry) => entry?.iso_639_1 === "en") ||
        logos[0];
      const description = String(item.overview || "").trim();
      return {
        id: `tmdb:${item.media_type}:${item.id}`,
        name: String(item.title || item.name || ""),
        background: `https://image.tmdb.org/t/p/w780${item.backdrop_path}`,
        logo: logo?.file_path ? `https://image.tmdb.org/t/p/w500${logo.file_path}` : "",
        genres: (item.genre_ids || [])
          .map((id) => genreNames.get(id))
          .filter(Boolean)
          .slice(0, 3),
        description: description.length > 320 ? `${description.slice(0, 317)}…` : description
      };
    })
  );
  return entries.filter((entry) => entry.name);
}

export function loadTrendingShowcase() {
  const cached = LocalStore.get(TRENDING_KEY, null);
  const language = tmdbLanguage();
  if (
    cached &&
    Array.isArray(cached.entries) &&
    cached.entries.length &&
    cached.language === language &&
    Date.now() - Number(cached.at || 0) < TRENDING_TTL_MS
  ) {
    return Promise.resolve(cached.entries);
  }
  if (!trendingPromise) {
    trendingPromise = buildTrending()
      .catch(() => [])
      .then((entries) => {
        trendingPromise = null;
        if (entries.length) LocalStore.set(TRENDING_KEY, { at: Date.now(), language, entries });
        else if (cached?.entries?.length) return cached.entries;
        return entries;
      });
  }
  return trendingPromise;
}
