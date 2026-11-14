import "./ui/components/serverWatchedNotice.js";
import { MediaServerSyncService } from "./core/profile/mediaServerSyncService.js";
import { installCustomPosterFallback } from "./core/poster/customPoster.js";
import { installWebOsImgurImageFallback } from "./core/media/imageProxy.js";
import { startTvArtworkLazyLoader } from "./ui/images/tvArtworkLazyLoader.js";
import { installFrameBudgetSampler } from "./core/diagnostics/frameBudget.js";
import { AmbientMode } from "./ui/ambient/ambientMode.js";

import "./core/diagnostics/consoleDebugBuffer.js";
import { markBootTiming } from "./core/diagnostics/bootTiming.js";
import { detailWatchedEnrichmentService } from "./data/repository/detailWatchedEnrichmentService.js";
import { NON_BACKSTACK_ROUTES, Router } from "./ui/navigation/router.js";
import { FocusEngine } from "./ui/navigation/focusEngine.js";
import { PlayerController } from "./core/player/playerController.js";
import { AuthManager } from "./core/auth/authManager.js";
import { AuthState } from "./core/auth/authState.js";
import { DeviceSessionRegistration } from "./core/auth/deviceSessionRegistration.js";
import { ProfileManager } from "./core/profile/profileManager.js";
import { MemberAccessRepository } from "./data/remote/supabase/memberAccessRepository.js";
import { ProfileSyncService } from "./core/profile/profileSyncService.js";
import { StartupSyncService } from "./core/profile/startupSyncService.js";
import { ProviderCredentialSyncService } from "./core/profile/providerCredentialSyncService.js";
import { ThemeManager } from "./ui/theme/themeManager.js";
import { renderAppShell } from "./bootstrap/renderAppShell.js";
import { renderAddonRemotePage } from "./bootstrap/renderAddonRemotePage.js";
import { preloadStreamBadgeImages } from "./ui/screens/stream/streamScreen.js";
import { warmStreamingLibs } from "./runtime/loadStreamingLibs.js";
import { runAfterFirstHomePaint } from "./runtime/startupScheduler.js";
import { Platform } from "./platform/index.js";
import { applyAppearanceClass, isNotflixActive } from "./ui/notflix/notflixAppearance.js";
import { playNotflixIntro } from "./ui/notflix/notflixIntro.js";
import { installNotflix } from "./ui/notflix/notflixInstall.js";
import { TizenCapabilities } from "./platform/tizen/tizenCapabilities.js";
import { PluginServiceClient } from "./platform/pluginServiceClient.js";
import {
  getTvRuntimePerformanceProfile,
  resetTvRuntimePerformanceProfile
} from "./platform/tvRuntimePerformance.js";
import { createFramePaceMonitor, storeMeasuredTvTier } from "./platform/tvAdaptiveTier.js";
import { LocalStore } from "./core/storage/localStore.js";
import { I18n } from "./i18n/index.js";
import { getLatestAppUpdateWithRetry } from "./core/update/appUpdateService.js";
import { shouldShowUpdate } from "./core/update/updateBannerPolicy.js";
import { showAppUpdatePrompt } from "./ui/components/appUpdatePrompt.js";
import { resolveExperienceRoute } from "./core/profile/experienceModeRouting.js";
import { PluginRuntime } from "./core/player/pluginRuntime.js";
import { installPartyEffects } from "./ui/screens/party/partyEffects.js";
import {
  hasPendingLaunchDeepLink,
  openPendingLaunchDeepLink,
  takeTizenLaunchDeepLink,
  takeWebOsLaunchDeepLink
} from "./core/deeplink/launchDeepLink.js";

LocalStore.remove("strictDpadGridNavigation");
LocalStore.remove("rotatedDpadMapping");

(function applyLegacyPatches() {
  const originalGetElementById = document.getElementById;
  document.getElementById = function (id) {
    if (id === undefined || id === null || id === "") return null;
    return originalGetElementById.call(document, id);
  };

  if (typeof Node === "undefined") {
    globalThis.Node = { ELEMENT_NODE: 1 };
  }
})();

markBootTiming("app-bundle-evaluated");

const REMOTE_FONT_STYLESHEETS = Object.freeze({
  text: "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Open+Sans:ital,wght@0,300..800;1,300..800&display=swap",
  icons: "https://fonts.googleapis.com/icon?family=Material+Icons"
});

function loadRemoteStylesheet(href) {
  return new Promise((resolve) => {
    try {
      const head = document.head || document.documentElement;
      if (!head) {
        resolve(false);
        return;
      }
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.onload = () => resolve(true);
      link.onerror = () => resolve(false);
      head.insertBefore(link, head.querySelector('link[rel="stylesheet"]'));
    } catch (_) {
      resolve(false);
    }
  });
}

const materialIconsStylesheetLoaded = loadRemoteStylesheet(REMOTE_FONT_STYLESHEETS.icons);
void loadRemoteStylesheet(REMOTE_FONT_STYLESHEETS.text);

const GUEST_QR_BYPASS_KEY = "skipAuthQrGate";
const SIGNED_OUT_ALLOWED_ROUTES = new Set([
  "trakt",
  "authQrSignIn",
  "authSignIn",
  "serverConnection"
]);
let hasSelectedProfileThisSession = false;
let appShellRendered = false;
let updateCheckStarted = false;

const APP_VERSION = typeof __NUVIO_APP_VERSION__ !== "undefined" ? __NUVIO_APP_VERSION__ : "0.0.0";
const UPDATE_DISMISSED_TAG_KEY = "app_update_dismissed_tag";
const UPDATE_ROUTE_WAIT_TIMEOUT_MS = 60_000;

function preloadMaterialIconFont() {
  const root = document.documentElement;
  const markReady = () => root.classList.add("material-icons-ready");
  const timer = setTimeout(markReady, 3000);
  materialIconsStylesheetLoaded
    .then((loaded) => {
      if (!loaded) {
        return null;
      }
      return document.fonts?.load?.('24px "Material Icons"', "home");
    })
    .then((faces) => {
      if (Array.isArray(faces) && faces.length) {
        clearTimeout(timer);
        markReady();
      }
    })
    .catch(() => {});
}

function markBootStage(stage) {
  markBootTiming(stage);
  const guard = globalThis.NuvioBootGuard;
  if (guard && typeof guard.stage === "function") {
    guard.stage(stage);
  }
}

function loginTrace(event, data) {
  try {
    globalThis.__NUVIO_TIZEN_LOGIN_TRACE__?.(event, data);
  } catch (_) {}
}

function shouldDisableTizenPluginSupport() {
  return Platform.isTizen() && !TizenCapabilities.canUsePlugins();
}

async function waitForInitialRoute(timeoutMs = UPDATE_ROUTE_WAIT_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (!Router.getCurrent() && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return Boolean(Router.getCurrent());
}

async function checkForAppUpdateOnStartup() {
  if (updateCheckStarted) {
    return;
  }
  updateCheckStarted = true;

  try {
    if (!(await waitForInitialRoute())) {
      return;
    }

    const update = await getLatestAppUpdateWithRetry({ currentVersion: APP_VERSION });
    if (!update) {
      return;
    }
    const dismissedTag = LocalStore.get(UPDATE_DISMISSED_TAG_KEY, null);
    if (!shouldShowUpdate({ isRemoteNewer: true, dismissedTag, updateTag: update.tag })) {
      return;
    }
    showAppUpdatePrompt(update, {
      onClose: () => LocalStore.set(UPDATE_DISMISSED_TAG_KEY, update.tag)
    });
  } catch (error) {
    console.warn("App update check failed", error);
  }
}

function isSignedOutRouteAllowed() {
  return SIGNED_OUT_ALLOWED_ROUTES.has(Router.getCurrent());
}

function formatErrorMessage(error) {
  if (!error) {
    return "Unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error?.stack || error?.message || error);
}

function renderFatalError(error) {
  const message = formatErrorMessage(error);
  const guard = globalThis.NuvioBootGuard;
  if (guard && typeof guard.fail === "function" && guard.isActive?.()) {
    guard.fail(
      "Something went wrong while the application was starting.",
      message,
      "BOOT-APPLICATION"
    );
    return;
  }
  document.body.innerHTML = `
    <div style="min-height:100vh;background:#0f1115;color:#f4f7fb;padding:48px;font-family:Arial,sans-serif;">
      <div style="max-width:960px;margin:0 auto;">
        <h1 style="margin:0 0 16px;font-size:42px;">Nuvio TV failed to start</h1>
        <p style="margin:0 0 20px;font-size:20px;color:#c7d0dd;">Startup hit an error before the app UI rendered.</p>
        <pre style="white-space:pre-wrap;word-break:break-word;background:#171b22;border:1px solid #2b3340;border-radius:12px;padding:20px;font-size:18px;line-height:1.5;">${message}</pre>
      </div>
    </div>
  `;
}

function isLowEndDevice() {
  if (getTvRuntimePerformanceProfile().isTvRuntime) {
    return false;
  }
  const hardware = Number(globalThis.navigator?.hardwareConcurrency || 0);
  const memory = Number(globalThis.navigator?.deviceMemory || 0);
  const lowCpu = Number.isFinite(hardware) && hardware > 0 && hardware <= 4;
  const lowMem = Number.isFinite(memory) && memory > 0 && memory <= 2;
  return lowCpu || lowMem;
}

function applyPerformanceMode() {
  const tvRuntime = getTvRuntimePerformanceProfile();
  const constrained = tvRuntime.isPerformanceConstrained || isLowEndDevice();
  const webOsMajorVersion = Platform.isWebOS() ? Number(Platform.getWebOsMajorVersion() || 0) : 0;
  const legacyWebOs = Platform.isWebOS() && tvRuntime.isLegacyTvRuntime;
  const unpromotedHomeTracks =
    Platform.isWebOS() &&
    tvRuntime.chromiumMajorVersion > 0 &&
    tvRuntime.chromiumMajorVersion <= 87;
  const legacyWebOs38 = Platform.isWebOS() && webOsMajorVersion > 0 && webOsMajorVersion <= 3;
  const legacyTizen = Platform.isTizen();
  const rootClasses = document.documentElement.classList;
  const modernSidebarBlurCapable = !rootClasses.contains("no-backdrop-filter") && !constrained;
  document.documentElement.classList.toggle("performance-constrained", constrained);
  document.body.classList.toggle("performance-constrained", constrained);
  document.documentElement.classList.toggle(
    "modern-sidebar-blur-capable",
    modernSidebarBlurCapable
  );
  document.body.classList.toggle("modern-sidebar-blur-capable", modernSidebarBlurCapable);
  document.documentElement.classList.toggle("legacy-webos", legacyWebOs);
  document.body.classList.toggle("legacy-webos", legacyWebOs);
  document.documentElement.classList.toggle("webos-unpromoted-home-tracks", unpromotedHomeTracks);
  document.body.classList.toggle("webos-unpromoted-home-tracks", unpromotedHomeTracks);
  document.documentElement.classList.toggle("legacy-webos38", legacyWebOs38);
  document.body.classList.toggle("legacy-webos38", legacyWebOs38);
  document.documentElement.classList.toggle("legacy-tizen", legacyTizen);
  document.body.classList.toggle("legacy-tizen", legacyTizen);
  ["no-flex-gap", "no-css-grid", "no-aspect-ratio", "no-css-math", "no-backdrop-filter"].forEach(
    (className) => {
      document.body.classList.toggle(className, rootClasses.contains(className));
    }
  );
}

function watchTvFramePace() {
  const profile = getTvRuntimePerformanceProfile();
  if (!profile.isTvRuntime || profile.isPerformanceConstrained) {
    return;
  }
  const monitor = createFramePaceMonitor({
    onSlow: (lostMs) => {
      storeMeasuredTvTier({ tier: "constrained", appVersion: APP_VERSION, lostMs });
      resetTvRuntimePerformanceProfile();
      applyPerformanceMode();
      console.warn(`TV moved to the constrained profile (${Math.round(lostMs)} ms lost per key)`);
    }
  });
  globalThis.__NUVIO_FRAME_PACE__ = monitor;
  document.addEventListener("keydown", () => monitor.noteKey(), true);
}

function isAddonRemoteMode() {
  try {
    return new URLSearchParams(window.location.search).get("addonsRemote") === "1";
  } catch {
    return false;
  }
}

const PROFILE_LOCK_STATE_WAIT_MS = 2500;

function hasProfilePin(pinStates, profileId) {
  return Boolean(pinStates?.[String(profileId)] || pinStates?.[Number(profileId)]);
}

function raceWithTimeout(promise, timeoutMs) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(undefined), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function enforceLateProfileLock(lockStatePull, profileId) {
  void lockStatePull
    .then((pinStates) => {
      if (!hasProfilePin(pinStates, profileId)) return;
      if (String(ProfileManager.getActiveProfileId()) !== String(profileId)) return;
      if (Router.getCurrent() === "profileSelection") return;
      console.warn("Profile lock state arrived after routing; opening the profile picker");
      void Router.navigate(
        "profileSelection",
        { skipInitialProfileSync: true, profilePinEnabled: pinStates },
        { replaceHistory: true, skipStackPush: true }
      );
    })
    .catch(() => {});
}

async function shouldShowProfileSelection() {
  const profiles = await ProfileManager.getProfiles();
  const activeProfileId = ProfileManager.getActiveProfileId();
  const cachedPinStates = ProfileSyncService.getCachedProfileLockStates();
  const lockStatePull = ProfileSyncService.pullProfileLockStates();
  const waitForLiveState =
    cachedPinStates === null || hasProfilePin(cachedPinStates, activeProfileId);
  let pinStates;
  let liveStateKnown = true;
  if (waitForLiveState) {
    pinStates = await lockStatePull;
  } else {
    pinStates = await raceWithTimeout(lockStatePull, PROFILE_LOCK_STATE_WAIT_MS);
    if (pinStates === undefined) {
      liveStateKnown = false;
      pinStates = cachedPinStates;
      enforceLateProfileLock(lockStatePull, activeProfileId);
    }
  }
  const activeProfileHasPin = hasProfilePin(pinStates, activeProfileId);

  if (hasSelectedProfileThisSession) {
    return { show: false, pinStates, liveStateKnown };
  }

  if (
    ProfileManager.isRememberLastProfileEnabled() &&
    ProfileManager.hasEverSelectedProfile() &&
    !activeProfileHasPin
  ) {
    return { show: false, pinStates, liveStateKnown };
  }

  return { show: profiles.length > 1 || activeProfileHasPin, pinStates, liveStateKnown };
}

async function enterWithLastProfile({ restoreWebOsRoute = false } = {}) {
  hasSelectedProfileThisSession = true;
  const profiles = await ProfileManager.getProfiles();
  const activeProfileId = ProfileManager.getActiveProfileId();
  const activeProfile =
    profiles.find((profile) => String(profile.id) === String(activeProfileId)) ||
    profiles[0] ||
    null;
  if (activeProfile) {
    await ProfileManager.setActiveProfile(activeProfile.id);
    StartupSyncService.enableProfileScopedSync();
    detailWatchedEnrichmentService.invalidateAllCache();
    await I18n.init();
    const memberAccess = MemberAccessRepository.getCachedAccess();
    ThemeManager.apply({ enforceAccess: true, access: memberAccess });
    I18n.apply();
    runAfterFirstHomePaint(() => {
      void MemberAccessRepository.getAccess().catch((error) => {
        console.warn("Profile member access refresh failed", error);
      });
      void preloadStreamBadgeImages().catch((error) => {
        console.warn("Stream badge image prerender failed", error);
      });
    });
  }
  const experienceRoute = activeProfile ? await resolveExperienceRoute(activeProfile.id) : "home";
  runAfterFirstHomePaint(() => {
    void StartupSyncService.requestSyncNow({
      notifyPullCompleted: ["home", "plugins"].includes(experienceRoute)
    }).catch((error) => {
      console.warn("Profile background sync failed", error);
    });
  });
  const storedResumeRoute =
    restoreWebOsRoute && typeof Router.consumeWebOsResumeRoute === "function"
      ? Router.consumeWebOsResumeRoute()
      : null;
  const resumeRoute = hasPendingLaunchDeepLink() ? null : storedResumeRoute;
  const isHomeResumeRoute = resumeRoute?.route === "home";

  if (experienceRoute !== "home") {
    await Router.navigate(experienceRoute, {}, { replaceHistory: true, skipStackPush: true });
  } else if (resumeRoute?.route && !isHomeResumeRoute) {
    Router.seedWebOsResumeBackStack?.();
    await Router.navigate(resumeRoute.route, resumeRoute.params || {}, {
      replaceHistory: true,
      skipStackPush: true
    });
  } else {
    await Router.navigate("home", {
      ...(isHomeResumeRoute ? resumeRoute.params || {} : {}),
      ...(StartupSyncService.started ? { forceReload: true } : {})
    });
  }
}

async function routeAfterAuthentication() {
  loginTrace("authenticated route begin", { currentRoute: Router.getCurrent() || "" });
  const profileRoute = await shouldShowProfileSelection();
  loginTrace("authenticated route profile decision", { show: profileRoute.show === true });
  if (profileRoute.show) {
    await Router.navigate(
      "profileSelection",
      profileRoute.liveStateKnown
        ? { skipInitialProfileSync: true, profilePinEnabled: profileRoute.pinStates }
        : {}
    );
    return;
  }

  await enterWithLastProfile({ restoreWebOsRoute: true });
}

function setupWebOsAppLifecycle() {
  if (!Platform.isWebOS()) {
    return;
  }

  const appSystems = Array.from(
    new Set([globalThis.webOSSystem || null, globalThis.PalmSystem || null].filter(Boolean))
  );

  function activateWebOsApp() {
    const system = appSystems.find((entry) => typeof entry?.activate === "function") || null;
    if (!system) {
      return;
    }
    try {
      system.activate();
    } catch (error) {
      console.warn("webOS activate failed", error);
    }
  }

  function installNativeCallback(system, systemName, callbackName, { recoverOnCall = false } = {}) {
    if (!system) {
      return;
    }
    const previous =
      typeof system[callbackName] === "function" ? system[callbackName].bind(system) : null;
    try {
      system[callbackName] = (...args) => {
        if (previous) {
          try {
            previous(...args);
          } catch (error) {
            console.warn(`webOS callback ${systemName}.${callbackName} failed`, error);
          }
        }
        if (recoverOnCall) {
          void recover(`${systemName}.${callbackName}`);
        }
      };
    } catch (error) {
      console.warn(`webOS callback hook ${systemName}.${callbackName} failed`, error);
    }
  }

  let recovering = false;
  const recover = async ({ titleLaunch = false } = {}) => {
    if (recovering || !appShellRendered) {
      return;
    }
    void DeviceSessionRegistration.requestForegroundRegistration();
    ProviderCredentialSyncService.requestForegroundPull();
    MediaServerSyncService.requestForegroundPull();
    StartupSyncService.requestForegroundSync();
    const current = Router.getCurrent();
    if (!current) {
      return;
    }
    recovering = true;
    try {
      if (document.body) {
        document.body.style.removeProperty("display");
      }
      const shouldReturnHome = !Router.isWebOsResumeRouteRestorable(current);
      const openedDeepLink = await openPendingLaunchDeepLink(Router, NON_BACKSTACK_ROUTES);
      if (
        !openedDeepLink &&
        shouldReturnHome &&
        !titleLaunch &&
        !NON_BACKSTACK_ROUTES.has(current)
      ) {
        await Router.navigate(
          "home",
          {},
          {
            replaceHistory: true,
            skipStackPush: true
          }
        );
      } else if (!openedDeepLink && typeof Router.persistWebOsResumeRoute === "function") {
        Router.persistWebOsResumeRoute(current, Router.currentParams || {});
      }
      activateWebOsApp();
    } catch (error) {
      console.warn("webOS relaunch recovery failed", error);
    } finally {
      recovering = false;
    }
  };

  takeWebOsLaunchDeepLink();

  document.addEventListener(
    "webOSRelaunch",
    (event) => {
      const link = takeWebOsLaunchDeepLink({ params: event.detail });
      void recover({ titleLaunch: Boolean(link) });
    },
    true
  );

  document.addEventListener(
    "webOSLaunch",
    (event) => {
      const link = takeWebOsLaunchDeepLink({ params: event.detail });
      void recover({ titleLaunch: Boolean(link) });
    },
    true
  );

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void recover();
    }
  });

  document.addEventListener("webkitvisibilitychange", () => {
    if (document.webkitHidden !== true) {
      void recover();
    }
  });

  installNativeCallback(globalThis.webOSSystem, "webOSSystem", "onshow", { recoverOnCall: true });
  installNativeCallback(globalThis.webOSSystem, "webOSSystem", "onhide");
  installNativeCallback(globalThis.webOSSystem, "webOSSystem", "onfocus", { recoverOnCall: true });
  installNativeCallback(globalThis.webOSSystem, "webOSSystem", "onblur");
  installNativeCallback(globalThis.webOSSystem, "webOSSystem", "onactivate", {
    recoverOnCall: true
  });
  installNativeCallback(globalThis.webOSSystem, "webOSSystem", "ondeactivate");
  installNativeCallback(globalThis.PalmSystem, "PalmSystem", "onshow", { recoverOnCall: true });
  installNativeCallback(globalThis.PalmSystem, "PalmSystem", "onhide");
  installNativeCallback(globalThis.PalmSystem, "PalmSystem", "onfocus", { recoverOnCall: true });
  installNativeCallback(globalThis.PalmSystem, "PalmSystem", "onblur");
  installNativeCallback(globalThis.PalmSystem, "PalmSystem", "onactivate", { recoverOnCall: true });
  installNativeCallback(globalThis.PalmSystem, "PalmSystem", "ondeactivate");
}

function setupProviderCredentialForegroundLifecycle() {
  let wasBackgrounded = document.visibilityState === "hidden" || document.webkitHidden === true;
  const requestAfterBackground = () => {
    if (!wasBackgrounded) return;
    wasBackgrounded = false;
    ProviderCredentialSyncService.requestForegroundPull();
    MediaServerSyncService.requestForegroundPull();
    StartupSyncService.requestForegroundSync();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      wasBackgrounded = true;
    } else if (document.visibilityState === "visible") {
      requestAfterBackground();
    }
  });
  document.addEventListener("webkitvisibilitychange", () => {
    if (document.webkitHidden === true) {
      wasBackgrounded = true;
    } else {
      requestAfterBackground();
    }
  });
  window.addEventListener("pagehide", () => {
    wasBackgrounded = true;
  });
  window.addEventListener("pageshow", (event) => {
    if (event?.persisted) requestAfterBackground();
  });
  window.addEventListener("blur", () => {
    wasBackgrounded = true;
  });
  window.addEventListener("focus", requestAfterBackground);
}

function setupTizenAppControlLifecycle() {
  if (!Platform.isTizen()) return;

  takeTizenLaunchDeepLink();
  window.addEventListener("appcontrol", () => {
    if (takeTizenLaunchDeepLink() && appShellRendered) {
      void openPendingLaunchDeepLink(Router, NON_BACKSTACK_ROUTES);
    }
  });
}

function setupTizenPlaybackLifecycle() {
  if (!Platform.isTizen()) return;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden" || Router.getCurrent() !== "player") return;

    const screen = Router.getCurrentScreen();
    screen?.cancelSourceLoad?.();
    screen?.navigateBackToStreamScreen?.();
  });
}

function setupPluginRuntimeLifecycle() {
  const cancel = () => PluginRuntime.cancelAll();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") cancel();
  });
  document.addEventListener("webkitvisibilitychange", () => {
    if (document.webkitHidden === true) cancel();
  });
  window.addEventListener("pagehide", cancel);
  window.addEventListener("beforeunload", cancel);
  document.addEventListener("nuvio:beforeExitApp", cancel);
}

function setupPluginServiceLifecycle() {
  if (!Platform.isTizen() || shouldDisableTizenPluginSupport()) {
    return;
  }

  PluginServiceClient.configureLifecycleMonitor({
    pauseProbeWhen: () => Router.getCurrent() === "player"
  });

  const checkWhenForegrounded = () => {
    if (document.visibilityState === "hidden" || document.webkitHidden === true) {
      return;
    }
    void PluginServiceClient.checkLifecycleNow({ force: true }).catch(() => {});
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkWhenForegrounded();
    }
  });
  document.addEventListener("webkitvisibilitychange", () => {
    if (document.webkitHidden !== true) {
      checkWhenForegrounded();
    }
  });
  window.addEventListener("pageshow", checkWhenForegrounded);
  window.addEventListener("focus", checkWhenForegrounded);

  window.addEventListener("beforeunload", () => {
    PluginServiceClient.stopLifecycleMonitor();
  });
}

async function bootstrapApp() {
  markBootStage("Rendering application shell");
  applyAppearanceClass();
  installNotflix();
  globalThis.__nuvioHideOnExit = isNotflixActive();
  playNotflixIntro();
  renderAppShell();
  appShellRendered = true;
  markBootStage("Initializing TV platform");
  Platform.init();
  setupPluginServiceLifecycle();
  if (shouldDisableTizenPluginSupport()) {
    markBootStage("PluginService disabled on Tizen below 6.0");
  } else {
    markBootStage("PluginService starts on first plugin use");
  }
  applyPerformanceMode();
  watchTvFramePace();
  startTvArtworkLazyLoader();
  installFrameBudgetSampler();
  markBootStage("Loading language resources");
  await I18n.init();

  markBootStage("Initializing navigation");
  Router.init();
  PlayerController.init();

  installCustomPosterFallback();
  preloadMaterialIconFont();
  installWebOsImgurImageFallback();
  MediaServerSyncService.start();
  AmbientMode.start();
  FocusEngine.init();
  setupProviderCredentialForegroundLifecycle();
  setupTizenPlaybackLifecycle();
  setupTizenAppControlLifecycle();
  setupPluginRuntimeLifecycle();
  setupWebOsAppLifecycle();

  ThemeManager.apply();
  I18n.apply();
  if (!getTvRuntimePerformanceProfile().isPerformanceConstrained) {
    warmStreamingLibs({ delayMs: 1400 });
  }
  runAfterFirstHomePaint(() => {
    void checkForAppUpdateOnStartup();
  });

  markBootStage("Restoring session");
  DeviceSessionRegistration.start();
  AuthManager.subscribe((state) => {
    if (state === AuthState.LOADING) {
      StartupSyncService.stop();
      ProviderCredentialSyncService.cancelForegroundPull();
      void MediaServerSyncService.stop();
      return;
    }

    if (state === AuthState.SIGNED_OUT) {
      StartupSyncService.stop();
      ProviderCredentialSyncService.cancelForegroundPull();
      void MediaServerSyncService.stop();
      ProfileSyncService.clearCachedProfileLockStates();
      hasSelectedProfileThisSession = false;
      const shouldBypassQr = Boolean(LocalStore.get(GUEST_QR_BYPASS_KEY, false));
      if (isSignedOutRouteAllowed()) {
        return;
      }
      if (shouldBypassQr) {
        if (
          ProfileManager.isRememberLastProfileEnabled() &&
          ProfileManager.hasEverSelectedProfile()
        ) {
          enterWithLastProfile({ restoreWebOsRoute: true }).catch((error) => {
            console.warn("Failed to enter with last profile", error);
            ProfileManager.clearActiveProfile();
            if (Router.getCurrent() !== "profileSelection") {
              Router.navigate(
                "profileSelection",
                {},
                { replaceHistory: true, skipStackPush: true }
              );
            }
          });
          return;
        }
        ProfileManager.clearActiveProfile();
        if (Router.getCurrent() !== "profileSelection") {
          Router.navigate(
            "profileSelection",
            {},
            {
              replaceHistory: true,
              skipStackPush: true
            }
          );
        }
        return;
      }
      const hasSeenQr = LocalStore.get("hasSeenAuthQrOnFirstLaunch");
      Router.navigate("authQrSignIn", {
        onboardingMode: !hasSeenQr
      });
    }

    if (state === AuthState.AUTHENTICATED) {
      loginTrace("authenticated subscriber begin", { currentRoute: Router.getCurrent() || "" });
      markBootStage("Loading profiles");
      if (!LocalStore.get("hasSeenAuthQrOnFirstLaunch")) {
        LocalStore.set("hasSeenAuthQrOnFirstLaunch", true);
      }
      LocalStore.remove(GUEST_QR_BYPASS_KEY);
      StartupSyncService.start({ runInitialPull: false });
      loginTrace("authenticated subscriber sync scheduled");
      routeAfterAuthentication().catch((error) => {
        console.warn("Failed to resolve authenticated route", error);
        Router.navigate("profileSelection");
      });
    }
  });

  markBootStage("Checking authentication");
  await AuthManager.bootstrap();
  runAfterFirstHomePaint(() => installPartyEffects());
}

async function bootstrapAddonRemoteMode() {
  await renderAddonRemotePage();
  appShellRendered = true;
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      const bootstrap = isAddonRemoteMode() ? bootstrapAddonRemoteMode : bootstrapApp;
      bootstrap().catch((error) => {
        console.error("App bootstrap failed", error);
        renderFatalError(error);
      });
    },
    { once: true }
  );
} else {
  const bootstrap = isAddonRemoteMode() ? bootstrapAddonRemoteMode : bootstrapApp;
  bootstrap().catch((error) => {
    console.error("App bootstrap failed", error);
    renderFatalError(error);
  });
}

window.addEventListener("error", (event) => {
  if (!event?.error) {
    return;
  }
  if (!appShellRendered) {
    renderFatalError(event.error);
    return;
  }
  console.warn("Unhandled runtime error", event.error);
});

window.addEventListener("unhandledrejection", (event) => {
  if (!appShellRendered) {
    renderFatalError(event?.reason);
    return;
  }
  console.warn("Unhandled promise rejection", event?.reason);
});
