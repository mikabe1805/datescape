const { createHash } = require("node:crypto");

const SHARED_ENCOUNTER_VERSION = 1;
const SHARED_ENCOUNTER_COLLECTION = "worldSharedEncounters";
const SHARED_ENCOUNTER_MODE = "resonance";
const SHARED_ENCOUNTER_MODES = new Set(["resonance", "social"]);
const SHARED_ENCOUNTER_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SHARED_ENCOUNTER_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_SOURCE_ID = /^[A-Za-z0-9:_-]{1,160}$/;
const SAFE_ACTION_ID = /^[A-Za-z0-9:_-]{1,160}$/;
const RESPONSES = new Set(["spark", "pass"]);
const LISTENING_CARD_IDS = new Set([
  "open-evening",
  "easy-conversation",
  "small-care",
  "tiny-adventure",
  "after-a-long-week",
  "slow-curiosity",
]);
const LISTENING_COMPLETION_CHOICES = new Set(["a", "b", "c"]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeText(value, maxLength) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function safeTime(value) {
  const time = Number(value);
  return Number.isFinite(time) && time > 0 ? Math.floor(time) : null;
}

function safeUid(value) {
  return typeof value === "string" && SAFE_UID.test(value) ? value : null;
}

function sharedEncounterParticipants(values) {
  if (!Array.isArray(values) || values.length !== 2) return null;
  const participants = values.map(safeUid);
  if (participants.some((uid) => !uid) || participants[0] === participants[1]) {
    return null;
  }
  return participants.sort();
}

function privateMatchIdForParticipants(values) {
  const participants = sharedEncounterParticipants(values);
  return participants ? participants.join("_") : null;
}

function sharedEncounterIdForReceipt(receiptId, values) {
  const receipt = safeText(receiptId, 192);
  const participants = sharedEncounterParticipants(values);
  if (!receipt || !participants) return null;
  const digest = createHash("sha256")
    .update(`${SHARED_ENCOUNTER_VERSION}|${receipt}|${participants.join("|")}`)
    .digest("hex");
  return `encounter:${digest}`;
}

function normalizeDecisions(value, participants, createdAt, expiresAt) {
  if (!isRecord(value)) return {};
  if (Object.keys(value).some((uid) => !participants.includes(uid))) return null;
  const decisions = {};
  for (const uid of participants) {
    const source = value[uid];
    if (source === undefined) continue;
    if (!isRecord(source) || !RESPONSES.has(source.response)) return null;
    const actionId = safeText(source.actionId, 160);
    const decidedAt = safeTime(source.decidedAt);
    if (
      !actionId ||
      !SAFE_ACTION_ID.test(actionId) ||
      !decidedAt ||
      decidedAt < createdAt ||
      decidedAt >= expiresAt
    ) {
      return null;
    }
    decisions[uid] = {
      response: source.response,
      actionId,
      decidedAt,
    };
  }
  return decisions;
}

function encounterStatus(decisions, participants) {
  const responses = participants.map((uid) => decisions[uid]?.response || null);
  if (responses.every((response) => response === "spark")) return "matched";
  if (responses.includes("pass")) return "passed";
  return "open";
}

function normalizeSharedEncounter(value) {
  if (!isRecord(value)) return null;
  if (
    value.version !== SHARED_ENCOUNTER_VERSION ||
    !SHARED_ENCOUNTER_MODES.has(value.mode)
  ) {
    return null;
  }
  const participantUids = sharedEncounterParticipants(value.participantUids);
  const sourceReceiptId = safeText(value.sourceReceiptId, 192);
  const sourceId = safeText(value.sourceId, 160);
  const createdAt = safeTime(value.createdAt);
  const expiresAt = safeTime(value.expiresAt);
  if (
    !participantUids ||
    !sourceReceiptId ||
    !sourceId ||
    !SAFE_SOURCE_ID.test(sourceId) ||
    !createdAt ||
    !expiresAt ||
    expiresAt <= createdAt ||
    expiresAt - createdAt > MAX_SHARED_ENCOUNTER_TTL_MS
  ) {
    return null;
  }
  const expectedId = sharedEncounterIdForReceipt(
    sourceReceiptId,
    participantUids,
  );
  if (value.id !== expectedId) return null;

  const decisions = normalizeDecisions(
    value.decisions,
    participantUids,
    createdAt,
    expiresAt,
  );
  if (!decisions) return null;
  const status = encounterStatus(decisions, participantUids);
  const expectedMatchId = privateMatchIdForParticipants(participantUids);
  const matchId = status === "matched" ? expectedMatchId : null;
  const matchedAt =
    status === "matched"
      ? Math.max(...participantUids.map((uid) => decisions[uid].decidedAt))
      : null;

  return {
    version: SHARED_ENCOUNTER_VERSION,
    id: expectedId,
    mode: value.mode,
    sourceReceiptId,
    sourceId,
    participantUids,
    decisions,
    status,
    matchId,
    matchedAt,
    createdAt,
    expiresAt,
    updatedAt: safeTime(value.updatedAt) || createdAt,
  };
}

function createVerifiedSharedEncounter({
  receiptId,
  sourceId,
  participants,
  mode = SHARED_ENCOUNTER_MODE,
  now = Date.now(),
  ttlMs = SHARED_ENCOUNTER_TTL_MS,
}) {
  const participantUids = sharedEncounterParticipants(participants);
  const sourceReceiptId = safeText(receiptId, 192);
  const safeSourceId = safeText(sourceId, 160);
  const createdAt = safeTime(now);
  const duration = Number(ttlMs);
  if (
    !participantUids ||
    !sourceReceiptId ||
    !safeSourceId ||
    !SAFE_SOURCE_ID.test(safeSourceId) ||
    !SHARED_ENCOUNTER_MODES.has(mode) ||
    !createdAt ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > MAX_SHARED_ENCOUNTER_TTL_MS
  ) {
    return null;
  }
  const id = sharedEncounterIdForReceipt(sourceReceiptId, participantUids);
  return {
    version: SHARED_ENCOUNTER_VERSION,
    id,
    mode,
    sourceReceiptId,
    sourceId: safeSourceId,
    participantUids,
    decisions: {},
    status: "open",
    matchId: null,
    matchedAt: null,
    createdAt,
    expiresAt: createdAt + Math.floor(duration),
    updatedAt: createdAt,
  };
}

function listeningCompletionError(reason) {
  return { ok: false, reason };
}

// A completion ACK is only a trigger. The live match remains the authority:
// both participants must have locked a non-pass answer for the same authored
// card and both match-bound acknowledgements must still be present.
function verifyListeningCompletion(
  value,
  triggeringUid,
  acknowledgement,
  now = Date.now(),
) {
  if (!isRecord(value) || value.mode !== "social") {
    return listeningCompletionError("not-social");
  }
  const matchId = safeText(value.id, 160);
  const white = safeUid(value.white);
  const black = safeUid(value.black);
  const participants = sharedEncounterParticipants([white, black]);
  const callerUid = safeUid(triggeringUid);
  const startedAt = safeTime(value.startedAt);
  const observedAt = safeTime(now);
  if (
    !matchId ||
    !SAFE_SOURCE_ID.test(matchId) ||
    !participants ||
    !callerUid ||
    !participants.includes(callerUid) ||
    !startedAt ||
    !observedAt ||
    startedAt > observedAt + 5_000
  ) {
    return listeningCompletionError("invalid-match");
  }
  if (!LISTENING_CARD_IDS.has(value.socialCardId)) {
    return listeningCompletionError("invalid-card");
  }
  if (
    !isRecord(acknowledgement) ||
    acknowledgement.matchId !== matchId
  ) {
    return listeningCompletionError("invalid-trigger-ack");
  }

  const choices = value.socialChoices;
  const completionAcks = value.completionAcks;
  if (!isRecord(choices) || !isRecord(completionAcks)) {
    return listeningCompletionError("incomplete");
  }
  if (
    Object.keys(choices).some((uid) => !participants.includes(uid)) ||
    Object.keys(completionAcks).some((uid) => !participants.includes(uid))
  ) {
    return listeningCompletionError("unexpected-participant");
  }

  for (const uid of participants) {
    const choice = choices[uid];
    const ack = completionAcks[uid];
    if (
      !isRecord(choice) ||
      choice.matchId !== matchId ||
      !LISTENING_COMPLETION_CHOICES.has(choice.choiceId) ||
      !safeTime(choice.chosenAt) ||
      Number(choice.chosenAt) < startedAt
    ) {
      return listeningCompletionError("incomplete-choice");
    }
    if (
      !isRecord(ack) ||
      ack.matchId !== matchId ||
      !safeTime(ack.acknowledgedAt) ||
      Number(ack.acknowledgedAt) < startedAt
    ) {
      return listeningCompletionError("incomplete-ack");
    }
  }

  return {
    ok: true,
    matchId,
    participants,
    cardId: value.socialCardId,
  };
}

function responseError(code, message, encounter = null) {
  return { ok: false, code, message, encounter };
}

function applySharedEncounterResponse(
  value,
  { uid, response, actionId, now = Date.now() } = {},
) {
  const encounter = normalizeSharedEncounter(value);
  const callerUid = safeUid(uid);
  const safeActionId = safeText(actionId, 160);
  const respondedAt = safeTime(now);
  if (!encounter) {
    return responseError("not-found", "This shared encounter is unavailable.");
  }
  if (!callerUid || !encounter.participantUids.includes(callerUid)) {
    return responseError(
      "permission-denied",
      "This shared encounter does not belong to you.",
      encounter,
    );
  }
  if (!RESPONSES.has(response) || !safeActionId || !SAFE_ACTION_ID.test(safeActionId)) {
    return responseError(
      "invalid-argument",
      "Choose Spark or pass with a valid action identifier.",
      encounter,
    );
  }

  const existing = encounter.decisions[callerUid];
  if (existing) {
    if (existing.response === response) {
      return {
        ok: true,
        applied: false,
        duplicate: true,
        mutual: encounter.status === "matched",
        encounter,
        matchId: encounter.matchId,
      };
    }
    return responseError(
      "failed-precondition",
      "Your first response to this encounter is final.",
      encounter,
    );
  }
  if (!respondedAt || respondedAt >= encounter.expiresAt) {
    return responseError(
      "failed-precondition",
      "This shared encounter has closed.",
      encounter,
    );
  }
  if (encounter.status !== "open") {
    return responseError(
      "failed-precondition",
      "This shared encounter has already closed.",
      encounter,
    );
  }

  const decisions = {
    ...encounter.decisions,
    [callerUid]: {
      response,
      actionId: safeActionId,
      decidedAt: respondedAt,
    },
  };
  const status = encounterStatus(decisions, encounter.participantUids);
  const mutual = status === "matched";
  const next = {
    ...encounter,
    decisions,
    status,
    matchId: mutual
      ? privateMatchIdForParticipants(encounter.participantUids)
      : null,
    matchedAt: mutual ? respondedAt : null,
    updatedAt: respondedAt,
  };
  return {
    ok: true,
    applied: true,
    duplicate: false,
    mutual,
    encounter: next,
    matchId: next.matchId,
  };
}

function flattenedProfile(value) {
  if (!isRecord(value)) return {};
  return {
    ...(isRecord(value.profile) ? value.profile : {}),
    ...value,
  };
}

function blockedUidSet(value) {
  const source = flattenedProfile(value);
  if (!Array.isArray(source.blockedUsers)) return new Set();
  return new Set(source.blockedUsers.map(safeUid).filter(Boolean));
}

function sharedEncounterPairIsBlocked(uidA, profileA, uidB, profileB) {
  const first = safeUid(uidA);
  const second = safeUid(uidB);
  if (!first || !second || first === second) return true;
  return (
    blockedUidSet(profileA).has(second) || blockedUidSet(profileB).has(first)
  );
}

function boundedString(value, maxLength, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maxLength) || fallback;
}

function safePhotoUrl(value) {
  const candidate =
    typeof value === "string" ? value : typeof value?.url === "string" ? value.url : null;
  if (!candidate || candidate.length > 2048 || !/^https:\/\//i.test(candidate)) {
    return null;
  }
  return candidate;
}

function sanitizeWorldCallingCard(uid, value) {
  const safeProfileUid = safeUid(uid);
  if (!safeProfileUid) return null;
  const source = flattenedProfile(value);
  const media = Array.isArray(source.media) ? source.media : [];
  const age = Number(source.age);
  const interests = Array.isArray(source.interests)
    ? [...new Set(source.interests
      .map((interest) => boundedString(interest, 40))
      .filter(Boolean))].slice(0, 5)
    : [];
  return {
    uid: safeProfileUid,
    displayName: boundedString(
      source.displayName || source.name || source.username,
      30,
      "Wayfarer",
    ),
    photoUrl: safePhotoUrl(media[0]),
    bio: boundedString(source.bio, 280),
    age: Number.isInteger(age) && age >= 18 && age <= 120 ? age : null,
    lookingFor: boundedString(source.lookingFor, 80) || null,
    interests,
  };
}

function projectSharedEncounter(value, uid, opponentProfile, now = Date.now()) {
  const encounter = normalizeSharedEncounter(value);
  const callerUid = safeUid(uid);
  if (!encounter || !callerUid || !encounter.participantUids.includes(callerUid)) {
    return null;
  }
  const opponentUid = encounter.participantUids.find(
    (participantUid) => participantUid !== callerUid,
  );
  const opponentCard = sanitizeWorldCallingCard(opponentUid, opponentProfile || {});
  const ownResponse = encounter.decisions[callerUid]?.response || null;
  const expired = Number(now) >= encounter.expiresAt;
  let state = "open";
  if (expired) state = "closed";
  else if (encounter.status === "matched") state = "mutual";
  else if (encounter.status === "passed") {
    state = ownResponse === "pass" ? "passed" : "closed";
  } else if (ownResponse === "spark") state = "pending";

  return {
    id: encounter.id,
    mode: encounter.mode,
    sourceId: encounter.sourceId,
    opponent: {
      uid: opponentUid,
      name: opponentCard?.displayName || "Wayfarer",
    },
    response: ownResponse,
    state,
    createdAt: encounter.createdAt,
    expiresAt: encounter.expiresAt,
    matchId: state === "mutual" ? encounter.matchId : null,
  };
}

module.exports = {
  MAX_SHARED_ENCOUNTER_TTL_MS,
  SHARED_ENCOUNTER_COLLECTION,
  SHARED_ENCOUNTER_MODE,
  SHARED_ENCOUNTER_MODES,
  SHARED_ENCOUNTER_TTL_MS,
  SHARED_ENCOUNTER_VERSION,
  applySharedEncounterResponse,
  createVerifiedSharedEncounter,
  normalizeSharedEncounter,
  privateMatchIdForParticipants,
  projectSharedEncounter,
  sanitizeWorldCallingCard,
  sharedEncounterIdForReceipt,
  sharedEncounterPairIsBlocked,
  sharedEncounterParticipants,
  verifyListeningCompletion,
};
