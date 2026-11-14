const teardownHandlers = new Set();
const pendingSessionRequests = new Set();

export function registerSessionTeardownHandler(handler) {
  if (typeof handler !== "function") {
    return () => {};
  }
  teardownHandlers.add(handler);
  return () => teardownHandlers.delete(handler);
}

export async function notifySessionTeardownHandlers(options = {}) {
  const handlers = [...teardownHandlers];
  if (!handlers.length) {
    return true;
  }
  const results = await Promise.allSettled(
    handlers.map((handler) => Promise.resolve().then(() => handler(options)))
  );
  results.forEach((result) => {
    if (result.status === "rejected") {
      console.warn("Session lifecycle handler failed", result.reason);
    }
  });
  return results.every((result) => result.status === "fulfilled" && result.value !== false);
}

export function trackSessionRequest(request) {
  const promise = Promise.resolve(request);
  pendingSessionRequests.add(promise);
  promise.then(
    () => pendingSessionRequests.delete(promise),
    () => pendingSessionRequests.delete(promise)
  );
  return promise;
}

export async function waitForPendingSessionRequests() {
  while (pendingSessionRequests.size) {
    const pending = [...pendingSessionRequests];
    await Promise.allSettled(pending);
    await Promise.resolve();
  }
  return true;
}
