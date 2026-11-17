import { Platform } from "../../../platform/index.js";
import { TizenEngineFsService } from "../../../platform/tizen/tizenEngineFsService.js";
import { remoteProxyBase } from "../../../platform/tizen/tizenPlaybackProxy.js";
import { consumePlaybackMark } from "../playback/playbackMark.js";
import { setServiceNote } from "../diagnostics/notflixPerf.js";
import { Router } from "../../navigation/routerState.js";
import { isNotflixActive } from "../notflixAppearance.js";
import {
  getCardOpeningDelayMs,
  getCardScale,
  getNotflixOptions,
  getTrailerIdleMs
} from "../notflixOptions.js";
import { playUiSound } from "../notflixSounds.js";
import { playTrailerChain } from "../trailers/trailerChain.js";
import {
  clearNuvioTrailer,
  mountNuvioTrailer,
  warmTrailerPlayer
} from "../trailers/nuvioTrailer.js";
import { startTrailerProxyProbe } from "../trailers/trailerProxy.js";
import { stopPreview } from "../trailers/previewPlayer.js";
import { isHiddenTitle } from "../profiles/hiddenTitles.js";
import {
  cachedAge,
  canResolveAges,
  isAgeLimitActive,
  isTitleAllowed,
  resolveAges
} from "../profiles/ageGate.js";
import { localizedDetails } from "./notflixLocalize.js";
import { clearHold, handleHoldRepeat, shortPressEvent, withHoldGuard } from "../input/holdGuard.js";
import { isCollectionFolderItem } from "../../screens/home/homeScreenHelpers-04-animate-hero-logo-swap.js";
import {
  collapseContinueCard,
  continueInfoMarkup,
  isContinueCard,
  scheduleContinueExpand
} from "./notflixContinue.js";
import { activateRow, rowInfoMarkup, scheduleRowReveal, setRowInfo } from "./notflixRowInfo.js";
import { extendRowIfNeeded } from "./notflixRowMore.js";
import { backdropOf, cardLogoOf, preloadImage, waitForImage } from "./notflixPreload.js";
import { localizeHero, noteHeroActivity, scheduleHeroIdle, stopHeroLoop } from "./notflixHero.js";
import { billboardMarkup, escapeText, expandedArtMarkup } from "./notflixHomeMarkup.js";

const POSTER_W = 420;
const POSTER_H = 622;
const EXPANDED_MAX_W = 980;
const CW_W = 496;
const CW_H = 280;

const KEY_LEFT = 37;
const KEY_RIGHT = 39;
const KEY_DOWN = 40;
const KEY_ENTER = 13;

function active(screen) {
  return isNotflixActive() && screen?.layoutMode === "classic" && Boolean(screen?.container);
}

function heroNode(screen) {
  return screen.container?.querySelector(".home-hero-card") || null;
}

function isHero(node) {
  return Boolean(node?.classList?.contains("home-hero-card"));
}

function isExpandableCard(node) {
  return Boolean(
    node?.matches?.(".home-poster-card.focusable") && node.dataset.action === "openDetail"
  );
}

export function applyNotflixSizing(screen) {
  const shell = screen.container?.querySelector(".home-screen-shell") || screen.container;
  if (!shell) return;
  const options = getNotflixOptions();
  const scale = getCardScale(options);
  const px = (value) => `${Math.round(value)}px`;
  shell.style.setProperty("--nf-card-w", px(POSTER_W * scale));
  shell.style.setProperty("--nf-card-h", px(POSTER_H * scale));
  shell.style.setProperty("--nf-exp-w", px(Math.min(EXPANDED_MAX_W, (POSTER_H * scale * 16) / 9)));
  shell.style.setProperty("--nf-cw-w", px(CW_W * scale));
  shell.style.setProperty("--nf-cw-h", px(CW_H * scale));
  shell.classList.toggle("nf-motion-reduced", options.homeMotion === "reduced");
}

export function renderNotflixBillboard(screen) {
  const node = heroNode(screen);
  if (!node) return;
  const item = screen.heroItem || screen.heroCandidates?.[0] || null;
  if (!item) return;
  const candidates = Array.isArray(screen.heroCandidates) ? screen.heroCandidates : [];
  const index = Math.max(0, Number(screen.heroIndex || 0));
  const signature = `${item.id}|${item.logo || ""}|${String(item.description || "").length}|${index}|${candidates.length}`;
  let host = node.querySelector(".nf-bb");
  if (!host) {
    host = document.createElement("div");
    host.className = "nf-bb";
    node.appendChild(host);
  }
  if (host.dataset.signature !== signature) {
    const sameItem = host.dataset.itemId === String(item.id || "");
    const oldBrand = sameItem ? host.querySelector(".nf-bb-brand") : null;
    host.dataset.signature = signature;
    host.dataset.itemId = String(item.id || "");
    host.innerHTML = billboardMarkup(item, candidates, index);
    const newBrand = host.querySelector(".nf-bb-brand");
    const oldLogo = oldBrand?.querySelector(".nf-bb-logo");
    const newLogo = newBrand?.querySelector(".nf-bb-logo");
    if (oldBrand && newBrand && oldLogo && newLogo) {
      const target = newLogo.getAttribute("src");
      newBrand.parentNode.replaceChild(oldBrand, newBrand);
      if (oldLogo.getAttribute("src") !== target) {
        const image = new Image();
        image.onload = () => {
          if (oldLogo.isConnected) oldLogo.setAttribute("src", target);
        };
        image.src = target;
      }
    }
  }
  syncBillboardCursor(screen);
  if (screen.nfWarm) enrichHero(screen);
}

function enrichHero(screen) {
  const item = screen.heroItem;
  if (!item) return;
  localizeHero(screen, () => renderNotflixBillboard(screen));
}

function syncBillboardCursor(screen) {
  const node = heroNode(screen);
  if (!node) return;
  const focused = node.classList.contains("focused");
  const cursor = focused ? Number(screen.nfHeroCursor || 0) : -1;
  node.querySelectorAll(".nf-bb-btn").forEach((button) => {
    button.classList.toggle("is-selected", Number(button.dataset.nfIndex) === cursor);
  });
  node.classList.toggle("nf-markers-focused", cursor === 2);
}

const WARMUP_MS = 2500;

function warmTrailers(screen) {
  if (screen.nfTrailerWarmStarted) return;
  const options = getNotflixOptions();
  if (!options.previewEnabled || options.homeMotion === "reduced") return;
  screen.nfTrailerWarmStarted = true;
  void startTrailerProxyProbe();
  if (!options.previewSound) return;
  let attempts = 0;
  const tryWarm = () => {
    attempts += 1;
    if (!active(screen) || Router.getCurrent?.() !== "home") return;
    if (Date.now() - Number(screen.nfLastKeyAt || 0) < WARM_QUIET_MS && attempts < WARM_ATTEMPTS) {
      setTimeout(tryWarm, WARM_RETRY_MS);
      return;
    }
    const item = screen.heroItem || screen.heroCandidates?.[0];
    if (!item || typeof screen.getTrailerSourceForItem !== "function") return;
    void startTrailerProxyProbe()
      .then((url) => (url ? screen.getTrailerSourceForItem(item) : null))
      .then((source) => {
        if (source?.kind === "youtube" && source.ytId) warmTrailerPlayer(source.ytId);
      })
      .catch(() => {});
  };
  setTimeout(tryWarm, WARM_DELAY_MS);
}

let playbackServiceWarmed = false;

function warmPlaybackService() {
  if (playbackServiceWarmed || !Platform.isTizen?.()) return;
  playbackServiceWarmed = true;
  if (remoteProxyBase()) {
    setServiceNote("remoto");
    return;
  }
  setTimeout(() => {
    void TizenEngineFsService.ensureStarted({ purpose: "playback-proxy" })
      .then((result) => {
        if (result?.status !== "success") {
          setServiceNote(
            `no responde (${String(result?.detail || result?.status || "").slice(0, 80)})`
          );
          return;
        }
        const settings = result.settings || {};
        setServiceNote(
          settings.lite
            ? `ligero ${settings.node || ""}${settings.reason ? ` · ${String(settings.reason).slice(0, 60)}` : ""}`
            : "completo"
        );
      })
      .catch((error) => setServiceNote(`error (${String(error?.message || error).slice(0, 80)})`));
  }, 4000);
}

function runIdleWork(screen) {
  if (!active(screen) || !screen.container?.isConnected) return;
  screen.nfWarm = true;
  warmPlaybackService();
  enrichHero(screen);
  warmTrailers(screen);
  if (!screen.nfHeroRotateTimer && !screen.nfHeroTrailerHost) scheduleHeroIdle(screen);
  if (screen.nfAgePending?.length) {
    const pending = screen.nfAgePending;
    screen.nfAgePending = null;
    scheduleAgeResolution(screen, pending);
  }
  const focused = screen.getCurrentFocusedNode?.();
  if (focused && isContinueCard(focused) && screen.nfCwCard !== focused && !screen.nfCwTimer) {
    scheduleContinueExpand(screen, focused);
  }
}

function scheduleIdleWork(screen) {
  if (screen.nfIdleTimer) clearTimeout(screen.nfIdleTimer);
  if (!screen.nfFirstPaintAt) screen.nfFirstPaintAt = Date.now();
  const elapsed = Date.now() - screen.nfFirstPaintAt;
  const delay = elapsed < WARMUP_MS ? WARMUP_MS - elapsed : 400;
  screen.nfIdleTimer = setTimeout(() => {
    screen.nfIdleTimer = null;
    runIdleWork(screen);
  }, delay);
}

function clearExpandTimer(screen) {
  screen.nfExpandToken = (screen.nfExpandToken || 0) + 1;
  if (screen.nfExpandTimer) {
    clearTimeout(screen.nfExpandTimer);
    screen.nfExpandTimer = null;
  }
}

function stopCardPreview(screen) {
  if (screen.nfPreviewTimer) {
    clearTimeout(screen.nfPreviewTimer);
    screen.nfPreviewTimer = null;
  }
  screen.nfPreviewToken = (screen.nfPreviewToken || 0) + 1;
  stopPreview();
  const layer = screen.nfPreviewLayer;
  screen.nfPreviewLayer = null;
  if (layer) clearNuvioTrailer(layer);
}

function scheduleCardPreview(screen, card, item) {
  const options = getNotflixOptions();
  if (!options.previewEnabled || options.homeMotion === "reduced") return;
  if (screen.nfPreviewTimer) clearTimeout(screen.nfPreviewTimer);
  const previewToken = (screen.nfPreviewToken || 0) + 1;
  screen.nfPreviewToken = previewToken;
  const alive = () => screen.nfExpandedCard === card && screen.nfPreviewToken === previewToken;
  screen.nfPreviewTimer = setTimeout(async () => {
    screen.nfPreviewTimer = null;
    if (!alive() || typeof screen.getTrailerSourceForItem !== "function") return;
    const source = await screen.getTrailerSourceForItem(item).catch(() => null);
    if (!alive()) return;
    const art = card.querySelector(".nf-xp-art");
    if (!art) return;
    if (source) {
      screen.nfPreviewLayer = mountNuvioTrailer(art, art.querySelector(".nf-xp-scrim"), source, {
        muted: !options.previewSound,
        onReady: () => {
          if (alive()) card.classList.add("nf-previewing");
        },
        onFail: () => {
          const layer = screen.nfPreviewLayer;
          if (!layer || !alive()) return;
          screen.nfPreviewLayer = null;
          card.classList.remove("nf-previewing");
          clearNuvioTrailer(layer);
        }
      });
      if (screen.nfPreviewLayer) return;
    }
    const host = document.createElement("div");
    host.className = "nf-xp-trailer nf-xp-native";
    art.insertBefore(host, art.querySelector(".nf-xp-scrim"));
    screen.nfPreviewLayer = host;
    playTrailerChain(host, item, source, {
      maxHeight: 480,
      withAudio: options.previewSound,
      alive,
      onPlaying: () => card.classList.add("nf-previewing"),
      onFail: () => {
        host.remove();
        if (screen.nfPreviewLayer === host) screen.nfPreviewLayer = null;
      }
    });
  }, getTrailerIdleMs(options));
}

function restartCardPreviewIdle(screen) {
  const card = screen.nfExpandedCard;
  if (!card || card.classList.contains("nf-previewing")) return;
  scheduleCardPreview(screen, card, screen.nfCardItem);
}

export function collapseNotflixCard(screen) {
  clearExpandTimer(screen);
  stopCardPreview(screen);
  const card = screen.nfExpandedCard;
  screen.nfExpandedCard = null;
  screen.nfCardToken = (screen.nfCardToken || 0) + 1;
  if (card) {
    card.classList.remove("nf-expanded", "nf-previewing");
    card.querySelector(".nf-xp")?.remove();
  }
}

function clearDetailsTimer(screen) {
  if (screen.nfDetailsTimer) {
    clearTimeout(screen.nfDetailsTimer);
    screen.nfDetailsTimer = null;
  }
}

function cardItem(screen, card) {
  const cached = screen.nfCardItems?.get?.(card);
  if (cached) return cached;
  const item = screen.getNodeHeroSource?.(card) || null;
  if (item) {
    if (!screen.nfCardItems) screen.nfCardItems = new WeakMap();
    screen.nfCardItems.set(card, item);
  }
  return item;
}

function rememberDetails(screen, card, details) {
  if (!details) return null;
  const item = { ...(cardItem(screen, card) || {}), ...details };
  if (!screen.nfCardItems) screen.nfCardItems = new WeakMap();
  screen.nfCardItems.set(card, item);
  return item;
}

function showCardInfo(screen, card) {
  const item = cardItem(screen, card);
  setRowInfo(screen, card, rowInfoMarkup(item));
  clearDetailsTimer(screen);
  if (!item || item.nfDetailsLoaded) return;
  screen.nfDetailsTimer = setTimeout(() => {
    screen.nfDetailsTimer = null;
    void localizedDetails(item).then((details) => {
      const merged = rememberDetails(screen, card, { ...(details || {}), nfDetailsLoaded: true });
      if (!merged || screen.nfRowInfoCard !== card) return;
      setRowInfo(screen, card, rowInfoMarkup(merged));
      if (screen.nfExpandedCard === card) applyLocalizedDetails(screen, card, details);
    });
  }, 320);
}

function syncRowInfo(screen, target) {
  if (isContinueCard(target)) {
    activateRow(screen, target);
    setRowInfo(screen, target, continueInfoMarkup(screen, target));
    scheduleRowReveal(screen);
    return;
  }
  if (isExpandableCard(target)) {
    activateRow(screen, target);
    showCardInfo(screen, target);
    scheduleRowReveal(screen);
    return;
  }
  clearDetailsTimer(screen);
  activateRow(screen, null);
}

function applyLocalizedDetails(screen, card, details) {
  if (!details || screen.nfExpandedCard !== card) return;
  screen.nfCardItem = { ...screen.nfCardItem, ...details };
  if (details.logo) {
    const brand = card.querySelector(".nf-xp-brand");
    if (brand)
      brand.innerHTML = `<img class="nf-xp-logo" src="${escapeText(cardLogoOf(details))}" alt="" decoding="async" />`;
  }
}

function expandCard(screen, card) {
  if (!card?.isConnected || !card.classList.contains("focused")) return;
  const item = cardItem(screen, card);
  if (!item) return;
  collapseNotflixCard(screen);
  screen.nfExpandedCard = card;
  screen.nfCardItem = item;
  card.insertAdjacentHTML("beforeend", expandedArtMarkup(item));
  card.classList.add("nf-expanded");
  screen.ensureTrackHorizontalVisibility?.(card, "right", 0);
  if (screen.nfRowInfoCard === card) setRowInfo(screen, card, rowInfoMarkup(item));
  void localizedDetails(item).then((details) => applyLocalizedDetails(screen, card, details));
  scheduleCardPreview(screen, card, item);
}

const EXPAND_IMAGE_WAIT_MS = 900;
const ROW_PEEK_PX = 26;
const PRELOAD_DWELL_MS = 180;
const WARM_DELAY_MS = 6000;
const WARM_QUIET_MS = 3000;
const WARM_RETRY_MS = 2500;
const WARM_ATTEMPTS = 8;
const NEIGHBOR_PRELOAD = 2;

function preloadAround(screen, card) {
  const item = cardItem(screen, card);
  preloadImage(backdropOf(item));
  if (item?.logo) preloadImage(cardLogoOf(item));
  let next = card.nextElementSibling;
  let prev = card.previousElementSibling;
  for (let step = 0; step < NEIGHBOR_PRELOAD; step += 1) {
    [next, prev].forEach((node) => {
      if (node && isExpandableCard(node)) preloadImage(backdropOf(cardItem(screen, node)));
    });
    next = next?.nextElementSibling || null;
    prev = prev?.previousElementSibling || null;
  }
}

function scheduleExpand(screen, card) {
  clearExpandTimer(screen);
  if (screen.nfPreloadTimer) clearTimeout(screen.nfPreloadTimer);
  screen.nfPreloadTimer = setTimeout(() => {
    screen.nfPreloadTimer = null;
    if (card.isConnected && card.classList.contains("focused")) preloadAround(screen, card);
  }, PRELOAD_DWELL_MS);
  const delay = getCardOpeningDelayMs();
  const token = (screen.nfExpandToken || 0) + 1;
  screen.nfExpandToken = token;
  screen.nfExpandTimer = setTimeout(() => {
    screen.nfExpandTimer = null;
    if (Router.getCurrent?.() !== "home") return;
    void waitForImage(backdropOf(cardItem(screen, card)), EXPAND_IMAGE_WAIT_MS).then(() => {
      if (screen.nfExpandToken !== token || Router.getCurrent?.() !== "home") return;
      expandCard(screen, card);
    });
  }, delay);
}

export function onNotflixFocus(screen, target) {
  if (!active(screen)) return;
  if (screen.nfExpandedCard && screen.nfExpandedCard !== target) {
    collapseNotflixCard(screen);
  }
  clearExpandTimer(screen);
  if (screen.nfCwCard !== target || !isContinueCard(target)) collapseContinueCard(screen);
  if (isContinueCard(target) && screen.nfCwCard !== target) scheduleContinueExpand(screen, target);
  if (isHero(target)) {
    if (screen.nfHeroCursor == null) screen.nfHeroCursor = 0;
    if (screen.nfWarm) scheduleHeroIdle(screen);
  }
  const shell = screen.container?.querySelector(".home-shell");
  if (shell && screen.isMainNode?.(target)) {
    shell.classList.toggle("nf-scrolled", !isHero(target));
  }
  syncBillboardCursor(screen);
  syncRowInfo(screen, target);
  if (isExpandableCard(target)) {
    extendRowIfNeeded(screen, target, allowedItem);
    scheduleExpand(screen, target);
  }
}

function playItem(screen, item, node) {
  if (!item?.id) return;
  playUiSound("confirm");
  if (node) screen.rememberReturnFocusForNode?.(node);
  Router.navigate("detail", {
    itemId: item.id,
    itemType: item.type || "movie",
    fallbackTitle: item.name || "Untitled",
    fallbackPoster: item.poster || "",
    fallbackBackground: item.background || "",
    addonBaseUrl: item.addonBaseUrl || node?.dataset?.addonBaseUrl || "",
    addonId: item.addonId || node?.dataset?.addonId || "",
    addonName: item.addonName || node?.dataset?.addonName || "",
    catalogType: item.catalogType || item.type || "movie",
    playOnLoad: true
  });
}

function handleHeroKey(screen, node, code, event) {
  const candidates = Array.isArray(screen.heroCandidates) ? screen.heroCandidates.length : 0;
  let cursor = Number(screen.nfHeroCursor || 0);
  if (code === KEY_LEFT || code === KEY_RIGHT) {
    const step = code === KEY_RIGHT ? 1 : -1;
    if (cursor === 2) {
      const index = Number(screen.heroIndex || 0);
      if (step < 0 && index <= 0) {
        cursor = 1;
      } else if (step > 0 && index >= candidates - 1) {
        return true;
      } else {
        screen.rotateHero?.(step);
        playUiSound("move");
      }
    } else {
      const max = candidates > 1 ? 2 : 1;
      const next = Math.max(0, Math.min(max, cursor + step));
      if (next !== cursor) playUiSound("move");
      cursor = next;
    }
    screen.nfHeroCursor = cursor;
    syncBillboardCursor(screen);
    return true;
  }
  if (code === KEY_ENTER) {
    if (event?.repeat) return true;
    const item = screen.heroItem || screen.heroCandidates?.[0] || null;
    if (cursor === 0) {
      playItem(screen, item, node);
      return true;
    }
    playUiSound("confirm");
    screen.openDetailFromNode(node);
    return true;
  }
  return false;
}

function handleExpandedCardKey(screen) {
  restartCardPreviewIdle(screen);
  return false;
}

export function handleNotflixHomeKey(screen, event) {
  screen.nfLastKeyAt = Date.now();
  if (!active(screen)) return false;
  if (screen._homeHoldDialog || screen.continueWatchingMenu || screen.posterHoldMenu) return false;
  const code = Number(event?.keyCode || 0);
  const current = screen.getCurrentFocusedNode?.();
  if (!current || screen.isSidebarNode?.(current)) return false;
  if (isHero(current)) {
    const handled = handleHeroKey(screen, current, code, event);
    if (handled) event?.preventDefault?.();
    return handled;
  }
  if (screen.nfExpandedCard === current) {
    const handled = handleExpandedCardKey(screen);
    if (handled) event?.preventDefault?.();
    return handled;
  }
  if (code >= KEY_LEFT && code <= KEY_DOWN) {
    clearExpandTimer(screen);
    if (screen.nfCwTimer) {
      clearTimeout(screen.nfCwTimer);
      screen.nfCwTimer = null;
    }
  }
  return false;
}

export function consumeNotflixBack(screen) {
  if (!active(screen)) return false;
  if (screen.nfExpandedCard) {
    collapseNotflixCard(screen);
    return true;
  }
  if (screen.nfCwCard) {
    collapseContinueCard(screen);
    return true;
  }
  return false;
}

export function afterNotflixRender(screen) {
  if (!active(screen)) return;
  if (screen.nfExpandedCard && !screen.nfExpandedCard.isConnected) {
    screen.nfExpandedCard = null;
  }
  if (screen.nfCwCard && !screen.nfCwCard.isConnected) collapseContinueCard(screen);
  applyNotflixSizing(screen);
  renderNotflixBillboard(screen);
  scheduleIdleWork(screen);
  const focused = screen.getCurrentFocusedNode?.();
  if (screen.nfActiveRow && !screen.nfActiveRow.isConnected) screen.nfActiveRow = null;
  if (focused && screen.isMainNode?.(focused)) syncRowInfo(screen, focused);
  if (focused && isExpandableCard(focused) && screen.nfExpandedCard !== focused) {
    scheduleExpand(screen, focused);
  }
  if (
    screen.nfWarm &&
    focused &&
    isContinueCard(focused) &&
    screen.nfCwCard !== focused &&
    !screen.nfCwTimer
  ) {
    scheduleContinueExpand(screen, focused);
  }
}

export function cleanupNotflixHome(screen) {
  if (screen.nfIdleTimer) {
    clearTimeout(screen.nfIdleTimer);
    screen.nfIdleTimer = null;
  }
  collapseNotflixCard(screen);
  collapseContinueCard(screen);
  clearDetailsTimer(screen);
  activateRow(screen, null);
  stopHeroLoop(screen);
}

function allowedItem(item, fallbackType) {
  const type = item?.type || fallbackType;
  return !isHiddenTitle(type, item?.id) && isTitleAllowed(type, item?.id);
}

function scheduleAgeResolution(screen, pendingItems) {
  if (!pendingItems.length || screen.nfAgeResolving) return;
  if (!screen.nfWarm) {
    screen.nfAgePending = pendingItems;
    return;
  }
  screen.nfAgeResolving = true;
  void resolveAges(pendingItems.slice(0, 120))
    .then((count) => {
      screen.nfAgeResolving = false;
      if (count > 0 && active(screen) && screen.container?.isConnected) {
        if (typeof screen.requestRender === "function") screen.requestRender();
        else screen.render();
      }
    })
    .catch(() => {
      screen.nfAgeResolving = false;
    });
}

function filterHiddenRows(screen) {
  const limitActive = isAgeLimitActive();
  const pending = [];
  (Array.isArray(screen.rows) ? screen.rows : []).forEach((row) => {
    const data = row?.result?.data;
    if (!data || !Array.isArray(data.items)) return;
    if (
      !Array.isArray(row.nfAllItems) ||
      (data.items !== row.nfFilteredItems && data.items.length)
    ) {
      row.nfAllItems = data.items;
    }
    const fallbackType = row?.type || row?.apiType;
    if (limitActive) {
      row.nfAllItems.forEach((item) => {
        if (item?.id && cachedAge(item.type || fallbackType, item.id) === undefined) {
          pending.push({ id: item.id, type: item.type || fallbackType });
        }
      });
    }
    const visible = row.nfAllItems.filter((item) => allowedItem(item, fallbackType));
    row.nfFilteredItems = visible;
    data.items = visible;
  });
  if (Array.isArray(screen.heroCandidates) && screen.heroCandidates.length) {
    if (!Array.isArray(screen.nfAllHeroes) || screen.heroCandidates !== screen.nfFilteredHeroes) {
      screen.nfAllHeroes = screen.heroCandidates;
    }
    const visibleHeroes = screen.nfAllHeroes.filter((item) => allowedItem(item, item?.type));
    screen.nfFilteredHeroes = visibleHeroes;
    screen.heroCandidates = visibleHeroes;
    if (
      !allowedItem(screen.heroItem || {}, screen.heroItem?.type) ||
      screen.heroIndex >= visibleHeroes.length
    ) {
      screen.heroIndex = 0;
      screen.heroItem = visibleHeroes[0] || null;
    }
  }
  if (limitActive && canResolveAges()) scheduleAgeResolution(screen, pending);
}

const CW_REFRESH_DELAYS = [1500, 5000];

function scheduleContinueRefresh(screen) {
  (screen.nfCwRefreshTimers || []).forEach((timer) => clearTimeout(timer));
  screen.nfCwRefreshTimers = CW_REFRESH_DELAYS.map((delay) =>
    setTimeout(() => {
      if (Router.getCurrent?.() !== "home" || !screen.container?.isConnected) return;
      screen.refreshHomeContinueWatchingAfterSync?.()?.catch?.(() => {});
    }, delay)
  );
}

export function withNotflixHome(base) {
  return {
    ...base,
    ...withHoldGuard(base, ["startPendingContinueWatchingHold"], isNotflixActive),
    mount(...args) {
      const result = base.mount.apply(this, args);
      if (consumePlaybackMark() && isNotflixActive()) scheduleContinueRefresh(this);
      return result;
    },
    evictDistantHomeLazyImages(...args) {
      if (isNotflixActive()) {
        const loaded = this.container?.querySelectorAll(
          ".home-poster-card img[src], .home-continue-card img[src]"
        ).length;
        if ((loaded || 0) < 220) return 0;
      }
      return base.evictDistantHomeLazyImages.apply(this, args);
    },
    onKeyUp(event) {
      const result = base.onKeyUp?.call(
        this,
        isNotflixActive() ? shortPressEvent(this, event) : event
      );
      if (Number(event?.keyCode || 0) === 13) clearHold(this);
      return result;
    },
    render(...args) {
      this.nfHideSeeAll = active(this);
      if (active(this)) filterHiddenRows(this);
      const result = base.render.apply(this, args);
      afterNotflixRender(this);
      return result;
    },
    applyHeroToDom(...args) {
      const result = base.applyHeroToDom.apply(this, args);
      if (active(this)) renderNotflixBillboard(this);
      return result;
    },
    ensureTrackHorizontalVisibility(target, direction = null, layoutAdjustment = 0) {
      const track =
        active(this) && this.layoutMode !== "modern" ? target?.closest?.(".home-track") : null;
      if (!track)
        return base.ensureTrackHorizontalVisibility.call(this, target, direction, layoutAdjustment);
      const metrics = this.getTrackViewportMetrics(track);
      const peek = target.previousElementSibling ? ROW_PEEK_PX : 0;
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      const value = Math.min(
        maxScroll,
        Math.max(0, Math.round(target.offsetLeft - metrics.leftPadding - peek))
      );
      if (Math.abs(Number(track.scrollLeft || 0) - value) <= 1) return undefined;
      if (this.shouldUseImmediateHorizontalScrollForNode?.(target)) {
        this.cancelScrollAnimation?.(track, "x");
        track.scrollLeft = value;
        return undefined;
      }
      this.animateScroll(track, "x", value, this.getScrollDuration?.(200) || 200);
      return undefined;
    },
    focusNode(current, target, direction, inputMeta) {
      if (active(this) && target) {
        if (this.nfCwCard && this.nfCwCard !== target) collapseContinueCard(this);
        if (this.nfExpandedCard && this.nfExpandedCard !== target) collapseNotflixCard(this);
        activateRow(this, isContinueCard(target) || isExpandableCard(target) ? target : null);
      }
      const moved = base.focusNode.call(this, current, target, direction, inputMeta);
      if (moved) onNotflixFocus(this, target);
      return moved;
    },
    applyClassicMainVerticalVisibility(target, direction, current, layoutAdjustment) {
      if (!active(this)) {
        return base.applyClassicMainVerticalVisibility.call(
          this,
          target,
          direction,
          current,
          layoutAdjustment
        );
      }
      const main = this.container?.querySelector(".home-main");
      if (!main || !target || !this.container.contains(target)) return undefined;
      if (isHero(target)) {
        this.animateScroll(main, "y", 0, this.getScrollDuration(150));
        return undefined;
      }
      const anchor = this.getMainFocusAnchor(target);
      const mainRect = main.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const barHeight = 88;
      const desiredTop = Math.max(0, barHeight + 12 - mainRect.top);
      const next =
        anchorRect.top - mainRect.top + main.scrollTop - Number(layoutAdjustment || 0) - desiredTop;
      const maxScroll = Math.max(0, main.scrollHeight - main.clientHeight);
      this.animateScroll(
        main,
        "y",
        Math.max(0, Math.min(maxScroll, next)),
        this.getScrollDuration(150)
      );
      return undefined;
    },
    collectHeroCandidates(rows) {
      if (!isNotflixActive()) return base.collectHeroCandidates.call(this, rows);
      const catalogRows = (Array.isArray(rows) ? rows : []).filter(
        (row) => row && row.rowKind !== "collection"
      );
      const clean = (list) => (list || []).filter((item) => item && !isCollectionFolderItem(item));
      const picked = clean(base.collectHeroCandidates.call(this, catalogRows));
      if (picked.length || !this.layoutPrefs?.heroCatalogKeys?.length) return picked;
      const prefs = this.layoutPrefs;
      this.layoutPrefs = { ...prefs, heroCatalogKeys: [] };
      try {
        return clean(base.collectHeroCandidates.call(this, catalogRows));
      } finally {
        this.layoutPrefs = prefs;
      }
    },
    pickHeroItem(rows) {
      if (!isNotflixActive()) return base.pickHeroItem.call(this, rows);
      const candidates = this.collectHeroCandidates(rows);
      return candidates[0] || null;
    },
    startHeroRotation(...args) {
      if (active(this)) return undefined;
      return base.startHeroRotation?.apply(this, args);
    },
    onKeyDown(event) {
      if (isNotflixActive() && handleHoldRepeat(this, event)) return undefined;
      if (Number(event?.keyCode || 0) !== 13) clearHold(this);
      if (active(this) && this.nfWarm) noteHeroActivity(this);
      if (
        active(this) &&
        this.layoutPrefs &&
        Number(event?.keyCode) !== 76 &&
        handleNotflixHomeKey(this, event)
      ) {
        this.markUserInteractionSinceHomePaint?.();
        return;
      }
      return base.onKeyDown.call(this, event);
    },
    consumeBackRequest(...args) {
      if (consumeNotflixBack(this)) return true;
      return base.consumeBackRequest.apply(this, args);
    },
    cleanup(...args) {
      cleanupNotflixHome(this);
      return base.cleanup?.apply(this, args);
    }
  };
}

export { escapeText };
