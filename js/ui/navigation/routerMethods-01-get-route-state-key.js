import * as internals from "./router.js";

export function createRouterMethods01() {
  const { Platform, RouteStateStore, NON_BACKSTACK_ROUTES, getStackEntryRoute, getStackEntryParams, resolvePendingHistoryReturnParams } =
    internals;

  return {
    getRouteStateKey(routeName, params = {}) {
      const screen = this.routes[routeName];
      if (!screen?.getRouteStateKey) {
        return null;
      }
      try {
        return screen.getRouteStateKey(params || {});
      } catch (error) {
        console.warn("Failed to resolve route state key", routeName, error);
        return null;
      }
    },
    captureCurrentRouteState() {
      if (!this.current) {
        return;
      }
      const screen = this.routes[this.current];
      if (!screen?.captureRouteState) {
        return;
      }
      const key = this.getRouteStateKey(this.current, this.currentParams);
      if (!key) {
        return;
      }
      try {
        RouteStateStore.set(key, screen.captureRouteState());
      } catch (error) {
        console.warn("Failed to capture route state", this.current, error);
      }
    },
    resolveNavigationContext(routeName, params = {}, options = {}) {
      const screen = this.routes[routeName];
      const key = this.getRouteStateKey(routeName, params);
      const shouldClear = Boolean(screen?.clearRouteStateOnMount?.(params || {}));
      if (shouldClear && key) {
        RouteStateStore.clear(key);
      }
      return {
        restoredState: !shouldClear && key ? RouteStateStore.get(key) : null,
        routeStateKey: key,
        fromHistory: Boolean(options?.fromHistory),
        isBackNavigation: Boolean(options?.isBackNavigation),
        previousRoute: String(options?.previousRoute || "")
      };
    },
    async consumePendingHistoryReturn(state = null) {
      const pending = this.pendingHistoryReturn;
      if (!pending) {
        return false;
      }

      this.pendingHistoryReturn = null;
      this.ignoreNextPopstate = false;
      this.suppressPopstateUntil = 0;

      const targetStackIndex = Number.isInteger(pending.targetStackIndex) ? pending.targetStackIndex : this.stack.length - 1;
      const stackEntry = this.stack[targetStackIndex];
      const stackMatches =
        this.stack.length === Number(pending.stackLength) &&
        targetStackIndex >= 0 &&
        getStackEntryRoute(stackEntry) === pending.route &&
        (!pending.stackEntry || stackEntry === pending.stackEntry);
      const routeMatches = state?.route === pending.route;
      const sourceMatches = this.current === pending.sourceRoute;

      if (sourceMatches && stackMatches && routeMatches) {
        this.stack.splice(targetStackIndex);
        const targetParams = resolvePendingHistoryReturnParams(pending, state, stackEntry);
        await this.navigate(pending.route, targetParams, {
          fromHistory: true,
          skipStackPush: true,
          isBackNavigation: true
        });
        return true;
      }

      if (sourceMatches && stackMatches && !state?.route) {
        this.stack.splice(targetStackIndex);
        await this.navigate(pending.route, resolvePendingHistoryReturnParams(pending, state, stackEntry), {
          skipStackPush: true,
          replaceHistory: true,
          isBackNavigation: true
        });
        return true;
      }

      if (sourceMatches) {
        this.skipConsumeNextPopstate = true;
      }
      return false;
    },
    restoreCurrentHistoryState(previousState = null) {
      if (!window?.history) {
        return;
      }
      const hasPreviousRouteMetadata = Object.prototype.hasOwnProperty.call(previousState || {}, "previousRoute");
      const currentState = {
        route: this.current,
        params: this.currentParams,
        previousRoute: hasPreviousRouteMetadata
          ? previousState.previousRoute || null
          : previousState?.route === this.current
            ? null
            : previousState?.route || null
      };
      if (previousState?.route === currentState.route && typeof window.history.replaceState === "function") {
        window.history.replaceState(currentState, "");
        return;
      }
      if (typeof window.history.pushState === "function") {
        window.history.pushState(currentState, "");
      }
    },
    init() {
      if (this.popstateBound) {
        return;
      }
      this.popstateBound = true;
      window.addEventListener("popstate", async (event) => {
        const state = event?.state || null;
        if (await this.consumePendingHistoryReturn(state)) {
          return;
        }
        if (await this.consumePendingPostPlayNavigation(state)) {
          return;
        }
        if (this.ignoreNextPopstate) {
          this.ignoreNextPopstate = false;
          return;
        }
        if (Date.now() < Number(this.suppressPopstateUntil || 0)) {
          this.restoreCurrentHistoryState(state);
          return;
        }
        if (this.consumeRouteReturnBackGuard()) {
          this.restoreCurrentHistoryState(state);
          return;
        }
        if (Platform.isTizen() && this.current === "home" && state?.route === "home") {
          return;
        }
        const shouldSkipConsume = Boolean(this.skipConsumeNextPopstate);
        this.skipConsumeNextPopstate = false;
        const currentScreen = this.getCurrentScreen();
        const shouldLetPlayerReturnToStream =
          this.current === "player" &&
          state?.route === "stream" &&
          currentScreen?.shouldReturnToStreamOnBack?.() !== false &&
          !currentScreen?.hasBackDismissableOverlay?.();
        const consumeResult = !shouldSkipConsume && !shouldLetPlayerReturnToStream ? currentScreen?.consumeBackRequest?.() : false;
        if (consumeResult) {
          if (consumeResult !== "history") {
            this.restoreCurrentHistoryState(state);
          }
          return;
        }
        if (this.current === "home" && (!state?.route || NON_BACKSTACK_ROUTES.has(state.route))) {
          Platform.exitApp();
          return;
        }
        if (state?.route && this.routes[state.route]) {
          await this.navigate(state.route, state.params || {}, {
            fromHistory: true,
            skipStackPush: true,
            isBackNavigation: true
          });
          return;
        }
        if (this.current && this.current !== "home" && this.routes.home) {
          await this.navigate(
            "home",
            {},
            {
              fromHistory: true,
              skipStackPush: true,
              isBackNavigation: true
            }
          );
        }
      });
    },
    suppressNextPopstate(durationMs = 700) {
      this.suppressPopstateUntil = Math.max(Number(this.suppressPopstateUntil || 0), Date.now() + Math.max(0, Number(durationMs || 0)));
    },
    ignoreSinglePopstate() {
      this.ignoreNextPopstate = true;
    },
    popToExistingRoute(routeName, fallbackParams = {}, options = {}) {
      const targetRoute = String(routeName || "").trim();
      if (!targetRoute || !this.routes[targetRoute] || this.current === targetRoute) {
        return false;
      }

      const allowSingleIntermediateRoute = Boolean(options?.allowSingleIntermediateRoute);

      if (this.pendingHistoryReturn) {
        return this.pendingHistoryReturn.route === targetRoute;
      }

      if (!this.historyInitialized || !window?.history) {
        return false;
      }

      const currentHistoryRoute = String(window.history.state?.route || "");
      if (currentHistoryRoute && currentHistoryRoute !== this.current) {
        return false;
      }

      const topStackIndex = this.stack.length - 1;
      const topStackRoute = getStackEntryRoute(this.stack[topStackIndex]);
      const targetStackIndex =
        topStackRoute === targetRoute ? topStackIndex : allowSingleIntermediateRoute && topStackIndex > 0 ? topStackIndex - 1 : -1;
      if (targetStackIndex < 0) {
        return false;
      }

      const stackEntry = this.stack[targetStackIndex];
      if (getStackEntryRoute(stackEntry) !== targetRoute) {
        return false;
      }

      if (allowSingleIntermediateRoute && targetRoute === "detail") {
        const targetItemId = String(fallbackParams?.itemId || "").trim();
        const targetItemType = String(fallbackParams?.itemType || "")
          .trim()
          .toLowerCase();
        const stackParams = getStackEntryParams(stackEntry);
        const stackItemId = String(stackParams?.itemId || "").trim();
        const stackItemType = String(stackParams?.itemType || "")
          .trim()
          .toLowerCase();
        if ((targetItemId && stackItemId !== targetItemId) || (targetItemType && stackItemType && stackItemType !== targetItemType)) {
          return false;
        }
      }

      const historySteps = this.stack.length - targetStackIndex;
      if (historySteps > 1 && !allowSingleIntermediateRoute) {
        return false;
      }
      if (
        (historySteps === 1 && typeof window.history.back !== "function") ||
        (historySteps > 1 && typeof window.history.go !== "function")
      ) {
        return false;
      }

      const previousHistoryRoute = String(window.history.state?.previousRoute || "");
      const expectedPreviousRoute = historySteps === 1 ? targetRoute : topStackRoute;
      if (previousHistoryRoute && previousHistoryRoute !== expectedPreviousRoute) {
        return false;
      }

      this.pendingHistoryReturn = {
        route: targetRoute,
        params: fallbackParams && typeof fallbackParams === "object" ? fallbackParams : {},
        sourceRoute: this.current,
        stackLength: this.stack.length,
        stackEntry,
        targetStackIndex,
        requestedAt: Date.now()
      };

      try {
        if (historySteps === 1) {
          window.history.back();
        } else {
          window.history.go(-historySteps);
        }
        return true;
      } catch (error) {
        this.pendingHistoryReturn = null;
        console.warn("Failed to return to existing route", targetRoute, error);
        return false;
      }
    },
    beginRouteReturnBackGuard(isBackNavigation = false) {
      this.routeReturnBackGuardNavigationId += 1;
      const navigationId = this.routeReturnBackGuardNavigationId;
      const shouldGuard = Platform.isTizen() && Boolean(isBackNavigation);
      this.routeReturnBackGuardActive = shouldGuard;
      this.routeReturnBackGuardUntil = shouldGuard ? Number.POSITIVE_INFINITY : 0;
      return navigationId;
    }
  };
}
