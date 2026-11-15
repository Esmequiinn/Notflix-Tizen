import { TmdbSettingsStore } from "../../../data/local/tmdbSettingsStore.js";
import { TmdbService } from "../../../core/tmdb/tmdbService.js";
import { TmdbMetadataService } from "../../../core/tmdb/tmdbMetadataService.js";
import { TMDB_API_KEY } from "../../../config.js";

const cache = new Map();
const MAX_ENTRIES = 300;

function remember(key, value) {
  cache.set(key, value);
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
  return value;
}

export function localizedDetails(item) {
  const settings = TmdbSettingsStore.get();
  const id = String(item?.id || "");
  if (!settings.enabled || !String(TMDB_API_KEY || "").trim() || !id) return Promise.resolve(null);
  const type = String(item?.type || item?.apiType || "movie");
  const key = `${type}:${id}:${settings.language}`;
  if (cache.has(key)) return cache.get(key);
  const promise = (async () => {
    const tmdbId = await TmdbService.ensureTmdbId(id, type).catch(() => null);
    if (!tmdbId) return null;
    const data = await TmdbMetadataService.fetchEnrichment({
      tmdbId,
      contentType: type,
      language: settings.language,
      includeCredits: false
    }).catch(() => null);
    if (!data) return null;
    const details = {};
    if (settings.useBasicInfo !== false) {
      if (data.description) details.description = data.description;
      if (Array.isArray(data.genres) && data.genres.length) details.genres = data.genres;
      if (data.localizedTitle) details.name = data.localizedTitle;
    }
    if (settings.useArtwork !== false && data.logo) details.logo = data.logo;
    if (data.ageRating) details.ageRating = String(data.ageRating);
    const minutes = Number(String(data.runtime || "").replace(/\D+/g, ""));
    if (minutes > 0) details.runtimeMinutes = minutes;
    return Object.keys(details).length ? details : null;
  })().catch(() => null);
  return remember(key, promise);
}
