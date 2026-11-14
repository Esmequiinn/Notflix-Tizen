import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source =
  (await readFile(new URL("../js/ui/ambient/ambientMode.js", import.meta.url), "utf8"))
    .replace(/^import .*;$/gm, "")
    .replace(/export const /g, "const ") + "\nglobalThis.subject = AmbientMode;";

let route = "home";
let clock = 1000;
let storeReads = 0;
let trailerChecks = 0;
const screenSaver = { blocks: 0, unblocks: 0 };
const context = vm.createContext({
  Event,
  setTimeout: () => 1,
  clearTimeout() {},
  performance: { now: () => clock },
  console: { warn() {} },
  document: { hidden: false },
  Platform: { isWebOS: () => false, isTizen: () => true },
  TizenScreenSaver: {
    block() {
      screenSaver.blocks += 1;
    },
    unblock() {
      screenSaver.unblocks += 1;
    }
  },
  isAmbientTrailerPlaying: () => {
    trailerChecks += 1;
    return false;
  },
  Router: { getCurrent: () => route, getCurrentScreen: () => null },
  ProfileManager: { getActiveProfileId: () => "1" },
  AmbientModeStore: {
    get: () => {
      storeReads += 1;
      return { enabled: true, timeoutMinutes: 5, catalogKeys: [] };
    }
  },
  loadAmbientSlides: () => new Promise(() => {})
});
vm.runInContext(source, context);
const ambient = context.subject;
let dismissals = 0;
ambient.dismiss = () => {
  dismissals += 1;
  ambient.showing = false;
};
ambient.show = () => {
  ambient.showing = true;
};

ambient.tick();
assert.equal(storeReads, 1);
assert.equal(trailerChecks, 1);
assert.equal(screenSaver.blocks, 0, "no screensaver call while Home is mounting");
assert.equal(ambient.idleRoute, "home");
const signature = ambient.signature;
assert.ok(signature);
clock += 9000;
ambient.tick();
assert.equal(screenSaver.blocks, 0);
clock += 1000;
ambient.tick();
assert.equal(screenSaver.blocks, 1, "armed after ten idle seconds");
storeReads = 1;
trailerChecks = 1;

route = "player";
for (let second = 1; second <= 60; second += 1) {
  clock += 1000;
  ambient.tick();
}
assert.equal(storeReads, 1, "no settings reads while the player is active");
assert.equal(trailerChecks, 1, "no trailer policy checks while the player is active");
assert.ok(
  screenSaver.unblocks >= 1,
  "screensaver released (TizenScreenSaver itself is idempotent)"
);
assert.equal(screenSaver.blocks, 1, "screensaver never re-blocked while the player is active");
assert.equal(ambient.idleRoute, "player");
assert.equal(ambient.lastInteraction, clock, "idle clock keeps resetting on a blocked route");
assert.equal(ambient.signature, signature, "signature untouched");

route = "home";
clock += 1000;
ambient.tick();
assert.equal(storeReads, 2);
assert.equal(ambient.idleRoute, "home");
assert.equal(ambient.lastInteraction, clock, "route change starts a new idle period");
assert.equal(ambient.showing, false);

const dismissalsBefore = dismissals;
ambient.showing = true;
route = "profileSelection";
clock += 1000;
ambient.tick();
assert.equal(dismissals, dismissalsBefore + 1);
assert.equal(ambient.showing, false);
assert.equal(storeReads, 2);

route = "home";
clock += 1000;
ambient.tick();
clock += 5 * 60000;
ambient.tick();
assert.equal(ambient.showing, true, "Ambient shows after the idle timeout on Home");

console.log("ambient blocked-route tick parity: ok");
