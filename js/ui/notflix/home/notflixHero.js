import { Router } from "../../navigation/routerState.js";
import { getHeroRotationMs, getNotflixOptions, getTrailerIdleMs } from "../notflixOptions.js";
import { stopPreview } from "../trailers/previewPlayer.js";
import { playTrailerChain } from "../trailers/trailerChain.js";
import { clearNuvioTrailer, mountNuvioTrailer } from "../trailers/nuvioTrailer.js";
import { localizedDetails } from "./notflixLocalize.js";

function heroCard(screen) {
  return screen.container?.querySelector(".home-hero-card") || null;
}

function heroFocused(screen) {
  return Boolean(heroCard(screen)?.classList.contains("focused"));
}

function onHome() {
  return Router.getCurrent?.() === "home";
}

export function stopHeroTrailer(screen) {
  screen.nfHeroTrailerToken = (screen.nfHeroTrailerToken || 0) + 1;
  if (screen.nfHeroTrailerTimer) {
    clearTimeout(screen.nfHeroTrailerTimer);
    screen.nfHeroTrailerTimer = null;
  }
  if (screen.nfHeroTrailerHost) {
    stopPreview();
    clearNuvioTrailer(screen.nfHeroTrailerHost);
    screen.nfHeroTrailerHost = null;
  }
  heroCard(screen)?.classList.remove("nf-hero-previewing");
}

function clearRotation(screen) {
  if (screen.nfHeroRotateTimer) {
    clearTimeout(screen.nfHeroRotateTimer);
    screen.nfHeroRotateTimer = null;
  }
}

function scheduleRotation(screen) {
  clearRotation(screen);
  const interval = getHeroRotationMs();
  if (!interval || (screen.heroCandidates?.length || 0) < 2) return;
  screen.nfHeroRotateTimer = setTimeout(() => {
    screen.nfHeroRotateTimer = null;
    if (!onHome() || screen.nfHeroTrailerHost || screen.nfExpandedCard) {
      scheduleRotation(screen);
      return;
    }
    const token = (screen.nfHeroPrepToken || 0) + 1;
    screen.nfHeroPrepToken = token;
    void prepareNextHero(screen).then(() => {
      if (token !== screen.nfHeroPrepToken) return;
      if (!onHome() || screen.nfHeroTrailerHost || screen.nfExpandedCard) {
        scheduleRotation(screen);
        return;
      }
      screen.rotateHero?.(1);
      scheduleHeroIdle(screen);
    });
  }, interval);
}

function preloadImage(url) {
  if (!url) return Promise.resolve();
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = url;
  });
}

function prepareNextHero(screen) {
  const candidates = Array.isArray(screen.heroCandidates) ? screen.heroCandidates : [];
  if (candidates.length < 2) return Promise.resolve();
  const index = (Math.max(0, Number(screen.heroIndex || 0)) + 1) % candidates.length;
  const item = candidates[index];
  if (!item?.id) return Promise.resolve();
  const localize = item.nfLocalized
    ? Promise.resolve(item)
    : localizedDetails(item)
        .then((details) => {
          if (!details) return item;
          const merged = { ...item, ...details, nfLocalized: true };
          const position = candidates.findIndex(
            (candidate) => String(candidate?.id || "") === String(item.id)
          );
          if (position >= 0) candidates[position] = merged;
          return merged;
        })
        .catch(() => item);
  const work = localize.then((ready) =>
    Promise.all([
      preloadImage(ready?.logo),
      preloadImage(ready?.background || ready?.backdrop || "")
    ])
  );
  return Promise.race([work, new Promise((resolve) => setTimeout(resolve, 2500))]);
}

async function startHeroTrailer(screen, token) {
  const item = screen.heroItem;
  const card = heroCard(screen);
  if (!item || !card || typeof screen.getTrailerSourceForItem !== "function") return;
  const source = await screen.getTrailerSourceForItem(item).catch(() => null);
  if (token !== screen.nfHeroTrailerToken || !heroFocused(screen) || !onHome()) return;
  const options = getNotflixOptions();
  clearRotation(screen);
  if (source) {
    const layer = mountNuvioTrailer(card, card.firstChild, source, {
      muted: !options.previewSound,
      onReady: () => {
        if (token === screen.nfHeroTrailerToken) card.classList.add("nf-hero-previewing");
      },
      onFail: () => {
        if (token !== screen.nfHeroTrailerToken) return;
        stopHeroTrailer(screen);
        scheduleRotation(screen);
      }
    });
    if (layer) {
      layer.classList.add("nf-bb-trailer");
      screen.nfHeroTrailerHost = layer;
      screen.nfHeroTrailerTimer = setTimeout(() => {
        screen.nfHeroTrailerTimer = null;
        if (token !== screen.nfHeroTrailerToken) return;
        stopHeroTrailer(screen);
        if (getHeroRotationMs()) screen.rotateHero?.(1);
        scheduleHeroIdle(screen);
      }, 90000);
      return;
    }
  }
  const host = document.createElement("div");
  host.className = "nf-bb-trailer";
  card.insertBefore(host, card.firstChild);
  screen.nfHeroTrailerHost = host;
  const alive = () => token === screen.nfHeroTrailerToken && screen.nfHeroTrailerHost === host;
  playTrailerChain(host, item, source, {
    maxHeight: 720,
    withAudio: options.previewSound,
    loop: false,
    alive,
    onPlaying: () => card.classList.add("nf-hero-previewing"),
    onFail: () => {
      stopHeroTrailer(screen);
      scheduleRotation(screen);
    },
    onEnded: () => {
      stopHeroTrailer(screen);
      if (getHeroRotationMs()) {
        screen.rotateHero?.(1);
      }
      scheduleHeroIdle(screen);
    }
  });
}

export function scheduleHeroIdle(screen) {
  scheduleRotation(screen);
  if (screen.nfHeroTrailerTimer) {
    clearTimeout(screen.nfHeroTrailerTimer);
    screen.nfHeroTrailerTimer = null;
  }
  const options = getNotflixOptions();
  if (!options.previewEnabled || !options.heroTrailer || options.homeMotion === "reduced") return;
  const token = screen.nfHeroTrailerToken || 0;
  screen.nfHeroTrailerTimer = setTimeout(() => {
    screen.nfHeroTrailerTimer = null;
    if (
      token !== screen.nfHeroTrailerToken ||
      !heroFocused(screen) ||
      !onHome() ||
      screen.nfHeroTrailerHost
    )
      return;
    void startHeroTrailer(screen, token);
  }, getTrailerIdleMs(options));
}

export function noteHeroActivity(screen) {
  stopHeroTrailer(screen);
  scheduleHeroIdle(screen);
}

export function stopHeroLoop(screen) {
  stopHeroTrailer(screen);
  clearRotation(screen);
}

export function localizeHero(screen, onChange) {
  const item = screen.heroItem;
  if (!item?.id || item.nfLocalized) return;
  const id = item.id;
  void localizedDetails(item).then((details) => {
    if (!details || String(screen.heroItem?.id || "") !== String(id)) return;
    const merged = { ...screen.heroItem, ...details, nfLocalized: true };
    screen.heroItem = merged;
    const index = (screen.heroCandidates || []).findIndex(
      (candidate) => String(candidate?.id || "") === String(id)
    );
    if (index >= 0) screen.heroCandidates[index] = merged;
    onChange();
  });
}
