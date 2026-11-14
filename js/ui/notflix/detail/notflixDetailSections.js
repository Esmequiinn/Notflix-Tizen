import { Router } from "../../navigation/routerState.js";
import { getNotflixOptions, getTrailerIdleMs } from "../notflixOptions.js";
import { playUiSound } from "../notflixSounds.js";
import { escapeText, nt } from "../home/notflixHomeMarkup.js";
import { playTrailerChain } from "../trailers/trailerChain.js";
import { clearNuvioTrailer, mountNuvioTrailer } from "../trailers/nuvioTrailer.js";
import { stopPreview } from "../trailers/previewPlayer.js";

function sectionTitle(text) {
  return `<h3 class="nf-dsec-title">${escapeText(text)}</h3>`;
}

export function renderNotflixInsight(screen, kind) {
  const moreLike = Array.isArray(screen.moreLikeThisItems) ? screen.moreLikeThisItems : [];
  const collection = Array.isArray(screen.collectionItems) ? screen.collectionItems : [];
  const useCollection = !moreLike.length && collection.length > 0;
  const railItems = useCollection ? collection : moreLike;
  const railTab = useCollection ? "collection" : "morelike";
  if (kind === "series") screen.seriesInsightTab = railTab;
  else screen.movieInsightTab = railTab;
  const parts = [];
  if (railItems.length) {
    parts.push(`
      <div class="nf-dsec nf-dsec-rail">
        ${sectionTitle(useCollection ? screen.collectionName || nt("notflix_dh_collection", "Collection") : nt("notflix_dh_you_may_like", "You might also like"))}
        ${screen.renderPreviewRail(railItems, kind, `${railTab}:${kind}`)}
      </div>
    `);
  }
  if (Array.isArray(screen.castItems) && screen.castItems.length) {
    parts.push(`
      <div class="nf-dsec nf-dsec-cast">
        ${sectionTitle(nt("notflix_dh_cast_title", "Creators and cast"))}
        ${screen.renderSeriesCastTrack(kind)}
      </div>
    `);
  }
  const ratingSeasons = Object.keys(screen.seriesRatingsBySeason || {}).filter(
    (key) => Number(key) > 0
  );
  if (kind === "series" && ratingSeasons.length) {
    parts.push(`
      <div class="nf-dsec nf-dsec-ratings">
        ${sectionTitle(nt("notflix_dh_ratings_title", "Ratings"))}
        ${screen.renderSeriesRatingsPanel()}
      </div>
    `);
  }
  return `<section class="series-insight-section nf-linear">${parts.join("")}</section>`;
}

function groupsOf(screen) {
  const lists = screen.getDetailFocusLists?.();
  if (!lists) return [];
  const container = screen.container;
  const rail = Array.from(
    container.querySelectorAll(".nf-linear .detail-morelike-track .focusable")
  );
  const groups = [
    { key: "seasons", nodes: lists.seasons || [] },
    { key: "episodes", nodes: lists.episodes || [] },
    { key: "rail", nodes: rail },
    { key: "cast", nodes: lists.castCards || [] },
    { key: "ratingSeasons", nodes: lists.ratingSeasons || [] },
    { key: "ratingChips", nodes: lists.ratingChips || [] },
    { key: "commentModes", nodes: lists.commentModes || [] },
    { key: "commentCards", nodes: lists.commentCards || [] }
  ];
  return groups.filter((group) => group.nodes.length);
}

function focusGroup(screen, group, fromNode) {
  if (!group) return false;
  if (group.key === "episodes") {
    return screen.focusEpisodeByIndex(screen.getRememberedEpisodeIndex(group.nodes), {
      preserveVerticalScroll: false
    });
  }
  if (group.key === "seasons") {
    return screen.focusInList(group.nodes, screen.getSelectedSeasonIndex?.(group.nodes) || 0);
  }
  if (group.key === "rail") {
    return screen.focusInList(
      group.nodes,
      Math.min(
        group.nodes.length - 1,
        screen.getRememberedRailIndex?.(screen.getActivePreviewRailKey?.(), group.nodes) || 0
      )
    );
  }
  const remembered = (screen.nfGroupIndex || {})[group.key];
  let index = Number.isFinite(remembered) ? remembered : 0;
  if (!Number.isFinite(remembered) && fromNode) {
    const x = fromNode.getBoundingClientRect().left;
    let best = 0;
    let bestDistance = Infinity;
    group.nodes.forEach((node, nodeIndex) => {
      const distance = Math.abs(node.getBoundingClientRect().left - x);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = nodeIndex;
      }
    });
    index = best;
  }
  return screen.focusInList(group.nodes, Math.min(index, group.nodes.length - 1));
}

export function handleLinearVertical(screen, current, code, actions) {
  const groups = groupsOf(screen);
  if (!groups.length) return false;
  const groupIndex = groups.findIndex((group) => group.nodes.includes(current));
  const fromActions = actions.indexOf(current);
  if (fromActions >= 0) {
    if (code !== 40 || fromActions < actions.length - 1) return false;
    playUiSound("move");
    return focusGroup(screen, groups[0], current) || true;
  }
  if (groupIndex < 0) return false;
  const group = groups[groupIndex];
  const position = group.nodes.indexOf(current);
  screen.nfGroupIndex = { ...(screen.nfGroupIndex || {}), [group.key]: position };
  if (code === 38) {
    if (groupIndex === 0) {
      if (!actions.length) return true;
      playUiSound("move");
      return screen.focusInList(actions, actions.length - 1) || true;
    }
    playUiSound("move");
    return focusGroup(screen, groups[groupIndex - 1], current) || true;
  }
  if (code === 40) {
    if (groupIndex >= groups.length - 1) return true;
    playUiSound("move");
    return focusGroup(screen, groups[groupIndex + 1], current) || true;
  }
  return false;
}

export function stopRailPreview(screen) {
  if (screen.nfRailTimer) {
    clearTimeout(screen.nfRailTimer);
    screen.nfRailTimer = null;
  }
  screen.nfRailToken = (screen.nfRailToken || 0) + 1;
  if (screen.nfRailHost) {
    stopPreview();
    clearNuvioTrailer(screen.nfRailHost);
    screen.nfRailHost = null;
  }
  screen.container
    ?.querySelectorAll(".detail-morelike-card.nf-rail-previewing")
    .forEach((card) => card.classList.remove("nf-rail-previewing"));
}

export function isRailCard(node) {
  return Boolean(node?.classList?.contains("detail-morelike-card"));
}

export function scheduleRailPreview(screen) {
  stopRailPreview(screen);
  const card = screen.container?.querySelector(".detail-morelike-card.focusable.focused");
  if (!card) return;
  const options = getNotflixOptions();
  if (!options.previewEnabled || options.homeMotion === "reduced") return;
  const token = screen.nfRailToken;
  const alive = () =>
    token === screen.nfRailToken &&
    card.isConnected &&
    card.classList.contains("focused") &&
    Router.getCurrent?.() === "detail";
  screen.nfRailTimer = setTimeout(async () => {
    screen.nfRailTimer = null;
    if (!alive()) return;
    const item = {
      id: String(card.dataset.itemId || ""),
      type: String(card.dataset.itemType || "movie"),
      name: String(card.dataset.itemTitle || "")
    };
    const home = Router.routes?.home;
    const source =
      typeof home?.getTrailerSourceForItem === "function"
        ? await home.getTrailerSourceForItem.call(home, item).catch(() => null)
        : null;
    if (!alive()) return;
    const wrap = card.querySelector(".detail-morelike-poster-wrap") || card;
    if (screen.isTrailerPlaying) screen.stopTrailerPlayback?.({ restartAutoplay: false });
    if (source) {
      const layer = mountNuvioTrailer(wrap, null, source, {
        muted: !options.previewSound,
        onReady: () => {
          if (alive()) card.classList.add("nf-rail-previewing");
        },
        onFail: () => {
          if (token !== screen.nfRailToken || !screen.nfRailHost) return;
          card.classList.remove("nf-rail-previewing");
          clearNuvioTrailer(screen.nfRailHost);
          screen.nfRailHost = null;
        }
      });
      if (layer) {
        layer.classList.add("nf-rail-trailer");
        screen.nfRailHost = layer;
        return;
      }
    }
    const host = document.createElement("div");
    host.className = "nf-rail-trailer";
    wrap.appendChild(host);
    screen.nfRailHost = host;
    if (screen.isTrailerPlaying) screen.stopTrailerPlayback?.({ restartAutoplay: false });
    playTrailerChain(host, item, source, {
      maxHeight: 480,
      withAudio: options.previewSound,
      alive,
      onPlaying: () => card.classList.add("nf-rail-previewing"),
      onFail: () => {
        host.remove();
        if (screen.nfRailHost === host) screen.nfRailHost = null;
      }
    });
  }, getTrailerIdleMs(options));
}

export function syncActionsScroll(screen) {
  const list = screen.container?.querySelector(".nf-dh-actions");
  if (!list) return;
  const rows = Array.from(list.querySelectorAll(".focusable"));
  const index = rows.findIndex((row) => row.classList.contains("focused"));
  if (index < 0 || !rows.length) return;
  const step = rows.length > 1 ? rows[1].offsetTop - rows[0].offsetTop : rows[0].offsetHeight;
  const fullRows = Math.max(1, Math.floor((list.clientHeight + 2) / Math.max(1, step)));
  const currentFirst = Math.round(list.scrollTop / Math.max(1, step));
  let first = currentFirst;
  if (index < first) first = index;
  else if (index > first + fullRows - 1) first = index - fullRows + 1;
  first = Math.max(0, Math.min(first, rows.length - 1));
  list.scrollTop = rows[first].offsetTop - rows[0].offsetTop;
  list.classList.toggle("is-at-end", first + fullRows >= rows.length);
}
