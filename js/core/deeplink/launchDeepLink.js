import { parseTitleDeepLink } from "./deepLinkParser.js";

let pendingLaunchDeepLink = null;

function launchParamsOf(system) {
  let params = system?.launchParams;
  if (typeof params === "string") {
    try {
      params = JSON.parse(params || "{}");
    } catch (error) {
      params = null;
    }
  }
  return params && typeof params === "object" ? params : null;
}

function currentLaunchParams() {
  const systems = [globalThis.webOSSystem || null, globalThis.PalmSystem || null];
  for (const system of systems) {
    const params = launchParamsOf(system);
    if (params) {
      return params;
    }
  }
  return null;
}

export function readWebOsLaunchDeepLink(params = currentLaunchParams()) {
  const target = params && typeof params.contentTarget === "string" ? params.contentTarget : "";
  return target ? parseTitleDeepLink(target) : null;
}

export function takeWebOsLaunchDeepLink({ params = currentLaunchParams() } = {}) {
  const link = readWebOsLaunchDeepLink(params);
  pendingLaunchDeepLink = link || pendingLaunchDeepLink;
  return link;
}

function currentTizenAppControl() {
  try {
    return (
      globalThis.tizen?.application?.getCurrentApplication?.()?.getRequestedAppControl?.()
        ?.appControl || null
    );
  } catch {
    return null;
  }
}

export function readTizenLaunchDeepLink(appControl = currentTizenAppControl()) {
  if (!appControl) {
    return null;
  }
  const data = Array.isArray(appControl.data) ? appControl.data : [];
  const entry = data.find((item) => item?.key === "contentTarget");
  const target = entry?.value?.[0];
  const fromData = typeof target === "string" ? parseTitleDeepLink(target) : null;
  return (
    fromData || (typeof appControl.uri === "string" ? parseTitleDeepLink(appControl.uri) : null)
  );
}

export function takeTizenLaunchDeepLink({ appControl = currentTizenAppControl() } = {}) {
  const link = readTizenLaunchDeepLink(appControl);
  pendingLaunchDeepLink = link || pendingLaunchDeepLink;
  return link;
}

export function hasPendingLaunchDeepLink() {
  return Boolean(pendingLaunchDeepLink);
}

export async function openPendingLaunchDeepLink(router, startupRoutes) {
  const current = router.getCurrent();
  if (
    !pendingLaunchDeepLink ||
    !current ||
    router.pendingMountParams ||
    startupRoutes.has(current)
  ) {
    return false;
  }
  const link = pendingLaunchDeepLink;
  pendingLaunchDeepLink = null;
  if (
    current === "detail" &&
    router.currentParams?.itemId === link.id &&
    router.currentParams?.itemType === link.type
  ) {
    return true;
  }
  await router.navigate(
    "detail",
    { itemId: link.id, itemType: link.type },
    current === "detail" ? { replaceHistory: true } : undefined
  );
  return true;
}

export function resetLaunchDeepLinkForTests() {
  pendingLaunchDeepLink = null;
}
