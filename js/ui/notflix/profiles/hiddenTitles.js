import { LocalStore } from "../../../core/storage/localStore.js";
import { ProfileManager } from "../../../core/profile/profileManager.js";

const STORE_KEY = "notflixHiddenTitles";
let cache = null;

function profileKey() {
  return String(ProfileManager.getActiveProfileId?.() ?? "1").trim() || "1";
}

function normalizeType(type) {
  const value = String(type || "").toLowerCase();
  return value === "tv" || value === "anime" ? "series" : value || "movie";
}

function keyOf(type, id) {
  return `${normalizeType(type)}:${String(id || "").trim()}`;
}

function readAll() {
  if (!cache) {
    const raw = LocalStore.get(STORE_KEY, null);
    cache = raw && typeof raw === "object" ? raw : {};
  }
  return cache;
}

function profileEntries() {
  const entries = readAll()[profileKey()];
  return Array.isArray(entries) ? entries : [];
}

function save(entries) {
  cache = { ...readAll(), [profileKey()]: entries };
  LocalStore.set(STORE_KEY, cache);
}

export function isHiddenTitle(type, id) {
  if (!id) return false;
  const key = keyOf(type, id);
  return profileEntries().some((entry) => entry.key === key);
}

export function hideTitle(type, id, title = "", poster = "") {
  if (!id) return;
  const key = keyOf(type, id);
  const entries = profileEntries().filter((entry) => entry.key !== key);
  entries.unshift({
    key,
    type: normalizeType(type),
    id: String(id),
    title: String(title || ""),
    poster: String(poster || "")
  });
  save(entries.slice(0, 500));
}

export function unhideTitle(type, id) {
  const key = keyOf(type, id);
  save(profileEntries().filter((entry) => entry.key !== key));
}

export function listHiddenTitles() {
  return profileEntries().slice();
}
