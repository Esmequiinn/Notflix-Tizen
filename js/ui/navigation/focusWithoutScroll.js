const MAX_ANCESTOR_WALK = 256;

let preventScrollSupport = null;

function toFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function detectPreventScrollSupport() {
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    return null;
  }
  let supported = false;
  try {
    const probe = document.createElement("div");
    if (!probe || typeof probe.focus !== "function") {
      return null;
    }
    probe.focus({
      get preventScroll() {
        supported = true;
        return true;
      }
    });
  } catch (_) {
    return supported ? true : null;
  }
  return supported;
}

function isScrollable(node) {
  return (
    toFiniteNumber(node.scrollWidth, 0) > toFiniteNumber(node.clientWidth, 0) ||
    toFiniteNumber(node.scrollHeight, 0) > toFiniteNumber(node.clientHeight, 0)
  );
}

function viewportScroll(win) {
  return {
    x: toFiniteNumber(win.scrollX, toFiniteNumber(win.pageXOffset, 0)),
    y: toFiniteNumber(win.scrollY, toFiniteNumber(win.pageYOffset, 0))
  };
}

function captureScrollState(element) {
  const ancestors = [];
  let node = element.parentElement || null;
  let steps = 0;
  while (node && steps < MAX_ANCESTOR_WALK) {
    steps += 1;
    if (isScrollable(node)) {
      ancestors.push({ node, top: node.scrollTop, left: node.scrollLeft });
    }
    node = node.parentElement || null;
  }
  const win = typeof window !== "undefined" && window ? window : null;
  const viewport = win && typeof win.scrollTo === "function" ? viewportScroll(win) : null;
  return { ancestors, viewport, win };
}

function restoreElementScroll(node, left, top) {
  if (typeof node.scrollTo === "function") {
    try {
      node.scrollTo({ left, top, behavior: "instant" });
      if (node.scrollTop === top && node.scrollLeft === left) {
        return;
      }
    } catch (_) {}
  }
  if (node.scrollTop !== top) {
    node.scrollTop = top;
  }
  if (node.scrollLeft !== left) {
    node.scrollLeft = left;
  }
}

function restoreScrollState(state) {
  for (let index = 0; index < state.ancestors.length; index += 1) {
    const { node, top, left } = state.ancestors[index];
    if (node.scrollTop !== top || node.scrollLeft !== left) {
      restoreElementScroll(node, left, top);
    }
  }
  if (state.viewport) {
    const current = viewportScroll(state.win);
    if (current.x !== state.viewport.x || current.y !== state.viewport.y) {
      state.win.scrollTo(state.viewport.x, state.viewport.y);
    }
  }
}

export function focusWithoutScroll(element, options = {}) {
  if (!element || typeof element.focus !== "function") {
    return undefined;
  }
  try {
    if (preventScrollSupport === null) {
      preventScrollSupport = detectPreventScrollSupport();
    }
    if (preventScrollSupport === true) {
      return element.focus({ preventScroll: true, ...options });
    }
    const state = captureScrollState(element);
    let result;
    if (preventScrollSupport === false) {
      result = element.focus();
    } else {
      let supported = false;
      result = element.focus({
        ...options,
        get preventScroll() {
          supported = true;
          return true;
        }
      });
      preventScrollSupport = supported;
      if (supported) {
        return result;
      }
    }
    restoreScrollState(state);
    return result;
  } catch (_) {
    try {
      return element.focus();
    } catch (_) {
      return undefined;
    }
  }
}

export function resetFocusWithoutScrollSupportForTests() {
  preventScrollSupport = null;
}
