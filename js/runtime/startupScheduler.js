import { hasMarkedFirstHomePaint, onFirstHomePaint } from "../core/diagnostics/bootTiming.js";

const DEFAULT_FALLBACK_MS = 2500;

export function runAfterFirstHomePaint(task, { fallbackMs = DEFAULT_FALLBACK_MS } = {}) {
  if (typeof task !== "function") {
    return;
  }
  let done = false;
  let timer = null;
  let unsubscribe = () => {};
  const run = () => {
    if (done) {
      return;
    }
    done = true;
    unsubscribe();
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    setTimeout(() => {
      try {
        task();
      } catch (error) {
        console.warn("Deferred startup task failed", error);
      }
    }, 0);
  };
  if (hasMarkedFirstHomePaint()) {
    run();
    return;
  }
  timer = setTimeout(run, Math.max(0, Number(fallbackMs) || 0));
  unsubscribe = onFirstHomePaint(run);
}
