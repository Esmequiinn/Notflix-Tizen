export function isShortPlaceholderDuration(durationMs) {
  return Number.isFinite(durationMs) && durationMs >= 1 && durationMs <= 120999;
}

export function shouldTreatAsNaturalPlaybackCompletion({ hasRenderedFirstFrame = true, hasFatalError = false, durationMs } = {}) {
  if (hasFatalError) {
    return false;
  }
  if (!hasRenderedFirstFrame) {
    return false;
  }
  if (isShortPlaceholderDuration(durationMs)) {
    return false;
  }
  return true;
}
