const ENDPOINT = "https://graphql.imdb.com/";
const TIMEOUT_MS = 7000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map();
const pending = new Map();

function post(body) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", ENDPOINT, true);
    xhr.timeout = TIMEOUT_MS;
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch (_) {
        resolve(null);
      }
    };
    xhr.onerror = () => resolve(null);
    xhr.ontimeout = () => resolve(null);
    xhr.send(JSON.stringify(body));
  });
}

function heightOf(entry) {
  const label = String(entry?.displayName?.value || entry?.videoDefinition || "");
  const match = label.match(/(\d{3,4})/);
  if (match) return Number(match[1]);
  return /sd/i.test(label) ? 480 : 0;
}

function pickUrl(videos, maxHeight) {
  for (const video of videos) {
    const urls = (Array.isArray(video?.playbackURLs) ? video.playbackURLs : []).filter(
      (entry) => entry?.url && /mp4/i.test(String(entry.videoMimeType || entry.mimeType || ""))
    );
    if (!urls.length) continue;
    const sorted = urls.slice().sort((a, b) => heightOf(b) - heightOf(a));
    const fitting = sorted.find((entry) => heightOf(entry) && heightOf(entry) <= maxHeight);
    return (fitting || sorted[sorted.length - 1]).url;
  }
  return "";
}

function imdbIdOf(item) {
  const candidates = [item?.imdbId, item?.imdb_id, item?.id, item?.contentId];
  for (const value of candidates) {
    const match = String(value || "").match(/tt\d{5,}/);
    if (match) return match[0];
  }
  return "";
}

async function fetchTrailer(imdbId, maxHeight) {
  const query = `query { title(id: "${imdbId}") { primaryVideos(first: 4) { edges { node { contentType { id } playbackURLs { displayName { value } videoMimeType url } } } } } }`;
  const data = await post({ query });
  const edges = data?.data?.title?.primaryVideos?.edges || [];
  const nodes = edges.map((edge) => edge?.node).filter(Boolean);
  const trailers = nodes.filter((node) => /trailer/i.test(String(node?.contentType?.id || "")));
  const url = pickUrl(trailers.length ? trailers : nodes, maxHeight);
  return url ? { kind: "mp4", url, withAudio: true, imdb: true } : null;
}

export function resolveImdbTrailer(item, { maxHeight = 720 } = {}) {
  const imdbId = imdbIdOf(item);
  if (!imdbId) return Promise.resolve(null);
  const key = `${imdbId}:${maxHeight}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return Promise.resolve(cached.value);
  if (pending.has(key)) return pending.get(key);
  const promise = fetchTrailer(imdbId, maxHeight)
    .catch(() => null)
    .then((value) => {
      pending.delete(key);
      cache.set(key, { at: Date.now(), value });
      return value;
    });
  pending.set(key, promise);
  return promise;
}
