import * as internals from "./metaDetailsScreenContext.js";
import { isNotflixActive } from "../../notflix/notflixAppearance.js";
import { toDirectTrailerSource } from "../../notflix/trailers/youtubeDirect.js";
import { resolveImdbTrailer } from "../../notflix/trailers/imdbTrailer.js";
import { shouldContinueTrailerInBackgroundOnBack } from "../../../core/detail/trailerBackPolicy.js";
import { focusWithoutScroll } from "../../navigation/focusWithoutScroll.js";

export function createMetaDetailsScreenMethods19() {
  const { t, escapeHtml, buildInlineYoutubePlayerUrl, LayoutPreferences, PlayerSettingsStore } = internals;

  return {
    toggleActiveTrailerPlayback() {
      if (!this.isTrailerPlaying || !this.trailerSource || this.trailerPlaybackMode !== "manual") {
        return;
      }
      this.restartTrailerControlsTimer();
      if (this.trailerSource.kind === "video") {
        const video = this.trailerUiRefs?.video;
        if (!video) {
          return;
        }
        if (video.paused) {
          const playAttempt = video.play?.();
          if (playAttempt?.catch) {
            playAttempt.catch(() => {});
          }
        } else {
          video.pause?.();
        }
        this.updateTrailerOverlay();
        return;
      }
      if (!this.trailerProxyState || this.trailerYoutubeFallbackActive) {
        return;
      }
      if (this.trailerProxyState.paused) {
        this.postTrailerProxyCommand("play");
      } else {
        this.postTrailerProxyCommand("pause");
      }
      this.updateTrailerOverlay();
    },
    applyTrailerVideoSubtitleState(video = null) {
      const target = video || this.trailerUiRefs?.video || null;
      if (!target) {
        return;
      }
      const tracks = target.textTracks || target.webkitTextTracks || target.mozTextTracks || null;
      if (!tracks) {
        return;
      }
      const enabled = Boolean(this.trailerSubtitlesEnabled);
      Array.from(tracks).forEach((track) => {
        try {
          track.mode = enabled ? "showing" : "disabled";
        } catch (_) {}
      });
    },
    seekTrailerBy(deltaSeconds) {
      const delta = Number(deltaSeconds || 0);
      if (!delta || !this.isTrailerPlaying || !this.trailerSource || this.trailerPlaybackMode !== "manual") {
        return;
      }
      if (this.trailerSource.kind === "video") {
        const video = this.trailerUiRefs?.video;
        if (!video) {
          return;
        }
        const duration = Number.isFinite(video.duration) ? Number(video.duration) : 0;
        if (duration <= 0) {
          return;
        }
        video.currentTime = Math.max(0, Math.min(duration, Number(video.currentTime || 0) + delta));
        this.updateTrailerOverlay();
        return;
      }
      if (!this.trailerProxyState || this.trailerYoutubeFallbackActive) {
        return;
      }
      const duration = Number(this.trailerProxyState.duration || 0);
      if (duration <= 0) {
        return;
      }
      const currentTime = Number(this.trailerProxyState.currentTime || 0);
      const target = Math.max(0, Math.min(duration, currentTime + delta));
      this.postTrailerProxyCommand("seekTo", { seconds: target });
      this.updateTrailerOverlay();
    },
    setActiveTrailerPausedState(paused) {
      if (!this.isTrailerPlaying || !this.trailerSource || this.trailerPlaybackMode !== "manual") {
        return;
      }
      const shouldPause = Boolean(paused);
      const playback = this.getTrailerPlaybackSnapshot();
      if (Boolean(playback.paused) === shouldPause) {
        this.restartTrailerControlsTimer();
        this.updateTrailerOverlay();
        return;
      }
      this.toggleActiveTrailerPlayback();
    },
    handOffTrailerToBackground() {
      if (!this.isTrailerPlaying || !this.trailerSource || this.trailerPlaybackMode !== "manual") {
        return false;
      }
      const settings = PlayerSettingsStore.get() || {};
      if (
        !shouldContinueTrailerInBackgroundOnBack({
          isTrailerPlaying: this.isTrailerPlaying,
          autoplayEnabled: settings.trailerAutoplay !== false,
          playInBackground: LayoutPreferences.get().trailerPlayInBackground === true
        })
      ) {
        return false;
      }
      this.trailerPlaybackMode = "autoplay";
      this.trailerHasAutoplayed = true;
      if (this.trailerAutoplayTimer) {
        clearTimeout(this.trailerAutoplayTimer);
        this.trailerAutoplayTimer = null;
      }
      this.stopTrailerControlsTimer();
      this.stopTrailerProgressTimer();
      const shell = this.container?.querySelector(".series-detail-shell");
      const layer = this.container?.querySelector(".detail-trailer-layer");
      if (shell) {
        shell.classList.remove("detail-trailer-manual");
        shell.classList.add("detail-trailer-autoplay");
      }
      layer?.querySelector?.(".detail-trailer-controls-overlay")?.remove?.();
      if (this.trailerUiRefs) {
        this.trailerUiRefs.overlay = null;
      }
      this.trailerControlsVisible = false;
      if (this.trailerSource.kind !== "video") {
        if (this.trailerProxyState?.paused) {
          this.postTrailerProxyCommand("play");
        }
      } else {
        const video = this.trailerUiRefs?.video;
        if (video?.paused) {
          const playAttempt = video.play?.();
          if (playAttempt?.catch) {
            playAttempt.catch(() => {});
          }
        }
      }
      const restore = this.trailerFocusRestore || {
        selector: '.series-detail-actions [data-action="playDefault"]'
      };
      this.trailerFocusRestore = null;
      const focus = () => this.focusDetailDescriptor(restore);
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(focus);
      } else {
        setTimeout(focus, 0);
      }
      return true;
    },
    syncTrailerDom() {
      const shell = this.container?.querySelector(".series-detail-shell");
      const layer = this.container?.querySelector(".detail-trailer-layer");
      if (!shell || !layer) {
        return;
      }
      shell.classList.toggle("detail-trailer-active", Boolean(this.isTrailerPlaying));
      shell.classList.toggle("detail-trailer-autoplay", this.isTrailerPlaying && this.trailerPlaybackMode === "autoplay");
      shell.classList.toggle("detail-trailer-manual", this.isTrailerPlaying && this.trailerPlaybackMode === "manual");
      shell.classList.toggle("detail-trailer-ready", this.isTrailerPlaying && this.trailerVisualReady);
      if (!this.isTrailerPlaying || !this.trailerSource) {
        this.stopTrailerProgressTimer();
        this.detachTrailerMediaListeners();
        this.destroyYoutubeTrailerPlayer();
        this.trailerUiRefs = null;
        layer.innerHTML = "";
        return;
      }
      const title = escapeHtml(this.meta?.name || this.params?.fallbackTitle || this.params?.itemId || "Trailer");
      this.trailerDomGeneration = Number(this.trailerDomGeneration || 0) + 1;
      const trailerHint = escapeHtml(t("hero_press_back_trailer", {}, "Press back to exit trailer"));
      const controlsMarkup =
        this.trailerPlaybackMode === "manual"
          ? `
          <div class="detail-trailer-controls-overlay" tabindex="-1">
            <div class="detail-trailer-controls-gradient detail-trailer-controls-gradient-top"></div>
            <div class="detail-trailer-controls-gradient detail-trailer-controls-gradient-bottom"></div>
            <div class="detail-trailer-controls-top">
              <div class="detail-trailer-meta">
                <div class="detail-trailer-title">${title}</div>
                <div class="detail-trailer-subtitle">${trailerHint}</div>
              </div>
              <div class="detail-trailer-status" data-trailer-status aria-live="polite"></div>
            </div>
            <div class="detail-trailer-controls-bottom">
              <div class="detail-trailer-progress">
                <div class="detail-trailer-progress-track">
                  <div class="detail-trailer-progress-fill" data-trailer-progress-fill></div>
                </div>
              </div>
              <div class="detail-trailer-controls-row">
                <div class="detail-trailer-time" data-trailer-time-label>0:00 / 0:00</div>
              </div>
            </div>
          </div>
        `
          : "";
      if (this.trailerSource.kind === "youtube") {
        const youtubeFrameUrl =
          buildInlineYoutubePlayerUrl(this.trailerSource.ytId, {
            muted: this.trailerMuted,
            loop: false,
            statePollMs: this.trailerPlaybackMode === "manual" ? 500 : 0
          }) ||
          this.trailerSource.embedUrl ||
          "";
        layer.innerHTML = `
            <div class="detail-trailer-media detail-trailer-youtube" data-trailer-media>
              <iframe
                class="detail-trailer-frame"
                src="${youtubeFrameUrl}"
                title="Trailer"
                allow="autoplay; encrypted-media; picture-in-picture"
                referrerpolicy="origin-when-cross-origin"
                allowfullscreen
                scrolling="no"
                tabindex="-1"
                aria-hidden="true"
              ></iframe>
            </div>
            ${controlsMarkup}
          `;
        this.cacheTrailerRefs();
        if (this.trailerPlaybackMode === "manual") {
          focusWithoutScroll(this.trailerUiRefs?.overlay);
          this.startTrailerProgressTimer();
        }
        this.initYoutubeTrailerPlayer();
        return;
      }
      layer.innerHTML = `
          <div class="detail-trailer-media" data-trailer-media>
            <video class="detail-trailer-video" autoplay playsinline preload="auto"${this.trailerMuted ? " muted" : ""}>
              <source src="${this.trailerSource.url}" />
            </video>
          </div>
          ${controlsMarkup}
        `;
      this.cacheTrailerRefs();
      if (this.trailerPlaybackMode === "manual") {
        focusWithoutScroll(this.trailerUiRefs?.overlay);
      }
      this.applyTrailerVideoSubtitleState(this.trailerUiRefs?.video || null);
      this.bindTrailerVideoEvents(this.trailerUiRefs?.video || null);
      const playAttempt = this.trailerUiRefs?.video?.play?.();
      if (playAttempt?.catch) {
        playAttempt.catch(() => {});
      }
      if (this.trailerPlaybackMode === "manual") {
        this.startTrailerProgressTimer();
      }
    },
    async playTrailer({ muted = null, restart = false, initiatedByUser = true, preserveSource = false } = {}) {
      const requestedFocusRestore = initiatedByUser ? this.captureDetailFocus() : null;
      if (!preserveSource) {
        const preferredSource = await this.resolvePreferredTrailerSource(this.meta);
        if (preferredSource) {
          this.trailerSource = preferredSource;
        }
      }
      if (!this.trailerSource) {
        return;
      }
      if (isNotflixActive() && this.trailerSource.kind === "youtube") {
        const directSource = await toDirectTrailerSource(this.trailerSource);
        if (directSource?.kind === "video") {
          this.trailerSource = directSource;
        } else {
          const imdbSource = await resolveImdbTrailer(this.meta || {}, { maxHeight: 1080 });
          if (imdbSource?.url) this.trailerSource = { kind: "video", url: imdbSource.url, direct: true };
        }
      }
      if (muted != null) {
        this.trailerMuted = Boolean(muted);
      } else if (!this.isTrailerPlaying && initiatedByUser) {
        this.trailerMuted = false;
      }
      if (this.isTrailerPlaying && !restart) {
        if (this.trailerPlaybackMode === "manual") {
          this.toggleActiveTrailerPlayback();
        }
        return;
      }
      this.stopTrailerPlayback({
        keepDom: false,
        restartAutoplay: false,
        restoreFocus: false
      });
      this.trailerSubtitlesEnabled = false;
      this.trailerPlaybackMode = initiatedByUser ? "manual" : "autoplay";
      this.trailerFocusRestore =
        initiatedByUser && requestedFocusRestore?.selector?.includes(".series-detail-actions")
          ? { selector: '.series-detail-actions [data-action="playDefault"]' }
          : requestedFocusRestore;
      this.trailerVisualReady = false;
      if (!initiatedByUser) {
        this.trailerHasAutoplayed = true;
      }
      this.isTrailerPlaying = true;
      this.syncTrailerDom();
      if (this.trailerSource?.direct) {
        const directVideo = this.trailerUiRefs?.video || this.container?.querySelector(".detail-trailer-video");
        const youtubeSource = { kind: "youtube", ytId: this.trailerSource.ytId, embedUrl: this.trailerSource.embedUrl };
        directVideo?.addEventListener(
          "error",
          () => {
            if (!this.isTrailerPlaying || !this.trailerSource?.direct) return;
            this.trailerSource = youtubeSource;
            this.syncTrailerDom();
          },
          { once: true }
        );
      }
      if (this.trailerPlaybackMode === "manual") {
        this.stopTrailerControlsTimer();
        this.setTrailerControlsVisible(false);
      }
    },
    openTrailerInPlayer() {
      this.playTrailer({ restart: true, initiatedByUser: true });
    }
  };
}
