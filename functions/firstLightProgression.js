const {
  RESONANCE_ECHO_OBJECTIVE_ID,
  RESONANCE_ECHO_QUEST_ID,
  RESONANCE_ECHO_ROOM_ID,
  normalizeResonanceEchoReceipt,
} = require("./resonanceEcho");

const FIRST_LIGHT_QUEST_ID = "afterlight-sunthread";
const FIRST_LIGHT_REWARD_XP = 50;
const FIRST_LIGHT_REWARD_COSMETIC = "cosmetic:scarf:sunthread";
const FIRST_LIGHT_NPC_ID = "sol";
const FIRST_LIGHT_LANDMARK_ID = "conservatory";
const FIRST_LIGHT_ACTIVITY_ID = "recover-prism";
const FIRST_LIGHT_ACTIVITY_EVIDENCE = "conservatory:recover-prism";
const RESONANCE_ECHO_EVIDENCE = "resonance-echo";
const RAINLIGHT_QUEST_ID = "afterlight-rainlight-rising";
const RAINLIGHT_REWARD_XP = 100;
const RAINLIGHT_REWARD_COSMETIC = "cosmetic:scarf:rainlight";
const RAINLIGHT_NPC_ID = "juno";
const RAINLIGHT_LANDMARK_ID = "resonance";
const RAINLIGHT_ACTIVITY_ID = "wake-rainlight";
const RAINLIGHT_ACTIVITY_EVIDENCE = "resonance:wake-rainlight";
const LANTERNKEEPER_QUEST_ID = "afterlight-lanternkeeper-expedition";
const LANTERNKEEPER_REWARD_XP = 150;
const LANTERNKEEPER_REWARD_COSMETIC = "cosmetic:charm:lanternkeeper";
const LANTERNKEEPER_NPC_ID = "juno";
const LANTERNKEEPER_EXPEDITION_EVIDENCE = "lanternkeeper-expedition";
const WORLD_PROGRESSION_VERSION = 4;
const MAX_PROCESSED_EVENT_IDS = 2048;
const MAX_VERIFIED_RECEIPTS = 256;
const MAX_LEVEL = 50;
const MAX_XP = 25 * (MAX_LEVEL - 1) * MAX_LEVEL;
const SAFE_ID_PATTERN = /^[A-Za-z0-9:_-]{1,160}$/;
const RESONANCE_RECEIPT_PATTERN = /^resonance:[a-f0-9]{64}$/;
const RESONANCE_TONES = new Set(["tide", "bloom", "ember"]);
const LANTERNKEEPER_EXPEDITION_RESULT_MODES = Object.freeze([
  "standard",
  "echo",
]);
const LANTERNKEEPER_RESULT_MODES = new Set(
  LANTERNKEEPER_EXPEDITION_RESULT_MODES,
);

const FIRST_LIGHT_EVENT_TYPES = Object.freeze({
  QUEST_ACCEPTED: "quest-accepted",
  QUEST_TURNED_IN: "quest-turned-in",
  LANDMARK_VISITED: "landmark-visited",
  PLACE_ACTIVITY_COMPLETED: "place-activity-completed",
  COOPERATION_RECEIPT: "cooperation-receipt",
  RELAY_SOURCE_RECEIPT: "relay-source-receipt",
  RELAY_COMPLETION_RECEIPT: "relay-completion-receipt",
  EXPEDITION_COMPLETION_RECEIPT: "expedition-completion-receipt",
});

// The legacy name remains the callable contract. The state machine now routes
// authored quests through the same validated event surface.
const WORLD_QUEST_EVENT_TYPES = FIRST_LIGHT_EVENT_TYPES;

const FIRST_LIGHT_NODES = Object.freeze({
  ACCEPT_AT_SOL: "accept-at-sol",
  VISIT_CONSERVATORY: "visit-conservatory",
  RECOVER_RAIN_PRISM: "recover-rain-prism",
  RESONATE_TOGETHER: "resonate-together",
  RETURN_TO_SOL: "return-to-sol",
  COMPLETE: "complete",
});

const RAINLIGHT_NODES = Object.freeze({
  LOCKED: "locked",
  ACCEPT_AT_JUNO: "accept-at-juno",
  WAKE_RAINLIGHT: "wake-rainlight",
  BANK_RAINLIGHT: "bank-rainlight",
  COMPLETE_RAINLIGHT_RELAY: "complete-rainlight-relay",
  RETURN_TO_JUNO: "return-to-juno",
  COMPLETE: "complete",
});

const LANTERNKEEPER_NODES = Object.freeze({
  LOCKED: "locked",
  ACCEPT_AT_JUNO: "accept-at-juno",
  COMPLETE_EXPEDITION: "complete-expedition",
  RETURN_TO_JUNO: "return-to-juno",
  COMPLETE: "complete",
});

// Definitions are deliberately data-only and versioned. The two proven quest
// reducers remain explicit below, while new authored quests can share stable
// identity, prerequisite, NPC, objective, and reward metadata without growing
// another set of unrelated constants at every integration seam.
const WORLD_QUEST_DEFINITIONS = Object.freeze({
  [FIRST_LIGHT_QUEST_ID]: Object.freeze({
    id: FIRST_LIGHT_QUEST_ID,
    version: 1,
    npcId: FIRST_LIGHT_NPC_ID,
    prerequisiteQuestId: null,
    rewardXp: FIRST_LIGHT_REWARD_XP,
    rewardCosmetic: FIRST_LIGHT_REWARD_COSMETIC,
  }),
  [RAINLIGHT_QUEST_ID]: Object.freeze({
    id: RAINLIGHT_QUEST_ID,
    version: 1,
    npcId: RAINLIGHT_NPC_ID,
    prerequisiteQuestId: FIRST_LIGHT_QUEST_ID,
    rewardXp: RAINLIGHT_REWARD_XP,
    rewardCosmetic: RAINLIGHT_REWARD_COSMETIC,
  }),
  [LANTERNKEEPER_QUEST_ID]: Object.freeze({
    id: LANTERNKEEPER_QUEST_ID,
    version: 1,
    npcId: LANTERNKEEPER_NPC_ID,
    prerequisiteQuestId: RAINLIGHT_QUEST_ID,
    objectiveId: "complete-expedition",
    rewardXp: LANTERNKEEPER_REWARD_XP,
    rewardCosmetic: LANTERNKEEPER_REWARD_COSMETIC,
  }),
});

const RELAY_SOURCE_IDS = new Set(["conservatory", "market", "resonance"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeTime(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function safeXp(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(Math.trunc(number), MAX_XP);
}

function safeString(value, maxLength = 160) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function uniqueStrings(values, limit) {
  if (!Array.isArray(values)) return [];
  const result = [];
  const seen = new Set();
  values.forEach((value) => {
    const text = safeString(value);
    if (!text || seen.has(text)) return;
    seen.add(text);
    result.push(text);
  });
  return result.slice(-limit);
}

function levelForXp(value) {
  const xp = safeXp(value);
  let level = 1;
  let spent = 0;
  while (level < MAX_LEVEL) {
    const nextCost = level * 50;
    if (xp < spent + nextCost) break;
    spent += nextCost;
    level += 1;
  }
  return level;
}

function sanitizeProcessedEventIds(values) {
  return uniqueStrings(values, MAX_PROCESSED_EVENT_IDS).filter((id) =>
    SAFE_ID_PATTERN.test(id),
  );
}

function sanitizeVerifiedReceipts(values) {
  if (!Array.isArray(values)) return [];
  const receipts = [];
  const seen = new Set();
  values.forEach((value) => {
    if (!isRecord(value)) return;
    const id = safeString(value.id);
    const matchId = safeString(value.matchId);
    const verifiedAt = safeTime(value.verifiedAt);
    if (
      !id ||
      !RESONANCE_RECEIPT_PATTERN.test(id) ||
      !matchId ||
      !verifiedAt ||
      seen.has(id)
    ) {
      return;
    }
    seen.add(id);
    receipts.push({ id, matchId, verifiedAt });
  });
  return receipts.slice(-MAX_VERIFIED_RECEIPTS);
}

function sanitizeVerifiedRelaySourceReceipts(values) {
  if (!Array.isArray(values)) return [];
  const receipts = [];
  const seen = new Set();
  values.forEach((value) => {
    if (!isRecord(value)) return;
    const id = safeString(value.id);
    const instanceId = safeString(value.instanceId);
    const sourceId = safeString(value.sourceId, 64);
    const verifiedAt = safeTime(value.verifiedAt);
    if (
      !id ||
      !SAFE_ID_PATTERN.test(id) ||
      !instanceId ||
      !SAFE_ID_PATTERN.test(instanceId) ||
      !RELAY_SOURCE_IDS.has(sourceId) ||
      !verifiedAt ||
      seen.has(id)
    ) {
      return;
    }
    seen.add(id);
    receipts.push({ id, instanceId, sourceId, verifiedAt });
  });
  return receipts.slice(-MAX_VERIFIED_RECEIPTS);
}

function sanitizeVerifiedRelayCompletionReceipts(values) {
  if (!Array.isArray(values)) return [];
  const receipts = [];
  const seen = new Set();
  values.forEach((value) => {
    if (!isRecord(value)) return;
    const id = safeString(value.id);
    const instanceId = safeString(value.instanceId);
    const sourceIds = uniqueStrings(
      Array.isArray(value.sourceIds)
        ? value.sourceIds
        : value.sourceId
          ? [value.sourceId]
          : [],
      RELAY_SOURCE_IDS.size,
    ).filter((sourceId) => RELAY_SOURCE_IDS.has(sourceId));
    const verifiedAt = safeTime(value.verifiedAt);
    if (
      !id ||
      !SAFE_ID_PATTERN.test(id) ||
      !instanceId ||
      !SAFE_ID_PATTERN.test(instanceId) ||
      sourceIds.length === 0 ||
      !verifiedAt ||
      seen.has(id)
    ) {
      return;
    }
    seen.add(id);
    receipts.push({ id, instanceId, sourceIds, verifiedAt });
  });
  return receipts.slice(-MAX_VERIFIED_RECEIPTS);
}

function sanitizeVerifiedLanternkeeperExpeditionReceipts(values) {
  if (!Array.isArray(values)) return [];
  const receipts = [];
  const seenIds = new Set();
  const seenInstances = new Set();
  values.forEach((value) => {
    if (!isRecord(value)) return;
    const id = safeString(value.id);
    const instanceId = safeString(value.instanceId);
    const resultMode = safeString(value.resultMode, 16);
    const verifiedAt = safeTime(value.verifiedAt);
    if (
      !id ||
      !SAFE_ID_PATTERN.test(id) ||
      !instanceId ||
      !SAFE_ID_PATTERN.test(instanceId) ||
      !LANTERNKEEPER_RESULT_MODES.has(resultMode) ||
      !verifiedAt ||
      seenIds.has(id) ||
      seenInstances.has(instanceId)
    ) {
      return;
    }
    seenIds.add(id);
    seenInstances.add(instanceId);
    receipts.push({ id, instanceId, resultMode, verifiedAt });
  });
  return receipts.slice(-MAX_VERIFIED_RECEIPTS);
}

function sanitizeVerifiedResonanceEchoReceipts(values, now = Date.now()) {
  if (!Array.isArray(values)) return [];
  const receipts = [];
  const seenIds = new Set();
  const seenAttempts = new Set();
  values.forEach((value) => {
    const receipt = normalizeResonanceEchoReceipt(value);
    if (
      !receipt ||
      receipt.verifiedAt > now ||
      seenIds.has(receipt.id) ||
      seenAttempts.has(receipt.attemptId)
    ) {
      return;
    }
    seenIds.add(receipt.id);
    seenAttempts.add(receipt.attemptId);
    receipts.push(receipt);
  });
  return receipts.slice(-MAX_VERIFIED_RECEIPTS);
}

function hasEvidence(source, objectiveId, evidenceId) {
  const objective = source?.objectives?.[objectiveId];
  const evidence = Array.isArray(objective)
    ? objective
    : Array.isArray(objective?.evidence)
      ? objective.evidence
      : [];
  return evidence.includes(evidenceId);
}

function createWorldPlayerState(now = Date.now()) {
  return {
    version: WORLD_PROGRESSION_VERSION,
    createdAt: now,
    updatedAt: now,
    xp: 0,
    level: 1,
    unlockedCosmetics: [],
    rewardClaims: {},
    processedEventIds: [],
    verifiedResonanceReceipts: [],
    verifiedResonanceEchoReceipts: [],
    verifiedRelaySourceReceipts: [],
    verifiedRelayCompletionReceipts: [],
    verifiedLanternkeeperExpeditionReceipts: [],
    quests: {
      [FIRST_LIGHT_QUEST_ID]: {
        status: "available",
        nodeId: FIRST_LIGHT_NODES.ACCEPT_AT_SOL,
        startedAt: null,
        completedAt: null,
        rewardClaimed: false,
        rewardGrantedAt: null,
        objectives: {
          "reach-conservatory": { evidence: [] },
          "recover-rain-prism": { evidence: [] },
          "resonate-together": { evidence: [] },
        },
      },
      [RAINLIGHT_QUEST_ID]: {
        status: "locked",
        nodeId: RAINLIGHT_NODES.LOCKED,
        startedAt: null,
        completedAt: null,
        rewardClaimed: false,
        rewardGrantedAt: null,
        objectives: {
          "wake-rainlight": { evidence: [] },
          "bank-rainlight": { evidence: [] },
          "complete-rainlight-relay": { evidence: [] },
        },
      },
      [LANTERNKEEPER_QUEST_ID]: {
        status: "locked",
        nodeId: LANTERNKEEPER_NODES.LOCKED,
        startedAt: null,
        completedAt: null,
        rewardClaimed: false,
        rewardGrantedAt: null,
        objectives: {
          "complete-expedition": { evidence: [] },
        },
      },
    },
  };
}

function normalizeWorldPlayerState(value, now = Date.now()) {
  const source = isRecord(value) ? value : {};
  const initial = createWorldPlayerState(now);
  const firstLightSource = isRecord(source.quests?.[FIRST_LIGHT_QUEST_ID])
    ? source.quests[FIRST_LIGHT_QUEST_ID]
    : {};
  const rainlightSource = isRecord(source.quests?.[RAINLIGHT_QUEST_ID])
    ? source.quests[RAINLIGHT_QUEST_ID]
    : {};
  const lanternkeeperSource = isRecord(
    source.quests?.[LANTERNKEEPER_QUEST_ID],
  )
    ? source.quests[LANTERNKEEPER_QUEST_ID]
    : {};
  const processedEventIds = sanitizeProcessedEventIds(source.processedEventIds);
  const verifiedResonanceReceipts = sanitizeVerifiedReceipts(
    source.verifiedResonanceReceipts,
  );
  const sanitizedResonanceEchoReceipts =
    sanitizeVerifiedResonanceEchoReceipts(
      source.verifiedResonanceEchoReceipts,
      now,
    );
  const verifiedRelaySourceReceipts = sanitizeVerifiedRelaySourceReceipts(
    source.verifiedRelaySourceReceipts,
  );
  const verifiedRelayCompletionReceipts =
    sanitizeVerifiedRelayCompletionReceipts(
      source.verifiedRelayCompletionReceipts,
    );
  const verifiedLanternkeeperExpeditionReceipts =
    sanitizeVerifiedLanternkeeperExpeditionReceipts(
      source.verifiedLanternkeeperExpeditionReceipts,
    );
  const acceptedStatuses = new Set([
    "active",
    "ready-to-turn-in",
    "completed",
    "started",
  ]);
  const firstLightStartedAt = safeTime(firstLightSource.startedAt);
  const firstLightAccepted =
    Boolean(firstLightStartedAt) || acceptedStatuses.has(firstLightSource.status);
  const firstLightEffectiveStartedAt = firstLightAccepted
    ? firstLightStartedAt || safeTime(source.createdAt, now)
    : null;
  const verifiedResonanceEchoReceipts = firstLightEffectiveStartedAt
    ? sanitizedResonanceEchoReceipts.filter(
        (receipt) => receipt.startedAt >= firstLightEffectiveStartedAt,
      )
    : [];
  const visitedConservatory =
    firstLightAccepted &&
    hasEvidence(
      firstLightSource,
      "reach-conservatory",
      FIRST_LIGHT_LANDMARK_ID,
    );
  const recoveredRainPrism =
    visitedConservatory &&
    hasEvidence(
      firstLightSource,
      "recover-rain-prism",
      FIRST_LIGHT_ACTIVITY_EVIDENCE,
    );
  // Resonance evidence is authoritative only when it has a server-created,
  // match-bound receipt. A client-written objective string is never enough.
  const completedResonanceDuet =
    recoveredRainPrism && verifiedResonanceReceipts.length > 0;
  const completedResonanceEcho =
    recoveredRainPrism && verifiedResonanceEchoReceipts.length > 0;
  const completedResonance = completedResonanceDuet || completedResonanceEcho;
  const resonanceEvidence = completedResonanceDuet
    ? "resonance"
    : completedResonanceEcho
      ? RESONANCE_ECHO_EVIDENCE
      : null;
  const firstLightClaimSource = source.rewardClaims?.[FIRST_LIGHT_QUEST_ID];
  const firstLightRewardClaimed =
    completedResonance && isRecord(firstLightClaimSource);
  const firstLightCompleted =
    firstLightRewardClaimed && firstLightSource.status === "completed";

  let firstLightStatus = "available";
  let firstLightNodeId = FIRST_LIGHT_NODES.ACCEPT_AT_SOL;
  if (firstLightCompleted) {
    firstLightStatus = "completed";
    firstLightNodeId = FIRST_LIGHT_NODES.COMPLETE;
  } else if (completedResonance) {
    firstLightStatus = "ready-to-turn-in";
    firstLightNodeId = FIRST_LIGHT_NODES.RETURN_TO_SOL;
  } else if (firstLightAccepted) {
    firstLightStatus = "active";
    if (!visitedConservatory) {
      firstLightNodeId = FIRST_LIGHT_NODES.VISIT_CONSERVATORY;
    } else if (!recoveredRainPrism) {
      firstLightNodeId = FIRST_LIGHT_NODES.RECOVER_RAIN_PRISM;
    } else {
      firstLightNodeId = FIRST_LIGHT_NODES.RESONATE_TOGETHER;
    }
  }

  const rainlightUnlocked = firstLightCompleted;
  const rainlightStartedAt = safeTime(rainlightSource.startedAt);
  const rainlightAccepted =
    rainlightUnlocked &&
    (Boolean(rainlightStartedAt) ||
      acceptedStatuses.has(rainlightSource.status));
  const rainlightEffectiveStartedAt = rainlightAccepted
    ? rainlightStartedAt || safeTime(source.createdAt, now)
    : null;
  const wokeRainlight =
    rainlightAccepted &&
    hasEvidence(
      rainlightSource,
      "wake-rainlight",
      RAINLIGHT_ACTIVITY_EVIDENCE,
    );
  const bankedReceipt = wokeRainlight
    ? verifiedRelaySourceReceipts.find(
        (receipt) => receipt.verifiedAt >= rainlightEffectiveStartedAt,
      ) || null
    : null;
  const completedRelayReceipt = bankedReceipt
    ? verifiedRelayCompletionReceipts.find(
        (receipt) =>
          receipt.instanceId === bankedReceipt.instanceId &&
          receipt.verifiedAt >= bankedReceipt.verifiedAt &&
          receipt.sourceIds.includes(bankedReceipt.sourceId),
      ) || null
    : null;
  const rainlightClaimSource = source.rewardClaims?.[RAINLIGHT_QUEST_ID];
  const rainlightRewardClaimed =
    Boolean(completedRelayReceipt) && isRecord(rainlightClaimSource);
  const rainlightCompleted =
    rainlightRewardClaimed && rainlightSource.status === "completed";

  let rainlightStatus = rainlightUnlocked ? "available" : "locked";
  let rainlightNodeId = rainlightUnlocked
    ? RAINLIGHT_NODES.ACCEPT_AT_JUNO
    : RAINLIGHT_NODES.LOCKED;
  if (rainlightCompleted) {
    rainlightStatus = "completed";
    rainlightNodeId = RAINLIGHT_NODES.COMPLETE;
  } else if (completedRelayReceipt) {
    rainlightStatus = "ready-to-turn-in";
    rainlightNodeId = RAINLIGHT_NODES.RETURN_TO_JUNO;
  } else if (rainlightAccepted) {
    rainlightStatus = "active";
    if (!wokeRainlight) {
      rainlightNodeId = RAINLIGHT_NODES.WAKE_RAINLIGHT;
    } else if (!bankedReceipt) {
      rainlightNodeId = RAINLIGHT_NODES.BANK_RAINLIGHT;
    } else {
      rainlightNodeId = RAINLIGHT_NODES.COMPLETE_RAINLIGHT_RELAY;
    }
  }

  const lanternkeeperUnlocked = rainlightCompleted;
  const lanternkeeperStartedAt = safeTime(lanternkeeperSource.startedAt);
  const lanternkeeperAccepted =
    lanternkeeperUnlocked &&
    (Boolean(lanternkeeperStartedAt) ||
      acceptedStatuses.has(lanternkeeperSource.status));
  const lanternkeeperEffectiveStartedAt = lanternkeeperAccepted
    ? lanternkeeperStartedAt || safeTime(source.createdAt, now)
    : null;
  const completedExpeditionReceipt = lanternkeeperAccepted
    ? verifiedLanternkeeperExpeditionReceipts.find(
        (receipt) => receipt.verifiedAt >= lanternkeeperEffectiveStartedAt,
      ) || null
    : null;
  const lanternkeeperClaimSource =
    source.rewardClaims?.[LANTERNKEEPER_QUEST_ID];
  const lanternkeeperRewardClaimed =
    Boolean(completedExpeditionReceipt) &&
    isRecord(lanternkeeperClaimSource);
  const lanternkeeperCompleted =
    lanternkeeperRewardClaimed && lanternkeeperSource.status === "completed";

  let lanternkeeperStatus = lanternkeeperUnlocked ? "available" : "locked";
  let lanternkeeperNodeId = lanternkeeperUnlocked
    ? LANTERNKEEPER_NODES.ACCEPT_AT_JUNO
    : LANTERNKEEPER_NODES.LOCKED;
  if (lanternkeeperCompleted) {
    lanternkeeperStatus = "completed";
    lanternkeeperNodeId = LANTERNKEEPER_NODES.COMPLETE;
  } else if (completedExpeditionReceipt) {
    lanternkeeperStatus = "ready-to-turn-in";
    lanternkeeperNodeId = LANTERNKEEPER_NODES.RETURN_TO_JUNO;
  } else if (lanternkeeperAccepted) {
    lanternkeeperStatus = "active";
    lanternkeeperNodeId = LANTERNKEEPER_NODES.COMPLETE_EXPEDITION;
  }

  let xp = safeXp(source.xp);
  const unlockedCosmetics = uniqueStrings(source.unlockedCosmetics, 256);
  if (firstLightRewardClaimed) {
    xp = Math.max(xp, FIRST_LIGHT_REWARD_XP);
    if (!unlockedCosmetics.includes(FIRST_LIGHT_REWARD_COSMETIC)) {
      unlockedCosmetics.push(FIRST_LIGHT_REWARD_COSMETIC);
    }
  }
  if (rainlightRewardClaimed) {
    xp = Math.max(xp, FIRST_LIGHT_REWARD_XP + RAINLIGHT_REWARD_XP);
    if (!unlockedCosmetics.includes(RAINLIGHT_REWARD_COSMETIC)) {
      unlockedCosmetics.push(RAINLIGHT_REWARD_COSMETIC);
    }
  }
  if (lanternkeeperRewardClaimed) {
    xp = Math.max(
      xp,
      FIRST_LIGHT_REWARD_XP +
        RAINLIGHT_REWARD_XP +
        LANTERNKEEPER_REWARD_XP,
    );
    if (!unlockedCosmetics.includes(LANTERNKEEPER_REWARD_COSMETIC)) {
      unlockedCosmetics.push(LANTERNKEEPER_REWARD_COSMETIC);
    }
  }

  const rewardClaims = {};
  if (firstLightRewardClaimed) {
    rewardClaims[FIRST_LIGHT_QUEST_ID] = {
      xp: FIRST_LIGHT_REWARD_XP,
      cosmetics: [FIRST_LIGHT_REWARD_COSMETIC],
      grantedAt: safeTime(firstLightClaimSource.grantedAt, now),
    };
  }
  if (rainlightRewardClaimed) {
    rewardClaims[RAINLIGHT_QUEST_ID] = {
      xp: RAINLIGHT_REWARD_XP,
      cosmetics: [RAINLIGHT_REWARD_COSMETIC],
      grantedAt: safeTime(rainlightClaimSource.grantedAt, now),
    };
  }
  if (lanternkeeperRewardClaimed) {
    rewardClaims[LANTERNKEEPER_QUEST_ID] = {
      xp: LANTERNKEEPER_REWARD_XP,
      cosmetics: [LANTERNKEEPER_REWARD_COSMETIC],
      grantedAt: safeTime(lanternkeeperClaimSource.grantedAt, now),
    };
  }

  return {
    ...initial,
    version: WORLD_PROGRESSION_VERSION,
    createdAt: safeTime(source.createdAt, now),
    updatedAt: safeTime(source.updatedAt, now),
    xp,
    level: levelForXp(xp),
    unlockedCosmetics,
    rewardClaims,
    processedEventIds,
    verifiedResonanceReceipts,
    verifiedResonanceEchoReceipts,
    verifiedRelaySourceReceipts,
    verifiedRelayCompletionReceipts,
    verifiedLanternkeeperExpeditionReceipts,
    quests: {
      [FIRST_LIGHT_QUEST_ID]: {
        status: firstLightStatus,
        nodeId: firstLightNodeId,
        startedAt: firstLightAccepted
          ? firstLightEffectiveStartedAt
          : null,
        completedAt: firstLightCompleted
          ? safeTime(firstLightSource.completedAt, now)
          : null,
        rewardClaimed: firstLightRewardClaimed,
        rewardGrantedAt: firstLightRewardClaimed
          ? rewardClaims[FIRST_LIGHT_QUEST_ID].grantedAt
          : null,
        objectives: {
          "reach-conservatory": {
            evidence: visitedConservatory ? [FIRST_LIGHT_LANDMARK_ID] : [],
          },
          "recover-rain-prism": {
            evidence: recoveredRainPrism
              ? [FIRST_LIGHT_ACTIVITY_EVIDENCE]
              : [],
          },
          "resonate-together": {
            evidence: resonanceEvidence ? [resonanceEvidence] : [],
          },
        },
      },
      [RAINLIGHT_QUEST_ID]: {
        status: rainlightStatus,
        nodeId: rainlightNodeId,
        startedAt: rainlightAccepted ? rainlightEffectiveStartedAt : null,
        completedAt: rainlightCompleted
          ? safeTime(rainlightSource.completedAt, now)
          : null,
        rewardClaimed: rainlightRewardClaimed,
        rewardGrantedAt: rainlightRewardClaimed
          ? rewardClaims[RAINLIGHT_QUEST_ID].grantedAt
          : null,
        objectives: {
          "wake-rainlight": {
            evidence: wokeRainlight ? [RAINLIGHT_ACTIVITY_EVIDENCE] : [],
          },
          "bank-rainlight": {
            evidence: bankedReceipt ? [bankedReceipt.id] : [],
          },
          "complete-rainlight-relay": {
            evidence: completedRelayReceipt ? [completedRelayReceipt.id] : [],
          },
        },
      },
      [LANTERNKEEPER_QUEST_ID]: {
        status: lanternkeeperStatus,
        nodeId: lanternkeeperNodeId,
        startedAt: lanternkeeperAccepted
          ? lanternkeeperEffectiveStartedAt
          : null,
        completedAt: lanternkeeperCompleted
          ? safeTime(lanternkeeperSource.completedAt, now)
          : null,
        rewardClaimed: lanternkeeperRewardClaimed,
        rewardGrantedAt: lanternkeeperRewardClaimed
          ? rewardClaims[LANTERNKEEPER_QUEST_ID].grantedAt
          : null,
        objectives: {
          "complete-expedition": {
            evidence: completedExpeditionReceipt
              ? [completedExpeditionReceipt.id]
              : [],
          },
        },
      },
    },
  };
}

function normalizeFirstLightClientEvent(value) {
  if (!isRecord(value)) {
    return {
      ok: false,
      code: "invalid-argument",
      message: "Provide a quest event object.",
    };
  }
  const eventId = safeString(value.eventId);
  if (!eventId || !SAFE_ID_PATTERN.test(eventId)) {
    return {
      ok: false,
      code: "invalid-argument",
      message: "eventId must be 1-160 letters, numbers, colons, underscores, or dashes.",
    };
  }
  if (
    !Object.prototype.hasOwnProperty.call(
      WORLD_QUEST_DEFINITIONS,
      value.questId,
    )
  ) {
    return {
      ok: false,
      code: "invalid-argument",
      message: "Choose a supported Afterlight quest.",
    };
  }
  if (
    value.type === FIRST_LIGHT_EVENT_TYPES.COOPERATION_RECEIPT ||
    value.type === FIRST_LIGHT_EVENT_TYPES.RELAY_SOURCE_RECEIPT ||
    value.type === FIRST_LIGHT_EVENT_TYPES.RELAY_COMPLETION_RECEIPT ||
    value.type === FIRST_LIGHT_EVENT_TYPES.EXPEDITION_COMPLETION_RECEIPT
  ) {
    return {
      ok: false,
      code: "permission-denied",
      message:
        "Cooperation, Relay, and expedition completion are accepted only from verified server triggers.",
    };
  }

  if (value.questId === FIRST_LIGHT_QUEST_ID) {
    switch (value.type) {
      case FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED:
      case FIRST_LIGHT_EVENT_TYPES.QUEST_TURNED_IN:
        if (value.npcId !== FIRST_LIGHT_NPC_ID) {
          return {
            ok: false,
            code: "invalid-argument",
            message: "This quest must be accepted and turned in with Sol.",
          };
        }
        break;
      case FIRST_LIGHT_EVENT_TYPES.LANDMARK_VISITED:
        if (value.landmarkId !== FIRST_LIGHT_LANDMARK_ID) {
          return {
            ok: false,
            code: "invalid-argument",
            message: "The current objective requires the Conservatory landmark.",
          };
        }
        break;
      case FIRST_LIGHT_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED:
        if (
          value.landmarkId !== FIRST_LIGHT_LANDMARK_ID ||
          value.activityId !== FIRST_LIGHT_ACTIVITY_ID
        ) {
          return {
            ok: false,
            code: "invalid-argument",
            message:
              "The current objective requires the Conservatory recover-prism activity.",
          };
        }
        break;
      default:
        return {
          ok: false,
          code: "invalid-argument",
          message: "Unsupported First Light quest event type.",
        };
    }
  } else if (value.questId === RAINLIGHT_QUEST_ID) {
    switch (value.type) {
      case FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED:
      case FIRST_LIGHT_EVENT_TYPES.QUEST_TURNED_IN:
        if (value.npcId !== RAINLIGHT_NPC_ID) {
          return {
            ok: false,
            code: "invalid-argument",
            message: "This quest must be accepted and turned in with Juno.",
          };
        }
        break;
      case FIRST_LIGHT_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED:
        if (
          value.landmarkId !== RAINLIGHT_LANDMARK_ID ||
          value.activityId !== RAINLIGHT_ACTIVITY_ID
        ) {
          return {
            ok: false,
            code: "invalid-argument",
            message:
              "The current objective requires the Resonance wake-rainlight activity.",
          };
        }
        break;
      default:
        return {
          ok: false,
          code: "invalid-argument",
          message: "Unsupported Rainlight Rising quest event type.",
        };
    }
  } else {
    switch (value.type) {
      case FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED:
      case FIRST_LIGHT_EVENT_TYPES.QUEST_TURNED_IN:
        if (value.npcId !== LANTERNKEEPER_NPC_ID) {
          return {
            ok: false,
            code: "invalid-argument",
            message:
              "The Lanternkeeper Expedition must be accepted and turned in with Juno.",
          };
        }
        break;
      default:
        return {
          ok: false,
          code: "invalid-argument",
          message:
            "Only acceptance and turn-in are client-reportable for the Lanternkeeper Expedition.",
        };
    }
  }

  return {
    ok: true,
    event: {
      eventId,
      questId: value.questId,
      type: value.type,
      npcId: value.npcId || null,
      landmarkId: value.landmarkId || null,
      activityId: value.activityId || null,
    },
  };
}

function appendProcessedEvent(state, eventId) {
  state.processedEventIds = [
    ...state.processedEventIds.filter((id) => id !== eventId),
    eventId,
  ].slice(-MAX_PROCESSED_EVENT_IDS);
}

function preconditionFailure(expected) {
  return {
    ok: false,
    code: "failed-precondition",
    message: `Complete the ordered objective '${expected}' first.`,
  };
}

function grantQuestReward(state, questId, xp, cosmeticId, now) {
  const quest = state.quests[questId];
  if (quest.rewardClaimed || isRecord(state.rewardClaims[questId])) return;
  state.xp = safeXp(state.xp + xp);
  state.level = levelForXp(state.xp);
  if (!state.unlockedCosmetics.includes(cosmeticId)) {
    state.unlockedCosmetics.push(cosmeticId);
  }
  state.rewardClaims[questId] = {
    xp,
    cosmetics: [cosmeticId],
    grantedAt: now,
  };
  quest.rewardClaimed = true;
  quest.rewardGrantedAt = now;
}

function unlockRainlightQuest(state) {
  const quest = state.quests[RAINLIGHT_QUEST_ID];
  if (quest.status !== "locked") return;
  quest.status = "available";
  quest.nodeId = RAINLIGHT_NODES.ACCEPT_AT_JUNO;
}

function unlockLanternkeeperQuest(state) {
  const quest = state.quests[LANTERNKEEPER_QUEST_ID];
  if (quest.status !== "locked") return;
  quest.status = "available";
  quest.nodeId = LANTERNKEEPER_NODES.ACCEPT_AT_JUNO;
}

// Landmark and activity events are intentionally only catalog-bounded,
// client-reported evidence. They never award XP or cooperation completion.
function applyFirstLightClientEvent(value, event, now = Date.now()) {
  const state = normalizeWorldPlayerState(value, now);
  if (state.processedEventIds.includes(event.eventId)) {
    return { ok: true, state, applied: false, duplicate: true };
  }
  if (
    event.type === FIRST_LIGHT_EVENT_TYPES.COOPERATION_RECEIPT ||
    event.type === FIRST_LIGHT_EVENT_TYPES.RELAY_SOURCE_RECEIPT ||
    event.type === FIRST_LIGHT_EVENT_TYPES.RELAY_COMPLETION_RECEIPT ||
    event.type === FIRST_LIGHT_EVENT_TYPES.EXPEDITION_COMPLETION_RECEIPT
  ) {
    return {
      ok: false,
      code: "permission-denied",
      message: "Only verified server triggers can record shared completion.",
    };
  }

  const questId = event.questId || FIRST_LIGHT_QUEST_ID;
  if (questId === FIRST_LIGHT_QUEST_ID) {
    const quest = state.quests[FIRST_LIGHT_QUEST_ID];
    switch (event.type) {
      case FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED:
        if (quest.nodeId !== FIRST_LIGHT_NODES.ACCEPT_AT_SOL) {
          return preconditionFailure(FIRST_LIGHT_NODES.ACCEPT_AT_SOL);
        }
        quest.status = "active";
        quest.nodeId = FIRST_LIGHT_NODES.VISIT_CONSERVATORY;
        quest.startedAt = now;
        break;
      case FIRST_LIGHT_EVENT_TYPES.LANDMARK_VISITED:
        if (quest.nodeId !== FIRST_LIGHT_NODES.VISIT_CONSERVATORY) {
          return preconditionFailure(FIRST_LIGHT_NODES.VISIT_CONSERVATORY);
        }
        quest.objectives["reach-conservatory"].evidence = [
          FIRST_LIGHT_LANDMARK_ID,
        ];
        quest.nodeId = FIRST_LIGHT_NODES.RECOVER_RAIN_PRISM;
        break;
      case FIRST_LIGHT_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED:
        if (quest.nodeId !== FIRST_LIGHT_NODES.RECOVER_RAIN_PRISM) {
          return preconditionFailure(FIRST_LIGHT_NODES.RECOVER_RAIN_PRISM);
        }
        quest.objectives["recover-rain-prism"].evidence = [
          FIRST_LIGHT_ACTIVITY_EVIDENCE,
        ];
        quest.nodeId = FIRST_LIGHT_NODES.RESONATE_TOGETHER;
        break;
      case FIRST_LIGHT_EVENT_TYPES.QUEST_TURNED_IN:
        if (quest.nodeId !== FIRST_LIGHT_NODES.RETURN_TO_SOL) {
          return preconditionFailure(FIRST_LIGHT_NODES.RETURN_TO_SOL);
        }
        grantQuestReward(
          state,
          FIRST_LIGHT_QUEST_ID,
          FIRST_LIGHT_REWARD_XP,
          FIRST_LIGHT_REWARD_COSMETIC,
          now,
        );
        quest.status = "completed";
        quest.nodeId = FIRST_LIGHT_NODES.COMPLETE;
        quest.completedAt = now;
        unlockRainlightQuest(state);
        break;
      default:
        return {
          ok: false,
          code: "permission-denied",
          message: "Only the verified match trigger can record cooperation.",
        };
    }
  } else if (questId === RAINLIGHT_QUEST_ID) {
    const quest = state.quests[RAINLIGHT_QUEST_ID];
    switch (event.type) {
      case FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED:
        if (quest.nodeId !== RAINLIGHT_NODES.ACCEPT_AT_JUNO) {
          return preconditionFailure(RAINLIGHT_NODES.ACCEPT_AT_JUNO);
        }
        quest.status = "active";
        quest.nodeId = RAINLIGHT_NODES.WAKE_RAINLIGHT;
        quest.startedAt = now;
        break;
      case FIRST_LIGHT_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED:
        if (quest.nodeId !== RAINLIGHT_NODES.WAKE_RAINLIGHT) {
          return preconditionFailure(RAINLIGHT_NODES.WAKE_RAINLIGHT);
        }
        quest.objectives["wake-rainlight"].evidence = [
          RAINLIGHT_ACTIVITY_EVIDENCE,
        ];
        quest.nodeId = RAINLIGHT_NODES.BANK_RAINLIGHT;
        break;
      case FIRST_LIGHT_EVENT_TYPES.QUEST_TURNED_IN:
        if (quest.nodeId !== RAINLIGHT_NODES.RETURN_TO_JUNO) {
          return preconditionFailure(RAINLIGHT_NODES.RETURN_TO_JUNO);
        }
        grantQuestReward(
          state,
          RAINLIGHT_QUEST_ID,
          RAINLIGHT_REWARD_XP,
          RAINLIGHT_REWARD_COSMETIC,
          now,
        );
        quest.status = "completed";
        quest.nodeId = RAINLIGHT_NODES.COMPLETE;
        quest.completedAt = now;
        unlockLanternkeeperQuest(state);
        break;
      default:
        return {
          ok: false,
          code: "invalid-argument",
          message: "Unsupported Rainlight Rising quest event type.",
        };
    }
  } else if (questId === LANTERNKEEPER_QUEST_ID) {
    const quest = state.quests[LANTERNKEEPER_QUEST_ID];
    switch (event.type) {
      case FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED:
        if (quest.nodeId !== LANTERNKEEPER_NODES.ACCEPT_AT_JUNO) {
          return preconditionFailure(LANTERNKEEPER_NODES.ACCEPT_AT_JUNO);
        }
        quest.status = "active";
        quest.nodeId = LANTERNKEEPER_NODES.COMPLETE_EXPEDITION;
        quest.startedAt = now;
        break;
      case FIRST_LIGHT_EVENT_TYPES.QUEST_TURNED_IN:
        if (quest.nodeId !== LANTERNKEEPER_NODES.RETURN_TO_JUNO) {
          return preconditionFailure(LANTERNKEEPER_NODES.RETURN_TO_JUNO);
        }
        grantQuestReward(
          state,
          LANTERNKEEPER_QUEST_ID,
          LANTERNKEEPER_REWARD_XP,
          LANTERNKEEPER_REWARD_COSMETIC,
          now,
        );
        quest.status = "completed";
        quest.nodeId = LANTERNKEEPER_NODES.COMPLETE;
        quest.completedAt = now;
        break;
      default:
        return {
          ok: false,
          code: "permission-denied",
          message:
            "Only the verified expedition trigger can record Lanternkeeper completion.",
        };
    }
  } else {
    return {
      ok: false,
      code: "invalid-argument",
      message: "Choose a supported Afterlight quest.",
    };
  }

  appendProcessedEvent(state, event.eventId);
  state.updatedAt = now;
  return { ok: true, state, applied: true, duplicate: false };
}

function applyVerifiedResonanceReceipt(value, receipt, now = Date.now()) {
  const state = normalizeWorldPlayerState(value, now);
  const quest = state.quests[FIRST_LIGHT_QUEST_ID];
  const duplicate = state.verifiedResonanceReceipts.some(
    (entry) => entry.id === receipt.id,
  );
  if (duplicate) {
    return { state, applied: false, duplicate: true, eligible: true };
  }
  if (quest.nodeId !== FIRST_LIGHT_NODES.RESONATE_TOGETHER) {
    return { state, applied: false, duplicate: false, eligible: false };
  }

  state.verifiedResonanceReceipts = [
    ...state.verifiedResonanceReceipts,
    {
      id: receipt.id,
      matchId: receipt.matchId,
      verifiedAt: safeTime(receipt.verifiedAt, now),
    },
  ].slice(-MAX_VERIFIED_RECEIPTS);
  quest.objectives["resonate-together"].evidence = ["resonance"];
  quest.status = "ready-to-turn-in";
  quest.nodeId = FIRST_LIGHT_NODES.RETURN_TO_SOL;
  state.updatedAt = now;
  return { state, applied: true, duplicate: false, eligible: true };
}

function applyVerifiedResonanceEchoReceipt(
  value,
  receipt,
  expectedUid,
  now = Date.now(),
) {
  const state = normalizeWorldPlayerState(value, now);
  const normalizedReceipt = normalizeResonanceEchoReceipt(receipt, {
    uid: expectedUid,
    roomId: RESONANCE_ECHO_ROOM_ID,
    questId: RESONANCE_ECHO_QUEST_ID,
  });
  const appliedAt = safeTime(now);
  if (
    !normalizedReceipt ||
    !appliedAt ||
    normalizedReceipt.verifiedAt > appliedAt
  ) {
    return {
      state,
      applied: false,
      duplicate: false,
      eligible: false,
      reason: "invalid-receipt",
    };
  }

  const duplicate = state.verifiedResonanceEchoReceipts.some(
    (entry) =>
      entry.id === normalizedReceipt.id ||
      entry.attemptId === normalizedReceipt.attemptId,
  );
  if (duplicate) {
    return { state, applied: false, duplicate: true, eligible: true };
  }

  const quest = state.quests[FIRST_LIGHT_QUEST_ID];
  if (
    quest.status !== "active" ||
    quest.nodeId !== FIRST_LIGHT_NODES.RESONATE_TOGETHER ||
    !quest.startedAt ||
    normalizedReceipt.objectiveId !== RESONANCE_ECHO_OBJECTIVE_ID ||
    normalizedReceipt.startedAt < quest.startedAt ||
    normalizedReceipt.startedAt < state.updatedAt
  ) {
    return { state, applied: false, duplicate: false, eligible: false };
  }

  const xpBefore = state.xp;
  const levelBefore = state.level;
  const cosmeticsBefore = [...state.unlockedCosmetics];
  state.verifiedResonanceEchoReceipts = [
    ...state.verifiedResonanceEchoReceipts,
    normalizedReceipt,
  ].slice(-MAX_VERIFIED_RECEIPTS);
  quest.objectives[RESONANCE_ECHO_OBJECTIVE_ID].evidence = [
    RESONANCE_ECHO_EVIDENCE,
  ];
  quest.status = "ready-to-turn-in";
  quest.nodeId = FIRST_LIGHT_NODES.RETURN_TO_SOL;
  state.updatedAt = Math.max(state.updatedAt, normalizedReceipt.verifiedAt);

  // Echo verifies the same quest objective as a normal duet. Rewards remain
  // exclusively attached to the later, explicit Sol turn-in.
  state.xp = xpBefore;
  state.level = levelBefore;
  state.unlockedCosmetics = cosmeticsBefore;
  return { state, applied: true, duplicate: false, eligible: true };
}

function applyVerifiedRelaySourceReceipt(value, receipt, now = Date.now()) {
  const state = normalizeWorldPlayerState(value, now);
  const normalizedReceipt = sanitizeVerifiedRelaySourceReceipts([receipt])[0];
  if (!normalizedReceipt) {
    return {
      state,
      applied: false,
      duplicate: false,
      eligible: false,
      reason: "invalid-receipt",
    };
  }
  const duplicate = state.verifiedRelaySourceReceipts.some(
    (entry) => entry.id === normalizedReceipt.id,
  );
  if (duplicate) {
    return { state, applied: false, duplicate: true, eligible: true };
  }

  const quest = state.quests[RAINLIGHT_QUEST_ID];
  if (
    quest.status !== "active" ||
    quest.nodeId !== RAINLIGHT_NODES.BANK_RAINLIGHT ||
    normalizedReceipt.verifiedAt < state.updatedAt
  ) {
    return { state, applied: false, duplicate: false, eligible: false };
  }

  state.verifiedRelaySourceReceipts = [
    ...state.verifiedRelaySourceReceipts,
    normalizedReceipt,
  ].slice(-MAX_VERIFIED_RECEIPTS);
  quest.objectives["bank-rainlight"].evidence = [normalizedReceipt.id];
  quest.nodeId = RAINLIGHT_NODES.COMPLETE_RAINLIGHT_RELAY;
  state.updatedAt = Math.max(state.updatedAt, normalizedReceipt.verifiedAt);
  return { state, applied: true, duplicate: false, eligible: true };
}

function applyVerifiedRelayCompletionReceipt(value, receipt, now = Date.now()) {
  const state = normalizeWorldPlayerState(value, now);
  const normalizedReceipt =
    sanitizeVerifiedRelayCompletionReceipts([receipt])[0];
  if (!normalizedReceipt) {
    return {
      state,
      applied: false,
      duplicate: false,
      eligible: false,
      reason: "invalid-receipt",
    };
  }
  const duplicate = state.verifiedRelayCompletionReceipts.some(
    (entry) => entry.id === normalizedReceipt.id,
  );
  if (duplicate) {
    return { state, applied: false, duplicate: true, eligible: true };
  }

  const quest = state.quests[RAINLIGHT_QUEST_ID];
  const bankReceiptId = quest.objectives["bank-rainlight"].evidence[0];
  const bankReceipt = state.verifiedRelaySourceReceipts.find(
    (entry) => entry.id === bankReceiptId,
  );
  if (
    quest.status !== "active" ||
    quest.nodeId !== RAINLIGHT_NODES.COMPLETE_RAINLIGHT_RELAY ||
    !bankReceipt ||
    normalizedReceipt.instanceId !== bankReceipt.instanceId ||
    !normalizedReceipt.sourceIds.includes(bankReceipt.sourceId) ||
    normalizedReceipt.verifiedAt < state.updatedAt
  ) {
    return { state, applied: false, duplicate: false, eligible: false };
  }

  state.verifiedRelayCompletionReceipts = [
    ...state.verifiedRelayCompletionReceipts,
    normalizedReceipt,
  ].slice(-MAX_VERIFIED_RECEIPTS);
  quest.objectives["complete-rainlight-relay"].evidence = [
    normalizedReceipt.id,
  ];
  quest.status = "ready-to-turn-in";
  quest.nodeId = RAINLIGHT_NODES.RETURN_TO_JUNO;
  state.updatedAt = Math.max(state.updatedAt, normalizedReceipt.verifiedAt);
  return { state, applied: true, duplicate: false, eligible: true };
}

function applyVerifiedLanternkeeperExpeditionReceipt(
  value,
  receipt,
  now = Date.now(),
) {
  const state = normalizeWorldPlayerState(value, now);
  const normalizedReceipt =
    sanitizeVerifiedLanternkeeperExpeditionReceipts([receipt])[0];
  if (!normalizedReceipt) {
    return {
      state,
      applied: false,
      duplicate: false,
      eligible: false,
      reason: "invalid-receipt",
    };
  }
  const appliedAt = safeTime(now);
  if (!appliedAt || normalizedReceipt.verifiedAt > appliedAt) {
    return {
      state,
      applied: false,
      duplicate: false,
      eligible: false,
      reason: "invalid-receipt",
    };
  }

  const duplicate = state.verifiedLanternkeeperExpeditionReceipts.some(
    (entry) =>
      entry.id === normalizedReceipt.id ||
      entry.instanceId === normalizedReceipt.instanceId,
  );
  if (duplicate) {
    return { state, applied: false, duplicate: true, eligible: true };
  }

  const quest = state.quests[LANTERNKEEPER_QUEST_ID];
  if (
    quest.status !== "active" ||
    quest.nodeId !== LANTERNKEEPER_NODES.COMPLETE_EXPEDITION ||
    !quest.startedAt ||
    normalizedReceipt.verifiedAt < quest.startedAt
  ) {
    return { state, applied: false, duplicate: false, eligible: false };
  }

  state.verifiedLanternkeeperExpeditionReceipts = [
    ...state.verifiedLanternkeeperExpeditionReceipts,
    normalizedReceipt,
  ].slice(-MAX_VERIFIED_RECEIPTS);
  quest.objectives["complete-expedition"].evidence = [normalizedReceipt.id];
  quest.status = "ready-to-turn-in";
  quest.nodeId = LANTERNKEEPER_NODES.RETURN_TO_JUNO;
  state.updatedAt = Math.max(state.updatedAt, normalizedReceipt.verifiedAt);
  return { state, applied: true, duplicate: false, eligible: true };
}

function verifyResonanceCompletion(match, ackUid, acknowledgement, now = Date.now()) {
  if (!isRecord(match) || match.mode !== "resonance") {
    return { ok: false, reason: "not-a-resonance-match" };
  }
  const matchId = safeString(match.id);
  const white = safeString(match.white, 128);
  const black = safeString(match.black, 128);
  const startedAt = safeTime(match.startedAt);
  if (!matchId || !white || !black || white === black || !startedAt) {
    return { ok: false, reason: "invalid-match-identity" };
  }
  const participants = [white, black];
  if (!participants.includes(ackUid)) {
    return { ok: false, reason: "acknowledger-is-not-a-participant" };
  }
  if (
    !isRecord(acknowledgement) ||
    acknowledgement.matchId !== matchId
  ) {
    return { ok: false, reason: "acknowledgement-is-not-match-bound" };
  }
  const acknowledgedAt = safeTime(acknowledgement.acknowledgedAt);
  if (
    !acknowledgedAt ||
    acknowledgedAt < startedAt ||
    acknowledgedAt > now + 5000
  ) {
    return { ok: false, reason: "invalid-acknowledgement-time" };
  }

  for (let round = 0; round < 3; round += 1) {
    for (const uid of participants) {
      const note = match.notes?.[String(round)]?.[uid];
      const accuracy = Number(note?.accuracy);
      const at = safeTime(note?.at);
      if (
        !isRecord(note) ||
        note.matchId !== matchId ||
        !RESONANCE_TONES.has(note.tone) ||
        !Number.isFinite(accuracy) ||
        accuracy < 0 ||
        accuracy > 1 ||
        !at ||
        at > acknowledgedAt + 5000
      ) {
        return {
          ok: false,
          reason: `invalid-note:${round}:${uid}`,
        };
      }
    }
  }

  return { ok: true, matchId, participants, acknowledgedAt };
}

function publicWorldPlayerState(value, now = Date.now()) {
  const state = normalizeWorldPlayerState(value, now);
  const firstLightQuest = state.quests[FIRST_LIGHT_QUEST_ID];
  const rainlightQuest = state.quests[RAINLIGHT_QUEST_ID];
  const lanternkeeperQuest = state.quests[LANTERNKEEPER_QUEST_ID];
  const publicQuests = {
    ...state.quests,
    [FIRST_LIGHT_QUEST_ID]: {
      ...firstLightQuest,
      objectives: {
        ...firstLightQuest.objectives,
        // The client needs only objective completion. Whether proof came from
        // a normal duet or the private 90-second Echo route stays server-side.
        [RESONANCE_ECHO_OBJECTIVE_ID]: {
          evidence:
            firstLightQuest.objectives[RESONANCE_ECHO_OBJECTIVE_ID].evidence
              .length
              ? ["resonance"]
              : [],
        },
      },
    },
    [RAINLIGHT_QUEST_ID]: {
      ...rainlightQuest,
      objectives: {
        ...rainlightQuest.objectives,
        "bank-rainlight": {
          evidence: rainlightQuest.objectives["bank-rainlight"].evidence.length
            ? ["rainlight-relay"]
            : [],
        },
        "complete-rainlight-relay": {
          evidence:
            rainlightQuest.objectives["complete-rainlight-relay"].evidence
              .length
              ? ["rainlight-relay"]
              : [],
        },
      },
    },
    [LANTERNKEEPER_QUEST_ID]: {
      ...lanternkeeperQuest,
      objectives: {
        ...lanternkeeperQuest.objectives,
        "complete-expedition": {
          evidence:
            lanternkeeperQuest.objectives["complete-expedition"].evidence
              .length
              ? [LANTERNKEEPER_EXPEDITION_EVIDENCE]
              : [],
        },
      },
    },
  };
  return {
    version: state.version,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    xp: state.xp,
    level: state.level,
    unlockedCosmetics: [...state.unlockedCosmetics],
    quests: publicQuests,
  };
}

module.exports = {
  FIRST_LIGHT_ACTIVITY_ID,
  FIRST_LIGHT_EVENT_TYPES,
  FIRST_LIGHT_LANDMARK_ID,
  FIRST_LIGHT_NODES,
  FIRST_LIGHT_NPC_ID,
  FIRST_LIGHT_QUEST_ID,
  FIRST_LIGHT_REWARD_COSMETIC,
  FIRST_LIGHT_REWARD_XP,
  LANTERNKEEPER_EXPEDITION_EVIDENCE,
  LANTERNKEEPER_EXPEDITION_RESULT_MODES,
  LANTERNKEEPER_EVENT_TYPES: WORLD_QUEST_EVENT_TYPES,
  LANTERNKEEPER_NODES,
  LANTERNKEEPER_NPC_ID,
  LANTERNKEEPER_QUEST_ID,
  LANTERNKEEPER_REWARD_COSMETIC,
  LANTERNKEEPER_REWARD_XP,
  RAINLIGHT_ACTIVITY_ID,
  RAINLIGHT_ACTIVITY_EVIDENCE,
  RAINLIGHT_EVENT_TYPES: WORLD_QUEST_EVENT_TYPES,
  RAINLIGHT_LANDMARK_ID,
  RAINLIGHT_NODES,
  RAINLIGHT_NPC_ID,
  RAINLIGHT_QUEST_ID,
  RAINLIGHT_REWARD_COSMETIC,
  RAINLIGHT_REWARD_XP,
  RESONANCE_ECHO_EVIDENCE,
  RESONANCE_RECEIPT_PATTERN,
  WORLD_QUEST_EVENT_TYPES,
  WORLD_QUEST_DEFINITIONS,
  WORLD_PROGRESSION_VERSION,
  applyFirstLightClientEvent,
  applyVerifiedLanternkeeperExpeditionReceipt,
  applyVerifiedRelayCompletionReceipt,
  applyVerifiedRelaySourceReceipt,
  applyVerifiedResonanceEchoReceipt,
  applyVerifiedResonanceReceipt,
  applyWorldQuestClientEvent: applyFirstLightClientEvent,
  createWorldPlayerState,
  levelForXp,
  normalizeFirstLightClientEvent,
  normalizeWorldQuestClientEvent: normalizeFirstLightClientEvent,
  normalizeWorldPlayerState,
  publicWorldPlayerState,
  verifyResonanceCompletion,
};
