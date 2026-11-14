export function isConfirmedAutoSyncNoFit({
  evaluatedReferences = 0,
  ambiguousReferences = 0,
  requestedReferences = 0
} = {}) {
  const evaluated = Math.max(0, Math.trunc(Number(evaluatedReferences) || 0));
  const ambiguous = Math.max(0, Math.trunc(Number(ambiguousReferences) || 0));
  const requested = Math.max(0, Math.trunc(Number(requestedReferences) || 0));
  return evaluated > 0 && ambiguous === evaluated && evaluated >= requested;
}
