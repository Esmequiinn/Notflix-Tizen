import { isNotflixActive } from "../notflixAppearance.js";
import { nt } from "../home/notflixHomeMarkup.js";
import {
  FALLBACK_ATTEMPTS,
  LANGUAGE_PRESETS,
  QUALITY_PRESETS,
  getNotflixAutoplay,
  setNotflixAutoplay
} from "./notflixAutoplay.js";

function qualityLabel(id) {
  return {
    uhd_first: nt("notflix_ap_quality_uhd_first", "4K → 1080p → rest"),
    fhd_first: nt("notflix_ap_quality_fhd_first", "1080p → 4K → rest"),
    fhd_only: nt("notflix_ap_quality_fhd_only", "1080p → rest (no 4K)"),
    any: nt("notflix_ap_quality_any", "Any quality")
  }[id];
}

function languageLabel(id) {
  return {
    any: nt("notflix_ap_language_any", "Any language"),
    es: nt("notflix_ap_language_es", "Spanish only"),
    es_en: nt("notflix_ap_language_es_en", "Spanish, then English"),
    en: nt("notflix_ap_language_en", "English only")
  }[id];
}

function orderLabel(id) {
  if (id === "addon") return nt("notflix_ap_order_addon", "Add-ons first");
  return id === "language"
    ? nt("notflix_ap_order_language", "Language first")
    : nt("notflix_ap_order_quality", "Quality first");
}

function addonsLabel(config) {
  return config.addons.length
    ? config.addons.map((name, index) => `${index + 1}. ${name}`).join("  ")
    : nt("notflix_ap_addons_any", "Any add-on");
}

export function renderNotflixAutoplayRows(screen, model) {
  if (!isNotflixActive()) return "";
  const config = getNotflixAutoplay();
  const autoMode = String(model?.player?.streamAutoPlayMode || "MANUAL").toUpperCase();
  const rows = [];
  if (autoMode !== "MANUAL") {
    rows.push(
      screen.renderToggleRow({
        focusKey: "playback:nf:priority",
        title: nt("notflix_ap_priority_title", "Priority list"),
        subtitle: nt(
          "notflix_ap_priority_sub",
          "Try your add-ons, qualities and language in order. If nothing matches, the normal auto-play is used."
        ),
        checked: config.priorityEnabled
      })
    );
    if (config.priorityEnabled) {
      rows.push(
        screen.renderActionRow({
          focusKey: "playback:nf:addons",
          title: nt("notflix_ap_addons_title", "Add-ons, in order"),
          subtitle: config.addons.length
            ? addonsLabel(config)
            : nt(
                "notflix_ap_addons_sub",
                "Press each add-on in the order you want. Press again to remove it."
              ),
          value: config.addons.length
            ? String(config.addons.length)
            : nt("notflix_ap_addons_any", "Any add-on")
        }),
        screen.renderActionRow({
          focusKey: "playback:nf:qualities",
          title: nt("notflix_ap_quality_title", "Qualities, in order"),
          subtitle: qualityLabel(config.qualities),
          value: qualityLabel(config.qualities)
        }),
        screen.renderActionRow({
          focusKey: "playback:nf:language",
          title: nt("notflix_ap_language_title", "Audio language"),
          subtitle: nt(
            "notflix_ap_language_sub",
            "Read from the source name (Latino, Castellano, Español, flags…)."
          ),
          value: languageLabel(config.language)
        }),
        screen.renderActionRow({
          focusKey: "playback:nf:order",
          title: nt("notflix_ap_order_title", "Sort first by"),
          subtitle: nt(
            "notflix_ap_order_sub",
            "Which matters more when a source does not meet both."
          ),
          value: orderLabel(config.order)
        })
      );
    }
  }
  rows.push(
    screen.renderToggleRow({
      focusKey: "playback:nf:fallback",
      title: nt("notflix_ap_fallback_title", "Try another source if it fails"),
      subtitle: nt(
        "notflix_ap_fallback_sub",
        "If an automatically chosen source does not start, try the next one without repeating the ones that failed."
      ),
      checked: config.fallbackEnabled
    })
  );
  if (config.fallbackEnabled) {
    rows.push(
      screen.renderActionRow({
        focusKey: "playback:nf:attempts",
        title: nt("notflix_ap_attempts_title", "Attempts"),
        subtitle: nt(
          "notflix_ap_attempts_sub",
          "After these attempts, the error is shown so you can choose."
        ),
        value: String(config.fallbackAttempts)
      })
    );
  }
  return rows.join("");
}

export function registerNotflixAutoplayActions(screen, addonRepository) {
  screen.actionMap.set("playback:nf:priority", () => {
    setNotflixAutoplay({ priorityEnabled: !getNotflixAutoplay().priorityEnabled });
  });
  screen.actionMap.set("playback:nf:fallback", () => {
    setNotflixAutoplay({ fallbackEnabled: !getNotflixAutoplay().fallbackEnabled });
  });
  screen.actionMap.set("playback:nf:qualities", () => {
    screen.openOptionDialog({
      title: nt("notflix_ap_quality_title", "Qualities, in order"),
      options: Object.keys(QUALITY_PRESETS).map((id) => ({ id, label: qualityLabel(id) })),
      selectedId: getNotflixAutoplay().qualities,
      returnFocusKey: "playback:nf:qualities",
      onSelect: (option) => setNotflixAutoplay({ qualities: option.id })
    });
  });
  screen.actionMap.set("playback:nf:language", () => {
    screen.openOptionDialog({
      title: nt("notflix_ap_language_title", "Audio language"),
      options: Object.keys(LANGUAGE_PRESETS).map((id) => ({ id, label: languageLabel(id) })),
      selectedId: getNotflixAutoplay().language,
      returnFocusKey: "playback:nf:language",
      onSelect: (option) => setNotflixAutoplay({ language: option.id })
    });
  });
  screen.actionMap.set("playback:nf:order", () => {
    screen.openOptionDialog({
      title: nt("notflix_ap_order_title", "Sort first by"),
      options: ["addon", "quality", "language"].map((id) => ({ id, label: orderLabel(id) })),
      selectedId: getNotflixAutoplay().order,
      returnFocusKey: "playback:nf:order",
      onSelect: (option) => setNotflixAutoplay({ order: option.id, orderVersion: 2 })
    });
  });
  screen.actionMap.set("playback:nf:attempts", () => {
    screen.openOptionDialog({
      title: nt("notflix_ap_attempts_title", "Attempts"),
      options: FALLBACK_ATTEMPTS.map((value) => ({ id: String(value), label: String(value) })),
      selectedId: String(getNotflixAutoplay().fallbackAttempts),
      returnFocusKey: "playback:nf:attempts",
      onSelect: (option) => setNotflixAutoplay({ fallbackAttempts: Number(option.id) })
    });
  });
  screen.actionMap.set("playback:nf:addons", async () => {
    const installed = await addonRepository.getInstalledAddons().catch(() => []);
    const names = installed
      .map((addon) => String(addon?.displayName || addon?.name || "").trim())
      .filter((name, index, list) => name && list.indexOf(name) === index);
    let order = getNotflixAutoplay().addons.filter((name) => names.includes(name));
    const labelFor = (name) => {
      const position = order.indexOf(name);
      return position >= 0 ? `${position + 1}. ${name}` : name;
    };
    const options = names.map((name) => ({ id: name, label: labelFor(name) }));
    screen.openMultiChoiceDialog({
      title: nt("notflix_ap_addons_title", "Add-ons, in order"),
      message: nt(
        "notflix_ap_addons_sub",
        "Press each add-on in the order you want. Press again to remove it."
      ),
      options,
      selectedIds: order,
      returnFocusKey: "playback:nf:addons",
      onToggle: (selectedIds) => {
        const selected = new Set(selectedIds.map(String));
        order = order.filter((name) => selected.has(name));
        selectedIds.forEach((name) => {
          if (!order.includes(name)) order.push(name);
        });
        options.forEach((option) => {
          option.label = labelFor(option.id);
        });
        setNotflixAutoplay({ addons: order });
      }
    });
  });
}
