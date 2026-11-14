export function mapPluginStreamGroup(result = {}) {
  const sourceProviderId = result.sourceId || result.sourceName || null;
  const sourceName = result.sourceName || null;
  const sourceLogo = result.sourceLogo || null;

  return {
    sourceProviderId,
    addonName: sourceName,
    addonLogo: sourceLogo,
    streams: (Array.isArray(result.streams) ? result.streams : []).map((stream) => {
      const mappedStream = stream && typeof stream === "object" ? { ...stream } : {};
      delete mappedStream.streamOrigin;
      return {
        ...mappedStream,
        sourceProviderId,
        addonName: sourceName,
        addonLogo: mappedStream.addonLogo || sourceLogo || null
      };
    })
  };
}
