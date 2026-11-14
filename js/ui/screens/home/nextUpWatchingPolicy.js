export const NEXT_UP_NEW_RELEASE_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

function parseReleaseEpochMs(released) {
  if (released == null || released === "") {
    return null;
  }
  if (typeof released === "number") {
    return Number.isFinite(released) ? released : null;
  }
  const parsed = Date.parse(String(released));
  return Number.isNaN(parsed) ? null : parsed;
}

export function shouldSurfaceNextUpForUntrackedSeries({
  seedUpdatedAt = 0,
  released = null,
  nowMs = Date.now(),
  windowMs = NEXT_UP_NEW_RELEASE_WINDOW_MS
} = {}) {
  const releaseEpochMs = parseReleaseEpochMs(released);
  if (releaseEpochMs == null) {
    return false;
  }
  if (releaseEpochMs <= Number(seedUpdatedAt || 0)) {
    return false;
  }
  return Math.abs(releaseEpochMs - Number(nowMs)) <= windowMs;
}
