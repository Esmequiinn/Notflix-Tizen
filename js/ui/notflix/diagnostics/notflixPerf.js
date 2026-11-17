import { Router } from "../../navigation/routerState.js";

const STORAGE_KEY = "nfPerfMonitor";
const FREEZE_MS = 120;
const HEAVY_MS = 250;
const MAX_FREEZES = 40;
const SLOW_CALL_MS = 8;
const OVERLAY_REFRESH_MS = 1000;

const state = {
  enabled: false,
  startedAt: 0,
  lastAction: "",
  frames: 0,
  frameWindowStart: 0,
  fps: 0,
  lastFrameAt: 0,
  keys: new Map(),
  freezes: [],
  calls: new Map(),
  longTasks: { count: 0, total: 0 },
  images: { count: 0, bytes: 0, slow: 0 },
  playbackErrors: [],
  lastLatency: 0,
  overlay: null,
  report: null,
  overlayTimer: null
};

function now() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

function routeName() {
  try {
    return String(Router.getCurrent?.() || "app");
  } catch (_) {
    return "app";
  }
}

export function isPerfMonitorEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch (_) {
    return false;
  }
}

export function setPerfMonitorEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch (_) {}
  if (enabled) startPerfMonitor();
  else stopPerfMonitor();
}

function bucket(map, key) {
  let entry = map.get(key);
  if (!entry) {
    entry = { count: 0, total: 0, max: 0, samples: [], slow: 0, heavy: 0, maxAction: "" };
    map.set(key, entry);
  }
  return entry;
}

function recordKey(route, latency, action) {
  const entry = bucket(state.keys, route);
  entry.count += 1;
  entry.total += latency;
  if (latency > entry.max) {
    entry.max = latency;
    entry.maxAction = action;
  }
  if (latency >= FREEZE_MS) entry.slow += 1;
  if (latency >= HEAVY_MS) entry.heavy += 1;
  entry.samples.push(latency);
  if (entry.samples.length > 400) entry.samples.shift();
  state.lastLatency = latency;
}

function keyName(event) {
  const code = Number(event?.keyCode || 0);
  const names = {
    13: "OK",
    37: "←",
    38: "↑",
    39: "→",
    40: "↓",
    8: "Atrás",
    10009: "Atrás",
    415: "Play",
    19: "Pausa",
    10252: "Play/Pausa"
  };
  return names[code] || String(code);
}

function onKeyDown(event) {
  if (!state.enabled) return;
  const started = now();
  const route = routeName();
  const label = `${route} ${keyName(event)}`;
  state.lastAction = label;
  const settle = () => {
    setTimeout(() => recordKey(route, now() - started, label), 0);
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(settle);
  else setTimeout(settle, 16);
}

function frameLoop() {
  if (!state.enabled) return;
  const current = now();
  if (state.lastFrameAt) {
    const gap = current - state.lastFrameAt;
    if (gap >= FREEZE_MS && document.visibilityState !== "hidden") {
      const heavy = state.frameHeavy;
      state.freezes.push({
        ms: Math.round(gap),
        route: routeName(),
        action: state.lastAction,
        cause: heavy && heavy.ms >= 40 ? `${heavy.label} ${Math.round(heavy.ms)}` : ""
      });
      if (state.freezes.length > MAX_FREEZES) {
        state.freezes.sort((a, b) => b.ms - a.ms);
        state.freezes.length = MAX_FREEZES;
      }
    }
  }
  state.lastFrameAt = current;
  state.frameHeavy = null;
  state.frames += 1;
  if (current - state.frameWindowStart >= 1000) {
    state.fps = Math.round((state.frames * 1000) / (current - state.frameWindowStart));
    state.frames = 0;
    state.frameWindowStart = current;
  }
  requestAnimationFrame(frameLoop);
}

function recordCall(label, ms) {
  if (!state.frameHeavy || ms > state.frameHeavy.ms) state.frameHeavy = { label, ms };
  const entry = bucket(state.calls, label);
  entry.count += 1;
  entry.total += ms;
  if (ms > entry.max) {
    entry.max = ms;
    entry.maxAction = state.lastAction;
  }
  if (ms >= SLOW_CALL_MS) entry.slow += 1;
}

function wrapMethod(target, method, label) {
  const original = target?.[method];
  if (typeof original !== "function" || original.nfPerfWrapped) return;
  const wrapped = function (...args) {
    if (!state.enabled) return original.apply(this, args);
    const started = now();
    try {
      return original.apply(this, args);
    } finally {
      recordCall(label, now() - started);
    }
  };
  wrapped.nfPerfWrapped = true;
  target[method] = wrapped;
}

const WATCHED_METHODS = [
  "mount",
  "render",
  "onKeyDown",
  "focusNode",
  "setFocusedNode",
  "focusMainNode",
  "applyClassicMainVerticalVisibility",
  "ensureTrackHorizontalVisibility",
  "updateRenderedLibraryContent",
  "renderControls",
  "renderSourcesPanel",
  "updateUi",
  "updateProgress",
  "refreshLoadingOverlayPresentation",
  "playStreamCandidate",
  "renderEpisodes",
  "renderSeasonSection",
  "mountTrailerLayer",
  "hydrateHomeLazyImages",
  "scheduleHomeLazyImageHydration",
  "cleanup",
  "applyHeroToDom",
  "requestBackgroundRender",
  "restoreFocusState",
  "releaseAllHomeLazyImages",
  "evictDistantHomeLazyImages",
  "setupContinueWatchingProgressiveRendering",
  "syncTrailerDom",
  "stopTrailerPlayback",
  "playTrailer",
  "openSourcesPanel",
  "syncSourcesFocusDom",
  "startPlayerControllerPlayback",
  "showStartupError",
  "renderParentalGuideOverlay",
  "renderHero",
  "renderNotflixBillboard"
];

export function instrumentScreens(screens) {
  Object.entries(screens || {}).forEach(([name, screen]) => {
    if (!screen) return;
    WATCHED_METHODS.forEach((method) => wrapMethod(screen, method, `${name}.${method}`));
  });
}

function observeLongTasks() {
  if (typeof PerformanceObserver !== "function") return;
  try {
    const observer = new PerformanceObserver((list) => {
      if (!state.enabled) return;
      list.getEntries().forEach((entry) => {
        state.longTasks.count += 1;
        state.longTasks.total += entry.duration;
      });
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch (_) {}
}

function sampleResources() {
  if (typeof performance === "undefined" || !performance.getEntriesByType) return;
  try {
    performance.getEntriesByType("resource").forEach((entry) => {
      if (entry.initiatorType !== "img") return;
      state.images.count += 1;
      state.images.bytes += Number(entry.transferSize || entry.encodedBodySize || 0);
      if (entry.duration > 1500) state.images.slow += 1;
    });
    performance.clearResourceTimings();
  } catch (_) {}
}

function heapText() {
  const memory = typeof performance !== "undefined" ? performance.memory : null;
  if (!memory?.usedJSHeapSize) return "";
  return `${Math.round(memory.usedJSHeapSize / 1048576)} MB`;
}

function percentile(samples, ratio) {
  if (!samples.length) return 0;
  const sorted = samples.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function ensureOverlay() {
  if (state.overlay?.isConnected) return state.overlay;
  const node = document.createElement("div");
  node.className = "nf-perf-overlay";
  document.body.appendChild(node);
  state.overlay = node;
  return node;
}

function refreshOverlay() {
  sampleResources();
  if (!state.enabled) return;
  const node = ensureOverlay();
  const heap = heapText();
  node.textContent = `${state.fps} fps · ${Math.round(state.lastLatency)} ms${heap ? ` · ${heap}` : ""}`;
}

const ROUTE_LABELS = {
  home: "Inicio",
  detail: "Ficha",
  player: "Reproductor",
  library: "Mi lista",
  search: "Buscar",
  calendar: "Calendario",
  settings: "Configuración",
  stream: "Fuentes",
  profileSelection: "Perfiles"
};

function escapeText(value) {
  return String(value).replace(
    /[&<>"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]
  );
}

function reportMarkup() {
  sampleResources();
  const minutes = Math.max(1, Math.round((Date.now() - state.startedAt) / 60000));
  const keyRows = Array.from(state.keys.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(
      ([route, entry]) => `
        <tr>
          <td>${escapeText(ROUTE_LABELS[route] || route)}</td>
          <td>${entry.count}</td>
          <td>${Math.round(percentile(entry.samples, 0.5))}</td>
          <td>${Math.round(percentile(entry.samples, 0.9))}</td>
          <td>${entry.slow}</td>
          <td>${entry.heavy}</td>
          <td>${Math.round(entry.max)} <small>${escapeText(entry.maxAction)}</small></td>
        </tr>`
    )
    .join("");
  const freezeRows = state.freezes
    .slice()
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 6)
    .map(
      (freeze) =>
        `<li><b>${freeze.ms} ms</b> · ${escapeText(ROUTE_LABELS[freeze.route] || freeze.route)} · ${escapeText(freeze.action || "-")} <small>${escapeText(freeze.cause || "dibujo")}</small></li>`
    )
    .join("");
  const callRows = Array.from(state.calls.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 12)
    .map(
      ([label, entry]) => `
        <tr>
          <td>${escapeText(label)}</td>
          <td>${entry.count}</td>
          <td>${Math.round(entry.total)}</td>
          <td>${Math.round(entry.total / Math.max(1, entry.count))}</td>
          <td>${Math.round(entry.max)}</td>
        </tr>`
    )
    .join("");
  const errorRows = state.playbackErrors
    .slice()
    .reverse()
    .map(
      (entry) =>
        `<li><b>${escapeText(entry.at)}</b> · ${escapeText(entry.text || "-")}${entry.source ? ` <small>${escapeText(entry.source)}</small>` : ""}</li>`
    )
    .join("");
  const heap = heapText();
  return `
    <div class="nf-perf-report-box">
      <h2>Reporte de fluidez · ${minutes} min</h2>
      <p class="nf-perf-summary">
        Congelones de pantalla: <b>${state.freezes.length}</b> ·
        Tareas largas: <b>${state.longTasks.count}</b> (${Math.round(state.longTasks.total)} ms) ·
        Imágenes: <b>${state.images.count}</b> (${(state.images.bytes / 1048576).toFixed(1)} MB, ${state.images.slow} lentas)
        ${heap ? ` · Memoria: <b>${heap}</b>` : ""}
      </p>
      <h3>Respuesta a los botones (ms)</h3>
      <table>
        <tr><th>Pantalla</th><th>Botones</th><th>Normal</th><th>Peor 10%</th><th>&gt;120</th><th>&gt;250</th><th>Peor</th></tr>
        ${keyRows || '<tr><td colspan="7">Sin datos</td></tr>'}
      </table>
      <div class="nf-perf-cols">
        <div>
          <h3>Congelones más largos</h3>
          <ol>${freezeRows || "<li>Ninguno</li>"}</ol>
          <h3>Errores al reproducir</h3>
          <ul class="nf-perf-errors">${errorRows || "<li>Ninguno</li>"}</ul>
        </div>
        <div>
          <h3>Partes que más tiempo usan (ms)</h3>
          <table>
            <tr><th>Parte</th><th>Veces</th><th>Total</th><th>Prom.</th><th>Peor</th></tr>
            ${callRows || '<tr><td colspan="5">Sin datos</td></tr>'}
          </table>
        </div>
      </div>
      <p class="nf-perf-hint">Toma una foto de esta pantalla y mándala. Presiona Atrás para cerrar.</p>
    </div>
  `;
}

export function isPerfReportOpen() {
  return Boolean(state.report?.isConnected);
}

export function closePerfReport() {
  state.report?.remove();
  state.report = null;
}

export function openPerfReport() {
  closePerfReport();
  const node = document.createElement("div");
  node.className = "nf-perf-report";
  node.innerHTML = reportMarkup();
  document.body.appendChild(node);
  state.report = node;
}

export function resetPerfData() {
  state.keys.clear();
  state.calls.clear();
  state.freezes = [];
  state.longTasks = { count: 0, total: 0 };
  state.images = { count: 0, bytes: 0, slow: 0 };
  state.playbackErrors = [];
  state.startedAt = Date.now();
}

export function recordPlaybackError(message, candidate) {
  const source = [candidate?.addonName, candidate?.name || candidate?.title || candidate?.label]
    .filter(Boolean)
    .join(" · ")
    .replace(/\s+/g, " ")
    .slice(0, 60);
  const text = String(message || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 170);
  const time = new Date();
  state.playbackErrors.push({
    at: `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`,
    source,
    text
  });
  if (state.playbackErrors.length > 5) state.playbackErrors.shift();
}

let listenersReady = false;

export function startPerfMonitor() {
  if (state.enabled) return;
  state.enabled = true;
  resetPerfData();
  if (!listenersReady) {
    listenersReady = true;
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener(
      "keydown",
      (event) => {
        if (!isPerfReportOpen()) return;
        const code = Number(event?.keyCode || 0);
        if (code === 8 || code === 27 || code === 10009 || code === 13) {
          event.preventDefault();
          event.stopImmediatePropagation();
          closePerfReport();
        }
      },
      true
    );
    observeLongTasks();
  }
  state.lastFrameAt = 0;
  state.frameWindowStart = now();
  requestAnimationFrame(frameLoop);
  refreshOverlay();
  state.overlayTimer = setInterval(refreshOverlay, OVERLAY_REFRESH_MS);
}

export function stopPerfMonitor() {
  state.enabled = false;
  clearInterval(state.overlayTimer);
  state.overlayTimer = null;
  state.overlay?.remove();
  state.overlay = null;
  closePerfReport();
}
