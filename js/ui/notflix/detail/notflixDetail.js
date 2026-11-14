import { isNotflixActive } from "../notflixAppearance.js";
import { playUiSound } from "../notflixSounds.js";
import { PlayerSettingsStore } from "../../../data/local/playerSettingsStore.js";
import { escapeText, nt } from "../home/notflixHomeMarkup.js";
import { clearHold, handleHoldRepeat, shortPressEvent, withHoldGuard } from "../input/holdGuard.js";
import {
  handleLinearVertical,
  isRailCard,
  renderNotflixInsight,
  scheduleRailPreview,
  stopRailPreview,
  syncActionsScroll
} from "./notflixDetailSections.js";

const KEY_LEFT = 37;
const KEY_UP = 38;
const KEY_RIGHT = 39;
const KEY_DOWN = 40;
const KEY_ENTER = 13;

const ROW_ICONS = {
  restart:
    "M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z",
  episodes: "M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z",
  similar: "M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z",
  audio:
    "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4zm10 6H4v-2h10zm6 0h-4v-2h4zm0-4H10v-2h10z",
  add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  check: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  trailer:
    "M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z",
  watched:
    "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z",
  shuffle:
    "M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z",
  play: "M8 5v14l11-7z"
};

const AUDIO_OPTIONS = [
  ["system", "notflix_av_default", "Default"],
  ["original", "notflix_av_original", "Original language"],
  ["es-419", "notflix_av_es419", "Spanish (Latin America)"],
  ["es", "notflix_av_es", "Spanish (Spain)"],
  ["en", "notflix_av_en", "English"]
];

const SUBTITLE_OPTIONS = [
  ["off", "notflix_av_off", "Off"],
  ["es-419", "notflix_av_es419", "Spanish (Latin America)"],
  ["es", "notflix_av_es", "Spanish (Spain)"],
  ["en", "notflix_av_en", "English"]
];

function svg(name) {
  return `<svg class="nf-dh-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${ROW_ICONS[name] || ""}"/></svg>`;
}

function isSeries(screen, meta) {
  const type = String(screen.params?.itemType || meta?.type || "").toLowerCase();
  return type === "series" || type === "tv" || type === "anime";
}

function seasonCount(screen) {
  const seasons = new Set();
  (Array.isArray(screen.episodes) ? screen.episodes : []).forEach((episode) => {
    const season = Number(episode?.season || 0);
    if (season > 0) seasons.add(season);
  });
  return seasons.size;
}

function episodeCode(season, episode) {
  return nt("notflix_episode_code", `S${season}:E${episode}`, { 1: season, 2: episode });
}

function heroEpisode(screen) {
  const progress = screen.getActiveResumeProgress?.() || null;
  const next = screen.nextEpisodeToWatch || null;
  const season = Number(progress?.season ?? next?.season ?? -1);
  const episode = Number(progress?.episode ?? next?.episode ?? 0);
  if (!(season >= 0) || !(episode > 0)) return null;
  const match =
    (Array.isArray(screen.episodes) ? screen.episodes : []).find(
      (entry) => Number(entry?.season) === season && Number(entry?.episode) === episode
    ) || next;
  return {
    season,
    episode,
    title: String(match?.title || progress?.episodeTitle || "").trim(),
    overview: String(match?.overview || "").trim(),
    started: Boolean(progress)
  };
}

function playButtonLabel(screen, meta, fallback, episodeInfo) {
  const resumed = Boolean(screen.getActiveResumeProgress?.());
  if (
    isSeries(screen, meta) &&
    episodeInfo &&
    (resumed || episodeInfo.season !== 1 || episodeInfo.episode !== 1)
  ) {
    const code = episodeCode(episodeInfo.season, episodeInfo.episode);
    return resumed
      ? nt("notflix_dh_resume_ep", `Resume ${code}`, { 1: code })
      : nt("notflix_dh_play_ep", `Play ${code}`, { 1: code });
  }
  if (resumed) return nt("notflix_dh_resume", "Resume");
  return nt("notflix_dh_play", "Play");
}

function row(action, iconName, label, extraClass = "") {
  return `<button class="nf-dh-row focusable${extraClass}" data-action="${action}"><span class="nf-dh-row-icon">${svg(iconName)}</span><span class="nf-dh-row-label">${escapeText(label)}</span></button>`;
}

export function renderNotflixDetailHero(screen, options) {
  const {
    meta,
    playLabel,
    showWatchedButton,
    logoOrTitle,
    externalRatings,
    hasTrailerCandidate,
    shuffleEnabled,
    shuffleLabel,
    helpers
  } = options;
  const series = isSeries(screen, meta);
  const year = (String(meta?.releaseInfo || meta?.released || meta?.year || "").match(/\d{4}/) || [
    ""
  ])[0];
  const genres = helpers.normalizeGenreList(meta).map(helpers.localizedGenreLabel).slice(0, 1);
  let length = "";
  if (series) {
    const count = seasonCount(screen);
    if (count > 0)
      length =
        count === 1
          ? nt("notflix_dh_season_one", "1 season")
          : nt("notflix_dh_seasons", `${count} seasons`, { 1: count });
  } else {
    length =
      helpers.formatHeroRuntime(meta?.runtime) ||
      helpers.formatRuntimeMinutes(meta?.runtimeMinutes || 0) ||
      "";
  }
  const metaLine = [year, ...genres, length].filter(Boolean);
  const ageRating = String(meta?.ageRating || "").trim();
  const imdbValue = helpers.resolveImdbRating(meta);
  const imdbText =
    imdbValue != null && String(imdbValue).trim() !== "" ? String(imdbValue).replace(",", ".") : "";
  const hasExternal = helpers.hasMdbListRatings(meta?.mdbListRatings);
  const ratingsHtml = hasExternal
    ? externalRatings
    : imdbText
      ? helpers.renderImdbBadge(imdbText)
      : "";
  const episodeInfo = series ? heroEpisode(screen) : null;
  const showEpisode = Boolean(
    episodeInfo &&
    (episodeInfo.started || episodeInfo.season !== 1 || episodeInfo.episode !== 1) &&
    (episodeInfo.title || episodeInfo.overview)
  );
  const description = String(meta?.description || "").trim();
  const progress = screen.getActiveResumeProgress?.() || null;
  const percent = progress
    ? Math.max(2, Math.min(98, Math.round(helpers.detailProgressFraction(progress) * 100)))
    : 0;
  const remaining = progress ? helpers.formatResumeRemaining(progress) : "";
  const label = shuffleEnabled ? playLabel : playButtonLabel(screen, meta, playLabel, episodeInfo);
  const cast = (Array.isArray(screen.castItems) ? screen.castItems : [])
    .map((entry) => String(entry?.name || "").trim())
    .filter(Boolean)
    .slice(0, 3);
  const rows = [];
  if (progress)
    rows.push(
      row("playFromBeginning", "restart", nt("notflix_dh_from_start", "Play from the beginning"))
    );
  if (series)
    rows.push(row("nfEpisodes", "episodes", nt("notflix_dh_episodes", "Episodes & more")));
  if (shuffleEnabled) rows.push(row("shuffleEpisodes", "shuffle", shuffleLabel));
  rows.push(row("nfMoreLike", "similar", nt("notflix_dh_more_like", "More like this")));
  if (hasTrailerCandidate)
    rows.push(row("toggleTrailer", "trailer", nt("notflix_dh_trailer", "Watch trailer")));
  rows.push(row("nfAudio", "audio", nt("notflix_dh_audio", "Audio & subtitles")));
  rows.push(
    row(
      "toggleLibrary",
      screen.isSavedInLibrary ? "check" : "add",
      screen.isSavedInLibrary
        ? nt("notflix_dh_in_list", "In My List")
        : nt("notflix_dh_add_list", "Add to My List"),
      screen.isSavedInLibrary ? " is-library-selected" : ""
    )
  );
  if (showWatchedButton)
    rows.push(
      row(
        "toggleWatched",
        screen.isMarkedWatched ? "check" : "watched",
        screen.isMarkedWatched
          ? nt("notflix_dh_watched", "Watched")
          : nt("notflix_dh_mark_watched", "Mark as watched"),
        screen.isMarkedWatched ? " is-selected" : ""
      )
    );
  return `
    <section class="detail-hero-section nf-dh">
      <div class="detail-hero-brand">
        ${logoOrTitle}
        <p class="detail-trailer-hint">${escapeText(nt("notflix_dh_back_hint", "Press back to return to details"))}</p>
      </div>
      <div class="detail-hero-body nf-dh-body">
        ${metaLine.length || ageRating ? `<div class="nf-dh-meta">${metaLine.map((part) => `<span>${escapeText(part)}</span>`).join('<span class="nf-dh-dot">•</span>')}${ageRating ? `<span class="nf-dh-age">${escapeText(ageRating)}</span>` : ""}</div>` : ""}
        ${ratingsHtml ? `<div class="nf-dh-ratings">${ratingsHtml}</div>` : ""}
        ${
          showEpisode
            ? `<div class="nf-dh-ep-title">${escapeText([episodeCode(episodeInfo.season, episodeInfo.episode), episodeInfo.title ? `"${episodeInfo.title}"` : ""].filter(Boolean).join(" "))}</div>${episodeInfo.overview ? `<p class="nf-dh-desc">${escapeText(episodeInfo.overview)}</p>` : ""}`
            : description
              ? `<p class="nf-dh-desc">${escapeText(description)}</p>`
              : ""
        }
        ${cast.length ? `<p class="nf-dh-cast"><span>${escapeText(nt("notflix_dh_cast", "Starring:"))}</span> ${escapeText(cast.join(", "))}</p>` : ""}
        <div class="series-detail-actions nf-dh-actions">
          <button class="series-primary-btn nf-dh-play focusable" data-action="playDefault">
            <span class="nf-dh-play-icon">${svg("play")}</span>
            <span class="nf-dh-play-label">${escapeText(label)}</span>
            ${percent ? `<span class="nf-dh-play-progress"><span style="width:${percent}%"></span></span>` : ""}
            ${remaining ? `<span class="nf-dh-play-remaining">${escapeText(remaining)}</span>` : ""}
          </button>
          ${rows.join("")}
        </div>
      </div>
    </section>
  `;
}

function actionNodes(screen) {
  return Array.from(screen.container?.querySelectorAll(".nf-dh-actions .focusable") || []);
}

function focusEpisodes(screen) {
  const lists = screen.getDetailFocusLists?.();
  if (!lists) return false;
  if (lists.episodes?.length) {
    return screen.focusEpisodeByIndex(screen.getRememberedEpisodeIndex(lists.episodes), {
      preserveVerticalScroll: false
    });
  }
  if (lists.seasons?.length) return screen.focusInList(lists.seasons, 0);
  return false;
}

function focusMoreLike(screen) {
  const series = isSeries(screen, screen.meta);
  if (series) screen.seriesInsightTab = "morelike";
  else screen.movieInsightTab = "morelike";
  screen.updateRenderedDetailSections?.(screen.meta);
  const lists = screen.getDetailFocusLists?.();
  if (lists?.moreLikeCards?.length) return screen.focusInList(lists.moreLikeCards, 0);
  if (lists?.insightTabs?.length) return screen.focusInList(lists.insightTabs, 0);
  return false;
}

function avState() {
  const settings = PlayerSettingsStore.get();
  const subtitle =
    settings.subtitlesEnabled === false
      ? "off"
      : String(settings.subtitleStyle?.preferredLanguage || settings.subtitleLanguage || "off");
  return {
    audio: String(settings.preferredAudioLanguage || "system"),
    subtitle
  };
}

function avColumn(title, options, selected, column, sheet) {
  const items = options
    .map(([id, key, fallback], index) => {
      const isSelected = id === selected;
      const isCursor = sheet.col === column && sheet.idx[column] === index;
      return `<div class="nf-av-item${isSelected ? " is-selected" : ""}${isCursor ? " is-cursor" : ""}"><span class="nf-av-check">${isSelected ? svg("check") : ""}</span><span>${escapeText(nt(key, fallback))}</span></div>`;
    })
    .join("");
  return `<div class="nf-av-col"><div class="nf-av-title">${escapeText(title)}</div>${items}</div>`;
}

function renderAv(screen) {
  const sheet = screen.nfAv;
  if (!sheet?.node) return;
  const state = avState();
  sheet.node.innerHTML = `
    <div class="nf-av-panel">
      ${avColumn(nt("notflix_av_audio", "Audio"), AUDIO_OPTIONS, state.audio, 0, sheet)}
      ${avColumn(nt("notflix_av_subtitles", "Subtitles"), SUBTITLE_OPTIONS, state.subtitle, 1, sheet)}
    </div>
  `;
}

function openAv(screen) {
  closeAv(screen);
  const state = avState();
  const node = document.createElement("div");
  node.className = "nf-av";
  const audioIndex = Math.max(
    0,
    AUDIO_OPTIONS.findIndex(([id]) => id === state.audio)
  );
  const subIndex = Math.max(
    0,
    SUBTITLE_OPTIONS.findIndex(([id]) => id === state.subtitle)
  );
  screen.nfAv = { node, col: 0, idx: [audioIndex, subIndex] };
  (screen.container.querySelector(".series-detail-shell") || screen.container).appendChild(node);
  renderAv(screen);
}

function closeAv(screen) {
  if (!screen.nfAv) return false;
  screen.nfAv.node?.remove();
  screen.nfAv = null;
  return true;
}

function selectAv(screen) {
  const sheet = screen.nfAv;
  if (sheet.col === 0) {
    const [id] = AUDIO_OPTIONS[sheet.idx[0]];
    PlayerSettingsStore.set({ preferredAudioLanguage: id });
  } else {
    const [id] = SUBTITLE_OPTIONS[sheet.idx[1]];
    const current = PlayerSettingsStore.get();
    if (id === "off") {
      PlayerSettingsStore.set({
        subtitlesEnabled: false,
        subtitleLanguage: "off",
        subtitleStyle: { ...current.subtitleStyle, preferredLanguage: "off" }
      });
    } else {
      PlayerSettingsStore.set({
        subtitlesEnabled: true,
        subtitleLanguage: id,
        subtitleStyle: { ...current.subtitleStyle, preferredLanguage: id }
      });
    }
  }
  playUiSound("confirm");
  renderAv(screen);
}

function handleAvKey(screen, code) {
  const sheet = screen.nfAv;
  const lengths = [AUDIO_OPTIONS.length, SUBTITLE_OPTIONS.length];
  if (code === KEY_LEFT || code === KEY_RIGHT) {
    sheet.col = code === KEY_LEFT ? 0 : 1;
  } else if (code === KEY_UP) {
    sheet.idx[sheet.col] = Math.max(0, sheet.idx[sheet.col] - 1);
  } else if (code === KEY_DOWN) {
    sheet.idx[sheet.col] = Math.min(lengths[sheet.col] - 1, sheet.idx[sheet.col] + 1);
  } else if (code === KEY_ENTER) {
    selectAv(screen);
    return true;
  } else {
    return false;
  }
  playUiSound("move");
  renderAv(screen);
  return true;
}

function canIntercept(screen) {
  return (
    isNotflixActive() &&
    screen.container &&
    !screen.pendingEpisodeSelection &&
    !screen.pendingMovieSelection &&
    !screen.detailHoldDialog &&
    !(screen.isTrailerPlaying && screen.trailerPlaybackMode === "manual")
  );
}

function noteActivity(screen) {
  if (screen.isTrailerPlaying && screen.trailerPlaybackMode === "autoplay") {
    screen.stopTrailerPlayback?.({ restartAutoplay: false });
  }
  if (!screen.isTrailerPlaying) screen.restartTrailerAutoplayTimer?.();
}

function afterFocus(screen) {
  const focused = screen.container?.querySelector(".focusable.focused");
  if (isRailCard(focused)) scheduleRailPreview(screen);
  else stopRailPreview(screen);
  syncActionsScroll(screen);
}

export function withNotflixDetail(base) {
  return {
    ...base,
    ...withHoldGuard(
      base,
      [
        "startPendingHeroHold",
        "startPendingPosterHold",
        "startPendingEpisodeHold",
        "startPendingSeasonHold"
      ],
      isNotflixActive
    ),
    renderSeriesInsightSection(...args) {
      if (isNotflixActive()) return renderNotflixInsight(this, "series");
      return base.renderSeriesInsightSection.apply(this, args);
    },
    renderMovieInsightSection(...args) {
      if (isNotflixActive()) return renderNotflixInsight(this, "movie");
      return base.renderMovieInsightSection.apply(this, args);
    },
    renderCompanySections(...args) {
      if (isNotflixActive()) return "";
      return base.renderCompanySections.apply(this, args);
    },
    restartTrailerAutoplayTimer(...args) {
      const focusedNode = this.container?.querySelector(".focusable.focused");
      if (
        isNotflixActive() &&
        focusedNode &&
        (isRailCard(focusedNode) || !focusedNode.closest?.(".detail-hero-section"))
      ) {
        if (this.trailerAutoplayTimer) {
          clearTimeout(this.trailerAutoplayTimer);
          this.trailerAutoplayTimer = null;
        }
        return undefined;
      }
      return base.restartTrailerAutoplayTimer.apply(this, args);
    },
    async onKeyUp(event) {
      const result = await base.onKeyUp?.call(
        this,
        isNotflixActive() ? shortPressEvent(this, event) : event
      );
      if (Number(event?.keyCode || 0) === 13) clearHold(this);
      return result;
    },
    async onKeyDown(event) {
      if (isNotflixActive() && handleHoldRepeat(this, event)) return undefined;
      if (Number(event?.keyCode || 0) !== 13) clearHold(this);
      if (!canIntercept(this)) return base.onKeyDown.call(this, event);
      const code = Number(event?.keyCode || 0);
      if (this.nfAv) {
        if (handleAvKey(this, code)) {
          event?.preventDefault?.();
          return undefined;
        }
        return base.onKeyDown.call(this, event);
      }
      const current = this.container.querySelector(".focusable.focused");
      const actions = actionNodes(this);
      const index = current ? actions.indexOf(current) : -1;
      if (
        current &&
        (code === KEY_UP || code === KEY_DOWN) &&
        !event?.pointerActivation &&
        !(index >= 0 && (code === KEY_UP || index < actions.length - 1))
      ) {
        stopRailPreview(this);
        if (handleLinearVertical(this, current, code, actions)) {
          event?.preventDefault?.();
          noteActivity(this);
          afterFocus(this);
          return undefined;
        }
      }
      if (index >= 0 && !event?.pointerActivation) {
        if (code === KEY_LEFT || code === KEY_RIGHT) {
          event?.preventDefault?.();
          noteActivity(this);
          return undefined;
        }
        if (code === KEY_UP) {
          event?.preventDefault?.();
          noteActivity(this);
          if (index > 0) {
            this.focusInList(actions, index - 1);
            playUiSound("move");
          }
          syncActionsScroll(this);
          return undefined;
        }
        if (code === KEY_DOWN && index < actions.length - 1) {
          event?.preventDefault?.();
          noteActivity(this);
          this.focusInList(actions, index + 1);
          playUiSound("move");
          syncActionsScroll(this);
          return undefined;
        }
        if (code === KEY_ENTER && !event?.repeat) {
          const action = String(current.dataset.action || "");
          if (action === "nfEpisodes" || action === "nfMoreLike" || action === "nfAudio") {
            event?.preventDefault?.();
            noteActivity(this);
            playUiSound("confirm");
            if (action === "nfEpisodes") focusEpisodes(this);
            else if (action === "nfMoreLike") focusMoreLike(this);
            else openAv(this);
            return undefined;
          }
        }
      }
      const result = await base.onKeyDown.call(this, event);
      if (code === KEY_UP && index < 0) {
        const after = this.container?.querySelector(".focusable.focused");
        const list = actionNodes(this);
        const landed = after ? list.indexOf(after) : -1;
        if (landed >= 0 && landed !== list.length - 1) this.focusInList(list, list.length - 1);
      }
      afterFocus(this);
      return result;
    },
    consumeBackRequest(...args) {
      if (isNotflixActive() && closeAv(this)) return true;
      return base.consumeBackRequest.apply(this, args);
    },
    fetchTmdbCastFallback(meta, ...rest) {
      const promise = base.fetchTmdbCastFallback.call(this, meta, ...rest);
      if (!isNotflixActive()) return promise;
      const token = this.detailLoadToken;
      Promise.resolve(promise)
        .then((cast) => {
          if (token !== this.detailLoadToken || !this.container) return;
          if (!Array.isArray(cast) || !cast.length) return;
          if (Array.isArray(this.castItems) && this.castItems.length) return;
          this.castItems = cast;
          this.updateRenderedDetailSections?.(this.meta);
        })
        .catch(() => {});
      return promise;
    },
    cleanup(...args) {
      closeAv(this);
      stopRailPreview(this);
      return base.cleanup?.apply(this, args);
    }
  };
}
