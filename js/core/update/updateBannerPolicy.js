export function shouldShowUpdate({
  isRemoteNewer,
  force = false,
  bannerEnabled = true,
  dismissedTag = null,
  updateTag
}) {
  if (!isRemoteNewer) {
    return false;
  }
  if (force) {
    return true;
  }
  return bannerEnabled && dismissedTag !== updateTag;
}
