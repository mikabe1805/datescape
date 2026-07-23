const RECEIPT_MODES = new Set(["resonance", "social"]);
const MAX_RECEIPTS = 24;

function safeText(value, maxLength) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

export function sharedMomentReceiptId(mode, matchId) {
  const safeMode = RECEIPT_MODES.has(mode) ? mode : null;
  const safeMatchId = safeText(matchId, 128);
  return safeMode && safeMatchId ? `${safeMode}:${safeMatchId}` : null;
}

function safeReceipt(value) {
  if (!value || typeof value !== "object") return null;
  const id = sharedMomentReceiptId(value.mode, value.matchId);
  const completedAt = Number(value.completedAt);
  if (!id || !Number.isFinite(completedAt) || completedAt <= 0) return null;
  return {
    id,
    mode: value.mode,
    matchId: safeText(value.matchId, 128),
    completedAt,
  };
}

export function hydrateSharedMomentReceipts(values) {
  if (!Array.isArray(values)) return [];
  const receipts = new Map();
  values.forEach((value) => {
    const receipt = safeReceipt(value);
    if (receipt) receipts.set(receipt.id, receipt);
  });
  return [...receipts.values()]
    .sort((first, second) => first.completedAt - second.completedAt)
    .slice(-MAX_RECEIPTS);
}

export function appendSharedMomentReceipt(values, value) {
  const current = hydrateSharedMomentReceipts(values);
  const receipt = safeReceipt(value);
  if (!receipt || current.some((entry) => entry.id === receipt.id)) {
    return current;
  }
  return [...current, receipt].slice(-MAX_RECEIPTS);
}
