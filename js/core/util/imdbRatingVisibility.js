export const HOME_IMDB_RATINGS_VISIBILITY = {
  SHOW_ALL: "SHOW_ALL",
  HIDE_ALL: "HIDE_ALL"
};

export const DETAIL_IMDB_RATINGS_VISIBILITY = {
  SHOW_ALL: "SHOW_ALL",
  HIDE_EPISODES: "HIDE_EPISODES",
  HIDE_UNWATCHED_EPISODES: "HIDE_UNWATCHED_EPISODES"
};

export function normalizeHomeImdbRatingsVisibility(value) {
  return value === HOME_IMDB_RATINGS_VISIBILITY.HIDE_ALL
    ? HOME_IMDB_RATINGS_VISIBILITY.HIDE_ALL
    : HOME_IMDB_RATINGS_VISIBILITY.SHOW_ALL;
}

export function showHomeRatings(visibility) {
  return normalizeHomeImdbRatingsVisibility(visibility) === HOME_IMDB_RATINGS_VISIBILITY.SHOW_ALL;
}

export function showStandardDetailRatings(visibility, isMdbListActive) {
  return showHomeRatings(visibility) && !isMdbListActive;
}

export function normalizeDetailImdbRatingsVisibility(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (normalized === DETAIL_IMDB_RATINGS_VISIBILITY.HIDE_UNWATCHED_EPISODES) {
    return DETAIL_IMDB_RATINGS_VISIBILITY.HIDE_UNWATCHED_EPISODES;
  }
  if (normalized === DETAIL_IMDB_RATINGS_VISIBILITY.HIDE_EPISODES || normalized === "HIDE_ALL") {
    return DETAIL_IMDB_RATINGS_VISIBILITY.HIDE_EPISODES;
  }
  return DETAIL_IMDB_RATINGS_VISIBILITY.SHOW_ALL;
}

export function showEpisodeRatings(visibility) {
  return (
    normalizeDetailImdbRatingsVisibility(visibility) !==
    DETAIL_IMDB_RATINGS_VISIBILITY.HIDE_EPISODES
  );
}

export function showEpisodeImdbRating(visibility, isWatched) {
  const normalized = normalizeDetailImdbRatingsVisibility(visibility);
  return (
    normalized === DETAIL_IMDB_RATINGS_VISIBILITY.SHOW_ALL ||
    (normalized === DETAIL_IMDB_RATINGS_VISIBILITY.HIDE_UNWATCHED_EPISODES && Boolean(isWatched))
  );
}

export function filterEpisodeImdbRatings(visibility, ratings, isEpisodeWatched = () => false) {
  const normalized = normalizeDetailImdbRatingsVisibility(visibility);
  if (!Array.isArray(ratings) || normalized === DETAIL_IMDB_RATINGS_VISIBILITY.HIDE_EPISODES) {
    return [];
  }
  if (normalized === DETAIL_IMDB_RATINGS_VISIBILITY.SHOW_ALL) {
    return ratings;
  }
  return ratings.filter((entry) => Boolean(isEpisodeWatched(entry)));
}
