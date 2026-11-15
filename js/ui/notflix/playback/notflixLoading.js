const TICK_MS = 250;
const CEILING = 92;
const CURVE_MS = 7000;

const SPIN_MS = 900;
const SPIN_KEEPALIVE_MS = 700;

let startedAt = 0;
let spinFrame = null;
let spinWantedAt = 0;
let lastSeenAt = 0;
let timer = null;

function percentNow() {
  if (!startedAt) return 0;
  const elapsed = Date.now() - startedAt;
  return Math.min(99, CEILING * (1 - Math.exp(-elapsed / CURVE_MS)));
}

function nextFrame(callback) {
  return typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(callback)
    : setTimeout(callback, 33);
}

function spinStep() {
  if (Date.now() - spinWantedAt > SPIN_KEEPALIVE_MS) {
    spinFrame = null;
    return;
  }
  const nodes = document.getElementsByClassName("nf-ld-spin");
  const value = `rotate(${(((Date.now() % SPIN_MS) / SPIN_MS) * 360).toFixed(1)}deg)`;
  for (let index = 0; index < nodes.length; index += 1) nodes[index].style.transform = value;
  spinFrame = nextFrame(spinStep);
}

export function keepSpinning() {
  spinWantedAt = Date.now();
  if (!spinFrame) spinFrame = nextFrame(spinStep);
}

function tick() {
  const labels = document.querySelectorAll(".nf-loading .nf-ld-pct");
  if (!labels.length) {
    if (Date.now() - lastSeenAt > 1500) {
      clearInterval(timer);
      timer = null;
    }
    return;
  }
  lastSeenAt = Date.now();
  keepSpinning();
  const text = `${Math.floor(percentNow())}%`;
  labels.forEach((label) => {
    if (label.textContent !== text) label.textContent = text;
  });
}

function ensureTicker() {
  if (!startedAt || Date.now() - lastSeenAt > 1500) startedAt = Date.now();
  lastSeenAt = Date.now();
  if (!timer) timer = setInterval(tick, TICK_MS);
  keepSpinning();
  setTimeout(tick, 0);
}

export function getPreloadPercent() {
  if (!startedAt || Date.now() - lastSeenAt > 3000) return 0;
  return percentNow();
}

export function notflixLoadingMarkup() {
  ensureTicker();
  const text = `${Math.floor(percentNow())}%`;
  return `
    <div class="nf-loading">
      <div class="nf-ld" aria-hidden="true">
        <span class="nf-ld-spin"></span>
        <span class="nf-ld-pct">${text}</span>
      </div>
    </div>
  `;
}
