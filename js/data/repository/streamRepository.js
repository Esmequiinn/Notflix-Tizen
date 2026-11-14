import { MediaServerRepository, isMediaServerBase } from "../mediaserver/mediaServerRepository.js";
import { safeApiCall } from "../../core/network/safeApiCall.js";
import { addonRepository } from "./addonRepository.js";
import { StreamApi } from "../remote/api/streamApi.js";
import { MetaApi } from "../remote/api/metaApi.js";
import { PluginManager } from "../../core/player/pluginManager.js";
import { mapPluginStreamGroup } from "../../core/player/pluginStreamMapping.js";
import {
  cleanLocalPluginVideoId,
  isLocalPluginVideoId,
  resolvePluginSeasonEpisode,
  stablePluginHash
} from "../../core/player/pluginModels.js";
import { ProfileManager } from "../../core/profile/profileManager.js";
import { TmdbService } from "../../core/tmdb/tmdbService.js";
import { LocalDebridAvailabilityService } from "../../core/debrid/localDebridAvailabilityService.js";
import { DebridStreamPresentation } from "../../core/debrid/directDebridStreamPresentation.js";
import { PluginStore, getEffectivePluginProfileId } from "../local/pluginStore.js";
import { DebridSettingsStore } from "../local/debridSettingsStore.js";
import { StreamSearchSessionCache } from "./streamSearchSessionCache.js";

const STREAM_SOURCE_REQUEST_TIMEOUT_MS = 60_000;
const PLUGIN_STREAM_REQUEST_TIMEOUT_MS = 120_000;

function pluginSearchTimeoutMs(mediaType) {
  const configured = Number(PluginManager.getSearchTimeoutMs?.(mediaType) || 0);
  return configured > 0 ? configured : PLUGIN_STREAM_REQUEST_TIMEOUT_MS;
}

function sourceConfigurationValue(value, key = "") {
  if (/(api.?key|token|secret|password|authorization|cookie)/i.test(key)) {
    return value ? `credential:${stablePluginHash(String(value))}` : "";
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sourceConfigurationValue(entry, key));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, childKey) => {
        result[childKey] = sourceConfigurationValue(value[childKey], childKey);
        return result;
      }, {});
  }
  return value ?? null;
}

function buildStreamSourceConfiguration(installedAddons) {
  const activeProfileId = String(ProfileManager.getActiveProfileId() || "1");
  const summary = PluginManager.getSummary?.() || {};
  const effectiveProfileId = String(
    summary.effectiveProfileId || getEffectivePluginProfileId(activeProfileId) || activeProfileId
  );
  const pluginsEnabled = summary.pluginsEnabled !== false;
  const groupStreamsByRepository = pluginsEnabled && summary.groupStreamsByRepository === true;
  const pluginState = PluginStore.get(effectiveProfileId);
  return JSON.stringify(
    sourceConfigurationValue({
      activeProfileId,
      effectiveProfileId,
      addons: installedAddons.map((addon, index) => ({
        index,
        id: addon?.id,
        baseUrl: addon?.baseUrl,
        displayName: addon?.displayName,
        version: addon?.version,
        logo: addon?.logo,
        types: addon?.types,
        resources: addon?.resources
      })),
      plugins: {
        enabled: pluginsEnabled,
        groupStreamsByRepository,
        repositories:
          groupStreamsByRepository && Array.isArray(summary.repositories)
            ? summary.repositories.map((repository) => ({
                id: repository?.id,
                url: repository?.url,
                name: repository?.name,
                type: repository?.type,
                enabled: repository?.enabled,
                lastUpdated: repository?.lastUpdated,
                scraperCount: repository?.scraperCount
              }))
            : [],
        scrapers:
          pluginsEnabled && Array.isArray(summary.scrapers)
            ? summary.scrapers
                .filter((scraper) => scraper?.enabled !== false)
                .map((scraper) => ({
                  id: scraper?.id,
                  repositoryId: scraper?.repositoryId,
                  type: scraper?.type,
                  enabled: scraper?.enabled,
                  manifestEnabled: scraper?.manifestEnabled,
                  codeAvailable: scraper?.codeAvailable,
                  version: scraper?.version,
                  filename: scraper?.filename,
                  codeUrl: scraper?.codeUrl,
                  supportedTypes: scraper?.supportedTypes,
                  supportedPlatforms: scraper?.supportedPlatforms,
                  disabledPlatforms: scraper?.disabledPlatforms
                }))
            : [],
        scraperSettings: pluginState?.settings?.scraperSettings || {}
      },
      debrid: DebridSettingsStore.get()
    })
  );
}

function normalizeTmdbPluginType(type) {
  const normalized = String(type || "").toLowerCase();
  return ["series", "tv", "show"].includes(normalized) ? "tv" : normalized;
}

class StreamRepository {
  constructor() {
    this.streamSearchSessions = new StreamSearchSessionCache();
    this.localPluginSearchPaused = false;
    this.pluginPauseWaiters = new Set();
    this.activePluginAttemptControllers = new Set();
  }

  setLocalPluginSearchPaused(paused) {
    const next = Boolean(paused);
    this.localPluginSearchPaused = next;
    if (next) {
      this.activePluginAttemptControllers.forEach((controller) => {
        try {
          controller.abort();
        } catch (_) {}
      });
      return;
    }
    const waiters = [...this.pluginPauseWaiters];
    this.pluginPauseWaiters.clear();
    waiters.forEach((wake) => wake());
  }

  waitForLocalPluginSearch(signal) {
    if (!this.localPluginSearchPaused) return Promise.resolve(!signal?.aborted);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ready) => {
        if (settled) return;
        settled = true;
        this.pluginPauseWaiters.delete(wake);
        signal?.removeEventListener?.("abort", abort);
        resolve(ready && !signal?.aborted);
      };
      const wake = () => finish(true);
      const abort = () => finish(false);
      this.pluginPauseWaiters.add(wake);
      signal?.addEventListener?.("abort", abort, { once: true });
      if (!this.localPluginSearchPaused) finish(true);
      if (signal?.aborted) finish(false);
    });
  }

  async getStreamsFromAddon(baseUrl, type, videoId, { signal = null } = {}) {
    if (isMediaServerBase(baseUrl))
      return MediaServerRepository.streams(baseUrl, type, videoId, signal);
    const url = this.buildStreamUrl(baseUrl, type, videoId);
    const result = await safeApiCall(() =>
      StreamApi.getStreams(url, { timeoutMs: STREAM_SOURCE_REQUEST_TIMEOUT_MS, signal })
    );
    if (result.status !== "success") {
      return result;
    }

    const streams = (result.data?.streams || []).map((stream) => this.mapStream(stream));
    return { status: "success", data: streams };
  }

  async getStreamsFromAllAddons(type, videoId, options = {}) {
    const installedAddons = (
      await addonRepository.getInstalledAddons({ includeMediaServers: true })
    ).map((addon, index) => ({
      ...addon,
      orderIndex: index
    }));
    const activeProfileId = String(ProfileManager.getActiveProfileId() || "1");
    const requestKey = {
      profileId: activeProfileId,
      type: String(type || "").toLowerCase(),
      videoId: String(videoId || ""),
      season: options?.season ?? null,
      episode: options?.episode ?? null,
      searchMode: options?.preferredPluginOnly === true ? "pluginOnly" : "",
      sourceConfiguration: buildStreamSourceConfiguration(installedAddons)
    };
    return this.streamSearchSessions.observe(requestKey, {
      forceRefresh: options?.forceRefresh === true,
      signal: options?.signal || null,
      onAddon: options?.onAddon,
      onChunk: options?.onChunk,
      producer: ({ signal, emitAddon, emitChunk, emitResult }) =>
        this.fetchStreamsFromAllSources(
          type,
          videoId,
          {
            ...options,
            signal,
            onAddon: emitAddon,
            onChunk: emitChunk,
            onResult: emitResult
          },
          installedAddons
        )
    });
  }

  async fetchStreamsFromAllSources(type, videoId, options = {}, sourceAddons = null) {
    const installedAddons = Array.isArray(sourceAddons)
      ? sourceAddons
      : (await addonRepository.getInstalledAddons({ includeMediaServers: true })).map(
          (addon, index) => ({
            ...addon,
            orderIndex: index
          })
        );
    const onAddon = typeof options?.onAddon === "function" ? options.onAddon : null;

    const onChunk = typeof options?.onChunk === "function" ? options.onChunk : null;
    const onResult = typeof options?.onResult === "function" ? options.onResult : null;

    const emittedGroups = [];
    const emittedGroupIndexes = new Map();
    const streamGroupKey = (group) => {
      const origin = group?.streamOrigin || {};
      const pluginId = group?.sourceProviderId || origin.sourceProviderId;
      if (pluginId) return `plugin:${pluginId}`;
      const addonId = group?.addonId || origin.addonId;
      if (addonId) return `addon:${addonId}`;
      const addonBaseUrl = group?.addonBaseUrl || origin.addonBaseUrl;
      if (addonBaseUrl) return `addon-url:${addonBaseUrl}`;
      const name = group?.addonName || origin.addonName || "";
      return `${origin.kind || "group"}:${name}`;
    };
    const recordEmittedGroup = (group) => {
      if (!group?.streams?.length) return;
      const key = streamGroupKey(group);
      const previousIndex = emittedGroupIndexes.get(key);
      if (previousIndex === undefined) {
        emittedGroupIndexes.set(key, emittedGroups.length);
        emittedGroups.push(group);
      } else {
        emittedGroups[previousIndex] = group;
      }
    };
    const notifyChunk = (group) => {
      if (!group?.streams?.length) return;
      recordEmittedGroup(group);
      if (onResult) {
        try {
          onResult({ status: "success", data: [...emittedGroups] });
        } catch (error) {
          console.warn("Stream result callback failed", error);
        }
      }
      if (!onChunk) return;
      try {
        onChunk({
          status: "success",
          data: [group]
        });
      } catch (error) {
        console.warn("Stream chunk callback failed", error);
      }
    };

    const notifyAddon = (addon, orderIndex) => {
      if (!onAddon || !addon) {
        return;
      }
      try {
        onAddon({ ...addon, orderIndex });
      } catch (error) {
        console.warn("Stream addon callback failed", error);
      }
    };

    const prepareDebridGroup = async (group, shouldNotify = null, { present = true } = {}) => {
      const checkingGroup =
        DebridStreamPresentation.apply(LocalDebridAvailabilityService.markChecking([group]))[0] ||
        group;
      const checkedGroup =
        (await LocalDebridAvailabilityService.annotateCachedAvailability([checkingGroup]))[0] ||
        checkingGroup;
      const presentedGroup = present
        ? DebridStreamPresentation.apply([checkedGroup])[0] || checkedGroup
        : checkedGroup;
      if (typeof shouldNotify !== "function" || shouldNotify()) {
        notifyChunk(presentedGroup);
      }
      return presentedGroup;
    };

    const addonSourceAddons = options.preferredPluginOnly === true ? [] : installedAddons;
    const addonTasks = addonSourceAddons.map(async (addon) => {
      try {
        const streamRequestType = addonRepository.resolveResourceRequestType(
          addon,
          "stream",
          type,
          videoId
        );
        const metaRequestType = addonRepository.resolveResourceRequestType(
          addon,
          "meta",
          type,
          videoId,
          { allowIdTypeFallback: true }
        );
        const canStream = Boolean(streamRequestType);
        const canMeta = Boolean(metaRequestType);
        const canTryMetaOnlyStreams =
          canMeta &&
          String(type || "")
            .trim()
            .toLowerCase() === "other";
        if (!canStream && !canTryMetaOnlyStreams) {
          return null;
        }
        if (options.signal?.aborted) {
          return null;
        }
        const orderIndex = Number(addon.orderIndex ?? Number.MAX_SAFE_INTEGER);
        notifyAddon(addon, orderIndex);
        let addonStreams = [];
        let streamRequestSucceeded = false;
        if (canStream) {
          const streamsResult = await this.getStreamsFromAddon(
            addon.baseUrl,
            streamRequestType,
            videoId,
            { signal: options.signal }
          );
          if (streamsResult.status === "success") {
            streamRequestSucceeded = true;
            if (streamsResult.data.length) {
              addonStreams = streamsResult.data;
            }
          }
        }
        if (options.signal?.aborted) {
          return null;
        }
        if (
          addonStreams.length === 0 &&
          ((canStream && streamRequestSucceeded) || canTryMetaOnlyStreams)
        ) {
          addonStreams = await this.fetchInlineStreamsFromMeta(
            addon,
            canStream ? streamRequestType : metaRequestType,
            videoId,
            { signal: options.signal }
          );
        }
        if (addonStreams.length === 0) {
          return null;
        }

        const group = {
          addonId: addon.id,
          addonBaseUrl: addon.baseUrl,
          addonName: addon.displayName,
          addonLogo: addon.logo,
          addonOrderIndex: orderIndex,
          streamOrigin: {
            kind: "addon",
            addonId: addon.id,
            addonBaseUrl: addon.baseUrl,
            addonName: addon.displayName,
            addonOrderIndex: orderIndex
          },
          streams: addonStreams.map((stream) => ({
            ...stream,
            addonId: addon.id,
            addonBaseUrl: addon.baseUrl,
            addonName: addon.displayName,
            addonLogo: addon.logo,
            addonOrderIndex: orderIndex,
            streamOrigin: {
              ...(stream.streamOrigin || {}),
              kind: "addon",
              addonId: addon.id,
              addonBaseUrl: addon.baseUrl,
              addonName: addon.displayName,
              addonOrderIndex: orderIndex
            }
          }))
        };
        return prepareDebridGroup(group);
      } catch (_) {
        return null;
      }
    });

    let acceptPluginChunks = true;
    const pluginAbortController =
      typeof AbortController === "function" ? new AbortController() : null;
    const pluginGroupsByName = new Map();
    const pluginStreamKey = (stream, addonName) => {
      const infoHash = String(stream?.infoHash || stream?.clientResolve?.infoHash || "")
        .trim()
        .toLowerCase();
      if (infoHash) {
        return `${infoHash}:${stream?.fileIdx ?? stream?.clientResolve?.fileIdx ?? ""}`;
      }
      const locator = stream?.url || stream?.externalUrl || stream?.ytId;
      if (locator) return String(locator);
      return `${addonName}:${stream?.name || ""}:${stream?.title || ""}`;
    };
    const mergePluginGroup = (group) => {
      const addonName = String(group?.addonName || "Addon");
      const previous = pluginGroupsByName.get(addonName);
      if (!previous) {
        const initial = { ...group, addonName };
        pluginGroupsByName.set(addonName, initial);
        return initial;
      }
      const streamsByKey = new Map();
      [...(previous.streams || []), ...(group?.streams || [])].forEach((stream) => {
        if (stream) streamsByKey.set(pluginStreamKey(stream, addonName), stream);
      });
      const merged = { ...previous, streams: [...streamsByKey.values()] };
      pluginGroupsByName.set(addonName, merged);
      return merged;
    };
    const abortPluginWork = () => {
      acceptPluginChunks = false;
      pluginAbortController?.abort();
      this.activePluginAttemptControllers.forEach((controller) => {
        try {
          controller.abort();
        } catch (_) {}
      });
    };
    if (options.signal?.aborted) abortPluginWork();
    const forwardCallerAbort = () => abortPluginWork();
    options.signal?.addEventListener?.("abort", forwardCallerAbort, { once: true });
    const pluginTask = (async () => {
      try {
        const progressivePluginGroups = [];
        while (acceptPluginChunks && !pluginAbortController?.signal.aborted) {
          const ready = await this.waitForLocalPluginSearch(pluginAbortController?.signal || null);
          if (!ready || !acceptPluginChunks || this.localPluginSearchPaused) return [];

          const attemptController =
            typeof AbortController === "function" ? new AbortController() : null;
          const forwardSourceAbort = () => attemptController?.abort();
          options.signal?.addEventListener?.("abort", forwardSourceAbort, { once: true });
          if (attemptController) this.activePluginAttemptControllers.add(attemptController);

          try {
            let progressiveWork = Promise.resolve();
            const onPluginGroup = (group) => {
              progressiveWork = progressiveWork.then(async () => {
                if (
                  !acceptPluginChunks ||
                  this.localPluginSearchPaused ||
                  attemptController?.signal.aborted
                )
                  return;
                const checked = await prepareDebridGroup(group, () => false, { present: false });
                if (
                  !acceptPluginChunks ||
                  this.localPluginSearchPaused ||
                  attemptController?.signal.aborted
                )
                  return;
                const merged = mergePluginGroup(checked);
                const presented = DebridStreamPresentation.apply([merged])[0] || merged;
                const existingIndex = progressivePluginGroups.findIndex(
                  (entry) => entry.addonName === presented.addonName
                );
                if (existingIndex >= 0) progressivePluginGroups[existingIndex] = presented;
                else progressivePluginGroups.push(presented);
                if (acceptPluginChunks && presented?.streams?.length) {
                  notifyChunk(presented);
                }
              });
            };
            const pluginStreams = await this.getPluginStreams(type, videoId, {
              ...options,
              signal: attemptController?.signal || options.signal || null,
              onPluginGroup
            });
            await progressiveWork;

            if (this.localPluginSearchPaused) continue;
            if (attemptController?.signal.aborted && !pluginAbortController?.signal.aborted) {
              continue;
            }

            if (!progressivePluginGroups.length && acceptPluginChunks) {
              for (const group of pluginStreams) {
                if (!acceptPluginChunks) return [];
                progressivePluginGroups.push(
                  await prepareDebridGroup(group, () => acceptPluginChunks)
                );
              }
            }
            return acceptPluginChunks ? progressivePluginGroups : [];
          } finally {
            options.signal?.removeEventListener?.("abort", forwardSourceAbort);
            if (attemptController) this.activePluginAttemptControllers.delete(attemptController);
          }
        }
        return [];
      } catch (error) {
        console.warn("Plugin stream fetch failed", error);
        return [];
      }
    })();

    let pluginTimeoutId = 0;
    const pluginTimeout = new Promise((resolve) => {
      pluginTimeoutId = setTimeout(() => {
        abortPluginWork();
        resolve([]);
      }, pluginSearchTimeoutMs(type));
    });
    const pluginStreamsPromise = Promise.race([pluginTask, pluginTimeout]);

    const settledResults = await Promise.allSettled(addonTasks);
    const addonsWithStreams = settledResults
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value)
      .filter(Boolean);
    const pluginStreams = await pluginStreamsPromise;
    if (pluginTimeoutId) {
      clearTimeout(pluginTimeoutId);
    }
    options.signal?.removeEventListener?.("abort", forwardCallerAbort);
    [...addonsWithStreams, ...pluginStreams].forEach(recordEmittedGroup);
    return { status: "success", data: emittedGroups };
  }

  async getPluginStreams(type, videoId, options = {}) {
    const rawVideoId = String(videoId || "").trim();
    if (!PluginManager.hasCompatibleScrapers(type)) {
      return [];
    }

    const localVideoId = isLocalPluginVideoId(rawVideoId);
    const tmdbLookupId = localVideoId ? rawVideoId : String(options?.itemId || rawVideoId).trim();
    const tmdbId = await TmdbService.ensureTmdbId(tmdbLookupId, type, {
      requireEnabled: false,
      signal: options?.signal || null
    });
    const pluginRequest = tmdbId
      ? {
          tmdbId: String(tmdbId),
          mediaType: normalizeTmdbPluginType(type)
        }
      : localVideoId
        ? {
            tmdbId: cleanLocalPluginVideoId(rawVideoId),
            mediaType: String(type || "").toLowerCase()
          }
        : null;
    if (!pluginRequest) {
      return [];
    }
    const pluginEpisode = resolvePluginSeasonEpisode(
      rawVideoId,
      options?.season ?? null,
      options?.episode ?? null
    );

    const pluginResults = await PluginManager.executeScrapersStreaming({
      tmdbId: pluginRequest.tmdbId,
      mediaType: pluginRequest.mediaType,
      season: pluginEpisode.season,
      episode: pluginEpisode.episode,
      signal: options?.signal || null,
      priorityBingeGroup: options?.priorityBingeGroup || null,
      preferredPluginOnly: options?.preferredPluginOnly === true,
      onGroup: (result) => options?.onPluginGroup?.(mapPluginStreamGroup(result))
    });

    return pluginResults.map(mapPluginStreamGroup);
  }

  buildStreamUrl(baseUrl, type, videoId) {
    const cleanBaseUrl = addonRepository.canonicalizeUrl(baseUrl);
    const queryStart = cleanBaseUrl.indexOf("?");
    const basePath =
      queryStart >= 0 ? cleanBaseUrl.slice(0, queryStart).replace(/\/+$/, "") : cleanBaseUrl;
    const baseQuery = queryStart >= 0 ? cleanBaseUrl.slice(queryStart) : "";
    return `${basePath}/stream/${this.encode(type)}/${this.encode(videoId)}.json${baseQuery}`;
  }

  buildMetaUrl(baseUrl, type, id) {
    const cleanBaseUrl = addonRepository.canonicalizeUrl(baseUrl);
    const queryStart = cleanBaseUrl.indexOf("?");
    const basePath =
      queryStart >= 0 ? cleanBaseUrl.slice(0, queryStart).replace(/\/+$/, "") : cleanBaseUrl;
    const baseQuery = queryStart >= 0 ? cleanBaseUrl.slice(queryStart) : "";
    return `${basePath}/meta/${this.encode(type)}/${this.encode(id)}.json${baseQuery}`;
  }

  encode(value) {
    return encodeURIComponent(String(value || "")).replace(/\+/g, "%20");
  }

  mapStream(stream = {}) {
    const sidecarSubtitles = Array.isArray(stream.subtitles)
      ? stream.subtitles
          .filter((entry) => entry && entry.url)
          .map((entry) => {
            const headers = entry.headers || entry.behaviorHints?.proxyHeaders?.request;
            return {
              id: entry.id || null,
              url: entry.url,
              lang: entry.lang || "unknown",
              ...(headers ? { headers } : {})
            };
          })
      : [];

    return {
      name: stream.name || null,
      title: stream.title || null,
      description: stream.description || null,
      url: stream.url || null,
      ytId: stream.ytId || null,
      infoHash: stream.infoHash || null,
      fileIdx: stream.fileIdx ?? null,
      externalUrl: stream.externalUrl || null,
      behaviorHints: stream.behaviorHints || null,
      sources: Array.isArray(stream.sources) ? stream.sources : [],
      quality: stream.quality || null,
      qualityValue: Number.isFinite(Number(stream.qualityValue)) ? Number(stream.qualityValue) : -1,
      clientResolve: stream.clientResolve || null,
      debridCacheStatus: stream.debridCacheStatus || null,
      subtitles: sidecarSubtitles
    };
  }

  async fetchInlineStreamsFromMeta(addon, type, videoId, { signal = null } = {}) {
    const rawVideoId = String(videoId || "").trim();
    if (!addon?.baseUrl || !rawVideoId) {
      return [];
    }

    const contentLevelId = this.buildContentLevelMetaId(rawVideoId);
    const candidateMetaIds = [];
    if (contentLevelId) {
      candidateMetaIds.push(contentLevelId);
    }
    if (rawVideoId && rawVideoId !== contentLevelId) {
      candidateMetaIds.push(rawVideoId);
    }

    for (const metaId of candidateMetaIds) {
      if (signal?.aborted) {
        return [];
      }
      const url = this.buildMetaUrl(addon.baseUrl, type, metaId);
      const result = await safeApiCall(() =>
        MetaApi.getMeta(url, { timeoutMs: STREAM_SOURCE_REQUEST_TIMEOUT_MS, signal })
      );

      if (result.status !== "success") {
        continue;
      }

      const meta = result.data?.meta || null;
      const videos = Array.isArray(meta?.videos) ? meta.videos : [];

      if (!videos.length) {
        continue;
      }

      const matchingVideo =
        videos.find((video) => String(video?.id || "") === rawVideoId) ||
        (type !== "series" && videos.length === 1 ? videos[0] : null);

      const streams = Array.isArray(matchingVideo?.streams) ? matchingVideo.streams : [];

      const mapped = streams
        .map((stream) => this.mapStream(stream))
        .filter(
          (stream) =>
            stream.url ||
            stream.externalUrl ||
            stream.ytId ||
            stream.clientResolve ||
            stream.infoHash
        );

      if (mapped.length) {
        return mapped;
      }
    }

    return [];
  }

  buildContentLevelMetaId(videoId) {
    const raw = String(videoId || "").trim();
    if (!raw) {
      return "";
    }
    const parts = raw.split(":");
    if (parts.length <= 1) {
      return raw;
    }
    let trailingNumericCount = 0;
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      if (!/^\d+$/.test(parts[index])) {
        break;
      }
      trailingNumericCount += 1;
    }
    const firstSegment = parts[0];
    const minSegments = /^tt/i.test(firstSegment) || /^\d+$/.test(firstSegment) ? 1 : 2;
    const segmentsToDrop = Math.min(trailingNumericCount, Math.max(0, parts.length - minSegments));
    return segmentsToDrop > 0 ? parts.slice(0, -segmentsToDrop).join(":") : raw;
  }
}

export const streamRepository = new StreamRepository();
