const FALLBACK_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const CONFIG_TTL_MS = 60 * 60 * 1000;
const FALLBACK_CONFIG_TTL_MS = 5 * 60 * 1000;
const SOURCE_TTL_MS = 60 * 60 * 1000;
const RATE_LIMIT_BACKOFF_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

const CLIENTS = [
  {
    key: "visionos",
    id: "101",
    version: "1.02",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
    context: {
      clientName: "VISIONOS",
      clientVersion: "1.02",
      deviceMake: "Apple",
      deviceModel: "RealityDevice17,1",
      osName: "visionOS",
      osVersion: "26.5.23O471",
      hl: "en",
      gl: "US"
    }
  },
  {
    key: "ios",
    id: "5",
    version: "20.10.1",
    userAgent: "com.google.ios.youtube/20.10.1 (iPhone16,2; U; CPU iOS 17_4 like Mac OS X)",
    context: {
      clientName: "IOS",
      clientVersion: "20.10.1",
      deviceModel: "iPhone16,2",
      osName: "iPhone",
      osVersion: "17.4.0.21E219",
      platform: "MOBILE",
      hl: "en",
      gl: "US"
    }
  },
  {
    key: "android",
    id: "3",
    version: "20.10.35",
    userAgent: "com.google.android.youtube/20.10.35 (Linux; U; Android 14; en_US) gzip",
    context: {
      clientName: "ANDROID",
      clientVersion: "20.10.35",
      osName: "Android",
      osVersion: "14",
      platform: "MOBILE",
      androidSdkVersion: 34,
      hl: "en",
      gl: "US"
    }
  }
];

let cachedConfig = null;
let configPromise = null;
let blockedUntil = 0;
const sourceCache = new Map();
const pending = new Map();

class RateLimitedError extends Error {}

function request(
  url,
  { method = "GET", headers = {}, body = null, timeout = REQUEST_TIMEOUT_MS } = {}
) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.timeout = timeout;
    Object.keys(headers).forEach((name) => {
      try {
        xhr.setRequestHeader(name, headers[name]);
      } catch (_) {}
    });
    xhr.onload = () =>
      resolve({
        status: xhr.status,
        ok: xhr.status >= 200 && xhr.status < 300,
        body: xhr.responseText || ""
      });
    xhr.onerror = () => reject(new Error("network"));
    xhr.ontimeout = () => reject(new Error("timeout"));
    xhr.send(body);
  });
}

async function watchConfig(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedConfig && now - cachedConfig.fetchedAt < cachedConfig.ttl)
    return cachedConfig;
  if (configPromise) return configPromise;
  configPromise = (async () => {
    try {
      const response = await request("https://www.youtube.com/watch?v=dQw4w9WgXcQ&hl=en");
      if (response.status === 429) throw new RateLimitedError("watch");
      if (!response.ok) throw new Error(`watch ${response.status}`);
      const apiKey =
        (response.body.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1] || FALLBACK_API_KEY;
      const visitorData = (response.body.match(/"VISITOR_DATA":"([^"]+)"/) || [])[1] || "";
      cachedConfig = { apiKey, visitorData, fetchedAt: Date.now(), ttl: CONFIG_TTL_MS };
    } catch (error) {
      if (error instanceof RateLimitedError) throw error;
      cachedConfig = cachedConfig || {
        apiKey: FALLBACK_API_KEY,
        visitorData: "",
        fetchedAt: Date.now(),
        ttl: FALLBACK_CONFIG_TTL_MS
      };
    } finally {
      configPromise = null;
    }
    return cachedConfig;
  })();
  return configPromise;
}

async function playerResponse(videoId, client, config) {
  const headers = {
    "Content-Type": "application/json",
    "X-YouTube-Client-Name": client.id,
    "X-YouTube-Client-Version": client.version
  };
  if (config.visitorData) headers["X-Goog-Visitor-Id"] = config.visitorData;
  const body = JSON.stringify({
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
    context: { client: client.context },
    playbackContext: { contentPlaybackContext: { html5Preference: "HTML5_PREF_WANTS" } }
  });
  const response = await request(
    `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(config.apiKey)}`,
    {
      method: "POST",
      headers,
      body
    }
  );
  if (response.status === 429) throw new RateLimitedError("player");
  if (!response.ok) throw new Error(`player ${response.status}`);
  return JSON.parse(response.body || "{}");
}

function parseAttributes(line) {
  const raw = line.slice(line.indexOf(":") + 1);
  const out = {};
  const pattern = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
  let match = pattern.exec(raw);
  while (match) {
    out[match[1]] = match[2].replace(/^"|"$/g, "");
    match = pattern.exec(raw);
  }
  return out;
}

function absolutize(base, value) {
  try {
    return new URL(value, base).toString();
  } catch (_) {
    return value;
  }
}

async function pickVariant(manifestUrl, maxHeight) {
  const response = await request(manifestUrl);
  if (!response.ok) return null;
  const lines = response.body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const variants = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith("#EXT-X-STREAM-INF:")) continue;
    const next = lines[index + 1];
    if (!next || next.startsWith("#")) continue;
    const attrs = parseAttributes(lines[index]);
    const height = Number(String(attrs.RESOLUTION || "").split("x")[1] || 0);
    const codecs = String(attrs.CODECS || "");
    if (/vp09|av01|hev1|hvc1/i.test(codecs)) continue;
    variants.push({
      url: absolutize(manifestUrl, next),
      height,
      bandwidth: Number(attrs.BANDWIDTH || 0)
    });
  }
  if (!variants.length) return null;
  const fitting = variants.filter((variant) => variant.height > 0 && variant.height <= maxHeight);
  const pool = fitting.length ? fitting : variants;
  pool.sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth);
  return fitting.length ? pool[0] : pool[pool.length - 1];
}

function progressiveFrom(streamingData) {
  const formats = Array.isArray(streamingData?.formats) ? streamingData.formats : [];
  return formats
    .filter(
      (format) =>
        format.url &&
        /video\/mp4/.test(String(format.mimeType || "")) &&
        /avc1/.test(String(format.mimeType || ""))
    )
    .sort((a, b) => Number(b.height || 0) - Number(a.height || 0))[0];
}

async function extract(videoId, { maxHeight, withAudio }) {
  if (Date.now() < blockedUntil) return null;
  let config = await watchConfig();
  let loginRequired = 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (const client of CLIENTS) {
      let response;
      try {
        response = await playerResponse(videoId, client, config);
      } catch (error) {
        if (error instanceof RateLimitedError) {
          blockedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
          return null;
        }
        continue;
      }
      const status = String(response?.playabilityStatus?.status || "");
      if (status === "LOGIN_REQUIRED") {
        const reason = String(response?.playabilityStatus?.reason || "");
        if (/\bbot\b/i.test(reason)) {
          blockedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
          return null;
        }
        loginRequired += 1;
        continue;
      }
      if (status && status !== "OK") continue;
      const streamingData = response?.streamingData;
      if (!streamingData) continue;
      if (streamingData.hlsManifestUrl) {
        if (withAudio)
          return {
            kind: "hls",
            url: streamingData.hlsManifestUrl,
            client: client.key,
            userAgent: client.userAgent,
            withAudio: true
          };
        const variant = await pickVariant(streamingData.hlsManifestUrl, maxHeight).catch(
          () => null
        );
        if (variant)
          return {
            kind: "hls",
            url: variant.url,
            client: client.key,
            userAgent: client.userAgent,
            withAudio: false
          };
        return {
          kind: "hls",
          url: streamingData.hlsManifestUrl,
          client: client.key,
          userAgent: client.userAgent,
          withAudio: true
        };
      }
      const progressive = progressiveFrom(streamingData);
      if (progressive)
        return {
          kind: "mp4",
          url: progressive.url,
          client: client.key,
          userAgent: client.userAgent,
          withAudio: true
        };
    }
    if (loginRequired < CLIENTS.length) break;
    config = await watchConfig(true);
    loginRequired = 0;
  }
  return null;
}

export function resolveYoutubeDirect(videoId, { maxHeight = 480, withAudio = false } = {}) {
  const id = String(videoId || "").trim();
  if (!id) return Promise.resolve(null);
  const key = `${id}|${maxHeight}|${withAudio ? 1 : 0}`;
  const cached = sourceCache.get(key);
  if (cached && Date.now() - cached.at < SOURCE_TTL_MS) return Promise.resolve(cached.source);
  if (pending.has(key)) return pending.get(key);
  const promise = extract(id, { maxHeight, withAudio })
    .catch(() => null)
    .then((source) => {
      pending.delete(key);
      if (source) {
        sourceCache.set(key, { source, at: Date.now() });
        while (sourceCache.size > 40) sourceCache.delete(sourceCache.keys().next().value);
      }
      return source;
    });
  pending.set(key, promise);
  return promise;
}

export async function toDirectTrailerSource(source, { maxHeight = 720, withAudio = true } = {}) {
  if (!source || source.kind !== "youtube" || !source.ytId) return source;
  const direct = await resolveYoutubeDirect(source.ytId, { maxHeight, withAudio });
  if (!direct?.url) return source;
  return { ...source, kind: "video", url: direct.url, direct: true };
}
