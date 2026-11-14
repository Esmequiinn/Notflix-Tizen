import { isNotflixActive } from "./notflixAppearance.js";
import { getNotflixOptions } from "./notflixOptions.js";

const MAX_INTRO_MS = 6000;

export function playNotflixIntro() {
  if (!isNotflixActive() || !globalThis.document?.body) return;
  const options = getNotflixOptions();
  if (!options.introEnabled) return;
  const overlay = document.createElement("div");
  overlay.className = "nf-intro";
  const video = document.createElement("video");
  video.className = "nf-intro-video";
  video.src = "assets/notflix/notflix-intro.mp4";
  video.autoplay = true;
  video.muted = !options.introSound;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  overlay.appendChild(video);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    document.removeEventListener("keydown", onKey, true);
    try {
      video.pause();
      video.removeAttribute("src");
      video.load();
    } catch (_) {}
    overlay.remove();
  };
  const onKey = (event) => {
    event.stopPropagation();
    event.preventDefault();
    finish();
  };
  const timer = setTimeout(finish, MAX_INTRO_MS);
  video.addEventListener("ended", finish);
  video.addEventListener("error", finish);
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(overlay);
  const started = video.play?.();
  if (started && typeof started.catch === "function") started.catch(finish);
}
