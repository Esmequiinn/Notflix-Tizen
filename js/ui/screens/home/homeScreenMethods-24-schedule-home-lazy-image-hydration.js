import * as internals from "./homeScreenContext.js";
import {
  rescaleHomeArtwork,
  releaseHomeArtwork,
  shouldRescaleHomeArtwork,
  getHomeArtworkObjectFit,
  isRescalableArtworkFit
} from "../../images/tvPosterRescaler.js";
import { getTvArtworkPixelRatio } from "../../../platform/tvRuntimePerformance.js";
import { getArtworkEvictIdleMs, getArtworkEvictMarginPx, getDeviceMemoryGb } from "../../../platform/tvPerformancePolicy.js";

export function createHomeScreenMethods24() {
  const imageRequests = new WeakMap();
  const {
    MODERN_HOME_CONSTANTS,
    CW_DAYS_CAP,
    HOME_LAZY_IMAGE_LIFECYCLE_SELECTOR,
    HOME_LAZY_IMAGE_ROW_SELECTOR,
    HOME_LEGACY_LAZY_HYDRATION_DEBOUNCE_MS,
    HOME_LEGACY_LAZY_HYDRATION_MAX_PER_FRAME,
    Router,
    getTvRuntimePerformanceProfile,
    isSeriesTypeForContinueWatching,
    isCompletedForContinueWatching,
    episodeKey,
    episodeSortKey,
    buildNextUpSeedFromWatchedItem
  } = internals;

  return {
    shouldUseBoundedHomeImageHydration() {
      return Boolean(this.isPerformanceConstrained() || getTvRuntimePerformanceProfile().isTvRuntime);
    },
    scheduleHomeLazyImageHydration(
      anchorNode = null,
      {
        refreshIndex = false,
        deferUntilVerticalSettle = false,
        focusedRowOnly = false,
        includeNeighborRows = false,
        viewportChanged = false
      } = {}
    ) {
      if (typeof this.isSidebarFocusActive === "function" && this.isSidebarFocusActive()) {
        return;
      }
      const anchorRow = anchorNode instanceof HTMLElement ? anchorNode.closest(HOME_LAZY_IMAGE_ROW_SELECTOR) : null;
      const anchorImagePending = Boolean(
        anchorNode?.querySelector?.(".content-poster[data-src], .home-poster-landscape-logo[data-src], .home-continue-bg[data-src]")
      );
      const legacyFocusedRowPass = Boolean(this.isLegacyTvRuntime() && focusedRowOnly && anchorRow instanceof HTMLElement);
      if (legacyFocusedRowPass) {
        if (this.homeLazyImageNeighborTimer) {
          clearTimeout(this.homeLazyImageNeighborTimer);
        }
        this.homeLazyImageNeighborTimer = setTimeout(() => {
          this.homeLazyImageNeighborTimer = null;
          this.scheduleHomeLazyImageHydration(this.getCurrentFocusedNode(), {
            includeNeighborRows: true
          });
        }, HOME_LEGACY_LAZY_HYDRATION_DEBOUNCE_MS);
      }
      if (
        anchorRow instanceof HTMLElement &&
        anchorRow === this.lastHomeLazyImageHydrationAnchorRow &&
        !refreshIndex &&
        !this.homeLazyImageHydrationNeedsFullScan &&
        !this.homeLazyImageHydrationNeedsIndexRefresh &&
        !this.homeLazyImageHydrationRaf &&
        !includeNeighborRows &&
        !viewportChanged &&
        !(this.shouldUseBoundedHomeImageHydration() && anchorImagePending)
      ) {
        return;
      }
      if (anchorNode instanceof HTMLElement) {
        this.pendingHomeLazyImageAnchor = anchorNode;
      } else {
        this.homeLazyImageHydrationNeedsFullScan = true;
      }
      this.pendingHomeLazyImageFocusedRowOnly = legacyFocusedRowPass;
      this.pendingHomeLazyImageIncludeNeighborRows = Boolean(includeNeighborRows || (this.isLegacyTvRuntime() && !legacyFocusedRowPass));
      if (refreshIndex) {
        this.homeLazyImageHydrationNeedsIndexRefresh = true;
      }
      if (!legacyFocusedRowPass && (includeNeighborRows || !(anchorRow instanceof HTMLElement))) {
        if (this.homeLazyImageNeighborTimer) {
          clearTimeout(this.homeLazyImageNeighborTimer);
          this.homeLazyImageNeighborTimer = null;
        }
      }
      if (deferUntilVerticalSettle && !legacyFocusedRowPass && this.shouldUseBoundedHomeImageHydration() && this.layoutMode === "modern") {
        if (this.homeLazyImageHydrationSettleTimer) {
          clearTimeout(this.homeLazyImageHydrationSettleTimer);
        }
        const target = anchorNode instanceof HTMLElement ? anchorNode : null;
        const hydrationDelayMs = this.shouldUseImmediateFocusScroll()
          ? MODERN_HOME_CONSTANTS.smartTvLazyHydrationDebounceMs
          : MODERN_HOME_CONSTANTS.verticalScrollSettlePollMs;
        const retryAfterVerticalSettle = () => {
          this.homeLazyImageHydrationSettleTimer = null;
          if (this.isModernHydrationScrollActive()) {
            this.homeLazyImageHydrationSettleTimer = setTimeout(retryAfterVerticalSettle, MODERN_HOME_CONSTANTS.verticalScrollSettlePollMs);
            return;
          }
          this.scheduleHomeLazyImageHydration(target, { refreshIndex });
        };
        this.homeLazyImageHydrationSettleTimer = setTimeout(retryAfterVerticalSettle, hydrationDelayMs);
        return;
      }
      if (this.homeLazyImageHydrationSettleTimer) {
        clearTimeout(this.homeLazyImageHydrationSettleTimer);
        this.homeLazyImageHydrationSettleTimer = null;
      }
      if (this.modernVerticalFastScrollState) {
        return;
      }
      if (this.homeLazyImageHydrationRaf) {
        return;
      }
      this.homeLazyImageHydrationRaf = requestAnimationFrame(() => {
        this.homeLazyImageHydrationRaf = 0;
        const anchor = this.pendingHomeLazyImageAnchor || this.getCurrentFocusedNode();
        this.pendingHomeLazyImageAnchor = null;
        const forceFullScan = Boolean(this.homeLazyImageHydrationNeedsFullScan);
        this.homeLazyImageHydrationNeedsFullScan = false;
        const shouldRefreshIndex = Boolean(this.homeLazyImageHydrationNeedsIndexRefresh);
        this.homeLazyImageHydrationNeedsIndexRefresh = false;
        const onlyFocusedRow = Boolean(this.pendingHomeLazyImageFocusedRowOnly);
        this.pendingHomeLazyImageFocusedRowOnly = false;
        const includeNeighbors = Boolean(this.pendingHomeLazyImageIncludeNeighborRows);
        this.pendingHomeLazyImageIncludeNeighborRows = false;
        this.hydrateHomeLazyImages(anchor, {
          forceFullScan,
          refreshIndex: shouldRefreshIndex,
          focusedRowOnly: onlyFocusedRow,
          includeNeighborRows: includeNeighbors
        });
      });
    },
    buildHomeLazyImageHydrationIndex() {
      if (!this.container) {
        this.homeLazyImageHydrationIndex = null;
        return [];
      }
      const imagesByRow = new Map();
      Array.from(this.container.querySelectorAll(HOME_LAZY_IMAGE_LIFECYCLE_SELECTOR)).forEach((image) => {
        const row = image.closest(HOME_LAZY_IMAGE_ROW_SELECTOR);
        const rowImages = imagesByRow.get(row) || [];
        rowImages.push(image);
        imagesByRow.set(row, rowImages);
      });
      const index = Array.from(imagesByRow, ([row, images]) => ({ row, images }));
      this.homeLazyImageHydrationIndex = index;
      return index;
    },
    hydrateHomeLazyImages(
      anchorNode = null,
      { forceFullScan = false, refreshIndex = false, focusedRowOnly = false, includeNeighborRows = false } = {}
    ) {
      if (!this.container) {
        return;
      }
      if (typeof this.isSidebarFocusActive === "function" && this.isSidebarFocusActive()) {
        return;
      }
      const anchorRow = anchorNode?.closest?.(HOME_LAZY_IMAGE_ROW_SELECTOR) || null;
      const useBoundedTvHydration = this.shouldUseBoundedHomeImageHydration();
      const sameAnchorRow = anchorRow instanceof HTMLElement && anchorRow === this.lastHomeLazyImageHydrationAnchorRow;
      if (!forceFullScan && !refreshIndex && sameAnchorRow && !useBoundedTvHydration) {
        return;
      }
      this.lastHomeLazyImageHydrationAnchorRow = anchorRow;
      const imageRows =
        refreshIndex || !Array.isArray(this.homeLazyImageHydrationIndex)
          ? this.buildHomeLazyImageHydrationIndex()
          : this.homeLazyImageHydrationIndex;
      if (!imageRows.length) {
        return;
      }
      const viewport =
        this.container.querySelector(".home-modern-rows-viewport") || this.container.querySelector(".home-main") || this.container;
      const viewportRect = viewport.getBoundingClientRect();
      const screenHeight = Number(globalThis.innerHeight || globalThis.document?.documentElement?.clientHeight || 0);
      const screenWidth = Number(globalThis.innerWidth || globalThis.document?.documentElement?.clientWidth || 0);
      const visibleRect =
        useBoundedTvHydration && screenHeight > 0 && screenWidth > 0
          ? {
              top: Math.max(0, viewportRect.top),
              bottom: Math.min(screenHeight, viewportRect.bottom),
              left: Math.max(0, viewportRect.left),
              right: Math.min(screenWidth, viewportRect.right)
            }
          : viewportRect;
      const constrained = this.isPerformanceConstrained();
      const verticalMargin = useBoundedTvHydration ? 480 : constrained ? 720 : 1200;
      const horizontalMargin = useBoundedTvHydration ? 320 : constrained ? 520 : 1000;
      const focusedRow = Boolean(anchorRow && anchorRow === anchorNode?.closest?.(HOME_LAZY_IMAGE_ROW_SELECTOR));
      const focusedRowMargin = focusedRow ? Math.max(96, Math.round(Number(anchorNode?.offsetWidth || 0) * 0.65)) : horizontalMargin;
      const pendingLoads = [];
      imageRows.forEach((entry) => {
        const { row } = entry;
        if (row instanceof HTMLElement && !row.isConnected) {
          return;
        }
        const isFocusedRow = Boolean(anchorRow && row === anchorRow);
        if (focusedRowOnly && anchorRow && !isFocusedRow) {
          return;
        }
        if (sameAnchorRow && useBoundedTvHydration && !forceFullScan && !refreshIndex && !includeNeighborRows && !isFocusedRow) {
          return;
        }
        entry.images = entry.images.filter((image) => image.isConnected);
        const images = entry.images.filter((image) => image.dataset.src);
        if (!images.length) return;
        const shouldHydrateFocusedRowImmediately = isFocusedRow && !useBoundedTvHydration;
        if (!shouldHydrateFocusedRowImmediately && row instanceof HTMLElement) {
          const rowRect = row.getBoundingClientRect();
          const isRowNearViewport =
            rowRect.bottom >= visibleRect.top - verticalMargin && rowRect.top <= visibleRect.bottom + verticalMargin;
          if (!isRowNearViewport) {
            return;
          }
        }
        images.forEach((image) => {
          if (!(image instanceof HTMLImageElement) || !image.isConnected) {
            return;
          }
          const src = String(image.dataset.src || "").trim();
          if (!src) {
            image.removeAttribute("data-src");
            return;
          }
          if (!shouldHydrateFocusedRowImmediately) {
            const imageHorizontalMargin = isFocusedRow ? focusedRowMargin : horizontalMargin;
            const rect = image.getBoundingClientRect();
            const isNearViewport =
              rect.bottom >= visibleRect.top - verticalMargin &&
              rect.top <= visibleRect.bottom + verticalMargin &&
              rect.right >= visibleRect.left - imageHorizontalMargin &&
              rect.left <= visibleRect.right + imageHorizontalMargin;
            if (!isNearViewport) {
              return;
            }
          }
          const isFocusedImage = Boolean(
            anchorNode && (anchorNode === image || anchorNode.contains?.(image) || image.closest(".focusable") === anchorNode)
          );
          pendingLoads.push({
            image,
            src,
            row,
            isFocusedRow,
            isFocusedImage,
            priority: isFocusedImage ? 0 : isFocusedRow ? 1 : 2
          });
        });
      });
      if (this.isLegacyTvRuntime()) {
        this.commitHomeLazyImageSources(pendingLoads, anchorNode, anchorRow);
      } else {
        pendingLoads.forEach(({ image, src, priority }) => {
          this.assignHomeLazyImageSource(image, src, priority);
        });
      }
      if (getTvRuntimePerformanceProfile().isTvRuntime && Router.getCurrent() === "home") {
        this.scheduleHomeLazyImageEviction(anchorNode);
      }
    },
    assignHomeLazyImageSource(image, src, priority = 2) {
      image.loading = "eager";
      image.removeAttribute("data-src");
      if (!shouldRescaleHomeArtwork() || !image.classList.contains("content-poster")) {
        image.src = src;
        return;
      }
      const rect = image.getBoundingClientRect();
      const fit = getHomeArtworkObjectFit(image);
      if (!isRescalableArtworkFit(fit)) {
        image.src = src;
        return;
      }
      const ratio = getTvArtworkPixelRatio();
      const width = Math.round(rect.width * ratio);
      const height = Math.round(rect.height * ratio);
      if (!(width > 0) || !(height > 0)) {
        image.src = src;
        return;
      }
      image.dataset.originalSrc = src;
      const request = {};
      imageRequests.set(image, request);
      const onScreen =
        rect.bottom > 0 &&
        rect.top < (Number(globalThis.innerHeight) || 0) &&
        rect.right > 0 &&
        rect.left < (Number(globalThis.innerWidth) || 0);
      const isStale = () =>
        !image.isConnected || imageRequests.get(image) !== request || image.dataset.originalSrc !== src || Boolean(image.dataset.src);
      rescaleHomeArtwork(src, { width, height, fit, priority: onScreen ? 0 : priority, isStale }).then((objectUrl) => {
        if (isStale()) {
          releaseHomeArtwork(objectUrl);
          return;
        }
        image.src = objectUrl || src;
      });
    },
    scheduleHomeLazyImageEviction(anchorNode = null) {
      const idleMs = getArtworkEvictIdleMs(getTvRuntimePerformanceProfile(), getDeviceMemoryGb());
      if (idleMs <= 0) {
        this.evictDistantHomeLazyImages(anchorNode);
        return;
      }
      if (this.homeLazyImageEvictTimer) {
        clearTimeout(this.homeLazyImageEvictTimer);
      }
      const token = this.homeLoadToken;
      this.homeLazyImageEvictTimer = setTimeout(() => {
        this.homeLazyImageEvictTimer = null;
        if (token !== this.homeLoadToken || Router.getCurrent() !== "home") {
          return;
        }
        this.evictDistantHomeLazyImages(this.getCurrentFocusedNode?.() || anchorNode);
      }, idleMs);
      if (!this.homeLazyImageEvictMaxTimer) {
        this.homeLazyImageEvictMaxTimer = setTimeout(
          () => {
            this.homeLazyImageEvictMaxTimer = null;
            if (token !== this.homeLoadToken || Router.getCurrent() !== "home") {
              return;
            }
            this.evictDistantHomeLazyImages(this.getCurrentFocusedNode?.() || anchorNode);
          },
          Math.max(4000, idleMs)
        );
      }
    },
    evictDistantHomeLazyImages(anchorNode = null) {
      if (!this.container || !Array.isArray(this.homeLazyImageHydrationIndex)) {
        return 0;
      }
      const doc = globalThis.document?.documentElement;
      const viewportRect = {
        top: 0,
        left: 0,
        bottom: Number(globalThis.innerHeight || doc?.clientHeight || 0) || 1080,
        right: Number(globalThis.innerWidth || doc?.clientWidth || 0) || 1920
      };
      const margin = getArtworkEvictMarginPx(getTvRuntimePerformanceProfile(), getDeviceMemoryGb());
      const anchorRow = anchorNode?.closest?.(HOME_LAZY_IMAGE_ROW_SELECTOR) || null;
      let released = 0;
      this.homeLazyImageHydrationIndex.forEach((entry) => {
        const row = entry?.row;
        if (!(row instanceof HTMLElement) || !row.isConnected || row === anchorRow) {
          return;
        }
        const rowRect = row.getBoundingClientRect();
        const gap =
          rowRect.bottom < viewportRect.top
            ? viewportRect.top - rowRect.bottom
            : rowRect.top > viewportRect.bottom
              ? rowRect.top - viewportRect.bottom
              : 0;
        if (gap <= margin) {
          return;
        }
        (entry.images || []).forEach((image) => {
          released += this.releaseHomeLazyImage(image) ? 1 : 0;
        });
      });
      return released;
    },
    releaseHomeLazyImage(image) {
      if (!(image instanceof HTMLImageElement) || !image.isConnected) {
        return false;
      }
      const painted = String(image.getAttribute("src") || "").trim();
      const original = String(image.dataset.originalSrc || "").trim() || painted;
      if (!original) {
        return false;
      }
      imageRequests.delete(image);
      delete image.dataset.originalSrc;
      image.dataset.src = original;
      image.removeAttribute("src");
      releaseHomeArtwork(painted);
      return true;
    },
    releaseAllHomeLazyImages() {
      if (!this.container) {
        return 0;
      }
      let released = 0;
      Array.from(this.container.querySelectorAll(HOME_LAZY_IMAGE_LIFECYCLE_SELECTOR)).forEach((image) => {
        released += this.releaseHomeLazyImage(image) ? 1 : 0;
      });
      return released;
    },
    commitHomeLazyImageSources(queued = [], anchorNode = null, anchorRow = null) {
      const pending = this.homeLazyImageCommitQueue || (this.homeLazyImageCommitQueue = []);
      const nextOrder = () => {
        this.homeLazyImageCommitOrder = Number(this.homeLazyImageCommitOrder || 0) + 1;
        return this.homeLazyImageCommitOrder;
      };
      const isCurrentFocusedImage = (image) =>
        Boolean(anchorNode && (anchorNode === image || anchorNode.contains?.(image) || image.closest(".focusable") === anchorNode));
      pending.forEach((entry) => {
        entry.isFocusedImage = isCurrentFocusedImage(entry.image);
        entry.priority = entry.row === anchorRow ? (entry.isFocusedImage ? 0 : 1) : 2;
      });
      queued.forEach((entry) => {
        if (!(entry?.image instanceof HTMLImageElement) || !entry.image.isConnected || !entry.image.dataset.src) {
          return;
        }
        const existingIndex = pending.findIndex((candidate) => candidate.image === entry.image);
        if (existingIndex >= 0) {
          const existing = pending[existingIndex];
          existing.src = entry.src;
          existing.row = entry.row;
          existing.isFocusedRow = entry.isFocusedRow;
          existing.isFocusedImage = entry.isFocusedImage;
          existing.priority = entry.priority;
          existing.order = nextOrder();
          return;
        }
        pending.push({ ...entry, order: nextOrder() });
      });
      pending.sort((left, right) => left.priority - right.priority || left.order - right.order);
      if (!pending.length || this.homeLazyImageCommitRaf) {
        return;
      }

      const drain = () => {
        this.homeLazyImageCommitRaf = 0;
        let assigned = 0;
        while (pending.length && assigned < HOME_LEGACY_LAZY_HYDRATION_MAX_PER_FRAME) {
          const { image, src, priority } = pending.shift();
          if (!(image instanceof HTMLImageElement) || !image.isConnected) {
            continue;
          }
          const currentSrc = String(image.dataset.src || "").trim();
          if (!currentSrc) {
            continue;
          }
          this.assignHomeLazyImageSource(image, currentSrc || src, priority);
          assigned += 1;
        }
        if (pending.length) {
          this.homeLazyImageCommitRaf = requestAnimationFrame(drain);
        }
      };
      this.homeLazyImageCommitRaf = requestAnimationFrame(drain);
    },
    teardownGridStickyHeader() {
      if (this.gridStickyCleanup) {
        this.gridStickyCleanup();
        this.gridStickyCleanup = null;
      }
    },
    setupGridStickyHeader(showHeroSection) {
      const main = this.container?.querySelector(".home-main");
      const sticky = this.container?.querySelector("#homeGridSticky");
      const sections = Array.from(this.container?.querySelectorAll(".home-grid-section[data-section-title]") || []);
      if (!main || !sticky || !sections.length) {
        return;
      }
      const hero = showHeroSection ? this.container?.querySelector(".home-hero") : null;
      const heroHeight = hero ? hero.offsetHeight : 0;
      const update = () => {
        const threshold = main.scrollTop + 72;
        let activeTitle = "";
        sections.forEach((section) => {
          if (section.offsetTop <= threshold) {
            activeTitle = String(section.dataset.sectionTitle || "");
          }
        });
        const shouldShow = activeTitle && (!showHeroSection || main.scrollTop > Math.max(0, heroHeight - 48));
        sticky.textContent = activeTitle;
        sticky.classList.toggle("is-visible", Boolean(shouldShow));
      };
      main.addEventListener("scroll", update, { passive: true });
      update();
      this.gridStickyCleanup = () => {
        main.removeEventListener("scroll", update);
      };
    },
    selectNextUpProgressCandidates(allProgress = [], inProgressItems = [], watchedItems = [], options = {}) {
      const includeWatchedItemSeeds = options?.includeWatchedItemSeeds !== false;
      const includeProgressSeeds = options?.includeProgressSeeds !== false;
      const applyDaysCap = options?.applyDaysCap !== false;
      const cutoffMs = applyDaysCap ? Date.now() - CW_DAYS_CAP * 24 * 60 * 60 * 1000 : 0;
      const nextUpFromFurthestEpisode = options?.nextUpFromFurthestEpisode !== false;
      const inProgressSeriesIds = new Set(
        (Array.isArray(inProgressItems) ? inProgressItems : [])
          .filter((item) => isSeriesTypeForContinueWatching(item?.contentType || item?.type))
          .map((item) => String(item?.contentId || "").trim())
          .filter(Boolean)
      );

      const latestCompletedByContent = new Map();
      const shouldReplaceNextUpSeed = (existing, incoming) => {
        if (!existing) {
          return true;
        }
        const existingEpisodeKey = episodeSortKey(existing.season, existing.episode);
        const incomingEpisodeKey = episodeSortKey(incoming.season, incoming.episode);
        if (nextUpFromFurthestEpisode && incomingEpisodeKey !== existingEpisodeKey) {
          return incomingEpisodeKey > existingEpisodeKey;
        }
        const existingUpdated = Number(existing.updatedAt || 0);
        const incomingUpdated = Number(incoming.updatedAt || 0);
        if (incomingUpdated !== existingUpdated) {
          return incomingUpdated > existingUpdated;
        }
        return incomingEpisodeKey > existingEpisodeKey;
      };
      const addSeed = (entry) => {
        if (cutoffMs > 0 && Number(entry?.updatedAt || 0) < cutoffMs) {
          return;
        }
        const contentId = String(entry?.contentId || "").trim();
        if (!contentId || inProgressSeriesIds.has(contentId)) {
          return;
        }
        if (!isSeriesTypeForContinueWatching(entry?.contentType)) {
          return;
        }
        const season = Number(entry?.season || 0);
        const episode = Number(entry?.episode || 0);
        if (season <= 0 || episode <= 0 || !isCompletedForContinueWatching(entry)) {
          return;
        }

        const existing = latestCompletedByContent.get(contentId);
        if (shouldReplaceNextUpSeed(existing, entry)) {
          latestCompletedByContent.set(contentId, entry);
        }
      };

      if (includeProgressSeeds) {
        (Array.isArray(allProgress) ? allProgress : []).forEach(addSeed);
      }
      if (includeWatchedItemSeeds) {
        (Array.isArray(watchedItems) ? watchedItems : [])
          .map((item) => buildNextUpSeedFromWatchedItem(item))
          .filter(Boolean)
          .forEach(addSeed);
      }

      return Array.from(latestCompletedByContent.values()).sort(
        (left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0)
      );
    },
    buildWatchedEpisodeIndex(watchedItems = []) {
      const byContent = new Map();
      (Array.isArray(watchedItems) ? watchedItems : []).forEach((entry) => {
        const contentId = String(entry?.contentId || "").trim();
        const season = Number(entry?.season || 0);
        const episode = Number(entry?.episode || 0);
        if (!contentId || season <= 0 || episode <= 0) {
          return;
        }
        if (!byContent.has(contentId)) {
          byContent.set(contentId, new Set());
        }
        byContent.get(contentId).add(episodeKey(season, episode));
      });
      return byContent;
    }
  };
}
