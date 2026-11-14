import * as internals from "./playerScreenContext.js";

export function createPlayerScreenMethods11() {
  const {
    PlayerController,
    TrackingScrobbleService,
    Environment,
    localMediaTracksRepository,
    warmBitmapSubtitleDecoder,
    SUBTITLE_LANGUAGE_UNKNOWN_KEY,
    subtitleLabel,
    cleanDisplayText,
    getEmbeddedSubtitleSupportState,
    isEmbeddedTextSubtitleSourceTrack,
    isUnsupportedEmbeddedSubtitleTrack,
    getEmbeddedBitmapSubtitleFormat,
    canUseEmbeddedBitmapSubtitles,
    normalizeTrackLanguageCode,
    getTrackLanguageValue,
    getMeaningfulTrackLabel,
    getTrackDescriptorLabels,
    isForcedSubtitleTrack,
    normalizeSubtitleLanguageKey,
    subtitleLanguageLabel
  } = internals;

  return {
    releaseCurrentEngineFsStreamBestEffort(reason = "cleanup", { removeTorrent = false, deferRemoveMs = 0 } = {}) {
      const current = this.currentEngineFsStream;
      if (!current) {
        return;
      }
      void this.releaseCurrentEngineFsStream(reason, { removeTorrent, deferRemoveMs }).catch(() => null);
    },
    sendEngineFsRemoveOnPageExit(state = null) {
      const target = state?.infoHash ? state : this.currentEngineFsStream;
      if (!target?.infoHash) {
        return;
      }
      const playbackUrl = String(target.playbackUrl || target.publicPlaybackUrl || this.activePlaybackUrl || "").trim();
      if (!playbackUrl) {
        return;
      }
      try {
        const parsed = new URL(playbackUrl);
        const removeUrl = `${parsed.origin}/${encodeURIComponent(String(target.infoHash).toLowerCase())}/remove`;
        fetch(removeUrl, {
          method: "GET",
          cache: "no-cache",
          keepalive: true
        }).catch(() => null);
      } catch (_) {}
    },
    bindPlayerExitCleanup() {
      this.unbindPlayerExitCleanup();
      this.playerExitCleanupHandler = () => {
        if (this.hasPresentedPlaybackFrame && !this.postPlayNaturalCompletionPrepared && TrackingScrobbleService.isEnabled())
          TrackingScrobbleService.stop(this.buildScrobbleContext());
        void PlayerController.flushCurrentProgress({ forceCloudSync: true });
        this.sendEngineFsRemoveOnPageExit();
        this.releaseCurrentEngineFsStreamBestEffort("player-exit", { removeTorrent: true });
      };
      window.addEventListener("pagehide", this.playerExitCleanupHandler);
      window.addEventListener("beforeunload", this.playerExitCleanupHandler);
      document.addEventListener("nuvio:beforeExitApp", this.playerExitCleanupHandler);
    },
    unbindPlayerExitCleanup() {
      if (!this.playerExitCleanupHandler) {
        return;
      }
      window.removeEventListener("pagehide", this.playerExitCleanupHandler);
      window.removeEventListener("beforeunload", this.playerExitCleanupHandler);
      document.removeEventListener("nuvio:beforeExitApp", this.playerExitCleanupHandler);
      this.playerExitCleanupHandler = null;
    },
    getTrackProbeUrl() {
      const currentCandidate = this.getCurrentStreamCandidate();
      return String(this.activePlaybackUrl || currentCandidate?.url || PlayerController.video?.currentSrc || "").trim();
    },
    isCurrentSourceAdaptiveManifest() {
      const probeUrl = this.getTrackProbeUrl();
      const runtimeUrl = String(PlayerController.currentPlaybackUrl || "").trim();
      const runtimeMimeType = runtimeUrl && runtimeUrl === probeUrl ? PlayerController.currentPlaybackMediaSourceType : null;
      const probeMimeType =
        runtimeMimeType ||
        (typeof PlayerController.guessMediaMimeType === "function" ? PlayerController.guessMediaMimeType(probeUrl) : null);
      return (
        (typeof PlayerController.isLikelyHlsMimeType === "function" && PlayerController.isLikelyHlsMimeType(probeMimeType)) ||
        (typeof PlayerController.isLikelyDashMimeType === "function" && PlayerController.isLikelyDashMimeType(probeMimeType))
      );
    },
    isCurrentSourceLikelyDash(url = this.getTrackProbeUrl(), streamCandidate = this.getCurrentStreamCandidate()) {
      const isLikelyDashMimeType = PlayerController.isLikelyDashMimeType;
      if (typeof isLikelyDashMimeType !== "function") {
        return false;
      }
      const declaredSourceType = this.resolvePlaybackMediaSourceType(streamCandidate);
      const inferredSourceType =
        typeof PlayerController.guessMediaMimeType === "function" ? PlayerController.guessMediaMimeType(url) : null;
      return Boolean(
        isLikelyDashMimeType.call(PlayerController, declaredSourceType) || isLikelyDashMimeType.call(PlayerController, inferredSourceType)
      );
    },
    isCurrentSourceLikelyHls(url = this.getTrackProbeUrl(), streamCandidate = this.getCurrentStreamCandidate()) {
      const isLikelyHlsMimeType = PlayerController.isLikelyHlsMimeType;
      if (typeof isLikelyHlsMimeType !== "function") {
        return false;
      }
      const declaredSourceType = this.resolvePlaybackMediaSourceType(streamCandidate);
      const inferredSourceType =
        typeof PlayerController.guessMediaMimeType === "function" ? PlayerController.guessMediaMimeType(url) : null;
      return Boolean(
        isLikelyHlsMimeType.call(PlayerController, declaredSourceType) || isLikelyHlsMimeType.call(PlayerController, inferredSourceType)
      );
    },
    isCurrentSourceLikelyMkv(url = this.getTrackProbeUrl(), streamCandidate = this.getCurrentStreamCandidate()) {
      const probeUrl = String(url || "")
        .trim()
        .toLowerCase();
      if (probeUrl.includes(".mkv")) {
        return true;
      }
      const sourceType = this.resolvePlaybackMediaSourceType(streamCandidate);
      const normalizedSourceType =
        typeof PlayerController.normalizeMimeType === "function"
          ? PlayerController.normalizeMimeType(sourceType)
          : String(sourceType || "")
              .toLowerCase()
              .split(";")[0]
              .trim();
      return normalizedSourceType === "video/x-matroska";
    },
    canDiscoverEmbeddedSubtitleTracks() {
      const usingNativePlayback =
        typeof PlayerController.isUsingNativePlayback === "function" ? PlayerController.isUsingNativePlayback() : false;
      if (!usingNativePlayback && !Environment.isTizen()) {
        return false;
      }

      const probeUrl = this.getTrackProbeUrl();
      if (!probeUrl || this.isCurrentSourceAdaptiveManifest()) {
        return false;
      }

      if (Environment.isTizen()) {
        return Boolean(typeof PlayerController.isUsingAvPlay === "function" && PlayerController.isUsingAvPlay());
      }

      if (Environment.isWebOS()) {
        return true;
      }

      return typeof PlayerController.isLikelyDirectFileUrl === "function" ? PlayerController.isLikelyDirectFileUrl(probeUrl) : false;
    },
    canDiscoverEmbeddedAudioTracks() {
      if (Environment.isTizen()) {
        const usingAvPlay = typeof PlayerController.isUsingAvPlay === "function" ? PlayerController.isUsingAvPlay() : false;
        const probeUrl = this.getTrackProbeUrl();
        return Boolean(usingAvPlay && probeUrl && !this.isCurrentSourceAdaptiveManifest());
      }
      return this.canDiscoverEmbeddedSubtitleTracks();
    },
    prefetchTizenEmbeddedAudioTracks(probeUrl = this.getTrackProbeUrl(), streamCandidate = this.getCurrentStreamCandidate()) {
      if (!Environment.isTizen()) {
        return;
      }
      const targetUrl = String(probeUrl || "").trim();
      if (!targetUrl || this.isCurrentSourceAdaptiveManifest() || !this.isCurrentSourceLikelyMkv(targetUrl, streamCandidate)) {
        return;
      }
      void localMediaTracksRepository.getTracks(targetUrl).catch(() => []);
    },
    shouldUseEmbeddedSubtitleTracks() {
      if (!this.canDiscoverEmbeddedSubtitleTracks() || this.embeddedSubtitleTracks.length <= 0) {
        return false;
      }

      if (Environment.isTizen()) {
        return false;
      }

      return Environment.isWebOS() || this.getTextTracks().length <= 0;
    },
    normalizeEmbeddedSubtitleTracks(rawTracks = []) {
      const isTizenAvPlayMetadata = Environment.isTizen();
      let nativeTrackIndex = 0;
      let tizenEmbeddedTextTrackOrdinal = 0;
      return rawTracks
        .filter((track) => {
          const type = String(track?.type || track?.track || track?.codecType || "").toLowerCase();
          return type === "text" || type === "subtitle";
        })
        .filter((track) => {
          if (isTizenAvPlayMetadata) {
            return true;
          }
          if (getEmbeddedBitmapSubtitleFormat(track)) {
            return Environment.isWebOS() || canUseEmbeddedBitmapSubtitles();
          }
          return !isUnsupportedEmbeddedSubtitleTrack(track);
        })
        .map((track, index) => {
          const support = getEmbeddedSubtitleSupportState(track);
          const bitmapSubtitleFormat = getEmbeddedBitmapSubtitleFormat(track);
          const bitmapSubtitle = Boolean(bitmapSubtitleFormat);
          const sequentialNativeTrackIndex = nativeTrackIndex;
          if (isTizenAvPlayMetadata || !bitmapSubtitle) {
            nativeTrackIndex += 1;
          }
          const rawAvPlayTrackIndex = Number(track?.index);
          const currentNativeTrackIndex =
            isTizenAvPlayMetadata && Number.isFinite(rawAvPlayTrackIndex) && rawAvPlayTrackIndex >= 0
              ? rawAvPlayTrackIndex
              : sequentialNativeTrackIndex;
          const sourceTrackId = Number(track?.id);
          const sourceTrackOrdinal = isTizenAvPlayMetadata
            ? isEmbeddedTextSubtitleSourceTrack(track)
              ? tizenEmbeddedTextTrackOrdinal++
              : -1
            : sourceTrackId;
          const rawLanguage = getTrackLanguageValue(track);
          const normalizedLanguage = normalizeTrackLanguageCode(rawLanguage);
          const languageKey = normalizeSubtitleLanguageKey(normalizedLanguage || String(rawLanguage || ""));
          const fallbackLabel =
            languageKey && languageKey !== SUBTITLE_LANGUAGE_UNKNOWN_KEY ? subtitleLanguageLabel(languageKey) : subtitleLabel(index);
          const descriptors = getTrackDescriptorLabels(track);
          return {
            id: `embedded-subtitle-${index}`,
            embeddedTrackIndex: index,
            sourceTrackId: Number.isFinite(sourceTrackId) ? sourceTrackId : -1,
            sourceTrackOrdinal: Number.isFinite(sourceTrackOrdinal) && sourceTrackOrdinal >= 0 ? sourceTrackOrdinal : -1,
            nativeTrackIndex: isTizenAvPlayMetadata ? currentNativeTrackIndex : bitmapSubtitle ? -1 : currentNativeTrackIndex,
            bitmapSubtitle,
            bitmapSubtitleFormat,
            label: getMeaningfulTrackLabel(track) || fallbackLabel,
            language:
              normalizedLanguage ||
              String(rawLanguage || "")
                .trim()
                .toLowerCase(),
            secondary: descriptors.length
              ? descriptors.join(" · ")
              : String(normalizedLanguage || rawLanguage || "")
                  .trim()
                  .toUpperCase(),
            supported: support.supported,
            unsupportedReason: support.unsupportedReason,
            forced: isForcedSubtitleTrack(track),
            codec: cleanDisplayText(track?.codec || track?.subtitleCodec || track?.codec_name || track?.codecId || track?.codec_id),
            format: cleanDisplayText(track?.format || track?.format_name),
            raw: track
          };
        });
    },
    warmBitmapSubtitleSharedResources() {
      if (
        !this.hasPresentedPlaybackFrame ||
        !canUseEmbeddedBitmapSubtitles() ||
        !this.embeddedSubtitleTracks.some(
          (track) => track.bitmapSubtitle && (!Environment.isTizen() || track.bitmapSubtitleFormat === "vobsub")
        )
      ) {
        return;
      }
      void warmBitmapSubtitleDecoder().catch(() => {});
    }
  };
}
