const MAX_ENTRIES = 80;
const cache = new Map();

export function preloadImage(url) {
  const src = String(url || "").trim();
  if (!src) return Promise.resolve(false);
  if (cache.has(src)) return cache.get(src);
  const promise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const decoded = typeof image.decode === "function" ? image.decode().catch(() => {}) : null;
      Promise.resolve(decoded).then(() => resolve(true));
    };
    image.onerror = () => resolve(false);
    image.src = src;
  });
  cache.set(src, promise);
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
  return promise;
}

export function waitForImage(url, timeoutMs) {
  if (!url) return Promise.resolve(false);
  return Promise.race([
    preloadImage(url),
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs))
  ]);
}

const TMDB_SIZED = /(image\.tmdb\.org\/t\/p\/)(original|w1920|w1280)\//;

export function sizedImage(url, size) {
  const value = String(url || "");
  return TMDB_SIZED.test(value) ? value.replace(TMDB_SIZED, `$1${size}/`) : value;
}

export function backdropOf(item) {
  return sizedImage(
    item?.background || item?.backdrop || item?.landscapePoster || item?.poster || "",
    "w780"
  );
}

export function cardLogoOf(item) {
  return sizedImage(item?.logo || "", "w500");
}
