import { catalogRepository } from "../../../data/repository/catalogRepository.js";
import { LayoutPreferences } from "../../../data/local/layoutPreferences.js";
import { mergeCatalogPage } from "../../../core/util/catalogPagination.js";
import { createPosterCardMarkup } from "../../screens/home/homeScreenHelpers-15-create-poster-card-markup.js";
import { homeCatalogRowKey } from "../../screens/home/homeScreenHelpers-01-modern-sidebar-pill-auto-collapse-ms.js";
import { registerHomeDomNodes } from "../../screens/home/homeDomUpdate.js";

const CHUNK = 8;
const LOOKAHEAD = 4;

function rowFor(screen, key) {
  return (
    (Array.isArray(screen.rows) ? screen.rows : []).find((row) => homeCatalogRowKey(row) === key) ||
    null
  );
}

function cardsOf(track) {
  return track.querySelectorAll(".home-poster-card.focusable");
}

function appendCards(screen, section, track, row, start, items) {
  if (!items.length) return;
  const rowIndex = Number(section.dataset.rowIndex || 0);
  const showLabels = screen.layoutPrefs?.posterLabelsEnabled !== false;
  const settings = LayoutPreferences.get();
  const markup = items
    .map((item, offset) =>
      createPosterCardMarkup(
        item,
        rowIndex,
        start + offset,
        row.type,
        row,
        showLabels,
        "classic",
        false,
        false,
        false,
        screen.watchedTitleIds,
        settings
      )
    )
    .join("");
  const key = section.dataset.rowKey || "";
  const fragment = document.createRange().createContextualFragment(markup);
  const added = Array.from(fragment.querySelectorAll(".home-poster-card.focusable"));
  registerHomeDomNodes(added);
  const rows = screen.navModel?.rows || [];
  const navRow = rows.findIndex((nodes) => nodes[0]?.closest?.(".home-track") === track);
  added.forEach((node, offset) => {
    node.dataset.navZone = "main";
    if (navRow >= 0) node.dataset.navRow = String(navRow);
    node.dataset.navCol = String(start + offset);
    node.dataset.navRowKey = key;
  });
  track.appendChild(fragment);
  if (navRow >= 0) {
    rows[navRow].push(...added);
    screen.navModel.rowNodesByRowKey?.set?.(key, rows[navRow]);
  } else {
    screen.invalidateNavigationModel?.();
    screen.buildNavigationModel?.();
  }
  if (!screen.nfRowItemCounts) screen.nfRowItemCounts = {};
  screen.nfRowItemCounts[key] = start + items.length;
  screen.scheduleHomeLazyImageHydration?.(screen.getCurrentFocusedNode?.() || null, {
    refreshIndex: true
  });
}

async function fetchMore(screen, section, track, row, allowed) {
  const data = row.result?.data;
  if (!data || row.nfLoadingMore) return;
  row.nfLoadingMore = true;
  const skip = Math.max(0, Number(data.nextSkip || 0));
  try {
    const result = await catalogRepository.getCatalog({
      addonBaseUrl: row.addonBaseUrl,
      addonId: row.addonId,
      addonName: row.addonName,
      catalogId: row.catalogId,
      catalogName: row.catalogName,
      type: row.type,
      skip,
      skipStep: Number(row.skipStep || data.skipStep || 100),
      extraArgs: row.extraArgs && typeof row.extraArgs === "object" ? row.extraArgs : {},
      supportsSkip: row.supportsSkip !== false && data.supportsSkip !== false
    });
    if (result?.status !== "success") {
      data.hasMore = false;
      return;
    }
    const incoming = Array.isArray(result.data?.items) ? result.data.items : [];
    const base = Array.isArray(row.nfAllItems) ? row.nfAllItems : data.items;
    const merged = mergeCatalogPage(
      base,
      incoming,
      skip,
      incoming.length,
      result.data?.nextSkip,
      result.data?.hasMore
    );
    row.nfAllItems = merged.items;
    data.nextSkip = merged.nextSkip;
    data.hasMore = merged.hasMore && merged.addedCount > 0;
    const visible = merged.items.filter((item) => allowed(item, row.type || row.apiType));
    row.nfFilteredItems = visible;
    data.items = visible;
    if (!section.isConnected || !track.isConnected) return;
    const start = cardsOf(track).length;
    appendCards(screen, section, track, row, start, visible.slice(start, start + CHUNK));
  } catch (_) {
    data.hasMore = false;
  } finally {
    row.nfLoadingMore = false;
  }
}

export function extendRowIfNeeded(screen, card, allowed) {
  const section = card?.closest?.(".home-row");
  if (!section || section.classList.contains("home-row-continue")) return;
  const track = section.querySelector(".home-track");
  if (!track) return;
  const cards = cardsOf(track);
  const position = Array.prototype.indexOf.call(cards, card);
  if (position < 0 || position < cards.length - LOOKAHEAD) return;
  const row = rowFor(screen, section.dataset.rowKey || "");
  if (!row || row.rowKind === "collection") return;
  const items = Array.isArray(row.result?.data?.items) ? row.result.data.items : [];
  if (cards.length < items.length) {
    appendCards(
      screen,
      section,
      track,
      row,
      cards.length,
      items.slice(cards.length, cards.length + CHUNK)
    );
    return;
  }
  if (row.result?.data?.hasMore) void fetchMore(screen, section, track, row, allowed);
}
