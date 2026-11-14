const TRAKT_LEGACY_FORCED_TOKEN_LIFETIME_SECONDS = 86400;
const TRAKT_DOCUMENTED_TOKEN_LIFETIME_SECONDS = 604800;

export function normalizeTraktTokenLifetimeSeconds(expiresIn) {
  const seconds = Math.trunc(Number(expiresIn));
  if (!Number.isFinite(seconds)) {
    return 0;
  }
  return seconds === TRAKT_LEGACY_FORCED_TOKEN_LIFETIME_SECONDS
    ? TRAKT_DOCUMENTED_TOKEN_LIFETIME_SECONDS
    : seconds;
}
