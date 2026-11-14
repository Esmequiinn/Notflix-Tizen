export function shouldKeepNextUpForAiringSetting(item = {}, showUnairedNextUp = true) {
  if (!item?.isNextUp) {
    return true;
  }
  return item.hasAired !== false || showUnairedNextUp !== false;
}
