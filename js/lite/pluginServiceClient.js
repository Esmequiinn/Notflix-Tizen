export const PLUGIN_PROTOCOL_VERSION = 0;

function unavailable() {
  return Promise.reject(new Error("PluginService is not available in this build"));
}

export const PluginServiceClient = {
  isAvailable() {
    return false;
  },

  ensureReady: unavailable,

  fetch() {
    return Promise.resolve(null);
  },

  diagnostics() {
    return Promise.resolve(null);
  },

  checkLifecycleNow() {
    return Promise.resolve(null);
  },

  startLifecycleMonitor() {
    return Promise.resolve(null);
  },

  configureLifecycleMonitor() {},

  stopLifecycleMonitor() {}
};
