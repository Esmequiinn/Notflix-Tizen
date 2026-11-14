import { isNotflixActive } from "./notflixAppearance.js";

const KEY_LEFT = 37;
const KEY_UP = 38;
const KEY_RIGHT = 39;
const KEY_DOWN = 40;

const KEY_NAMES = {
  [KEY_LEFT]: "ArrowLeft",
  [KEY_UP]: "ArrowUp",
  [KEY_RIGHT]: "ArrowRight",
  [KEY_DOWN]: "ArrowDown"
};

const TOP_BAR_REMAP = {
  [KEY_LEFT]: KEY_UP,
  [KEY_RIGHT]: KEY_DOWN,
  [KEY_DOWN]: KEY_RIGHT
};

function topBarOf(screen) {
  const container = screen?.container;
  if (!container?.querySelector) return null;
  return container.querySelector(".home-sidebar.notflix-topbar");
}

function focusedIn(root) {
  return root?.querySelector?.(".focusable.focused") || null;
}

export function prepareNotflixTopBarKey(screen, event, normalizedEvent) {
  if (!isNotflixActive()) return null;
  const bar = topBarOf(screen);
  if (!bar) return null;
  const code = Number(normalizedEvent.keyCode || 0);
  if (!KEY_NAMES[code]) return null;

  if (focusedIn(bar)) {
    event?.stopPropagation?.();
    if (code === KEY_UP) {
      event?.preventDefault?.();
      return { swallow: true };
    }
    const next = TOP_BAR_REMAP[code];
    normalizedEvent.keyCode = next;
    normalizedEvent.which = next;
    normalizedEvent.key = KEY_NAMES[next];
    normalizedEvent.code = KEY_NAMES[next];
    normalizedEvent.keyName = KEY_NAMES[next];
    return null;
  }

  if (code !== KEY_UP || normalizedEvent.repeat) return null;
  screen.nfKeyConsumed = false;
  const before = focusedIn(screen.container);
  if (!before || bar.contains(before)) return null;
  return { afterUp: before };
}

export function finishNotflixTopBarKey(screen, plan) {
  if (!plan?.afterUp) return;
  if (screen?.nfKeyConsumed) {
    screen.nfKeyConsumed = false;
    return;
  }
  const container = screen?.container;
  if (!container || document.body?.classList?.contains("nuvio-modal-open")) return;
  const now = focusedIn(container);
  if (now && now !== plan.afterUp) return;
  if (typeof screen.isMainNode === "function" && screen.isMainNode(plan.afterUp)) {
    screen.lastMainFocus = plan.afterUp;
  }
  if (typeof screen.openSidebar === "function") {
    void Promise.resolve(screen.openSidebar()).catch(() => {});
    return;
  }
  if (typeof screen.focusSidebarNode === "function") {
    void Promise.resolve(screen.focusSidebarNode()).catch(() => {});
  }
}
