export function shouldMarkCompletedSeriesWatched(status, hasEpisodeHistory) {
  return status === "completed" && !hasEpisodeHistory;
}
