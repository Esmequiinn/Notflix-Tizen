import { isHiddenTitle } from "./hiddenTitles.js";
import { isTitleAllowed } from "./ageGate.js";

export function isNotflixTitleVisible(type, id) {
  return !isHiddenTitle(type, id) && isTitleAllowed(type, id);
}
