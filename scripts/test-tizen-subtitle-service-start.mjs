import assert from "node:assert/strict";

globalThis.__NUVIO_PLATFORM__ = "tizen";
globalThis.__NUVIO_TIZEN_ENGINEFS_SERVICE_ENABLED__ = true;
globalThis.__NUVIO_TIZEN_ENGINEFS_SERVICE_ID__ = "DemoPkg.EngineFsService";

const { Platform } = await import("../js/platform/index.js");
const { TizenEngineFsService } = await import("../js/platform/tizen/tizenEngineFsService.js");
const { resetTizenCapabilitiesCache } = await import("../js/platform/tizen/tizenCapabilities.js");

const previousTizen = globalThis.tizen;
const previousFetch = globalThis.fetch;
const previousWrtBridge = globalThis.__NUVIO_TIZEN_WRT_SERVICE__;
let serviceStarted = false;
let bridgeStartCalls = 0;
let applicationLaunchCalls = 0;
let applicationControlCalls = 0;

function installTizen({ webService = false, launchAvailable = true, launchStarts = true } = {}) {
  globalThis.tizen = {
    ApplicationControl: class ApplicationControl {
      constructor(operation) {
        this.operation = operation;
      }
    },
    systeminfo: {
      getCapability(name) {
        if (name.includes("platform.version")) return "9.0";
        if (name.includes("web.service")) return webService;
        return false;
      }
    },
    application: {
      getCurrentApplication() {
        return { appInfo: { packageId: "DemoPkg" } };
      },
      launchAppControl(_control, serviceId, onSuccess, onFailure) {
        if (!launchAvailable) {
          onFailure?.(new Error("application.launchAppControl unavailable"));
          return;
        }
        assert.equal(serviceId, "DemoPkg.EngineFsService");
        applicationControlCalls += 1;
        serviceStarted = serviceStarted || launchStarts;
        onSuccess?.();
      },
      launch(serviceId, onSuccess, onFailure) {
        if (!launchAvailable) {
          onFailure?.(new Error("application.launch unavailable"));
          return;
        }
        assert.equal(serviceId, "DemoPkg.EngineFsService");
        applicationLaunchCalls += 1;
        serviceStarted = serviceStarted || launchStarts;
        onSuccess?.();
      }
    }
  };
}

globalThis.fetch = async () => {
  if (!serviceStarted) throw new TypeError("Failed to fetch");
  return {
    ok: true,
    clone() {
      return { json: async () => ({ service: "enginefs" }) };
    }
  };
};

function resetState({ webService = false, launchAvailable = true, launchStarts = true } = {}) {
  serviceStarted = false;
  bridgeStartCalls = 0;
  applicationLaunchCalls = 0;
  applicationControlCalls = 0;
  globalThis.__NUVIO_TIZEN_WRT_SERVICE__ = undefined;
  installTizen({ webService, launchAvailable, launchStarts });
  Platform.current = null;
  resetTizenCapabilitiesCache();
}

try {
  resetState();

  const generic = await TizenEngineFsService.ensureStarted();
  assert.equal(generic.status, "unsupported");
  assert.match(generic.detail, /web service support/i);
  assert.equal(serviceStarted, false);

  globalThis.__NUVIO_TIZEN_WRT_SERVICE__ = {
    startService(serviceId, onSuccess) {
      assert.equal(serviceId, "DemoPkg.EngineFsService");
      bridgeStartCalls += 1;
      serviceStarted = true;
      onSuccess?.();
      return Promise.resolve();
    }
  };
  const subtitle = await TizenEngineFsService.ensureStarted({ purpose: "subtitle" });
  assert.equal(subtitle.status, "success");
  assert.equal(subtitle.startMethod, "wrt-service-legacy");
  assert.equal(bridgeStartCalls, 1);
  assert.equal(applicationLaunchCalls, 0);

  serviceStarted = false;
  bridgeStartCalls = 0;
  applicationLaunchCalls = 0;
  globalThis.__NUVIO_TIZEN_WRT_SERVICE__ = {
    default: {
      startService(serviceId, onSuccess) {
        assert.equal(serviceId, "DemoPkg.EngineFsService");
        bridgeStartCalls += 1;
        serviceStarted = true;
        onSuccess?.();
        return Promise.resolve();
      }
    }
  };
  const defaultBridge = await TizenEngineFsService.ensureStarted({ purpose: "subtitle" });
  assert.equal(defaultBridge.status, "success");
  assert.equal(defaultBridge.startMethod, "wrt-service-legacy");
  assert.equal(bridgeStartCalls, 1);

  serviceStarted = false;
  bridgeStartCalls = 0;
  applicationLaunchCalls = 0;
  globalThis.__NUVIO_TIZEN_WRT_SERVICE__ = {
    startService(serviceId, onSuccess) {
      assert.equal(serviceId, "DemoPkg.EngineFsService");
      bridgeStartCalls += 1;
      serviceStarted = true;
      onSuccess?.();
      return Promise.resolve();
    }
  };
  const p2p = await TizenEngineFsService.ensureStarted({ purpose: "p2p" });
  assert.equal(p2p.status, "success");
  assert.equal(p2p.startMethod, "wrt-service-legacy");
  assert.equal(bridgeStartCalls, 1);

  resetState({ launchAvailable: true });
  const fallback = await TizenEngineFsService.ensureStarted({ purpose: "subtitle" });
  assert.equal(fallback.status, "success");
  assert.equal(fallback.startMethod, "tizen-application-launch");
  assert.equal(applicationLaunchCalls, 1);

  resetState({ webService: true, launchAvailable: true });
  const official = await TizenEngineFsService.ensureStarted({ purpose: "subtitle" });
  assert.equal(official.status, "success");
  assert.equal(official.startMethod, "tizen-application-control-default");
  assert.equal(applicationControlCalls, 1);
  assert.equal(applicationLaunchCalls, 0);

  class TizenTenService {
    constructor(serviceId) {
      assert.equal(serviceId, "DemoPkg.EngineFsService");
      this.serviceId = serviceId;
    }
    start() {
      bridgeStartCalls += 1;
      serviceStarted = true;
      return new Promise(() => {});
    }
  }
  for (const webService of [false, true]) {
    resetState({ webService, launchStarts: false });
    globalThis.__NUVIO_TIZEN_WRT_SERVICE__ = { Service: TizenTenService };
    const tizenTen = await TizenEngineFsService.ensureStarted({ purpose: "p2p" });
    assert.equal(tizenTen.status, "success");
    assert.equal(tizenTen.startMethod, "wrt-service-legacy");
    assert.equal(bridgeStartCalls, 1);
    assert.equal(applicationLaunchCalls, 0);
    assert.equal(applicationControlCalls, 0);
  }

  console.log("tizen subtitle service start tests passed");
} finally {
  if (previousTizen === undefined) delete globalThis.tizen;
  else globalThis.tizen = previousTizen;
  globalThis.fetch = previousFetch;
  if (previousWrtBridge === undefined) delete globalThis.__NUVIO_TIZEN_WRT_SERVICE__;
  else globalThis.__NUVIO_TIZEN_WRT_SERVICE__ = previousWrtBridge;
  resetTizenCapabilitiesCache();
}
