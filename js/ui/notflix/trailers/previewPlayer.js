let session = null;
let token = 0;

function startVideo(host, source, current, onPlaying, onFail) {
  const video = document.createElement("video");
  video.className = "nf-preview-video";
  video.muted = !source.withAudio;
  video.autoplay = true;
  video.loop = current.loop;
  video.addEventListener("ended", () => {
    if (session === current && !current.loop) current.onEnded();
  });
  video.playsInline = true;
  video.src = source.url;
  video.addEventListener("playing", () => {
    if (session === current && !current.playing) {
      current.playing = true;
      onPlaying();
    }
  });
  video.addEventListener("error", () => {
    if (session === current) onFail();
  });
  host.appendChild(video);
  current.cleanup = () => {
    try {
      video.pause();
      video.removeAttribute("src");
      video.load();
    } catch (_) {}
    video.remove();
  };
  const started = video.play?.();
  if (started && typeof started.catch === "function") started.catch(() => {});
}

export function canUseHardwarePreview() {
  return true;
}

export function startPreview(
  host,
  source,
  { onPlaying = () => {}, onFail = () => {}, onEnded = () => {}, loop = true, muted = false } = {}
) {
  stopPreview();
  if (!host || !source?.url) return null;
  token += 1;
  const current = { id: token, host, playing: false, cleanup: null, loop, onEnded: () => {} };
  session = current;
  current.onEnded = () => {
    if (session !== current) return;
    stopPreview();
    onEnded();
  };
  const fail = () => {
    if (session !== current) return;
    stopPreview();
    onFail();
  };
  startVideo(host, muted ? { ...source, withAudio: false } : source, current, onPlaying, fail);
  return current.id;
}

export function stopPreview() {
  const current = session;
  session = null;
  if (current?.cleanup) {
    try {
      current.cleanup();
    } catch (_) {}
  }
}

export function isPreviewActive() {
  return Boolean(session);
}

if (globalThis.document?.addEventListener) {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopPreview();
  });
}
