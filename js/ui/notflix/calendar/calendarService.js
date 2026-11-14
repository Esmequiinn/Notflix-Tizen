import { TraktAuthService } from "../../../data/repository/traktAuthService.js";
import { authorizedTraktRequest } from "../../../data/repository/libraryRepositoryHelpers-03-authorized-trakt-request.js";
import { metaRepository } from "../../../data/repository/metaRepository.js";
import { Router } from "../../navigation/routerState.js";
import { isHiddenTitle } from "../profiles/hiddenTitles.js";
import { isAgeLimitActive, isTitleAllowed, resolveAges } from "../profiles/ageGate.js";
import { ProfileManager } from "../../../core/profile/profileManager.js";
import { TMDB_API_KEY } from "../../../config.js";

export const CALENDAR_DAYS = 30;
const CACHE_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 160;
const AGE_TIMEOUT_MS = 5000;
let cachedResult = null;

function isoDay(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

async function traktEntries(today) {
  const { payload } = await authorizedTraktRequest(
    `/calendars/my/shows/${isoDay(today)}/${CALENDAR_DAYS}`,
    {
      errorMessage: "Trakt calendar failed"
    }
  );
  return (Array.isArray(payload) ? payload : [])
    .map((entry) => {
      const show = entry?.show || {};
      const episode = entry?.episode || {};
      const imdb = String(show?.ids?.imdb || "");
      const tmdb = show?.ids?.tmdb ? `tmdb:${show.ids.tmdb}` : "";
      const contentId = imdb || tmdb;
      const airDate = parseDate(entry?.first_aired);
      if (!contentId || !airDate) return null;
      return {
        contentId,
        contentType: "series",
        tmdbId: show?.ids?.tmdb ? String(show.ids.tmdb) : "",
        title: String(show?.title || ""),
        season: Number(episode?.season || 0),
        episode: Number(episode?.number || 0),
        episodeTitle: String(episode?.title || ""),
        airDate,
        poster: ""
      };
    })
    .filter(Boolean);
}

function nuvioEntries(today) {
  const home = Router.routes?.home;
  const items = Array.isArray(home?.continueWatchingDisplay) ? home.continueWatchingDisplay : [];
  const limit = new Date(today.getTime() + CALENDAR_DAYS * 86400000);
  return items
    .filter((item) => item?.isNextUp)
    .map((item) => {
      const airDate = parseDate(
        item.released || item.releaseDate || item.airDate || item.firstAired
      );
      if (!airDate || airDate < today || airDate > limit) return null;
      return {
        contentId: String(item.contentId || item.id || ""),
        contentType: String(item.contentType || item.type || "series"),
        title: String(item.title || item.name || ""),
        season: Number(item.season || 0),
        episode: Number(item.episode || 0),
        episodeTitle: String(item.episodeTitle || ""),
        airDate,
        poster: String(item.poster || "")
      };
    })
    .filter((entry) => entry && entry.contentId);
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
}

function profileKey() {
  return String(ProfileManager.getActiveProfileId?.() ?? "1");
}

export function cachedCalendar() {
  if (!cachedResult || cachedResult.profile !== profileKey()) return null;
  if (Date.now() - cachedResult.at > CACHE_MS) return null;
  return cachedResult.result;
}

export async function loadCalendar({ force = false } = {}) {
  const cached = force ? null : cachedCalendar();
  if (cached) return cached;
  const result = await buildCalendar();
  cachedResult = { at: Date.now(), profile: profileKey(), result };
  return result;
}

async function buildCalendar() {
  const today = startOfDay(new Date());
  let source = "nuvio";
  let entries = [];
  if (TraktAuthService.isAuthenticated()) {
    try {
      entries = await traktEntries(today);
      source = "trakt";
    } catch (_) {
      entries = nuvioEntries(today);
    }
  } else {
    entries = nuvioEntries(today);
  }
  entries = entries
    .filter((entry) => !isHiddenTitle(entry.contentType, entry.contentId))
    .slice(0, MAX_ENTRIES);
  if (isAgeLimitActive()) {
    const unique = new Map();
    entries.forEach((entry) =>
      unique.set(entry.contentId, { id: entry.contentId, type: entry.contentType })
    );
    await withTimeout(resolveAges(Array.from(unique.values())), AGE_TIMEOUT_MS);
    entries = entries.filter((entry) => isTitleAllowed(entry.contentType, entry.contentId));
  }
  entries.sort((a, b) => a.airDate - b.airDate);
  const byDay = new Map();
  entries.forEach((entry) => {
    const key = isoDay(entry.airDate);
    if (!byDay.has(key)) byDay.set(key, { key, date: startOfDay(entry.airDate), entries: [] });
    byDay.get(key).entries.push(entry);
  });
  return { source, days: Array.from(byDay.values()) };
}

const posterCache = new Map();

async function tmdbPoster(tmdbId) {
  const apiKey = String(TMDB_API_KEY || "").trim();
  if (!apiKey || !tmdbId) return "";
  const { fetchTmdbJson } = await import("../../../core/tmdb/tmdbService.js");
  const data = await fetchTmdbJson(
    `https://api.themoviedb.org/3/tv/${encodeURIComponent(tmdbId)}/images?api_key=${encodeURIComponent(apiKey)}&include_image_language=es,en,null`
  ).catch(() => null);
  const posters = Array.isArray(data?.posters) ? data.posters : [];
  const pick = posters.find((poster) => poster?.iso_639_1 === "es") || posters[0];
  return pick?.file_path ? `https://image.tmdb.org/t/p/w342${pick.file_path}` : "";
}

export async function posterFor(entry) {
  if (entry.poster) return entry.poster;
  if (posterCache.has(entry.contentId)) return posterCache.get(entry.contentId);
  let poster = await tmdbPoster(entry.tmdbId).catch(() => "");
  if (!poster) {
    const result = await withTimeout(
      metaRepository.getMetaFromAllAddons("series", entry.contentId).catch(() => null),
      6000
    );
    poster = result?.status === "success" ? String(result?.data?.poster || "") : "";
  }
  posterCache.set(entry.contentId, poster);
  return poster;
}
