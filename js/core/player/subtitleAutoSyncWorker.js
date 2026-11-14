import { buildAutoSyncReferenceTimeline, findAutoSyncTimeline } from "./subtitleAutoSyncEngine.js";

export function alignSubtitleAutoSync({ referenceCues, targetCues } = {}) {
  return findAutoSyncTimeline(buildAutoSyncReferenceTimeline(referenceCues), targetCues);
}

export function handleSubtitleAutoSyncWorkerMessage(data, post) {
  const id = data?.id;
  try {
    post({ id, ok: true, result: alignSubtitleAutoSync(data || {}) });
  } catch (error) {
    post({ id, ok: false, error: String(error?.message || error || "Subtitle AutoSync failed") });
  }
}

if (
  typeof self !== "undefined" &&
  typeof self.postMessage === "function" &&
  typeof document === "undefined"
) {
  self.onmessage = (event) => {
    handleSubtitleAutoSyncWorkerMessage(event?.data, (message) => self.postMessage(message));
  };
}
