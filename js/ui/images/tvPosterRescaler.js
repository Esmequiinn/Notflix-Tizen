import { getTvRuntimePerformanceProfile } from "../../platform/tvRuntimePerformance.js";
import {
  getArtworkCacheLimit,
  getDeviceMemoryGb,
  isLowMemoryDevice,
  isModernTvProfile
} from "../../platform/tvPerformancePolicy.js";

export function isRescalableArtworkFit(fit) {
  return fit === "cover" || fit === "fill";
}

export function computeSourceRect(nw, nh, bw, bh, fit) {
  if (fit !== "cover") {
    return { sx: 0, sy: 0, sw: nw, sh: nh };
  }
  const sourceAspect = nw / nh;
  const boxAspect = bw / bh;
  if (sourceAspect > boxAspect) {
    const sw = Math.max(1, Math.round(nh * boxAspect));
    return { sx: Math.round((nw - sw) / 2), sy: 0, sw, sh: nh };
  }
  const sh = Math.max(1, Math.round(nw / boxAspect));
  return { sx: 0, sy: Math.round((nh - sh) / 2), sw: nw, sh };
}

export function isJpegHeader(bytes) {
  return (
    Boolean(bytes) &&
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

export function isArtworkTooLarge(bytes) {
  return Boolean(bytes) && Number(bytes.byteLength || 0) > 8388608;
}

export function jpegDimensions(bytes) {
  if (!bytes || bytes.length < 10 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 9 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    if (marker === 0xda) return null;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += 2 + length;
  }
  return null;
}

export function artworkResizeTarget(width, height, maxDimension = 1280) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  const max = Number(maxDimension) || 0;
  if (!(w > 0) || !(h > 0) || !(max > 0)) return null;
  if (w >= h && w > max) return { width: max };
  if (h > w && h > max) return { height: max };
  return null;
}

const WORKER_SOURCE = `
const sourceRect = ${computeSourceRect.toString()};
const isJpeg = ${isJpegHeader.toString()};
const isTooLarge = ${isArtworkTooLarge.toString()};
const jpegSize = ${jpegDimensions.toString()};
const resizeTarget = ${artworkResizeTarget.toString()};

self.onmessage = async (event) => {
  const { id, url, width, height, fit } = event.data || {};
  let full = null;
  try {
    const response = await fetch(url, { credentials: "omit" });
    if (!response.ok) {
      throw new Error("http " + response.status);
    }
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > 8388608) {
      throw new Error("too large");
    }
    const bytes = await response.arrayBuffer();
    if (isTooLarge(bytes)) {
      throw new Error("too large");
    }
    const view = new Uint8Array(bytes);
    if (!isJpeg(view)) {
      throw new Error("not jpeg");
    }
    const dimensions = jpegSize(view);
    const resize = dimensions ? resizeTarget(dimensions.width, dimensions.height, 1280) : null;
    full = await createImageBitmap(
      new Blob([bytes]),
      resize ? { ...resize, resizeQuality: "low" } : undefined
    );
    if (full.width <= width && full.height <= height) {
      throw new Error("already small");
    }
    const crop = sourceRect(full.width, full.height, width, height, fit);
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext("2d", { alpha: false }).drawImage(full, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
    const out = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.82 });
    full.close();
    full = null;
    self.postMessage({ id, ok: true, blob: out });
  } catch (error) {
    if (full) {
      full.close();
    }
    self.postMessage({ id, ok: false, reason: String((error && error.message) || error) });
  }
};
`;

export function artworkWorkerCount(cores, deviceMemory) {
  if (isLowMemoryDevice(deviceMemory)) {
    return 1;
  }
  const value = Number(cores) || 4;
  return Math.min(Math.max(value - 1, 1), 3);
}

function workerCount() {
  return artworkWorkerCount(globalThis.navigator?.hardwareConcurrency, getDeviceMemoryGb());
}

function cacheLimit() {
  return getArtworkCacheLimit(getTvRuntimePerformanceProfile(), getDeviceMemoryGb());
}

let pool = null;
let genericPool = null;
let supported = null;

function isSupported() {
  if (supported === null) {
    supported = Boolean(
      globalThis.Worker &&
      globalThis.OffscreenCanvas &&
      globalThis.createImageBitmap &&
      globalThis.URL?.createObjectURL &&
      typeof Blob !== "undefined"
    );
  }
  return supported;
}

export function getHomeArtworkObjectFit(image) {
  try {
    return String(globalThis.getComputedStyle(image)?.objectFit || "").trim();
  } catch (_) {
    return "";
  }
}

export function shouldRescaleHomeArtwork() {
  return isSupported() && isModernTvProfile(getTvRuntimePerformanceProfile());
}

const JOB_TIMEOUT_MS = 15000;
const WORKER_JOB_SLOTS = 2;

function createPool() {
  const workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
  const state = {
    workerUrl,
    workers: [],
    idle: [],
    queue: [],
    jobs: new Map(),
    nextId: 1,
    cache: new Map(),
    failed: new Map(),
    inflight: new Map(),
    disposed: false
  };
  const count = workerCount();
  for (let index = 0; index < count; index += 1) {
    if (!spawnWorker(state)) {
      break;
    }
  }
  if (!state.workers.length) {
    URL.revokeObjectURL(workerUrl);
    return null;
  }
  return state;
}

function spawnWorker(state) {
  let worker = null;
  try {
    worker = new Worker(state.workerUrl);
  } catch (_) {
    return false;
  }
  worker.onmessage = (event) => {
    const { id, ok, blob, reason } = event.data || {};
    const job = state.jobs.get(id);
    if (job) {
      state.jobs.delete(id);
      clearTimeout(job.timer);
      job.settle(ok ? blob : null, reason);
    }
    state.idle.push(worker);
    pump(state);
  };
  worker.onerror = () => retireWorker(state, worker, "worker error");
  state.workers.push(worker);
  for (let slot = 0; slot < WORKER_JOB_SLOTS; slot += 1) {
    state.idle.push(worker);
  }
  return true;
}

function retireWorker(state, worker, reason) {
  if (state.disposed) {
    return;
  }
  state.jobs.forEach((job, id) => {
    if (job.worker === worker) {
      state.jobs.delete(id);
      clearTimeout(job.timer);
      job.settle(null, reason);
    }
  });
  state.workers = state.workers.filter((candidate) => candidate !== worker);
  state.idle = state.idle.filter((candidate) => candidate !== worker);
  try {
    worker.terminate();
  } catch (_) {}
  if (state.workers.length < workerCount()) {
    spawnWorker(state);
  }
  if (!state.workers.length) {
    state.queue.splice(0).forEach((job) => job.settle(null, "no workers"));
  }
  pump(state);
}

function pump(state) {
  while (!state.disposed && state.idle.length && state.queue.length) {
    let pick = 0;
    for (let index = 1; index < state.queue.length; index += 1) {
      if (state.queue[index].priority <= state.queue[pick].priority) {
        pick = index;
      }
    }
    const job = state.queue.splice(pick, 1)[0];
    if (job.isStale?.()) {
      job.settle(null, "stale");
      continue;
    }
    const worker = state.idle.pop();
    job.worker = worker;
    job.timer = setTimeout(() => retireWorker(state, worker, "timeout"), JOB_TIMEOUT_MS);
    state.jobs.set(job.id, job);
    worker.postMessage({
      id: job.id,
      url: job.url,
      width: job.width,
      height: job.height,
      fit: job.fit
    });
  }
}

const DETERMINISTIC_ARTWORK_FAILURE = /^(not jpeg|already small|too large)$/;
const ARTWORK_FAILURE_LIMIT = 512;

function rememberArtworkFailure(state, key, reason) {
  if (!DETERMINISTIC_ARTWORK_FAILURE.test(String(reason || ""))) {
    return;
  }
  if (state.failed.size >= ARTWORK_FAILURE_LIMIT) {
    const oldest = state.failed.keys().next().value;
    if (oldest !== undefined) state.failed.delete(oldest);
  }
  state.failed.set(key, true);
}

function trimCache(state) {
  const limit = cacheLimit();
  if (state.cache.size <= limit) {
    return;
  }
  for (const [key, entry] of state.cache) {
    if (state.cache.size <= limit) {
      return;
    }
    if (entry.uses > 0) {
      continue;
    }
    URL.revokeObjectURL(entry.objectUrl);
    state.cache.delete(key);
  }
}

function getPoolFor(kind) {
  const current = kind === "generic" ? genericPool : pool;
  if (current === undefined) {
    return null;
  }
  if (current === null) {
    const created = createPool();
    if (!created) {
      if (kind === "generic") genericPool = undefined;
      else pool = undefined;
      return null;
    }
    if (kind === "generic") genericPool = created;
    else pool = created;
    return created;
  }
  return current;
}

function getPool() {
  return getPoolFor("home");
}

function getGenericPool() {
  return getPoolFor("generic");
}

function rescaleWithPool(state, url, { width, height, fit, priority = 2, isStale = null } = {}) {
  if (!state || !url || !(width > 0) || !(height > 0) || !isRescalableArtworkFit(fit)) {
    return Promise.resolve(null);
  }
  const key = `${url}|${width}x${height}|${fit}`;
  if (state.failed.has(key)) {
    return Promise.resolve(null);
  }
  const cached = state.cache.get(key);
  if (cached) {
    cached.uses += 1;
    state.cache.delete(key);
    state.cache.set(key, cached);
    return Promise.resolve(cached.objectUrl);
  }
  const pendingJob = state.inflight.get(key);
  if (pendingJob) {
    pendingJob.priority = Math.min(pendingJob.priority, priority);
    pendingJob.isStale = null;
    pendingJob.waiters += 1;
    return pendingJob.promise;
  }
  const job = {
    id: state.nextId++,
    url,
    width,
    height,
    fit,
    priority,
    isStale,
    worker: null,
    waiters: 1
  };
  job.promise = new Promise((resolve) => {
    job.settle = (blob, reason) => {
      if (job.done) {
        return;
      }
      job.done = true;
      state.inflight.delete(key);
      if (!blob || state.disposed) {
        if (!blob && !state.disposed) {
          rememberArtworkFailure(state, key, reason);
        }
        resolve(null);
        return;
      }
      const objectUrl = URL.createObjectURL(blob);
      const entry = { objectUrl, uses: job.waiters };
      state.cache.set(key, entry);
      trimCache(state);
      resolve(objectUrl);
    };
  });
  state.inflight.set(key, job);
  state.queue.push(job);
  pump(state);
  return job.promise;
}

function shouldQueueRescale(url, { width, height, fit } = {}) {
  return Boolean(url && width > 0 && height > 0 && isRescalableArtworkFit(fit));
}

export function rescaleHomeArtwork(url, options) {
  if (!shouldQueueRescale(url, options)) return Promise.resolve(null);
  return rescaleWithPool(getPool(), url, options);
}

export function rescaleArtwork(url, options) {
  if (!shouldQueueRescale(url, options)) return Promise.resolve(null);
  return rescaleWithPool(getGenericPool(), url, options);
}

function releaseFromPool(state, objectUrl) {
  if (!state || !objectUrl || !String(objectUrl).startsWith("blob:")) {
    return;
  }
  for (const entry of state.cache.values()) {
    if (entry.objectUrl === objectUrl) {
      entry.uses = Math.max(0, entry.uses - 1);
      trimCache(state);
      return;
    }
  }
}

export function releaseHomeArtwork(objectUrl) {
  releaseFromPool(pool, objectUrl);
}

export function releaseArtwork(objectUrl) {
  releaseFromPool(genericPool, objectUrl);
}

function resetPool(state) {
  if (!state) {
    return;
  }
  state.disposed = true;
  state.jobs.forEach((job) => {
    clearTimeout(job.timer);
    job.settle(null, "reset");
  });
  state.queue.splice(0).forEach((job) => job.settle(null, "reset"));
  state.inflight.forEach((job) => job.settle(null, "reset"));
  state.workers.forEach((worker) => {
    try {
      worker.terminate();
    } catch (_) {}
  });
  state.cache.forEach((entry) => URL.revokeObjectURL(entry.objectUrl));
  URL.revokeObjectURL(state.workerUrl);
  state.cache.clear();
  state.jobs.clear();
  state.inflight.clear();
  state.workers.length = 0;
  state.idle.length = 0;
  state.queue.length = 0;
  state.failed?.clear?.();
}

export function resetHomeArtworkRescaler() {
  const state = pool;
  pool = null;
  resetPool(state);
}

export function resetArtworkRescaler() {
  const state = genericPool;
  genericPool = null;
  resetPool(state);
}
