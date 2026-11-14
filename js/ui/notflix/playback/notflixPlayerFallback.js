import { PlayerSettingsStore } from "../../../data/local/playerSettingsStore.js";
import { getNotflixAutoplay, isFallbackActive, pickFallbackStream } from "./notflixAutoplay.js";
import { nt } from "../home/notflixHomeMarkup.js";

const NOTE_MS = 5000;

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
  const ids = new Set(state.tried);
  (screen.failedPlaybackStreamIds || new Set()).forEach((id) => ids.add(String(id)));
  const failedUrls = screen.failedPlaybackUrls || new Set();
  (screen.streamCandidates || []).forEach((candidate) => {
    if (candidate?.url && failedUrls.has(String(candidate.url).trim()))
      ids.add(String(candidate.id || ""));
  });
  return ids;
}

function tryFallback(screen) {
  const state = screen.nfFallbackState;
  if (!state || state.attempts >= state.max) return false;
  const candidates = Array.isArray(screen.streamCandidates) ? screen.streamCandidates : [];
  const current = screen.getCurrentStreamCandidate?.();
  if (current?.id) state.tried.add(String(current.id));
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
      clearNote(this);
      const config = getNotflixAutoplay();
      this.nfFallbackState =
        params?.nfAutoPicked && isFallbackActive()
          ? {
              attempts: 0,
              max: config.fallbackAttempts,
              tried: new Set(params?.preferredStreamId ? [String(params.preferredStreamId)] : [])
            }
          : null;
      return base.mount.call(this, params, ...rest);
    },
    showStartupError(...args) {
      if (tryFallback(this)) return undefined;
      clearNote(this);
      return base.showStartupError.apply(this, args);
    },
    cleanup(...args) {
      clearNote(this);
      this.nfFallbackState = null;
      return base.cleanup.apply(this, args);
    }
  };
}
