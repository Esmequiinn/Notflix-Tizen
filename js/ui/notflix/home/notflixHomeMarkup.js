import { I18n } from "../../../i18n/index.js";
import { backdropOf } from "./notflixPreload.js";

const ICON_PATHS = {
  play: "M8 5v14l11-7z",
  info: "M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"
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

export function formatRuntime(item) {
  const minutes = Number(item?.runtimeMinutes || 0);
  return minutes > 0 ? nt("notflix_runtime_minutes", `${minutes} min`, { 1: minutes }) : "";
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

export function billboardMarkup(item, candidates = [], activeIndex = 0) {
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
      ${facts ? `<div class="nf-bb-facts"><span class="nf-bb-meta">${escapeText(facts)}</span></div>` : ""}
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

export function expandedArtMarkup(item) {
  const backdrop = backdropOf(item);
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
