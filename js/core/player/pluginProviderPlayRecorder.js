import { registerSessionTeardownHandler } from "../auth/sessionLifecycle.js";
import { PluginProviderPlaysStore } from "../../data/local/pluginProviderPlaysStore.js";
import { scraperIdFromPluginBingeGroup } from "../streams/pluginBingeGroup.js";

let recordedIdentity = null;

export function recordDistinctPluginPlay(bingeGroup, playbackIdentity = "") {
  const group = String(bingeGroup || "").trim();
  const scraperId = scraperIdFromPluginBingeGroup(group);
  if (!scraperId) {
    return false;
  }
  const identity = String(playbackIdentity || "").trim();
  const key = `${group}|${identity}`;
  if (key === recordedIdentity) {
    return false;
  }
  recordedIdentity = key;
  PluginProviderPlaysStore.record(scraperId);
  return true;
}

export function resetPluginProviderPlayRecording() {
  recordedIdentity = null;
}

registerSessionTeardownHandler(() => resetPluginProviderPlayRecording());
