const TICK_MS = 250;
const CEILING = 92;
const CURVE_MS = 7000;

let startedAt = 0;
let lastSeenAt = 0;
let timer = null;

function percentNow() {
  if (!startedAt) return 0;
  const elapsed = Date.now() - startedAt;
  return Math.min(99, CEILING * (1 - Math.exp(-elapsed / CURVE_MS)));
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
  const text = `${Math.floor(percentNow())}%`;
  labels.forEach((label) => {
    if (label.textContent !== text) label.textContent = text;
  });
}

function ensureTicker() {
  if (!startedAt || Date.now() - lastSeenAt > 1500) startedAt = Date.now();
  lastSeenAt = Date.now();
  if (!timer) timer = setInterval(tick, TICK_MS);
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
        <span class="nf-ld-spin" style="animation-delay:-${(Date.now() % 900) / 1000}s"></span>
        <span class="nf-ld-pct">${text}</span>
      </div>
    </div>
  `;
}
