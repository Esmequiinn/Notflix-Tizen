import { uniqueNonEmptyValues } from "./homeUtils.js";
import { normalizeTmdbBackdropUrl } from "../../../core/tmdb/tmdbImageUrl.js";

export function buildHeroBackdropSources(item = null) {
  return uniqueNonEmptyValues([
    normalizeTmdbBackdropUrl(item?.background),
    normalizeTmdbBackdropUrl(item?.backdrop),
    normalizeTmdbBackdropUrl(item?.backdropUrl),
    normalizeTmdbBackdropUrl(item?.landscapePoster),
    item?.poster,
    item?.thumbnail,
    item?.episodeThumbnail
  ]);
}

export function encodeHeroBackdropFallbacks(sources = []) {
  return sources.map((source) => encodeURIComponent(source)).join("|");
}

export function buildImageFallbackErrorHandler() {
  return "var q=(this.dataset.fallbackSrcs||'').split('|').filter(Boolean);var next=q.shift();if(next){this.dataset.fallbackSrcs=q.join('|');this.src=decodeURIComponent(next);return;}this.removeAttribute('src');this.classList.add('placeholder');";
}
