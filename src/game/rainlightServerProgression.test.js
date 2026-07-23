const {
  FIRST_LIGHT_EVENT_TYPES,
  FIRST_LIGHT_QUEST_ID,
  RAINLIGHT_ACTIVITY_EVIDENCE,
  RAINLIGHT_NODES,
  RAINLIGHT_QUEST_ID,
  RAINLIGHT_REWARD_COSMETIC,
  applyFirstLightClientEvent,
  applyVerifiedRelayCompletionReceipt,
  applyVerifiedRelaySourceReceipt,
  applyVerifiedResonanceReceipt,
  createWorldPlayerState,
  levelForXp,
  normalizeFirstLightClientEvent,
  normalizeWorldPlayerState,
  publicWorldPlayerState,
} = require("../../functions/firstLightProgression");

function applyClient(state, event, now) {
  const normalized = normalizeFirstLightClientEvent(event);
  expect(normalized.ok).toBe(true);
  const result = applyFirstLightClientEvent(state, normalized.event, now);
  expect(result.ok).toBe(true);
  return result.state;
}

function completeFirstLight(now = 1_000) {
  let state = createWorldPlayerState(now);
  state = applyClient(
    state,
    {
      type: FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED,
      eventId: "first:accept",
      questId: FIRST_LIGHT_QUEST_ID,
      npcId: "sol",
    },
    now + 100,
  );
  state = applyClient(
    state,
    {
      type: FIRST_LIGHT_EVENT_TYPES.LANDMARK_VISITED,
      eventId: "first:visit",
      questId: FIRST_LIGHT_QUEST_ID,
      landmarkId: "conservatory",
    },
    now + 200,
  );
  state = applyClient(
    state,
    {
      type: FIRST_LIGHT_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED,
      eventId: "first:prism",
      questId: FIRST_LIGHT_QUEST_ID,
      landmarkId: "conservatory",
      activityId: "recover-prism",
    },
    now + 300,
  );
  const resonance = applyVerifiedResonanceReceipt(
    state,
    {
      id: `resonance:${"a".repeat(64)}`,
      matchId: "first-light-match",
      verifiedAt: now + 400,
    },
    now + 400,
  );
  expect(resonance.applied).toBe(true);
  return applyClient(
    resonance.state,
    {
      type: FIRST_LIGHT_EVENT_TYPES.QUEST_TURNED_IN,
      eventId: "first:turn-in",
      questId: FIRST_LIGHT_QUEST_ID,
      npcId: "sol",
    },
    now + 500,
  );
}

describe("authoritative Rainlight Rising progression", () => {
  it("unlocks only after First Light and accepts only Juno's bounded events", () => {
    const initial = createWorldPlayerState(1_000);
    expect(initial.quests[RAINLIGHT_QUEST_ID]).toEqual(
      expect.objectContaining({
        status: "locked",
        nodeId: RAINLIGHT_NODES.LOCKED,
      }),
    );

    expect(
      normalizeFirstLightClientEvent({
        type: FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED,
        eventId: "rain:wrong-npc",
        questId: RAINLIGHT_QUEST_ID,
        npcId: "sol",
      }),
    ).toEqual(expect.objectContaining({ ok: false, code: "invalid-argument" }));
    expect(
      normalizeFirstLightClientEvent({
        type: FIRST_LIGHT_EVENT_TYPES.RELAY_SOURCE_RECEIPT,
        eventId: "rain:forged-source",
        questId: RAINLIGHT_QUEST_ID,
      }),
    ).toEqual(expect.objectContaining({ ok: false, code: "permission-denied" }));
    expect(
      normalizeFirstLightClientEvent({
        type: FIRST_LIGHT_EVENT_TYPES.RELAY_COMPLETION_RECEIPT,
        eventId: "rain:forged-completion",
        questId: RAINLIGHT_QUEST_ID,
      }),
    ).toEqual(expect.objectContaining({ ok: false, code: "permission-denied" }));

    const completedFirstLight = completeFirstLight();
    expect(completedFirstLight.quests[RAINLIGHT_QUEST_ID]).toEqual(
      expect.objectContaining({
        status: "available",
        nodeId: RAINLIGHT_NODES.ACCEPT_AT_JUNO,
      }),
    );

    const accepted = applyClient(
      completedFirstLight,
      {
        type: FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED,
        eventId: "rain:accept",
        questId: RAINLIGHT_QUEST_ID,
        npcId: "juno",
      },
      2_000,
    );
    expect(accepted.quests[RAINLIGHT_QUEST_ID].nodeId).toBe(
      RAINLIGHT_NODES.WAKE_RAINLIGHT,
    );
  });

  it("requires ordered trusted source and completion receipts before turn-in", () => {
    let state = completeFirstLight();
    state = applyClient(
      state,
      {
        type: FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED,
        eventId: "rain:accept:ordered",
        questId: RAINLIGHT_QUEST_ID,
        npcId: "juno",
      },
      2_000,
    );

    const prematureCompletion = applyVerifiedRelayCompletionReceipt(
      state,
      {
        id: "relay-completion:premature",
        instanceId: "relay-instance-1",
        sourceIds: ["resonance"],
        verifiedAt: 2_100,
      },
      2_100,
    );
    expect(prematureCompletion.applied).toBe(false);
    expect(prematureCompletion.eligible).toBe(false);

    state = applyClient(
      state,
      {
        type: FIRST_LIGHT_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED,
        eventId: "rain:wake",
        questId: RAINLIGHT_QUEST_ID,
        landmarkId: "resonance",
        activityId: "wake-rainlight",
      },
      2_200,
    );
    expect(
      state.quests[RAINLIGHT_QUEST_ID].objectives["wake-rainlight"].evidence,
    ).toEqual([RAINLIGHT_ACTIVITY_EVIDENCE]);
    expect(state.quests[RAINLIGHT_QUEST_ID].nodeId).toBe(
      RAINLIGHT_NODES.BANK_RAINLIGHT,
    );

    const sourceReceipt = {
      id: "relay-source:instance-1:resonance",
      instanceId: "relay-instance-1",
      sourceId: "resonance",
      verifiedAt: 2_300,
    };
    const banked = applyVerifiedRelaySourceReceipt(
      state,
      sourceReceipt,
      2_300,
    );
    expect(banked.applied).toBe(true);
    expect(banked.state.quests[RAINLIGHT_QUEST_ID].nodeId).toBe(
      RAINLIGHT_NODES.COMPLETE_RAINLIGHT_RELAY,
    );

    const duplicate = applyVerifiedRelaySourceReceipt(
      banked.state,
      sourceReceipt,
      2_400,
    );
    expect(duplicate).toEqual(
      expect.objectContaining({ applied: false, duplicate: true }),
    );

    const wrongInstance = applyVerifiedRelayCompletionReceipt(
      banked.state,
      {
        id: "relay-completion:wrong-instance",
        instanceId: "relay-instance-2",
        sourceIds: ["resonance", "market"],
        verifiedAt: 2_500,
      },
      2_500,
    );
    expect(wrongInstance.eligible).toBe(false);

    const completed = applyVerifiedRelayCompletionReceipt(
      banked.state,
      {
        id: "relay-completion:instance-1",
        instanceId: "relay-instance-1",
        sourceIds: ["resonance", "market"],
        verifiedAt: 2_600,
      },
      2_600,
    );
    expect(completed.applied).toBe(true);
    expect(completed.state.quests[RAINLIGHT_QUEST_ID].status).toBe(
      "ready-to-turn-in",
    );

    state = applyClient(
      completed.state,
      {
        type: FIRST_LIGHT_EVENT_TYPES.QUEST_TURNED_IN,
        eventId: "rain:turn-in",
        questId: RAINLIGHT_QUEST_ID,
        npcId: "juno",
      },
      2_700,
    );
    expect(state.xp).toBe(150);
    expect(state.level).toBe(3);
    expect(state.unlockedCosmetics).toEqual([
      "cosmetic:scarf:sunthread",
      RAINLIGHT_REWARD_COSMETIC,
    ]);
    expect(state.rewardClaims[RAINLIGHT_QUEST_ID]).toEqual(
      expect.objectContaining({ xp: 100, grantedAt: 2_700 }),
    );

    const replay = applyFirstLightClientEvent(
      state,
      {
        type: FIRST_LIGHT_EVENT_TYPES.QUEST_TURNED_IN,
        eventId: "rain:turn-in:again",
        questId: RAINLIGHT_QUEST_ID,
      },
      2_800,
    );
    expect(replay.ok).toBe(false);
    expect(replay.state).toBeUndefined();
    expect(state.xp).toBe(150);
  });

  it("does not retain or replay relay proof received before its current node", () => {
    let state = completeFirstLight();
    const earlyReceipt = {
      id: "relay-source:too-early",
      instanceId: "relay-instance-early",
      sourceId: "market",
      verifiedAt: 1_600,
    };
    const early = applyVerifiedRelaySourceReceipt(state, earlyReceipt, 1_600);
    expect(early.applied).toBe(false);
    expect(early.state.verifiedRelaySourceReceipts).toEqual([]);

    state = applyClient(
      state,
      {
        type: FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED,
        eventId: "rain:accept:late",
        questId: RAINLIGHT_QUEST_ID,
        npcId: "juno",
      },
      3_000,
    );
    state = applyClient(
      state,
      {
        type: FIRST_LIGHT_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED,
        eventId: "rain:wake:late",
        questId: RAINLIGHT_QUEST_ID,
        landmarkId: "resonance",
        activityId: "wake-rainlight",
      },
      3_100,
    );

    const replayedEarly = applyVerifiedRelaySourceReceipt(
      state,
      earlyReceipt,
      3_200,
    );
    expect(replayedEarly.applied).toBe(false);
    expect(replayedEarly.eligible).toBe(false);
    expect(replayedEarly.state.quests[RAINLIGHT_QUEST_ID].nodeId).toBe(
      RAINLIGHT_NODES.BANK_RAINLIGHT,
    );
  });

  it("migrates old q1-only state and keeps private receipts out of public output", () => {
    const completed = completeFirstLight();
    const legacy = {
      ...completed,
      quests: { [FIRST_LIGHT_QUEST_ID]: completed.quests[FIRST_LIGHT_QUEST_ID] },
    };
    delete legacy.verifiedRelaySourceReceipts;
    delete legacy.verifiedRelayCompletionReceipts;

    const migrated = normalizeWorldPlayerState(legacy, 4_000);
    expect(migrated.quests[RAINLIGHT_QUEST_ID].status).toBe("available");
    expect(migrated.xp).toBe(50);
    expect(levelForXp(Number.MAX_SAFE_INTEGER)).toBe(50);

    const publicState = publicWorldPlayerState(migrated, 4_000);
    expect(publicState.quests).toHaveProperty(RAINLIGHT_QUEST_ID);
    expect(publicState).not.toHaveProperty("verifiedRelaySourceReceipts");
    expect(publicState).not.toHaveProperty("verifiedRelayCompletionReceipts");
    expect(publicState).not.toHaveProperty("rewardClaims");
  });
});
