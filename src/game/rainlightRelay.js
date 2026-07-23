export const RAINLIGHT_RELAY_ID = "rainlight-relay";
export const RAINLIGHT_ROOM_ID = "afterlight-market-garden-v1";
export const RAINLIGHT_SOURCES = Object.freeze([
  "conservatory",
  "market",
  "resonance",
]);
export const RAINLIGHT_TARGET = 4;
export const RAINLIGHT_MAX_CONTRIBUTORS = 4;

const PHASES = new Set([
  "idle",
  "gathering",
  "echo-available",
  "completed",
  "cooldown",
]);
const RESULT_MODES = new Set(["community", "echo"]);

function safeTime(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function boundedInteger(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function safeId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9:_-]{1,160}$/.test(trimmed) ? trimmed : null;
}

export function createRainlightRelayState() {
  return {
    id: RAINLIGHT_RELAY_ID,
    instanceId: null,
    phase: "idle",
    startedAt: null,
    echoAvailableAt: null,
    completedAt: null,
    cooldownEndsAt: null,
    contributionCount: 0,
    targetCount: RAINLIGHT_TARGET,
    contributorCount: 0,
    sourceCount: 0,
    sourceCounts: {
      conservatory: 0,
      market: 0,
      resonance: 0,
    },
    resultMode: null,
  };
}

export function hydrateRainlightRelayState(value, now = Date.now()) {
  const fallback = createRainlightRelayState();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const instanceId = safeId(value.instanceId);
  const startedAt = safeTime(value.startedAt);
  const echoAvailableAt = safeTime(value.echoAvailableAt);
  const completedAt = safeTime(value.completedAt);
  const cooldownEndsAt = safeTime(value.cooldownEndsAt);
  const source =
    value.sourceCounts && typeof value.sourceCounts === "object"
      ? value.sourceCounts
      : {};
  const sourceCounts = Object.fromEntries(
    RAINLIGHT_SOURCES.map((sourceId) => [
      sourceId,
      boundedInteger(source[sourceId], 0, 2),
    ]),
  );
  const contributionCount = Math.min(
    RAINLIGHT_TARGET,
    Object.values(sourceCounts).reduce((total, count) => total + count, 0),
  );
  const sourceCount = Object.values(sourceCounts).filter(Boolean).length;
  const contributorCount = boundedInteger(value.contributorCount, 0, 64);
  const resultMode = RESULT_MODES.has(value.resultMode)
    ? value.resultMode
    : null;

  let phase = PHASES.has(value.phase) ? value.phase : "idle";
  if (!instanceId || !startedAt) {
    phase = "idle";
  } else if (completedAt) {
    if (cooldownEndsAt && now >= cooldownEndsAt) {
      return fallback;
    }
    else if (now >= completedAt + 30_000) phase = "cooldown";
    else phase = "completed";
  } else if (
    echoAvailableAt &&
    now >= echoAvailableAt &&
    contributorCount <= 1
  ) {
    phase = "echo-available";
  } else {
    phase = "gathering";
  }

  return {
    id: RAINLIGHT_RELAY_ID,
    instanceId,
    phase,
    startedAt,
    echoAvailableAt,
    completedAt,
    cooldownEndsAt,
    contributionCount,
    targetCount: RAINLIGHT_TARGET,
    contributorCount,
    sourceCount,
    sourceCounts,
    resultMode,
  };
}

export function hydrateRainlightPersonalState(value) {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const contributedSources = Array.isArray(source.contributedSources)
    ? [...new Set(source.contributedSources.filter((id) =>
        RAINLIGHT_SOURCES.includes(id),
      ))]
    : [];
  const availableSources = Array.isArray(source.availableSources)
    ? [...new Set(source.availableSources.filter((id) =>
        RAINLIGHT_SOURCES.includes(id),
      ))]
    : RAINLIGHT_SOURCES.filter((id) => !contributedSources.includes(id));
  return {
    instanceId: safeId(source.instanceId),
    contributedSources,
    availableSources,
    contributed: contributedSources.length > 0,
  };
}

export function selectRainlightRelayProgress(value, personalValue, now = Date.now()) {
  const event = hydrateRainlightRelayState(value, now);
  const hydratedPersonal = hydrateRainlightPersonalState(personalValue);
  const instancePersonal =
    event.phase === "idle" ||
    !event.instanceId ||
    hydratedPersonal.instanceId !== event.instanceId
      ? hydrateRainlightPersonalState({
          instanceId: event.instanceId,
          contributedSources: [],
          availableSources: RAINLIGHT_SOURCES,
        })
      : hydratedPersonal;
  const unbankedOpenSources = RAINLIGHT_SOURCES.filter(
    (sourceId) =>
      !instancePersonal.contributedSources.includes(sourceId) &&
      event.sourceCounts[sourceId] < 2,
  );
  const canTakeEchoRoute =
    event.phase === "echo-available" && event.contributorCount <= 1;
  const canJoinInstance =
    instancePersonal.contributed ||
    event.phase === "idle" ||
    event.contributorCount < RAINLIGHT_MAX_CONTRIBUTORS;
  const derivedAvailableSources =
    event.phase === "completed" || event.phase === "cooldown"
      ? []
      : canJoinInstance &&
          (instancePersonal.contributedSources.length < 2 || canTakeEchoRoute)
        ? unbankedOpenSources
        : [];
  const personal = {
    ...instancePersonal,
    availableSources: derivedAvailableSources,
  };
  const echoSecondsRemaining =
    event.echoAvailableAt && event.phase === "gathering"
      ? Math.max(0, Math.ceil((event.echoAvailableAt - now) / 1000))
      : 0;
  const canContribute =
    event.phase === "idle" ||
    event.phase === "gathering" ||
    event.phase === "echo-available";
  return {
    event,
    personal,
    canContribute,
    echoSecondsRemaining,
    complete: event.phase === "completed" || event.phase === "cooldown",
  };
}
