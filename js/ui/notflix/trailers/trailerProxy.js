const CANDIDATES = [
  "https://esmequiinn.github.io/Notflix-Tizen/nf-youtube-proxy.html",
  "https://raw.githack.com/Esmequiinn/Notflix-Tizen/main/nf-youtube-proxy.html"
];
const PROBE_TIMEOUT_MS = 5000;

let resolved = null;
let probing = null;

function probe(url) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);
    fetch(`${url}?probe=${Date.now()}`, { method: "GET", cache: "no-store" })
      .then((response) => response.text().then((text) => ({ response, text })))
      .then(({ response, text }) => {
        clearTimeout(timer);
        finish(Boolean(response.ok && text.includes("nfVolumeControl")));
      })
      .catch(() => {
        clearTimeout(timer);
        finish(false);
      });
  });
}

export function startTrailerProxyProbe() {
  if (probing) return probing;
  probing = Promise.all(CANDIDATES.map((url) => probe(url))).then((results) => {
    const index = results.findIndex(Boolean);
    resolved = index >= 0 ? CANDIDATES[index] : "";
    return resolved;
  });
  return probing;
}

export function getTrailerProxyUrl() {
  return resolved || "";
}

export function buildTrailerProxyEmbed(ytId) {
  const base = getTrailerProxyUrl();
  if (!base || !ytId) return "";
  const params = [`v=${encodeURIComponent(ytId)}`, "nfvol=0", "loop=1"];
  return `${base}?${params.join("&")}`;
}
