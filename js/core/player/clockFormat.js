function parseHourCycle(hourCycle) {
  const normalized = String(hourCycle || "").toLowerCase();
  if (normalized === "h11" || normalized === "h12") {
    return true;
  }
  if (normalized === "h23" || normalized === "h24") {
    return false;
  }
  return null;
}

function resolveIntlHour12(intlApi, locale = undefined) {
  try {
    if (typeof intlApi?.DateTimeFormat !== "function") {
      return null;
    }
    const resolved = new intlApi.DateTimeFormat(locale, {
      hour: "numeric"
    }).resolvedOptions();
    if (typeof resolved?.hour12 === "boolean") {
      return resolved.hour12;
    }
    return parseHourCycle(resolved?.hourCycle);
  } catch (_) {
    return null;
  }
}

export function parsePlatformTimeFormat(format) {
  const normalized = String(format || "").replace(/'[^']*'/g, "");
  if (/\b(?:ap|a)\b/i.test(normalized) || /K/.test(normalized)) {
    return true;
  }
  if (/[Hhk]/.test(normalized)) {
    return false;
  }
  return null;
}

export function resolveWebOsHour12(localeInfo, intlApi = null) {
  const clock = String(localeInfo?.clock || "")
    .trim()
    .toLowerCase();
  if (clock === "12") {
    return true;
  }
  if (clock === "24") {
    return false;
  }
  if (clock === "locale") {
    const formatLocale = String(localeInfo?.locales?.FMT || "").trim() || undefined;
    return resolveIntlHour12(intlApi, formatLocale);
  }
  return null;
}

export function resolveSystemHour12({
  tizenApi = null,
  webOsLocaleInfo = null,
  intlApi = null,
  locale = undefined
} = {}) {
  const webOsHour12 = resolveWebOsHour12(webOsLocaleInfo, intlApi);
  if (typeof webOsHour12 === "boolean") {
    return webOsHour12;
  }

  const intlHour12 = resolveIntlHour12(intlApi, locale);

  if (typeof tizenApi?.time?.getTimeFormat === "function") {
    try {
      const platformHour12 = parsePlatformTimeFormat(tizenApi.time.getTimeFormat());
      if (platformHour12 === false) {
        return false;
      }
      if (typeof intlHour12 === "boolean") {
        return intlHour12;
      }
      if (typeof platformHour12 === "boolean") {
        return platformHour12;
      }
    } catch (_) {}
  }

  return intlHour12;
}

export function buildClockFormatOptions(hour12 = null) {
  const options = {
    hour: "2-digit",
    minute: "2-digit"
  };
  if (typeof hour12 === "boolean") {
    options.hour12 = hour12;
  }
  return options;
}
