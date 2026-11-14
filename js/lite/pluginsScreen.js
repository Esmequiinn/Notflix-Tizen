import { Router } from "../ui/navigation/routerState.js";

export const PluginsScreen = {
  async mount() {
    await Router.back();
  },

  onKeyDown() {},

  cleanup() {}
};
