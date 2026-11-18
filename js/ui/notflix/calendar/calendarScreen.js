import { Router } from "../../navigation/routerState.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { Platform } from "../../../platform/index.js";
import { LayoutPreferences } from "../../../data/local/layoutPreferences.js";
import {
  activateLegacySidebarAction,
  bindRootSidebarEvents,
  focusWithoutAutoScroll,
  getRootSidebarNodes,
  getRootSidebarSelectedNode,
  getSidebarProfileState,
  isRootSidebarNode,
  renderRootSidebar,
  setLegacySidebarExpanded
} from "../../components/sidebarNavigation.js";
import { CALENDAR_DAYS, cachedCalendar, loadCalendar, posterFor } from "./calendarService.js";
import { escapeText, nt } from "../home/notflixHomeMarkup.js";
import { playUiSound } from "../notflixSounds.js";

function dayLabel(date) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diff = Math.round((date.getTime() - start) / 86400000);
  if (diff === 0) return nt("notflix_calendar_today", "Today");
  if (diff === 1) return nt("notflix_calendar_tomorrow", "Tomorrow");
  try {
    const text = date.toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long"
    });
    return text.charAt(0).toUpperCase() + text.slice(1);
  } catch (_) {
    return date.toDateString();
  }
}

function episodeCode(entry) {
  if (!entry.season && !entry.episode) return "";
  return nt("notflix_calendar_episode", `S${entry.season}:E${entry.episode}`, [
    entry.season,
    entry.episode
  ]);
}

export const CalendarScreen = {
  async mount() {
    this.container = document.getElementById("calendar");
    ScreenUtils.show(this.container);
    this.layoutPrefs = LayoutPreferences.get();
    this.cursor = { row: 0, col: 0 };
    this.loadToken = (this.loadToken || 0) + 1;
    this.movedWhileLoading = false;
    const cached = cachedCalendar();
    this.state = cached
      ? { loading: false, error: false, source: cached.source, days: cached.days }
      : { loading: true, error: false, source: "nuvio", days: [] };
    this.focusZone = cached && cached.days.length ? "content" : "sidebar";
    try {
      this.sidebarProfile = await getSidebarProfileState({ cacheOnly: true });
    } catch (_) {
      this.sidebarProfile = null;
    }
    this.render();
    if (cached) {
      void this.hydratePosters(this.loadToken);
    } else {
      const token = this.loadToken;
      setTimeout(() => {
        if (token === this.loadToken) void this.load(token);
      }, 60);
    }
    getSidebarProfileState()
      .then((profile) => {
        this.sidebarProfile = profile;
      })
      .catch(() => {});
  },

  async load(token) {
    try {
      const result = await loadCalendar();
      if (token !== this.loadToken) return;
      this.state = { loading: false, error: false, source: result.source, days: result.days };
    } catch (_) {
      if (token !== this.loadToken) return;
      this.state = { loading: false, error: true, source: "nuvio", days: [] };
    }
    this.cursor = { row: 0, col: 0 };
    if (!this.movedWhileLoading && this.state.days.length) this.focusZone = "content";
    this.render();
    void this.hydratePosters(token);
  },

  async hydratePosters(token) {
    const cards = Array.from(
      this.container?.querySelectorAll(".nf-cal-card[data-needs-poster]") || []
    );
    const queue = cards.slice();
    const worker = async () => {
      while (queue.length) {
        if (token !== this.loadToken) return;
        const card = queue.shift();
        const day = this.state.days[Number(card.dataset.row)];
        const entry = day?.entries?.[Number(card.dataset.col)];
        if (!entry) continue;
        const poster = await posterFor(entry);
        if (token !== this.loadToken || !poster) continue;
        entry.poster = poster;
        const art = card.querySelector(".nf-cal-art");
        if (art) art.innerHTML = `<img src="${escapeText(poster)}" alt="" decoding="async" />`;
        card.removeAttribute("data-needs-poster");
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  },

  renderBody() {
    const { loading, error, days, source } = this.state;
    if (loading) {
      return `<div class="nf-cal-message">${escapeText(nt("notflix_loading", "Loading…"))}</div>`;
    }
    if (error) {
      return `<div class="nf-cal-message">${escapeText(nt("notflix_calendar_error", "Could not load the calendar"))}</div>`;
    }
    if (!days.length) {
      return `<div class="nf-cal-message">${escapeText(nt("notflix_calendar_empty", "No new episodes of your series in the next 30 days", [CALENDAR_DAYS]))}</div>`;
    }
    return days
      .map(
        (day, row) => `
        <section class="nf-cal-day" data-row="${row}">
          <h2 class="nf-cal-day-title">${escapeText(dayLabel(day.date))}</h2>
          <div class="nf-cal-track">
            ${day.entries
              .map(
                (entry, col) => `
              <article class="nf-cal-card focusable" data-row="${row}" data-col="${col}"${entry.poster ? "" : " data-needs-poster"}>
                <div class="nf-cal-art">${entry.poster ? `<img src="${escapeText(entry.poster)}" alt="" decoding="async" />` : `<span>${escapeText(entry.title)}</span>`}</div>
                <div class="nf-cal-name">${escapeText(entry.title)}</div>
                <div class="nf-cal-episode">${escapeText(episodeCode(entry))}</div>
                ${entry.episodeTitle ? `<div class="nf-cal-episode-title">${escapeText(entry.episodeTitle)}</div>` : ""}
              </article>`
              )
              .join("")}
          </div>
        </section>`
      )
      .join("");
  },

  render() {
    if (!this.container) return;
    const sourceText =
      this.state.source === "trakt"
        ? nt("notflix_calendar_source_trakt", "From your Trakt account")
        : this.state.source === "simkl"
          ? nt("notflix_calendar_source_simkl", "From your Simkl account")
          : nt("notflix_calendar_source_nuvio", "From your series in Notflix");
    this.container.innerHTML = `
      <div class="home-shell nf-calendar-shell">
        ${renderRootSidebar({ selectedRoute: "calendar", profile: this.sidebarProfile, layout: this.layoutPrefs, expanded: false })}
        <main class="home-main nf-calendar-main">
          <header class="nf-cal-header">
            <h1 class="nf-cal-title">${escapeText(nt("notflix_calendar_title", "Calendar"))}</h1>
            <p class="nf-cal-subtitle">${escapeText(this.state.loading ? "" : sourceText)}</p>
          </header>
          <div class="nf-cal-body">${this.renderBody()}</div>
        </main>
      </div>
    `;
    bindRootSidebarEvents(this.container, {
      currentRoute: "calendar",
      onSelectedAction: () => this.closeSidebarToContent(),
      onExpandSidebar: () => this.openSidebar()
    });
    if (this.focusZone === "sidebar") {
      this.focusSidebarNode();
    } else {
      this.focusCursor();
    }
  },

  cards() {
    return Array.from(this.container?.querySelectorAll(".nf-cal-card") || []);
  },

  cardAt(row, col) {
    return (
      this.container?.querySelector(`.nf-cal-card[data-row="${row}"][data-col="${col}"]`) || null
    );
  },

  setFocused(target) {
    if (!target) return false;
    this.container?.querySelectorAll(".focusable.focused").forEach((node) => {
      if (node !== target) node.classList.remove("focused");
    });
    target.classList.add("focused");
    focusWithoutAutoScroll(target);
    const sidebar = isRootSidebarNode(target);
    this.focusZone = sidebar ? "sidebar" : "content";
    setLegacySidebarExpanded(this.container, sidebar);
    return true;
  },

  focusCursor() {
    const target = this.cardAt(this.cursor.row, this.cursor.col);
    if (!target) {
      this.container
        ?.querySelectorAll(".focusable.focused")
        .forEach((node) => node.classList.remove("focused"));
      return false;
    }
    this.setFocused(target);
    const day = target.closest(".nf-cal-day");
    const main = this.container.querySelector(".nf-calendar-main");
    if (day && main) {
      const top = day.offsetTop - 120;
      main.scrollTop = Math.max(0, top);
    }
    const track = target.parentElement;
    if (track) {
      const left = target.offsetLeft - track.offsetLeft;
      if (
        left < track.scrollLeft ||
        left + target.offsetWidth > track.scrollLeft + track.clientWidth
      ) {
        track.scrollLeft = Math.max(0, left - 16);
      }
    }
    return true;
  },

  focusSidebarNode(preferred = null) {
    const nodes = getRootSidebarNodes(this.container, this.layoutPrefs);
    const target =
      preferred || getRootSidebarSelectedNode(this.container, this.layoutPrefs) || nodes[0] || null;
    return this.setFocused(target);
  },

  openSidebar() {
    return this.focusSidebarNode();
  },

  closeSidebarToContent() {
    this.focusZone = "content";
    if (!this.focusCursor()) {
      this.focusSidebarNode();
    }
    return true;
  },

  isMainNode(node) {
    return Boolean(node?.classList?.contains("nf-cal-card"));
  },

  openEntry(row, col) {
    const entry = this.state.days[row]?.entries?.[col];
    if (!entry) return;
    playUiSound("confirm");
    Router.navigate("detail", {
      itemId: entry.contentId,
      itemType: entry.contentType || "series",
      fallbackTitle: entry.title,
      fallbackPoster: entry.poster || "",
      preferredSeason: entry.season || undefined
    });
  },

  onKeyDown(event) {
    const code = Number(event?.keyCode || 0);
    const current = this.container?.querySelector(".focusable.focused") || null;
    if (Platform.isBackEvent(event)) {
      event?.preventDefault?.();
      if (this.focusZone === "sidebar") {
        Router.navigate("home");
      } else {
        this.openSidebar();
      }
      return;
    }
    if (this.state.loading) this.movedWhileLoading = true;
    if (this.focusZone === "sidebar") {
      const nodes = getRootSidebarNodes(this.container, this.layoutPrefs);
      const index = Math.max(0, nodes.indexOf(current));
      if (code === 38 || code === 40) {
        event?.preventDefault?.();
        const next = nodes[Math.min(nodes.length - 1, Math.max(0, index + (code === 38 ? -1 : 1)))];
        if (next) this.setFocused(next);
        return;
      }
      if (code === 39) {
        event?.preventDefault?.();
        this.closeSidebarToContent();
        return;
      }
      if (code === 13 && current) {
        event?.preventDefault?.();
        activateLegacySidebarAction(String(current.dataset.action || ""), "calendar");
      }
      return;
    }
    const days = this.state.days || [];
    if (!days.length) return;
    const { row, col } = this.cursor;
    if (code === 37 || code === 39) {
      event?.preventDefault?.();
      const nextCol = col + (code === 39 ? 1 : -1);
      if (nextCol >= 0 && nextCol < days[row].entries.length) {
        this.cursor = { row, col: nextCol };
        playUiSound("move");
        this.focusCursor();
      }
      return;
    }
    if (code === 38 || code === 40) {
      event?.preventDefault?.();
      const nextRow = row + (code === 40 ? 1 : -1);
      if (nextRow >= 0 && nextRow < days.length) {
        this.cursor = { row: nextRow, col: Math.min(col, days[nextRow].entries.length - 1) };
        playUiSound("move");
        this.focusCursor();
      }
      return;
    }
    if (code === 13) {
      event?.preventDefault?.();
      this.openEntry(row, col);
    }
  },

  cleanup() {
    this.loadToken = (this.loadToken || 0) + 1;
    ScreenUtils.hide(this.container);
  }
};
