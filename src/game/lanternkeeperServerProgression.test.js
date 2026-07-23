const {
  FIRST_LIGHT_EVENT_TYPES,
  FIRST_LIGHT_QUEST_ID,
  LANTERNKEEPER_EXPEDITION_EVIDENCE,
  LANTERNKEEPER_EXPEDITION_RESULT_MODES,
  LANTERNKEEPER_NODES,
  LANTERNKEEPER_QUEST_ID,
  LANTERNKEEPER_REWARD_COSMETIC,
  LANTERNKEEPER_REWARD_XP,
  RAINLIGHT_NODES,
  RAINLIGHT_QUEST_ID,
  WORLD_PROGRESSION_VERSION,
  WORLD_QUEST_DEFINITIONS,
  applyFirstLightClientEvent,
  applyVerifiedLanternkeeperExpeditionReceipt,
  applyVerifiedRelayCompletionReceipt,
  applyVerifiedRelaySourceReceipt,
  applyVerifiedResonanceReceipt,
  createWorldPlayerState,
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
      eventId: "first:accept:lanternkeeper",
      questId: FIRST_LIGHT_QUEST_ID,
      npcId: "sol",
    },
    now + 100,
  );
  state = applyClient(
    state,
    {
      type: FIRST_LIGHT_EVENT_TYPES.LANDMARK_VISITED,
      eventId: "first:visit:lanternkeeper",
      questId: FIRST_LIGHT_QUEST_ID,
      landmarkId: "conservatory",
    },
    now + 200,
  );
  state = applyClient(
    state,
    {
      type: FIRST_LIGHT_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED,
      eventId: "first:prism:lanternkeeper",
      questId: FIRST_LIGHT_QUEST_ID,
      landmarkId: "conservatory",
      activityId: "recover-prism",
    },
    now + 300,
  );
  const resonance = applyVerifiedResonanceReceipt(
    state,
    {
      id: `resonance:${"c".repeat(64)}`,
      matchId: "lanternkeeper-first-light",
      verifiedAt: now + 400,
    },
    now + 400,
  );
  expect(resonance.applied).toBe(true);
  return applyClient(
    resonance.state,
    {
      type: FIRST_LIGHT_EVENT_TYPES.QUEST_TURNED_IN,
      eventId: "first:turnin:lanternkeeper",
      questId: FIRST_LIGHT_QUEST_ID,
      npcId: "sol",
    },
    now + 500,
  );
}

function completeRainlight(now = 2_000) {
  let state = completeFirstLight(now - 1_000);
  state = applyClient(
    state,
    {
      type: FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED,
      eventId: "rain:accept:lanternkeeper",
      questId: RAINLIGHT_QUEST_ID,
      npcId: "juno",
    },
    now,
  );
  state = applyClient(
    state,
    {
      type: FIRST_LIGHT_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED,
      eventId: "rain:wake:lanternkeeper",
      questId: RAINLIGHT_QUEST_ID,
      landmarkId: "resonance",
      activityId: "wake-rainlight",
    },
    now + 100,
  );
  const banked = applyVerifiedRelaySourceReceipt(
    state,
    {
      id: "relay-source:lanternkeeper:resonance",
      instanceId: "relay-instance-lanternkeeper",
      sourceId: "resonance",
      verifiedAt: now + 200,
    },
    now + 200,
  );
  expect(banked.applied).toBe(true);
  const completed = applyVerifiedRelayCompletionReceipt(
    banked.state,
    {
      id: "relay-completion:lanternkeeper",
      instanceId: "relay-instance-lanternkeeper",
      sourceIds: ["resonance", "market"],
      verifiedAt: now + 300,
    },
    now + 300,
  );
  expect(completed.applied).toBe(true);
  return applyClient(
    completed.state,
    {
      type: FIRST_LIGHT_EVENT_TYPES.QUEST_TURNED_IN,
      eventId: "rain:turnin:lanternkeeper",
      questId: RAINLIGHT_QUEST_ID,
      npcId: "juno",
    },
    now + 400,
  );
}

function acceptLanternkeeper(state, now = 3_000, suffix = "default") {
  return applyClient(
    state,
    {
      type: FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED,
      eventId: `lanternkeeper:accept:${suffix}`,
      questId: LANTERNKEEPER_QUEST_ID,
      npcId: "juno",
    },
    now,
  );
}

function expeditionReceipt(overrides = {}) {
  return {
    id: `lanternkeeper:${"a".repeat(64)}`,
    instanceId: "lanternkeeper-instance-1",
    resultMode: "standard",
    verifiedAt: 3_100,
    ...overrides,
  };
}

describe("authoritative Lanternkeeper Expedition progression", () => {
  it("defines a versioned third quest locked until Rainlight turn-in", () => {
    const initial = createWorldPlayerState(1_000);
    expect(initial.version).toBe(WORLD_PROGRESSION_VERSION);
    expect(WORLD_PROGRESSION_VERSION).toBe(4);
    expect(WORLD_QUEST_DEFINITIONS[LANTERNKEEPER_QUEST_ID]).toEqual(
      expect.objectContaining({
        version: 1,
        npcId: "juno",
        prerequisiteQuestId: RAINLIGHT_QUEST_ID,
        rewardXp: 150,
        rewardCosmetic: LANTERNKEEPER_REWARD_COSMETIC,
      }),
    );
    expect(initial.quests[LANTERNKEEPER_QUEST_ID]).toEqual(
      expect.objectContaining({
        status: "locked",
        nodeId: LANTERNKEEPER_NODES.LOCKED,
      }),
    );

    const afterFirstLight = completeFirstLight();
    expect(afterFirstLight.quests[RAINLIGHT_QUEST_ID].nodeId).toBe(
      RAINLIGHT_NODES.ACCEPT_AT_JUNO,
    );
    expect(afterFirstLight.quests[LANTERNKEEPER_QUEST_ID].nodeId).toBe(
      LANTERNKEEPER_NODES.LOCKED,
    );

    const lockedAcceptance = normalizeFirstLightClientEvent({
      type: FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED,
      eventId: "lanternkeeper:accept:while-locked",
      questId: LANTERNKEEPER_QUEST_ID,
      npcId: "juno",
    });
    expect(lockedAcceptance.ok).toBe(true);
    expect(
      applyFirstLightClientEvent(
        afterFirstLight,
        lockedAcceptance.event,
        2_000,
      ),
    ).toEqual(
      expect.objectContaining({ ok: false, code: "failed-precondition" }),
    );

    const afterRainlight = completeRainlight();
    expect(afterRainlight.xp).toBe(150);
    expect(afterRainlight.quests[LANTERNKEEPER_QUEST_ID]).toEqual(
      expect.objectContaining({
        status: "available",
        nodeId: LANTERNKEEPER_NODES.ACCEPT_AT_JUNO,
      }),
    );
  });

  it("allows only Juno acceptance and turn-in on the client surface", () => {
    expect(
      normalizeFirstLightClientEvent({
        type: FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED,
        eventId: "lanternkeeper:prototype-quest",
        questId: "toString",
        npcId: "juno",
      }),
    ).toEqual(expect.objectContaining({ ok: false, code: "invalid-argument" }));

    expect(
      normalizeFirstLightClientEvent({
        type: FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED,
        eventId: "lanternkeeper:wrong-npc",
        questId: LANTERNKEEPER_QUEST_ID,
        npcId: "sol",
      }),
    ).toEqual(expect.objectContaining({ ok: false, code: "invalid-argument" }));

    expect(
      normalizeFirstLightClientEvent({
        type: FIRST_LIGHT_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED,
        eventId: "lanternkeeper:forged-place",
        questId: LANTERNKEEPER_QUEST_ID,
        landmarkId: "market",
        activityId: "complete-expedition",
      }),
    ).toEqual(expect.objectContaining({ ok: false, code: "invalid-argument" }));

    expect(
      normalizeFirstLightClientEvent({
        type: FIRST_LIGHT_EVENT_TYPES.EXPEDITION_COMPLETION_RECEIPT,
        eventId: "lanternkeeper:forged-receipt",
        questId: LANTERNKEEPER_QUEST_ID,
        npcId: "juno",
      }),
    ).toEqual(
      expect.objectContaining({ ok: false, code: "permission-denied" }),
    );

    ["party-joined", "chat-sent", "match-promoted"].forEach((type) => {
      expect(
        normalizeFirstLightClientEvent({
          type,
          eventId: `lanternkeeper:no-xp:${type}`,
          questId: LANTERNKEEPER_QUEST_ID,
          npcId: "juno",
        }),
      ).toEqual(
        expect.objectContaining({ ok: false, code: "invalid-argument" }),
      );
    });

    const accepted = normalizeFirstLightClientEvent({
      type: FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED,
      eventId: "lanternkeeper:bounded-accept",
      questId: LANTERNKEEPER_QUEST_ID,
      npcId: "juno",
      members: ["forged-a", "forged-b"],
      resultMode: "standard",
      xp: 9_999,
    });
    expect(accepted).toEqual({
      ok: true,
      event: {
        eventId: "lanternkeeper:bounded-accept",
        questId: LANTERNKEEPER_QUEST_ID,
        type: FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED,
        npcId: "juno",
        landmarkId: null,
        activityId: null,
      },
    });
  });

  it.each(LANTERNKEEPER_EXPEDITION_RESULT_MODES)(
    "accepts one trusted %s expedition receipt without awarding XP",
    (resultMode) => {
      let state = acceptLanternkeeper(
        completeRainlight(),
        3_000,
        resultMode,
      );
      const beforeXp = state.xp;
      const receipt = expeditionReceipt({
        id: `lanternkeeper:${resultMode}:${"b".repeat(48)}`,
        instanceId: `lanternkeeper-instance-${resultMode}`,
        resultMode,
      });
      const completed = applyVerifiedLanternkeeperExpeditionReceipt(
        state,
        receipt,
        3_100,
      );
      expect(completed).toEqual(
        expect.objectContaining({
          applied: true,
          duplicate: false,
          eligible: true,
        }),
      );
      state = completed.state;
      expect(state.xp).toBe(beforeXp);
      expect(state.unlockedCosmetics).not.toContain(
        LANTERNKEEPER_REWARD_COSMETIC,
      );
      expect(state.verifiedLanternkeeperExpeditionReceipts).toEqual([receipt]);
      expect(state.quests[LANTERNKEEPER_QUEST_ID]).toEqual(
        expect.objectContaining({
          status: "ready-to-turn-in",
          nodeId: LANTERNKEEPER_NODES.RETURN_TO_JUNO,
        }),
      );
    },
  );

  it("rejects malformed, early, pre-acceptance, and client-forged proof", () => {
    const unlocked = completeRainlight();
    const beforeAccept = applyVerifiedLanternkeeperExpeditionReceipt(
      unlocked,
      expeditionReceipt({ verifiedAt: 2_900 }),
      2_900,
    );
    expect(beforeAccept).toEqual(
      expect.objectContaining({
        applied: false,
        duplicate: false,
        eligible: false,
      }),
    );
    expect(beforeAccept.state.verifiedLanternkeeperExpeditionReceipts).toEqual(
      [],
    );

    const accepted = acceptLanternkeeper(unlocked, 3_000, "validation");
    const invalidReceipts = [
      expeditionReceipt({ id: "spaces are unsafe" }),
      expeditionReceipt({ instanceId: "bad/instance" }),
      expeditionReceipt({ resultMode: "party" }),
      expeditionReceipt({ verifiedAt: 0 }),
      expeditionReceipt({ verifiedAt: 3_101 }),
    ];
    invalidReceipts.forEach((receipt) => {
      expect(
        applyVerifiedLanternkeeperExpeditionReceipt(
          accepted,
          receipt,
          3_100,
        ),
      ).toEqual(
        expect.objectContaining({
          applied: false,
          eligible: false,
          reason: "invalid-receipt",
        }),
      );
    });

    const early = applyVerifiedLanternkeeperExpeditionReceipt(
      accepted,
      expeditionReceipt({ verifiedAt: 2_999 }),
      3_100,
    );
    expect(early).toEqual(
      expect.objectContaining({
        applied: false,
        duplicate: false,
        eligible: false,
      }),
    );
    expect(early.state.verifiedLanternkeeperExpeditionReceipts).toEqual([]);

    const forgedDirect = applyFirstLightClientEvent(
      accepted,
      {
        type: FIRST_LIGHT_EVENT_TYPES.EXPEDITION_COMPLETION_RECEIPT,
        eventId: "lanternkeeper:direct-forgery",
        questId: LANTERNKEEPER_QUEST_ID,
      },
      3_100,
    );
    expect(forgedDirect).toEqual(
      expect.objectContaining({ ok: false, code: "permission-denied" }),
    );
    expect(accepted.xp).toBe(150);
  });

  it("deduplicates by receipt and instance, then grants exactly 150 XP once", () => {
    let state = acceptLanternkeeper(completeRainlight(), 3_000, "reward");
    const receipt = expeditionReceipt();
    const completion = applyVerifiedLanternkeeperExpeditionReceipt(
      state,
      receipt,
      3_100,
    );
    expect(completion.applied).toBe(true);

    const duplicateId = applyVerifiedLanternkeeperExpeditionReceipt(
      completion.state,
      receipt,
      3_200,
    );
    expect(duplicateId).toEqual(
      expect.objectContaining({ applied: false, duplicate: true }),
    );
    const duplicateInstance = applyVerifiedLanternkeeperExpeditionReceipt(
      completion.state,
      expeditionReceipt({
        id: `lanternkeeper:${"d".repeat(64)}`,
        resultMode: "echo",
      }),
      3_200,
    );
    expect(duplicateInstance).toEqual(
      expect.objectContaining({ applied: false, duplicate: true }),
    );

    state = applyClient(
      completion.state,
      {
        type: FIRST_LIGHT_EVENT_TYPES.QUEST_TURNED_IN,
        eventId: "lanternkeeper:turnin:reward",
        questId: LANTERNKEEPER_QUEST_ID,
        npcId: "juno",
      },
      3_300,
    );
    expect(LANTERNKEEPER_REWARD_XP).toBe(150);
    expect(state.xp).toBe(300);
    expect(state.level).toBe(4);
    expect(state.unlockedCosmetics).toEqual([
      "cosmetic:scarf:sunthread",
      "cosmetic:scarf:rainlight",
      LANTERNKEEPER_REWARD_COSMETIC,
    ]);
    expect(state.rewardClaims[LANTERNKEEPER_QUEST_ID]).toEqual({
      xp: 150,
      cosmetics: [LANTERNKEEPER_REWARD_COSMETIC],
      grantedAt: 3_300,
    });

    const replay = applyFirstLightClientEvent(
      state,
      {
        type: FIRST_LIGHT_EVENT_TYPES.QUEST_TURNED_IN,
        eventId: "lanternkeeper:turnin:reward-again",
        questId: LANTERNKEEPER_QUEST_ID,
        npcId: "juno",
      },
      3_400,
    );
    expect(replay).toEqual(
      expect.objectContaining({ ok: false, code: "failed-precondition" }),
    );
    expect(normalizeWorldPlayerState(state, 4_000).xp).toBe(300);
  });

  it("migrates pre-v4 state and redacts private expedition receipt details", () => {
    const completedRainlight = completeRainlight();
    const legacy = {
      ...completedRainlight,
      version: 3,
      quests: {
        [FIRST_LIGHT_QUEST_ID]: completedRainlight.quests[FIRST_LIGHT_QUEST_ID],
        [RAINLIGHT_QUEST_ID]: completedRainlight.quests[RAINLIGHT_QUEST_ID],
      },
    };
    delete legacy.verifiedLanternkeeperExpeditionReceipts;
    const migrated = normalizeWorldPlayerState(legacy, 4_000);
    expect(migrated.version).toBe(4);
    expect(migrated.verifiedLanternkeeperExpeditionReceipts).toEqual([]);
    expect(migrated.quests[LANTERNKEEPER_QUEST_ID]).toEqual(
      expect.objectContaining({
        status: "available",
        nodeId: LANTERNKEEPER_NODES.ACCEPT_AT_JUNO,
      }),
    );

    let state = acceptLanternkeeper(migrated, 4_100, "redaction");
    const receipt = expeditionReceipt({
      id: `lanternkeeper:${"e".repeat(64)}`,
      instanceId: "private-expedition-instance",
      resultMode: "echo",
      verifiedAt: 4_200,
    });
    state = applyVerifiedLanternkeeperExpeditionReceipt(
      state,
      receipt,
      4_200,
    ).state;
    const publicState = publicWorldPlayerState(state, 4_300);
    expect(publicState).not.toHaveProperty(
      "verifiedLanternkeeperExpeditionReceipts",
    );
    expect(publicState).not.toHaveProperty("rewardClaims");
    expect(
      publicState.quests[LANTERNKEEPER_QUEST_ID].objectives[
        "complete-expedition"
      ].evidence,
    ).toEqual([LANTERNKEEPER_EXPEDITION_EVIDENCE]);
    const publicJson = JSON.stringify(publicState);
    expect(publicJson).not.toContain(receipt.id);
    expect(publicJson).not.toContain(receipt.instanceId);
    expect(publicJson).not.toContain(receipt.resultMode);
  });
});
