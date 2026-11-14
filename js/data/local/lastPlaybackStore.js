import { LocalStore } from "../../core/storage/localStore.js";

const KEY = "lastPlaybackStream";

function normalizeHeaders(value) {
  if (!value || typeof value !== "object") {
    return {};
  }
  const headers = {};
  Object.keys(value).forEach((name) => {
    const headerValue = value[name];
    if (headerValue != null && String(headerValue).trim()) {
      headers[String(name)] = String(headerValue);
    }
  });
  return headers;
}

export const LastPlaybackStore = {
  get() {
    const value = LocalStore.get(KEY, null);
    const url = String(value?.url || "").trim();
    if (!url) {
      return null;
    }
    return {
      url,
      headers: normalizeHeaders(value?.headers),
      savedAt: Number(value?.savedAt) || 0
    };
  },

  remember({ url, headers } = {}) {
    const normalizedUrl = String(url || "").trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      return null;
    }
    const previous = this.get();
    const next = {
      url: normalizedUrl,
      headers: normalizeHeaders(headers),
      savedAt: Date.now()
    };
    if (previous && previous.url === next.url && JSON.stringify(previous.headers) === JSON.stringify(next.headers)) {
      return previous;
    }
    LocalStore.set(KEY, next);
    return next;
  }
};
