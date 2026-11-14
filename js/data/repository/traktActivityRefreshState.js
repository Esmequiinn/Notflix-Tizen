const DEFAULT_FORCE_REFRESH_WINDOW_MS = 30_000;

let forceRefreshWindowMs = DEFAULT_FORCE_REFRESH_WINDOW_MS;
let scopeKey = null;
let state = createState();
let actionGeneration = 0;

function createState() {
  return {
    lastKnownActivityFingerprint: null,
    lastKnownMoviesWatchedAt: null,
    lastKnownEpisodeActivityFingerprint: null,
    activityRefreshPending: false,
    watchedMoviesStale: true,
    watchedShowsStale: true,
    forceRefreshUntilMs: 0,
    progressRecheckAtMs: 0
  };
}

export function useTraktActivityScope(key) {
  const normalized = String(key || "");
  if (scopeKey !== normalized) {
    scopeKey = normalized;
    state = createState();
  }
  return state;
}

export function resetTraktActivityState() {
  scopeKey = null;
  state = createState();
  actionGeneration += 1;
}

export function getTraktActivityState() {
  return state;
}

export function getTraktActivityActionGeneration() {
  return actionGeneration;
}

export function setTraktForceRefreshWindowMs(ms) {
  forceRefreshWindowMs = Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_FORCE_REFRESH_WINDOW_MS;
}

export function requestTraktRefreshAfterWatchAction({ movies = false, shows = false } = {}) {
  if (movies) state.watchedMoviesStale = true;
  if (shows) state.watchedShowsStale = true;
  state.forceRefreshUntilMs = Date.now() + forceRefreshWindowMs;
  actionGeneration += 1;
}

export function applyTraktLastActivities(activities) {
  if (activities === null || activities === undefined) return null;
  if (typeof activities !== "object" || Array.isArray(activities)) return true;
  const moviesWatchedAt = activities.movies?.watched_at ?? null;
  if (moviesWatchedAt !== state.lastKnownMoviesWatchedAt) {
    state.watchedMoviesStale = true;
    state.lastKnownMoviesWatchedAt = moviesWatchedAt;
  }
  const episodeFingerprint = [activities.episodes?.paused_at, activities.episodes?.watched_at]
    .filter((value) => value != null)
    .join("|");
  if (episodeFingerprint !== state.lastKnownEpisodeActivityFingerprint) {
    state.lastKnownEpisodeActivityFingerprint = episodeFingerprint;
    state.watchedShowsStale = true;
  }
  const fingerprint = [
    activities.movies?.paused_at,
    activities.movies?.watched_at,
    activities.episodes?.paused_at,
    activities.episodes?.watched_at
  ]
    .filter((value) => value != null)
    .join("|");
  const changed = fingerprint !== state.lastKnownActivityFingerprint;
  state.lastKnownActivityFingerprint = fingerprint;
  return changed;
}
