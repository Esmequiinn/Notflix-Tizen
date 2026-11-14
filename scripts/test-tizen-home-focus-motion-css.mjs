import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../css/components-60.css", import.meta.url), "utf8");

function selectors(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("}")
    .flatMap((rule) => (rule.split("{")[0] || "").split(","))
    .map((selector) => selector.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const all = selectors(css);
const legacyTizen = all.filter((selector) => selector.startsWith(".legacy-tizen "));
const constrained = all.filter((selector) => selector.startsWith(".performance-constrained "));

const homeMotionTargets = [
  ".home-content-card.focused",
  ".home-continue-card.focused",
  ".home-poster-card.focused",
  ".home-layout-classic .home-poster-card",
  ".home-layout-grid .home-poster-card",
  ".home-layout-modern .home-poster-card",
  ".home-layout-modern .home-poster-frame"
];

for (const target of homeMotionTargets) {
  assert.deepEqual(
    legacyTizen.filter((selector) => selector.includes(target)),
    [],
    `legacy-tizen must not gate Home focus motion for ${target}`
  );
  assert.ok(
    constrained.some((selector) => selector.includes(target)),
    `performance-constrained keeps the instant path for ${target}`
  );
}

assert.ok(
  legacyTizen.includes(".legacy-tizen .focusable:not(.home-content-card)"),
  "the legacy-tizen instant-focus catch-all excludes Home content cards"
);

for (const kept of [
  ".legacy-tizen .modern-sidebar-shell",
  ".legacy-tizen .modern-sidebar-panel",
  ".legacy-tizen .home-poster-skeleton-line",
  ".legacy-tizen .settings-workspace"
]) {
  assert.ok(legacyTizen.includes(kept), `${kept} stays on every Tizen`);
}

const homeScroll = readFileSync(
  new URL(
    "../js/ui/screens/home/homeScreenMethods-03-is-scroll-animation-active.js",
    import.meta.url
  ),
  "utf8"
);
const policy = homeScroll.slice(homeScroll.indexOf("shouldUseImmediateFocusScroll()"));
assert.doesNotMatch(
  policy.slice(0, policy.indexOf("},")),
  /contains("legacy-tizen")/,
  "Home immediate focus scroll must not read the legacy-tizen class"
);

const heroBackdropRule = css.match(
  /\.legacy-tizen \.home-screen-shell\.home-layout-modern \.home-hero-backdrop \{([^}]*)\}/
);
assert.ok(heroBackdropRule, "legacy-tizen removes the modern hero backdrop filter");
assert.match(heroBackdropRule[1], /filter:\s*none/);

console.log("tizen home focus motion css ok");
