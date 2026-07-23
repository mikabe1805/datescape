const { createHash } = require("node:crypto");

const LANTERNKEEPER_EXPEDITION_VERSION = 1;
const LANTERNKEEPER_EXPEDITION_ID = "lanternkeeper-expedition";
const LANTERNKEEPER_DEFINITION_ID = "lanternkeeper-expedition-v1";
const LANTERNKEEPER_ROOM_ID = "afterlight-market-garden-v1";
const EXPEDITION_DURATION_MS = 10 * 60 * 1000;
const ECHO_DELAY_MS = 90 * 1000;
const RESONANCE_WINDOW_MS = 12 * 1000;
const MAX_ACTIVE_MEMBERS = 4;
const MAX_MEMBER_RECORDS = 8;
const MAX_PROCESSED_ACTION_IDS = 256;

const TARGET_IDS = Object.freeze([
  "conservatory-scan",
  "market-west",
  "market-east",
  "resonance-left",
  "resonance-right",
]);
const MARKET_TARGET_IDS = Object.freeze(["market-west", "market-east"]);
const RESONANCE_TARGET_IDS = Object.freeze([
  "resonance-left",
  "resonance-right",
]);
const TARGET_SET = new Set(TARGET_IDS);
const SAFE_ID = /^[A-Za-z0-9:_-]{1,160}$/;
const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;
const INSTANCE_ID_PATTERN = /^lanternkeeper-expedition:[a-f0-9]{40}$/;
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const STAGES = new Set(["conservatory", "market", "resonance", "completed"]);
const RESULT_MODES = new Set(["standard", "echo"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function positiveTime(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : null;
}

function safeRevision(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function safeUid(value) {
  return typeof value === "string" &&
    SAFE_UID.test(value) &&
    !RESERVED_KEYS.has(value)
    ? value
    : null;
}

function safeId(value) {
  return typeof value === "string" && SAFE_ID.test(value) ? value : null;
}

function emptyTargetContributions() {
  return Object.fromEntries(TARGET_IDS.map((targetId) => [targetId, {}]));
}

function emptyCompletedTargets() {
  return Object.fromEntries(TARGET_IDS.map((targetId) => [targetId, false]));
}

function ownerDigest(uid) {
  return createHash("sha256").update(uid).digest("hex").slice(0, 16);
}

function actionOwnerPrefix(uid) {
  return `expedition-action:${ownerDigest(uid)}:`;
}

function processedActionKey(uid, type, actionId) {
  const digest = createHash("sha256")
    .update(`${uid}|${type}|${actionId}`)
    .digest("hex");
  return `${actionOwnerPrefix(uid)}${digest}`;
}

function instanceIdFor(uid, actionId) {
  const digest = createHash("sha256")
    .update(`${LANTERNKEEPER_DEFINITION_ID}|${uid}|${actionId}`)
    .digest("hex")
    .slice(0, 40);
  return `${LANTERNKEEPER_EXPEDITION_ID}:${digest}`;
}

function sanitizeProcessedActionIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  value.forEach((entry) => {
    if (
      typeof entry !== "string" ||
      !/^expedition-action:[a-f0-9]{16}:[a-f0-9]{64}$/.test(entry) ||
      seen.has(entry)
    ) {
      return;
    }
    seen.add(entry);
    result.push(entry);
  });
  return result.slice(-MAX_PROCESSED_ACTION_IDS);
}

function appendProcessedAction(state, actionKey) {
  return [
    ...state.processedActionIds.filter((entry) => entry !== actionKey),
    actionKey,
  ].slice(-MAX_PROCESSED_ACTION_IDS);
}

function sanitizeMembers(value, startedAt) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([uid, member]) => [safeUid(uid), member])
      .filter(([uid, member]) => uid && isRecord(member))
      .map(([uid, member]) => {
        const joinedAt = positiveTime(member.joinedAt);
        if (!joinedAt || joinedAt < startedAt) return null;
        const active = member.active === true;
        const leftAt = active ? null : positiveTime(member.leftAt);
        return [
          uid,
          {
            joinedAt,
            active,
            leftAt: leftAt && leftAt >= joinedAt ? leftAt : null,
          },
        ];
      })
      .filter(Boolean)
      .sort(([, first], [, second]) => first.joinedAt - second.joinedAt)
      .slice(0, MAX_MEMBER_RECORDS),
  );
}

function sanitizeTargetContributions(value, members, startedAt, expiresAt) {
  const source = isRecord(value) ? value : {};
  const result = emptyTargetContributions();
  TARGET_IDS.forEach((targetId) => {
    if (!isRecord(source[targetId])) return;
    Object.entries(source[targetId])
      .map(([uid, at]) => [safeUid(uid), positiveTime(at)])
      .filter(
        ([uid, at]) =>
          uid &&
          members[uid] &&
          at &&
          at >= startedAt &&
          at <= expiresAt,
      )
      .sort(([, first], [, second]) => first - second)
      .slice(-MAX_MEMBER_RECORDS)
      .forEach(([uid, at]) => {
        result[targetId][uid] = at;
      });
  });
  return result;
}

function sanitizeCompletedTargets(value, targetContributions) {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(
    TARGET_IDS.map((targetId) => [
      targetId,
      source[targetId] === true ||
        Object.keys(targetContributions[targetId]).length > 0,
    ]),
  );
}

function createLanternkeeperExpeditionState(input, now = Date.now()) {
  const at = positiveTime(now);
  const uid = safeUid(input?.uid);
  const actionId = safeId(input?.actionId);
  const expectedRevision = safeRevision(input?.expectedRevision);
  if (!at || !uid || !actionId || expectedRevision !== 0) return null;
  const instanceId = instanceIdFor(uid, actionId);
  const actionKey = processedActionKey(uid, "start", actionId);
  return {
    version: LANTERNKEEPER_EXPEDITION_VERSION,
    expeditionId: LANTERNKEEPER_EXPEDITION_ID,
    definitionId: LANTERNKEEPER_DEFINITION_ID,
    roomId: LANTERNKEEPER_ROOM_ID,
    instanceId,
    revision: 1,
    stage: "conservatory",
    marketMode: null,
    resultMode: null,
    startedAt: at,
    echoAvailableAt: at + ECHO_DELAY_MS,
    expiresAt: at + EXPEDITION_DURATION_MS,
    completedAt: null,
    completionMemberCount: null,
    privacyTombstone: false,
    members: {
      [uid]: { joinedAt: at, active: true, leftAt: null },
    },
    memberUids: [uid],
    targetContributions: emptyTargetContributions(),
    completedTargets: emptyCompletedTargets(),
    processedActionIds: [actionKey],
  };
}

function normalizeLanternkeeperExpeditionState(value) {
  if (!isRecord(value)) return null;
  const instanceId = safeId(value.instanceId);
  const startedAt = positiveTime(value.startedAt);
  const expiresAt = positiveTime(value.expiresAt);
  if (
    !instanceId ||
    !INSTANCE_ID_PATTERN.test(instanceId) ||
    !startedAt ||
    !expiresAt ||
    expiresAt !== startedAt + EXPEDITION_DURATION_MS
  ) {
    return null;
  }
  const members = sanitizeMembers(value.members, startedAt);
  const targetContributions = sanitizeTargetContributions(
    value.targetContributions,
    members,
    startedAt,
    expiresAt,
  );
  const completedTargets = sanitizeCompletedTargets(
    value.completedTargets,
    targetContributions,
  );
  const suppliedCompletedAt = positiveTime(value.completedAt);
  const suppliedResultMode = RESULT_MODES.has(value.resultMode)
    ? value.resultMode
    : null;
  const completedAt =
    suppliedCompletedAt &&
    suppliedCompletedAt >= startedAt &&
    suppliedCompletedAt <= expiresAt &&
    suppliedResultMode
      ? suppliedCompletedAt
      : null;
  const stage = completedAt
    ? "completed"
    : STAGES.has(value.stage) && value.stage !== "completed"
      ? value.stage
      : "conservatory";
  const activeMemberCount = Object.values(members).filter(
    (member) => member.active,
  ).length;
  const suppliedCompletionMemberCount = Number(value.completionMemberCount);
  return {
    version: LANTERNKEEPER_EXPEDITION_VERSION,
    expeditionId: LANTERNKEEPER_EXPEDITION_ID,
    definitionId: LANTERNKEEPER_DEFINITION_ID,
    roomId: LANTERNKEEPER_ROOM_ID,
    instanceId,
    revision: safeRevision(value.revision),
    stage,
    marketMode:
      value.marketMode === "standard" || value.marketMode === "echo"
        ? value.marketMode
        : null,
    resultMode: completedAt ? suppliedResultMode : null,
    startedAt,
    echoAvailableAt: startedAt + ECHO_DELAY_MS,
    expiresAt,
    completedAt,
    completionMemberCount: completedAt
      ? Number.isInteger(suppliedCompletionMemberCount) &&
        suppliedCompletionMemberCount > 0
        ? Math.min(MAX_ACTIVE_MEMBERS, suppliedCompletionMemberCount)
        : Math.max(1, activeMemberCount)
      : null,
    privacyTombstone: completedAt && value.privacyTombstone === true,
    members,
    memberUids: Object.keys(members).sort(),
    targetContributions,
    completedTargets,
    processedActionIds: sanitizeProcessedActionIds(value.processedActionIds),
  };
}

function activeMemberUids(state) {
  return Object.entries(state.members)
    .filter(([, member]) => member.active)
    .map(([uid]) => uid)
    .sort();
}

function selectLanternkeeperActiveMemberUids(value) {
  const state = normalizeLanternkeeperExpeditionState(value);
  return state ? activeMemberUids(state) : [];
}

function selectLanternkeeperMemberUids(value) {
  const state = normalizeLanternkeeperExpeditionState(value);
  return state ? [...state.memberUids] : [];
}

function failure(state, code, message, extra = {}) {
  return {
    ok: false,
    applied: false,
    duplicate: false,
    completed: Boolean(state?.completedAt),
    newlyCompleted: false,
    state,
    code,
    message,
    ...extra,
  };
}

function success(state, extra = {}) {
  return {
    ok: true,
    applied: true,
    duplicate: false,
    completed: Boolean(state.completedAt),
    newlyCompleted: false,
    state,
    ...extra,
  };
}

function validateAction(input, type) {
  if (!isRecord(input)) {
    return { ok: false, code: "invalid-action", message: "Provide an expedition action." };
  }
  const uid = safeUid(input.uid);
  const actionId = safeId(input.actionId);
  const expectedRevision = Number(input.expectedRevision);
  if (!uid) return { ok: false, code: "invalid-uid", message: "Use a valid player id." };
  if (!actionId) return { ok: false, code: "invalid-action-id", message: "Use a valid action id." };
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return { ok: false, code: "invalid-revision", message: "Use the latest expedition revision." };
  }
  if (input.expeditionId !== LANTERNKEEPER_EXPEDITION_ID) {
    return { ok: false, code: "invalid-expedition", message: "Choose Lanternkeeper Expedition." };
  }
  if (input.definitionId !== LANTERNKEEPER_DEFINITION_ID) {
    return { ok: false, code: "invalid-definition", message: "Use the current expedition definition." };
  }
  if (input.roomId !== LANTERNKEEPER_ROOM_ID) {
    return { ok: false, code: "invalid-room", message: "Lanternkeeper Expedition is unavailable here." };
  }
  const instanceId = type === "start" ? null : safeId(input.instanceId);
  if (type !== "start" && !instanceId) {
    return { ok: false, code: "invalid-instance", message: "Choose an expedition instance." };
  }
  const targetId = type === "contribute" ? input.targetId : null;
  if (type === "contribute" && !TARGET_SET.has(targetId)) {
    return { ok: false, code: "invalid-target", message: "Choose an authored expedition target." };
  }
  return {
    ok: true,
    action: { type, uid, actionId, expectedRevision, instanceId, targetId },
  };
}

function prepareExistingAction(value, input, type, now) {
  const validated = validateAction(input, type);
  const state = normalizeLanternkeeperExpeditionState(value);
  if (!validated.ok) return failure(state, validated.code, validated.message);
  if (isRecord(value) && !state) {
    return failure(null, "invalid-state", "That expedition state is invalid.");
  }
  if (!state) return failure(null, "instance-not-found", "That expedition no longer exists.");
  const at = positiveTime(now);
  if (!at) return failure(state, "invalid-time", "Use a positive server timestamp.");
  const action = validated.action;
  if (action.instanceId !== state.instanceId) {
    return failure(state, "instance-mismatch", "That action belongs to another expedition.");
  }
  const actionKey = processedActionKey(action.uid, type, action.actionId);
  if (state.processedActionIds.includes(actionKey)) {
    return {
      ok: true,
      applied: false,
      duplicate: true,
      completed: Boolean(state.completedAt),
      newlyCompleted: false,
      state,
    };
  }
  if (action.expectedRevision !== state.revision) {
    return failure(state, "revision-mismatch", "Refresh the expedition before trying again.", {
      currentRevision: state.revision,
    });
  }
  return { ok: true, state, at, action, actionKey };
}

function applyLanternkeeperExpeditionStart(value, input, now = Date.now()) {
  const validated = validateAction(input, "start");
  if (!validated.ok) return failure(null, validated.code, validated.message);
  const action = validated.action;
  const actionKey = processedActionKey(action.uid, "start", action.actionId);
  const existing = normalizeLanternkeeperExpeditionState(value);
  if (isRecord(value) && !existing) {
    return failure(null, "invalid-state", "That expedition state is invalid.");
  }
  if (existing) {
    if (existing.processedActionIds.includes(actionKey)) {
      return {
        ok: true,
        applied: false,
        duplicate: true,
        completed: Boolean(existing.completedAt),
        newlyCompleted: false,
        state: existing,
      };
    }
    return failure(existing, "instance-exists", "That expedition already exists.");
  }
  const state = createLanternkeeperExpeditionState(action, now);
  if (!state) return failure(null, "invalid-time", "Use a positive server timestamp.");
  return success(state, { started: true });
}

function applyLanternkeeperExpeditionJoin(value, input, now = Date.now()) {
  const prepared = prepareExistingAction(value, input, "join", now);
  if (!prepared.ok || prepared.duplicate) return prepared;
  const { state, at, action, actionKey } = prepared;
  if (state.completedAt) return failure(state, "instance-completed", "That expedition is complete.");
  if (at >= state.expiresAt) return failure(state, "instance-expired", "That expedition has expired.");
  if (state.members[action.uid]?.active) {
    return {
      ok: true,
      applied: false,
      duplicate: false,
      completed: false,
      newlyCompleted: false,
      state,
      reason: "already-active",
    };
  }
  if (activeMemberUids(state).length >= MAX_ACTIVE_MEMBERS) {
    return failure(state, "member-capacity-reached", "That expedition already has four active members.");
  }
  if (!state.members[action.uid] && state.memberUids.length >= MAX_MEMBER_RECORDS) {
    return failure(state, "member-record-limit", "That expedition cannot accept another replacement member.");
  }
  const prior = state.members[action.uid];
  const members = {
    ...state.members,
    [action.uid]: {
      joinedAt: prior?.joinedAt || at,
      active: true,
      leftAt: null,
    },
  };
  return success({
    ...state,
    revision: state.revision + 1,
    members,
    memberUids: Object.keys(members).sort(),
    processedActionIds: appendProcessedAction(state, actionKey),
  });
}

function applyLanternkeeperExpeditionLeave(value, input, now = Date.now()) {
  const prepared = prepareExistingAction(value, input, "leave", now);
  if (!prepared.ok || prepared.duplicate) return prepared;
  const { state, at, action, actionKey } = prepared;
  const member = state.members[action.uid];
  if (!member?.active) {
    return {
      ok: true,
      applied: false,
      duplicate: false,
      completed: Boolean(state.completedAt),
      newlyCompleted: false,
      state,
      reason: "already-left",
    };
  }
  return success({
    ...state,
    revision: state.revision + 1,
    members: {
      ...state.members,
      [action.uid]: { ...member, active: false, leftAt: at },
    },
    processedActionIds: appendProcessedAction(state, actionKey),
  });
}

function pairMode(state, firstTarget, secondTarget, at, enforceWindow) {
  const joined = new Set(state.memberUids);
  const active = new Set(activeMemberUids(state));
  const first = Object.entries(state.targetContributions[firstTarget]).filter(
    ([uid]) => joined.has(uid),
  );
  const second = Object.entries(state.targetContributions[secondTarget]).filter(
    ([uid]) => joined.has(uid),
  );
  const standard = first.some(([firstUid, firstAt]) =>
    second.some(
      ([secondUid, secondAt]) =>
        firstUid !== secondUid &&
        (!enforceWindow || Math.abs(firstAt - secondAt) <= RESONANCE_WINDOW_MS),
    ),
  );
  if (standard) return "standard";
  if (at < state.echoAvailableAt) return null;
  const echoUid = [...active].find((uid) => {
    const firstAt = state.targetContributions[firstTarget][uid];
    const secondAt = state.targetContributions[secondTarget][uid];
    return Boolean(
      firstAt &&
        secondAt &&
        (!enforceWindow || Math.abs(firstAt - secondAt) <= RESONANCE_WINDOW_MS),
    );
  });
  return echoUid ? "echo" : null;
}

function allowedTargetsForStage(stage) {
  if (stage === "conservatory") return ["conservatory-scan"];
  if (stage === "market") return MARKET_TARGET_IDS;
  if (stage === "resonance") return RESONANCE_TARGET_IDS;
  return [];
}

function applyLanternkeeperExpeditionContribution(value, input, now = Date.now()) {
  const prepared = prepareExistingAction(value, input, "contribute", now);
  if (!prepared.ok || prepared.duplicate) return prepared;
  const { state, at, action, actionKey } = prepared;
  if (state.completedAt) return failure(state, "instance-completed", "That expedition is complete.");
  if (at >= state.expiresAt) return failure(state, "instance-expired", "That expedition has expired.");
  if (!state.members[action.uid]?.active) {
    return failure(state, "membership-required", "Join this expedition before contributing.");
  }
  if (!allowedTargetsForStage(state.stage).includes(action.targetId)) {
    return failure(state, "target-out-of-order", "Follow the expedition route in order.");
  }

  let targetContributions = state.targetContributions;
  let completedTargets = state.completedTargets;
  if (state.stage === "resonance") {
    const windowStart = at - RESONANCE_WINDOW_MS;
    targetContributions = {
      ...state.targetContributions,
      ...Object.fromEntries(
        RESONANCE_TARGET_IDS.map((targetId) => [
          targetId,
          Object.fromEntries(
            Object.entries(state.targetContributions[targetId]).filter(
              ([, contributedAt]) => contributedAt >= windowStart,
            ),
          ),
        ]),
      ),
    };
    completedTargets = {
      ...state.completedTargets,
      ...Object.fromEntries(
        RESONANCE_TARGET_IDS.map((targetId) => [
          targetId,
          Object.keys(targetContributions[targetId]).length > 0,
        ]),
      ),
    };
  }

  let next = {
    ...state,
    revision: state.revision + 1,
    targetContributions: {
      ...targetContributions,
      [action.targetId]: {
        ...targetContributions[action.targetId],
        [action.uid]: at,
      },
    },
    completedTargets: {
      ...completedTargets,
      [action.targetId]: true,
    },
    processedActionIds: appendProcessedAction(state, actionKey),
  };

  if (state.stage === "conservatory") {
    next.stage = "market";
  } else if (state.stage === "market") {
    const marketMode = pairMode(next, "market-west", "market-east", at, false);
    if (
      !marketMode &&
      at < state.echoAvailableAt &&
      next.targetContributions["market-west"][action.uid] &&
      next.targetContributions["market-east"][action.uid]
    ) {
      return failure(
        state,
        "echo-not-ready",
        "A second traveler can take the complementary Market pad now; the solo Echo opens after 90 seconds.",
        { echoAvailableAt: state.echoAvailableAt },
      );
    }
    if (marketMode) {
      next.stage = "resonance";
      next.marketMode = marketMode;
    }
  } else if (state.stage === "resonance") {
    const resonanceMode = pairMode(
      next,
      "resonance-left",
      "resonance-right",
      at,
      true,
    );
    if (
      !resonanceMode &&
      at < state.echoAvailableAt &&
      next.targetContributions["resonance-left"][action.uid] &&
      next.targetContributions["resonance-right"][action.uid]
    ) {
      return failure(
        state,
        "echo-not-ready",
        "A second traveler can take the complementary Resonance pad now; the solo Echo opens after 90 seconds.",
        { echoAvailableAt: state.echoAvailableAt },
      );
    }
    if (resonanceMode) {
      next.stage = "completed";
      next.completedAt = at;
      next.resultMode =
        next.marketMode === "echo" || resonanceMode === "echo"
          ? "echo"
          : "standard";
      next.completionMemberCount = activeMemberUids(next).length;
    }
  }

  return success(next, {
    newlyCompleted: Boolean(next.completedAt),
    completed: Boolean(next.completedAt),
  });
}

function publicLanternkeeperExpeditionState(value, now = Date.now()) {
  const state = normalizeLanternkeeperExpeditionState(value);
  if (!state) return null;
  const at = positiveTime(now) || 0;
  const expired = !state.completedAt && at >= state.expiresAt;
  const phase = state.completedAt ? "completed" : expired ? "expired" : state.stage;
  const activeCount = state.completedAt
    ? state.completionMemberCount
    : activeMemberUids(state).length;
  const stageIndex =
    phase === "conservatory" ? 0 : phase === "market" ? 1 : phase === "resonance" ? 2 : 3;
  const openSlots = Math.max(0, MAX_ACTIVE_MEMBERS - activeCount);
  const targetStates = Object.fromEntries(
    TARGET_IDS.map((targetId) => [targetId, state.completedTargets[targetId]]),
  );
  if (phase === "resonance") {
    const windowStart = at - RESONANCE_WINDOW_MS;
    RESONANCE_TARGET_IDS.forEach((targetId) => {
      // Route proof persists through leave/reconnect. Resonance-pad touches are
      // deliberately short-lived synchronization attempts, so a stale half
      // reopens visually even before the next contribution rolls the window.
      targetStates[targetId] = Object.values(
        state.targetContributions[targetId],
      ).some((contributedAt) => contributedAt >= windowStart);
    });
  }
  return {
    id: LANTERNKEEPER_EXPEDITION_ID,
    definitionId: LANTERNKEEPER_DEFINITION_ID,
    room: LANTERNKEEPER_ROOM_ID,
    instanceId: state.instanceId,
    revision: state.revision,
    phase,
    startedAt: state.startedAt,
    echoAvailableAt: state.echoAvailableAt,
    expiresAt: state.expiresAt,
    completedAt: state.completedAt,
    activeMemberCount: activeCount,
    memberCapacity: MAX_ACTIVE_MEMBERS,
    openSlots,
    canJoin: !state.completedAt && !expired && openSlots > 0,
    stageIndex,
    targetStates,
    resultMode: state.resultMode,
  };
}

function personalLanternkeeperExpeditionState(value, uid, now = Date.now()) {
  const state = normalizeLanternkeeperExpeditionState(value);
  const safePlayerUid = safeUid(uid);
  if (!state || !safePlayerUid) {
    return {
      instanceId: state?.instanceId || null,
      joined: false,
      active: false,
      joinedAt: null,
      leftAt: null,
      contributedTargets: [],
      availableTargets: [],
      canLeave: false,
    };
  }
  const member = state.members[safePlayerUid];
  const at = positiveTime(now) || 0;
  const open = !state.completedAt && at < state.expiresAt;
  const contributedTargets = TARGET_IDS.filter(
    (targetId) => state.targetContributions[targetId][safePlayerUid],
  );
  return {
    instanceId: state.instanceId,
    joined: Boolean(member),
    active: Boolean(member?.active),
    joinedAt: member?.joinedAt || null,
    leftAt: member?.leftAt || null,
    contributedTargets,
    availableTargets:
      open && member?.active ? [...allowedTargetsForStage(state.stage)] : [],
    canLeave: Boolean(member?.active),
  };
}

function scrubLanternkeeperExpeditionParticipant(value, uid) {
  const state = normalizeLanternkeeperExpeditionState(value);
  const safePlayerUid = safeUid(uid);
  if (!state || !safePlayerUid || !state.members[safePlayerUid]) {
    return { applied: false, state };
  }
  if (state.completedAt) {
    return {
      applied: true,
      state: {
        ...state,
        revision: state.revision + 1,
        privacyTombstone: true,
        members: {},
        memberUids: [],
        targetContributions: emptyTargetContributions(),
        processedActionIds: [],
      },
    };
  }
  const members = { ...state.members };
  delete members[safePlayerUid];
  const targetContributions = Object.fromEntries(
    TARGET_IDS.map((targetId) => {
      const contributions = { ...state.targetContributions[targetId] };
      delete contributions[safePlayerUid];
      return [targetId, contributions];
    }),
  );
  const completedTargets = {
    ...state.completedTargets,
    ...Object.fromEntries(
      allowedTargetsForStage(state.stage).map((targetId) => [
        targetId,
        Object.keys(targetContributions[targetId]).length > 0,
      ]),
    ),
  };
  const prefix = actionOwnerPrefix(safePlayerUid);
  return {
    applied: true,
    state: {
      ...state,
      revision: state.revision + 1,
      members,
      memberUids: Object.keys(members).sort(),
      targetContributions,
      completedTargets,
      processedActionIds: state.processedActionIds.filter(
        (entry) => !entry.startsWith(prefix),
      ),
    },
  };
}

module.exports = {
  ECHO_DELAY_MS,
  EXPEDITION_DURATION_MS,
  LANTERNKEEPER_DEFINITION_ID,
  LANTERNKEEPER_EXPEDITION_ID,
  LANTERNKEEPER_EXPEDITION_VERSION,
  LANTERNKEEPER_ROOM_ID,
  MARKET_TARGET_IDS,
  MAX_ACTIVE_MEMBERS,
  MAX_MEMBER_RECORDS,
  MAX_PROCESSED_ACTION_IDS,
  RESONANCE_TARGET_IDS,
  RESONANCE_WINDOW_MS,
  TARGET_IDS,
  actionOwnerPrefix,
  applyLanternkeeperExpeditionContribution,
  applyLanternkeeperExpeditionJoin,
  applyLanternkeeperExpeditionLeave,
  applyLanternkeeperExpeditionStart,
  createLanternkeeperExpeditionState,
  instanceIdFor,
  normalizeLanternkeeperExpeditionState,
  personalLanternkeeperExpeditionState,
  processedActionKey,
  publicLanternkeeperExpeditionState,
  scrubLanternkeeperExpeditionParticipant,
  selectLanternkeeperActiveMemberUids,
  selectLanternkeeperMemberUids,
};
