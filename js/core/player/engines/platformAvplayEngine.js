import { wrapAvPlayForTrace } from "./avplayCallTrace.js";

function getAvplayApi() {
  const webapis = globalThis.webapis;
  const avplay =
    webapis?.avplay ||
    webapis?.avPlay ||
    globalThis.avplay ||
    globalThis.document?.getElementById?.("avPlayerObject") ||
    null;
  if (!avplay || typeof avplay.open !== "function") {
    return null;
  }
  const traceEnabled = globalThis.__NUVIO_DEBUG_TIZEN_AVPLAY__ === true;
  return traceEnabled && avplay === webapis?.avplay ? wrapAvPlayForTrace(avplay) : avplay;
}

function createEngine(name) {
  return {
    name,

    isSupported() {
      return Boolean(getAvplayApi());
    },

    getApi() {
      return getAvplayApi();
    }
  };
}

export const tizenAvplayEngine = createEngine("tizen-avplay");
export const disabledAvplayEngine = {
  name: "none",

  isSupported() {
    return false;
  },

  getApi() {
    return null;
  }
};

export function resolvePlatformAvplayEngine(platformName) {
  if (platformName === "tizen") {
    return tizenAvplayEngine;
  }
  return disabledAvplayEngine;
}
