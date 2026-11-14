export const PluginRuntime = {
  cancelAll() {},

  selfTest() {
    return Promise.reject(new Error("Plugins are not available in this build"));
  },

  execute() {
    return Promise.reject(new Error("Plugins are not available in this build"));
  }
};
