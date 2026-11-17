import { HomeScreen } from "../screens/home/homeScreen.js";
import { SearchScreen } from "../screens/search/searchScreen.js";
import { Router } from "../navigation/router.js";
import { withNotflixHome } from "./home/notflixHome.js";
import { withNotflixSearch } from "./search/notflixSearch.js";
import { MetaDetailsScreen } from "../screens/detail/metaDetailsScreen.js";
import { withNotflixDetail } from "./detail/notflixDetail.js";
import { ProfileSelectionScreen } from "../../core/profile/profileSelectionScreen.js";
import { withNotflixProfiles } from "./profiles/notflixProfiles.js";
import { PlayerScreen } from "../screens/player/playerScreen.js";
import { withNotflixPlayer } from "./playback/notflixPlayerFallback.js";
import { withNotflixPlayerUi } from "./playback/notflixPlayerUi.js";
import { CalendarScreen } from "./calendar/calendarScreen.js";
import { LibraryScreen } from "../screens/library/libraryScreen.js";
import { withNotflixLibrary } from "./library/notflixMyList.js";
import { isNotflixActive } from "./notflixAppearance.js";
import { isNotflixTitleVisible } from "./profiles/titleVisibility.js";
import { installUiSoundKeys } from "./notflixSounds.js";
import {
  instrumentScreens,
  isPerfMonitorEnabled,
  openPerfReport,
  startPerfMonitor
} from "./diagnostics/notflixPerf.js";

let installed = false;

function patch(target, wrapper) {
  const wrapped = wrapper({ ...target });
  Object.keys(wrapped).forEach((key) => {
    if (wrapped[key] !== target[key]) target[key] = wrapped[key];
  });
}

export function installNotflix() {
  if (installed) return;
  installUiSoundKeys();
  installed = true;
  patch(HomeScreen, withNotflixHome);
  patch(SearchScreen, withNotflixSearch);
  patch(MetaDetailsScreen, withNotflixDetail);
  patch(ProfileSelectionScreen, withNotflixProfiles);
  patch(PlayerScreen, withNotflixPlayer);
  patch(PlayerScreen, withNotflixPlayerUi);
  patch(LibraryScreen, withNotflixLibrary);
  SearchScreen.nfTitleVisible = (type, id) => !isNotflixActive() || isNotflixTitleVisible(type, id);
  try {
    if (globalThis.localStorage?.getItem("nfDebug") === "1") {
      globalThis.__nuvioDebugScreen = () => Router.routes?.[Router.getCurrent?.()] || null;
      globalThis.__nuvioDebugRoute = (name) => Router.routes?.[name] || null;
      globalThis.__nfPerfReport = openPerfReport;
    }
  } catch (_) {}
  if (Router.routes && !Router.routes.calendar) {
    Router.routes.calendar = CalendarScreen;
  }
  instrumentScreens({
    Inicio: HomeScreen,
    Ficha: MetaDetailsScreen,
    Reproductor: PlayerScreen,
    MiLista: LibraryScreen,
    Buscar: SearchScreen,
    Perfiles: ProfileSelectionScreen
  });
  if (isPerfMonitorEnabled()) startPerfMonitor();
}
