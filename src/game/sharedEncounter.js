import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

export const SHARED_ENCOUNTER_RESPONSES = Object.freeze(["spark", "pass"]);
export const SHARED_ENCOUNTER_STATES = Object.freeze([
  "open",
  "pending",
  "mutual",
  "passed",
  "closed",
]);

const RESPONSES = new Set(SHARED_ENCOUNTER_RESPONSES);
const STATES = new Set(SHARED_ENCOUNTER_STATES);
const MODES = new Set(["social", "resonance"]);
const SAFE_ID = /^[A-Za-z0-9:_-]{1,160}$/;
const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_CONNECTION_ID = /^[A-Za-z0-9_-]{3,257}$/;
const MAX_ENCOUNTERS = 20;
const DEFAULT_LIMIT = 12;

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function boundedText(value, maximum, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, maximum) : fallback;
}

function safeId(value) {
  const text = boundedText(value, 160);
  return SAFE_ID.test(text) ? text : null;
}

function safeUid(value) {
  const text = boundedText(value, 128);
  return SAFE_UID.test(text) ? text : null;
}

function safeConnectionId(value) {
  const text = boundedText(value, 257);
  return SAFE_CONNECTION_ID.test(text) ? text : null;
}

function safeTime(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function safeLimit(value) {
  const number = Number(value);
  return Number.isInteger(number)
    ? Math.min(MAX_ENCOUNTERS, Math.max(1, number))
    : DEFAULT_LIMIT;
}

function normalizedState(value) {
  const state = boundedText(value, 32).toLowerCase();
  if (STATES.has(state)) return state;
  if (state === "available") return "open";
  if (state === "sparked" || state === "spark-pending") return "pending";
  if (state === "pass") return "passed";
  if (state === "expired" || state === "unavailable") return "closed";
  return "open";
}

function normalizedResponse(value) {
  const response = boundedText(value, 16).toLowerCase();
  return RESPONSES.has(response) ? response : null;
}

function safePhotoUrl(value) {
  const text = boundedText(value, 2_048);
  if (!/^https?:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.hostname === "localhost"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function callableError(error, fallback) {
  return error instanceof Error && error.message
    ? error.message.slice(0, 240)
    : fallback;
}

function encounterOpponent(source) {
  const opponent = record(
    source.opponent || source.otherPlayer || source.participant,
  );
  const uid = safeUid(opponent.uid || source.opponentUid || source.otherUid);
  if (!uid) return null;
  return {
    uid,
    name: boundedText(
      opponent.name || opponent.displayName || source.opponentName,
      30,
      "Another traveler",
    ),
  };
}

export function sanitizeSharedEncounter(value) {
  const source = record(value);
  const id = safeId(source.id || source.encounterId);
  const sourceId = safeId(source.sourceId || source.receiptId);
  const opponent = encounterOpponent(source);
  const mode = boundedText(source.mode, 24).toLowerCase();
  if (!id || !sourceId || !opponent || !MODES.has(mode)) return null;

  const response = normalizedResponse(
    source.response ?? source.viewerResponse ?? source.myResponse,
  );
  const mutual = source.mutual === true;
  let state = normalizedState(source.state || source.status);
  if (state !== "closed") {
    if (mutual) state = "mutual";
    else if (response === "pass") state = "passed";
    else if (response === "spark") state = "pending";
  }

  const matchId =
    state === "mutual" ? safeConnectionId(source.matchId) : null;
  return {
    id,
    sourceId,
    mode,
    opponent,
    response:
      state === "mutual" || state === "pending"
        ? "spark"
        : state === "passed"
          ? "pass"
          : response,
    state,
    createdAt: safeTime(source.createdAt),
    expiresAt: safeTime(source.expiresAt),
    matchId,
  };
}

export function sanitizeSharedEncounterList(value, limit = DEFAULT_LIMIT) {
  const entries = Array.isArray(value)
    ? value
    : Object.entries(record(value)).map(([id, encounter]) => ({
        ...record(encounter),
        id: record(encounter).id || id,
      }));
  const seen = new Set();
  return entries
    .map(sanitizeSharedEncounter)
    .filter((encounter) => {
      if (!encounter || seen.has(encounter.id)) return false;
      seen.add(encounter.id);
      return true;
    })
    .sort((first, second) => (second.createdAt || 0) - (first.createdAt || 0))
    .slice(0, safeLimit(limit));
}

export function sanitizeWorldCallingCard(value, expectedUid = null) {
  const source = record(value);
  const uid = safeUid(source.uid);
  const safeExpectedUid = expectedUid ? safeUid(expectedUid) : null;
  if (!uid || (safeExpectedUid && uid !== safeExpectedUid)) return null;
  const rawInterests = Array.isArray(source.interests) ? source.interests : [];
  const interests = [...new Set(
    rawInterests
      .map((interest) => boundedText(interest, 40))
      .filter(Boolean),
  )].slice(0, 5);
  const age = Number(source.age);
  return {
    uid,
    displayName: boundedText(source.displayName, 30, "Player"),
    photoUrl: safePhotoUrl(source.photoUrl),
    bio: boundedText(source.bio, 280),
    age: Number.isInteger(age) && age >= 18 && age <= 120 ? age : null,
    lookingFor: boundedText(source.lookingFor, 80) || null,
    interests,
  };
}

export function createSharedEncounterActionId(response, counter = 0) {
  if (!RESPONSES.has(response)) return null;
  const browserCrypto =
    typeof window !== "undefined" ? window.crypto : undefined;
  const nonce =
    browserCrypto?.randomUUID?.() || `${Date.now()}:${Number(counter) || 0}`;
  return safeId(`shared-encounter:${response}:${nonce}`);
}

export async function listSharedEncounters({ limit = DEFAULT_LIMIT } = {}) {
  const boundedLimit = safeLimit(limit);
  try {
    const invoke = httpsCallable(functions, "listSharedEncounters");
    const response = await invoke({ limit: boundedLimit });
    return {
      encounters: sanitizeSharedEncounterList(
        response.data?.encounters,
        boundedLimit,
      ),
      error: null,
    };
  } catch (error) {
    return {
      encounters: [],
      error: callableError(error, "Shared moments are unavailable right now."),
    };
  }
}

export async function respondSharedEncounter({
  encounterId,
  response,
  actionId,
} = {}) {
  const id = safeId(encounterId);
  const choice = normalizedResponse(response);
  const safeActionId = safeId(actionId);
  if (!id || !choice || !safeActionId) {
    return {
      encounter: null,
      mutual: false,
      matchId: null,
      error: "Choose a valid shared moment response.",
    };
  }
  try {
    const invoke = httpsCallable(functions, "respondSharedEncounter");
    const result = await invoke({
      encounterId: id,
      response: choice,
      actionId: safeActionId,
    });
    const mutual = result.data?.mutual === true;
    const encounter = sanitizeSharedEncounter({
      ...record(result.data?.encounter),
      mutual,
      matchId: mutual ? result.data?.matchId : null,
    });
    if (!encounter) {
      return {
        encounter: null,
        mutual: false,
        matchId: null,
        error: "The shared moment response could not be confirmed.",
      };
    }
    return {
      encounter,
      mutual: encounter.state === "mutual",
      matchId: encounter.matchId,
      error: null,
    };
  } catch (error) {
    return {
      encounter: null,
      mutual: false,
      matchId: null,
      error: callableError(error, "Your choice could not be confirmed."),
    };
  }
}

export async function getWorldCallingCard(uid) {
  const safePlayerUid = safeUid(uid);
  if (!safePlayerUid) {
    return { profile: null, error: "Choose a valid calling card." };
  }
  try {
    const invoke = httpsCallable(functions, "getWorldCallingCard");
    const response = await invoke({
      uid: safePlayerUid,
      room: "afterlight-market-garden-v1",
    });
    const profile = sanitizeWorldCallingCard(
      response.data?.profile,
      safePlayerUid,
    );
    return profile
      ? { profile, error: null }
      : { profile: null, error: "This calling card is unavailable." };
  } catch (error) {
    return {
      profile: null,
      error: callableError(error, "This calling card is unavailable."),
    };
  }
}
