const { createHash } = require("node:crypto");

const RAINLIGHT_RELAY_VERSION = 1;
const RAINLIGHT_RELAY_EVENT_ID = "rainlight-relay";
const RAINLIGHT_RELAY_ROOM_ID = "afterlight-market-garden-v1";
const RAINLIGHT_RELAY_SOURCES = Object.freeze([
  "conservatory",
  "market",
  "resonance",
]);
const ECHO_DELAY_MS = 90_000;
const COOLDOWN_MS = 120_000;
const STANDARD_TARGET = 4;
const MAX_STANDARD_CONTRIBUTIONS_PER_PLAYER = 2;
const MAX_CONTRIBUTIONS_PER_SOURCE = 2;
const MAX_CONTRIBUTORS = 4;
const MAX_PROCESSED_ACTION_IDS = 512;

const SAFE_ACTION_ID = /^[A-Za-z0-9:_-]{1,160}$/;
const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SOURCE_SET = new Set(RAINLIGHT_RELAY_SOURCES);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safePositiveTime(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : null;
}

function safeUid(value) {
  return typeof value === "string" &&
    SAFE_UID.test(value) &&
    !RESERVED_KEYS.has(value)
    ? value
    : null;
}

function safeActionId(value) {
  return typeof value === "string" && SAFE_ACTION_ID.test(value)
    ? value
    : null;
}

function uniqueActionIds(values) {
  if (!Array.isArray(values)) return [];
  const result = [];
  const seen = new Set();
  values.forEach((value) => {
    const id = safeActionId(value);
    if (!id || seen.has(id)) return;
    seen.add(id);
    result.push(id);
  });
  return result.slice(-MAX_PROCESSED_ACTION_IDS);
}

function instanceIdFor(startedAt) {
  return `${RAINLIGHT_RELAY_EVENT_ID}:${startedAt}`;
}

function processedActionKey(uid, actionId) {
  const digest = createHash("sha256")
    .update(`${uid}|${actionId}`)
    .digest("hex");
  return `relay-action:${digest}`;
}

function emptyContributions() {
  return {};
}

function sanitizeContributions(
  value,
  gatheringStartedAt,
  suppliedCompletedAt = null,
) {
  if (!isRecord(value) || !gatheringStartedAt) return emptyContributions();
  const candidates = Object.entries(value)
    .map(([uid, sources]) => [safeUid(uid), sources])
    .filter(([uid, sources]) => uid && isRecord(sources))
    .map(([uid, sources]) => {
      const safeSources = {};
      RAINLIGHT_RELAY_SOURCES.forEach((source) => {
        const at = safePositiveTime(sources[source]);
        if (at && at >= gatheringStartedAt) safeSources[source] = at;
      });
      return [uid, safeSources];
    })
    .filter(([, sources]) => Object.keys(sources).length)
    .sort(([firstUid], [secondUid]) => firstUid.localeCompare(secondUid))
    .slice(0, MAX_CONTRIBUTORS);

  const echoAvailableAt = gatheringStartedAt + ECHO_DELAY_MS;
  const echoUid =
    candidates.length === 1 &&
    suppliedCompletedAt >= echoAvailableAt &&
    RAINLIGHT_RELAY_SOURCES.every(
      (source) => candidates[0][1][source],
    ) &&
    Math.max(...Object.values(candidates[0][1])) >= echoAvailableAt
      ? candidates[0][0]
      : null;
  const sourceCounts = Object.fromEntries(
    RAINLIGHT_RELAY_SOURCES.map((source) => [source, 0]),
  );
  const result = {};
  candidates.forEach(([uid, sources]) => {
    const safeSources = {};
    const personalLimit = echoUid === uid
      ? RAINLIGHT_RELAY_SOURCES.length
      : MAX_STANDARD_CONTRIBUTIONS_PER_PLAYER;
    RAINLIGHT_RELAY_SOURCES.forEach((source) => {
      if (
        !sources[source] ||
        Object.keys(safeSources).length >= personalLimit ||
        sourceCounts[source] >= MAX_CONTRIBUTIONS_PER_SOURCE
      ) {
        return;
      }
      safeSources[source] = sources[source];
      sourceCounts[source] += 1;
    });
    if (Object.keys(safeSources).length) result[uid] = safeSources;
  });
  return result;
}

function completionFacts(contributions) {
  const participantUids = Object.keys(contributions).sort();
  const sources = RAINLIGHT_RELAY_SOURCES.filter((source) =>
    participantUids.some((uid) => contributions[uid]?.[source]),
  );
  const contributionCount = participantUids.reduce(
    (total, uid) => total + Object.keys(contributions[uid] || {}).length,
    0,
  );
  return {
    participantUids,
    sources,
    contributionCount,
    contributorCount: participantUids.length,
    sourceCount: sources.length,
  };
}

function completionModeFor(contributions, completedAt, echoAvailableAt) {
  const facts = completionFacts(contributions);
  if (
    facts.contributionCount >= STANDARD_TARGET &&
    facts.contributorCount >= 2 &&
    facts.sourceCount >= 2
  ) {
    return "standard";
  }
  if (
    facts.contributionCount === RAINLIGHT_RELAY_SOURCES.length &&
    facts.contributorCount === 1 &&
    facts.sourceCount === RAINLIGHT_RELAY_SOURCES.length &&
    completedAt >= echoAvailableAt
  ) {
    return "echo";
  }
  return null;
}

function createRainlightRelayState(processedActionIds = []) {
  return {
    version: RAINLIGHT_RELAY_VERSION,
    eventId: RAINLIGHT_RELAY_EVENT_ID,
    roomId: RAINLIGHT_RELAY_ROOM_ID,
    instanceId: null,
    gatheringStartedAt: null,
    echoAvailableAt: null,
    completedAt: null,
    cooldownEndsAt: null,
    completionMode: null,
    processedActionIds: uniqueActionIds(processedActionIds),
    contributions: emptyContributions(),
  };
}

function normalizeRainlightRelayState(value) {
  const source = isRecord(value) ? value : {};
  const processedActionIds = uniqueActionIds(source.processedActionIds);
  const gatheringStartedAt = safePositiveTime(source.gatheringStartedAt);
  if (!gatheringStartedAt) {
    return createRainlightRelayState(processedActionIds);
  }

  const echoAvailableAt = gatheringStartedAt + ECHO_DELAY_MS;
  const suppliedCompletedAt = safePositiveTime(source.completedAt);
  const contributions = sanitizeContributions(
    source.contributions,
    gatheringStartedAt,
    suppliedCompletedAt,
  );
  const completionMode = suppliedCompletedAt
    ? completionModeFor(
        contributions,
        suppliedCompletedAt,
        echoAvailableAt,
      )
    : null;
  const completedAt = completionMode
    ? Math.max(gatheringStartedAt, suppliedCompletedAt)
    : null;

  return {
    version: RAINLIGHT_RELAY_VERSION,
    eventId: RAINLIGHT_RELAY_EVENT_ID,
    roomId: RAINLIGHT_RELAY_ROOM_ID,
    instanceId: instanceIdFor(gatheringStartedAt),
    gatheringStartedAt,
    echoAvailableAt,
    completedAt,
    cooldownEndsAt: completedAt ? completedAt + COOLDOWN_MS : null,
    completionMode,
    processedActionIds,
    contributions,
  };
}

function validateRainlightRelayContribution(value) {
  if (!isRecord(value)) {
    return {
      ok: false,
      code: "invalid-contribution",
      message: "Provide a Rainlight Relay contribution.",
    };
  }
  const actionId = safeActionId(value.actionId);
  if (!actionId) {
    return {
      ok: false,
      code: "invalid-action-id",
      message:
        "actionId must be 1-160 letters, numbers, colons, underscores, or dashes.",
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
  if (value.roomId !== RAINLIGHT_RELAY_ROOM_ID) {
    return {
      ok: false,
      code: "invalid-room",
      message: "Rainlight Relay is not available in this room.",
    };
  }
  if (!SOURCE_SET.has(value.source)) {
    return {
      ok: false,
      code: "invalid-source",
      message: "Choose a supported Rainlight Relay source.",
    };
  }
  return {
    ok: true,
    contribution: {
      actionId,
      uid,
      roomId: RAINLIGHT_RELAY_ROOM_ID,
      source: value.source,
    },
  };
}

function failure(state, code, message, extra = {}) {
  return {
    ok: false,
    applied: false,
    duplicate: false,
    completed: Boolean(state.completedAt),
    state,
    code,
    message,
    ...extra,
  };
}

function beginInstance(processedActionIds, now) {
  return {
    ...createRainlightRelayState(processedActionIds),
    instanceId: instanceIdFor(now),
    gatheringStartedAt: now,
    echoAvailableAt: now + ECHO_DELAY_MS,
  };
}

function applyRainlightRelayContribution(value, input, now = Date.now()) {
  let state = normalizeRainlightRelayState(value);
  const validated = validateRainlightRelayContribution(input);
  if (!validated.ok) {
    return failure(state, validated.code, validated.message);
  }
  const at = safePositiveTime(now);
  if (!at) {
    return failure(state, "invalid-time", "Use a positive server timestamp.");
  }

  const contribution = validated.contribution;
  const processedActionId = processedActionKey(
    contribution.uid,
    contribution.actionId,
  );
  if (state.processedActionIds.includes(processedActionId)) {
    return {
      ok: true,
      applied: false,
      duplicate: true,
      completed: Boolean(state.completedAt),
      started: false,
      state,
    };
  }

  let started = false;
  if (state.completedAt) {
    if (at < state.cooldownEndsAt) {
      return failure(
        state,
        "cooldown-active",
        "Rainlight Relay is cooling down.",
        { retryAt: state.cooldownEndsAt },
      );
    }
    state = beginInstance(state.processedActionIds, at);
    started = true;
  } else if (!state.gatheringStartedAt) {
    state = beginInstance(state.processedActionIds, at);
    started = true;
  }

  const factsBefore = completionFacts(state.contributions);
  const existingSources = state.contributions[contribution.uid] || {};
  if (existingSources[contribution.source]) {
    return failure(
      state,
      "source-already-contributed",
      "This player already contributed from that source.",
    );
  }
  if (
    !state.contributions[contribution.uid] &&
    factsBefore.contributorCount >= MAX_CONTRIBUTORS
  ) {
    return failure(
      state,
      "contributor-limit",
      "This relay instance already has four contributors.",
    );
  }
  const sourceContributionCount = factsBefore.participantUids.reduce(
    (total, uid) => total + (state.contributions[uid]?.[contribution.source] ? 1 : 0),
    0,
  );
  if (sourceContributionCount >= MAX_CONTRIBUTIONS_PER_SOURCE) {
    return failure(
      state,
      "source-capacity-reached",
      "That Rainlight source already holds two contributions for this relay.",
    );
  }

  const personalCount = Object.keys(existingSources).length;
  const echoThirdContribution =
    personalCount === MAX_STANDARD_CONTRIBUTIONS_PER_PLAYER &&
    factsBefore.contributorCount === 1 &&
    Boolean(state.contributions[contribution.uid]) &&
    at >= state.echoAvailableAt;
  if (
    personalCount >= MAX_STANDARD_CONTRIBUTIONS_PER_PLAYER &&
    !echoThirdContribution
  ) {
    return failure(
      state,
      "player-contribution-limit",
      "This player has contributed their two standard relay units.",
      { echoAvailableAt: state.echoAvailableAt },
    );
  }

  const contributions = {
    ...state.contributions,
    [contribution.uid]: {
      ...existingSources,
      [contribution.source]: at,
    },
  };
  const processedActionIds = uniqueActionIds([
    ...state.processedActionIds,
    processedActionId,
  ]);
  const factsAfter = completionFacts(contributions);
  const standardComplete =
    factsAfter.contributionCount >= STANDARD_TARGET &&
    factsAfter.contributorCount >= 2 &&
    factsAfter.sourceCount >= 2;
  const echoComplete =
    factsAfter.contributionCount === RAINLIGHT_RELAY_SOURCES.length &&
    factsAfter.contributorCount === 1 &&
    factsAfter.sourceCount === RAINLIGHT_RELAY_SOURCES.length &&
    at >= state.echoAvailableAt;
  const completionMode = standardComplete
    ? "standard"
    : echoComplete
      ? "echo"
      : null;
  const completedAt = completionMode ? at : null;

  state = {
    ...state,
    contributions,
    processedActionIds,
    completedAt,
    cooldownEndsAt: completedAt ? completedAt + COOLDOWN_MS : null,
    completionMode,
  };

  return {
    ok: true,
    applied: true,
    duplicate: false,
    completed: Boolean(completedAt),
    started,
    state,
  };
}

function selectRainlightRelayParticipantUids(value) {
  return completionFacts(normalizeRainlightRelayState(value).contributions)
    .participantUids;
}

function selectRainlightRelaySourceIds(value) {
  return completionFacts(normalizeRainlightRelayState(value).contributions)
    .sources;
}

function publicRainlightRelayState(value, now = Date.now()) {
  const state = normalizeRainlightRelayState(value);
  const at = safePositiveTime(now) || 0;
  const facts = completionFacts(state.contributions);
  const phase = state.completedAt
    ? at >= state.cooldownEndsAt
      ? "ready"
      : "completed"
    : state.gatheringStartedAt
      ? "gathering"
      : "idle";
  return {
    version: state.version,
    eventId: state.eventId,
    roomId: state.roomId,
    instanceId: state.instanceId,
    phase,
    gatheringStartedAt: state.gatheringStartedAt,
    echoAvailableAt: state.echoAvailableAt,
    echoAvailable:
      phase === "gathering" &&
      facts.contributorCount === 1 &&
      at >= state.echoAvailableAt,
    completedAt: state.completedAt,
    cooldownEndsAt: state.cooldownEndsAt,
    completionMode: state.completionMode,
    contributionCount: facts.contributionCount,
    contributionTarget: STANDARD_TARGET,
    contributorCount: facts.contributorCount,
    contributorLimit: MAX_CONTRIBUTORS,
    sourceCount: facts.sourceCount,
    sources: facts.sources,
  };
}

module.exports = {
  COOLDOWN_MS,
  ECHO_DELAY_MS,
  MAX_CONTRIBUTORS,
  MAX_CONTRIBUTIONS_PER_SOURCE,
  MAX_STANDARD_CONTRIBUTIONS_PER_PLAYER,
  RAINLIGHT_RELAY_EVENT_ID,
  RAINLIGHT_RELAY_ROOM_ID,
  RAINLIGHT_RELAY_SOURCES,
  RAINLIGHT_RELAY_VERSION,
  STANDARD_TARGET,
  applyRainlightRelayContribution,
  createRainlightRelayState,
  normalizeRainlightRelayState,
  publicRainlightRelayState,
  selectRainlightRelayParticipantUids,
  selectRainlightRelaySourceIds,
  validateRainlightRelayContribution,
};
