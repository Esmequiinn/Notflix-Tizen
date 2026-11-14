export function toCurrentCncVerseHlsUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) {
    return null;
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    return null;
  }
  if (
    !/\/d\/master\.m3u8$/i.test(parsed.pathname) ||
    !parsed.searchParams.get("d") ||
    !parsed.searchParams.get("h_x_cnc_plugin")
  ) {
    return null;
  }
  parsed.pathname = parsed.pathname.replace(/\/d\/master\.m3u8$/i, "/proxy/mpd/manifest.m3u8");
  return parsed.toString();
}
