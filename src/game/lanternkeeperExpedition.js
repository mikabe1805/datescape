export const LANTERNKEEPER_EXPEDITION_ID = "lanternkeeper-expedition";
export const LANTERNKEEPER_DEFINITION_ID =
  "lanternkeeper-expedition-v1";
export const LANTERNKEEPER_ROOM_ID = "afterlight-market-garden-v1";
export const LANTERNKEEPER_MEMBER_CAPACITY = 4;

export const LANTERNKEEPER_TARGET_IDS = Object.freeze([
  "conservatory-scan",
  "market-west",
  "market-east",
  "resonance-left",
  "resonance-right",
]);

export const LANTERNKEEPER_STAGE_TARGETS = Object.freeze({
  conservatory: Object.freeze(["conservatory-scan"]),
  market: Object.freeze(["market-west", "market-east"]),
  resonance: Object.freeze(["resonance-left", "resonance-right"]),
  completed: Object.freeze([]),
  expired: Object.freeze([]),
});

const PHASES = new Set(Object.keys(LANTERNKEEPER_STAGE_TARGETS));
const RESULT_MODES = new Set(["standard", "echo"]);
const TARGET_ID_SET = new Set(LANTERNKEEPER_TARGET_IDS);
const SAFE_ID = /^[A-Za-z0-9:_-]{1,160}$/;

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeId(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return SAFE_ID.test(text) ? text : null;
}

function safeTime(value) {
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function safeInteger(value, fallback, min, max) {
  const number = Number(value);
  return Number.isInteger(number)
    ? Math.min(max, Math.max(min, number))
    : fallback;
}

function uniqueTargetIds(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((id) => TARGET_ID_SET.has(id)))];
}

export function createLanternkeeperExpedition() {
  return {
    id: LANTERNKEEPER_EXPEDITION_ID,
    definitionId: LANTERNKEEPER_DEFINITION_ID,
    room: LANTERNKEEPER_ROOM_ID,
    instanceId: null,
    revision: 0,
    phase: "expired",
    startedAt: null,
    echoAvailableAt: null,
    expiresAt: null,
    completedAt: null,
    activeMemberCount: 0,
    memberCapacity: LANTERNKEEPER_MEMBER_CAPACITY,
    openSlots: LANTERNKEEPER_MEMBER_CAPACITY,
    canJoin: false,
    stageIndex: 0,
    targetStates: Object.fromEntries(
      LANTERNKEEPER_TARGET_IDS.map((targetId) => [targetId, false]),
    ),
    resultMode: null,
  };
}

export function hydrateLanternkeeperExpedition(value) {
  const source = record(value);
  const fallback = createLanternkeeperExpedition();
  const instanceId = safeId(source.instanceId);
  const phase = PHASES.has(source.phase) ? source.phase : "expired";
  const activeMemberCount = safeInteger(
    source.activeMemberCount,
    0,
    0,
    LANTERNKEEPER_MEMBER_CAPACITY,
  );
  const memberCapacity = safeInteger(
    source.memberCapacity,
    LANTERNKEEPER_MEMBER_CAPACITY,
    1,
    LANTERNKEEPER_MEMBER_CAPACITY,
  );
  const targetSource = record(source.targetStates);
  const targetStates = Object.fromEntries(
    LANTERNKEEPER_TARGET_IDS.map((targetId) => [
      targetId,
      targetSource[targetId] === true,
    ]),
  );
  const completedAt = safeTime(source.completedAt);
  const expiresAt = safeTime(source.expiresAt);
  const safePhase = phase;
  const canJoin =
    source.canJoin === true &&
    Boolean(instanceId) &&
    safePhase !== "completed" &&
    safePhase !== "expired" &&
    activeMemberCount < memberCapacity;

  return {
    ...fallback,
    id:
      source.id === LANTERNKEEPER_EXPEDITION_ID
        ? source.id
        : fallback.id,
    definitionId:
      source.definitionId === LANTERNKEEPER_DEFINITION_ID
        ? source.definitionId
        : fallback.definitionId,
    room:
      source.room === LANTERNKEEPER_ROOM_ID ? source.room : fallback.room,
    instanceId,
    revision: safeInteger(source.revision, 0, 0, Number.MAX_SAFE_INTEGER),
    phase: safePhase,
    startedAt: safeTime(source.startedAt),
    echoAvailableAt: safeTime(source.echoAvailableAt),
    expiresAt,
    completedAt,
    activeMemberCount,
    memberCapacity,
    openSlots: Math.max(0, memberCapacity - activeMemberCount),
    canJoin,
    stageIndex: safeInteger(source.stageIndex, 0, 0, 3),
    targetStates,
    resultMode: RESULT_MODES.has(source.resultMode) ? source.resultMode : null,
  };
}

export function createLanternkeeperPersonalState() {
  return {
    instanceId: null,
    joined: false,
    active: false,
    joinedAt: null,
    leftAt: null,
    contributedTargets: [],
    availableTargets: [],
    canLeave: false,
  };
}

export function hydrateLanternkeeperPersonalState(value) {
  const source = record(value);
  const joined = source.joined === true;
  const active = joined && source.active === true;
  return {
    ...createLanternkeeperPersonalState(),
    instanceId: safeId(source.instanceId),
    joined,
    active,
    joinedAt: safeTime(source.joinedAt),
    leftAt: safeTime(source.leftAt),
    contributedTargets: uniqueTargetIds(source.contributedTargets),
    availableTargets: active ? uniqueTargetIds(source.availableTargets) : [],
    canLeave: active && source.canLeave === true,
  };
}

export function hydrateLanternkeeperExpeditionList(value) {
  const list = Array.isArray(value) ? value : Object.values(record(value));
  return list
    .map(hydrateLanternkeeperExpedition)
    .filter((expedition) => expedition.instanceId)
    .sort(
      (first, second) =>
        (second.startedAt || 0) - (first.startedAt || 0) ||
        second.revision - first.revision,
    )
    .slice(0, 12);
}

export function lanternkeeperStageId(phase) {
  return {
    conservatory: "conservatory-scan",
    market: "market-lanterns",
    resonance: "resonance-chime",
    completed: "complete",
  }[phase] || null;
}

export function lanternkeeperProgress(expedition, personal, now = Date.now()) {
  const hydratedEvent = hydrateLanternkeeperExpedition(expedition);
  const event =
    hydratedEvent.phase !== "completed" &&
    hydratedEvent.phase !== "expired" &&
    hydratedEvent.expiresAt &&
    hydratedEvent.expiresAt <= now
      ? { ...hydratedEvent, phase: "expired", canJoin: false }
      : hydratedEvent;
  const mine = hydrateLanternkeeperPersonalState(personal);
  const currentTargets = LANTERNKEEPER_STAGE_TARGETS[event.phase] || [];
  const completedTargetIds = LANTERNKEEPER_TARGET_IDS.filter(
    (targetId) => event.targetStates[targetId],
  );
  const partnerStage = event.phase === "market" || event.phase === "resonance";
  const canUseEcho = Boolean(
    mine.active &&
      partnerStage &&
      event.echoAvailableAt &&
      now >= event.echoAvailableAt &&
      event.phase !== "completed" &&
      event.phase !== "expired",
  );
  const secondsRemaining = event.expiresAt
    ? Math.max(0, Math.ceil((event.expiresAt - now) / 1000))
    : 0;
  const echoSecondsRemaining = event.echoAvailableAt
    ? Math.max(0, Math.ceil((event.echoAvailableAt - now) / 1000))
    : 0;
  const contributedCurrentTargets = mine.contributedTargets.filter((targetId) =>
    currentTargets.includes(targetId),
  );
  const availableTargets = mine.availableTargets.filter((targetId) =>
    currentTargets.includes(targetId),
  );
  return {
    expedition: event,
    personal: mine,
    currentTargets,
    completedTargetIds,
    availableTargets:
      partnerStage && contributedCurrentTargets.length > 0 && !canUseEcho
        ? []
        : availableTargets,
    canUseEcho,
    secondsRemaining,
    echoSecondsRemaining,
    complete: event.phase === "completed",
    expired: event.phase === "expired",
  };
}

export function lanternkeeperRendererState(
  expedition,
  personal,
  now = Date.now(),
) {
  const progress = lanternkeeperProgress(expedition, personal, now);
  const event = progress.expedition;
  const mine = progress.personal;
  const idle = !event.instanceId;
  const status = idle
    ? "idle"
    : event.phase === "completed"
      ? "completed"
      : event.phase === "expired"
        ? "expired"
        : event.activeMemberCount < 2 && !progress.canUseEcho
          ? "forming"
          : "active";
  return {
    id: LANTERNKEEPER_EXPEDITION_ID,
    instanceId: event.instanceId,
    revision: event.revision,
    status,
    stageId: idle ? null : lanternkeeperStageId(event.phase),
    memberCount: event.activeMemberCount,
    maxMembers: event.memberCapacity,
    expiresAt: event.expiresAt,
    echoAvailableAt: event.echoAvailableAt,
    resultMode: event.resultMode,
    completedTargetIds: progress.completedTargetIds,
    personal: {
      joined: mine.active,
      completedTargetIds: mine.contributedTargets,
      availableTargetIds: progress.availableTargets,
      canUseEcho: progress.canUseEcho,
    },
    serverNow: now,
  };
}
