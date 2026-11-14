import * as internals from "./settingsScreenContext.js";
import { NOTFLIX_STYLE, NUVIO_STYLE, getAppearanceStyle, isNotflixActive, setAppearanceStyle } from "../../notflix/notflixAppearance.js";
import { getNotflixOptions, setNotflixOption } from "../../notflix/notflixOptions.js";
import { listHiddenTitles, unhideTitle } from "../../notflix/profiles/hiddenTitles.js";
import { AGE_LIMITS, getAgeLimit, setAgeLimit } from "../../notflix/profiles/ageGate.js";

export function createSettingsScreenMethods05() {
  const {
    Router,
    LocalStore,
    ThemeStore,
    ThemeManager,
    ThemeColors,
    MemberAccessRepository,
    availableThemeIds,
    areCustomThemeColorsSolid,
    encodeCustomThemeColors,
    parseCustomThemeColor,
    resolveCustomThemeColors,
    LayoutPreferences,
    ExperienceModeStore,
    ProfileManager,
    isFastHorizontalNavigationEnabled,
    CW_DISPLAY_SNAPSHOT_KEY,
    CW_ENRICHMENT_CACHE_KEY,
    I18n,
    THEME_OPTIONS,
    FONT_OPTIONS,
    LANGUAGE_OPTIONS,
    SECTION_META,
    t,
    escapeHtml,
    labelForFont,
    labelForLanguage,
    settingsScrollIndicatorMarkup
  } = internals;

  const renderNotflixAppearanceRows = function (choices, titles) {
    const options = getNotflixOptions();
    const labelFor = (key) => choices[key].find((choice) => choice.id === options[key])?.label || "";
    const rows = [
      this.renderActionRow({
        focusKey: "appearance:notflix:homeCatalogs",
        title: t("notflix_home_catalogs", {}, "Home catalogs"),
        subtitle: t("notflix_home_catalogs_help", {}, "Choose and order the catalogs shown on Home.")
      }),
      this.renderActionRow({
        focusKey: "appearance:notflix:homeMotion",
        title: titles.homeMotion,
        subtitle: t("notflix_home_motion_help", {}, "Only affects Notflix Home. Reduced removes card zoom and animation."),
        value: labelFor("homeMotion")
      }),
      this.renderActionRow({
        focusKey: "appearance:notflix:cardOpening",
        title: titles.cardOpening,
        subtitle: t("notflix_card_open_help", {}, "How long a title must stay focused before its card opens."),
        value: labelFor("cardOpening")
      }),
      this.renderActionRow({
        focusKey: "appearance:notflix:cardSize",
        title: titles.cardSize,
        subtitle: t("notflix_card_size_help", {}, "Only affects Notflix Home."),
        value: labelFor("cardSize")
      }),
      this.renderActionRow({
        focusKey: "appearance:notflix:heroRotation",
        title: titles.heroRotation,
        subtitle: t("notflix_hero_rotation_help", {}, "The cover changes title on its own while you are not pressing anything."),
        value: labelFor("heroRotation")
      }),
      this.renderToggleRow({
        focusKey: "appearance:notflix:previewEnabled",
        title: t("notflix_preview_enabled", {}, "Trailers on cards"),
        subtitle: t("notflix_preview_help", {}, "Only this profile and device."),
        checked: options.previewEnabled
      })
    ];
    if (options.previewEnabled) {
      rows.push(
        this.renderActionRow({
          focusKey: "appearance:notflix:trailerIdle",
          title: titles.trailerIdle,
          subtitle: t("notflix_trailer_idle_help", {}, "Trailers start only after you stay on a title without pressing anything."),
          value: labelFor("trailerIdle")
        }),
        this.renderToggleRow({
          focusKey: "appearance:notflix:heroTrailer",
          title: t("notflix_hero_trailer", {}, "Trailer on the cover"),
          checked: options.heroTrailer
        })
      );
      rows.push(
        this.renderToggleRow({
          focusKey: "appearance:notflix:previewSound",
          title: t("notflix_preview_sound", {}, "Trailer sound"),
          checked: options.previewSound
        })
      );
    }
    rows.push(
      this.renderToggleRow({
        focusKey: "appearance:notflix:uiSounds",
        title: t("notflix_ui_sounds", {}, "Interface sounds"),
        checked: options.uiSounds
      }),
      this.renderToggleRow({
        focusKey: "appearance:notflix:introEnabled",
        title: t("notflix_intro_enabled", {}, "Intro at startup"),
        subtitle: t("notflix_intro_help", {}, "Only this profile and device. Changes apply on the next start."),
        checked: options.introEnabled
      })
    );
    if (options.introEnabled) {
      rows.push(
        this.renderToggleRow({
          focusKey: "appearance:notflix:introSound",
          title: t("notflix_intro_sound", {}, "Intro sound"),
          checked: options.introSound
        })
      );
    }
    rows.push(
      this.renderActionRow({
        focusKey: "appearance:notflix:ageLimit",
        title: t("notflix_age_limit_title", {}, "Age limit"),
        subtitle: t("notflix_age_limit_help", {}, "Only this device. Applies to this profile."),
        value: t(`notflix_age_limit_${getAgeLimit()}`, {}, getAgeLimit())
      })
    );
    const hiddenCount = listHiddenTitles().length;
    rows.push(
      this.renderActionRow({
        focusKey: "appearance:notflix:hidden",
        title: t("notflix_hidden_titles", [hiddenCount], `Hidden titles (${hiddenCount})`),
        subtitle: hiddenCount
          ? t("notflix_hidden_title_restore", {}, "Show again")
          : t("notflix_hidden_titles_empty", {}, "No hidden titles")
      })
    );
    return rows.join("");
  };

  return {
    renderNotflixAppearanceRows(choices, titles) {
      return renderNotflixAppearanceRows.call(this, choices, titles);
    },
    renderAdvancedSection(model) {
      this.actionMap.set("advanced:fastHorizontalNavigation", () => {
        LayoutPreferences.set({
          fastHorizontalNavigationEnabled: !isFastHorizontalNavigationEnabled()
        });
      });
      this.actionMap.set("advanced:rememberLastProfile", () => {
        ProfileManager.setRememberLastProfileEnabled(!ProfileManager.isRememberLastProfileEnabled());
      });
      const isEssential = model.experience?.mode === "ESSENTIAL";
      this.actionMap.set("advanced:switchExperience", () => {
        const targetMode = isEssential ? "ADVANCED" : "ESSENTIAL";
        this.openOptionDialog({
          title: t(
            targetMode === "ADVANCED" ? "experience_mode_confirm_advanced_title" : "experience_mode_confirm_essential_title",
            {},
            targetMode === "ADVANCED" ? "Switch to Advanced?" : "Switch to Essential?"
          ),
          message: t(
            targetMode === "ADVANCED" ? "experience_mode_confirm_advanced_subtitle" : "experience_mode_confirm_essential_subtitle",
            {},
            "Your saved settings stay unchanged and you can switch back anytime."
          ),
          options: [
            { id: "cancel", labelKey: "action_cancel" },
            { id: "confirm", labelKey: "profile_confirm" }
          ],
          selectedId: "confirm",
          returnFocusKey: "advanced:switchExperience",
          onSelect: (option) => {
            if (option.id === "confirm") ExperienceModeStore.set({ mode: targetMode });
          }
        });
      });
      this.actionMap.set("advanced:clearContinueWatchingCache", () => {
        LocalStore.remove(CW_ENRICHMENT_CACHE_KEY);
        LocalStore.remove(CW_DISPLAY_SNAPSHOT_KEY);
        this.advancedCacheCleared = true;
      });
      this.actionMap.set("advanced:networkSpeedTest", () => {
        this.startNetworkSpeedTest();
      });
      this.actionMap.set("advanced:streamSpeedTest", () => {
        this.startStreamSpeedTest();
      });

      if (isEssential) {
        return `
            ${this.renderSectionHeader({
              ...SECTION_META.find((item) => item.id === "advanced"),
              subtitleKey: "experience_mode_switch_to_advanced_header_subtitle"
            })}
            <div class="settings-group-card"><div class="settings-stack">
              ${this.renderActionRow({
                focusKey: "advanced:switchExperience",
                title: t("experience_mode_switch_to_advanced", {}, "Switch to Advanced"),
                subtitle: t(
                  "experience_mode_switch_to_advanced_subtitle",
                  {},
                  "Show full layout, plug-in, integration, catalog, collection, and tuning settings."
                ),
                value: t("experience_mode_essential", {}, "Essential")
              })}
            </div></div>`;
      }

      return `
          ${this.renderSectionHeader(SECTION_META.find((item) => item.id === "advanced"))}
          <div class="settings-group-heading"><div class="settings-group-title">${escapeHtml(t("experience_mode_group_title", {}, "Experience mode"))}</div></div>
          <div class="settings-group-card"><div class="settings-stack">
            ${this.renderActionRow({
              focusKey: "advanced:switchExperience",
              title: t("experience_mode_switch_to_essential", {}, "Switch to Essential"),
              subtitle: t(
                "experience_mode_switch_to_essential_subtitle",
                {},
                "Hide advanced setup surfaces without changing your saved values."
              ),
              value: t("experience_mode_advanced", {}, "Advanced")
            })}
          </div></div>
          <div class="settings-group-heading">
            <div class="settings-group-title">${escapeHtml(t("advanced_section_performance", {}, "Performance & navigation"))}</div>
          </div>
          <div class="settings-group-card">
            <div class="settings-stack">
              ${this.renderToggleRow({
                focusKey: "advanced:fastHorizontalNavigation",
                title: t("advanced_fast_horizontal_navigation", {}, "Fast Horizontal Navigation"),
                subtitle: t(
                  "advanced_fast_horizontal_navigation_subtitle",
                  {},
                  "Increase D-pad repeat speed in rows while keeping repeat throttling enabled."
                ),
                checked: Boolean(model.fastHorizontalNavigation)
              })}
              ${this.renderToggleRow({
                focusKey: "advanced:rememberLastProfile",
                title: t("advanced_remember_last_profile", {}, "Remember Last Profile"),
                subtitle: t("advanced_remember_last_profile_subtitle", {}, "Remember last selected profile at startup"),
                checked: ProfileManager.isRememberLastProfileEnabled()
              })}
            </div>
          </div>
          <div class="settings-group-heading">
            <div class="settings-group-title">${escapeHtml(t("advanced_section_cache", {}, "Cache"))}</div>
          </div>
          <div class="settings-group-card">
            <div class="settings-stack">
              ${this.renderActionRow({
                focusKey: "advanced:clearContinueWatchingCache",
                title: t("advanced_clear_cw_cache", {}, "Clear Continue Watching Cache"),
                subtitle: this.advancedCacheCleared
                  ? t("advanced_clear_cw_cache_done", {}, "Cache cleared")
                  : t(
                      "advanced_clear_cw_cache_subtitle",
                      {},
                      "Remove cached thumbnails, titles, and enrichment data for Continue Watching"
                    ),
                icon: null,
                disabled: Boolean(this.advancedCacheCleared)
              })}
            </div>
          </div>
          ${this.renderNetworkTestsSection()}
        `;
    },
    renderNetworkTestsSection() {
      const networkRunning = this.isNetworkSpeedTestRunning();
      const streamRunning = this.isStreamSpeedTestRunning();
      const streamHost = this.streamSpeedTestServerHost();
      const hasStream = Boolean(streamHost);
      const networkPhaseLabel =
        this.networkSpeedTestState === "latency"
          ? t("network_testing_latency", {}, "Measuring latency")
          : t("network_testing_download", {}, "Measuring download speed");
      const streamPhaseLabel = (() => {
        switch (this.streamSpeedTestState) {
          case "BASELINE":
            return t("stream_test_btn_measuring_baseline", {}, "Measuring Baseline...");
          case "PARALLEL_1":
            return t("stream_test_btn_measuring_parallel1", {}, "Measuring Parallel (1MB)...");
          case "PARALLEL_4":
            return t("stream_test_btn_measuring_parallel4", {}, "Measuring Parallel (4MB)...");
          case "PARALLEL_8":
            return t("stream_test_btn_measuring_parallel8", {}, "Measuring Parallel (8MB)...");
          case "PARALLEL_16":
            return t("stream_test_btn_measuring_parallel16", {}, "Measuring Parallel (16MB)...");
          default:
            return t("stream_test_btn_running", {}, "Running...");
        }
      })();
      const networkValue = networkRunning ? networkPhaseLabel : "";
      const streamValue = streamRunning ? streamPhaseLabel : "";
      const hasNetworkResults = this.networkSpeedTestState === "done" || this.networkSpeedTestState === "error";
      const hasStreamResults = this.streamSpeedTestState === "done" || this.streamSpeedTestState === "error";
      const networkError =
        this.networkSpeedTestState === "error"
          ? t("network_error_prefix", [this.networkSpeedTestError || ""], `Error: ${this.networkSpeedTestError || ""}`)
          : "";
      const streamError =
        this.streamSpeedTestState === "error"
          ? this.streamSpeedTestError === "no-stream"
            ? t("stream_test_no_stream", {}, "No playback recorded. Play a video to run diagnostic tests on its host.")
            : t(
                "stream_test_error_connection",
                {},
                "Connection failed. The last played stream link may have expired or is unreachable. Please play the video again and retry."
              )
          : "";
      return `
          <div class="settings-group-heading">
            <div class="settings-group-title">${escapeHtml(t("advanced_section_network_tests", {}, "Network tests"))}</div>
          </div>
          <div class="settings-group-card">
            <div class="settings-stack">
              ${this.renderActionRow({
                focusKey: "advanced:networkSpeedTest",
                title: networkRunning
                  ? t("network_speed_test_running", {}, "Running Speed Test")
                  : t("network_speed_test_run", {}, "Run Speed Test"),
                subtitle: t("network_speed_test_subtitle", {}, "Measure download speed and latency"),
                value: networkValue,
                disabled: networkRunning
              })}
              ${
                hasNetworkResults
                  ? this.renderInformationRow({
                      title: t("network_latency_label", {}, "Latency"),
                      value: Number.isFinite(Number(this.networkLatencyMs)) ? `${Math.round(Number(this.networkLatencyMs))} ms` : ""
                    })
                  : ""
              }
              ${
                this.networkSpeedTestState === "done"
                  ? this.renderInformationRow({
                      title: t("network_download_label", {}, "Download"),
                      subtitle: t("network_powered_by_fast", {}, "Powered by fast.com"),
                      value: Number.isFinite(Number(this.networkDownloadMbps)) ? `${Number(this.networkDownloadMbps).toFixed(1)} Mbps` : ""
                    })
                  : ""
              }
              ${networkError ? this.renderInformationRow({ title: networkError }) : ""}
              ${this.renderActionRow({
                focusKey: "advanced:streamSpeedTest",
                title: streamRunning
                  ? t("stream_test_btn_running", {}, "Running...")
                  : t("stream_test_card_title", {}, "Run Last Played Stream Speed Test"),
                subtitle: hasStream
                  ? t("stream_test_server_label", [streamHost], `Server: ${streamHost}`)
                  : t("stream_test_no_stream", {}, "No playback recorded. Play a video to run diagnostic tests on its host."),
                value: streamValue,
                disabled: !hasStream || streamRunning
              })}
              ${
                this.streamSpeedTestState === "done"
                  ? [
                      this.renderInformationRow({
                        title: t("stream_test_label_baseline", {}, "Standard Single Connection (Baseline)"),
                        value: this.formatNetworkMbps(this.streamSpeedTestBaselineMbps)
                      }),
                      ...[1, 4, 8, 16].map((connections) =>
                        this.renderInformationRow({
                          title: t(`stream_test_label_parallel${connections}`, {}, `Parallel Connect (${connections} MB Chunks)`),
                          value: this.formatNetworkMbps(this.streamSpeedTestParallel?.[connections])
                        })
                      )
                    ].join("")
                  : ""
              }
              ${streamError ? this.renderInformationRow({ title: streamError }) : ""}
            </div>
          </div>
        `;
    },
    openCustomThemeEditorDialog(model = {}) {
      const theme = model.theme || ThemeStore.get();
      const access = model.memberAccess || MemberAccessRepository.getCurrentAccess();
      const allowGradient = Boolean(access?.tier);
      const colors = resolveCustomThemeColors(theme.customThemeColors, allowGradient);
      this.customThemeDraft = {
        colors,
        allowGradient,
        gradientEnabled: allowGradient && !areCustomThemeColorsSolid(colors),
        access
      };
      this.showCustomThemeEditorDialog();
    },
    showCustomThemeEditorDialog(focusId = null) {
      const draft = this.customThemeDraft;
      if (!draft) return;

      const visibleColors = draft.gradientEnabled ? draft.colors : [draft.colors[1], draft.colors[1], draft.colors[1]];
      const previewPalette = ThemeColors.getPalette("CUSTOM", visibleColors);
      const gradient = areCustomThemeColorsSolid(visibleColors)
        ? visibleColors[1]
        : `linear-gradient(90deg, ${visibleColors[0]} 0%, ${visibleColors[1]} 50%, ${visibleColors[2]} 100%)`;
      const title = draft.gradientEnabled
        ? t("custom_theme_title", {}, "Your custom gradient")
        : t("custom_theme_solid_title", {}, "Your custom color");
      const subtitle = draft.gradientEnabled
        ? t("custom_theme_subtitle", {}, "Choose three colors for your theme. Select a color to edit it.")
        : t("custom_theme_solid_subtitle", {}, "Choose a color for your theme.");
      const options = [];

      if (draft.allowGradient) {
        options.push({
          id: "mode",
          label: `${t("custom_theme_mode", {}, "Mode")}: ${t(
            draft.gradientEnabled ? "custom_theme_mode_gradient" : "custom_theme_mode_solid",
            {},
            draft.gradientEnabled ? "Gradient" : "Single color"
          )}`
        });
      }

      const colorIndexes = draft.gradientEnabled ? [0, 1, 2] : [1];
      colorIndexes.forEach((index) => {
        const colorName = t(`custom_theme_color_${index + 1}`, {}, `Color ${index + 1}`);
        options.push({ id: `color:${index}`, label: `${colorName}: ${draft.colors[index]}` });
      });
      options.push(
        { id: "save", label: t("custom_theme_save", {}, "Save theme") },
        { id: "cancel", label: t("common.cancel", {}, "Cancel") }
      );

      const previewLabel = escapeHtml(t("custom_theme_preview", {}, "PREVIEW"));
      const messageHtml = `<div style="display:flex;flex-direction:column;gap:10px;padding:4px 0 8px;">
        <span style="font-size:16px;letter-spacing:0.08em;opacity:0.75;">${previewLabel}</span>
        <span style="display:block;height:20px;border-radius:999px;background:${gradient};"></span>
        <span style="display:inline-block;align-self:flex-start;padding:8px 12px;border:2px solid ${
          previewPalette["--focus-color"]
        };border-radius:10px;background:${visibleColors[1]};color:${
          previewPalette["--on-secondary"]
        };">${escapeHtml(t("custom_theme_preview_ring", {}, "Focused Item"))}</span>
      </div>`;

      this.openOptionDialog({
        title,
        messageHtml: `${messageHtml}<div class="settings-text-dialog-message">${escapeHtml(subtitle)}</div>`,
        options,
        selectedId: focusId || (draft.allowGradient ? "mode" : "color:1"),
        returnFocusKey: "appearance:theme:CUSTOM",
        dialogClassName: "settings-theme-custom-dialog",
        onSelect: (option) => {
          if (option.id === "mode") {
            draft.gradientEnabled = !draft.gradientEnabled;
            this.showCustomThemeEditorDialog("mode");
            return false;
          }
          if (String(option.id).startsWith("color:")) {
            const index = Number(String(option.id).slice("color:".length));
            this.openTextDialog({
              title: t("custom_theme_hex_title", {}, "Hex color"),
              value: draft.colors[index].slice(1),
              placeholder: "RRGGBB",
              returnFocusKey: "appearance:theme:CUSTOM",
              saveLabel: t("custom_theme_use_color", {}, "Use color"),
              onSubmit: (value) => {
                const color = parseCustomThemeColor(value);
                if (!color) {
                  if (this.textDialog) {
                    this.textDialog.statusMessage = t("custom_theme_hex_hint", {}, "Enter a six-character hex color (0–9, A–F).");
                    this.textDialog.statusKind = "error";
                  }
                  return false;
                }
                draft.colors[index] = color;
                this.showCustomThemeEditorDialog(`color:${index}`);
                return false;
              }
            });
            if (this.textDialog) this.textDialog.restoreCustomThemeEditor = true;
            return false;
          }
          if (option.id === "save") {
            const currentAccess = MemberAccessRepository.getCurrentAccess();
            const colors = resolveCustomThemeColors(
              draft.gradientEnabled ? draft.colors : [draft.colors[1], draft.colors[1], draft.colors[1]],
              Boolean(currentAccess?.tier)
            );
            ThemeStore.set({
              themeName: "CUSTOM",
              accentColor: colors[1],
              customThemeColors: encodeCustomThemeColors(colors)
            });
            ThemeManager.apply({ enforceAccess: true, access: currentAccess });
          }
          return true;
        },
        onClose: () => {
          this.customThemeDraft = null;
        }
      });
    },
    renderAppearanceSection(model) {
      const availableIds = new Set(availableThemeIds(model?.memberAccess));
      const themeOptions = THEME_OPTIONS.filter((theme) => availableIds.has(theme.id));
      themeOptions.forEach((theme) => {
        this.actionMap.set(`appearance:theme:${theme.id}`, () => {
          if (theme.id === "CUSTOM") {
            this.openCustomThemeEditorDialog(model);
            return;
          }
          ThemeStore.set({ themeName: theme.id, accentColor: theme.color });
          ThemeManager.apply({ enforceAccess: true, access: model?.memberAccess });
        });
      });

      const customColors = resolveCustomThemeColors(model.theme.customThemeColors, Boolean(model?.memberAccess?.tier));
      const renderedThemeOptions = themeOptions.map((theme) => {
        if (theme.id !== "CUSTOM") return theme;
        const customPalette = ThemeColors.getPalette("CUSTOM", customColors);
        return {
          ...theme,
          customThemeColors: customColors,
          color: customPalette["--secondary-color"],
          onColor: customPalette["--on-secondary"]
        };
      });

      this.actionMap.set("appearance:font", () => {
        this.openOptionDialog({
          title: t("appearance_font_dialog_title", {}, "Choose Font"),
          options: FONT_OPTIONS,
          selectedId: model.theme.fontFamily,
          returnFocusKey: "appearance:font",
          dialogClassName: "settings-appearance-dialog",
          onSelect: (option) => {
            ThemeStore.set({ fontFamily: option.id });
            ThemeManager.apply({ enforceAccess: true, access: model?.memberAccess });
          }
        });
      });

      this.actionMap.set("appearance:language", () => {
        this.openOptionDialog({
          title: t("appearance_language_dialog_title", {}, "Choose Language"),
          options: LANGUAGE_OPTIONS,
          selectedId: model.theme.language,
          returnFocusKey: "appearance:language",
          dialogClassName: "settings-appearance-dialog",
          onSelect: async (option) => {
            ThemeStore.set({ language: option.id });
            await I18n.init();
            ThemeManager.apply({ enforceAccess: true, access: model?.memberAccess });
            I18n.apply();
          }
        });
      });
      this.actionMap.set("appearance:amoled", () => {
        const nextAmoled = !ThemeStore.get().amoledMode;
        ThemeStore.set({
          amoledMode: nextAmoled,
          amoledSurfacesMode: nextAmoled ? Boolean(ThemeStore.get().amoledSurfacesMode) : false
        });
        ThemeManager.apply({ enforceAccess: true, access: model?.memberAccess });
      });
      this.actionMap.set("appearance:amoledSurfaces", () => {
        ThemeStore.set({ amoledSurfacesMode: !ThemeStore.get().amoledSurfacesMode });
        ThemeManager.apply({ enforceAccess: true, access: model?.memberAccess });
      });
      this.actionMap.set("appearance:interfaceStyle", () => {
        this.openOptionDialog({
          title: t("notflix_style_title", {}, "Interface style"),
          options: [
            { id: NOTFLIX_STYLE, label: t("notflix_style_notflix", {}, "Notflix") },
            { id: NUVIO_STYLE, label: t("notflix_style_nuvio", {}, "Nuvio (original)") }
          ],
          selectedId: getAppearanceStyle(),
          returnFocusKey: "appearance:interfaceStyle",
          onSelect: (option) => {
            if (option.id === getAppearanceStyle()) return;
            setAppearanceStyle(option.id);
            setTimeout(() => globalThis.location?.reload?.(), 60);
          }
        });
      });
      const notflixChoices = {
        homeMotion: [
          { id: "normal", label: t("notflix_home_motion_normal", {}, "Normal") },
          { id: "reduced", label: t("notflix_home_motion_reduced", {}, "Reduced") }
        ],
        cardOpening: [
          { id: "instant", label: t("notflix_card_open_instant", {}, "Instant") },
          { id: "normal", label: t("notflix_card_open_normal", {}, "Normal") },
          { id: "slow", label: t("notflix_card_open_slow", {}, "Slow") }
        ],
        cardSize: [
          { id: "tiny", label: t("notflix_card_size_tiny", {}, "Very small") },
          { id: "small", label: t("notflix_card_size_small", {}, "Small") },
          { id: "medium", label: t("notflix_card_size_medium", {}, "Medium") },
          { id: "large", label: t("notflix_card_size_large", {}, "Large") }
        ],
        trailerIdle: [
          { id: "short", label: t("notflix_trailer_idle_short", {}, "3 seconds") },
          { id: "normal", label: t("notflix_trailer_idle_normal", {}, "5 seconds") },
          { id: "long", label: t("notflix_trailer_idle_long", {}, "8 seconds") }
        ],
        heroRotation: [
          { id: "off", label: t("notflix_hero_rotation_off", {}, "Off") },
          { id: "normal", label: t("notflix_hero_rotation_normal", {}, "Every 9 seconds") },
          { id: "slow", label: t("notflix_hero_rotation_slow", {}, "Every 15 seconds") }
        ]
      };
      const notflixTitles = {
        homeMotion: t("notflix_home_motion_title", {}, "Home motion"),
        cardOpening: t("notflix_card_open_title", {}, "Card opening"),
        cardSize: t("notflix_card_size_title", {}, "Card size"),
        trailerIdle: t("notflix_trailer_idle_title", {}, "Wait before trailers"),
        heroRotation: t("notflix_hero_rotation_title", {}, "Cover rotation")
      };
      Object.keys(notflixChoices).forEach((key) => {
        this.actionMap.set(`appearance:notflix:${key}`, () => {
          this.openOptionDialog({
            title: notflixTitles[key],
            options: notflixChoices[key],
            selectedId: getNotflixOptions()[key],
            returnFocusKey: `appearance:notflix:${key}`,
            onSelect: (option) => setNotflixOption(key, option.id)
          });
        });
      });
      this.actionMap.set("appearance:notflix:homeCatalogs", () => {
        Router.navigate("catalogOrder");
      });
      this.actionMap.set("appearance:notflix:ageLimit", () => {
        this.openOptionDialog({
          title: t("notflix_age_limit_title", {}, "Age limit"),
          options: AGE_LIMITS.map((id) => ({ id, label: t(`notflix_age_limit_${id}`, {}, id) })),
          selectedId: getAgeLimit(),
          returnFocusKey: "appearance:notflix:ageLimit",
          onSelect: (option) => setAgeLimit(option.id)
        });
      });
      this.actionMap.set("appearance:notflix:hidden", () => {
        const hidden = listHiddenTitles();
        if (!hidden.length) return;
        this.openOptionDialog({
          title: t("notflix_hidden_title_restore", {}, "Show again"),
          options: hidden.map((entry) => ({ id: entry.key, label: entry.title || entry.id })),
          selectedId: "",
          returnFocusKey: "appearance:notflix:hidden",
          onSelect: (option) => {
            const entry = hidden.find((candidate) => candidate.key === option.id);
            if (entry) unhideTitle(entry.type, entry.id);
          }
        });
      });
      ["previewEnabled", "previewSound", "heroTrailer", "uiSounds", "introEnabled", "introSound"].forEach((key) => {
        this.actionMap.set(`appearance:notflix:${key}`, () => {
          setNotflixOption(key, !getNotflixOptions()[key]);
        });
      });
      this.actionMap.set("appearance:settingsUiStyle", () => {
        const options = ["CLASSIC", "HORIZON", "ZEN"].map((id) => ({
          id,
          labelKey: `settings_style_${id.toLowerCase()}`
        }));
        this.openOptionDialog({
          title: t("appearance_settings_style", {}, "Settings style"),
          options,
          selectedId: model.theme.settingsUiStyle || "CLASSIC",
          returnFocusKey: "appearance:settingsUiStyle",
          onSelect: (option) => ThemeStore.set({ settingsUiStyle: option.id })
        });
      });

      const notflixActive = isNotflixActive();
      return `
          ${this.renderSectionHeader(SECTION_META.find((item) => item.id === "appearance"))}
          <div class="settings-group-card settings-appearance-group-card">
            <div class="settings-stack">
              ${this.renderActionRow({
                focusKey: "appearance:interfaceStyle",
                title: t("notflix_style_title", {}, "Interface style"),
                subtitle: t("notflix_style_subtitle", {}, "Only on this TV. The app restarts to apply it."),
                value: notflixActive ? t("notflix_style_notflix", {}, "Notflix") : t("notflix_style_nuvio", {}, "Nuvio (original)")
              })}
              ${notflixActive ? this.renderNotflixAppearanceRows(notflixChoices, notflixTitles) : ""}
            </div>
          </div>
          <div class="settings-group-card settings-appearance-group-card settings-theme-grid-card">
            <div class="settings-group-heading">
              <div class="settings-group-title">${escapeHtml(t("appearance_color_theme", {}, "Color Theme"))}</div>
              <div class="settings-group-subtitle">${escapeHtml(
                notflixActive
                  ? t("notflix_theme_locked", {}, "The Notflix style uses its own colors. Switch to Nuvio to change them.")
                  : t("appearance_color_theme_subtitle", {}, "Pick the accent color used across the app")
              )}</div>
            </div>
            <div class="settings-horizontal-scroll-frame${notflixActive ? " notflix-hidden" : ""}">
              <div class="settings-theme-row">
                ${renderedThemeOptions
                  .map((theme) =>
                    this.renderThemeCard(theme, String(model.theme.themeName).toUpperCase() === theme.id, `appearance:theme:${theme.id}`)
                  )
                  .join("")}
              </div>
              ${settingsScrollIndicatorMarkup("horizontal")}
            </div>
            ${this.renderToggleRow({
              focusKey: "appearance:amoled",
              title: t("appearance_amoled_mode", {}, "AMOLED Mode"),
              subtitle: t("appearance_amoled_mode_subtitle", {}, "Use pure black for app backgrounds"),
              checked: Boolean(model.theme.amoledMode)
            })}
            ${
              model.theme.amoledMode
                ? this.renderToggleRow({
                    focusKey: "appearance:amoledSurfaces",
                    title: t("appearance_amoled_surfaces_mode", {}, "Pure Black Surfaces"),
                    subtitle: t("appearance_amoled_surfaces_mode_subtitle", {}, "Also make cards, panels, and containers pure black"),
                    checked: Boolean(model.theme.amoledSurfacesMode)
                  })
                : ""
            }
          </div>
          <div class="settings-group-card settings-appearance-group-card">
            <div class="settings-group-heading">
              <div class="settings-group-title">${escapeHtml(t("appearance_font_and_language", {}, "Font and Language"))}</div>
              <div class="settings-group-subtitle">${escapeHtml(t("appearance_font_and_language_subtitle", {}, "Choose the typeface and locale used throughout the app"))}</div>
            </div>
            <div class="settings-stack">
              ${this.renderActionRow({
                focusKey: "appearance:settingsUiStyle",
                title: t("appearance_settings_style", {}, "Settings style"),
                subtitle: t("appearance_settings_style_subtitle", {}, "Choose the layout used by Settings"),
                value: t(
                  `settings_style_${String(model.theme.settingsUiStyle || "CLASSIC").toLowerCase()}`,
                  {},
                  String(model.theme.settingsUiStyle || "CLASSIC")
                )
              })}
              ${this.renderActionRow({
                focusKey: "appearance:font",
                title: t("appearance_font", {}, "App Font"),
                subtitle: t("appearance_font_subtitle", {}, "Choose your preferred font"),
                value: labelForFont(model.theme.fontFamily)
              })}
              ${this.renderActionRow({
                focusKey: "appearance:language",
                title: t("appearance_language", {}, "App Language"),
                subtitle: t("appearance_language_subtitle", {}, "Override system language"),
                value: labelForLanguage(model.theme.language)
              })}
            </div>
          </div>
        `;
    }
  };
}
