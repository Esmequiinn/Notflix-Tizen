import { Router } from "../../navigation/routerState.js";
import { PlayerController } from "../../../core/player/playerController.js";
import { isNotflixActive } from "../notflixAppearance.js";
import { escapeText, nt } from "../home/notflixHomeMarkup.js";
import { playUiSound } from "../notflixSounds.js";
import { getPreloadPercent, keepSpinning } from "./notflixLoading.js";
import { segmentCategory } from "../../../core/player/skipIntervalRules.js";
import { PlayerSettingsStore } from "../../../data/local/playerSettingsStore.js";
import { syncHtmlSubtitleClearance } from "../../screens/player/subtitleOverlayClearance.js";
import { formatNextEpisodeAirDate } from "../../screens/player/playerScreenHelpers-08-track-list-to-array.js";

function svgIcon(body) {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(markup)}`;
}

const ICON_BACK = svgIcon(
  '<path fill="#fff" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z"/>'
);
const ICON_RESTART = svgIcon(
  '<path fill="#fff" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/><path fill="#fff" d="M10.2 10.2v5.6l4.6-2.8z"/>'
);
const ICON_NEXT = "assets/icons/ic_player_skip_next.svg";

function active(screen) {
  return isNotflixActive() && !screen.isExternalFrameMode?.();
}

function speedLabel(screen) {
  const speed = Number(screen.getPlaybackSpeed?.() || 1);
  return `${speed.toFixed(speed % 1 ? 2 : 0)}x`;
}

function buildControls(screen) {
  const paused = screen.getPlaybackControlPaused();
  const uiState = screen.getPlayerUiState?.() || {};
  const nextEpisode = screen.resolveNextEpisodeInfo?.();
  const controls = [
    {
      action: "playPause",
      icon: paused ? "assets/icons/ic_player_play.svg" : "assets/icons/ic_player_pause.svg",
      title: paused ? nt("cd_play", "Play") : nt("cd_pause", "Pause"),
      primary: true,
      className: "nf-pc-play"
    }
  ];
  const pill = (action, label, extra = "") => ({
    action,
    label,
    title: label,
    className: `nf-pc-pill${extra ? ` ${extra}` : ""}`
  });
  controls.push(pill("subtitleDialog", nt("notflix_pl_subtitles", "Subtitles")));
  controls.push(pill("audioTrack", nt("notflix_pl_audio", "Audio")));
  controls.push(pill("source", nt("notflix_pl_sources", "Sources")));
  if (Array.isArray(uiState.episodesAll) && uiState.episodesAll.length) {
    controls.push(pill("episodes", nt("notflix_pl_episodes", "Episodes")));
  }
  if (screen.isPartyButtonAvailable?.()) {
    controls.push(pill("party", nt("notflix_pl_party", "Watch party")));
  }
  if ((screen.getPlaybackSpeedOptions?.() || []).length > 1) {
    controls.push(
      pill(
        "speed",
        nt("notflix_pl_speed", `Speed ${speedLabel(screen)}`, { 1: speedLabel(screen) })
      )
    );
  }
  controls.push(pill("aspect", nt("notflix_pl_aspect", "Screen")));
  controls.push(pill("streamInfo", nt("notflix_pl_info", "Info")));
  if (
    Array.isArray(screen.playerChapters) &&
    screen.playerChapters.length > 1 &&
    screen.isLivePlayback?.() !== true
  ) {
    controls.push(pill("chapters", nt("notflix_pl_chapters", "Chapters")));
  }
  const top = [
    { action: "nfBack", icon: ICON_BACK, title: nt("notflix_pl_back", "Back") },
    { action: "nfRestart", icon: ICON_RESTART, title: nt("notflix_pl_restart", "Start over") }
  ];
  if (nextEpisode?.hasAired && !screen.nextEpisodeLaunching) {
    top.push({
      action: "playNextEpisode",
      icon: ICON_NEXT,
      title: nt("notflix_pl_next", "Next episode")
    });
  }
  top.forEach((control, index) => {
    controls.push({ ...control, useMask: true, className: `nf-pc-top nf-pc-top-${index}` });
  });
  return controls;
}

function groupsOf(controls) {
  const top = [];
  const pills = [];
  let play = -1;
  controls.forEach((control, index) => {
    const name = String(control.className || "");
    if (name.includes("nf-pc-top")) top.push(index);
    else if (name.includes("nf-pc-pill")) pills.push(index);
    else if (control.action === "playPause") play = index;
  });
  return { top, pills, play };
}

function focusButton(screen, index) {
  screen.stickyProgressFocus = false;
  screen.autoHideControlsAfterSeek = false;
  screen.controlFocusZone = "buttons";
  screen.controlFocusIndex = index;
  screen.syncControlFocusDom();
}

function focusRow(screen) {
  const groups = groupsOf(screen.getControlDefinitions());
  if (screen.nfRowFocus === "progress" && screen.isSeekBarAvailable?.()) {
    screen.focusProgressBar();
    return;
  }
  if (groups.play >= 0) focusButton(screen, groups.play);
  else screen.focusProgressBar();
}

function handleNavigation(screen, keyCode) {
  const controls = screen.getControlDefinitions();
  const { top, pills, play } = groupsOf(controls);
  const zone = screen.controlFocusZone;
  const index = Number(screen.controlFocusIndex || 0);
  if (zone === "progress") {
    if (keyCode === 38) {
      if (screen.focusSkipIntroButton?.()) return true;
      if (screen.focusNextEpisodeCard?.()) return true;
      if (!top.length) return true;
      screen.nfRowFocus = "progress";
      focusButton(screen, top[Math.min(screen.nfTopIndex || 0, top.length - 1)]);
      return true;
    }
    if (keyCode === 40) {
      screen.nfRowFocus = "progress";
      if (pills.length)
        focusButton(screen, pills[Math.min(screen.nfPillIndex || 0, pills.length - 1)]);
      return true;
    }
    return false;
  }
  if (zone !== "buttons") return false;
  const topPosition = top.indexOf(index);
  if (topPosition >= 0) {
    if (keyCode === 37 || keyCode === 39) {
      const next = Math.max(0, Math.min(top.length - 1, topPosition + (keyCode === 37 ? -1 : 1)));
      screen.nfTopIndex = next;
      if (next !== topPosition) focusButton(screen, top[next]);
      return true;
    }
    if (keyCode === 40) {
      focusRow(screen);
      return true;
    }
    return true;
  }
  if (index === play) {
    if (keyCode === 39) {
      if (screen.isSeekBarAvailable?.()) {
        screen.nfRowFocus = "progress";
        screen.focusProgressBar();
      }
      return true;
    }
    if (keyCode === 38) {
      screen.nfRowFocus = "play";
      if (top.length) focusButton(screen, top[Math.min(screen.nfTopIndex || 0, top.length - 1)]);
      return true;
    }
    if (keyCode === 40) {
      screen.nfRowFocus = "play";
      if (pills.length)
        focusButton(screen, pills[Math.min(screen.nfPillIndex || 0, pills.length - 1)]);
      return true;
    }
    return true;
  }
  const pillPosition = pills.indexOf(index);
  if (pillPosition >= 0) {
    if (keyCode === 37 || keyCode === 39) {
      const next = Math.max(
        0,
        Math.min(pills.length - 1, pillPosition + (keyCode === 37 ? -1 : 1))
      );
      screen.nfPillIndex = next;
      if (next !== pillPosition) focusButton(screen, pills[next]);
      return true;
    }
    if (keyCode === 38) {
      focusRow(screen);
      return true;
    }
    if (keyCode === 40) {
      screen.setControlsVisible(false);
      return true;
    }
  }
  return false;
}

function canNavigate(screen) {
  return (
    screen.controlsVisible &&
    !screen.pauseOverlayVisible &&
    !screen.episodeOptionsDialogVisible &&
    !screen.streamInfoVisible &&
    !screen.chaptersPanelVisible &&
    !screen.partyPanelVisible &&
    !screen.episodePanelVisible &&
    !screen.isDialogOpen?.() &&
    !screen.isPostPlayVisible?.() &&
    !screen.isStartupErrorVisible?.() &&
    (screen.controlFocusZone === "buttons" || screen.controlFocusZone === "progress")
  );
}

function headMarkup(screen) {
  const params = screen.params || {};
  const title = String(params.playerTitle || params.title || params.itemId || "");
  let line = "";
  if (params.season != null && params.episode != null) {
    const episodeTitle = String(params.playerSubtitle || params.episodeTitle || "").trim();
    line = episodeTitle
      ? nt("notflix_pl_episode_line", `S${params.season}: E${params.episode} «${episodeTitle}»`, {
          1: params.season,
          2: params.episode,
          3: episodeTitle
        })
      : `T${params.season}: E${params.episode}`;
  }
  return { title, line };
}

function decorateUi(screen) {
  const refs = screen.uiRefs;
  const overlay = refs?.controlsOverlay;
  if (!overlay || overlay.querySelector(".nf-pl-head")) return;
  refs.root?.classList.add("nf-player");
  screen.nfLoadLabels = [
    mountSpinner(refs.loadingOverlay?.querySelector(".player-loading-center")),
    mountSpinner(refs.bufferingSpinner)
  ].filter(Boolean);
  const { title, line } = headMarkup(screen);
  const head = document.createElement("div");
  head.className = "nf-pl-head";
  head.innerHTML = `<div class="nf-pl-title">${escapeText(title)}</div>${line ? `<div class="nf-pl-line">${escapeText(line)}</div>` : ""}`;
  overlay.appendChild(head);
  const bar = overlay.querySelector(".player-controls-bar");
  const progress = refs.progressShell;
  if (bar && progress) {
    const row = document.createElement("div");
    row.className = "nf-pl-row";
    row.innerHTML = '<span class="nf-pl-cur">0:00</span><span class="nf-pl-dur">0:00</span>';
    bar.insertBefore(row, bar.firstChild);
    row.insertBefore(progress, row.lastChild);
    screen.nfTimeRefs = {
      current: row.querySelector(".nf-pl-cur"),
      duration: row.querySelector(".nf-pl-dur")
    };
  }
  syncTimes(screen);
}

function syncTimes(screen) {
  const refs = screen.nfTimeRefs;
  if (!refs) return;
  const text = String(screen.lastUiTickState?.timeLabelText || "");
  if (text === screen.nfLastTimeText) return;
  screen.nfLastTimeText = text;
  const parts = text.split(" / ");
  if (parts.length === 2) {
    if (refs.current.textContent !== parts[0]) refs.current.textContent = parts[0];
    if (refs.duration.textContent !== parts[1]) refs.duration.textContent = parts[1];
  } else {
    refs.current.textContent = text;
    refs.duration.textContent = "";
  }
}

function renderNotflixPause(screen) {
  const overlay = screen.uiRefs?.pauseOverlay;
  if (!overlay || overlay.classList.contains("hidden") || screen.stillWatchingPromptVisible) return;
  const meta = screen.pauseOverlayMeta || screen.buildPauseOverlayMeta?.() || {};
  const { title, line } = headMarkup(screen);
  const name = meta.title || title;
  const brand = meta.logoUrl
    ? `<img class="nf-pp-logo" src="${escapeText(meta.logoUrl)}" alt="${escapeText(name)}" />`
    : `<div class="nf-pp-title">${escapeText(name)}</div>`;
  const markup = `<div class="nf-pp-shade"></div><div class="nf-pp-info">${brand}${line ? `<div class="nf-pp-line">${escapeText(line)}</div>` : ""}</div>`;
  if (screen.nfPauseMarkup === markup && overlay.querySelector(".nf-pp-info")) return;
  screen.nfPauseMarkup = markup;
  overlay.innerHTML = markup;
}

const SEARCH_FILL = 72;
const SEARCH_FILL_SECONDS = 12;

function nextButtonState(screen) {
  if (screen.nextEpisodeCardCountdownSec != null) return "count";
  if (screen.nextEpisodeLaunching) return "search";
  return "idle";
}

function applyNextFill(screen, fill) {
  const state = nextButtonState(screen);
  if (fill.dataset.state === state) return;
  const previous = fill.dataset.state || "idle";
  fill.dataset.state = state;
  fill.parentElement?.classList.toggle("nf-filling", state !== "idle");
  if (state === "idle") {
    fill.style.transition = "none";
    fill.style.width = "0%";
    return;
  }
  if (previous === "idle") {
    fill.style.transition = "none";
    fill.style.width = "0%";
    void fill.offsetWidth;
  }
  if (state === "search") {
    fill.style.transition = `width ${SEARCH_FILL_SECONDS}s linear`;
    fill.style.width = `${SEARCH_FILL}%`;
    return;
  }
  const parent = fill.parentElement;
  const current = parent && parent.offsetWidth ? (fill.offsetWidth / parent.offsetWidth) * 100 : 0;
  fill.style.transition = "none";
  fill.style.width = `${current}%`;
  void fill.offsetWidth;
  const seconds = Math.max(1, Number(screen.nextEpisodeCardCountdownSec || 3));
  fill.style.transition = `width ${seconds}s linear`;
  fill.style.width = "100%";
}

function renderNotflixNextButton(screen) {
  const card = screen.uiRefs?.nextEpisodeCard;
  if (!card) return;
  screen.ensureNextEpisodeStreamsPrefetch?.();
  const nextEpisode = screen.resolveNextEpisodeInfo();
  const hidden = !screen.isNextEpisodeCardVisible();
  card.classList.toggle("hidden", hidden);
  card.classList.add("nf-next");
  if (hidden) {
    if (card.childNodes.length) card.innerHTML = "";
    screen.nextEpisodeCardRenderedKey = "";
    if (screen.controlFocusZone === "nextEpisode") {
      screen.controlFocusZone =
        screen.controlsVisible && screen.isSeekBarAvailable() ? "progress" : "buttons";
    }
    syncHtmlSubtitleClearance(screen);
    return;
  }
  if (
    !screen.controlsVisible &&
    screen.controlFocusZone !== "skipIntro" &&
    screen.controlFocusZone !== "nextEpisode"
  ) {
    screen.stickyProgressFocus = false;
    screen.autoHideControlsAfterSeek = false;
    screen.controlFocusZone = "nextEpisode";
    screen.resetControlsAutoHide();
  }
  const label = nextEpisode.hasAired
    ? nt("next_episode_label", "Next episode")
    : [nt("next_episode_unaired", "Unaired"), formatNextEpisodeAirDate(nextEpisode.released)]
        .filter(Boolean)
        .join(" · ");
  const key = `${nextEpisode.videoId}|${label}`;
  if (screen.nextEpisodeCardRenderedKey !== key || !card.querySelector(".nf-next-fill")) {
    card.innerHTML = `
      <div class="player-next-episode-card-inner focusable nf-next-btn${nextEpisode.hasAired ? " is-playable" : ""}" tabindex="-1" role="button" data-player-pointer-action="nextEpisode">
        <span class="nf-next-fill" data-state="idle"></span>
        <span class="nf-next-content"><span class="nf-next-icon" aria-hidden="true"></span><span class="nf-next-label">${escapeText(label)}</span></span>
      </div>
    `;
    screen.nextEpisodeCardRenderedKey = key;
  }
  const fill = card.querySelector(".nf-next-fill");
  if (fill) applyNextFill(screen, fill);
  if (screen.activeSkipInterval && segmentCategory(screen.activeSkipInterval.type) === "ending") {
    screen.uiRefs?.skipIntro?.classList.add("hidden");
  }
  screen.syncNextEpisodeCardFocusState();
  syncHtmlSubtitleClearance(screen);
}

function syncNotflixSkipTheme(button) {
  if (!button) return;
  ["background", "background-color", "color", "box-shadow"].forEach((name) =>
    button.style.removeProperty(name)
  );
  button.querySelectorAll(".player-skip-intro-icon, .player-skip-intro-label").forEach((node) => {
    node.style.removeProperty("color");
    node.style.removeProperty("-webkit-text-fill-color");
  });
}

const LOAD_TICK_MS = 250;
const LOAD_CEILING = 92;

function spinnerMarkup() {
  return '<div class="nf-ld" aria-hidden="true"><span class="nf-ld-spin"></span><span class="nf-ld-pct">0%</span></div>';
}

function mountSpinner(host) {
  if (!host || host.querySelector(".nf-ld")) return null;
  host.insertAdjacentHTML("afterbegin", spinnerMarkup());
  return host.querySelector(".nf-ld-pct");
}

function loadingShown(screen) {
  const overlay = screen.uiRefs?.loadingOverlay;
  const spinner = screen.uiRefs?.bufferingSpinner;
  return {
    overlay: Boolean(overlay && !overlay.classList.contains("hidden") && screen.loadingVisible),
    spinner: Boolean(spinner && !spinner.classList.contains("hidden"))
  };
}

function realProgress(screen) {
  const values = [];
  const buffering = Number(PlayerController.avplayBufferingProgress);
  if (Number.isFinite(buffering) && buffering > 0) values.push(buffering);
  const fill = Number(screen.loadingLogoFillProgress);
  if (screen.loadingLogoFillActive && Number.isFinite(fill) && fill > 0) values.push(fill * 100);
  return values.length ? Math.max(...values) : 0;
}

function tickLoading(screen) {
  const shown = loadingShown(screen);
  if (!shown.overlay && !shown.spinner) {
    stopLoadingTicker(screen);
    return;
  }
  keepSpinning();
  const current = Number(screen.nfLoadPercent || 0);
  const synthetic = current + (LOAD_CEILING - current) * 0.035;
  const next = Math.min(99, Math.max(current, synthetic, Math.min(99, realProgress(screen))));
  screen.nfLoadPercent = next;
  const text = `${Math.floor(next)}%`;
  (screen.nfLoadLabels || []).forEach((label) => {
    if (label && label.textContent !== text) label.textContent = text;
  });
}

function startLoadingTicker(screen) {
  if (screen.nfLoadTimer) return;
  screen.nfLoadPercent = screen.hasPresentedPlaybackFrame ? 0 : getPreloadPercent();
  tickLoading(screen);
  screen.nfLoadTimer = setInterval(() => tickLoading(screen), LOAD_TICK_MS);
}

function stopLoadingTicker(screen) {
  if (screen.nfLoadTimer) {
    clearInterval(screen.nfLoadTimer);
    screen.nfLoadTimer = null;
  }
  screen.nfLoadPercent = 0;
  (screen.nfLoadLabels || []).forEach((label) => {
    if (label) label.textContent = "0%";
  });
}

function syncLoadingTicker(screen) {
  const shown = loadingShown(screen);
  if (shown.overlay || shown.spinner) startLoadingTicker(screen);
  else if (screen.nfLoadTimer) stopLoadingTicker(screen);
}

const POST_ROTATE_MS = 10000;

function disablePostTrailer(screen) {
  const controller = screen.postPlayRecommendationController;
  if (!controller || controller.nfNoAutoTrailer) return;
  controller.nfNoAutoTrailer = true;
  const original = controller.readAutoPlayTrailerSetting?.bind(controller);
  controller.readAutoPlayTrailerSetting = () =>
    isNotflixActive() ? false : (original?.() ?? false);
  if (isNotflixActive()) controller.autoPlayTrailerEnabled = false;
}

function stopPostRotation(screen) {
  if (screen.nfPostTimer) {
    clearInterval(screen.nfPostTimer);
    screen.nfPostTimer = null;
  }
}

function postBlocked(screen, state) {
  return (
    !state.isVisible ||
    !state.recommendation ||
    state.isChangingRecommendation ||
    state.isTrailerPlaying ||
    state.recommendationCount < 2 ||
    screen.postPlayManualDialogVisible ||
    screen.postPlaySynopsisVisible ||
    screen.postPlayFocusedAction === "playerWindow"
  );
}

function rotatePost(screen) {
  const state = screen.getPostPlayState();
  if (!state.isVisible) {
    stopPostRotation(screen);
    return;
  }
  if (postBlocked(screen, state)) {
    screen.nfPostChangedAt = Date.now();
    return;
  }
  if (Date.now() - Number(screen.nfPostChangedAt || 0) < POST_ROTATE_MS) return;
  const next = (state.recommendationIndex + 1) % state.recommendationCount;
  screen.nfPostChangedAt = Date.now();
  screen.postPlayRecommendationController?.selectRecommendation?.(next);
}

function decoratePost(screen) {
  const mount = screen.uiRefs?.postPlay;
  const state = screen.getPostPlayState();
  if (!mount || !state.isVisible || !state.recommendation) {
    if (!state.isVisible) stopPostRotation(screen);
    return;
  }
  mount.classList.add("nf-post");
  if (screen.nfPostIndex !== state.recommendationIndex) {
    screen.nfPostIndex = state.recommendationIndex;
    screen.nfPostChangedAt = Date.now();
  }
  if (!screen.nfPostTimer) {
    screen.nfPostChangedAt = screen.nfPostChangedAt || Date.now();
    screen.nfPostTimer = setInterval(() => rotatePost(screen), 500);
  }
  const content = mount.querySelector(".player-post-play-content");
  if (!content) return;
  let extra = content.querySelector(".nf-post-extra");
  if (!extra) {
    extra = document.createElement("div");
    extra.className = "nf-post-extra";
    extra.innerHTML =
      '<div class="nf-post-progress"><div class="nf-post-track"><span class="nf-post-fill"></span></div><span class="nf-post-count"></span></div><div class="nf-post-hint"></div>';
    content.appendChild(extra);
  }
  const count = Math.max(1, Number(state.recommendationCount || 1));
  extra.querySelector(".nf-post-count").textContent = `${state.recommendationIndex + 1} / ${count}`;
  const hint = [
    count > 1 ? nt("notflix_post_rotate", "Changes every 10 seconds") : "",
    state.canReturnToPlayer ? nt("notflix_post_up", "Up to return to the video") : "",
    nt("notflix_post_back", "Back to close")
  ]
    .filter(Boolean)
    .join("  ·  ");
  const hintNode = extra.querySelector(".nf-post-hint");
  if (hintNode.textContent !== hint) hintNode.textContent = hint;
  const progress = extra.querySelector(".nf-post-progress");
  progress.style.display = count > 1 ? "" : "none";
  const fill = extra.querySelector(".nf-post-fill");
  const key = `${state.recommendation.id}|${state.recommendationIndex}|${screen.nfPostChangedAt}`;
  if (fill.dataset.key === key) return;
  fill.dataset.key = key;
  const elapsed = Math.min(
    POST_ROTATE_MS,
    Date.now() - Number(screen.nfPostChangedAt || Date.now())
  );
  fill.style.transition = "none";
  fill.style.width = `${(elapsed / POST_ROTATE_MS) * 100}%`;
  void fill.offsetWidth;
  fill.style.transition = `width ${Math.max(0, POST_ROTATE_MS - elapsed)}ms linear`;
  fill.style.width = "100%";
}

const LATIN_HINT = /(latino|latin|latam|latinoam|es-419|es-mx|es_419|es_mx|mexic|\bmx\b|\blat\b)/i;
const CASTILIAN_HINT = /(castellano|castilian|espa(ñ|n)a|spain|es-es|es_es|\beur\b|europe)/i;

function spanishVariant(target) {
  const value = String(target || "").toLowerCase();
  if (!value.startsWith("es")) return "";
  if (/^es[-_](419|mx|us|ar|co|cl|pe|ve|la|latam)/.test(value)) return "latin";
  if (/^es[-_]es/.test(value)) return "castilian";
  return "";
}

function reorderTargets(targets) {
  const list = Array.isArray(targets) ? [...targets] : [];
  if (list.length < 2) return list;
  const first = String(list[0] || "");
  const firstBase = first.split("-")[0];
  const specific = list.findIndex(
    (target, index) =>
      index > 0 &&
      String(target).split("-")[0] === firstBase &&
      String(target).includes("-") &&
      !first.includes("-")
  );
  if (specific > 0) {
    const [moved] = list.splice(specific, 1);
    list.unshift(moved);
  }
  return list;
}

function optionText(option) {
  return [option.languageKey, option.languageLabel, option.label, option.secondary]
    .map((value) => String(value || ""))
    .join(" ");
}

function rankSpanish(options, target) {
  const variant = spanishVariant(target);
  if (!variant) return null;
  const wanted = variant === "latin" ? LATIN_HINT : CASTILIAN_HINT;
  const other = variant === "latin" ? CASTILIAN_HINT : LATIN_HINT;
  const spanish = options.filter(
    (option) =>
      option.supported &&
      String(option.languageKey || "")
        .toLowerCase()
        .startsWith("es")
  );
  return (
    spanish.find((option) => wanted.test(optionText(option))) ||
    spanish.find((option) => !other.test(optionText(option))) ||
    null
  );
}

function patchPlayButton(screen) {
  const wrap = screen.uiRefs?.controlButtons;
  if (!wrap) return;
  const controls = screen.getControlDefinitions();
  const buttons = Array.from(wrap.querySelectorAll(".player-control-btn"));
  if (buttons.length !== controls.length) return;
  const sameActions = buttons.every(
    (button, index) => button.dataset.action === String(controls[index]?.action || "")
  );
  if (!sameActions) return;
  const index = controls.findIndex((control) => control.action === "playPause");
  if (index < 0) return;
  const control = controls[index];
  const button = buttons[index];
  const icon = button.querySelector(".player-control-icon-mask");
  if (!icon) return;
  const url = `url('${control.icon}')`;
  if (icon.dataset.nfIcon !== control.icon) {
    icon.dataset.nfIcon = control.icon;
    icon.style.webkitMaskImage = url;
    icon.style.maskImage = url;
  }
  if (button.getAttribute("title") !== control.title) button.setAttribute("title", control.title);
  screen.renderedControlSignature = screen.getControlRenderSignature(controls);
}

function healPausedState(screen) {
  if (!screen.paused || screen.seekPreviewSeconds != null || screen.loadingVisible) {
    screen.nfHealSamples = 0;
    screen.nfHealLast = null;
    return;
  }
  const now = Number(screen.getPlaybackCurrentSeconds?.() || 0);
  const last = screen.nfHealLast;
  screen.nfHealLast = now;
  if (last == null) return;
  const delta = now - last;
  if (delta > 0.2 && delta < 3) screen.nfHealSamples = (screen.nfHealSamples || 0) + 1;
  else screen.nfHealSamples = 0;
  if (screen.nfHealSamples < 2) return;
  screen.nfHealSamples = 0;
  screen.paused = false;
  screen.dismissPauseOverlay?.();
  screen.updateMediaSessionPlaybackState?.();
  screen.renderControlButtons?.();
}

function endingStart(screen, durationSeconds) {
  if (!PlayerSettingsStore.get().skipIntroEnabled) return null;
  const starts = (Array.isArray(screen.skipIntervals) ? screen.skipIntervals : [])
    .filter((interval) => segmentCategory(interval?.type) === "ending")
    .map((interval) => Number(interval.startTime))
    .filter((start) => Number.isFinite(start) && start > 0 && start < durationSeconds);
  return starts.length ? Math.min(...starts) : null;
}

function sourcesSignature(list) {
  if (!Array.isArray(list) || !list.length) return "0";
  return `${list.length}|${list[0]?.url || ""}|${list[list.length - 1]?.url || ""}`;
}

export function withNotflixPlayerUi(base) {
  return {
    ...base,
    renderPlayerUi(...args) {
      this.nfTimeRefs = null;
      this.nfLastTimeText = "";
      this.nfPauseMarkup = "";
      this.nfTopIndex = 0;
      this.nfPillIndex = 0;
      this.nfRowFocus = "play";
      const result = base.renderPlayerUi.apply(this, args);
      if (active(this)) {
        decorateUi(this);
        disablePostTrailer(this);
      }
      return result;
    },
    consumeBackRequest(...args) {
      if (this.streamInfoVisible) {
        this.closeStreamInfo?.();
        return true;
      }
      return base.consumeBackRequest.apply(this, args);
    },
    shouldReturnToStreamOnBack(...args) {
      if (active(this) && this.params?.itemId) return false;
      return base.shouldReturnToStreamOnBack.apply(this, args);
    },
    renderControlButtons(...args) {
      if (active(this)) patchPlayButton(this);
      return base.renderControlButtons.apply(this, args);
    },
    getControlDefinitions(...args) {
      if (!active(this)) return base.getControlDefinitions.apply(this, args);
      return buildControls(this);
    },
    performControlAction(action, ...rest) {
      if (active(this)) {
        if (action === "nfBack") {
          playUiSound("back");
          if (!this.navigateBackToStreamScreen?.()) Router.back({ skipConsume: true });
          return undefined;
        }
        if (action === "nfRestart") {
          this.seekPlaybackSeconds(0);
          this.resetControlsAutoHide?.();
          return undefined;
        }
      }
      return base.performControlAction.call(this, action, ...rest);
    },
    renderProgressPosition(...args) {
      const result = base.renderProgressPosition.apply(this, args);
      if (this.nfTimeRefs) syncTimes(this);
      return result;
    },
    updateUiTick(...args) {
      const result = base.updateUiTick.apply(this, args);
      if (this.nfTimeRefs) syncTimes(this);
      if (active(this)) {
        syncLoadingTicker(this);
        healPausedState(this);
      }
      return result;
    },
    updateLoadingVisibility(...args) {
      const result = base.updateLoadingVisibility.apply(this, args);
      if (active(this)) syncLoadingTicker(this);
      return result;
    },
    getNextEpisodeCardThresholdReached(position, duration, ...rest) {
      const reached = base.getNextEpisodeCardThresholdReached.call(
        this,
        position,
        duration,
        ...rest
      );
      if (reached || !active(this)) return reached;
      const total = Number(duration ?? this.getPlaybackDurationSeconds());
      const current = Number(position ?? this.getPlaybackCurrentSeconds());
      if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(current)) return reached;
      if (!this.isNaturalPlaybackCompletionEligible(total)) return reached;
      const start = endingStart(this, total);
      return start != null && current >= start && current <= total + 1;
    },
    renderSkipIntroButton(...args) {
      const result = base.renderSkipIntroButton.apply(this, args);
      if (
        active(this) &&
        this.activeSkipInterval &&
        segmentCategory(this.activeSkipInterval.type) === "ending" &&
        this.isNextEpisodeCardVisible?.()
      ) {
        this.uiRefs?.skipIntro?.classList.add("hidden");
        if (this.controlFocusZone === "skipIntro") this.controlFocusZone = "nextEpisode";
      }
      return result;
    },
    renderPostPlayRecommendation(...args) {
      if (active(this)) disablePostTrailer(this);
      const result = base.renderPostPlayRecommendation.apply(this, args);
      if (active(this)) decoratePost(this);
      return result;
    },
    handlePostPlayKey(event, ...rest) {
      if (active(this)) {
        this.nfPostChangedAt = Date.now();
        const fill = this.uiRefs?.postPlay?.querySelector(".nf-post-fill");
        if (fill) fill.dataset.key = "";
      }
      const result = base.handlePostPlayKey.call(this, event, ...rest);
      if (active(this)) decoratePost(this);
      return result;
    },
    renderNextEpisodeCard(...args) {
      if (!active(this)) return base.renderNextEpisodeCard.apply(this, args);
      return renderNotflixNextButton(this);
    },
    syncSkipIntroButtonTheme(button, ...rest) {
      if (!active(this)) return base.syncSkipIntroButtonTheme.call(this, button, ...rest);
      return syncNotflixSkipTheme(button);
    },
    renderPauseOverlay(...args) {
      const result = base.renderPauseOverlay.apply(this, args);
      if (active(this)) renderNotflixPause(this);
      return result;
    },
    getStartupPreferredAudioLanguageTargets(...args) {
      const targets = base.getStartupPreferredAudioLanguageTargets.apply(this, args);
      return active(this) ? reorderTargets(targets) : targets;
    },
    matchesStartupAudioTarget(option, target, ...rest) {
      const matched = base.matchesStartupAudioTarget.call(this, option, target, ...rest);
      if (!matched || !active(this) || !option) return matched;
      const variant = spanishVariant(target);
      if (!variant) return matched;
      const wanted = variant === "latin" ? LATIN_HINT : CASTILIAN_HINT;
      const other = variant === "latin" ? CASTILIAN_HINT : LATIN_HINT;
      const text = optionText(option);
      if (wanted.test(text)) return true;
      if (other.test(text)) return false;
      const better = this.collectAudioOptionItems().some(
        (entry) => entry !== option && entry.supported && wanted.test(optionText(entry))
      );
      return !better;
    },
    findStartupPreferredAudioOption(targets, ...rest) {
      if (active(this)) {
        const list = Array.isArray(targets) ? targets.filter(Boolean) : [];
        const options = this.collectAudioOptionItems();
        for (const target of list) {
          if (!spanishVariant(target)) break;
          const ranked = rankSpanish(options, target);
          if (ranked) return ranked;
        }
      }
      return base.findStartupPreferredAudioOption.call(this, targets, ...rest);
    },
    getOrderedStreamCandidates(...args) {
      if (!active(this)) return base.getOrderedStreamCandidates.apply(this, args);
      const signature = sourcesSignature(this.streamCandidates);
      if (
        this.nfOrderedSources &&
        this.nfOrderedSourcesFrom === this.streamCandidates &&
        this.nfOrderedSourcesSignature === signature
      ) {
        return this.nfOrderedSources;
      }
      const ordered = base.getOrderedStreamCandidates.apply(this, args);
      this.nfOrderedSources = ordered;
      this.nfOrderedSourcesFrom = this.streamCandidates;
      this.nfOrderedSourcesSignature = signature;
      return ordered;
    },
    moveSourcesFocus(direction, ...rest) {
      if (active(this) && direction === "down" && this.sourcesFocus?.zone === "filter") {
        const list = this.getFilteredSources(this.getOrderedStreamCandidates());
        if (list.length) {
          this.sourcesFocus = { zone: "list", index: 0 };
          return undefined;
        }
      }
      return base.moveSourcesFocus.call(this, direction, ...rest);
    },
    async onKeyDown(event) {
      const keyCode = Number(event?.keyCode || 0);
      if (
        active(this) &&
        keyCode === 40 &&
        this.controlsVisible &&
        (this.controlFocusZone === "nextEpisode" || this.controlFocusZone === "skipIntro") &&
        !this.isDialogOpen?.() &&
        !this.pauseOverlayVisible
      ) {
        event?.preventDefault?.();
        if (this.isSeekBarAvailable?.()) this.focusProgressBar();
        else focusRow(this);
        this.resetControlsAutoHide?.();
        return undefined;
      }
      if (active(this) && keyCode >= 37 && keyCode <= 40 && canNavigate(this)) {
        event?.preventDefault?.();
        if (handleNavigation(this, keyCode)) {
          if (this.paused && !this.pauseOverlayVisible) this.schedulePauseOverlay?.();
          if (this.controlsVisible) this.resetControlsAutoHide?.();
          return undefined;
        }
      }
      return base.onKeyDown.call(this, event);
    },
    cleanup(...args) {
      stopPostRotation(this);
      stopLoadingTicker(this);
      this.nfLoadLabels = [];
      this.nfTimeRefs = null;
      this.nfOrderedSources = null;
      this.nfOrderedSourcesFrom = null;
      return base.cleanup.apply(this, args);
    }
  };
}
