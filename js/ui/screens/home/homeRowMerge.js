export function mergeRefreshedHomeRows(
  existingRows = [],
  fetchedRows = [],
  configuredCatalogKeys = null,
  { background = false } = {}
) {
  const fetched = Array.isArray(fetchedRows) ? fetchedRows : [];
  if (!background) {
    return fetched;
  }

  const existing = Array.isArray(existingRows) ? existingRows : [];
  const configured =
    configuredCatalogKeys && typeof configuredCatalogKeys.has === "function"
      ? configuredCatalogKeys
      : Array.isArray(configuredCatalogKeys)
        ? new Set(configuredCatalogKeys.map((key) => String(key)))
        : null;
  const getRowKey = (row) => String(row?.homeCatalogKey || "").trim();
  const isRetainable = (row) => {
    const key = getRowKey(row);
    if (!key || row?.rowKind === "collection" || !configured) {
      return true;
    }
    return configured.has(key);
  };

  const merged = [];
  const positionsByKey = new Map();
  const addRow = (row) => {
    const key = getRowKey(row);
    if (!key) {
      merged.push(row);
      return;
    }
    const existingPosition = positionsByKey.get(key);
    if (existingPosition === undefined) {
      positionsByKey.set(key, merged.length);
      merged.push(row);
      return;
    }
    merged[existingPosition] = row;
  };

  existing.filter(isRetainable).forEach(addRow);
  fetched.forEach(addRow);
  return merged;
}
