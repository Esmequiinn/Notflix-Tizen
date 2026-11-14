function normalizeCardStyle(cardStyle) {
  const normalized = String(cardStyle || "card")
    .trim()
    .toLowerCase();
  return ["card", "wide", "poster"].includes(normalized) ? normalized : "card";
}

export function continueWatchingUsesEpisodeThumbnails(cardStyle, useEpisodeThumbnails) {
  return useEpisodeThumbnails !== false && normalizeCardStyle(cardStyle) !== "poster";
}

export function continueWatchingImageSources(art = {}, options = {}) {
  const { poster, backdrop, thumbnail, episodeThumbnail } = art;
  const cardStyle = normalizeCardStyle(options.cardStyle);
  const useEpisodeThumbnails = continueWatchingUsesEpisodeThumbnails(
    cardStyle,
    options.useEpisodeThumbnails
  );
  const useEpisodeArtwork = useEpisodeThumbnails && options.isSeries !== false;
  const preferPosterArtwork = cardStyle !== "card";
  const isNextUp = Boolean(options.isNextUp);
  const hasAired = options.hasAired !== false;

  if (preferPosterArtwork) {
    if (useEpisodeArtwork) {
      return [isNextUp ? thumbnail : episodeThumbnail, poster, backdrop];
    }
    return [poster, backdrop];
  }

  if (isNextUp && !hasAired) {
    return [backdrop, poster, ...(useEpisodeArtwork ? [thumbnail] : [])];
  }
  if (isNextUp && useEpisodeArtwork) {
    return [thumbnail, backdrop, poster];
  }
  if (useEpisodeArtwork) {
    return [episodeThumbnail, backdrop, poster];
  }

  return [backdrop, poster];
}
