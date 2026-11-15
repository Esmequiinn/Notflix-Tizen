import { Router } from "../../navigation/routerState.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { isNotflixActive } from "../notflixAppearance.js";
import { getCardOpeningDelayMs, getCardScale } from "../notflixOptions.js";
import { escapeText, expandedArtMarkup, nt } from "../home/notflixHomeMarkup.js";
import { localizedDetails } from "../home/notflixLocalize.js";
import { activateRow, rowInfoMarkup, setRowInfo } from "../home/notflixRowInfo.js";
import { backdropOf, preloadImage, waitForImage } from "../home/notflixPreload.js";

const POSTER_W = 420;
const POSTER_H = 622;
const EXPANDED_MAX_W = 980;
const EDGE = 68;
const TOP_OFFSET = 8;
const KEY_LEFT = 37;
const KEY_UP = 38;
const KEY_RIGHT = 39;
const KEY_DOWN = 40;

function active(screen) {
  const state = screen?.controller?.getState?.();
  return Boolean(isNotflixActive() && screen?.container && state && state.viewMode !== "servers");
}

function libraryItems(screen) {
  const state = screen.controller.getState();
  return Array.isArray(state.allItems) ? state.allItems.filter((item) => item?.id) : [];
}

function buildRows(items) {
  const movies = items.filter((item) => String(item.type || "") === "movie");
  const series = items.filter((item) => ["series", "tv"].includes(String(item.type || "")));
  const rows = [{ key: "all", title: nt("notflix_my_list", "My list"), items }];
  if (movies.length && series.length) {
    rows.push({ key: "movies", title: nt("notflix_my_list_movies", "Movies"), items: movies });
    rows.push({ key: "series", title: nt("notflix_my_list_series", "Series"), items: series });
  }
  return rows;
}

function cardMarkup(item, rowIndex, index) {
  const focusKey = `${item.type}:${item.id}`;
  const title = escapeText(item.name || item.id || "Untitled");
  return `
    <article class="library-grid-card nf-ml-card focusable"
             data-action="openDetail"
             data-nf-row="${rowIndex}"
             data-nf-index="${index}"
             data-item-id="${escapeText(item.id)}"
             data-item-type="${escapeText(item.type || "movie")}"
             data-item-title="${title}"
             data-poster-src="${escapeText(item.poster || "")}"
             data-backdrop-src="${escapeText(item.background || "")}"
             data-addon-base-url="${escapeText(item.addonBaseUrl || "")}"
             data-focus-key="${escapeText(rowIndex === 0 ? focusKey : `${rowIndex}|${focusKey}`)}">
      <div class="nf-ml-poster">
        ${item.poster ? `<img src="${escapeText(item.poster)}" alt="" decoding="async" />` : `<span class="nf-ml-name">${title}</span>`}
      </div>
    </article>
  `;
}

function rowsMarkup(rows) {
  return rows
    .map(
      (row, rowIndex) => `
        <section class="nf-ml-row" data-nf-row="${rowIndex}">
          <h2 class="nf-ml-title">${escapeText(row.title)}</h2>
          <div class="nf-ml-viewport">
            <div class="nf-ml-track">${row.items.map((item, index) => cardMarkup(item, rowIndex, index)).join("")}</div>
          </div>
        </section>
      `
    )
    .join("");
}

function applySizing(host) {
  const scale = getCardScale();
  const height = POSTER_H * scale;
  host.style.setProperty("--nf-card-w", `${Math.round(POSTER_W * scale)}px`);
  host.style.setProperty("--nf-card-h", `${Math.round(height)}px`);
  host.style.setProperty(
    "--nf-exp-w",
    `${Math.round(Math.min(EXPANDED_MAX_W, (height * 16) / 9))}px`
  );
}

function cardItem(screen, card) {
  const rows = screen.nfMlRows || [];
  const row = rows[Number(card?.dataset?.nfRow)];
  const item = row?.items?.[Number(card?.dataset?.nfIndex)] || null;
  if (!item) return null;
  const extra = screen.nfMlDetails?.get?.(`${item.type}:${item.id}`);
  return extra ? { ...item, ...extra } : item;
}

function rememberDetails(screen, item, details) {
  if (!screen.nfMlDetails) screen.nfMlDetails = new Map();
  const key = `${item.type}:${item.id}`;
  screen.nfMlDetails.set(key, { ...(screen.nfMlDetails.get(key) || {}), ...details });
}

function clearExpand(screen) {
  screen.nfMlToken = (screen.nfMlToken || 0) + 1;
  if (screen.nfMlTimer) {
    clearTimeout(screen.nfMlTimer);
    screen.nfMlTimer = null;
  }
  if (screen.nfMlDetailsTimer) {
    clearTimeout(screen.nfMlDetailsTimer);
    screen.nfMlDetailsTimer = null;
  }
  const card = screen.nfMlExpanded;
  screen.nfMlExpanded = null;
  if (card) {
    card.classList.remove("nf-expanded");
    card.querySelector(".nf-xp")?.remove();
  }
}

function trackOffset(screen, card) {
  const track = card.parentNode;
  const viewport = track?.parentNode;
  if (!track || !viewport) return;
  const expandedWidth =
    parseFloat(getComputedStyle(card).getPropertyValue("--nf-exp-w")) || card.offsetWidth;
  const left = card.offsetLeft;
  const right = left + Math.max(card.offsetWidth, expandedWidth);
  const width = viewport.clientWidth - EDGE;
  let offset = Number(track.dataset.nfOffset || 0);
  if (left - offset < 0) offset = left;
  else if (right - offset > width) offset = right - width;
  offset = Math.max(0, offset);
  if (String(offset) === track.dataset.nfOffset) return;
  track.dataset.nfOffset = String(offset);
  track.style.transform = `translate3d(${-offset}px, 0, 0)`;
}

function verticalScroll(screen, card) {
  const main = screen.container.querySelector(".library-main");
  const row = card.closest(".nf-ml-row");
  if (!main || !row) return;
  const target = Math.max(0, row.offsetTop - TOP_OFFSET);
  if (Math.abs(main.scrollTop - target) < 2) return;
  if (typeof main.scrollTo === "function") main.scrollTo({ top: target, behavior: "smooth" });
  else main.scrollTop = target;
}

function showInfo(screen, card) {
  const item = cardItem(screen, card);
  setRowInfo(screen, card, rowInfoMarkup(item));
  if (!item || screen.nfMlDetails?.get?.(`${item.type}:${item.id}`)?.nfLoaded) return;
  screen.nfMlDetailsTimer = setTimeout(() => {
    screen.nfMlDetailsTimer = null;
    void localizedDetails(item).then((details) => {
      rememberDetails(screen, item, { ...(details || {}), nfLoaded: true });
      if (screen.nfRowInfoCard !== card) return;
      setRowInfo(screen, card, rowInfoMarkup(cardItem(screen, card)));
      if (details?.logo && screen.nfMlExpanded === card) {
        const brand = card.querySelector(".nf-xp-brand");
        if (brand)
          brand.innerHTML = `<img class="nf-xp-logo" src="${escapeText(details.logo)}" alt="" decoding="async" />`;
      }
    });
  }, 320);
}

function preloadAround(screen, card) {
  [
    card,
    card.nextElementSibling,
    card.previousElementSibling,
    card.nextElementSibling?.nextElementSibling
  ].forEach((node) => {
    if (node?.classList?.contains("nf-ml-card")) preloadImage(backdropOf(cardItem(screen, node)));
  });
}

function scheduleExpand(screen, card) {
  preloadAround(screen, card);
  const token = screen.nfMlToken;
  screen.nfMlTimer = setTimeout(() => {
    screen.nfMlTimer = null;
    const item = cardItem(screen, card);
    void waitForImage(backdropOf(item), 900).then(() => {
      if (screen.nfMlToken !== token || Router.getCurrent?.() !== "library") return;
      if (!card.isConnected || !card.classList.contains("focused")) return;
      card.insertAdjacentHTML("beforeend", expandedArtMarkup(cardItem(screen, card) || item));
      card.classList.add("nf-expanded");
      screen.nfMlExpanded = card;
    });
  }, getCardOpeningDelayMs());
}

function focusCard(screen, card, { scroll = true } = {}) {
  if (!card) return false;
  clearExpand(screen);
  screen.setFocusedNode(card);
  const row = card.closest(".nf-ml-row");
  if (row) row.dataset.nfLast = card.dataset.nfIndex;
  activateRow(screen, card);
  trackOffset(screen, card);
  if (scroll) verticalScroll(screen, card);
  showInfo(screen, card);
  scheduleExpand(screen, card);
  return true;
}

function rowCards(row) {
  return Array.from(row?.querySelectorAll(".nf-ml-card.focusable") || []);
}

function moveVertical(screen, card, step) {
  const rows = Array.from(screen.container.querySelectorAll(".nf-ml-row"));
  const index = rows.indexOf(card.closest(".nf-ml-row"));
  const next = rows[index + step];
  if (!next) {
    if (step < 0) {
      clearExpand(screen);
      activateRow(screen, null);
      void screen.focusSidebarNode?.();
      return true;
    }
    return true;
  }
  const cards = rowCards(next);
  const remembered = Number(next.dataset.nfLast);
  const target =
    cards[Number.isFinite(remembered) ? Math.min(remembered, cards.length - 1) : 0] || cards[0];
  return focusCard(screen, target);
}

function handleKey(screen, event) {
  const code = Number(event?.keyCode || 0);
  if (code < KEY_LEFT || code > KEY_DOWN) return false;
  if (screen.focusZone === "sidebar") return false;
  const active = document.activeElement;
  const current = active?.classList?.contains("nf-ml-card") ? active : null;
  if (!current || !screen.container?.contains(current)) return false;
  event?.preventDefault?.();
  if (code === KEY_UP || code === KEY_DOWN)
    return moveVertical(screen, current, code === KEY_DOWN ? 1 : -1);
  const cards = rowCards(current.closest(".nf-ml-row"));
  const index = cards.indexOf(current);
  const target = cards[index + (code === KEY_RIGHT ? 1 : -1)];
  if (target) focusCard(screen, target, { scroll: false });
  return true;
}

function renderMyList(screen) {
  const page = screen.container?.querySelector(".library-page");
  const items = libraryItems(screen);
  if (!page || !items.length) return false;
  const focusKey =
    screen.container.querySelector(".focusable.focused")?.dataset?.focusKey ||
    screen.nfMlFocusKey ||
    "";
  const sidebarFocused = screen.focusZone === "sidebar";
  clearExpand(screen);
  activateRow(screen, null);
  screen.nfMlRows = buildRows(items);
  page.classList.add("nf-ml");
  applySizing(page);
  page.innerHTML = rowsMarkup(screen.nfMlRows);
  ScreenUtils.indexFocusables(screen.container);
  if (sidebarFocused || screen.isModalFocusLocked?.()) {
    page
      .querySelectorAll(".nf-ml-card.focused")
      .forEach((node) => node.classList.remove("focused"));
    return true;
  }
  const target =
    (focusKey && page.querySelector(`.nf-ml-card[data-focus-key="${CSS.escape(focusKey)}"]`)) ||
    page.querySelector(".nf-ml-card.focusable");
  if (target) focusCard(screen, target);
  return true;
}

export function withNotflixLibrary(base) {
  return {
    ...base,
    render(...args) {
      const result = base.render.apply(this, args);
      if (active(this)) renderMyList(this);
      return result;
    },
    updateRenderedLibraryContent(...args) {
      if (active(this) && this.container?.querySelector(".nf-ml")) {
        this.render();
        return undefined;
      }
      return base.updateRenderedLibraryContent.apply(this, args);
    },
    setFocusedNode(target) {
      const result = base.setFocusedNode.call(this, target);
      if (target?.classList?.contains("nf-ml-card"))
        this.nfMlFocusKey = target.dataset.focusKey || "";
      return result;
    },
    async focusMainNode(preferredNode = null, options) {
      if (active(this) && this.container?.querySelector(".nf-ml")) {
        this.focusZone = "content";
        const target =
          preferredNode ||
          (this.nfMlFocusKey &&
            this.container.querySelector(
              `.nf-ml-card[data-focus-key="${CSS.escape(this.nfMlFocusKey)}"]`
            )) ||
          this.container.querySelector(".nf-ml-card.focusable");
        return focusCard(this, target);
      }
      return base.focusMainNode.call(this, preferredNode, options);
    },
    async onKeyDown(event) {
      if (active(this) && !this.isModalFocusLocked?.() && handleKey(this, event)) return undefined;
      return base.onKeyDown.call(this, event);
    },
    cleanup(...args) {
      clearExpand(this);
      activateRow(this, null);
      return base.cleanup?.apply(this, args);
    }
  };
}
