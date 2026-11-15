import { Router } from "../../navigation/routerState.js";
import { getCardOpeningDelayMs, getNotflixOptions } from "../notflixOptions.js";
import { normalizeContinueWatchingItem } from "../../screens/home/homeScreenHelpers-09-normalize-continue-watching-item.js";
import { escapeText, nt } from "./notflixHomeMarkup.js";

const MIN_IDLE_MS = 2500;

export function isContinueCard(node) {
  return Boolean(
    node?.matches?.(".home-continue-card.focusable") &&
    !node.classList.contains("home-continue-card-loading")
  );
}

function cwItem(screen, card) {
  const index = Number(card?.dataset?.cwIndex);
  const items = Array.isArray(screen.continueWatchingRenderedItems)
    ? screen.continueWatchingRenderedItems
    : [];
  const raw = Number.isFinite(index) ? items[index] : null;
  return raw ? normalizeContinueWatchingItem(raw) : null;
}

export function formatRemaining(item) {
  const duration = Number(item?.durationMs || 0);
  const position = Number(item?.positionMs || 0);
  if (!(duration > 0) || !(position > 0) || position >= duration) return "";
  const minutes = Math.max(1, Math.round((duration - position) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const time = hours
    ? rest
      ? nt("notflix_time_hm", `${hours} h ${rest} min`, { 1: hours, 2: rest })
      : nt("notflix_time_h", `${hours} h`, { 1: hours })
    : nt("notflix_runtime_minutes", `${minutes} min`, { 1: minutes });
  return nt("notflix_cw_remaining", `${time} left`, { 1: time });
}

export function episodeLabel(item) {
  const season = Number(item?.season);
  const episode = Number(item?.episode);
  if (!(season >= 0) || !(episode > 0)) return "";
  return nt("notflix_episode_code", `S${season}:E${episode}`, { 1: season, 2: episode });
}

function artMarkup(item) {
  const isSeries = Number(item?.episode) > 0;
  const image = isSeries
    ? item.episodeThumbnail || item.thumbnail || item.backdrop || item.background
    : item.backdrop || item.background || item.landscapePoster || item.poster;
  const title = escapeText(item?.title || item?.name || "");
  const percent = Math.round(Math.max(0, Math.min(1, Number(item?.progressFraction || 0))) * 100);
  return `
    <div class="nf-cw-xp">
      ${image ? `<img class="nf-cw-xp-img" src="${escapeText(image)}" alt="" decoding="async" />` : ""}
      <div class="nf-cw-xp-scrim"></div>
      <div class="nf-cw-xp-brand">${item?.logo ? `<img class="nf-cw-xp-logo" src="${escapeText(item.logo)}" alt="${title}" decoding="async" />` : `<span class="nf-cw-xp-title">${title}</span>`}</div>
      ${percent > 0 ? `<div class="nf-cw-xp-progress"><span style="width:${percent}%"></span></div>` : ""}
    </div>
  `;
}

export function continueInfoMarkup(screen, card) {
  const item = cwItem(screen, card);
  if (!item) return "";
  const code = episodeLabel(item);
  const episodeTitle = String(item?.episodeTitle || "");
  const head = [code, episodeTitle].filter(Boolean).join(" • ") || String(item?.title || "");
  const remaining = formatRemaining(item);
  const second = remaining || (item?.isNextUp ? nt("notflix_cw_next_up", "Next episode") : "");
  if (!head && !second) return "";
  return `${head ? `<div class="nf-cw-info-head">${escapeText(head)}</div>` : ""}${second ? `<div class="nf-cw-info-sub">${escapeText(second)}</div>` : ""}`;
}

function clearTimer(screen) {
  if (screen.nfCwTimer) {
    clearTimeout(screen.nfCwTimer);
    screen.nfCwTimer = null;
  }
}

export function collapseContinueCard(screen) {
  clearTimer(screen);
  const card = screen.nfCwCard;
  screen.nfCwCard = null;
  if (card) {
    card.classList.remove("nf-cw-expanded");
    card.querySelector(".nf-cw-xp")?.remove();
  }
}

function expand(screen, card) {
  if (!card?.isConnected || !card.classList.contains("focused")) return;
  const item = cwItem(screen, card);
  if (!item) return;
  collapseContinueCard(screen);
  screen.nfCwCard = card;
  const media = card.querySelector(".home-continue-media") || card;
  media.insertAdjacentHTML("beforeend", artMarkup(item));
  card.classList.add("nf-cw-expanded");
  screen.ensureTrackHorizontalVisibility?.(card, "right", 0);
}

export function scheduleContinueExpand(screen, card) {
  clearTimer(screen);
  if (getNotflixOptions().homeMotion === "reduced") return;
  const opening = getCardOpeningDelayMs();
  const delay =
    getNotflixOptions().cardOpening === "instant"
      ? opening * 2
      : Math.max(MIN_IDLE_MS, opening * 2);
  screen.nfCwTimer = setTimeout(() => {
    screen.nfCwTimer = null;
    if (Router.getCurrent?.() !== "home") return;
    expand(screen, card);
  }, delay);
}
