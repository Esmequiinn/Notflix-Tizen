export function resolveMovieStreamIdentity(meta = {}, params = {}) {
  const itemId = String(params?.itemId || meta?.id || "").trim() || null;
  const videoId = String(meta?.id || itemId || "").trim() || null;

  return { itemId, videoId };
}
