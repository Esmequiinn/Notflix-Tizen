import { PlayerController } from "../../../core/player/playerController.js";
import { isNotflixActive } from "../notflixAppearance.js";
import { localizedDetails } from "../home/notflixLocalize.js";

const PROGRESSIVE_TS = /\.(ts|m2ts|mts)(?:$|[?#])/i;
const DEFAULT_MOVIE_MINUTES = 110;
const DEFAULT_EPISODE_MINUTES = 45;

function playbackUrl(screen) {
  return String(
    screen.activePlaybackUrl ||
      PlayerController.currentPlaybackUrl ||
      screen.params?.streamUrl ||
      ""
  );
}

function isSeries(screen) {
  const type = String(screen.params?.itemType || "").toLowerCase();
  return type === "series" || type === "tv";
}

export function isProgressiveTs(screen) {
  if (!isNotflixActive()) return false;
  const type = String(screen.params?.itemType || "").toLowerCase();
  if (type === "channel") return false;
  try {
    return PROGRESSIVE_TS.test(new URL(playbackUrl(screen)).pathname);
  } catch (_) {
    return PROGRESSIVE_TS.test(playbackUrl(screen));
  }
}

function episodeMinutes(screen) {
  const episodes = Array.isArray(screen.params?.episodes) ? screen.params.episodes : [];
  const season = Number(screen.params?.season);
  const number = Number(screen.params?.episode);
  const match = episodes.find(
    (entry) =>
      Number(entry?.season) === season && Number(entry?.episode ?? entry?.number) === number
  );
  const raw = match?.runtime ?? match?.runtimeMinutes ?? match?.duration;
  const minutes = Number(String(raw ?? "").replace(/[^\d.]/g, ""));
  return minutes > 0 ? minutes : 0;
}

async function estimateSeconds(screen) {
  const fromResume = Number(screen.params?.resumeDurationMs || 0) / 1000;
  if (fromResume > 60) return fromResume;
  const fromEpisode = episodeMinutes(screen);
  if (fromEpisode) return fromEpisode * 60;
  const details = await localizedDetails({
    id: screen.params?.imdbId || screen.params?.itemId,
    type: isSeries(screen) ? "series" : "movie"
  }).catch(() => null);
  const minutes = Number(details?.runtimeMinutes || 0);
  if (minutes > 0) return minutes * 60;
  return (isSeries(screen) ? DEFAULT_EPISODE_MINUTES : DEFAULT_MOVIE_MINUTES) * 60;
}

function ensureFallback(screen) {
  const url = playbackUrl(screen);
  if (screen.nfTsUrl === url) return;
  screen.nfTsUrl = url;
  const token = (screen.nfTsToken || 0) + 1;
  screen.nfTsToken = token;
  PlayerController.durationFallbackSeconds = 0;
  void estimateSeconds(screen).then((seconds) => {
    if (screen.nfTsToken !== token || !isProgressiveTs(screen)) return;
    PlayerController.durationFallbackSeconds = seconds;
    screen.livePlaybackLatched = false;
  });
}

export function withNotflixTsTimeline(base) {
  return {
    ...base,
    getPlaybackDurationSeconds(...args) {
      const seconds = base.getPlaybackDurationSeconds.apply(this, args);
      if (seconds > 0 || !isProgressiveTs(this)) return seconds;
      ensureFallback(this);
      return Number(PlayerController.durationFallbackSeconds || 0);
    },
    isLivePlayback(...args) {
      if (isProgressiveTs(this)) {
        this.livePlaybackLatched = false;
        PlayerController.currentPlaybackIsLive = false;
        return false;
      }
      return base.isLivePlayback.apply(this, args);
    },
    cleanup(...args) {
      this.nfTsToken = (this.nfTsToken || 0) + 1;
      this.nfTsUrl = "";
      PlayerController.durationFallbackSeconds = 0;
      return base.cleanup.apply(this, args);
    }
  };
}
