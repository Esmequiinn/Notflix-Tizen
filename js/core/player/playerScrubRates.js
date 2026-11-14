export const STEP_SHORT_MS = 10000;
export const STEP_MEDIUM_MS = 20000;
export const STEP_LONG_MS = 30000;
export const STEP_VERY_LONG_MS = 60000;

const MEDIUM_REPEAT_THRESHOLD = 3;
const LONG_REPEAT_THRESHOLD = 8;
const VERY_LONG_REPEAT_THRESHOLD = 15;

export function stepMsForKeyRepeat(repeatCount) {
  const count = Math.max(0, Math.trunc(Number(repeatCount)) || 0);
  if (count >= VERY_LONG_REPEAT_THRESHOLD) {
    return STEP_VERY_LONG_MS;
  }
  if (count >= LONG_REPEAT_THRESHOLD) {
    return STEP_LONG_MS;
  }
  if (count >= MEDIUM_REPEAT_THRESHOLD) {
    return STEP_MEDIUM_MS;
  }
  return STEP_SHORT_MS;
}

export function deltaMsForKeyRepeat(repeatCount, forward) {
  const step = stepMsForKeyRepeat(repeatCount);
  return forward ? step : -step;
}
