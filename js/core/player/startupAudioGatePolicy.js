export function canReleasePlayingNativeStartupAudioGate({
  allowNativePlayback = false,
  hasPresentedPlaybackFrame = false,
  pendingAudioSelection = false,
  readyState = 0
} = {}) {
  return Boolean(
    allowNativePlayback &&
    hasPresentedPlaybackFrame &&
    !pendingAudioSelection &&
    Number.isFinite(Number(readyState)) &&
    Number(readyState) >= 3
  );
}

export function shouldAllowNativePlaybackDuringStartupAudioGate({
  isHlsPlayback = false,
  isPrioritizedWebOsRemoteMkvPlayback = false
} = {}) {
  return Boolean(isHlsPlayback || isPrioritizedWebOsRemoteMkvPlayback);
}

export function selectStartupAudioFallbackOption(options = []) {
  const supportedOptions = (Array.isArray(options) ? options : []).filter(
    (entry) => entry?.supported !== false
  );
  const compatible = supportedOptions.filter((entry) => !entry.requiresAudioConversion);
  if (compatible.length) return compatible.find((entry) => entry?.selected) || compatible[0];
  return supportedOptions.find((entry) => entry?.selected) || supportedOptions[0] || null;
}

export function hasOnlyImplicitStartupAudioOptions(options = []) {
  const list = Array.isArray(options) ? options : [];
  if (!list.length) {
    return true;
  }
  return list.every((option) => Boolean(option?.entry?.implicitAudioTrack));
}
