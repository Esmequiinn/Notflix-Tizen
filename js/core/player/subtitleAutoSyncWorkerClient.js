import { alignSubtitleAutoSync } from "./subtitleAutoSyncWorker.js";

const WORKER_ASSET_PATH = "assets/runtime/subtitle-autosync-worker.js";
const WORKER_IDLE_TERMINATE_MS = 30_000;
const WORKER_RESULT_TIMEOUT_MS = 45_000;

let worker = null;
let workerBroken = false;
let nextRequestId = 1;
let idleTimer = null;
const pending = new Map();

function workerUrl() {
  if (globalThis.__NUVIO_SUBTITLE_AUTOSYNC_WORKER_URL__) {
    return String(globalThis.__NUVIO_SUBTITLE_AUTOSYNC_WORKER_URL__);
  }
  try {
    return new URL(WORKER_ASSET_PATH, document.baseURI || location.href).toString();
  } catch (_) {
    return WORKER_ASSET_PATH;
  }
}

function canUseWorker() {
  return !workerBroken && typeof Worker === "function";
}

function clearIdleTimer() {
  if (idleTimer != null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function disposeWorker() {
  clearIdleTimer();
  const instance = worker;
  worker = null;
  try {
    instance?.terminate?.();
  } catch (_) {}
}

function scheduleIdleTerminate() {
  clearIdleTimer();
  if (!worker || pending.size) {
    return;
  }
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (!pending.size) {
      disposeWorker();
    }
  }, WORKER_IDLE_TERMINATE_MS);
}

function rejectAllPending(error) {
  pending.forEach((entry) => {
    clearTimeout(entry.timer);
    entry.reject(error);
  });
  pending.clear();
}

function markWorkerBroken(error) {
  workerBroken = true;
  disposeWorker();
  rejectAllPending(error);
}

function ensureWorker() {
  if (worker) {
    return worker;
  }
  const instance = new Worker(workerUrl());
  instance.onmessage = (event) => {
    const { id, ok, result, error } = event?.data || {};
    const entry = pending.get(id);
    if (!entry) {
      return;
    }
    pending.delete(id);
    clearTimeout(entry.timer);
    if (ok) {
      entry.resolve(result);
    } else {
      entry.reject(new Error(String(error || "Subtitle AutoSync failed")));
    }
    scheduleIdleTerminate();
  };
  instance.onerror = (event) => {
    markWorkerBroken(new Error(String(event?.message || "Subtitle AutoSync worker failed")));
  };
  worker = instance;
  return instance;
}

function runInWorker(request) {
  return new Promise((resolve, reject) => {
    const instance = ensureWorker();
    const id = nextRequestId;
    nextRequestId += 1;
    clearIdleTimer();
    const timer = setTimeout(() => {
      if (pending.delete(id)) {
        markWorkerBroken(new Error("Subtitle AutoSync worker timed out"));
      }
    }, WORKER_RESULT_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    try {
      instance.postMessage({ id, ...request });
    } catch (error) {
      pending.delete(id);
      clearTimeout(timer);
      markWorkerBroken(error);
    }
  });
}

export async function alignSubtitleAutoSyncAsync(request) {
  if (canUseWorker()) {
    try {
      return await runInWorker(request);
    } catch (error) {
      console.warn(
        "Subtitle AutoSync worker unavailable; aligning on the main thread",
        error?.message || error
      );
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  return alignSubtitleAutoSync(request);
}

export function isSubtitleAutoSyncWorkerActive() {
  return Boolean(worker);
}

export function resetSubtitleAutoSyncWorkerForTests() {
  rejectAllPending(new Error("reset"));
  disposeWorker();
  workerBroken = false;
  nextRequestId = 1;
}
