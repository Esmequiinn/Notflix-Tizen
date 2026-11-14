import { isNotflixActive } from "../notflixAppearance.js";
import { playUiSound } from "../notflixSounds.js";

function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function label(screen, key, fallback) {
  return String(screen?.nfKeyboardLabels?.[key] || fallback);
}

const KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
const COLS = 6;
const GRID_ROWS = KEYS.length / COLS;
const SPACE = KEYS.length;
const DELETE = KEYS.length + 1;

function active() {
  return isNotflixActive();
}

function keyboardNode(screen) {
  return screen.container?.querySelector(".nf-kb") || null;
}

function inputNode(screen) {
  return screen.container?.querySelector("#searchInput") || null;
}

function position(index) {
  if (index === SPACE) return { row: GRID_ROWS, col: 0 };
  if (index === DELETE) return { row: GRID_ROWS, col: 4 };
  return { row: Math.floor(index / COLS), col: index % COLS };
}

function indexAt(row, col) {
  if (row >= GRID_ROWS) return col >= 4 ? DELETE : SPACE;
  return row * COLS + col;
}

export function renderNotflixKeyboard(screen, labels = null) {
  if (labels) screen.nfKeyboardLabels = labels;
  const query = String(screen.query || "");
  const cursor = Number(screen.nfKeyIndex || 0);
  const keys = KEYS.map(
    (key, index) =>
      `<span class="nf-kb-key${index === cursor ? " is-selected" : ""}" data-k="${index}">${key}</span>`
  ).join("");
  return `
    <div class="nf-kb focusable" data-action="nfKeyboard" tabindex="0">
      <div class="nf-kb-query${query ? "" : " is-empty"}">${escapeText(query ? query.toUpperCase() : label(screen, "prompt", "Search"))}</div>
      <div class="nf-kb-grid">${keys}</div>
      <div class="nf-kb-wide">
        <span class="nf-kb-key nf-kb-space${cursor === SPACE ? " is-selected" : ""}" data-k="${SPACE}">${escapeText(label(screen, "space", "Space"))}</span>
        <span class="nf-kb-key nf-kb-delete${cursor === DELETE ? " is-selected" : ""}" data-k="${DELETE}">${escapeText(label(screen, "del", "Delete"))}</span>
      </div>
    </div>
  `;
}

function syncKeyboard(screen) {
  const node = keyboardNode(screen);
  if (!node) return;
  const cursor = Number(screen.nfKeyIndex || 0);
  node.querySelectorAll(".nf-kb-key").forEach((key) => {
    key.classList.toggle("is-selected", Number(key.dataset.k) === cursor);
  });
  const query = String(screen.query || "");
  const queryNode = node.querySelector(".nf-kb-query");
  if (queryNode) {
    queryNode.textContent = query ? query.toUpperCase() : label(screen, "prompt", "Search");
    queryNode.classList.toggle("is-empty", !query);
  }
}

function typeKey(screen, index) {
  const input = inputNode(screen);
  if (!input) return;
  let value = String(input.value || "");
  if (index === DELETE) {
    value = value.slice(0, -1);
  } else if (index === SPACE) {
    if (!value || value.endsWith(" ")) return;
    value += " ";
  } else {
    value += KEYS[index].toLowerCase();
  }
  input.value = value;
  screen.query = value;
  playUiSound("confirm");
  screen.scheduleSearchFromInput(input);
  syncKeyboard(screen);
}

function firstResultNode(screen) {
  const rows = screen.navModel?.rows || [];
  return screen.resolvePreferredResultsNode?.(rows[0] || []) || rows[0]?.[0] || null;
}

function handleKeyboardKey(screen, node, code, event) {
  const cursor = Number(screen.nfKeyIndex || 0);
  const { row, col } = position(cursor);
  if (code === 13) {
    if (!event?.repeat || cursor === DELETE) typeKey(screen, cursor);
    return true;
  }
  let next = cursor;
  if (code === 37) {
    if (row >= GRID_ROWS) next = cursor === DELETE ? SPACE : SPACE;
    else if (col > 0) next = cursor - 1;
  } else if (code === 39) {
    if (row >= GRID_ROWS) {
      if (cursor === SPACE) next = DELETE;
      else {
        const target = firstResultNode(screen);
        if (target) screen.focusNode(node, target);
        return true;
      }
    } else if (col < COLS - 1) {
      next = cursor + 1;
    } else {
      const target = firstResultNode(screen);
      if (target) screen.focusNode(node, target);
      return true;
    }
  } else if (code === 40) {
    if (row < GRID_ROWS) next = indexAt(row + 1, col);
  } else if (code === 38) {
    if (row === 0) {
      const settled = Date.now() - Number(screen.nfKbTopRowAt || 0) > 450;
      if (event?.repeat || !settled) {
        event?.preventDefault?.();
        return true;
      }
      return false;
    }
    if (row >= GRID_ROWS) next = indexAt(GRID_ROWS - 1, cursor === DELETE ? 4 : 0);
    else next = indexAt(row - 1, col);
  } else {
    return false;
  }
  if (next !== cursor) {
    if (position(next).row === 0 && position(cursor).row !== 0) screen.nfKbTopRowAt = Date.now();
    screen.nfKeyIndex = next;
    playUiSound("move");
    syncKeyboard(screen);
  }
  return true;
}

export function withNotflixSearch(base) {
  return {
    ...base,
    buildNavigationModel(...args) {
      const result = base.buildNavigationModel.apply(this, args);
      if (active()) {
        const kb = keyboardNode(this);
        if (kb && this.navModel) {
          kb.dataset.navZone = "header";
          kb.dataset.navCol = "0";
          this.navModel.header = [kb];
        }
      }
      return result;
    },
    getDefaultHeaderFocusTarget(...args) {
      if (active()) {
        const kb = keyboardNode(this);
        if (kb) return kb;
      }
      return base.getDefaultHeaderFocusTarget.apply(this, args);
    },
    async onKeyDown(event) {
      if (active() && this.focusZone !== "sidebar") {
        const code = Number(event?.keyCode || 0);
        const current = this.container?.querySelector(".focusable.focused") || null;
        const kb = keyboardNode(this);
        if (current && kb && current === kb) {
          if (handleKeyboardKey(this, kb, code, event)) {
            this.nfKeyConsumed = true;
            event?.preventDefault?.();
            return;
          }
        } else if (
          current &&
          kb &&
          code === 37 &&
          String(current.dataset.navZone || "") === "results" &&
          Number(current.dataset.navCol || 0) === 0
        ) {
          event?.preventDefault?.();
          this.focusNode(current, kb);
          return;
        }
      }
      return base.onKeyDown.call(this, event);
    }
  };
}
