let playedSinceHome = false;

export function markPlayback() {
  playedSinceHome = true;
}

export function consumePlaybackMark() {
  const value = playedSinceHome;
  playedSinceHome = false;
  return value;
}
