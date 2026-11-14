import assert from "node:assert/strict";

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k)
};

const { Platform } = await import("../js/platform/index.js");
const { PlayerController } = await import("../js/core/player/playerController.js");
const { TizenEngineFsService } = await import("../js/platform/tizen/tizenEngineFsService.js");

Platform.isTizen = () => true;
Platform.isWebOS = () => false;
TizenEngineFsService.ensureStarted = async () => ({
  status: "success",
  baseUrl: "http://127.0.0.1:2710"
});

const CDN = "https://cdn7.debrid.example/dl/abc/movie.mkv";
let fetchPlan;
const fetchCalls = [];
globalThis.fetch = async (url, init) => {
  fetchCalls.push({ url, init });
  if (fetchPlan === "fail") throw new TypeError("network");
  return {
    url: fetchPlan === "redirect" || fetchPlan === "redirect-forbidden" ? CDN : url,
    status: fetchPlan === "forbidden" || fetchPlan === "redirect-forbidden" ? 403 : 206,
    headers: { get: (name) => ({ "accept-ranges": "bytes" })[name] ?? null },
    body: { cancel() {} }
  };
};

let avplayUrl = null;
const noop = () => {};
Object.assign(PlayerController, {
  video: {
    pause: noop,
    removeAttribute: noop,
    load: noop,
    querySelectorAll: () => [],
    addEventListener: noop,
    dispatchEvent: noop
  },
  flushCurrentProgress: async () => {},
  stopWebOsDtsAudioTranscode: noop,
  applyStartupAudioGateToVideo: noop,
  stopWebOsServiceKeepAlive: noop,
  clearWebOsTrackSelections: noop,
  startWebOsPlaybackKeepAlive: noop,
  choosePlaybackEngine: () => "tizen-avplay",
  ensureAdaptiveLibrariesForSource: async () => {},
  canUseAvPlay: () => true,
  getPlatformAvplayEngineName: () => "tizen-avplay",
  isLivePlaybackItemType: () => false,
  rememberPlaybackEngineAttempt: noop,
  teardownAdaptiveInstances: noop,
  teardownAvPlay: noop,
  resetNativeMediaState: noop,
  startProgressSaving: noop,
  playWithAvPlay(url) {
    avplayUrl = url;
    return true;
  }
});

async function playSource(url, headers = {}) {
  avplayUrl = null;
  fetchCalls.length = 0;
  await PlayerController.play(url, { itemType: "movie", requestHeaders: headers });
  return avplayUrl;
}

const AIO = "https://aiostreams.example.com/api/v1/playback/xyz/movie.mkv";

fetchPlan = "redirect";
assert.equal(await playSource(AIO), CDN);
assert.equal(fetchCalls.length, 1, "one ranged request to follow the redirect");
assert.equal(PlayerController.currentPlaybackUrl, CDN);

fetchPlan = "fail";
assert.match(await playSource(AIO), /^http:\/\/127\.0\.0\.1:2710\/proxy\//);

fetchPlan = "forbidden";
assert.match(await playSource(AIO), /^http:\/\/127\.0\.0\.1:2710\/proxy\//);

fetchPlan = "redirect";
assert.equal(await playSource(AIO, { Referer: "https://site.example/" }), CDN);
assert.equal(fetchCalls.length, 1, "one header-less probe");
assert.equal(
  fetchCalls[0].init.headers.Referer,
  undefined,
  "probe never forwards the addon headers"
);
fetchPlan = "redirect-forbidden";
assert.match(
  await playSource(AIO, { Authorization: "Bearer x" }),
  /^http:\/\/127\.0\.0\.1:2710\/proxy\//
);

fetchPlan = "redirect";
assert.equal(await playSource("https://addon.example/resolve/rd/abc/1/movie.mkv"), CDN);

const RESOLVE = "https://addon.example/resolve/rd/abc/1/movie.mkv";
fetchPlan = "redirect-forbidden";
assert.equal(await playSource(RESOLVE), RESOLVE);

fetchPlan = "redirect";
assert.equal(await playSource(CDN), CDN);
assert.deepEqual(PlayerController.lastTizenAvPlayRoute, { url: CDN, viaLocalProxy: false });

avplayUrl = null;
fetchCalls.length = 0;
await PlayerController.play(CDN, { itemType: "movie", forceLocalProxy: true });
assert.match(avplayUrl, /^http:\/\/127\.0\.0\.1:2710\/proxy\//);
assert.equal(fetchCalls.length, 0);
assert.deepEqual(PlayerController.lastTizenAvPlayRoute, { url: CDN, viaLocalProxy: true });

console.log("tizen direct avplay source tests passed");
