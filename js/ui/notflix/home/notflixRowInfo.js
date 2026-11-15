import { escapeText, extractYear, nt } from "./notflixHomeMarkup.js";

const ROW_SELECTOR = ".home-row-continue, .home-row";
const INFO_WIDTH = 1100;
const EDGE = 68;
const INFO_GAP = 4;
const MIN_INFO_WIDTH = 640;
const REALIGN_DELAYS = [180, 420, 800, 1300];

export function rowOfNode(node) {
  return node?.closest?.(ROW_SELECTOR) || null;
}

function infoHost(row, create) {
  let host = null;
  for (let index = 0; index < row.children.length; index += 1) {
    if (row.children[index].classList.contains("nf-row-info")) {
      host = row.children[index];
      break;
    }
  }
  if (!host && create) {
    host = document.createElement("div");
    host.className = "nf-row-info";
    row.appendChild(host);
  }
  return host;
}

export function activateRow(screen, node) {
  const row = node ? rowOfNode(node) : null;
  if (screen.nfActiveRow === row) return row;
  const previous = screen.nfActiveRow;
  if (previous) {
    previous.style.paddingBottom = "";
    previous.classList.remove("nf-row-active");
    infoHost(previous, false)?.remove();
  }
  screen.nfActiveRow = row;
  screen.nfRowInfoCard = null;
  if (row) row.classList.add("nf-row-active");
  return row;
}

function alignInfo(screen, card, host) {
  const row = screen.nfActiveRow;
  if (!row || screen.nfRowInfoCard !== card) return;
  const rowRect = row.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const viewport = globalThis.innerWidth || 1920;
  const left = Math.max(EDGE, Math.min(cardRect.left, viewport - EDGE - MIN_INFO_WIDTH));
  const width = Math.min(INFO_WIDTH, viewport - EDGE - left);
  host.style.width = `${Math.round(width)}px`;
  host.style.left = `${Math.max(0, Math.round(left - rowRect.left))}px`;
  const top = Math.max(0, Math.round(cardRect.bottom - rowRect.top + INFO_GAP));
  host.style.top = `${top}px`;
  host.style.bottom = "auto";
  const padding = parseFloat(row.style.paddingBottom) || 0;
  const contentHeight = rowRect.height - padding;
  const needed = Math.max(0, Math.ceil(top + host.offsetHeight - contentHeight));
  if (Math.abs(needed - padding) > 1) row.style.paddingBottom = `${needed}px`;
}

export function setRowInfo(screen, card, markup) {
  const row = screen.nfActiveRow;
  if (!row || !card || !row.contains(card)) return;
  const host = infoHost(row, true);
  if (host.innerHTML !== markup) host.innerHTML = markup;
  host.classList.toggle("is-empty", !markup);
  screen.nfRowInfoCard = card;
  alignInfo(screen, card, host);
  const frame = globalThis.requestAnimationFrame || ((callback) => setTimeout(callback, 16));
  frame(() => alignInfo(screen, card, host));
  REALIGN_DELAYS.forEach((delay) => setTimeout(() => alignInfo(screen, card, host), delay));
}

const TOP_CLEARANCE = 120;
const BOTTOM_MARGIN = 24;

export function revealActiveRow(screen) {
  const row = screen.nfActiveRow;
  const card = screen.nfRowInfoCard;
  if (!row || !card || !row.isConnected || !card.classList.contains("focused")) return;
  const rect = row.getBoundingClientRect();
  const limit = (globalThis.innerHeight || 1080) - BOTTOM_MARGIN;
  if (rect.bottom <= limit || rect.top <= TOP_CLEARANCE) return;
  screen.container?.querySelector?.(".home-shell")?.classList.add("nf-scrolled");
  screen.applyClassicMainVerticalVisibility?.(card, "down", null, 0);
}

export function scheduleRowReveal(screen) {
  if (screen.nfRevealTimer) clearTimeout(screen.nfRevealTimer);
  screen.nfRevealTimer = setTimeout(() => {
    screen.nfRevealTimer = null;
    revealActiveRow(screen);
  }, 300);
}

function runtimeMinutes(item) {
  const direct = Number(item?.runtimeMinutes || 0);
  if (direct > 0) return direct;
  const match = String(item?.runtime || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function runtimeText(item) {
  const minutes = runtimeMinutes(item);
  if (!(minutes > 0)) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return nt("notflix_runtime_minutes", `${minutes} min`, { 1: minutes });
  if (!rest) return nt("notflix_time_h", `${hours} h`, { 1: hours });
  return nt("notflix_time_hm", `${hours} h ${rest} min`, { 1: hours, 2: rest });
}

function kindWord(item) {
  const type = String(item?.type || item?.apiType || "").toLowerCase();
  if (type === "movie") return nt("notflix_kind_movie", "Movie");
  if (type === "series" || type === "tv") return nt("notflix_kind_series", "Series");
  return "";
}

export function rowInfoMarkup(item) {
  if (!item) return "";
  const genre = Array.isArray(item.genres) ? String(item.genres.find(Boolean) || "") : "";
  const parts = [kindWord(item), genre, extractYear(item), runtimeText(item)].filter(Boolean);
  const age = String(item.ageRating || "").trim();
  const meta = parts
    .map((part, index) =>
      index === 0
        ? `<span class="nf-ri-kind">${escapeText(part)}</span>`
        : `<span>${escapeText(part)}</span>`
    )
    .concat(age ? [`<span class="nf-ri-age">${escapeText(age)}</span>`] : [])
    .join('<span class="nf-ri-dot">•</span>');
  const description = String(item.description || "").trim();
  return `${meta ? `<div class="nf-ri-meta">${meta}</div>` : ""}${description ? `<p class="nf-ri-desc">${escapeText(description)}</p>` : ""}`;
}
