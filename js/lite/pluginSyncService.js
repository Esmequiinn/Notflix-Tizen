export function mapRemotePluginRows() {
  return [];
}

export function buildPluginPushRows() {
  return [];
}

export const PluginSyncService = {
  ensureReadyForPull() {
    return Promise.resolve({ status: "skipped" });
  },

  getLastPullStatus() {
    return "unsupported";
  },

  getLastPullError() {
    return null;
  },

  pull() {
    return Promise.resolve([]);
  },

  push() {
    return Promise.resolve(false);
  }
};
