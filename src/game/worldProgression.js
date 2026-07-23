// Pure progression rules for Afterlight's open-world quest layer.
//
// Events passed to this module are evidence, not authority. In production,
// cooperation receipts and reward-bearing writes should be verified by a
// trusted backend before the resulting state is persisted. The reducer stays
// deterministic so the same rules can run in tests, clients, and Cloud code.

export const WORLD_PROGRESSION_VERSION = 4;

export const WORLD_EVENT_TYPES = Object.freeze({
  QUEST_ACCEPTED: "quest-accepted",
  QUEST_TURNED_IN: "quest-turned-in",
  LANDMARK_VISITED: "landmark-visited",
  PLACE_ACTIVITY_COMPLETED: "place-activity-completed",
  COOPERATION_RECEIPT: "cooperation-receipt",
  PUBLIC_EVENT_SOURCE_RECEIPT: "public-event-source-receipt",
  PUBLIC_EVENT_COMPLETION_RECEIPT: "public-event-completion-receipt",
});

// The curve is deliberately simple and public: advancing from level N costs
// N * 50 XP. There are no streaks, random multipliers, paid boosts, or loss of
// progress. Quest rewards are finite and can be claimed only once.
export const XP_CURVE = Object.freeze({
  baseCost: 50,
  linearStep: 50,
  maxLevel: 50,
});

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};

export const WORLD_COSMETICS = deepFreeze([
  {
    id: "cosmetic:scarf:sunthread",
    name: "Sunthread Scarf",
    slot: "scarf",
    description: "A warm woven scarf that catches Afterlight's gold glow.",
    color: "#f5c973",
  },
  {
    id: "cosmetic:scarf:rainlight",
    name: "Rainlight Scarf",
    slot: "scarf",
    description: "A tide-teal scarf threaded with the Relay's rose afterglow.",
    color: "#71e5d0",
  },
  {
    id: "cosmetic:charm:lanternkeeper",
    name: "Lanternkeeper Charm",
    slot: "accessory",
    description:
      "A little field lantern that glows when an expedition companion is near.",
    color: "#f5c973",
  },
]);

export const WORLD_QUESTS = deepFreeze([
  {
    id: "afterlight-sunthread",
    title: "The Sunthread Signal",
    summary:
      "Help Sol carry a rain-glass signal from the Conservatory to the Resonance Garden.",
    giverNpcId: "sol",
    turnInNpcId: "sol",
    prerequisites: [],
    ordered: true,
    objectives: [
      {
        id: "reach-conservatory",
        label: "Travel to the Arrival Conservatory",
        detail: "Follow the shore lights to the glasshouse.",
        kind: "landmark",
        allowed: ["conservatory"],
        target: 1,
      },
      {
        id: "recover-rain-prism",
        label: "Recover the rain prism",
        detail: "Complete the prism activity inside the Conservatory.",
        kind: "activity",
        allowed: ["conservatory:recover-prism"],
        target: 1,
        itemId: "quest-item:rain-prism",
      },
      {
        id: "resonate-together",
        label: "Tune the prism at the Resonance Loom",
        detail:
          "Complete a duet, or follow the Echo after 90 seconds if you are alone. Leaving either route has no penalty.",
        kind: "cooperation",
        allowed: ["resonance"],
        target: 1,
      },
    ],
    rewards: {
      xp: 50,
      cosmetics: ["cosmetic:scarf:sunthread"],
    },
  },
  {
    id: "afterlight-rainlight-rising",
    title: "Rainlight Rising",
    summary:
      "Wake Juno's district relay, then help its light cross all three landmarks.",
    giverNpcId: "juno",
    turnInNpcId: "juno",
    prerequisites: ["afterlight-sunthread"],
    ordered: true,
    objectives: [
      {
        id: "wake-rainlight",
        label: "Wake the Rainlight Relay",
        detail: "Use the central beacon beside Juno in the Resonance Garden.",
        kind: "activity",
        allowed: ["resonance:wake-rainlight"],
        target: 1,
      },
      {
        id: "bank-rainlight",
        label: "Bank light at any landmark",
        detail:
          "Add one light to the live Relay. Your contribution stays banked if you leave.",
        kind: "public-event-source",
        allowed: ["rainlight-relay"],
        target: 1,
      },
      {
        id: "complete-rainlight-relay",
        label: "Complete the Rainlight Relay",
        detail:
          "Two travelers finish quickly. After 90 seconds, one traveler can visit all three sources for the same credit.",
        kind: "public-event-completion",
        allowed: ["rainlight-relay"],
        target: 1,
      },
    ],
    rewards: {
      xp: 100,
      cosmetics: ["cosmetic:scarf:rainlight"],
    },
  },
  {
    id: "afterlight-lanternkeeper-expedition",
    title: "The Lanternkeeper Expedition",
    summary:
      "Form an opt-in field party and restore Juno's trail across all three districts.",
    giverNpcId: "juno",
    turnInNpcId: "juno",
    prerequisites: ["afterlight-rainlight-rising"],
    ordered: true,
    objectives: [
      {
        id: "complete-expedition",
        label: "Complete a Lanternkeeper Expedition",
        detail:
          "Start or join at Juno's board, then follow the field markers through the Conservatory, Market, and Garden. An Echo guide opens after 90 seconds.",
        kind: "expedition",
        allowed: ["lanternkeeper-expedition"],
        target: 1,
      },
    ],
    rewards: {
      xp: 150,
      cosmetics: ["cosmetic:charm:lanternkeeper"],
    },
  },
]);

const QUESTS_BY_ID = new Map(WORLD_QUESTS.map((quest) => [quest.id, quest]));
const COSMETICS_BY_ID = new Map(
  WORLD_COSMETICS.map((cosmetic) => [cosmetic.id, cosmetic]),
);
const ACCEPTED_STATUSES = new Set([
  "active",
  "ready-to-turn-in",
  "completed",
  // Version-one prototypes used this name before explicit turn-ins existed.
  "started",
]);
const COOPERATION_MODES = new Set(["resonance", "social"]);
const PUBLIC_EVENT_IDS = new Set(["rainlight-relay"]);
const LANDMARK_IDS = new Set(
  WORLD_QUESTS.flatMap((quest) =>
    quest.objectives
      .filter((objective) => objective.kind === "landmark")
      .flatMap((objective) => objective.allowed),
  ),
);
const ACTIVITY_IDS = new Set(
  WORLD_QUESTS.flatMap((quest) =>
    quest.objectives
      .filter((objective) => objective.kind === "activity")
      .flatMap((objective) => objective.allowed),
  ),
);
const MAX_PROCESSED_EVENTS = 2048;
const MAX_XP = 25 * (XP_CURVE.maxLevel - 1) * XP_CURVE.maxLevel;

function safeText(value, maxLength = 160) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function safeTime(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function safeXp(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(Math.trunc(number), MAX_XP);
}

function sourceRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function uniqueSafeStrings(values, limit = MAX_PROCESSED_EVENTS) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => safeText(value)).filter(Boolean))]
    .sort()
    .slice(-limit);
}

function evidenceFromSource(value, allowed) {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(value?.evidence)
      ? value.evidence
      : Array.isArray(value?.seen)
        ? value.seen
        : [];
  const supplied = new Set(source.filter((entry) => typeof entry === "string"));
  return allowed.filter((entry) => supplied.has(entry));
}

function objectivesComplete(quest, progress) {
  return quest.objectives.every(
    (objective) =>
      (progress.objectives[objective.id]?.evidence?.length || 0) >=
      objective.target,
  );
}

function firstIncompleteObjective(quest, progress) {
  return (
    quest.objectives.find(
      (objective) =>
        (progress.objectives[objective.id]?.evidence?.length || 0) <
        objective.target,
    ) || null
  );
}

function sanitizeObjectives(quest, source) {
  const objectiveSource = sourceRecord(source?.objectives || source?.progress);
  const objectives = {};
  let previousComplete = true;

  quest.objectives.forEach((objective) => {
    const evidence =
      !quest.ordered || previousComplete
        ? evidenceFromSource(objectiveSource[objective.id], objective.allowed)
        : [];
    objectives[objective.id] = { evidence };
    if (evidence.length < objective.target) previousComplete = false;
  });

  return objectives;
}

function questRewardXp(questIds) {
  return WORLD_QUESTS.reduce(
    (total, quest) =>
      questIds.has(quest.id) ? total + quest.rewards.xp : total,
    0,
  );
}

function rewardCosmetics(questIds) {
  return WORLD_QUESTS.flatMap((quest) =>
    questIds.has(quest.id) ? quest.rewards.cosmetics : [],
  );
}

export function xpCostForLevel(level) {
  const safeLevel = Math.max(
    1,
    Math.min(XP_CURVE.maxLevel, Math.trunc(Number(level) || 1)),
  );
  return safeLevel >= XP_CURVE.maxLevel
    ? 0
    : XP_CURVE.baseCost + (safeLevel - 1) * XP_CURVE.linearStep;
}

export function xpToReachLevel(level) {
  const safeLevel = Math.max(
    1,
    Math.min(XP_CURVE.maxLevel, Math.trunc(Number(level) || 1)),
  );
  const advances = safeLevel - 1;
  return (
    advances * XP_CURVE.baseCost +
    (advances * (advances - 1) * XP_CURVE.linearStep) / 2
  );
}

export function levelForWorldXp(value) {
  const xp = safeXp(value);
  let level = 1;
  while (
    level < XP_CURVE.maxLevel &&
    xp >= xpToReachLevel(level + 1)
  ) {
    level += 1;
  }
  return level;
}

export function createWorldProgression(now = Date.now()) {
  const createdAt = safeTime(now, Date.now());
  const quests = {};
  WORLD_QUESTS.forEach((quest) => {
    quests[quest.id] = {
      status: quest.prerequisites.length ? "locked" : "available",
      startedAt: null,
      completedAt: null,
      objectives: Object.fromEntries(
        quest.objectives.map((objective) => [objective.id, { evidence: [] }]),
      ),
    };
  });
  return {
    version: WORLD_PROGRESSION_VERSION,
    createdAt,
    updatedAt: createdAt,
    xp: 0,
    level: 1,
    unlockedCosmetics: [],
    quests,
    processedEventIds: [],
  };
}

export function hydrateWorldProgression(value, now = Date.now()) {
  const fallback = createWorldProgression(now);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const createdAt = safeTime(value.createdAt, fallback.createdAt);
  const updatedAt = Math.max(
    createdAt,
    safeTime(value.updatedAt, createdAt),
  );
  const rawQuests = sourceRecord(value.quests || value.questProgress);
  const quests = {};
  const completedQuestIds = new Set();

  // WORLD_QUESTS is topologically ordered, so prerequisite states are known
  // before their dependents are sanitized.
  WORLD_QUESTS.forEach((quest) => {
    const source = sourceRecord(rawQuests[quest.id]);
    const objectives = sanitizeObjectives(quest, source);
    const progress = { objectives };
    const prerequisitesComplete = quest.prerequisites.every((questId) =>
      completedQuestIds.has(questId),
    );
    const suppliedStatus = safeText(source.status, 32);
    const accepted =
      ACCEPTED_STATUSES.has(suppliedStatus) ||
      (source.startedAt != null &&
        Number.isFinite(Number(source.startedAt)) &&
        Number(source.startedAt) > 0) ||
      (source.acceptedAt != null &&
        Number.isFinite(Number(source.acceptedAt)) &&
        Number(source.acceptedAt) > 0);
    const allObjectivesComplete = objectivesComplete(quest, progress);
    const suppliedCompletion = suppliedStatus === "completed";
    let status = "locked";

    if (prerequisitesComplete) {
      if (suppliedCompletion && accepted && allObjectivesComplete) {
        status = "completed";
      } else if (accepted) {
        status = allObjectivesComplete ? "ready-to-turn-in" : "active";
      } else {
        status = "available";
      }
    }

    const startedAt =
      status === "active" ||
      status === "ready-to-turn-in" ||
      status === "completed"
        ? safeTime(source.startedAt || source.acceptedAt, createdAt)
        : null;
    const completedAt =
      status === "completed"
        ? safeTime(source.completedAt, updatedAt)
        : null;

    quests[quest.id] = {
      status,
      startedAt,
      completedAt,
      objectives,
    };
    if (status === "completed") completedQuestIds.add(quest.id);
  });

  const suppliedXp = value.xp ?? value.totalXp ?? value.experience;
  const xp = Math.max(safeXp(suppliedXp), questRewardXp(completedQuestIds));
  const suppliedCosmetics = uniqueSafeStrings(
    value.unlockedCosmetics || value.cosmetics,
    WORLD_COSMETICS.length,
  ).filter((id) => COSMETICS_BY_ID.has(id));
  const unlockedCosmetics = [
    ...new Set([...suppliedCosmetics, ...rewardCosmetics(completedQuestIds)]),
  ].filter((id) => COSMETICS_BY_ID.has(id));

  return {
    version: WORLD_PROGRESSION_VERSION,
    createdAt,
    updatedAt,
    xp,
    level: levelForWorldXp(xp),
    unlockedCosmetics,
    quests,
    processedEventIds: uniqueSafeStrings(
      value.processedEventIds || value.seenEvents,
    ),
  };
}

function normalizeEvent(value, now) {
  if (!value || typeof value !== "object") return null;
  const type = value.type;
  const occurredAt = safeTime(value.occurredAt || value.completedAt, now);
  const rawId =
    value.id || value.eventId ||
    (type === WORLD_EVENT_TYPES.COOPERATION_RECEIPT
      ? value.receiptId
      : null);
  const id = safeText(rawId);
  if (!id) return null;

  if (
    type === WORLD_EVENT_TYPES.QUEST_ACCEPTED ||
    type === WORLD_EVENT_TYPES.QUEST_TURNED_IN
  ) {
    const questId = safeText(value.questId, 96);
    const npcId = safeText(value.npcId, 64);
    if (!QUESTS_BY_ID.has(questId) || !npcId) return null;
    return { type, id, eventKey: `${type}:${id}`, occurredAt, questId, npcId };
  }

  if (type === WORLD_EVENT_TYPES.LANDMARK_VISITED) {
    const landmarkId = safeText(value.landmarkId || value.placeId, 64);
    if (!LANDMARK_IDS.has(landmarkId)) return null;
    return { type, id, eventKey: `${type}:${id}`, occurredAt, landmarkId };
  }

  if (type === WORLD_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED) {
    const landmarkId = safeText(value.landmarkId || value.placeId, 64);
    const activityId = safeText(value.activityId, 96);
    const activityKey = `${landmarkId}:${activityId}`;
    if (!landmarkId || !activityId || !ACTIVITY_IDS.has(activityKey)) {
      return null;
    }
    return {
      type,
      id,
      eventKey: `${type}:${id}`,
      occurredAt,
      landmarkId,
      activityId,
      activityKey,
    };
  }

  if (type === WORLD_EVENT_TYPES.COOPERATION_RECEIPT) {
    const mode = safeText(value.mode, 32);
    const receiptId = safeText(value.receiptId || rawId);
    if (!COOPERATION_MODES.has(mode) || !receiptId) return null;
    return {
      type,
      id,
      eventKey: `${type}:${id}`,
      occurredAt,
      mode,
      receiptId,
    };
  }

  if (
    type === WORLD_EVENT_TYPES.PUBLIC_EVENT_SOURCE_RECEIPT ||
    type === WORLD_EVENT_TYPES.PUBLIC_EVENT_COMPLETION_RECEIPT
  ) {
    const publicEventId = safeText(value.publicEventId || value.eventType, 64);
    const receiptId = safeText(value.receiptId || rawId);
    if (!PUBLIC_EVENT_IDS.has(publicEventId) || !receiptId) return null;
    return {
      type,
      id,
      eventKey: `${type}:${id}`,
      occurredAt,
      publicEventId,
      receiptId,
    };
  }

  // Matchmaking, Sparks, profile views, and chat are intentionally absent:
  // they never gate quests and never award XP or cosmetics.
  return null;
}

function eventEvidenceForObjective(event, objective) {
  if (
    event.type === WORLD_EVENT_TYPES.LANDMARK_VISITED &&
    objective.kind === "landmark"
  ) {
    return event.landmarkId;
  }
  if (
    event.type === WORLD_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED &&
    objective.kind === "activity"
  ) {
    return event.activityKey;
  }
  if (
    event.type === WORLD_EVENT_TYPES.COOPERATION_RECEIPT &&
    objective.kind === "cooperation"
  ) {
    return event.mode;
  }
  if (
    event.type === WORLD_EVENT_TYPES.PUBLIC_EVENT_SOURCE_RECEIPT &&
    objective.kind === "public-event-source"
  ) {
    return event.publicEventId;
  }
  if (
    event.type === WORLD_EVENT_TYPES.PUBLIC_EVENT_COMPLETION_RECEIPT &&
    objective.kind === "public-event-completion"
  ) {
    return event.publicEventId;
  }
  return null;
}

function cloneQuests(quests) {
  return Object.fromEntries(
    WORLD_QUESTS.map((quest) => [
      quest.id,
      {
        ...quests[quest.id],
        objectives: Object.fromEntries(
          quest.objectives.map((objective) => [
            objective.id,
            {
              evidence: [
                ...(quests[quest.id]?.objectives?.[objective.id]?.evidence || []),
              ],
            },
          ]),
        ),
      },
    ]),
  );
}

function unlockEligibleQuests(quests) {
  WORLD_QUESTS.forEach((quest) => {
    const progress = quests[quest.id];
    if (
      progress.status === "locked" &&
      quest.prerequisites.every(
        (questId) => quests[questId]?.status === "completed",
      )
    ) {
      progress.status = "available";
    }
  });
}

function applyQuestReward(state, quest) {
  state.xp = safeXp(state.xp + quest.rewards.xp);
  state.level = levelForWorldXp(state.xp);
  state.unlockedCosmetics = [
    ...new Set([...state.unlockedCosmetics, ...quest.rewards.cosmetics]),
  ].filter((id) => COSMETICS_BY_ID.has(id));
}

export function applyWorldProgressionEvent(value, event, now = Date.now()) {
  const state = hydrateWorldProgression(value, now);
  const normalized = normalizeEvent(event, safeTime(now, Date.now()));
  if (!normalized || state.processedEventIds.includes(normalized.eventKey)) {
    return state;
  }

  const next = {
    ...state,
    updatedAt: Math.max(state.updatedAt, normalized.occurredAt),
    quests: cloneQuests(state.quests),
    unlockedCosmetics: [...state.unlockedCosmetics],
    processedEventIds: uniqueSafeStrings([
      ...state.processedEventIds,
      normalized.eventKey,
    ]),
  };

  if (normalized.type === WORLD_EVENT_TYPES.QUEST_ACCEPTED) {
    const definition = QUESTS_BY_ID.get(normalized.questId);
    const progress = next.quests[normalized.questId];
    if (
      progress.status === "available" &&
      definition.giverNpcId === normalized.npcId
    ) {
      progress.status = "active";
      progress.startedAt = normalized.occurredAt;
    }
    return next;
  }

  if (normalized.type === WORLD_EVENT_TYPES.QUEST_TURNED_IN) {
    const definition = QUESTS_BY_ID.get(normalized.questId);
    const progress = next.quests[normalized.questId];
    if (
      progress.status === "ready-to-turn-in" &&
      definition.turnInNpcId === normalized.npcId
    ) {
      progress.status = "completed";
      progress.completedAt = normalized.occurredAt;
      applyQuestReward(next, definition);
      unlockEligibleQuests(next.quests);
    }
    return next;
  }

  WORLD_QUESTS.forEach((quest) => {
    const progress = next.quests[quest.id];
    if (progress.status !== "active") return;
    const objectives = quest.ordered
      ? [firstIncompleteObjective(quest, progress)].filter(Boolean)
      : quest.objectives;

    objectives.forEach((objective) => {
      const evidence = eventEvidenceForObjective(normalized, objective);
      if (!evidence || !objective.allowed.includes(evidence)) return;
      const current = progress.objectives[objective.id].evidence;
      progress.objectives[objective.id].evidence = objective.allowed.filter(
        (entry) => current.includes(entry) || entry === evidence,
      );
    });

    if (objectivesComplete(quest, progress)) {
      progress.status = "ready-to-turn-in";
    }
  });

  return next;
}

export function progressionEventFromSharedReceipt(receipt) {
  if (!receipt || typeof receipt !== "object") return null;
  const mode = safeText(receipt.mode, 32);
  const matchId = safeText(receipt.matchId);
  const receiptId = safeText(receipt.id) ||
    (COOPERATION_MODES.has(mode) && matchId ? `${mode}:${matchId}` : null);
  const occurredAt = safeTime(receipt.completedAt, 0);
  if (!COOPERATION_MODES.has(mode) || !receiptId || !occurredAt) return null;
  return {
    type: WORLD_EVENT_TYPES.COOPERATION_RECEIPT,
    id: receiptId,
    receiptId,
    mode,
    occurredAt,
  };
}

function stateForSelector(value) {
  return hydrateWorldProgression(value, safeTime(value?.updatedAt, 1));
}

export function selectLevelProgress(value) {
  const state = stateForSelector(value);
  const levelStartXp = xpToReachLevel(state.level);
  const atMaxLevel = state.level >= XP_CURVE.maxLevel;
  const nextLevelXp = atMaxLevel ? null : xpToReachLevel(state.level + 1);
  const xpIntoLevel = state.xp - levelStartXp;
  const xpForNextLevel = atMaxLevel ? 0 : nextLevelXp - levelStartXp;
  const xpRemaining = atMaxLevel ? 0 : nextLevelXp - state.xp;
  return {
    level: state.level,
    totalXp: state.xp,
    levelStartXp,
    nextLevelXp,
    xpIntoLevel,
    xpForNextLevel,
    xpRemaining,
    ratio: atMaxLevel
      ? 1
      : Math.max(0, Math.min(1, xpIntoLevel / xpForNextLevel)),
    atMaxLevel,
  };
}

function objectiveProgressFromState(state, quest, objective, index) {
  const questProgress = state.quests[quest.id];
  const evidence = questProgress.objectives[objective.id]?.evidence || [];
  const current = Math.min(evidence.length, objective.target);
  const priorComplete = quest.objectives
    .slice(0, index)
    .every(
      (prior) =>
        (questProgress.objectives[prior.id]?.evidence?.length || 0) >=
        prior.target,
    );
  const complete = current >= objective.target;
  const questStarted =
    questProgress.status === "active" ||
    questProgress.status === "ready-to-turn-in" ||
    questProgress.status === "completed";
  return {
    id: objective.id,
    label: objective.label,
    detail: objective.detail,
    kind: objective.kind,
    ...(objective.itemId ? { itemId: objective.itemId } : {}),
    current,
    target: objective.target,
    remaining: Math.max(0, objective.target - current),
    ratio: Math.max(0, Math.min(1, current / objective.target)),
    complete,
    status: complete
      ? "complete"
      : questStarted && (!quest.ordered || priorComplete)
        ? "current"
        : "locked",
  };
}

function questProgressFromState(state, quest) {
  const progress = state.quests[quest.id];
  const objectives = quest.objectives.map((objective, index) =>
    objectiveProgressFromState(state, quest, objective, index),
  );
  const current = objectives.reduce(
    (total, objective) => total + objective.current,
    0,
  );
  const target = objectives.reduce(
    (total, objective) => total + objective.target,
    0,
  );
  return {
    id: quest.id,
    title: quest.title,
    summary: quest.summary,
    status: progress.status,
    giverNpcId: quest.giverNpcId,
    turnInNpcId: quest.turnInNpcId,
    startedAt: progress.startedAt,
    completedAt: progress.completedAt,
    ordered: quest.ordered,
    currentObjectiveId:
      objectives.find((objective) => objective.status === "current")?.id ||
      null,
    objectives,
    completedObjectives: objectives.filter((objective) => objective.complete)
      .length,
    totalObjectives: objectives.length,
    current,
    target,
    complete: progress.status === "completed",
    rewards: {
      xp: quest.rewards.xp,
      cosmetics: quest.rewards.cosmetics.map((id) => COSMETICS_BY_ID.get(id)),
    },
  };
}

export function selectQuestProgress(value, questId) {
  const quest = QUESTS_BY_ID.get(questId);
  if (!quest) return null;
  return questProgressFromState(stateForSelector(value), quest);
}

export function selectObjectiveProgress(value, questId, objectiveId) {
  const quest = QUESTS_BY_ID.get(questId);
  if (!quest) return null;
  const objectiveIndex = quest.objectives.findIndex(
    (objective) => objective.id === objectiveId,
  );
  if (objectiveIndex < 0) return null;
  const state = stateForSelector(value);
  return objectiveProgressFromState(
    state,
    quest,
    quest.objectives[objectiveIndex],
    objectiveIndex,
  );
}

function selectQuestsByStatus(value, statuses) {
  const state = stateForSelector(value);
  return WORLD_QUESTS.filter((quest) => statuses.has(state.quests[quest.id].status))
    .map((quest) => questProgressFromState(state, quest));
}

export function selectAvailableQuests(value) {
  return selectQuestsByStatus(value, new Set(["available"]));
}

export function selectActiveQuests(value) {
  return selectQuestsByStatus(
    value,
    new Set(["active", "ready-to-turn-in"]),
  );
}

export function selectCompletedQuests(value) {
  return selectQuestsByStatus(value, new Set(["completed"]));
}

export function selectUnlockedCosmetics(value) {
  const state = stateForSelector(value);
  const unlocked = new Set(state.unlockedCosmetics);
  return WORLD_COSMETICS.filter((cosmetic) => unlocked.has(cosmetic.id));
}
