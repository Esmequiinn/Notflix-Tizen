const repeatStateByOwner = new WeakMap();

function directionForKeyCode(keyCode) {
  if (keyCode === 37) return "left";
  if (keyCode === 39) return "right";
  if (keyCode === 38) return "up";
  if (keyCode === 40) return "down";
  return "";
}

export function allowDpadRepeat(owner, event, { horizontalMs = 80, verticalMs = 112 } = {}) {
  if (!owner || !event?.repeat) {
    return true;
  }

  const direction = directionForKeyCode(Number(event.keyCode || 0));
  if (!direction) {
    return true;
  }

  const throttleMs = direction === "left" || direction === "right" ? horizontalMs : verticalMs;
  if (!Number.isFinite(throttleMs) || throttleMs <= 0) {
    return true;
  }

  let effectiveThrottleMs = throttleMs;
  try {
    const body = globalThis?.document?.body?.classList || null;
    const root = globalThis?.document?.documentElement?.classList || null;
    if (
      body?.contains("performance-constrained") ||
      root?.contains("performance-constrained") ||
      body?.contains("legacy-tizen") ||
      root?.contains("legacy-tizen")
    ) {
      effectiveThrottleMs = Math.max(
        throttleMs,
        direction === "left" || direction === "right" ? 120 : 160
      );
    }
  } catch (_) {}

  const now = Date.now();
  const previous = Number(repeatStateByOwner.get(owner) || 0);
  if (previous > 0 && now - previous < effectiveThrottleMs) {
    event.preventDefault?.();
    return false;
  }

  repeatStateByOwner.set(owner, now);
  return true;
}

export function resetDpadRepeat(owner) {
  if (owner) {
    repeatStateByOwner.delete(owner);
  }
}
