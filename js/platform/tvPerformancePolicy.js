export const HOME_TV_PERFORMANCE_POLICY = Object.freeze({
  modernArtworkEvictIdleMs: 1200,
  modernArtworkEvictMarginPx: 2600,
  legacyArtworkEvictMarginPx: 1600,
  legacyArtworkEvictIdleMs: 1500,
  roomyLegacyArtworkEvictMarginPx: 3400,
  modernTrailerCleanupDelayMs: 2400,
  legacyTrailerCleanupDelayMs: 80,
  modernTrailerMountGraceMs: 1000,
  constrainedHeroEnrichDwellMs: 500,
  modernArtworkCacheEntries: 640,
  legacyArtworkCacheEntries: 320,
  lowMemoryArtworkCacheEntries: 200
});

export function isModernTvProfile(profile = null) {
  return Boolean(
    profile?.isTvRuntime && !profile.isPerformanceConstrained && !profile.isLegacyTvRuntime
  );
}

export function isLowMemoryDevice(deviceMemory = 0) {
  const memory = Number(deviceMemory);
  return memory > 0 && memory <= 1;
}

export function getDeviceMemoryGb() {
  return Number(globalThis?.navigator?.deviceMemory) || 0;
}

export function getArtworkEvictIdleMs(profile = null, deviceMemory = 0) {
  if (isModernTvProfile(profile) && !isLowMemoryDevice(deviceMemory)) {
    return HOME_TV_PERFORMANCE_POLICY.modernArtworkEvictIdleMs;
  }
  return HOME_TV_PERFORMANCE_POLICY.legacyArtworkEvictIdleMs;
}

export function getArtworkEvictMarginPx(profile = null, deviceMemory = 0) {
  if (isLowMemoryDevice(deviceMemory)) {
    return HOME_TV_PERFORMANCE_POLICY.legacyArtworkEvictMarginPx;
  }
  return isModernTvProfile(profile)
    ? HOME_TV_PERFORMANCE_POLICY.modernArtworkEvictMarginPx
    : HOME_TV_PERFORMANCE_POLICY.roomyLegacyArtworkEvictMarginPx;
}

export function getTrailerCleanupDelayMs(profile = null) {
  return isModernTvProfile(profile)
    ? HOME_TV_PERFORMANCE_POLICY.modernTrailerCleanupDelayMs
    : HOME_TV_PERFORMANCE_POLICY.legacyTrailerCleanupDelayMs;
}

export function getHeroEnrichDwellMs(profile = null) {
  return profile?.isPerformanceConstrained
    ? HOME_TV_PERFORMANCE_POLICY.constrainedHeroEnrichDwellMs
    : 0;
}

export function getTrailerMountGraceMs(profile = null) {
  return isModernTvProfile(profile) ? HOME_TV_PERFORMANCE_POLICY.modernTrailerMountGraceMs : 0;
}

export function getArtworkCacheLimit(profile = null, deviceMemory = 0) {
  if (isLowMemoryDevice(deviceMemory)) {
    return HOME_TV_PERFORMANCE_POLICY.lowMemoryArtworkCacheEntries;
  }
  if (isModernTvProfile(profile)) {
    return HOME_TV_PERFORMANCE_POLICY.modernArtworkCacheEntries;
  }
  return HOME_TV_PERFORMANCE_POLICY.legacyArtworkCacheEntries;
}
