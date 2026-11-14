export function findAbsoluteEpisodeAnchorIndex(episodes = [], { season = 0, episode = 0 } = {}) {
  const list = Array.isArray(episodes) ? episodes : [];
  const seedSeason = Number(season || 0);
  if (seedSeason !== 1) {
    return -1;
  }
  const index = Number(episode || 0) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= list.length) {
    return -1;
  }
  return index;
}
