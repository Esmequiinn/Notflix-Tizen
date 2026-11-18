import { activeStreamLinkProfile } from "../../../data/local/streamLinkCacheStore.js";
import { isNotflixActive } from "../../notflix/notflixAppearance.js";
import * as internals from "./streamScreen.js";

export function createStreamScreenMethods03() {
  const {
    Router,
    ScreenUtils,
    streamRepository,
    PlayerSettingsStore,
    StreamPreferencesStore,
    StreamBadgeSettingsStore,
    ensureWebOsImageProxyReady,
    onWebOsImageProxyReady,
    clearFailedAddonLogos,
    normalizeAddonLogoLookup,
    preloadAddonLogoImages,
    Environment,
    ensureAddonLogoImageProxyReady
  } = internals;

  return {
    async mount(params = {}, navigationContext = {}) {
      streamRepository.setLocalPluginSearchPaused(false);
      this.container = document.getElementById("stream");
      ScreenUtils.show(this.container);
      this.params = params || {};
      this.bindStreamParty();
      this.streamLinkCacheProfileId = activeStreamLinkProfile();
      this.streamBackNavigationInProgress = false;
      this.stopStreamVirtualization();
      this.streamVirtualHeights = new Map();
      this.streamVirtualFocusReset = false;
      this.streamLastNavigationRepeatAt = 0;
      this.loadToken = (this.loadToken || 0) + 1;
      const token = this.loadToken;
      this.focusState = { zone: "filter", index: 1 };
      this.streamUserMovedFocus = false;
      this.streamInitialResultFocusAssigned = false;
      this.listScrollTop = 0;
      this.error = "";
      this.loading = true;
      this.streamSearchCompleted = false;
      this.streams = [];
      this.sourceChips = [];
      this.addonLogoLookup = {};
      this.addonFilter = "all";
      this.hasRenderedStreamRouteShell = false;
      this.renderedStreamListStable = false;
      this.renderedStreamListStreams = null;
      this.renderedStreamListSourceChips = null;
      const returningFromPlayer = Boolean(navigationContext?.isBackNavigation && navigationContext?.previousRoute === "player");
      this.autoResumeAttempted = returningFromPlayer;
      const playerSettings = PlayerSettingsStore.get();
      const reusableStream = playerSettings.streamReuseLastLinkEnabled
        ? StreamPreferencesStore.getValid(
            this.params?.itemId,
            this.params?.videoId || this.params?.itemId,
            Number(playerSettings.streamReuseLastLinkCacheHours || 24) * 60 * 60 * 1000
          )
        : null;
      this.autoResumeUiActive = Boolean(
        !navigationContext?.isBackNavigation &&
        this.params?.continueWatchingBackHome &&
        !this.params?.manualSelection &&
        reusableStream?.streamId &&
        (String(this.params?.resumeStreamIdentity || "").trim() || String(this.params?.preferredStreamId || "").trim())
      );
      this.autoPlayAttempted = returningFromPlayer;
      this.nfAutoPicked = false;
      this.nfAutoPlayStatus = "";
      this.nfAutoPlayLoading = Boolean(
        isNotflixActive() &&
        !returningFromPlayer &&
        !navigationContext?.isBackNavigation &&
        !this.params?.manualSelection &&
        !this.autoResumeUiActive &&
        String(playerSettings.streamAutoPlayMode || "MANUAL").toUpperCase() !== "MANUAL" &&
        internals.isAutoPlayEffectivelyEnabled(playerSettings)
      );
      this.cancelAutoPlayCountdown();
      this.cancelAutoPlaySelectionWait();
      const autoPlayWaitSeconds = Math.max(0, Math.trunc(Number(playerSettings.streamAutoPlayTimeoutSeconds || 0)));
      this.autoPlaySelectionReady = autoPlayWaitSeconds === 0;
      this.autoPlayWaitsForAll = autoPlayWaitSeconds === 2147483647;
      this.autoPlayLoadComplete = false;
      if (autoPlayWaitSeconds > 0 && autoPlayWaitSeconds !== 2147483647) {
        this.autoPlaySelectionWaitTimer = setTimeout(() => {
          this.autoPlaySelectionWaitTimer = null;
          this.autoPlaySelectionReady = true;
          this.maybeAutoResumeStream();
          this.maybeAutoPlayStream({ allLoaded: Boolean(this.autoPlayLoadComplete) });
        }, autoPlayWaitSeconds * 1000);
      }
      this.webOsNativePlayerAppId = "";
      this.nativePlayerPendingStreamId = "";
      this.nativePlayerRequestToken = 0;
      if (this.releaseImageProxyReadyListener) {
        this.releaseImageProxyReadyListener();
        this.releaseImageProxyReadyListener = null;
      }
      if (Environment.isWebOS()) {
        this.releaseImageProxyReadyListener = onWebOsImageProxyReady(() => {
          clearFailedAddonLogos();
          this.requestRender({ delayMs: 0 });
        });
        void ensureWebOsImageProxyReady();
        void this.detectWebOsNativePlayerApp();
      }

      const restored =
        returningFromPlayer && navigationContext?.restoredState && typeof navigationContext.restoredState === "object"
          ? navigationContext.restoredState
          : null;
      if (restored) {
        this.streamUserMovedFocus = true;
        this.streamInitialResultFocusAssigned = true;
        this.loading = Boolean(restored.loading);
        this.error = String(restored.error || "");
        this.streams = Array.isArray(restored.streams) ? restored.streams.map((stream) => ({ ...stream })) : [];
        this.addonFilter = String(restored.addonFilter || "all");
        this.focusState = restored.focusState ? { ...restored.focusState } : { zone: "filter", index: 1 };
        this.sourceChips = Array.isArray(restored.sourceChips) ? restored.sourceChips.map((chip) => ({ ...chip })) : [];
        this.addonLogoLookup =
          restored.addonLogoLookup && typeof restored.addonLogoLookup === "object"
            ? normalizeAddonLogoLookup(restored.addonLogoLookup)
            : {};
        this.streamSearchCompleted = Boolean(restored.streamSearchCompleted ?? !restored.loading);
        this.listScrollTop = Number(restored.listScrollTop || 0);
      }

      const showAddonLogo = StreamBadgeSettingsStore.snapshot().showAddonLogo === true;
      if (restored && this.streams.length && showAddonLogo) {
        await ensureAddonLogoImageProxyReady();
        if (token !== this.loadToken || Router.getCurrent() !== "stream") {
          return;
        }
        this.streams = this.applyAddonLogos(this.streams);
        await preloadAddonLogoImages(this.streams, this.addonLogoLookup);
        if (token !== this.loadToken || Router.getCurrent() !== "stream") {
          return;
        }
      }

      const restoringFromBack = Boolean(restored && navigationContext?.isBackNavigation && this.streams.length);
      if (restoringFromBack) {
        this.loading = false;
      }

      this.render();

      if (restoringFromBack) {
        if (!this.streamSearchCompleted) {
          void this.loadStreams({ preserveResults: true, forceRefresh: false });
        }
        return;
      }

      if (!navigationContext?.isBackNavigation && this.tryResumeCachedStreamLink()) return;

      void this.loadStreams({ forceRefresh: false });
    }
  };
}
