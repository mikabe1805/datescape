const {
  RESONANCE_ECHO_QUEST_ID,
  RESONANCE_ECHO_ROOM_ID,
  RESONANCE_ECHO_WAIT_MS,
  completeResonanceEcho,
  createResonanceEchoState,
  startResonanceEcho,
} = require("../../functions/resonanceEcho");
const {
  FIRST_LIGHT_EVENT_TYPES,
  FIRST_LIGHT_NODES,
  FIRST_LIGHT_QUEST_ID,
  RESONANCE_ECHO_EVIDENCE,
  applyFirstLightClientEvent,
  applyVerifiedResonanceEchoReceipt,
  createWorldPlayerState,
  normalizeFirstLightClientEvent,
  normalizeWorldPlayerState,
  publicWorldPlayerState,
} = require("../../functions/firstLightProgression");

const UID = "echo-progression-player";

function applyClient(state, event, now) {
  const normalized = normalizeFirstLightClientEvent(event);
  expect(normalized.ok).toBe(true);
  const result = applyFirstLightClientEvent(state, normalized.event, now);
  expect(result.ok).toBe(true);
  return result.state;
}

function firstLightAtResonanceObjective() {
  let state = createWorldPlayerState(1_000);
  state = applyClient(
    state,
    {
      type: FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED,
      eventId: "echo-quest:accept",
      questId: FIRST_LIGHT_QUEST_ID,
      npcId: "sol",
    },
    2_000,
  );
  state = applyClient(
    state,
    {
      type: FIRST_LIGHT_EVENT_TYPES.LANDMARK_VISITED,
      eventId: "echo-quest:visit",
      questId: FIRST_LIGHT_QUEST_ID,
      landmarkId: "conservatory",
    },
    3_000,
  );
  state = applyClient(
    state,
    {
      type: FIRST_LIGHT_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED,
      eventId: "echo-quest:prism",
      questId: FIRST_LIGHT_QUEST_ID,
      landmarkId: "conservatory",
      activityId: "recover-prism",
    },
    4_000,
  );
  expect(state.quests[FIRST_LIGHT_QUEST_ID]).toEqual(
    expect.objectContaining({
      status: "active",
      nodeId: FIRST_LIGHT_NODES.RESONATE_TOGETHER,
    }),
  );
  return state;
}

function completedEchoReceipt(
  uid = UID,
  startedAt = 5_000,
  actionSuffix = "default",
) {
  const binding = {
    uid,
    roomId: RESONANCE_ECHO_ROOM_ID,
    questId: RESONANCE_ECHO_QUEST_ID,
  };
  const started = startResonanceEcho(
    createResonanceEchoState(),
    { ...binding, actionId: `echo:start:${actionSuffix}` },
    startedAt,
  );
  expect(started.ok).toBe(true);
  const completedAt = startedAt + RESONANCE_ECHO_WAIT_MS;
  const completed = completeResonanceEcho(
    started.state,
    { ...binding, actionId: `echo:complete:${actionSuffix}` },
    completedAt,
  );
  expect(completed.ok).toBe(true);
  return completed.receipt;
}

describe("Resonance Echo authoritative First Light progression", () => {
  it("advances only the accepted resonance objective and never grants a reward directly", () => {
    const state = firstLightAtResonanceObjective();
    const receipt = completedEchoReceipt();
    const result = applyVerifiedResonanceEchoReceipt(
      state,
      receipt,
      UID,
      receipt.verifiedAt,
    );

    expect(result).toEqual(
      expect.objectContaining({
        applied: true,
        duplicate: false,
        eligible: true,
      }),
    );
    expect(result.state.xp).toBe(0);
    expect(result.state.level).toBe(1);
    expect(result.state.unlockedCosmetics).toEqual([]);
    expect(result.state.rewardClaims).toEqual({});
    expect(result.state.verifiedResonanceEchoReceipts).toEqual([receipt]);
    expect(result.state.quests[FIRST_LIGHT_QUEST_ID]).toEqual(
      expect.objectContaining({
        status: "ready-to-turn-in",
        nodeId: FIRST_LIGHT_NODES.RETURN_TO_SOL,
      }),
    );
    expect(
      result.state.quests[FIRST_LIGHT_QUEST_ID].objectives[
        "resonate-together"
      ].evidence,
    ).toEqual([RESONANCE_ECHO_EVIDENCE]);

    // Public/client state intentionally reveals only generic completion, not
    // which availability fallback the player used.
    expect(
      publicWorldPlayerState(result.state, receipt.verifiedAt).quests[
        FIRST_LIGHT_QUEST_ID
      ].objectives["resonate-together"].evidence,
    ).toEqual(["resonance"]);
  });

  it("records one Echo receipt idempotently and still awards XP only at Sol", () => {
    let state = firstLightAtResonanceObjective();
    const receipt = completedEchoReceipt(UID, 5_000, "idempotent");
    const applied = applyVerifiedResonanceEchoReceipt(
      state,
      receipt,
      UID,
      receipt.verifiedAt,
    );
    const duplicate = applyVerifiedResonanceEchoReceipt(
      applied.state,
      receipt,
      UID,
      receipt.verifiedAt + 1,
    );

    expect(duplicate).toEqual(
      expect.objectContaining({
        applied: false,
        duplicate: true,
        eligible: true,
      }),
    );
    expect(duplicate.state.verifiedResonanceEchoReceipts).toHaveLength(1);
    expect(duplicate.state.xp).toBe(0);

    state = applyClient(
      duplicate.state,
      {
        type: FIRST_LIGHT_EVENT_TYPES.QUEST_TURNED_IN,
        eventId: "echo-quest:turn-in",
        questId: FIRST_LIGHT_QUEST_ID,
        npcId: "sol",
      },
      receipt.verifiedAt + 2,
    );
    expect(state.xp).toBe(50);
    expect(state.level).toBe(2);
    expect(state.unlockedCosmetics).toEqual([
      "cosmetic:scarf:sunthread",
    ]);
  });

  it("rejects a valid Echo receipt for the wrong authenticated uid", () => {
    const state = firstLightAtResonanceObjective();
    const receipt = completedEchoReceipt();
    const result = applyVerifiedResonanceEchoReceipt(
      state,
      receipt,
      "another-player",
      receipt.verifiedAt,
    );

    expect(result).toEqual(
      expect.objectContaining({
        applied: false,
        duplicate: false,
        eligible: false,
        reason: "invalid-receipt",
      }),
    );
    expect(result.state.xp).toBe(0);
    expect(result.state.verifiedResonanceEchoReceipts).toEqual([]);
    expect(result.state.quests[FIRST_LIGHT_QUEST_ID].nodeId).toBe(
      FIRST_LIGHT_NODES.RESONATE_TOGETHER,
    );
  });

  it("rejects malformed, future, stale, and out-of-order Echo proof", () => {
    const atObjective = firstLightAtResonanceObjective();
    const receipt = completedEchoReceipt(UID, 5_000, "strict");
    const malformed = applyVerifiedResonanceEchoReceipt(
      atObjective,
      { ...receipt, mode: "duet" },
      UID,
      receipt.verifiedAt,
    );
    expect(malformed).toEqual(
      expect.objectContaining({
        applied: false,
        eligible: false,
        reason: "invalid-receipt",
      }),
    );

    const future = applyVerifiedResonanceEchoReceipt(
      atObjective,
      receipt,
      UID,
      receipt.verifiedAt - 1,
    );
    expect(future.reason).toBe("invalid-receipt");

    const staleReceipt = completedEchoReceipt(UID, 1_500, "stale");
    const stale = applyVerifiedResonanceEchoReceipt(
      atObjective,
      staleReceipt,
      UID,
      staleReceipt.verifiedAt,
    );
    expect(stale).toEqual(
      expect.objectContaining({
        applied: false,
        duplicate: false,
        eligible: false,
      }),
    );

    const preObjectiveReceipt = completedEchoReceipt(
      UID,
      2_500,
      "pre-objective",
    );
    const preObjective = applyVerifiedResonanceEchoReceipt(
      atObjective,
      preObjectiveReceipt,
      UID,
      preObjectiveReceipt.verifiedAt,
    );
    expect(preObjective).toEqual(
      expect.objectContaining({
        applied: false,
        duplicate: false,
        eligible: false,
      }),
    );

    let beforeObjective = createWorldPlayerState(1_000);
    beforeObjective = applyClient(
      beforeObjective,
      {
        type: FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED,
        eventId: "echo-before-objective:accept",
        questId: FIRST_LIGHT_QUEST_ID,
        npcId: "sol",
      },
      2_000,
    );
    const outOfOrder = applyVerifiedResonanceEchoReceipt(
      beforeObjective,
      receipt,
      UID,
      receipt.verifiedAt,
    );
    expect(outOfOrder).toEqual(
      expect.objectContaining({
        applied: false,
        duplicate: false,
        eligible: false,
      }),
    );
    expect(beforeObjective.xp).toBe(0);
  });

  it("drops stale or future Echo proof during stored-state normalization", () => {
    const state = firstLightAtResonanceObjective();
    const staleReceipt = completedEchoReceipt(UID, 1_500, "stored-stale");
    const staleState = normalizeWorldPlayerState(
      {
        ...state,
        verifiedResonanceEchoReceipts: [staleReceipt],
      },
      staleReceipt.verifiedAt,
    );
    expect(staleState.verifiedResonanceEchoReceipts).toEqual([]);
    expect(staleState.quests[FIRST_LIGHT_QUEST_ID].nodeId).toBe(
      FIRST_LIGHT_NODES.RESONATE_TOGETHER,
    );

    const futureReceipt = completedEchoReceipt(UID, 5_000, "stored-future");
    const futureState = normalizeWorldPlayerState(
      {
        ...state,
        verifiedResonanceEchoReceipts: [futureReceipt],
      },
      futureReceipt.verifiedAt - 1,
    );
    expect(futureState.verifiedResonanceEchoReceipts).toEqual([]);
    expect(futureState.xp).toBe(0);
  });
});
