import { applyTrailerAudioPreferences } from "../../screens/home/homeScreenHelpers-06-resolve-trailer-source.js";
import { Router } from "../../navigation/routerState.js";
import { buildTrailerProxyEmbed } from "./trailerProxy.js";

const CONTENT_WAIT_MS = 60000;
const CUSTOM_WAIT_MS = 12000;
const CUSTOM_FAILURE_LIMIT = 2;
let customFailures = 0;
const MIN_CONTENT_SECONDS = 0.35;
const guards = new WeakMap();

function homeScreen() {
  return Router.routes?.home || null;
}

function sendCommand(frame, command, payload = {}) {
  try {
    frame?.contentWindow?.postMessage(
      { source: "nuvio-detail-trailer", type: "command", command, payload },
      "*"
    );
  } catch (_) {}
}

function coverFrame(layer) {
  const frame = layer.querySelector("iframe");
  const width = layer.offsetWidth;
  const height = layer.offsetHeight;
  if (!frame || !width || !height) return;
  const ratio = 16 / 9;
  let frameWidth = width;
  let frameHeight = width / ratio;
  if (frameHeight < height) {
    frameHeight = height;
    frameWidth = height * ratio;
  }
  frame.style.width = `${Math.ceil(frameWidth)}px`;
  frame.style.height = `${Math.ceil(frameHeight)}px`;
  frame.style.left = `${Math.floor((width - frameWidth) / 2)}px`;
  frame.style.top = `${Math.floor((height - frameHeight) / 2)}px`;
}

function stopGuard(layer) {
  const guard = guards.get(layer);
  if (!guard) return;
  guards.delete(layer);
  window.removeEventListener("message", guard.listener);
  clearTimeout(guard.timer);
}

function guardAds(layer, { muted, volumeControl, waitMs = CONTENT_WAIT_MS, onReady, onFail }) {
  let revealed = false;
  let lastTime = -1;
  let duration = 0;
  let lastFixAt = 0;
  let fixes = 0;
  const frameOf = () => layer.querySelector("iframe");
  const setAudible = (audible) => {
    if (!volumeControl || muted) return;
    sendCommand(frameOf(), "setVolume", { volume: audible ? 100 : 0 });
  };
  const fail = () => {
    stopGuard(layer);
    layer.classList.remove("nf-trailer-on");
    sendCommand(frameOf(), "pause");
    onFail?.();
  };
  const hide = () => {
    if (!revealed) return;
    revealed = false;
    layer.classList.remove("nf-trailer-on");
    setAudible(false);
  };
  const show = () => {
    if (revealed) return;
    revealed = true;
    layer.classList.add("nf-trailer-on");
    setAudible(true);
    onReady?.();
  };
  let heard = false;
  const listener = (event) => {
    const frame = frameOf();
    if (!frame || event?.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || typeof data !== "object" || data.source !== "nuvio-youtube-proxy") return;
    heard = true;
    if (data.type === "error") {
      fail();
      return;
    }
    if (data.type !== "state" || !data.state) return;
    const state = data.state;
    if (state.controllable === false) {
      fail();
      return;
    }
    const time = Number(state.currentTime || 0);
    const total = Number(state.duration || 0);
    if (volumeControl && !muted && typeof state.volume === "number" && fixes < 12) {
      const want = revealed ? 100 : 0;
      const now = Date.now();
      if (Math.abs(state.volume - want) > 1 && now - lastFixAt > 600) {
        lastFixAt = now;
        fixes += 1;
        sendCommand(frameOf(), "setVolume", { volume: want });
      }
    }
    if (revealed && duration > 0 && total > 0 && Math.abs(total - duration) > 1.5) {
      hide();
      duration = 0;
      lastTime = time;
      return;
    }
    const advancing = lastTime >= 0 && time > lastTime;
    lastTime = time;
    if (
      !state.paused &&
      !state.loading &&
      Number(state.playerState) === 1 &&
      total > 0 &&
      time >= MIN_CONTENT_SECONDS &&
      advancing
    ) {
      if (!revealed) duration = total;
      show();
    }
  };
  const guard = { listener, timer: null };
  guard.timer = setTimeout(() => {
    if (revealed) return;
    if (!heard || waitMs >= CONTENT_WAIT_MS) {
      fail();
      return;
    }
    guard.timer = setTimeout(() => {
      if (!revealed) fail();
    }, CONTENT_WAIT_MS - waitMs);
  }, waitMs);
  guards.set(layer, guard);
  window.addEventListener("message", listener);
}

export function mountNuvioTrailer(
  parent,
  beforeNode,
  source,
  { muted = true, onReady, onFail } = {}
) {
  const home = homeScreen();
  if (!home?.mountTrailerLayer || !source || !parent) return null;
  const isYoutube = source.kind === "youtube";
  const prepared = applyTrailerAudioPreferences(source, {
    focusedPosterBackdropTrailerMuted: muted
  });
  if (!prepared) return null;
  const layer = document.createElement("div");
  layer.className = "home-poster-trailer-layer nf-xp-trailer";
  parent.insertBefore(layer, beforeNode && beforeNode.parentNode === parent ? beforeNode : null);
  if (isYoutube) {
    const customEmbed =
      muted || customFailures >= CUSTOM_FAILURE_LIMIT ? "" : buildTrailerProxyEmbed(source.ytId);
    const mountStandard = () => {
      guardAds(layer, { muted, volumeControl: false, onReady, onFail });
      home.mountTrailerLayer.call(home, layer, prepared, () => {});
      coverFrame(layer);
    };
    if (!customEmbed) {
      mountStandard();
      return layer;
    }
    guardAds(layer, {
      muted,
      volumeControl: true,
      waitMs: CUSTOM_WAIT_MS,
      onReady: () => {
        customFailures = 0;
        onReady?.();
      },
      onFail: () => {
        customFailures += 1;
        if (!layer.isConnected) return;
        try {
          home.clearTrailerLayer?.call(home, layer);
        } catch (_) {}
        mountStandard();
      }
    });
    home.mountTrailerLayer.call(
      home,
      layer,
      { ...prepared, embedUrl: customEmbed, muted: false },
      () => {}
    );
    coverFrame(layer);
  } else {
    home.mountTrailerLayer.call(home, layer, prepared, () => {
      layer.classList.add("nf-trailer-on");
      onReady?.();
    });
  }
  return layer;
}

export function clearNuvioTrailer(layer) {
  if (!layer) return;
  stopGuard(layer);
  const home = homeScreen();
  try {
    home?.clearTrailerLayer?.call(home, layer);
  } catch (_) {}
  layer.remove();
}

function silenceVideo(video) {
  try {
    video.pause();
  } catch (_) {}
  try {
    video.removeAttribute("src");
    Array.from(video.querySelectorAll("source")).forEach((source) => source.remove());
    video.load();
  } catch (_) {}
}

export function releaseBackgroundMedia(keep) {
  const detail = Router.routes?.detail;
  if (detail?.isTrailerPlaying) {
    try {
      detail.stopTrailerPlayback?.({
        keepDom: false,
        restartAutoplay: false,
        restoreFocus: false,
        immediateClear: true
      });
    } catch (_) {}
  }
  if (detail?.trailerAutoplayTimer) {
    clearTimeout(detail.trailerAutoplayTimer);
    detail.trailerAutoplayTimer = null;
  }
  const home = homeScreen();
  Array.from(document.querySelectorAll(".home-poster-trailer-layer")).forEach((layer) => {
    if (keep?.contains(layer)) return;
    stopGuard(layer);
    try {
      home?.clearTrailerLayer?.call(home, layer);
    } catch (_) {}
  });
  Array.from(document.querySelectorAll("video, audio")).forEach((media) => {
    if (keep?.contains(media)) return;
    silenceVideo(media);
  });
  Array.from(document.querySelectorAll("iframe")).forEach((frame) => {
    if (keep?.contains(frame)) return;
    const src = String(frame.getAttribute("src") || "");
    if (
      !/youtube|nf-youtube-proxy|trailer/i.test(src) &&
      !frame.closest(".home-poster-trailer-layer, [class*='trailer']")
    )
      return;
    try {
      frame.src = "about:blank";
    } catch (_) {}
    frame.remove();
  });
}
