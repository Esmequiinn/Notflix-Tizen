const MARK_PREFIX = "nuvio:boot:";
const marks = [];
let firstHomePaintMarked = false;
const firstHomePaintListeners = new Set();

function nowMs() {
  const perf = globalThis.performance;
  if (perf && typeof perf.now === "function") {
    return perf.now();
  }
  return Date.now();
}

export function markBootTiming(name) {
  const label = String(name || "").trim();
  if (!label) {
    return;
  }
  const at = nowMs();
  marks.push({ name: label, at });
  try {
    globalThis.performance?.mark?.(`${MARK_PREFIX}${label}`);
  } catch (_) {}
}

export function markFirstHomePaint() {
  if (firstHomePaintMarked) {
    return;
  }
  firstHomePaintMarked = true;
  markBootTiming("home-first-paint");
  const listeners = Array.from(firstHomePaintListeners);
  firstHomePaintListeners.clear();
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.warn("First Home paint listener failed", error);
    }
  }
}

export function hasMarkedFirstHomePaint() {
  return firstHomePaintMarked;
}

export function onFirstHomePaint(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }
  if (firstHomePaintMarked) {
    listener();
    return () => {};
  }
  firstHomePaintListeners.add(listener);
  return () => {
    firstHomePaintListeners.delete(listener);
  };
}

export function getBootGuardStartedAt() {
  const value = Number(globalThis.NuvioBootGuard?.startedAt);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function getBootTimings() {
  const guardStartedAt = getBootGuardStartedAt();
  const entries = marks.map((mark) => ({ name: mark.name, at: Math.round(mark.at) }));
  if (guardStartedAt !== null) {
    entries.unshift({ name: "boot-guard", at: Math.round(guardStartedAt) });
  }
  return entries;
}

export function formatBootTimingSummary() {
  const entries = getBootTimings();
  if (!entries.length) {
    return "";
  }
  return entries.map((entry) => `${entry.name} ${entry.at}ms`).join(" · ");
}

export function resetBootTimingsForTests() {
  marks.length = 0;
  firstHomePaintMarked = false;
  firstHomePaintListeners.clear();
}
