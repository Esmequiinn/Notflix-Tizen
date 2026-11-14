export const PluginCodeStore = {
  get() {
    return Promise.resolve(null);
  },

  put() {
    return Promise.resolve(false);
  },

  remove() {
    return Promise.resolve(false);
  },

  clearProfile() {
    return Promise.resolve();
  },

  clearAll() {
    return Promise.resolve();
  }
};
