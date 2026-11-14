import { resolveYoutubeDirect } from "./youtubeDirect.js";
import { resolveImdbTrailer } from "./imdbTrailer.js";
import { startPreview } from "./previewPlayer.js";

function steps(item, source, { maxHeight, withAudio }) {
  const list = [];
  if (source?.ytId) list.push(() => resolveYoutubeDirect(source.ytId, { maxHeight, withAudio }));
  if (source?.kind === "video" && source.url && !source.ytId)
    list.push(() => Promise.resolve({ kind: "mp4", url: source.url, withAudio: true }));
  list.push(() => resolveImdbTrailer(item, { maxHeight: Math.max(480, maxHeight) }));
  return list;
}

export function playTrailerChain(
  host,
  item,
  source,
  {
    maxHeight = 480,
    withAudio = false,
    loop = true,
    alive = () => true,
    onPlaying,
    onFail,
    onEnded
  } = {}
) {
  const queue = steps(item, source, { maxHeight, withAudio });
  const next = async () => {
    while (queue.length) {
      const resolve = queue.shift();
      const direct = await resolve().catch(() => null);
      if (!alive()) return;
      if (!direct?.url) continue;
      startPreview(host, direct, {
        loop,
        muted: !withAudio,
        onPlaying: () => {
          if (alive()) onPlaying?.();
        },
        onEnded: () => {
          if (alive()) onEnded?.();
        },
        onFail: () => {
          if (alive()) void next();
        }
      });
      return;
    }
    if (alive()) onFail?.();
  };
  void next();
}
