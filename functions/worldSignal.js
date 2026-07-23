const WORLD_SIGNAL_ROOM_ID = "afterlight-market-garden-v1";
const WORLD_SIGNAL_TYPES = Object.freeze([
  "wave",
  "invite-chess",
  "invite-chess-accepted",
  "invite-chess-declined",
]);
const WORLD_SIGNAL_TYPE_SET = new Set(WORLD_SIGNAL_TYPES);
const WORLD_SIGNAL_RESPONSE_TYPES = new Set([
  "invite-chess-accepted",
  "invite-chess-declined",
]);
const WORLD_SIGNAL_ACTION_ID = /^[A-Za-z0-9:_-]{16,160}$/;
const WORLD_SIGNAL_SESSION_ID = /^[A-Za-z0-9_-]{16,128}$/;
const WORLD_SIGNAL_UID = /^[^.#$\[\]\/]{1,128}$/;
const WORLD_SIGNAL_COLOR = /^#[0-9a-f]{6}$/i;
const WORLD_SIGNAL_PRESENCE_FRESH_MS = 15_000;
const WORLD_SIGNAL_FUTURE_TOLERANCE_MS = 5_000;
const WORLD_SIGNAL_INVITE_FRESH_MS = 60_000;
const WORLD_SIGNAL_DEFAULT_COLOR = "#f5c973";
const WORLD_SIGNAL_COOLDOWNS_MS = Object.freeze({
  wave: 3_000,
  "invite-chess": 12_000,
  "invite-chess-accepted": 3_000,
  "invite-chess-declined": 3_000,
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowedKeys) {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function safeWorldSignalUid(value) {
  if (typeof value !== "string" || value.trim() !== value) return null;
  return WORLD_SIGNAL_UID.test(value) ? value : null;
}

function safeWorldSignalActionId(value) {
  return typeof value === "string" && WORLD_SIGNAL_ACTION_ID.test(value)
    ? value
    : null;
}

function safeWorldSignalSessionId(value) {
  return typeof value === "string" && WORLD_SIGNAL_SESSION_ID.test(value)
    ? value
    : null;
}

function normalizeWorldSignalRequest(value, callerUidValue) {
  const callerUid = safeWorldSignalUid(callerUidValue);
  const toUid = safeWorldSignalUid(value?.toUid);
  const type = typeof value?.type === "string" ? value.type : null;
  const actionId = safeWorldSignalActionId(value?.actionId);
  const isResponse = WORLD_SIGNAL_RESPONSE_TYPES.has(type);
  const allowedKeys = isResponse
    ? ["room", "toUid", "type", "actionId", "replyToActionId"]
    : ["room", "toUid", "type", "actionId"];

  if (
    !callerUid ||
    !isRecord(value) ||
    !hasOnlyKeys(value, allowedKeys) ||
    value.room !== WORLD_SIGNAL_ROOM_ID ||
    !toUid ||
    toUid === callerUid ||
    !WORLD_SIGNAL_TYPE_SET.has(type) ||
    !actionId
  ) {
    return { ok: false };
  }

  const action = {
    room: WORLD_SIGNAL_ROOM_ID,
    fromUid: callerUid,
    toUid,
    type,
    actionId,
  };
  if (isResponse) {
    const replyToActionId = safeWorldSignalActionId(value.replyToActionId);
    if (!replyToActionId) return { ok: false };
    action.replyToActionId = replyToActionId;
  }
  return { ok: true, action };
}

function normalizedDisplayName(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, 30) : null;
}

// Both inputs must be loaded by trusted server code. No display field is
// accepted in normalizeWorldSignalRequest, so a caller cannot impersonate the
// recipient or choose the payload written to somebody else's inbox.
function trustedWorldSignalDisplay({ presence, profile } = {}) {
  const profileRecord = isRecord(profile) ? profile : {};
  const presenceRecord = isRecord(presence) ? presence : {};
  const fromName =
    normalizedDisplayName(profileRecord.displayName) ||
    normalizedDisplayName(profileRecord.name) ||
    normalizedDisplayName(profileRecord.username) ||
    normalizedDisplayName(presenceRecord.name);
  if (!fromName) return null;

  const fromColor = WORLD_SIGNAL_COLOR.test(presenceRecord.color)
    ? presenceRecord.color.toLowerCase()
    : WORLD_SIGNAL_COLOR.test(profileRecord.color)
      ? profileRecord.color.toLowerCase()
      : WORLD_SIGNAL_DEFAULT_COLOR;
  return { fromName, fromColor };
}

function knownBooleanProjectionValue(value) {
  return value === true || value === false || value === null;
}

function livePresence(value, membership, now) {
  if (
    !isRecord(value) ||
    !isRecord(membership) ||
    !Number.isSafeInteger(now) ||
    now <= 0
  ) {
    return null;
  }
  const sessionId = safeWorldSignalSessionId(value.sessionId);
  const membershipSessionId = safeWorldSignalSessionId(membership.sessionId);
  const lastUpdate = Number(value.lastUpdate);
  if (
    !sessionId ||
    membershipSessionId !== sessionId ||
    !Number.isFinite(lastUpdate) ||
    lastUpdate < now - WORLD_SIGNAL_PRESENCE_FRESH_MS ||
    lastUpdate > now + WORLD_SIGNAL_FUTURE_TOLERANCE_MS
  ) {
    return null;
  }
  return { sessionId, lastUpdate };
}

// Grants only when every server read completed, both current presence sessions
// are projected to one another, and block/deletion state is explicitly known.
function reciprocalWorldSignalPresenceDecision(state, now) {
  if (!isRecord(state) || state.complete !== true) {
    return { allowed: false, reason: "state-unavailable" };
  }
  const blockState = isRecord(state.blockState) ? state.blockState : {};
  const deletionState = isRecord(state.deletionState)
    ? state.deletionState
    : {};
  if (
    blockState.complete !== true ||
    deletionState.complete !== true ||
    !knownBooleanProjectionValue(blockState.fromBlockedTo) ||
    !knownBooleanProjectionValue(blockState.toBlockedFrom) ||
    !knownBooleanProjectionValue(deletionState.fromDeleted) ||
    !knownBooleanProjectionValue(deletionState.toDeleted)
  ) {
    return { allowed: false, reason: "state-unavailable" };
  }
  if (deletionState.fromDeleted === true || deletionState.toDeleted === true) {
    return { allowed: false, reason: "account-unavailable" };
  }
  if (blockState.fromBlockedTo === true || blockState.toBlockedFrom === true) {
    return { allowed: false, reason: "pair-unavailable" };
  }

  const fromPresence = livePresence(
    state.fromPresence,
    state.fromMembership,
    now,
  );
  const toPresence = livePresence(
    state.toPresence,
    state.toMembership,
    now,
  );
  if (!fromPresence || !toPresence) {
    return { allowed: false, reason: "not-co-present" };
  }
  if (
    state.fromViewSession !== toPresence.sessionId ||
    state.toViewSession !== fromPresence.sessionId
  ) {
    return { allowed: false, reason: "not-co-present" };
  }
  return {
    allowed: true,
    reason: "co-present",
    fromSessionId: fromPresence.sessionId,
    toSessionId: toPresence.sessionId,
  };
}

function normalizeWorldSignalRate(value, now) {
  if (value === null || value === undefined) return null;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "actionId",
      "type",
      "replyToActionId",
      "at",
      "delivered",
    ]) ||
    !safeWorldSignalActionId(value.actionId) ||
    !WORLD_SIGNAL_TYPE_SET.has(value.type) ||
    !Number.isSafeInteger(value.at) ||
    value.at <= 0 ||
    value.at > now + WORLD_SIGNAL_FUTURE_TOLERANCE_MS ||
    typeof value.delivered !== "boolean"
  ) {
    return undefined;
  }
  const response = WORLD_SIGNAL_RESPONSE_TYPES.has(value.type);
  if (
    response !== Object.prototype.hasOwnProperty.call(value, "replyToActionId") ||
    (response && !safeWorldSignalActionId(value.replyToActionId))
  ) {
    return undefined;
  }
  return {
    actionId: value.actionId,
    type: value.type,
    ...(response ? { replyToActionId: value.replyToActionId } : {}),
    at: value.at,
    delivered: value.delivered,
  };
}

function sameWorldSignalAction(rate, action) {
  return Boolean(
    rate &&
      rate.actionId === action.actionId &&
      rate.type === action.type &&
      (rate.replyToActionId || null) === (action.replyToActionId || null),
  );
}

function worldSignalRateDecision(rateState, action, now) {
  if (!isRecord(rateState) || rateState.loaded !== true) {
    return { allowed: false, code: "state-unavailable" };
  }
  const rate = normalizeWorldSignalRate(rateState.value, now);
  if (rate === undefined) {
    return { allowed: false, code: "state-unavailable" };
  }
  if (rate?.actionId === action.actionId) {
    if (!sameWorldSignalAction(rate, action)) {
      return { allowed: false, code: "action-conflict" };
    }
    return rate.delivered
      ? { allowed: true, duplicate: true, resume: false, rate }
      : { allowed: true, duplicate: false, resume: true, rate };
  }
  if (rate) {
    const cooldownMs = Math.max(
      WORLD_SIGNAL_COOLDOWNS_MS[rate.type],
      WORLD_SIGNAL_COOLDOWNS_MS[action.type],
    );
    const retryAfterMs = Math.max(0, rate.at + cooldownMs - now);
    if (retryAfterMs > 0) {
      return { allowed: false, code: "cooldown", retryAfterMs };
    }
  }
  return { allowed: true, duplicate: false, resume: false, rate };
}

function validPendingWorldSignalInvite(
  value,
  { inviterUid, inviteeUid, replyToActionId, room },
  now,
) {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "room",
      "type",
      "fromUid",
      "fromName",
      "fromColor",
      "actionId",
      "at",
    ]) ||
    value.room !== room ||
    value.type !== "invite-chess" ||
    value.fromUid !== inviterUid ||
    inviterUid === inviteeUid ||
    value.actionId !== replyToActionId ||
    !safeWorldSignalActionId(value.actionId) ||
    normalizedDisplayName(value.fromName) !== value.fromName ||
    !WORLD_SIGNAL_COLOR.test(value.fromColor) ||
    !Number.isSafeInteger(value.at) ||
    value.at < now - WORLD_SIGNAL_INVITE_FRESH_MS ||
    value.at > now + WORLD_SIGNAL_FUTURE_TOLERANCE_MS
  ) {
    return false;
  }
  return true;
}

function worldSignalRateValue(action, now, delivered = true) {
  return {
    actionId: action.actionId,
    type: action.type,
    ...(action.replyToActionId
      ? { replyToActionId: action.replyToActionId }
      : {}),
    at: now,
    delivered,
  };
}

// Intended for a transaction at worldSignalRateLimits/{fromUid}/{toUid}.
// A pending reservation makes a crash repairable without growing an action log.
function reserveWorldSignalRate(rateState, action, now) {
  const decision = worldSignalRateDecision(rateState, action, now);
  if (!decision.allowed) {
    return {
      ok: false,
      allowed: false,
      code: decision.code,
      ...(decision.retryAfterMs
        ? { retryAfterMs: decision.retryAfterMs }
        : {}),
    };
  }
  if (decision.duplicate) {
    return {
      ok: true,
      applied: false,
      duplicate: true,
      resume: false,
      reservation: decision.rate,
    };
  }
  if (decision.resume) {
    return {
      ok: true,
      applied: false,
      duplicate: false,
      resume: true,
      reservation: decision.rate,
    };
  }
  return {
    ok: true,
    applied: true,
    duplicate: false,
    resume: false,
    reservation: worldSignalRateValue(action, now, false),
  };
}

// A failed post-reservation authority check may clear only its own unfinished
// reservation. Returning undefined tells an RTDB transaction to abort.
function releaseWorldSignalReservation(value, action, now) {
  const rate = normalizeWorldSignalRate(value, now);
  if (
    rate &&
    rate.delivered === false &&
    sameWorldSignalAction(rate, action)
  ) {
    return null;
  }
  return undefined;
}

function worldSignalPayload(action, display, now) {
  return {
    room: action.room,
    type: action.type,
    fromUid: action.fromUid,
    fromName: display.fromName,
    fromColor: display.fromColor,
    actionId: action.actionId,
    ...(action.replyToActionId
      ? { replyToActionId: action.replyToActionId }
      : {}),
    at: now,
  };
}

function worldSignalPaths(action) {
  return {
    inbox: `signals/${action.toUid}/${action.fromUid}`,
    pendingInvite: `signals/${action.fromUid}/${action.toUid}`,
    rate: `worldSignalRateLimits/${action.fromUid}/${action.toUid}`,
  };
}

function worldSignalRateLimitDeletionUpdates(value, uidValue) {
  const uid = safeWorldSignalUid(uidValue);
  if (!uid) return {};
  const rateLimits = isRecord(value) ? value : {};
  const updates = { [`worldSignalRateLimits/${uid}`]: null };
  Object.entries(rateLimits).forEach(([fromUidValue, recipients]) => {
    const fromUid = safeWorldSignalUid(fromUidValue);
    if (
      fromUid &&
      fromUid !== uid &&
      isRecord(recipients) &&
      Object.prototype.hasOwnProperty.call(recipients, uid)
    ) {
      updates[`worldSignalRateLimits/${fromUid}/${uid}`] = null;
    }
  });
  return updates;
}

function planWorldSignal({ action, authorityState, rateState, pendingInviteState, now } = {}) {
  const isResponse = WORLD_SIGNAL_RESPONSE_TYPES.has(action?.type);
  const allowedActionKeys = isResponse
    ? ["room", "fromUid", "toUid", "type", "actionId", "replyToActionId"]
    : ["room", "fromUid", "toUid", "type", "actionId"];
  if (
    !isRecord(action) ||
    !hasOnlyKeys(action, allowedActionKeys) ||
    !Number.isSafeInteger(now) ||
    now <= 0 ||
    normalizeWorldSignalRequest(
      {
        room: action.room,
        toUid: action.toUid,
        type: action.type,
        actionId: action.actionId,
        ...(action.replyToActionId
          ? { replyToActionId: action.replyToActionId }
          : {}),
      },
      action.fromUid,
    ).ok !== true
  ) {
    return { ok: false, code: "invalid-argument", updates: {} };
  }

  const presenceDecision = reciprocalWorldSignalPresenceDecision(
    authorityState,
    now,
  );
  if (!presenceDecision.allowed) {
    return {
      ok: false,
      code: "failed-precondition",
      reason: presenceDecision.reason,
      updates: {},
    };
  }

  const rateDecision = worldSignalRateDecision(rateState, action, now);
  if (!rateDecision.allowed) {
    return {
      ok: false,
      code:
        rateDecision.code === "cooldown"
          ? "resource-exhausted"
          : rateDecision.code === "action-conflict"
            ? "aborted"
            : "failed-precondition",
      reason: rateDecision.code,
      ...(rateDecision.retryAfterMs
        ? { retryAfterMs: rateDecision.retryAfterMs }
        : {}),
      updates: {},
    };
  }
  if (rateDecision.duplicate) {
    return { ok: true, applied: false, duplicate: true, updates: {} };
  }

  if (isResponse) {
    if (
      !isRecord(pendingInviteState) ||
      pendingInviteState.loaded !== true ||
      !validPendingWorldSignalInvite(
        pendingInviteState.value,
        {
          inviterUid: action.toUid,
          inviteeUid: action.fromUid,
          replyToActionId: action.replyToActionId,
          room: action.room,
        },
        now,
      )
    ) {
      return {
        ok: false,
        code: "failed-precondition",
        reason: "invite-unavailable",
        updates: {},
      };
    }
  }

  const display = trustedWorldSignalDisplay({
    presence: authorityState.fromPresence,
    profile: authorityState.fromProfile,
  });
  if (!display) {
    return {
      ok: false,
      code: "failed-precondition",
      reason: "sender-unavailable",
      updates: {},
    };
  }

  const paths = worldSignalPaths(action);
  const acceptedAt = rateDecision.resume ? rateDecision.rate.at : now;
  const signal = worldSignalPayload(action, display, acceptedAt);
  const rate = worldSignalRateValue(action, acceptedAt, true);
  const updates = {
    [paths.inbox]: signal,
    [paths.rate]: rate,
  };
  if (isResponse) updates[paths.pendingInvite] = null;
  return {
    ok: true,
    applied: true,
    duplicate: false,
    signal,
    rate,
    updates,
  };
}

module.exports = {
  WORLD_SIGNAL_COOLDOWNS_MS,
  WORLD_SIGNAL_FUTURE_TOLERANCE_MS,
  WORLD_SIGNAL_INVITE_FRESH_MS,
  WORLD_SIGNAL_PRESENCE_FRESH_MS,
  WORLD_SIGNAL_RESPONSE_TYPES,
  WORLD_SIGNAL_ROOM_ID,
  WORLD_SIGNAL_TYPES,
  livePresence,
  normalizeWorldSignalRequest,
  planWorldSignal,
  reciprocalWorldSignalPresenceDecision,
  releaseWorldSignalReservation,
  reserveWorldSignalRate,
  safeWorldSignalActionId,
  safeWorldSignalSessionId,
  safeWorldSignalUid,
  sameWorldSignalAction,
  trustedWorldSignalDisplay,
  validPendingWorldSignalInvite,
  worldSignalPaths,
  worldSignalRateDecision,
  worldSignalRateLimitDeletionUpdates,
  worldSignalRateValue,
};
