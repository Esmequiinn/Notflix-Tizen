import { MediaServerRepository, isMediaServerBase } from "../mediaserver/mediaServerRepository.js";
import { safeApiCall } from "../../core/network/safeApiCall.js";
import { selectCatalogEntries } from "../../core/util/catalogEntryMapper.js";
import { CatalogApi } from "../remote/api/catalogApi.js";
import { addonRepository } from "./addonRepository.js";

const MAX_CACHED_CATALOG_PAGES = 96;

class CatalogRepository {
  constructor() {
    this.catalogCache = new Map();
    this.cacheGeneration = 0;
  }

  readCachedCatalog(cacheKey) {
    const cached = this.catalogCache.get(cacheKey);
    if (cached === undefined) {
      return undefined;
    }
    this.catalogCache.delete(cacheKey);
    this.catalogCache.set(cacheKey, cached);
    return cached;
  }

  writeCachedCatalog(cacheKey, row) {
    this.catalogCache.delete(cacheKey);
    this.catalogCache.set(cacheKey, row);
    while (this.catalogCache.size > MAX_CACHED_CATALOG_PAGES) {
      const oldestKey = this.catalogCache.keys().next().value;
      this.catalogCache.delete(oldestKey);
    }
  }

  async getCatalog({
    addonBaseUrl,
    addonId,
    addonName,
    catalogId,
    catalogName,
    type,
    skip = 0,
    skipStep = 100,
    extraArgs = {},
    supportsSkip = false,
    signal = null
  }) {
    if (isMediaServerBase(addonBaseUrl))
      return MediaServerRepository.catalog({
        addonBaseUrl,
        catalogId,
        type,
        skip,
        extraArgs,
        signal
      });
    const normalizedSkipStep = this.normalizeSkipStep(skipStep);
    const cacheKey = this.buildCacheKey({
      addonBaseUrl,
      addonId,
      type,
      catalogId,
      skip,
      skipStep: normalizedSkipStep,
      extraArgs,
      supportsSkip
    });

    const cached = this.readCachedCatalog(cacheKey);
    if (cached) {
      return {
        status: "success",
        data: cached
      };
    }

    const url = this.buildCatalogUrl({
      baseUrl: addonBaseUrl,
      type,
      catalogId,
      skip,
      extraArgs
    });

    const cacheGeneration = this.cacheGeneration;
    return safeApiCall(() =>
      CatalogApi.getCatalog(url, signal ? { signal } : {}).then((dto) => {
        const { metas, rawItemCount } = selectCatalogEntries(dto?.metas);
        const items = metas.map((meta) => ({
          ...this.mapMeta(meta),
          addonBaseUrl,
          addonId,
          addonName,
          catalogType: type
        }));

        const hasMore = Boolean(supportsSkip && rawItemCount > 0);
        const row = {
          addonId,
          addonName,
          addonBaseUrl,
          catalogId,
          catalogName,
          apiType: type,
          items,
          isLoading: false,
          hasMore,
          currentPage: Math.floor(skip / normalizedSkipStep),
          supportsSkip,
          skipStep: normalizedSkipStep,
          nextSkip: hasMore ? skip + rawItemCount : skip
        };

        if (cacheGeneration === this.cacheGeneration && items.length) {
          this.writeCachedCatalog(cacheKey, row);
        }
        return row;
      })
    );
  }

  clearCache() {
    this.cacheGeneration += 1;
    this.catalogCache.clear();
  }

  buildCatalogUrl({ baseUrl, type, catalogId, skip = 0, extraArgs = {} }) {
    const cleanBaseUrl = addonRepository.canonicalizeUrl(baseUrl);
    const queryStart = cleanBaseUrl.indexOf("?");
    const basePath =
      queryStart >= 0 ? cleanBaseUrl.slice(0, queryStart).replace(/\/+$/, "") : cleanBaseUrl;
    const baseQuery = queryStart >= 0 ? cleanBaseUrl.slice(queryStart) : "";
    const args = { ...extraArgs };

    if (Object.keys(args).length === 0) {
      return skip > 0
        ? `${basePath}/catalog/${type}/${catalogId}/skip=${skip}.json${baseQuery}`
        : `${basePath}/catalog/${type}/${catalogId}.json${baseQuery}`;
    }

    if (skip > 0 && !Object.prototype.hasOwnProperty.call(args, "skip")) {
      args.skip = String(skip);
    }

    const query = Object.entries(args)
      .map(([key, value]) => `${this.encodeArg(key)}=${this.encodeArg(String(value))}`)
      .join("&");

    return `${basePath}/catalog/${type}/${catalogId}/${query}.json${baseQuery}`;
  }

  buildCacheKey({
    addonBaseUrl = "",
    addonId,
    type,
    catalogId,
    skip = 0,
    skipStep = 100,
    extraArgs = {},
    supportsSkip = false
  }) {
    const normalizedArgs = Object.entries(extraArgs)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");

    return JSON.stringify([
      addonRepository.canonicalizeUrl(addonBaseUrl),
      addonId,
      type,
      catalogId,
      skip,
      skipStep,
      supportsSkip,
      normalizedArgs
    ]);
  }

  normalizeSkipStep(value = 100) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? Math.trunc(numericValue) : 100;
  }

  encodeArg(value) {
    return encodeURIComponent(value).replace(/\+/g, "%20");
  }

  mapMeta(meta = {}) {
    return {
      id: meta.id || "",
      name: meta.name || "Untitled",
      type: meta.type || "",
      poster: meta.poster || null,
      background: meta.background || null,
      logo: meta.logo || null,
      description: meta.description || "",
      releaseInfo: meta.releaseInfo || "",
      runtime: meta.runtime ?? null,
      genres: Array.isArray(meta.genres) ? meta.genres : [],
      imdbRating: meta.imdbRating ?? null,
      trailerYtIds: catalogTrailerIds(meta)
    };
  }
}

function catalogTrailerIds(meta = {}) {
  const ids = [];
  [meta.trailerStreams, meta.trailers].forEach((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((entry) => {
      const id = String(entry?.ytId || entry?.source || "").trim();
      if (/^[A-Za-z0-9_-]{11}$/.test(id) && !ids.includes(id)) ids.push(id);
    });
  });
  return ids.slice(0, 2);
}

export const catalogRepository = new CatalogRepository();
