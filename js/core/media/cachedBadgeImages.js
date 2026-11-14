import { getCachedAddonLogoDisplayUrl } from "./addonLogoCache.js";

export function bindCachedBadgeImages(container) {
  container?.querySelectorAll("img[data-cached-badge-image]").forEach((image) => {
    const url = getCachedAddonLogoDisplayUrl(image.getAttribute("data-cached-badge-image"));
    if (!url) return;
    image.src = url;
    image.removeAttribute("data-cached-badge-image");
  });
}
