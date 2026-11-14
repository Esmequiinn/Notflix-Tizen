import { stripAssSubtitleSdh } from "./subtitleSdhFilter.js";
import { loadAssSubtitleLib } from "./assSubtitleLoader.js";

function clearContainer(container) {
  if (!container) {
    return;
  }
  try {
    if (typeof container.replaceChildren === "function") {
      container.replaceChildren();
    } else {
      container.innerHTML = "";
    }
  } catch (_) {}
}

function debugAssRender(stage, details = {}) {
  if (!globalThis.__NUVIO_DEBUG_ASS__) {
    return;
  }
  try {
    console.info(`[Nuvio ASS] ${stage}`, details);
  } catch (_) {}
}

function hasRawAssControlText(container) {
  const text = String(container?.textContent || "");
  return (
    /(?:^|\n)\s*(?:Dialogue|Comment)\s*:\s*(?:\d+|Marked\s*=\s*\d+)\s*,\s*\d+:\d{1,2}:\d{1,2}[.,]/i.test(
      text
    ) || /(?:^|\n)\s*\d+\s*,\s*\d+\s*,\s*(?:Onscreen\d*|Screen)\s*,/i.test(text)
  );
}

export function createAssRenderer({
  body,
  stripSdh = false,
  video,
  container,
  selectionToken,
  isCurrentSelection,
  resampling = "video_height",
  forceRafFrameLoop = false,
  forcePlaybackFrameLoopKick = false
}) {
  if (!body || !video || !container) {
    return { ok: false, error: "ass-renderer-missing-arguments" };
  }
  const token = Number(selectionToken || 0);
  const stale = () => (typeof isCurrentSelection === "function" ? !isCurrentSelection() : false);

  let instance = null;
  let destroyed = false;

  return {
    sourceBody: body,
    stripSdh: Boolean(stripSdh),
    get supportsPlacement() {
      return Boolean(
        instance && !destroyed && !stale() && typeof instance.setSubtitlePlacement === "function"
      );
    },
    get active() {
      return !destroyed && !stale();
    },
    async init() {
      if (destroyed) {
        return { ok: false, error: "ass-renderer-destroyed" };
      }
      let AssConstructor;
      try {
        AssConstructor = await loadAssSubtitleLib();
      } catch (error) {
        return {
          ok: false,
          error: "ass-renderer-load-failed",
          detail: error?.message || String(error || "")
        };
      }
      if (typeof AssConstructor !== "function") {
        return {
          ok: false,
          error: "ass-renderer-load-failed",
          detail: "ass.js global ASS is not a constructor"
        };
      }
      if (destroyed || stale()) {
        return { ok: false, error: "ass-renderer-stale" };
      }
      if (typeof globalThis.ResizeObserver !== "function") {
        return {
          ok: false,
          error: "ass-renderer-unsupported",
          detail: "ass.js requires ResizeObserver"
        };
      }
      try {
        const sourceBody = String(stripSdh ? stripAssSubtitleSdh(body) : body)
          .replace(/^\uFEFF/, "")
          .replace(/\0/g, "");
        const hasEvents = /^\s*\[Events\]\s*$/im.test(sourceBody);
        const dialogueCount = (sourceBody.match(/^\s*Dialogue\s*:/gim) || []).length;
        debugAssRender("construct", {
          token,
          length: sourceBody.length,
          hasEvents,
          dialogueCount
        });
        if (!hasEvents || !dialogueCount) {
          clearContainer(container);
          return {
            ok: false,
            error: "ass-renderer-empty-script",
            detail: "ASS body lacks an [Events] section with Dialogue rows"
          };
        }
        const shadowRvfc =
          forceRafFrameLoop &&
          typeof video.requestVideoFrameCallback === "function" &&
          !Object.prototype.hasOwnProperty.call(video, "requestVideoFrameCallback");
        if (shadowRvfc) {
          video.requestVideoFrameCallback = undefined;
        }
        try {
          instance = new AssConstructor(sourceBody, video, { container, resampling });
        } finally {
          if (shadowRvfc) {
            delete video.requestVideoFrameCallback;
          }
        }
        debugAssRender("constructed", {
          token,
          childCount: Number(container.childNodes?.length || 0),
          text: String(container.textContent || "").slice(0, 240)
        });
        if (hasRawAssControlText(container)) {
          instance.destroy?.();
          instance = null;
          clearContainer(container);
          return {
            ok: false,
            error: "ass-renderer-raw-control-text",
            detail: "ass.js exposed ASS control fields as visible text"
          };
        }
        const shouldKickPlaybackFrameLoop =
          typeof video.dispatchEvent === "function" &&
          (forcePlaybackFrameLoopKick || (typeof video.paused === "boolean" && !video.paused));
        if (shouldKickPlaybackFrameLoop) {
          try {
            let event = null;
            if (typeof Event === "function") {
              event = new Event("play");
            } else if (typeof document !== "undefined" && document.createEvent) {
              event = document.createEvent("Event");
              event.initEvent("play", false, false);
            }
            if (event) {
              video.dispatchEvent(event);
            }
          } catch (_) {}
        }
      } catch (error) {
        instance = null;
        clearContainer(container);
        return {
          ok: false,
          error: "ass-renderer-parse-failed",
          detail: error?.message || String(error || "")
        };
      }
      if (destroyed || stale()) {
        this.destroy();
        return { ok: false, error: "ass-renderer-stale" };
      }
      return { ok: true };
    },
    setDelay(delayMs) {
      if (!instance || destroyed || stale()) {
        return false;
      }
      try {
        instance.delay = Number(delayMs || 0) / 1000;
        return true;
      } catch (_) {
        return false;
      }
    },
    setPlacement(placement) {
      if (!instance || destroyed || stale() || typeof instance.setSubtitlePlacement !== "function")
        return false;
      try {
        instance.setSubtitlePlacement(placement);
        return true;
      } catch (_) {
        return false;
      }
    },
    show() {
      if (!instance || destroyed || stale()) {
        return;
      }
      try {
        instance.show();
      } catch (_) {}
    },
    hide() {
      if (!instance || destroyed) {
        return;
      }
      try {
        instance.hide();
      } catch (_) {}
    },
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      if (instance) {
        try {
          instance.destroy();
        } catch (_) {}
        instance = null;
      }
      clearContainer(container);
    },
    get token() {
      return token;
    }
  };
}
