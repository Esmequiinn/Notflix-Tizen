import assert from "node:assert/strict";

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k)
};

let now = 1_000_000;
const realDateNow = Date.now;
Date.now = () => now;
let timers = [];
let nextTimerId = 1;
globalThis.setTimeout = (fn, ms) => {
  const id = nextTimerId++;
  timers.push({ id, at: now + Number(ms || 0), fn });
  return id;
};
globalThis.clearTimeout = (id) => {
  timers = timers.filter((timer) => timer.id !== id);
};
function advance(ms) {
  const end = now + ms;
  for (;;) {
    timers.sort((a, b) => a.at - b.at);
    const due = timers[0];
    if (!due || due.at > end) break;
    timers.shift();
    now = due.at;
    due.fn();
  }
  now = end;
}

const { Environment } = await import("../js/platform/environment.js");
const { PlayerController } = await import("../js/core/player/playerController.js");
const { createPlayerScreenMethods30 } =
  await import("../js/ui/screens/player/playerScreenMethods-30-schedule-buffering-spinner-refresh.js");

let isTizen = true;
Environment.isTizen = () => isTizen;
Environment.isWebOS = () => !isTizen;

let nativeSeconds = 0;
const seekCalls = [];
Object.assign(PlayerController, {
  isUsingAvPlay: () => isTizen,
  getCurrentTimeSeconds: () => nativeSeconds,
  getPlaybackReadyState: () => 4,
  isPlaybackEnded: () => false,
  getAvPlayState: () => "PLAYING",
  seekToSeconds: (seconds) => {
    seekCalls.push(seconds);
    return true;
  },
  avplaySeekInFlight: false,
  avplaySeekSettledAt: 0,
  avplayLastSeekOutcome: null,
  video: null
});

const warnings = [];
const originalWarn = console.warn;
console.warn = (...args) => warnings.push(String(args[0]));

function createScreen() {
  const screen = {
    seekLoading: false,
    pendingPlaybackRestore: null,
    hasPresentedPlaybackFrame: true,
    loadingVisible: false,
    paused: false,
    isStartupLoadingVisible: () => false,
    getPlaybackControlPaused: () => screen.paused,
    updateLoadingVisibility: () => {},
    clearBufferingSpinnerTimer: () => {}
  };
  Object.assign(screen, createPlayerScreenMethods30());
  return screen;
}

function beginSeek(screen, targetSeconds) {
  screen.seekLoadingBaselineSeconds = screen.getPlaybackCurrentSeconds();
  screen.seekLoadingTargetSeconds = targetSeconds;
  screen.seekLoadingSettled = false;
  screen.seekLoadingProgressSeconds = null;
  screen.seekLoadingProgressAt = 0;
  screen.seekLoadingStartedAt = Date.now();
  screen.seekLoading = true;
  screen.startSeekLoadingWatchdog();
}

function nativeSeekSettles(screen, targetSeconds, { success = true } = {}) {
  advance(300);
  nativeSeconds = targetSeconds;
  PlayerController.avplaySeekSettledAt = Date.now();
  PlayerController.avplayLastSeekOutcome = { success, targetMs: targetSeconds * 1000 };
  if (success) {
    screen.seekLoadingSettled = true;
    screen.seekLoadingProgressSeconds = null;
  }
  screen.completeSeekLoadingIfReady();
}

function tick(screen, playbackAdvanceSeconds = 1) {
  advance(1000);
  nativeSeconds += playbackAdvanceSeconds;
  if (screen.seekLoading) {
    screen.completeSeekLoadingIfReady();
  }
}

function reset() {
  timers = [];
  nativeSeconds = 100;
  seekCalls.length = 0;
  warnings.length = 0;
  PlayerController.avplaySeekInFlight = false;
  PlayerController.avplaySeekSettledAt = 0;
  PlayerController.avplayLastSeekOutcome = null;
  isTizen = true;
}

{
  reset();
  const screen = createScreen();
  beginSeek(screen, 110);
  nativeSeekSettles(screen, 110);
  assert.equal(
    screen.seekLoading,
    true,
    "the seek jump itself must not count as playback progress"
  );
  tick(screen);
  assert.equal(
    screen.seekLoading,
    false,
    "a normal 1.0 s advance per 1000 ms tick must clear the seek spinner"
  );
  assert.equal(
    screen.seekLoadingWatchdogTimer,
    null,
    "clearing the seek spinner stops the watchdog"
  );
}

{
  reset();
  const screen = createScreen();
  beginSeek(screen, 300);
  nativeSeekSettles(screen, 300);
  tick(screen, 1.02);
  tick(screen, 1.02);
  assert.equal(screen.seekLoading, false);
}

{
  reset();
  const screen = createScreen();
  beginSeek(screen, 500);
  nativeSeekSettles(screen, 500);
  tick(screen, 30);
  assert.equal(
    screen.seekLoading,
    true,
    "an implausible 30 s advance in 1 s must not complete the seek"
  );
  tick(screen);
  assert.equal(screen.seekLoading, false);
}

{
  reset();
  const screen = createScreen();
  beginSeek(screen, 200);
  nativeSeconds = 100;
  advance(300);
  PlayerController.avplaySeekSettledAt = Date.now();
  PlayerController.avplayLastSeekOutcome = { success: false, targetMs: 200_000 };
  assert.equal(
    screen.hasSeekLoadingSettled(),
    true,
    "a failed native seek still ends the native operation"
  );
  tick(screen);
  tick(screen);
  assert.equal(
    screen.seekLoading,
    false,
    "playback continuing after a failed seek clears the spinner"
  );
}

{
  reset();
  const screen = createScreen();
  PlayerController.avplaySeekSettledAt = Date.now();
  advance(50);
  beginSeek(screen, 50);
  assert.equal(screen.hasSeekLoadingSettled(), false);
  PlayerController.avplaySeekInFlight = true;
  PlayerController.avplaySeekSettledAt = Date.now() + 10;
  assert.equal(screen.hasSeekLoadingSettled(), false, "an in-flight native seek is never settled");
  screen.stopSeekLoadingWatchdog();
}

{
  reset();
  const screen = createScreen();
  beginSeek(screen, 900);
  nativeSeekSettles(screen, 900);
  advance(11_700);
  assert.equal(seekCalls.length, 1, "watchdog retries the seek once after ~12 s without progress");
  assert.equal(seekCalls[0], 900);
  assert.equal(screen.seekLoading, true);
  advance(30_000);
  assert.equal(seekCalls.length, 1, "the seek is retried at most once");
  assert.equal(screen.seekLoading, false, "watchdog always hands the controls back");
  assert.ok(
    warnings.some((w) => w.startsWith("Tizen AVPlay seek did not resume")),
    "give-up is logged as a warning"
  );
}

{
  reset();
  const screen = createScreen();
  beginSeek(screen, 400);
  advance(300);
  nativeSeconds = 400;
  PlayerController.avplaySeekSettledAt = Date.now();
  screen.seekLoadingSettled = true;
  advance(3_700);
  assert.equal(screen.seekLoading, true);
  nativeSeconds = 404;
  advance(4_000);
  assert.equal(
    screen.seekLoading,
    false,
    "watchdog sees the clock advancing and clears the spinner"
  );
  assert.equal(seekCalls.length, 0);
}

{
  reset();
  const screen = createScreen();
  beginSeek(screen, 700);
  PlayerController.avplaySeekInFlight = true;
  advance(36_000);
  assert.equal(screen.seekLoading, true);
  assert.equal(seekCalls.length, 0, "never re-seek while AVPlay is still seeking");
  PlayerController.avplaySeekInFlight = false;
  screen.stopSeekLoadingWatchdog();
}

{
  reset();
  isTizen = false;
  const screen = createScreen();
  beginSeek(screen, 50);
  assert.equal(screen.seekLoadingWatchdogTimer ?? null, null, "no watchdog outside Tizen AVPlay");
  PlayerController.avplaySeekSettledAt = Date.now() + 1;
  assert.equal(screen.hasSeekLoadingSettled(), false, "webOS still needs the seeked event");
  screen.seekLoadingSettled = true;
  nativeSeconds = 50;
  screen.completeSeekLoadingIfReady();
  advance(250);
  nativeSeconds = 50.25;
  screen.completeSeekLoadingIfReady();
  assert.equal(screen.seekLoading, false, "webOS 250 ms timeupdates still complete the seek");
}

{
  reset();
  const screen = createScreen();
  screen.paused = true;
  beginSeek(screen, 120);
  nativeSeekSettles(screen, 120);
  assert.equal(screen.seekLoading, false);
}

console.warn = originalWarn;
Date.now = realDateNow;
console.log("tizen seek loading tests passed");
