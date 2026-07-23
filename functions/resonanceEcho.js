const { createHash } = require("node:crypto");

const RESONANCE_ECHO_VERSION = 1;
const RESONANCE_ECHO_WAIT_MS = 90_000;
const RESONANCE_ECHO_ROOM_ID = "afterlight-market-garden-v1";
const RESONANCE_ECHO_QUEST_ID = "afterlight-sunthread";
const RESONANCE_ECHO_OBJECTIVE_ID = "resonate-together";
const RESONANCE_ECHO_MODE = "echo";
const MAX_PROCESSED_ACTION_IDS = 64;

const SAFE_UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_ACTION_ID_PATTERN = /^[A-Za-z0-9:_-]{1,160}$/;
const SAFE_ATTEMPT_ID_PATTERN = /^resonance-echo-attempt:[a-f0-9]{64}$/;
const SAFE_RECEIPT_ID_PATTERN = /^resonance-echo-receipt:[a-f0-9]{64}$/;
const SAFE_PROCESSED_ACTION_PATTERN = /^resonance-echo-action:[a-f0-9]{64}$/;
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function safePositiveTime(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function safeUid(value) {
  return typeof value === "string" &&
    SAFE_UID_PATTERN.test(value) &&
    !RESERVED_KEYS.has(value)
    ? value
    : null;
}

function safeActionId(value) {
  return typeof value === "string" && SAFE_ACTION_ID_PATTERN.test(value)
    ? value
    : null;
}

function hashIdentity(parts) {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

function attemptIdFor(uid, startedAt) {
  return `resonance-echo-attempt:${hashIdentity([
    RESONANCE_ECHO_VERSION,
    uid,
    RESONANCE_ECHO_ROOM_ID,
    RESONANCE_ECHO_QUEST_ID,
    startedAt,
  ])}`;
}

function receiptIdFor({ attemptId, uid, startedAt, completedAt }) {
  return `resonance-echo-receipt:${hashIdentity([
    RESONANCE_ECHO_VERSION,
    attemptId,
    uid,
    RESONANCE_ECHO_ROOM_ID,
    RESONANCE_ECHO_QUEST_ID,
    RESONANCE_ECHO_OBJECTIVE_ID,
    startedAt,
    completedAt,
  ])}`;
}

function processedActionKey(kind, uid, actionId) {
  return `resonance-echo-action:${hashIdentity([kind, uid, actionId])}`;
}

function uniqueProcessedActionIds(values) {
  if (!Array.isArray(values)) return [];
  const result = [];
  const seen = new Set();
  values.forEach((value) => {
    if (
      typeof value !== "string" ||
      !SAFE_PROCESSED_ACTION_PATTERN.test(value) ||
      seen.has(value)
    ) {
      return;
    }
    seen.add(value);
    result.push(value);
  });
  return result.slice(-MAX_PROCESSED_ACTION_IDS);
}

function createResonanceEchoState() {
  return {
    version: RESONANCE_ECHO_VERSION,
    uid: null,
    roomId: RESONANCE_ECHO_ROOM_ID,
    questId: RESONANCE_ECHO_QUEST_ID,
    attemptId: null,
    startedAt: null,
    maturesAt: null,
    completedAt: null,
    processedActionIds: [],
  };
}

function normalizeResonanceEchoState(value, now = Date.now()) {
  const source = isRecord(value) ? value : {};
  const at = safePositiveTime(now);
  const uid = safeUid(source.uid);
  const startedAt = safePositiveTime(source.startedAt);
  if (
    !at ||
    !uid ||
    source.roomId !== RESONANCE_ECHO_ROOM_ID ||
    source.questId !== RESONANCE_ECHO_QUEST_ID ||
    !startedAt ||
    startedAt > at
  ) {
    return createResonanceEchoState();
  }

  const maturesAt = startedAt + RESONANCE_ECHO_WAIT_MS;
  if (!Number.isSafeInteger(maturesAt)) return createResonanceEchoState();
  const attemptId = attemptIdFor(uid, startedAt);
  if (
    typeof source.attemptId !== "string" ||
    !SAFE_ATTEMPT_ID_PATTERN.test(source.attemptId) ||
    source.attemptId !== attemptId
  ) {
    return createResonanceEchoState();
  }

  const suppliedCompletedAt = safePositiveTime(source.completedAt);
  const completedAt =
    suppliedCompletedAt &&
    suppliedCompletedAt >= maturesAt &&
    suppliedCompletedAt <= at
      ? suppliedCompletedAt
      : null;

  return {
    version: RESONANCE_ECHO_VERSION,
    uid,
    roomId: RESONANCE_ECHO_ROOM_ID,
    questId: RESONANCE_ECHO_QUEST_ID,
    attemptId,
    startedAt,
    maturesAt,
    completedAt,
    processedActionIds: uniqueProcessedActionIds(source.processedActionIds),
  };
}

function validateBinding(value, requireActionId) {
  if (!isRecord(value)) {
    return {
      ok: false,
      code: "invalid-request",
      message: "Provide a Resonance Echo request.",
    };
  }
  const uid = safeUid(value.uid);
  if (!uid) {
    return {
      ok: false,
      code: "invalid-uid",
      message: "uid must be a safe 1-128 character player identifier.",
    };
  }
  if (value.roomId !== RESONANCE_ECHO_ROOM_ID) {
    return {
      ok: false,
      code: "invalid-room",
      message: "Resonance Echo is not available in this room.",
    };
  }
  if (value.questId !== RESONANCE_ECHO_QUEST_ID) {
    return {
      ok: false,
      code: "invalid-quest",
      message: "Resonance Echo is not available for this quest.",
    };
  }
  const actionId = requireActionId ? safeActionId(value.actionId) : null;
  if (requireActionId && !actionId) {
    return {
      ok: false,
      code: "invalid-action-id",
      message:
        "actionId must be 1-160 letters, numbers, colons, underscores, or dashes.",
    };
  }
  return {
    ok: true,
    binding: {
      uid,
      roomId: RESONANCE_ECHO_ROOM_ID,
      questId: RESONANCE_ECHO_QUEST_ID,
      ...(actionId ? { actionId } : {}),
    },
  };
}

function sameBinding(state, binding) {
  return (
    state.uid === binding.uid &&
    state.roomId === binding.roomId &&
    state.questId === binding.questId
  );
}

function publicResonanceEchoState(value, now = Date.now()) {
  const at = safePositiveTime(now) || 1;
  const state = normalizeResonanceEchoState(value, at);
  let phase = "idle";
  if (state.completedAt) phase = "completed";
  else if (state.startedAt && at >= state.maturesAt) phase = "mature";
  else if (state.startedAt) phase = "waiting";

  return {
    version: RESONANCE_ECHO_VERSION,
    roomId: RESONANCE_ECHO_ROOM_ID,
    questId: RESONANCE_ECHO_QUEST_ID,
    attemptId: state.attemptId,
    phase,
    startedAt: state.startedAt,
    maturesAt: state.maturesAt,
    completedAt: state.completedAt,
    remainingMs:
      phase === "waiting" ? Math.max(0, state.maturesAt - at) : 0,
    canComplete: phase === "mature",
    serverNow: at,
  };
}

function failure(state, now, code, message, extra = {}) {
  return {
    ok: false,
    applied: false,
    duplicate: false,
    state,
    echo: publicResonanceEchoState(state, now),
    code,
    message,
    ...extra,
  };
}

function receiptFromNormalizedState(state) {
  if (!state.uid || !state.attemptId || !state.completedAt) return null;
  const receipt = {
    id: null,
    attemptId: state.attemptId,
    uid: state.uid,
    roomId: RESONANCE_ECHO_ROOM_ID,
    questId: RESONANCE_ECHO_QUEST_ID,
    objectiveId: RESONANCE_ECHO_OBJECTIVE_ID,
    mode: RESONANCE_ECHO_MODE,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    verifiedAt: state.completedAt,
  };
  receipt.id = receiptIdFor(receipt);
  return receipt;
}

function resonanceEchoReceipt(value, now = Date.now()) {
  return receiptFromNormalizedState(normalizeResonanceEchoState(value, now));
}

function startResonanceEcho(value, input, now = Date.now()) {
  const at = safePositiveTime(now);
  let state = normalizeResonanceEchoState(value, at || 1);
  const validated = validateBinding(input, true);
  if (!validated.ok) {
    return failure(state, at || 1, validated.code, validated.message);
  }
  if (!at) {
    return failure(state, 1, "invalid-time", "Use a positive server timestamp.");
  }
  const binding = validated.binding;
  const actionKey = processedActionKey("start", binding.uid, binding.actionId);
  if (state.processedActionIds.includes(actionKey)) {
    return {
      ok: true,
      applied: false,
      duplicate: true,
      state,
      echo: publicResonanceEchoState(state, at),
    };
  }
  if (state.uid && !sameBinding(state, binding)) {
    return failure(
      state,
      at,
      "binding-mismatch",
      "This Resonance Echo attempt belongs to another player or route.",
    );
  }
  if (state.startedAt) {
    return failure(
      state,
      at,
      state.completedAt ? "already-completed" : "already-started",
      state.completedAt
        ? "This Resonance Echo attempt is already complete."
        : "A Resonance Echo wait is already active.",
    );
  }

  state = {
    version: RESONANCE_ECHO_VERSION,
    uid: binding.uid,
    roomId: RESONANCE_ECHO_ROOM_ID,
    questId: RESONANCE_ECHO_QUEST_ID,
    attemptId: attemptIdFor(binding.uid, at),
    startedAt: at,
    maturesAt: at + RESONANCE_ECHO_WAIT_MS,
    completedAt: null,
    processedActionIds: [actionKey],
  };
  return {
    ok: true,
    applied: true,
    duplicate: false,
    state,
    echo: publicResonanceEchoState(state, at),
  };
}

function pollResonanceEcho(value, input, now = Date.now()) {
  const at = safePositiveTime(now);
  const state = normalizeResonanceEchoState(value, at || 1);
  const validated = validateBinding(input, false);
  if (!validated.ok) {
    return failure(state, at || 1, validated.code, validated.message);
  }
  if (!at) {
    return failure(state, 1, "invalid-time", "Use a positive server timestamp.");
  }
  if (state.uid && !sameBinding(state, validated.binding)) {
    return failure(
      state,
      at,
      "binding-mismatch",
      "This Resonance Echo attempt belongs to another player or route.",
    );
  }
  return {
    ok: true,
    applied: false,
    duplicate: false,
    state,
    echo: publicResonanceEchoState(state, at),
  };
}

function completeResonanceEcho(value, input, now = Date.now()) {
  const at = safePositiveTime(now);
  let state = normalizeResonanceEchoState(value, at || 1);
  const validated = validateBinding(input, true);
  if (!validated.ok) {
    return failure(state, at || 1, validated.code, validated.message);
  }
  if (!at) {
    return failure(state, 1, "invalid-time", "Use a positive server timestamp.");
  }
  const binding = validated.binding;
  const actionKey = processedActionKey("complete", binding.uid, binding.actionId);
  if (state.processedActionIds.includes(actionKey)) {
    return {
      ok: true,
      applied: false,
      duplicate: true,
      alreadyCompleted: Boolean(state.completedAt),
      state,
      echo: publicResonanceEchoState(state, at),
      receipt: receiptFromNormalizedState(state),
    };
  }
  if (!state.uid) {
    return failure(
      state,
      at,
      "not-started",
      "Start a Resonance Echo wait before completing it.",
    );
  }
  if (!sameBinding(state, binding)) {
    return failure(
      state,
      at,
      "binding-mismatch",
      "This Resonance Echo attempt belongs to another player or route.",
    );
  }
  if (state.completedAt) {
    return {
      ok: true,
      applied: false,
      duplicate: false,
      alreadyCompleted: true,
      state,
      echo: publicResonanceEchoState(state, at),
      receipt: receiptFromNormalizedState(state),
    };
  }
  if (at < state.maturesAt) {
    return failure(
      state,
      at,
      "echo-wait-active",
      "Resonance Echo is still listening for a nearby duet partner.",
      { retryAt: state.maturesAt },
    );
  }

  state = {
    ...state,
    completedAt: at,
    processedActionIds: uniqueProcessedActionIds([
      ...state.processedActionIds,
      actionKey,
    ]),
  };
  return {
    ok: true,
    applied: true,
    duplicate: false,
    alreadyCompleted: false,
    state,
    echo: publicResonanceEchoState(state, at),
    receipt: receiptFromNormalizedState(state),
  };
}

function normalizeResonanceEchoReceipt(value, expected = {}) {
  const keys = [
    "id",
    "attemptId",
    "uid",
    "roomId",
    "questId",
    "objectiveId",
    "mode",
    "startedAt",
    "completedAt",
    "verifiedAt",
  ];
  if (!hasExactKeys(value, keys)) return null;
  const uid = safeUid(value.uid);
  const startedAt = safePositiveTime(value.startedAt);
  const completedAt = safePositiveTime(value.completedAt);
  const verifiedAt = safePositiveTime(value.verifiedAt);
  if (
    !uid ||
    value.roomId !== RESONANCE_ECHO_ROOM_ID ||
    value.questId !== RESONANCE_ECHO_QUEST_ID ||
    value.objectiveId !== RESONANCE_ECHO_OBJECTIVE_ID ||
    value.mode !== RESONANCE_ECHO_MODE ||
    !startedAt ||
    !completedAt ||
    verifiedAt !== completedAt ||
    completedAt < startedAt + RESONANCE_ECHO_WAIT_MS
  ) {
    return null;
  }
  const attemptId = attemptIdFor(uid, startedAt);
  if (
    typeof value.attemptId !== "string" ||
    !SAFE_ATTEMPT_ID_PATTERN.test(value.attemptId) ||
    value.attemptId !== attemptId
  ) {
    return null;
  }
  const receipt = {
    id: value.id,
    attemptId,
    uid,
    roomId: RESONANCE_ECHO_ROOM_ID,
    questId: RESONANCE_ECHO_QUEST_ID,
    objectiveId: RESONANCE_ECHO_OBJECTIVE_ID,
    mode: RESONANCE_ECHO_MODE,
    startedAt,
    completedAt,
    verifiedAt,
  };
  if (
    typeof receipt.id !== "string" ||
    !SAFE_RECEIPT_ID_PATTERN.test(receipt.id) ||
    receipt.id !== receiptIdFor(receipt)
  ) {
    return null;
  }
  if (
    Object.prototype.hasOwnProperty.call(expected, "uid") &&
    safeUid(expected.uid) !== uid
  ) {
    return null;
  }
  if (
    Object.prototype.hasOwnProperty.call(expected, "roomId") &&
    expected.roomId !== RESONANCE_ECHO_ROOM_ID
  ) {
    return null;
  }
  if (
    Object.prototype.hasOwnProperty.call(expected, "questId") &&
    expected.questId !== RESONANCE_ECHO_QUEST_ID
  ) {
    return null;
  }
  return receipt;
}

module.exports = {
  MAX_PROCESSED_ACTION_IDS,
  RESONANCE_ECHO_MODE,
  RESONANCE_ECHO_OBJECTIVE_ID,
  RESONANCE_ECHO_QUEST_ID,
  RESONANCE_ECHO_ROOM_ID,
  RESONANCE_ECHO_VERSION,
  RESONANCE_ECHO_WAIT_MS,
  completeResonanceEcho,
  createResonanceEchoState,
  normalizeResonanceEchoReceipt,
  normalizeResonanceEchoState,
  pollResonanceEcho,
  publicResonanceEchoState,
  resonanceEchoReceipt,
  startResonanceEcho,
  validateResonanceEchoBinding: validateBinding,
};
