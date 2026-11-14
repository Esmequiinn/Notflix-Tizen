const HOLD_MS = 650;

function captureTimer(run) {
  const original = globalThis.setTimeout;
  let captured = null;
  globalThis.setTimeout = (callback, delay, ...rest) => {
    if (!captured && typeof callback === "function" && delay >= 300 && delay <= 2000) {
      captured = callback;
      return 0;
    }
    return original(callback, delay, ...rest);
  };
  let result;
  try {
    result = run();
  } finally {
    globalThis.setTimeout = original;
  }
  return { result, captured };
}

export function guardHoldStart(screen, run) {
  const { result, captured } = captureTimer(run);
  screen.nfHold = captured ? { fire: captured, startedAt: Date.now(), fired: false } : null;
  return result;
}

export function handleHoldRepeat(screen, event) {
  const hold = screen.nfHold;
  if (!hold || Number(event?.keyCode || 0) !== 13) return false;
  if (!event?.repeat) return false;
  if (!hold.fired && Date.now() - hold.startedAt >= HOLD_MS) {
    hold.fired = true;
    try {
      hold.fire();
    } catch (_) {}
  }
  event?.preventDefault?.();
  return true;
}

export function clearHold(screen) {
  screen.nfHold = null;
}

export function withHoldGuard(base, methodNames, isActive) {
  const wrapped = {};
  methodNames.forEach((name) => {
    if (typeof base[name] !== "function") return;
    wrapped[name] = function (...args) {
      if (!isActive()) return base[name].apply(this, args);
      return guardHoldStart(this, () => base[name].apply(this, args));
    };
  });
  return wrapped;
}

export function shortPressEvent(screen, event) {
  if (Number(event?.keyCode || 0) !== 13) return event;
  if (screen.nfHold?.fired) return event;
  return {
    type: event?.type || "keyup",
    keyCode: 13,
    which: 13,
    key: event?.key || "Enter",
    code: event?.code || "Enter",
    repeat: false,
    keyDownDurationMs: 0,
    target: event?.target || null,
    timeStamp: event?.timeStamp || 0,
    preventDefault: () => event?.preventDefault?.(),
    stopPropagation: () => event?.stopPropagation?.()
  };
}
