const ASS_LIB_SOURCES = [
  "assets/libs/ass.min.js",
  "https://cdn.jsdelivr.net/npm/assjs@0.1.10/dist/ass.global.min.js"
];

let assLibPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = (error) => {
      script.remove();
      reject(error);
    };
    document.head.appendChild(script);
  });
}

function getAssConstructor() {
  return typeof globalThis.ASS === "function" ? globalThis.ASS : null;
}

export function loadAssSubtitleLib() {
  if (getAssConstructor()) {
    return Promise.resolve(getAssConstructor());
  }
  if (assLibPromise) {
    return assLibPromise;
  }
  assLibPromise = (async () => {
    let lastError = null;
    for (const src of ASS_LIB_SOURCES) {
      try {
        await loadScript(src);
        const constructor = getAssConstructor();
        if (constructor) {
          return constructor;
        }
        lastError = new Error(`ass.js loaded from ${src} without the global ASS constructor`);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("ass.js failed to load");
  })();
  try {
    return assLibPromise;
  } finally {
    assLibPromise
      .catch(() => {})
      .then(() => {
        assLibPromise = null;
      });
  }
}

export function resetAssSubtitleLibCache() {
  assLibPromise = null;
}
