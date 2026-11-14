import { isNotflixActive } from "../notflixAppearance.js";
import { escapeText, nt } from "../home/notflixHomeMarkup.js";
import { loadTrendingShowcase } from "./notflixShowcase.js";

const ROTATE_MS = 9000;
const RETRY_MS = 2500;
const FADE_MS = 1200;
const START_DELAY_MS = 1200;
const QUIET_MS = 1800;

function stopShowcase(screen) {
  if (screen.nfShowcaseTimer) {
    clearTimeout(screen.nfShowcaseTimer);
    screen.nfShowcaseTimer = null;
  }
  screen.nfShowcaseToken = (screen.nfShowcaseToken || 0) + 1;
}

function slideNode(entry) {
  const tags = (entry.genres || []).join(" • ");
  const brand = entry.logo
    ? `<img class="nf-pf-logo" src="${escapeText(entry.logo)}" alt="${escapeText(entry.name)}" decoding="async" />`
    : `<div class="nf-pf-name">${escapeText(entry.name)}</div>`;
  const node = document.createElement("div");
  node.className = "nf-pf-slide is-entering";
  node.innerHTML = `
    <img class="nf-pf-backdrop" src="${escapeText(entry.background)}" alt="" />
    <div class="nf-pf-fade"></div>
    <div class="nf-pf-info">
      ${brand}
      ${tags ? `<div class="nf-pf-tags">${escapeText(tags)}</div>` : ""}
    </div>
  `;
  return node;
}

function loadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (typeof image.decode === "function") {
        image.decode().then(
          () => resolve(true),
          () => resolve(true)
        );
      } else {
        resolve(true);
      }
    };
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

function schedule(screen, delay) {
  if (screen.nfShowcaseTimer) clearTimeout(screen.nfShowcaseTimer);
  screen.nfShowcaseTimer = setTimeout(() => {
    screen.nfShowcaseTimer = null;
    void showNext(screen);
  }, delay);
}

async function showNext(screen) {
  const host = screen.nfShowcaseNode;
  const entries = screen.nfShowcase || [];
  if (!host || !entries.length) return;
  const token = screen.nfShowcaseToken;
  const sinceMove = Date.now() - Number(screen.nfLastMoveAt || 0);
  if (sinceMove < QUIET_MS && host.children.length) {
    schedule(screen, QUIET_MS - sinceMove + 200);
    return;
  }
  const index = (screen.nfShowcaseIndex || 0) % entries.length;
  const entry = entries[index];
  const loaded = await loadImage(entry.background);
  if (token !== screen.nfShowcaseToken || !host.isConnected) return;
  if (!loaded) {
    screen.nfShowcaseFailures = (screen.nfShowcaseFailures || 0) + 1;
    if (screen.nfShowcaseFailures % entries.length !== 0) screen.nfShowcaseIndex = index + 1;
    schedule(screen, RETRY_MS);
    return;
  }
  screen.nfShowcaseFailures = 0;
  const node = slideNode(entry);
  host.appendChild(node);
  setTimeout(() => {
    node.classList.remove("is-entering");
    Array.from(host.children).forEach((child) => {
      if (child !== node) child.remove();
    });
  }, FADE_MS);
  screen.nfShowcaseIndex = index + 1;
  if (entries.length > 1) {
    void loadImage(entries[(index + 1) % entries.length].background);
    schedule(screen, ROTATE_MS);
  }
}

function syncGridScroll(screen) {
  const grid = screen.container?.querySelector(".nf-pf .profile-grid");
  if (!grid) return;
  const cards = Array.from(grid.querySelectorAll(".profile-card"));
  const focused = grid.querySelector(".profile-card.focused");
  const index = cards.indexOf(focused);
  if (index < 0) return;
  const pad = 12;
  const tops = cards.map((card) => card.offsetTop);
  const bottomOf = (card) => card.offsetTop + card.offsetHeight;
  let first = cards.findIndex((card) => card.offsetTop >= grid.scrollTop);
  if (first < 0) first = 0;
  if (index < first) first = index;
  while (first < index && bottomOf(cards[index]) - (tops[first] - pad) > grid.clientHeight)
    first += 1;
  grid.scrollTop = Math.max(0, tops[first] - pad);
}

function decorate(screen) {
  const root = screen.container?.querySelector(".profile-screen");
  if (!root) return;
  root.classList.add("nf-pf");
  if (!screen.isManagementMode) {
    const title = root.querySelector(".profile-title");
    if (title) title.textContent = nt("notflix_pick_profile", "Choose a profile");
  }
  if (!screen.nfShowcase) {
    screen.nfShowcase = [];
    if (!screen.nfShowcaseLoading) {
      screen.nfShowcaseLoading = true;
      const generation = screen.nfShowcaseGeneration || 0;
      void loadTrendingShowcase().then((entries) => {
        screen.nfShowcaseLoading = false;
        if (generation !== (screen.nfShowcaseGeneration || 0)) return;
        if (!entries.length || !screen.container?.isConnected) return;
        screen.nfShowcase = entries;
        screen.nfShowcaseIndex = Math.floor(Math.random() * entries.length);
        decorate(screen);
      });
    }
  }
  if (screen.nfShowcase.length) {
    if (!screen.nfShowcaseNode) {
      screen.nfShowcaseNode = document.createElement("div");
      screen.nfShowcaseNode.className = "nf-pf-showcase";
      screen.nfShowcaseNode.setAttribute("aria-hidden", "true");
    }
    root.insertBefore(screen.nfShowcaseNode, root.firstChild);
    if (!screen.nfShowcaseTimer && !screen.nfShowcaseNode.children.length) {
      stopShowcase(screen);
      schedule(screen, screen.nfShowcaseStarted ? 0 : START_DELAY_MS);
      screen.nfShowcaseStarted = true;
    }
  }
  const frame = globalThis.requestAnimationFrame || ((callback) => setTimeout(callback, 16));
  frame(() => syncGridScroll(screen));
}

export function withNotflixProfiles(base) {
  return {
    ...base,
    render(...args) {
      const result = base.render.apply(this, args);
      if (isNotflixActive()) decorate(this);
      return result;
    },
    moveProfileFocus(event) {
      if (!isNotflixActive()) return base.moveProfileFocus.call(this, event);
      const code = Number(event?.keyCode || 0);
      if (code === 37 || code === 39) {
        event?.preventDefault?.();
        return true;
      }
      if (code === 38 || code === 40) {
        this.nfLastMoveAt = Date.now();
        const result = base.moveProfileFocus.call(this, {
          keyCode: code === 38 ? 37 : 39,
          preventDefault: () => event?.preventDefault?.()
        });
        syncGridScroll(this);
        return result;
      }
      return base.moveProfileFocus.call(this, event);
    },
    async activateProfile(profileId, ...rest) {
      if (!isNotflixActive() || !profileId || this.isActivatingProfile) {
        return base.activateProfile.call(this, profileId, ...rest);
      }
      const root = this.container?.querySelector(".profile-screen");
      const card = Array.from(
        this.container?.querySelectorAll(".profile-card[data-profile-id]") || []
      ).find((node) => String(node.dataset.profileId || "") === String(profileId));
      root?.classList.add("nf-pf-picking");
      card?.classList.add("is-activating");
      stopShowcase(this);
      await new Promise((resolve) => {
        const frame = globalThis.requestAnimationFrame || ((callback) => setTimeout(callback, 16));
        frame(() => setTimeout(resolve, 40));
      });
      const result = await base.activateProfile.call(this, profileId, ...rest);
      if (!this.isActivatingProfile) root?.classList.remove("nf-pf-picking");
      return result;
    },
    cleanup(...args) {
      stopShowcase(this);
      this.nfShowcaseLoading = false;
      this.nfShowcaseGeneration = (this.nfShowcaseGeneration || 0) + 1;
      this.nfShowcaseNode = null;
      this.nfShowcase = null;
      this.nfShowcaseStarted = false;
      return base.cleanup?.apply(this, args);
    }
  };
}
