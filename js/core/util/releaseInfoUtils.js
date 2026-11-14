const YEAR_REGEX = /\b(19|20)\d{2}\b/;

function episodeReleaseAired(raw, nowMs) {
  const releaseMs = parseReleaseInstant(raw);
  if (releaseMs == null) {
    return null;
  }
  return releaseMs <= nowMs;
}

function parseReleaseInstant(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const exact = Date.parse(value);
    if (Number.isFinite(exact)) {
      return exact;
    }
  }
  const datePortion = (value.match(/\b\d{4}-\d{2}-\d{2}\b/) || [])[0];
  const dateMs = datePortion ? Date.parse(datePortion) : NaN;
  return Number.isFinite(dateMs) ? dateMs : null;
}

export function isUnreleased(item, nowMs = Date.now(), todayYear = new Date(nowMs).getFullYear()) {
  const released = String(item?.released || "").trim();
  if (released) {
    const aired = episodeReleaseAired(released, nowMs);
    if (aired != null) {
      return !aired;
    }
  }

  const info = item?.releaseInfo;
  if (info == null) {
    return false;
  }
  const infoText = String(info).trim();
  const airedFromInfo = episodeReleaseAired(infoText, nowMs);
  if (airedFromInfo != null) {
    return !airedFromInfo;
  }
  const yearMatch = YEAR_REGEX.exec(infoText);
  if (!yearMatch) {
    return false;
  }
  const year = Number.parseInt(yearMatch[0], 10);
  if (!Number.isFinite(year)) {
    return false;
  }
  return year > todayYear;
}

export function filterReleasedItems(
  items,
  nowMs = Date.now(),
  todayYear = new Date(nowMs).getFullYear()
) {
  if (!Array.isArray(items)) {
    return items;
  }
  const filtered = items.filter((item) => !isUnreleased(item, nowMs, todayYear));
  return filtered.length === items.length ? items : filtered;
}

export function hasNoReleaseInfo(item) {
  return isBlank(item?.released) && isBlank(item?.releaseInfo);
}

function isBlank(value) {
  return value == null || String(value).trim() === "";
}
