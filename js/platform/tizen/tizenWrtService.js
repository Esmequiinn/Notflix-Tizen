const SERVICE_START_GRACE_MS = 1500;

export function getWrtServiceClass(bridge = globalThis.__NUVIO_TIZEN_WRT_SERVICE__) {
  const Service = bridge?.Service || bridge?.default?.Service;
  return typeof Service === "function" ? Service : null;
}

export function startWithWrtServiceClass(Service, serviceId, graceMs = SERVICE_START_GRACE_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve("pending"), graceMs);
    Promise.resolve(new Service(serviceId).start()).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
