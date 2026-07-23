import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

export const RESONANCE_ECHO_VERSION = 1;
export const RESONANCE_ECHO_WAIT_MS = 90_000;
export const RESONANCE_ECHO_ROOM_ID = "afterlight-market-garden-v1";
export const RESONANCE_ECHO_QUEST_ID = "afterlight-sunthread";

const ATTEMPT_ID_PATTERN = /^resonance-echo-attempt:[a-f0-9]{64}$/;
const ACTION_ID_PATTERN = /^[A-Za-z0-9:_-]{1,160}$/;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safePositiveTime(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function safeActionId(value) {
  return typeof value === "string" && ACTION_ID_PATTERN.test(value)
    ? value
    : null;
}

function safeErrorMessage(error) {
  return typeof error?.message === "string" && error.message.trim()
    ? error.message.trim().slice(0, 240)
    : "Resonance Echo is unavailable right now.";
}

export function createResonanceEchoClientState(now = Date.now()) {
  return {
    version: RESONANCE_ECHO_VERSION,
    roomId: RESONANCE_ECHO_ROOM_ID,
    questId: RESONANCE_ECHO_QUEST_ID,
    attemptId: null,
    phase: "idle",
    startedAt: null,
    maturesAt: null,
    completedAt: null,
    remainingMs: 0,
    canComplete: false,
    serverNow: safePositiveTime(now) || 1,
  };
}

export function hydrateResonanceEchoState(value, now = Date.now()) {
  const clientNow = safePositiveTime(now) || 1;
  if (
    !isRecord(value) ||
    value.version !== RESONANCE_ECHO_VERSION ||
    value.roomId !== RESONANCE_ECHO_ROOM_ID ||
    value.questId !== RESONANCE_ECHO_QUEST_ID
  ) {
    return createResonanceEchoClientState(clientNow);
  }

  const serverNow = safePositiveTime(value.serverNow) || clientNow;
  const attemptId =
    typeof value.attemptId === "string" &&
    ATTEMPT_ID_PATTERN.test(value.attemptId)
      ? value.attemptId
      : null;
  const startedAt = safePositiveTime(value.startedAt);
  const suppliedMaturesAt = safePositiveTime(value.maturesAt);
  if (!attemptId || !startedAt) {
    return createResonanceEchoClientState(serverNow);
  }
  const maturesAt = startedAt + RESONANCE_ECHO_WAIT_MS;
  if (
    !Number.isSafeInteger(maturesAt) ||
    suppliedMaturesAt !== maturesAt ||
    startedAt > serverNow
  ) {
    return createResonanceEchoClientState(serverNow);
  }

  const suppliedCompletedAt = safePositiveTime(value.completedAt);
  const completedAt =
    suppliedCompletedAt &&
    suppliedCompletedAt >= maturesAt &&
    suppliedCompletedAt <= serverNow
      ? suppliedCompletedAt
      : null;
  const phase = completedAt
    ? "completed"
    : serverNow >= maturesAt
      ? "mature"
      : "waiting";

  return {
    version: RESONANCE_ECHO_VERSION,
    roomId: RESONANCE_ECHO_ROOM_ID,
    questId: RESONANCE_ECHO_QUEST_ID,
    attemptId,
    phase,
    startedAt,
    maturesAt,
    completedAt,
    remainingMs:
      phase === "waiting" ? Math.max(0, maturesAt - serverNow) : 0,
    canComplete: phase === "mature",
    serverNow,
  };
}

export function resonanceEchoBindingPayload() {
  return {
    roomId: RESONANCE_ECHO_ROOM_ID,
    questId: RESONANCE_ECHO_QUEST_ID,
  };
}

export function resonanceEchoActionPayload(actionId) {
  const id = safeActionId(actionId);
  return id ? { ...resonanceEchoBindingPayload(), actionId: id } : null;
}

export function hydrateResonanceEchoCallableResponse(value, now = Date.now()) {
  const source = isRecord(value) ? value : {};
  return {
    applied: source.applied === true,
    duplicate: source.duplicate === true,
    alreadyCompleted: source.alreadyCompleted === true,
    echo: hydrateResonanceEchoState(source.echo, now),
    progression: isRecord(source.progression) ? source.progression : null,
  };
}

async function invokeResonanceEcho(callableName, payload, now = Date.now()) {
  try {
    const invoke = httpsCallable(functions, callableName);
    const response = await invoke(payload);
    return hydrateResonanceEchoCallableResponse(response.data, now);
  } catch (error) {
    return {
      applied: false,
      duplicate: false,
      alreadyCompleted: false,
      echo: createResonanceEchoClientState(now),
      progression: null,
      error: safeErrorMessage(error),
    };
  }
}

function invalidActionResult(now) {
  return {
    applied: false,
    duplicate: false,
    alreadyCompleted: false,
    echo: createResonanceEchoClientState(now),
    progression: null,
    error: "Provide a valid Resonance Echo action identifier.",
  };
}

export async function startResonanceEcho(actionId, now = Date.now()) {
  const payload = resonanceEchoActionPayload(actionId);
  return payload
    ? invokeResonanceEcho("startResonanceEcho", payload, now)
    : invalidActionResult(now);
}

export async function pollResonanceEcho(now = Date.now()) {
  return invokeResonanceEcho(
    "pollResonanceEcho",
    resonanceEchoBindingPayload(),
    now,
  );
}

export async function completeResonanceEcho(actionId, now = Date.now()) {
  const payload = resonanceEchoActionPayload(actionId);
  return payload
    ? invokeResonanceEcho("completeResonanceEcho", payload, now)
    : invalidActionResult(now);
}
