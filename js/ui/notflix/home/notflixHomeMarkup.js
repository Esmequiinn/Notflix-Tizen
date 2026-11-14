import { I18n } from "../../../i18n/index.js";
import { ratingsMarkup } from "../ratings/notflixRatings.js";

const ICON_PATHS = {
  play: "M8 5v14l11-7z",
  info: "M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z",
  add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  check: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  eye: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z",
  eyeOff:
    "M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2z",
  block:
    "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z",
  more: "M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
};

export function nt(key, fallback, params = {}) {
  return I18n.t(key, params, { fallback });
}

export function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function icon(name) {
  const path = ICON_PATHS[name] || "";
  return `<svg class="nf-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

export function extractYear(item) {
  const match = String(item?.releaseInfo || item?.released || item?.year || "").match(/\d{4}/);
  return match ? match[0] : "";
}

export function formatRating(item) {
  const value = Number(item?.imdbRating);
  if (!Number.isFinite(value) || value <= 0) return "";
  return value.toFixed(1);
}

export function formatRuntime(item) {
  const minutes = Number(item?.runtimeMinutes || 0);
  return minutes > 0 ? nt("notflix_runtime_minutes", `${minutes} min`, { 1: minutes }) : "";
}

export function formatEndsAt(item, now = new Date()) {
  const minutes = Number(item?.runtimeMinutes || 0);
  if (!(minutes > 0) || String(item?.type || "") !== "movie") return "";
  const end = new Date(now.getTime() + minutes * 60000);
  let clock = "";
  try {
    clock = end.toLocaleTimeString(I18n.getLocale?.() || undefined, {
      hour: "numeric",
      minute: "2-digit"
    });
  } catch (_) {
    clock = `${end.getHours()}:${String(end.getMinutes()).padStart(2, "0")}`;
  }
  return nt("notflix_ends_at", `Ends at ${clock}`, { 1: clock });
}

export function genresLine(item, limit = 3) {
  const genres = Array.isArray(item?.genres) ? item.genres.filter(Boolean).slice(0, limit) : [];
  return genres.join(" · ");
}

export function kindLabel(item) {
  const type = String(item?.type || item?.apiType || "").toLowerCase();
  if (type === "movie") return nt("notflix_billboard_film", "FILM");
  if (type === "series" || type === "tv") return nt("notflix_billboard_series", "SERIES");
  return "";
}

export function imdbBadge(rating, className = "nf-imdb-badge") {
  if (!rating) return "";
  return `<span class="${className}"><b>IMDb</b> ${escapeText(rating)}</span>`;
}

export function billboardMarkup(item, candidates = [], activeIndex = 0) {
  const rating = formatRating(item);
  const facts = [extractYear(item), formatRuntime(item)].filter(Boolean).join(" · ");
  const genres = genresLine(item);
  const kind = kindLabel(item);
  const title = escapeText(item?.name || "");
  const brand = item?.logo
    ? `<img class="nf-bb-logo" src="${escapeText(item.logo)}" alt="${title}" decoding="async" />`
    : `<h1 class="nf-bb-title">${title}</h1>`;
  const markers =
    candidates.length > 1
      ? candidates
          .map(
            (_, index) =>
              `<span class="nf-bb-marker${index === activeIndex ? " is-active" : ""}"></span>`
          )
          .join("")
      : "";
  return `
    <div class="nf-bb-copy">
      <div class="nf-bb-label"><span class="nf-wordmark nf-wordmark-small"></span>${kind ? `<span class="nf-bb-kind">${escapeText(kind)}</span>` : ""}</div>
      <div class="nf-bb-brand">${brand}</div>
      <div class="nf-bb-facts">${item?.nfRatings ? ratingsMarkup(item.nfRatings, "nf-ratings nf-bb-ratings") : rating ? `<span class="nf-bb-rating">IMDb ${escapeText(rating)}</span>` : ""}${facts ? `<span class="nf-bb-meta">${escapeText(facts)}</span>` : ""}</div>
      ${genres ? `<div class="nf-bb-genres">${escapeText(genres)}</div>` : ""}
      ${item?.description ? `<p class="nf-bb-desc">${escapeText(item.description)}</p>` : ""}
      <div class="nf-bb-actions">
        <span class="nf-bb-btn nf-bb-primary" data-nf-index="0">${icon("play")}<span>${escapeText(nt("notflix_billboard_play", "Play"))}</span></span>
        <span class="nf-bb-btn nf-bb-secondary" data-nf-index="1">${icon("info")}<span>${escapeText(nt("notflix_billboard_info", "More information"))}</span></span>
      </div>
    </div>
    <div class="nf-bb-markers">${markers}</div>
  `;
}

export const CARD_ACTIONS = Object.freeze(["play", "details", "library", "watched", "hide"]);

export function cardActionLabel(action, state = {}) {
  switch (action) {
    case "play":
      return nt("notflix_billboard_play", "Play");
    case "details":
      return nt("notflix_details", "View details");
    case "library":
      return state.saved
        ? nt("notflix_card_state_in_library", "In library")
        : nt("notflix_my_list_add", "Add to My list");
    case "watched":
      return state.watched
        ? nt("notflix_card_state_watched", "Watched")
        : nt("notflix_card_mark_watched", "Mark as watched");
    case "hide":
      return nt("notflix_hide_title", "Hide this title");
    default:
      return "";
  }
}

function cardActionIcon(action, state) {
  if (action === "play") return icon("play");
  if (action === "details") return icon("info");
  if (action === "library") return icon(state.saved ? "check" : "add");
  if (action === "watched") return icon(state.watched ? "eye" : "eyeOff");
  if (action === "hide") return icon("block");
  return "";
}

export function cardActionsMarkup(state = {}, cursor = -1) {
  return CARD_ACTIONS.map(
    (action, index) =>
      `<span class="nf-xp-action${index === 0 ? " nf-xp-action-play" : ""}${index === cursor ? " is-selected" : ""}" data-nf-action="${action}">${cardActionIcon(action, state)}</span>`
  ).join("");
}

export function expandedArtMarkup(item) {
  const backdrop =
    item?.background || item?.backdrop || item?.landscapePoster || item?.poster || "";
  const logo = item?.logo || "";
  const title = escapeText(item?.name || "");
  return `
    <div class="nf-xp">
      <div class="nf-xp-art">
        ${backdrop ? `<img class="nf-xp-backdrop" src="${escapeText(backdrop)}" alt="" decoding="async" />` : ""}
        <div class="nf-xp-scrim"></div>
        <div class="nf-xp-brand">${logo ? `<img class="nf-xp-logo" src="${escapeText(logo)}" alt="${title}" decoding="async" />` : `<span class="nf-xp-title">${title}</span>`}</div>
      </div>
    </div>
  `;
}

export function expandedInfoMarkup(item, state = {}) {
  const rating = formatRating(item);
  const facts = [extractYear(item), formatRuntime(item)].filter(Boolean).join(" · ");
  const ends = formatEndsAt(item);
  const genres = genresLine(item);
  return `
    <div class="nf-xp-actions">${cardActionsMarkup(state)}</div>
    <div class="nf-xp-label"></div>
    <div class="nf-xp-facts">${item?.nfRatings ? ratingsMarkup(item.nfRatings, "nf-ratings", 3) : imdbBadge(rating)}${facts ? `<span class="nf-xp-meta">${escapeText(facts)}</span>` : ""}${ends ? `<span class="nf-xp-ends">${escapeText(ends)}</span>` : ""}</div>
    ${genres ? `<div class="nf-xp-genres">${escapeText(genres)}</div>` : ""}
    ${item?.description ? `<p class="nf-xp-desc">${escapeText(item.description)}</p>` : ""}
  `;
}
