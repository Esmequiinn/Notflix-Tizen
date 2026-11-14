import { PluginStore, getEffectivePluginProfileId } from "../../data/local/pluginStore.js";
import { booleanOrNull, normalizeFeaturePayload } from "./profileSettingsSyncServiceHelpers-01-pull-rpc.js";

export const plugin_settings = {
  export(profileId) {
    return {
      group_streams_by_repository: PluginStore.get(profileId).settings.groupStreamsByRepository === true
    };
  },
  project(rawFeature = {}) {
    const raw = normalizeFeaturePayload(rawFeature);
    const grouping = booleanOrNull(raw.group_streams_by_repository);
    return grouping == null ? {} : { group_streams_by_repository: grouping };
  },
  import(profileId, rawFeature = {}) {
    if (String(getEffectivePluginProfileId(profileId)) !== String(profileId || "1")) {
      return false;
    }
    const projected = this.project(rawFeature);
    if (!Object.prototype.hasOwnProperty.call(projected, "group_streams_by_repository")) {
      return false;
    }
    const state = PluginStore.get(profileId);
    const enabled = projected.group_streams_by_repository;
    if ((state.settings.groupStreamsByRepository === true) === enabled) {
      return false;
    }
    PluginStore.replace(
      {
        ...state,
        settings: { ...state.settings, groupStreamsByRepository: enabled }
      },
      profileId
    );
    return true;
  }
};
