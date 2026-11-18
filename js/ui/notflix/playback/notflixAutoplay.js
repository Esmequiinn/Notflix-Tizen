import { LocalStore } from "../../../core/storage/localStore.js";
import { ProfileManager } from "../../../core/profile/profileManager.js";
import { isNotflixActive } from "../notflixAppearance.js";
import {
  isAutoPlayableStream,
  selectAutoPlayStream
} from "../../../core/streams/streamAutoPlaySelector.js";

const STORE_KEY = "notflixAutoplay";

export const QUALITY_PRESETS = Object.freeze({
  uhd_first: ["2160", "1080", "other"],
  fhd_first: ["1080", "2160", "other"],
  fhd_only: ["1080", "other"],
  any: [null]
});

export const LANGUAGE_PRESETS = Object.freeze({
  any: [],
  es: ["es"],
  es_en: ["es", "en"],
  en: ["en"]
});

export const FALLBACK_ATTEMPTS = Object.freeze([2, 3, 5]);

const DEFAULTS = Object.freeze({
  priorityEnabled: false,
  addons: [],
  qualities: "uhd_first",
  language: "any",
  order: "addon",
  fallbackEnabled: true,
  fallbackAttempts: 3
});

function profileKey() {
  return String(ProfileManager.getActiveProfileId?.() ?? "1").trim() || "1";
}

function readAll() {
  const raw = LocalStore.get(STORE_KEY, null);
  return raw && typeof raw === "object" ? raw : {};
}

function sanitize(value) {
  const out = { ...DEFAULTS, ...(value || {}) };
  out.priorityEnabled = Boolean(out.priorityEnabled);
  out.fallbackEnabled = Boolean(out.fallbackEnabled);
  out.addons = Array.isArray(out.addons)
    ? out.addons.map((name) => String(name || "").trim()).filter(Boolean)
    : [];
  if (!QUALITY_PRESETS[out.qualities]) out.qualities = DEFAULTS.qualities;
  if (!LANGUAGE_PRESETS[out.language]) out.language = DEFAULTS.language;
  if (out.orderVersion !== 2) {
    out.order = "addon";
    out.orderVersion = 2;
  }
  if (!["addon", "quality", "language"].includes(out.order)) out.order = "addon";
  if (!FALLBACK_ATTEMPTS.includes(Number(out.fallbackAttempts)))
    out.fallbackAttempts = DEFAULTS.fallbackAttempts;
  out.fallbackAttempts = Number(out.fallbackAttempts);
  return out;
}

export function getNotflixAutoplay() {
  return sanitize(readAll()[profileKey()]);
}

export function setNotflixAutoplay(patch) {
  const all = readAll();
  const id = profileKey();
  all[id] = sanitize({ ...all[id], ...patch });
  LocalStore.set(STORE_KEY, all);
  return all[id];
}

function streamText(stream) {
  return [stream?.name, stream?.title, stream?.description, stream?.label]
    .map((part) => String(part || ""))
    .join("\n");
}

const UHD = /\b(2160p|4k|uhd|ultra\s*hd)\b/i;
const FHD = /\b(1080p|fhd|fullhd|full\s*hd)\b/i;

export function streamQuality(stream) {
  const text = `${stream?.name || ""} ${stream?.title || ""} ${stream?.label || ""}`;
  if (UHD.test(text)) return "2160";
  if (FHD.test(text)) return "1080";
  return "other";
}

const SUBTITLE_SEGMENT =
  /((^|[^a-záéíóúñ])(subs?|subtitles?|subt[ií]tulos?|subtitulad[oa]s?|multi[\s.-]?subs?)(?![a-záéíóúñ])|💬|📜|🔤)[^\n|]*/gi;
const VOSE = /(^|[^a-z])(vose|v\.o\.s\.e\.?)(?![a-z])/i;
const SPANISH_DUB = /(^|[^a-záéíóúñ])(castellano|espa[nñ]ol|latino|spanish)(?![a-záéíóúñ])/i;
const SPANISH_WORD =
  /(^|[^a-záéíóúñ])(es|esp|spa|spanish|castellano|espa[nñ]ol|latino|lat)(?![a-záéíóúñ])/i;
const SPANISH_FLAGS = ["🇪🇸", "🇲🇽", "🇦🇷", "🇨🇱", "🇨🇴", "🇵🇪", "🇻🇪", "🇺🇾"];
const OTHER_LANGUAGE =
  /(^|[^a-z])(ita|italian|fra|french|vff|vf|ger|german|deutsch|rus|russian|por|portugu[eê]s|dublado|hindi|jap|japanese|kor|korean|chi|chinese|tur|turkish|pol|polish)(?![a-z])/i;
const MULTI = /(^|[^a-z])(multi|dual)(?![a-z])/i;

export function streamLanguages(stream) {
  const raw = streamText(stream);
  const text = raw.replace(SUBTITLE_SEGMENT, " ");
  const languages = new Set();
  const spanish = VOSE.test(raw)
    ? SPANISH_DUB.test(text)
    : SPANISH_WORD.test(text) || SPANISH_FLAGS.some((flag) => text.includes(flag));
  if (spanish) languages.add("es");
  if (
    /(^|[^a-z])(eng|english|ingl[eé]s)(?![a-z])/i.test(text) ||
    text.includes("🇺🇸") ||
    text.includes("🇬🇧")
  )
    languages.add("en");
  if (!languages.size && !OTHER_LANGUAGE.test(text) && !MULTI.test(text)) languages.add("en");
  return languages;
}

function buildRules(config, poolAddons = []) {
  const addons = config.addons.length
    ? config.addons
    : config.order === "addon" && poolAddons.length
      ? poolAddons
      : [null];
  const languages = LANGUAGE_PRESETS[config.language].length
    ? LANGUAGE_PRESETS[config.language]
    : [null];
  const qualities = QUALITY_PRESETS[config.qualities];
  const rules = [];
  if (config.order === "addon") {
    addons.forEach((addon) =>
      qualities.forEach((quality) =>
        languages.forEach((language) => rules.push({ addon, quality, language }))
      )
    );
  } else if (config.order === "language") {
    languages.forEach((language) =>
      qualities.forEach((quality) =>
        addons.forEach((addon) => rules.push({ addon, quality, language }))
      )
    );
  } else {
    qualities.forEach((quality) =>
      languages.forEach((language) =>
        addons.forEach((addon) => rules.push({ addon, quality, language }))
      )
    );
  }
  return rules;
}

export function selectPriorityStream(streams, config = getNotflixAutoplay()) {
  const prepared = notflixAutoPlayPool(streams)
    .filter((stream) => stream && !stream.externalUrl && isAutoPlayableStream(stream))
    .map((stream) => ({
      stream,
      addon: String(stream.addonName || "").trim(),
      quality: streamQuality(stream),
      languages: streamLanguages(stream)
    }));
  if (!prepared.length) return null;
  const poolAddons = prepared
    .map((entry) => entry.addon)
    .filter((addon, index, list) => addon && list.indexOf(addon) === index);
  for (const rule of buildRules(config, poolAddons)) {
    const match = prepared.find(
      (entry) =>
        (!rule.addon || entry.addon === rule.addon) &&
        (!rule.quality || entry.quality === rule.quality) &&
        (!rule.language || entry.languages.has(rule.language))
    );
    if (match) return match.stream;
  }
  return null;
}

function autoPlayMode(settings) {
  return String(settings?.streamAutoPlayMode || "MANUAL").toUpperCase();
}

export function pickNotflixPriorityStream(streams, settings) {
  if (!isNotflixActive() || autoPlayMode(settings) === "MANUAL") return null;
  const config = getNotflixAutoplay();
  if (!config.priorityEnabled) return null;
  return selectPriorityStream(streams, config);
}

export function pickFallbackStream(streams, settings, excludedIds) {
  const pool = notflixAutoPlayPool(
    (Array.isArray(streams) ? streams : []).filter(
      (stream) => stream && !excludedIds.has(String(stream.id || ""))
    )
  );
  if (!pool.length) return null;
  const priority = pickNotflixPriorityStream(pool, settings);
  if (priority) return priority;
  const mode = autoPlayMode(settings);
  if (mode === "REGEX_MATCH") {
    return (
      selectAutoPlayStream(pool, {
        mode,
        regexPattern: settings.streamAutoPlayRegex,
        source: "ALL_SOURCES"
      }) || null
    );
  }
  return pool.find((stream) => !stream.externalUrl && isAutoPlayableStream(stream)) || null;
}

export function isFallbackActive() {
  return isNotflixActive() && getNotflixAutoplay().fallbackEnabled;
}

let av1Support = null;

function supportsAv1() {
  if (av1Support !== null) return av1Support;
  const types = ['video/mp4; codecs="av01.0.08M.08"', 'video/webm; codecs="av01.0.08M.08"'];
  try {
    const mse = globalThis.MediaSource;
    av1Support = Boolean(mse?.isTypeSupported && types.some((type) => mse.isTypeSupported(type)));
    if (!av1Support) {
      const probe = document.createElement("video");
      av1Support = types.some((type) => Boolean(probe.canPlayType?.(type)));
    }
  } catch (_) {
    av1Support = false;
  }
  return av1Support;
}

export function isUnsupportedCodecStream(stream) {
  const text = `${stream?.name || ""} ${stream?.title || ""} ${stream?.description || ""}`;
  return /(^|[^a-z0-9])av1([^a-z0-9]|$)/i.test(text) && !supportsAv1();
}

export function notflixAutoPlayPool(streams) {
  const list = Array.isArray(streams) ? streams : [];
  if (!isNotflixActive()) return list;
  const playable = list.filter((stream) => !isUnsupportedCodecStream(stream));
  return playable.length ? playable : list;
}
