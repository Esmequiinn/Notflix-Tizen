const STORAGE_KEY = "nuvio.tvMeasuredTier";
const FORCED_TIER_KEY = "nuvio.debug.forceTvTier";

export const TV_FRAME_PACE_POLICY = Object.freeze({
  windowMs: 350,
  sampleKeys: 12,
  frameMs: 16.7,
  lateFrameMs: 25,
  slowLostMs: 60,
  warmupMs: 20000
});

function readStorage(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch (_error) {
    return null;
  }
}

export function readForcedTvTier(storage = globalThis.localStorage) {
  const value = readStorage(storage, FORCED_TIER_KEY);
  return value === "full" || value === "constrained" ? value : null;
}

export function readMeasuredTvTier(appVersion = "", storage = globalThis.localStorage) {
  try {
    const stored = JSON.parse(readStorage(storage, STORAGE_KEY) || "null");
    return stored?.tier === "constrained" && stored.appVersion === String(appVersion)
      ? "constrained"
      : null;
  } catch (_error) {
    return null;
  }
}

export function storeMeasuredTvTier(
  { tier, appVersion = "", lostMs = 0 },
  storage = globalThis.localStorage
) {
  try {
    storage?.setItem?.(
      STORAGE_KEY,
      JSON.stringify({ tier, appVersion: String(appVersion), lostMs, at: Date.now() })
    );
  } catch (_error) {}
}

export function median(values) {
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

export function createFramePaceMonitor({
  onSlow,
  policy = TV_FRAME_PACE_POLICY,
  now = () => globalThis.performance.now(),
  requestFrame = (callback) => globalThis.requestAnimationFrame(callback)
} = {}) {
  const startedAt = now();
  const samples = [];
  let sampling = false;
  let reported = false;

  return {
    samples,
    noteKey() {
      if (reported || sampling || now() - startedAt < policy.warmupMs) {
        return;
      }
      sampling = true;
      const keyAt = now();
      let lastFrameAt = keyAt;
      let lostMs = 0;
      const onFrame = () => {
        const frameAt = now();
        const interval = frameAt - lastFrameAt;
        lastFrameAt = frameAt;
        if (interval > policy.lateFrameMs) {
          lostMs += interval - policy.frameMs;
        }
        if (frameAt - keyAt < policy.windowMs) {
          requestFrame(onFrame);
          return;
        }
        sampling = false;
        samples.push(lostMs);
        if (samples.length > policy.sampleKeys) {
          samples.shift();
        }
        const typical = median(samples);
        if (samples.length >= policy.sampleKeys && typical > policy.slowLostMs) {
          reported = true;
          onSlow?.(typical);
        }
      };
      requestFrame(onFrame);
    }
  };
}
