import { PlayerController } from "../../../core/player/playerController.js";
import { PlayerSettingsStore } from "../../../data/local/playerSettingsStore.js";
import {
  StreamLinkCacheStore,
  activeStreamLinkProfile
} from "../../../data/local/streamLinkCacheStore.js";
import { getNotflixAutoplay, isFallbackActive, pickFallbackStream } from "./notflixAutoplay.js";
import { nt } from "../home/notflixHomeMarkup.js";
import { releaseBackgroundMedia } from "../trailers/nuvioTrailer.js";
import { markPlayback } from "./playbackMark.js";
import { recordPlaybackError } from "../diagnostics/notflixPerf.js";

const NOTE_MS = 5000;
const FALLBACK_STARTUP_STALL_MS = 25000;

function clearNote(screen) {
  if (screen.nfFallbackNoteTimer) {
    clearInterval(screen.nfFallbackNoteTimer);
    screen.nfFallbackNoteTimer = null;
  }
}

function showNote(screen, text) {
  clearNote(screen);
  const startedAt = Date.now();
  const apply = () => {
    if (screen.hasPresentedPlaybackFrame || Date.now() - startedAt > NOTE_MS) {
      clearNote(screen);
      return;
    }
    if (screen.loadingTorrentStatus !== text && !String(screen.loadingTorrentStatus || "").trim()) {
      screen.loadingTorrentStatus = text;
      screen.syncLoadingOverlayStatus?.();
    }
  };
  screen.loadingTorrentStatus = text;
  screen.syncLoadingOverlayStatus?.();
  screen.nfFallbackNoteTimer = setInterval(apply, 400);
}

function excludedIds(screen, state) {
  const ids = new Set();
  const urls = new Set(state.triedUrls);
  (screen.failedPlaybackUrls || new Set()).forEach((url) => urls.add(String(url).trim()));
  if (!state.urlOnly) {
    state.tried.forEach((id) => ids.add(id));
    (screen.failedPlaybackStreamIds || new Set()).forEach((id) => ids.add(String(id)));
  }
  (screen.streamCandidates || []).forEach((candidate) => {
    const url = String(candidate?.url || "").trim();
    if (url && urls.has(url)) ids.add(String(candidate.id || ""));
  });
  return ids;
}

function createState(screen, params) {
  const config = getNotflixAutoplay();
  const cached = Boolean(params?.nfCachedLink);
  if (!cached && !isFallbackActive()) return null;
  const enabled = isFallbackActive();
  return {
    attempts: 0,
    max: enabled ? config.fallbackAttempts : 1,
    tried: new Set(params?.preferredStreamId && !cached ? [String(params.preferredStreamId)] : []),
    triedUrls: new Set(params?.streamUrl ? [String(params.streamUrl).trim()] : []),
    urlOnly: cached,
    reloaded: false
  };
}

function dropCachedLink(screen) {
  if (!screen.params?.nfCachedLink || screen.nfCachedLinkDropped) return;
  screen.nfCachedLinkDropped = true;
  try {
    StreamLinkCacheStore.remove(
      screen.params.streamRouteParams || screen.params,
      screen.streamLinkCacheProfileId || activeStreamLinkProfile()
    );
  } catch (_) {}
}

function tryFallback(screen) {
  const state = screen.nfFallbackState;
  if (!state || state.attempts >= state.max) return false;
  const candidates = Array.isArray(screen.streamCandidates) ? screen.streamCandidates : [];
  const current = screen.getCurrentStreamCandidate?.();
  if (current?.id && !state.urlOnly) state.tried.add(String(current.id));
  if (screen.activePlaybackUrl) state.triedUrls.add(String(screen.activePlaybackUrl).trim());
  const next = pickFallbackStream(
    candidates,
    PlayerSettingsStore.get(),
    excludedIds(screen, state)
  );
  if (!next) return false;
  const index = candidates.indexOf(next);
  if (index < 0) return false;
  state.attempts += 1;
  state.tried.add(String(next.id || ""));
  if (next.url) state.triedUrls.add(String(next.url).trim());
  screen.currentStreamIndex = index;
  screen.lastPlaybackErrorAt = 0;
  screen.clearPlaybackStallGuard?.();
  screen.releaseStartupAudioGate?.({ resume: false });
  screen.sourcesError = "";
  screen.loadingVisible = true;
  screen.paused = false;
  screen.updateLoadingVisibility?.();
  const label = [next.addonName, next.name || next.title || next.label].filter(Boolean).join(" · ");
  showNote(
    screen,
    nt("notflix_fallback_trying", `Trying another source (${state.attempts}/${state.max})`, {
      1: state.attempts,
      2: state.max
    }) + (label ? ` · ${label}` : "")
  );
  void screen.playStreamCandidate(next, {});
  return true;
}

function reloadAndRetry(screen, args, base) {
  const state = screen.nfFallbackState;
  if (!state || state.reloaded || state.attempts >= state.max || !screen.reloadSources)
    return false;
  state.reloaded = true;
  const token = screen.nfFallbackToken;
  screen.clearPlaybackStallGuard?.();
  screen.loadingVisible = true;
  screen.updateLoadingVisibility?.();
  showNote(screen, nt("notflix_fallback_searching", "Searching for another source"));
  Promise.resolve(screen.reloadSources({ forceRefresh: false }))
    .catch(() => {})
    .then(() => {
      if (screen.nfFallbackToken !== token || screen.hasPresentedPlaybackFrame) return;
      if (!tryFallback(screen)) {
        clearNote(screen);
        base.showStartupError.apply(screen, args);
      }
    });
  return true;
}

function syncFilterScroll(screen) {
  const row = screen.container?.querySelector(".player-sources-filters");
  if (!row) return;
  const chip =
    row.querySelector(".player-sources-filter.focused") ||
    row.querySelector(".player-sources-filter.selected");
  if (!chip) return;
  const left = chip.offsetLeft;
  const right = left + chip.offsetWidth;
  if (left < row.scrollLeft + 16) row.scrollLeft = Math.max(0, left - 16);
  else if (right > row.scrollLeft + row.clientWidth - 16)
    row.scrollLeft = right - row.clientWidth + 16;
}

export function withNotflixPlayer(base) {
  return {
    ...base,
    renderSourcesPanel(...args) {
      const result = base.renderSourcesPanel.apply(this, args);
      syncFilterScroll(this);
      return result;
    },
    syncSourcesFocusDom(...args) {
      const result = base.syncSourcesFocusDom.apply(this, args);
      syncFilterScroll(this);
      return result;
    },
    mount(params = {}, ...rest) {
      releaseBackgroundMedia(document.getElementById("player"));
      markPlayback();
      clearNote(this);
      this.nfCachedLinkDropped = false;
      this.nfFallbackToken = (this.nfFallbackToken || 0) + 1;
      this.nfFallbackState = createState(this, params);
      return base.mount.call(this, params, ...rest);
    },
    getPlaybackStallTimeoutMs(options = {}, ...rest) {
      const value = base.getPlaybackStallTimeoutMs.call(this, options, ...rest);
      const state = this.nfFallbackState;
      if (!options?.startup || !state || state.attempts >= state.max) return value;
      return Math.min(value, FALLBACK_STARTUP_STALL_MS);
    },
    showStartupError(...args) {
      const options = args[1] || {};
      const proxyNote = PlayerController.lastProxyFailureDetail;
      PlayerController.lastProxyFailureDetail = "";
      recordPlaybackError(
        [
          options.mediaErrorCode ? `#${options.mediaErrorCode}` : "",
          options.detail || options.resolverDetail || args[0],
          proxyNote ? `proxy: ${proxyNote}` : ""
        ]
          .filter(Boolean)
          .join(" · "),
        options.streamCandidate || this.getCurrentStreamCandidate?.()
      );
      dropCachedLink(this);
      if (tryFallback(this)) return undefined;
      if (this.params?.nfCachedLink && reloadAndRetry(this, args, base)) return undefined;
      clearNote(this);
      return base.showStartupError.apply(this, args);
    },
    cleanup(...args) {
      clearNote(this);
      this.nfFallbackToken = (this.nfFallbackToken || 0) + 1;
      this.nfFallbackState = null;
      return base.cleanup.apply(this, args);
    }
  };
}
