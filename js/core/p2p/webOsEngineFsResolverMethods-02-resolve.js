import * as internals from "./webosEngineFsResolver.js";

export function createWebOsEngineFsResolverMethods02() {
  const {
    Platform,
    requestWebOsCompanionService,
    isP2pEnabledForActiveProfile,
    logEngineFsDebug,
    normalizeInfoHash,
    getInfoHash,
    getMagnetUri,
    getDirectPlaybackUrl,
    getTrackerSources,
    normalizeBaseUrl,
    isLocalHostUrl,
    buildPlaybackUrl,
    describeError,
    buildNuvioPeerSearchSources,
    requestEngineFsCreateDirect,
    waitForEngineFsReady,
    selectFileIdx,
    getFileNameFromCreateJson,
    guessMimeFromPath,
    buildResolvedStream
  } = internals;

  return {
    async resolve(stream = {}, context = {}) {
      if (getDirectPlaybackUrl(stream)) {
        return { status: "success", stream };
      }
      if (Platform.isWebOS() && !isP2pEnabledForActiveProfile()) {
        return {
          status: "disabled",
          detail: "P2P is disabled for the active profile"
        };
      }
      if (!this.canResolveStream(stream)) {
        return { status: "unsupported" };
      }

      try {
        const infoHash = getInfoHash(stream);
        const magnetUri = getMagnetUri(stream);
        const trackerSources = getTrackerSources(stream, magnetUri);
        const explicitFileIdx = Number(stream.fileIdx ?? stream.raw?.fileIdx);
        const hasExplicitFileIdx = Number.isFinite(explicitFileIdx) && explicitFileIdx >= 0;
        const season = Number(context?.season);
        const episode = Number(context?.episode);
        const guessFileIdx = {};
        if (Number.isFinite(season)) {
          guessFileIdx.season = season;
        }
        if (Number.isFinite(episode)) {
          guessFileIdx.episode = episode;
        }
        let statusPayload = {};
        let statusError = "";
        try {
          const statusResult = await requestWebOsCompanionService({
            method: "status",
            parameters: {},
            timeoutMs: 30000,
            retryOnFailure: false
          });
          statusPayload = statusResult?.payload || {};
        } catch (error) {
          statusPayload = {};
          statusError = describeError(error);
        }

        const parseSettingsBase = (payload) => {
          if (!payload) return "";
          if (typeof payload.settingsBody === "string") {
            try {
              const settings = JSON.parse(payload.settingsBody || "{}");
              return normalizeBaseUrl(settings?.baseUrl || "");
            } catch (_) {}
          }
          return "";
        };

        const settingsBase = parseSettingsBase(statusPayload);
        const statusUrl = normalizeBaseUrl(statusPayload?.url || "");
        const publicBaseCandidate =
          settingsBase && !isLocalHostUrl(settingsBase) ? settingsBase : statusUrl && !isLocalHostUrl(statusUrl) ? statusUrl : "";
        const localBaseCandidate = statusUrl && isLocalHostUrl(statusUrl) ? statusUrl : "";

        let createPayload = null;
        if (localBaseCandidate && hasExplicitFileIdx && trackerSources.length === 0) {
          createPayload = {
            returnValue: true,
            url: null,
            proxiedPath: null,
            statusCode: null,
            body: "",
            json: {
              infoHash,
              fileIdx: explicitFileIdx
            },
            createRequest: {
              method: "SKIP",
              path: null,
              bodyKeys: []
            },
            playbackSources: []
          };
        }
        if (localBaseCandidate) {
          if (!createPayload) {
            createPayload = await requestEngineFsCreateDirect(localBaseCandidate, {
              infoHash,
              magnetUri,
              trackerSources,
              hasExplicitFileIdx,
              guessFileIdx: Object.keys(guessFileIdx).length ? guessFileIdx : {}
            });
          }
        } else {
          const detail =
            statusError ||
            statusPayload?.error?.message ||
            (statusPayload?.settingsReachable === false ? "EngineFS local runtime settings endpoint is unreachable" : "") ||
            "EngineFS local runtime URL is unavailable";
          return { status: "unavailable", detail };
        }
        if (createPayload.returnValue === false) {
          console.warn("WebOsEngineFsResolver: EngineFS create failed", {
            infoHash,
            statusCode: createPayload.statusCode || null,
            proxiedPath: createPayload.proxiedPath || null,
            errorText: createPayload.errorText || "",
            body: createPayload.body || "",
            createRequest: createPayload.createRequest || null
          });
          return { status: "error", detail: createPayload.errorText || "" };
        }

        const createJson = createPayload.json || null;
        const selectedFileIdx = selectFileIdx(stream, createJson || {});
        const selectedInfoHash = normalizeInfoHash(createJson?.infoHash) || infoHash;
        const selectedFilename = getFileNameFromCreateJson(createJson || {}, selectedFileIdx);
        const hasSelectedFileIdx = Number.isFinite(selectedFileIdx) && selectedFileIdx >= 0;
        const playbackSources = Array.isArray(createPayload.playbackSources)
          ? createPayload.playbackSources
          : buildNuvioPeerSearchSources(infoHash, trackerSources);
        const publicPlaybackUrl = publicBaseCandidate
          ? buildPlaybackUrl(publicBaseCandidate, selectedInfoHash, selectedFileIdx, playbackSources)
          : "";

        if (localBaseCandidate && hasSelectedFileIdx) {
          const localPlaybackUrl = buildPlaybackUrl(localBaseCandidate, selectedInfoHash, selectedFileIdx, playbackSources);
          const guessedMime = guessMimeFromPath(selectedFilename || localPlaybackUrl) || null;
          const diagLog = {
            playbackUrl: localPlaybackUrl,
            publicPlaybackUrl: publicPlaybackUrl || null,
            infoHash: selectedInfoHash,
            fileIdx: selectedFileIdx,
            filename: selectedFilename || null,
            guessedMime,
            baseUrlKind: "local-service",
            companionStatusUrl: statusUrl || null,
            settingsBaseUrl: settingsBase || null,
            createResult: {
              returnValue: createPayload?.returnValue,
              json: createJson
                ? {
                    infoHash: createJson.infoHash,
                    guessedFileIdx: createJson.guessedFileIdx,
                    fileIdx: createJson.fileIdx,
                    baseUrl: createJson.baseUrl || createJson.base_url,
                    playbackUrl: createJson.playbackUrl || createJson.playback
                  }
                : null
            },
            playbackSources,
            statsProbe: null,
            rangeProbe: null,
            finalReason: "create-ok-nuvio-mode",
            elapsedMs: null
          };
          logEngineFsDebug("WebOsEngineFsResolver: EngineFS probe result", diagLog);
          return {
            status: "success",
            stream: buildResolvedStream(stream, {
              infoHash: selectedInfoHash,
              fileIdx: selectedFileIdx,
              playbackUrl: localPlaybackUrl,
              filename: selectedFilename,
              baseUrlKind: "local-service",
              publicPlaybackUrl
            })
          };
        }

        const candidatePlaybackFromCreate =
          createJson && (createJson.playbackUrl || createJson.playbackURL || createJson.playback_url || createJson.playback);
        if (candidatePlaybackFromCreate) {
          const chosenInfoHash = selectedInfoHash;
          const fileIdx = selectedFileIdx;
          try {
            const abs = new URL(candidatePlaybackFromCreate);
            if (isLocalHostUrl(abs.href) && hasSelectedFileIdx) {
              const filename = selectedFilename;
              let finalPlayback = null;
              try {
                const parsed = new URL(abs.href);
                finalPlayback = buildPlaybackUrl(parsed.origin, chosenInfoHash, fileIdx);
              } catch (_) {
                finalPlayback = buildPlaybackUrl(abs.origin, chosenInfoHash, fileIdx);
              }
              const readyResWithDiag = await waitForEngineFsReady(new URL(finalPlayback).origin, chosenInfoHash, fileIdx, finalPlayback, {
                collectDiagnostics: true
              });
              const readyFinal = Boolean(readyResWithDiag && readyResWithDiag.ready);
              const guessedMime = guessMimeFromPath(filename || finalPlayback) || null;
              const diagLog = {
                playbackUrl: finalPlayback,
                infoHash: chosenInfoHash,
                fileIdx,
                filename: filename || null,
                guessedMime,
                baseUrlKind: "public-create-playback",
                createResult: {
                  returnValue: createPayload?.returnValue,
                  json: createJson
                    ? {
                        infoHash: createJson.infoHash,
                        baseUrl: createJson.baseUrl || createJson.base_url,
                        playbackUrl: createJson.playbackUrl || createJson.playback
                      }
                    : null
                },
                statsProbe: readyResWithDiag?.diag?.statsLastStatus
                  ? {
                      success: readyResWithDiag?.diag?.statsSuccess,
                      attempts: readyResWithDiag?.diag?.statsAttempts,
                      lastStatus: readyResWithDiag?.diag?.statsLastStatus,
                      lastJson: readyResWithDiag?.diag?.statsLastJson,
                      snapshot: readyResWithDiag?.diag?.statsLastSnapshot || null
                    }
                  : null,
                rangeProbe: readyResWithDiag?.diag?.rangeLastStatus
                  ? {
                      success: readyResWithDiag?.diag?.rangeSuccess,
                      attempts: readyResWithDiag?.diag?.rangeAttempts,
                      lastStatus: readyResWithDiag?.diag?.rangeLastStatus,
                      lastBytes: readyResWithDiag?.diag?.rangeLastBytes
                    }
                  : null,
                finalReason: readyFinal ? readyResWithDiag?.diag?.readyReason || "ready" : "timeout_or_not_ready",
                elapsedMs: readyResWithDiag?.diag?.elapsedMs ?? null
              };
              logEngineFsDebug("WebOsEngineFsResolver: EngineFS probe result", diagLog);
              if (!readyFinal) {
                return { status: "unavailable" };
              }
              return {
                status: "success",
                stream: buildResolvedStream(stream, {
                  infoHash: chosenInfoHash,
                  fileIdx,
                  playbackUrl: finalPlayback,
                  filename,
                  baseUrlKind: "public-create-playback",
                  publicPlaybackUrl: finalPlayback
                })
              };
            }
          } catch (_) {
            const baseToUse =
              settingsBase && !isLocalHostUrl(settingsBase)
                ? settingsBase
                : createJson && (createJson.baseUrl || createJson.base_url) && !isLocalHostUrl(createJson.baseUrl || createJson.base_url)
                  ? normalizeBaseUrl(createJson.baseUrl || createJson.base_url)
                  : publicBaseCandidate;
            if (baseToUse) {
              const filename = selectedFilename;
              let playbackUrl = buildPlaybackUrl(baseToUse, chosenInfoHash, fileIdx);
              const readyRes = await waitForEngineFsReady(baseToUse, chosenInfoHash, fileIdx, playbackUrl, { collectDiagnostics: true });
              const ready = Boolean(readyRes && readyRes.ready);
              const guessedMime = guessMimeFromPath(filename || playbackUrl) || null;
              const diagLog = {
                playbackUrl,
                infoHash: chosenInfoHash,
                fileIdx,
                filename: filename || null,
                guessedMime,
                baseUrlKind: "public-create-relative",
                createResult: {
                  returnValue: createPayload?.returnValue,
                  json: createJson
                    ? {
                        infoHash: createJson.infoHash,
                        baseUrl: createJson.baseUrl || createJson.base_url,
                        playbackUrl: createJson.playbackUrl || createJson.playback
                      }
                    : null
                },
                statsProbe: readyRes?.diag?.statsLastStatus
                  ? {
                      success: readyRes?.diag?.statsSuccess,
                      attempts: readyRes?.diag?.statsAttempts,
                      lastStatus: readyRes?.diag?.statsLastStatus,
                      lastJson: readyRes?.diag?.statsLastJson,
                      snapshot: readyRes?.diag?.statsLastSnapshot || null
                    }
                  : null,
                rangeProbe: readyRes?.diag?.rangeLastStatus
                  ? {
                      success: readyRes?.diag?.rangeSuccess,
                      attempts: readyRes?.diag?.rangeAttempts,
                      lastStatus: readyRes?.diag?.rangeLastStatus,
                      lastBytes: readyRes?.diag?.rangeLastBytes
                    }
                  : null,
                finalReason: ready ? readyRes?.diag?.readyReason || "ready" : "timeout_or_not_ready",
                elapsedMs: readyRes?.diag?.elapsedMs ?? null
              };
              logEngineFsDebug("WebOsEngineFsResolver: EngineFS probe result", diagLog);
              if (!ready) {
                return { status: "unavailable" };
              }
              return {
                status: "success",
                stream: buildResolvedStream(stream, {
                  infoHash: chosenInfoHash,
                  fileIdx,
                  playbackUrl,
                  filename,
                  baseUrlKind: "public-create-relative",
                  publicPlaybackUrl: playbackUrl
                })
              };
            }
          }
        }

        const candidateBaseFromCreateRaw = createJson && (createJson.baseUrl || createJson.base_url || createJson.base);
        const candidateBaseFromCreate = candidateBaseFromCreateRaw ? normalizeBaseUrl(candidateBaseFromCreateRaw) : "";
        if (candidateBaseFromCreate && !isLocalHostUrl(candidateBaseFromCreate)) {
          const fileIdx = selectedFileIdx;
          const chosenInfoHash = selectedInfoHash;
          const filename = selectedFilename;
          const playbackUrl = buildPlaybackUrl(candidateBaseFromCreate, chosenInfoHash, fileIdx);
          const readyRes = await waitForEngineFsReady(candidateBaseFromCreate, chosenInfoHash, fileIdx, playbackUrl, {
            collectDiagnostics: true
          });
          const ready = Boolean(readyRes && readyRes.ready);
          const guessedMime = guessMimeFromPath(filename || playbackUrl) || null;
          const diagLog = {
            playbackUrl,
            infoHash: chosenInfoHash,
            fileIdx,
            filename: filename || null,
            guessedMime,
            baseUrlKind: "public-create-base",
            createResult: {
              returnValue: createPayload?.returnValue,
              json: createJson
                ? {
                    infoHash: createJson.infoHash,
                    baseUrl: createJson.baseUrl || createJson.base_url
                  }
                : null
            },
            statsProbe: readyRes?.diag?.statsLastStatus
              ? {
                  success: readyRes?.diag?.statsSuccess,
                  attempts: readyRes?.diag?.statsAttempts,
                  lastStatus: readyRes?.diag?.statsLastStatus,
                  lastJson: readyRes?.diag?.statsLastJson,
                  snapshot: readyRes?.diag?.statsLastSnapshot || null
                }
              : null,
            rangeProbe: readyRes?.diag?.rangeLastStatus
              ? {
                  success: readyRes?.diag?.rangeSuccess,
                  attempts: readyRes?.diag?.rangeAttempts,
                  lastStatus: readyRes?.diag?.rangeLastStatus,
                  lastBytes: readyRes?.diag?.rangeLastBytes
                }
              : null,
            finalReason: ready ? readyRes?.diag?.readyReason || "ready" : "timeout_or_not_ready",
            elapsedMs: readyRes?.diag?.elapsedMs ?? null
          };
          logEngineFsDebug("WebOsEngineFsResolver: EngineFS probe result", diagLog);
          if (!ready) return { status: "unavailable" };
          return {
            status: "success",
            stream: buildResolvedStream(stream, {
              infoHash: chosenInfoHash,
              fileIdx,
              playbackUrl,
              filename,
              baseUrlKind: "public-create-base",
              publicPlaybackUrl: playbackUrl
            })
          };
        }

        if (publicBaseCandidate) {
          const fileIdx = selectedFileIdx;
          const chosenInfoHash = selectedInfoHash;
          const filename = selectedFilename;
          const playbackUrl = buildPlaybackUrl(publicBaseCandidate, chosenInfoHash, fileIdx);
          const readyRes = await waitForEngineFsReady(publicBaseCandidate, chosenInfoHash, fileIdx, playbackUrl, {
            collectDiagnostics: true
          });
          const ready = Boolean(readyRes && readyRes.ready);
          const guessedMime = guessMimeFromPath(filename || playbackUrl) || null;
          const diagLog = {
            playbackUrl,
            infoHash: chosenInfoHash,
            fileIdx,
            filename: filename || null,
            guessedMime,
            baseUrlKind: "public-status",
            createResult: {
              returnValue: createPayload?.returnValue,
              json: createJson ? { infoHash: createJson.infoHash } : null
            },
            statsProbe: readyRes?.diag?.statsLastStatus
              ? {
                  success: readyRes?.diag?.statsSuccess,
                  attempts: readyRes?.diag?.statsAttempts,
                  lastStatus: readyRes?.diag?.statsLastStatus,
                  lastJson: readyRes?.diag?.statsLastJson,
                  snapshot: readyRes?.diag?.statsLastSnapshot || null
                }
              : null,
            rangeProbe: readyRes?.diag?.rangeLastStatus
              ? {
                  success: readyRes?.diag?.rangeSuccess,
                  attempts: readyRes?.diag?.rangeAttempts,
                  lastStatus: readyRes?.diag?.rangeLastStatus,
                  lastBytes: readyRes?.diag?.rangeLastBytes
                }
              : null,
            finalReason: ready ? readyRes?.diag?.readyReason || "ready" : "timeout_or_not_ready",
            elapsedMs: readyRes?.diag?.elapsedMs ?? null
          };
          logEngineFsDebug("WebOsEngineFsResolver: EngineFS probe result", diagLog);
          if (!ready) return { status: "unavailable" };
          return {
            status: "success",
            stream: buildResolvedStream(stream, {
              infoHash: chosenInfoHash,
              fileIdx,
              playbackUrl,
              filename,
              baseUrlKind: "public-status",
              publicPlaybackUrl: playbackUrl
            })
          };
        }

        console.warn("WebOsEngineFsResolver: no verified EngineFS playback URL", {
          infoHash: selectedInfoHash,
          fileIdx: selectedFileIdx,
          statusUrl: statusUrl || null,
          settingsBaseUrl: settingsBase || null,
          publicBaseCandidate: publicBaseCandidate || null,
          localBaseCandidate: localBaseCandidate || null,
          createResult: {
            returnValue: createPayload?.returnValue,
            statusCode: createPayload?.statusCode || null,
            proxiedPath: createPayload?.proxiedPath || null,
            json: createJson
              ? {
                  infoHash: createJson.infoHash,
                  guessedFileIdx: createJson.guessedFileIdx,
                  fileIdx: createJson.fileIdx,
                  baseUrl: createJson.baseUrl || createJson.base_url,
                  playbackUrl: createJson.playbackUrl || createJson.playback
                }
              : null
          }
        });
        return { status: "unavailable" };
      } catch (error) {
        console.warn("WebOsEngineFsResolver: resolve failed", {
          error: describeError(error),
          rawError: error || null
        });
        return {
          status: "error",
          detail: describeError(error)
        };
      }
    }
  };
}
