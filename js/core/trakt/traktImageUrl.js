const TRAKT_HOST_PATTERN = /^[a-z0-9.-]*trakt\.tv\//i;

export function toTraktImageUrl(value) {
  const normalized = String(value || "").trim();
  if (/^https:\/\//i.test(normalized)) {
    return normalized;
  }
  if (/^http:\/\//i.test(normalized)) {
    return `https://${normalized.slice(normalized.indexOf("://") + 3)}`;
  }
  if (normalized.startsWith("//")) {
    return `https:${normalized}`;
  }
  if (TRAKT_HOST_PATTERN.test(normalized)) {
    return `https://${normalized}`;
  }
  return normalized;
}
