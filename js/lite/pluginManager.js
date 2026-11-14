export const ANDROID_PLUGIN_MANAGEMENT_USER_AGENT = "NuvioTV/1.0";

export function androidResultString(value) {
  return value == null ? "" : String(value);
}

export function resultToStream() {
  return null;
}

function emptySummary() {
  return {
    repositories: [],
    scrapers: [],
    legacySources: [],
    unknownRemoteRows: [],
    pluginsEnabled: false,
    groupStreamsByRepository: false,
    runtime: PluginManager.getCapabilitySnapshot(),
    readOnly: true,
    effectiveProfileId: null
  };
}

function unsupported() {
  return Promise.reject(new Error("Plugins are not available in this build"));
}

export const PluginManager = {
  get pluginsEnabled() {
    return false;
  },

  get groupStreamsByRepository() {
    return false;
  },

  getEffectiveProfileId() {
    return null;
  },

  getCapabilitySnapshot() {
    return {
      candidate: false,
      executable: false,
      reason: "Plugins are not available in this build",
      pluginServiceAvailable: false,
      localJsPluginSupported: false,
      pluginMemoryBudget: 0,
      pluginMaxConcurrency: 0,
      runtimeHandshakeComplete: false,
      runtimeStatus: "unsupported",
      runtimeError: ""
    };
  },

  getSearchTimeoutMs() {
    return 0;
  },

  getRuntimeStatus() {
    return Promise.resolve(this.getCapabilitySnapshot());
  },

  ensureRuntime: unsupported,

  listRepositories() {
    return [];
  },

  listScrapers() {
    return [];
  },

  hasCompatibleScrapers() {
    return false;
  },

  listPluginSources() {
    return [];
  },

  getSummary() {
    return emptySummary();
  },

  setPluginsEnabled() {
    return false;
  },

  setGroupStreamsByRepository() {
    return false;
  },

  addRepository: unsupported,
  refreshRepository: unsupported,
  removeRepository: unsupported,
  testScraper: unsupported,

  setRepositoryEnabled() {
    return false;
  },

  setScraperEnabled() {
    return false;
  },

  setAllScrapersEnabled() {
    return false;
  },

  reconcileWithRemoteRepoUrls() {
    return Promise.resolve([]);
  },

  executeScrapersStreaming() {
    return Promise.resolve([]);
  },

  setScraperSettings() {
    return false;
  },

  clearCache() {
    return Promise.resolve();
  },

  addPluginSource() {
    return false;
  },

  removePluginSource() {
    return false;
  },

  setPluginSourceEnabled() {
    return false;
  }
};
