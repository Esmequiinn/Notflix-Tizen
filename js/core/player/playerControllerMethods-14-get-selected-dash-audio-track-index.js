import * as internals from "./playerController.js";

export function createPlayerControllerMethods14() {
  const { Platform, hlsJsEngine, logTizenAvPlayDebug, isValidAvPlayPlaybackSpeedState } = internals;

  return {
    getSelectedDashAudioTrackIndex() {
      const current = this.dashInstance?.getCurrentTrackFor?.("audio");
      const tracks = this.getDashAudioTracks();
      if (!current || !tracks.length) {
        return -1;
      }
      const exactMatch = tracks.findIndex((track) => track.raw === current);
      if (exactMatch >= 0) {
        return exactMatch;
      }
      const currentId = String(current?.id ?? "");
      const currentLang = String(current?.lang ?? "");
      return tracks.findIndex((track) => String(track?.id ?? "") === currentId && String(track?.language ?? "") === currentLang);
    },
    setDashAudioTrack(index) {
      const targetIndex = Number(index);
      const tracks = this.getDashAudioTracks();
      if (!Number.isFinite(targetIndex) || targetIndex < 0 || targetIndex >= tracks.length) {
        return false;
      }
      const target = tracks[targetIndex]?.raw || null;
      if (!target || typeof this.dashInstance?.setCurrentTrack !== "function") {
        return false;
      }
      try {
        this.dashInstance.setCurrentTrack(target);
        const currentTime = Number(this.video?.currentTime || 0);
        if (Number.isFinite(currentTime) && currentTime > 0) {
          this.video.currentTime = Math.max(0, currentTime - 0.001);
        }
        this.emitVideoEvent("dashtrackschanged", { playbackEngine: "dash.js" });
        return true;
      } catch (_) {
        return false;
      }
    },
    getDashTextTracks() {
      const tracks = this.dashInstance?.getTracksFor?.("text");
      if (!Array.isArray(tracks)) {
        return [];
      }
      return tracks.filter(Boolean).map((track, index) => ({
        id: String(track?.id ?? `dash-text-${index}`),
        index,
        textTrackIndex: Number(track?.index),
        label: String(track?.labels?.[0]?.text || track?.lang || `Subtitle ${index + 1}`),
        language: String(track?.lang || ""),
        raw: track
      }));
    },
    getSelectedDashTextTrackIndex() {
      const current = this.dashInstance?.getCurrentTrackFor?.("text");
      const tracks = this.getDashTextTracks();
      if (!current || !tracks.length) {
        return -1;
      }
      const exactMatch = tracks.findIndex((track) => track.raw === current);
      if (exactMatch >= 0) {
        return exactMatch;
      }
      const currentId = String(current?.id ?? "");
      const currentLang = String(current?.lang ?? "");
      return tracks.findIndex((track) => String(track?.id ?? "") === currentId && String(track?.language ?? "") === currentLang);
    },
    setDashTextTrack(index) {
      const targetIndex = Number(index);
      const player = this.dashInstance;
      if (!player) {
        return false;
      }

      if (!Number.isFinite(targetIndex) || targetIndex < 0) {
        try {
          player.setTextTrack?.(-1);
        } catch (_) {}
        try {
          player.enableText?.(false);
        } catch (_) {}
        this.emitVideoEvent("dashtrackschanged", { playbackEngine: "dash.js" });
        return true;
      }

      const tracks = this.getDashTextTracks();
      if (targetIndex >= tracks.length) {
        return false;
      }

      const target = tracks[targetIndex] || null;
      try {
        player.enableText?.(true);
      } catch (_) {}
      try {
        if (Number.isFinite(target?.textTrackIndex) && typeof player.setTextTrack === "function") {
          player.setTextTrack(target.textTrackIndex);
        } else if (target?.raw && typeof player.setCurrentTrack === "function") {
          player.setCurrentTrack(target.raw);
        } else {
          return false;
        }
        this.emitVideoEvent("dashtrackschanged", { playbackEngine: "dash.js" });
        return true;
      } catch (_) {
        return false;
      }
    },
    getHlsAudioTracks() {
      return hlsJsEngine.getAudioTracks(this.hlsInstance);
    },
    getSelectedHlsAudioTrackIndex() {
      return hlsJsEngine.getSelectedAudioTrackIndex(this.hlsInstance);
    },
    setHlsAudioTrack(index) {
      const applied = hlsJsEngine.setAudioTrack(this.hlsInstance, index);
      if (applied) {
        this.emitVideoEvent("hlstrackschanged", { playbackEngine: "hls.js" });
      }
      return applied;
    },
    getHlsSubtitleTracks() {
      return hlsJsEngine.getSubtitleTracks(this.hlsInstance);
    },
    getSelectedHlsSubtitleTrackIndex() {
      return hlsJsEngine.getSelectedSubtitleTrackIndex(this.hlsInstance);
    },
    setHlsSubtitleTrack(index) {
      const applied = hlsJsEngine.setSubtitleTrack(this.hlsInstance, index);
      if (applied) {
        this.emitVideoEvent("hlstrackschanged", { playbackEngine: "hls.js" });
      }
      return applied;
    },
    normalizePlaybackRate(speed = 1) {
      const targetSpeed = Number(speed || 1);
      if (!Number.isFinite(targetSpeed) || targetSpeed <= 0) {
        return NaN;
      }
      return targetSpeed;
    },
    getSupportedPlaybackRates() {
      if (Platform.isTizen() && this.isUsingAvPlay()) {
        return [1];
      }
      if (Platform.isWebOS() && !this.isUsingNativePlayback()) {
        return [1];
      }
      return [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    },
    isSupportedAvPlayPlaybackRate(speed = 1) {
      const targetSpeed = this.normalizePlaybackRate(speed);
      if (!Number.isFinite(targetSpeed)) {
        return false;
      }
      return targetSpeed === 1;
    },
    applyAvPlayPlaybackRate(speed = this.desiredPlaybackRate) {
      if (!this.isUsingAvPlay()) {
        return false;
      }
      const targetSpeed = this.normalizePlaybackRate(speed);
      if (!this.isSupportedAvPlayPlaybackRate(targetSpeed)) {
        return false;
      }
      if (targetSpeed === 1) {
        this.appliedAvPlayPlaybackRate = 1;
        return true;
      }
      const avplay = this.getAvPlay();
      if (!avplay || typeof avplay.setSpeed !== "function") {
        return false;
      }
      const state = this.getAvPlayState();
      if (!isValidAvPlayPlaybackSpeedState(state)) {
        return false;
      }
      try {
        avplay.setSpeed(targetSpeed);
        this.appliedAvPlayPlaybackRate = targetSpeed;
        logTizenAvPlayDebug("Tizen AVPlay setSpeed succeeded", {
          speed: targetSpeed,
          state
        });
        return true;
      } catch (error) {
        logTizenAvPlayDebug("Tizen AVPlay setSpeed failed", {
          speed: targetSpeed,
          state,
          error: error?.message || String(error || "")
        });
        return false;
      }
    },
    reapplyAvPlayPlaybackRate() {
      if (!this.isUsingAvPlay() || this.avplaySeekInFlight) {
        return false;
      }
      const targetSpeed = this.normalizePlaybackRate(this.desiredPlaybackRate);
      if (!Number.isFinite(targetSpeed)) {
        return false;
      }
      return this.applyAvPlayPlaybackRate(targetSpeed);
    },
    isSupportedWebOsPlaybackRate(speed = 1) {
      const targetSpeed = this.normalizePlaybackRate(speed);
      if (!Number.isFinite(targetSpeed) || targetSpeed > 2) {
        return false;
      }
      if (targetSpeed === 1) {
        return true;
      }
      return Platform.isWebOS() && this.isUsingNativePlayback();
    },
    async applyWebOsPlaybackRate(speed = this.desiredPlaybackRate) {
      if (!Platform.isWebOS() || !this.video || !this.isUsingNativePlayback()) {
        return false;
      }
      const targetSpeed = this.normalizePlaybackRate(speed);
      if (!this.isSupportedWebOsPlaybackRate(targetSpeed)) {
        return false;
      }

      const mediaId = this.syncNativeMediaId() || (await this.waitForNativeMediaId({ maxAttempts: 20, intervalMs: 250 }));
      if (!mediaId) {
        return false;
      }
      const nativeMediaStateToken = Number(this.nativeMediaIdLookupToken || 0);

      try {
        const result = await this.requestWebOsMediaCommand("setPlayRate", {
          mediaId,
          playRate: targetSpeed,
          audioOutput: true
        });
        if (result?.returnValue !== true) {
          return false;
        }
        if (nativeMediaStateToken !== Number(this.nativeMediaIdLookupToken || 0)) {
          return false;
        }
        this.appliedWebOsPlaybackRate = targetSpeed;
        return true;
      } catch (_) {
        return false;
      }
    },
    queueWebOsPlaybackRate(speed = this.desiredPlaybackRate) {
      const previousCommand = this.webOsPlaybackRateCommandPromise;
      const commandPromise = previousCommand
        ? Promise.resolve(previousCommand)
            .catch(() => false)
            .then(() => this.applyWebOsPlaybackRate(speed))
        : this.applyWebOsPlaybackRate(speed);
      const trackedPromise = commandPromise.finally(() => {
        if (this.webOsPlaybackRateCommandPromise === trackedPromise) {
          this.webOsPlaybackRateCommandPromise = null;
        }
      });
      this.webOsPlaybackRateCommandPromise = trackedPromise;
      return trackedPromise;
    },
    reapplyWebOsPlaybackRate() {
      if (!Platform.isWebOS() || !this.video || !this.isUsingNativePlayback() || this.desiredPlaybackRate === 1) {
        return Promise.resolve(false);
      }
      if (this.webOsPlaybackRateReapplyPromise) {
        return this.webOsPlaybackRateReapplyPromise;
      }
      const reapplyPromise = this.queueWebOsPlaybackRate(this.desiredPlaybackRate).finally(() => {
        if (this.webOsPlaybackRateReapplyPromise === reapplyPromise) {
          this.webOsPlaybackRateReapplyPromise = null;
        }
      });
      this.webOsPlaybackRateReapplyPromise = reapplyPromise;
      return reapplyPromise;
    },
    getPlaybackRate() {
      const targetSpeed = this.normalizePlaybackRate(this.desiredPlaybackRate);
      if (Number.isFinite(targetSpeed)) {
        return targetSpeed;
      }
      return Number(this.video?.playbackRate || 1);
    }
  };
}
