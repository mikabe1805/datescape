const SAFETY_REPORT_COLLECTION = "reports";
const SAFETY_REPORT_RATE_LIMIT_COLLECTION = "safetyReportRateLimits";
const SAFETY_REPORT_RATE_LIMIT_MAX = 10;
const SAFETY_REPORT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const SAFETY_REPORT_REASON_MAX_LENGTH = 1000;
const SAFETY_REPORT_PHOTO_URL_MAX_LENGTH = 2048;
const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowedKeys) {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function normalizeReason(value) {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (
    typeof value !== "string" ||
    value.length > SAFETY_REPORT_REASON_MAX_LENGTH
  ) {
    return { ok: false };
  }
  const reason = value.trim();
  return { ok: true, value: reason || null };
}

function normalizeHttpsPhotoUrl(value) {
  const hasControlCharacter =
    typeof value === "string" &&
    [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint <= 31 || codePoint === 127;
    });
  if (
    typeof value !== "string" ||
    !value ||
    value.length > SAFETY_REPORT_PHOTO_URL_MAX_LENGTH ||
    value.trim() !== value ||
    hasControlCharacter
  ) {
    return null;
  }
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return value;
}

function normalizeSafetyReportRequest(value, reporterUid) {
  if (
    !isRecord(value) ||
    typeof reporterUid !== "string" ||
    !SAFE_UID.test(reporterUid) ||
    typeof value.reportedUserId !== "string" ||
    !SAFE_UID.test(value.reportedUserId) ||
    value.reportedUserId === reporterUid ||
    !["user", "photo"].includes(value.type)
  ) {
    return { ok: false };
  }

  const allowedKeys =
    value.type === "photo"
      ? ["type", "reportedUserId", "reason", "photoUrl"]
      : ["type", "reportedUserId", "reason"];
  if (!hasOnlyKeys(value, allowedKeys)) return { ok: false };

  const reason = normalizeReason(value.reason);
  if (!reason.ok) return { ok: false };

  const report = {
    type: value.type,
    reportedUserId: value.reportedUserId,
    reason: reason.value,
  };
  if (value.type === "photo") {
    const photoUrl = normalizeHttpsPhotoUrl(value.photoUrl);
    if (!photoUrl) return { ok: false };
    report.photoUrl = photoUrl;
  }
  return { ok: true, report };
}

function reserveSafetyReportRateWindow(value, now) {
  if (!Number.isSafeInteger(now) || now <= 0) {
    return { allowed: false, acceptedAt: [] };
  }
  const cutoff = now - SAFETY_REPORT_RATE_LIMIT_WINDOW_MS;
  const acceptedAt = (Array.isArray(value?.acceptedAt) ? value.acceptedAt : [])
    .filter(
      (entry) =>
        Number.isSafeInteger(entry) &&
        entry > cutoff &&
        entry <= now + 60_000,
    )
    .sort((first, second) => first - second);
  if (acceptedAt.length >= SAFETY_REPORT_RATE_LIMIT_MAX) {
    return {
      allowed: false,
      acceptedAt: acceptedAt.slice(-SAFETY_REPORT_RATE_LIMIT_MAX),
    };
  }
  return { allowed: true, acceptedAt: [...acceptedAt, now] };
}

module.exports = {
  SAFETY_REPORT_COLLECTION,
  SAFETY_REPORT_PHOTO_URL_MAX_LENGTH,
  SAFETY_REPORT_RATE_LIMIT_COLLECTION,
  SAFETY_REPORT_RATE_LIMIT_MAX,
  SAFETY_REPORT_RATE_LIMIT_WINDOW_MS,
  SAFETY_REPORT_REASON_MAX_LENGTH,
  normalizeHttpsPhotoUrl,
  normalizeSafetyReportRequest,
  reserveSafetyReportRateWindow,
};
