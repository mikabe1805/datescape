import {
  WORLD_COSMETICS,
  WORLD_EVENT_TYPES,
  WORLD_PROGRESSION_VERSION,
  WORLD_QUESTS,
  applyWorldProgressionEvent,
  createWorldProgression,
  hydrateWorldProgression,
  levelForWorldXp,
  progressionEventFromSharedReceipt,
  selectActiveQuests,
  selectAvailableQuests,
  selectCompletedQuests,
  selectLevelProgress,
  selectObjectiveProgress,
  selectQuestProgress,
  selectUnlockedCosmetics,
  xpCostForLevel,
  xpToReachLevel,
} from "./worldProgression";

const SUNTHREAD_ID = "afterlight-sunthread";
const RAINLIGHT_ID = "afterlight-rainlight-rising";
const LANTERNKEEPER_ID = "afterlight-lanternkeeper-expedition";

function questNpc(questId) {
  return questId === SUNTHREAD_ID ? "sol" : "juno";
}

function apply(state, event, occurredAt) {
  return applyWorldProgressionEvent(
    state,
    { ...event, occurredAt },
    occurredAt,
  );
}

function accept(state, questId, eventId, occurredAt) {
  return apply(
    state,
    {
      type: WORLD_EVENT_TYPES.QUEST_ACCEPTED,
      id: eventId,
      questId,
      npcId: questNpc(questId),
    },
    occurredAt,
  );
}

function turnIn(state, questId, eventId, occurredAt) {
  return apply(
    state,
    {
      type: WORLD_EVENT_TYPES.QUEST_TURNED_IN,
      id: eventId,
      questId,
      npcId: questNpc(questId),
    },
    occurredAt,
  );
}

function finishSunthreadObjectives(state, startAt = 3_000) {
  let next = apply(
    state,
    {
      type: WORLD_EVENT_TYPES.LANDMARK_VISITED,
      id: "visit-conservatory",
      landmarkId: "conservatory",
    },
    startAt,
  );
  next = apply(
    next,
    {
      type: WORLD_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED,
      id: "recover-prism",
      landmarkId: "conservatory",
      activityId: "recover-prism",
    },
    startAt + 1,
  );
  return apply(
    next,
    {
      type: WORLD_EVENT_TYPES.COOPERATION_RECEIPT,
      id: "resonance:duet-one",
      receiptId: "resonance:duet-one",
      mode: "resonance",
    },
    startAt + 2,
  );
}

function completeSunthread(now = 1_000) {
  let state = createWorldProgression(now);
  state = accept(state, SUNTHREAD_ID, "accept-sunthread", now + 1);
  state = finishSunthreadObjectives(state, now + 2);
  return turnIn(state, SUNTHREAD_ID, "turn-in-sunthread", now + 5);
}

describe("open-world RPG progression", () => {
  it("publishes a transparent linear XP curve and starts with a quest to accept", () => {
    const state = createWorldProgression(1_000);

    expect(xpCostForLevel(1)).toBe(50);
    expect(xpCostForLevel(2)).toBe(100);
    expect(xpCostForLevel(3)).toBe(150);
    expect(xpToReachLevel(1)).toBe(0);
    expect(xpToReachLevel(2)).toBe(50);
    expect(xpToReachLevel(3)).toBe(150);
    expect(levelForWorldXp(149)).toBe(2);
    expect(levelForWorldXp(150)).toBe(3);
    expect(selectLevelProgress(state)).toEqual({
      level: 1,
      totalXp: 0,
      levelStartXp: 0,
      nextLevelXp: 50,
      xpIntoLevel: 0,
      xpForNextLevel: 50,
      xpRemaining: 50,
      ratio: 0,
      atMaxLevel: false,
    });
    expect(selectAvailableQuests(state).map((quest) => quest.id)).toEqual([
      SUNTHREAD_ID,
    ]);
    expect(selectActiveQuests(state)).toEqual([]);
    expect(state.quests[RAINLIGHT_ID].status).toBe("locked");
  });

  it("enforces accept, ordered objectives, and an explicit Sol turn-in", () => {
    let state = createWorldProgression(1_000);

    state = apply(
      state,
      {
        type: WORLD_EVENT_TYPES.LANDMARK_VISITED,
        id: "too-early-visit",
        landmarkId: "conservatory",
      },
      1_100,
    );
    expect(
      selectObjectiveProgress(
        state,
        SUNTHREAD_ID,
        "reach-conservatory",
      ).current,
    ).toBe(0);

    state = apply(
      state,
      {
        type: WORLD_EVENT_TYPES.QUEST_ACCEPTED,
        id: "wrong-giver",
        questId: SUNTHREAD_ID,
        npcId: "juno",
      },
      1_200,
    );
    expect(state.quests[SUNTHREAD_ID].status).toBe("available");

    state = accept(state, SUNTHREAD_ID, "sol-accepts", 1_300);
    expect(selectQuestProgress(state, SUNTHREAD_ID)).toEqual(
      expect.objectContaining({
        status: "active",
        currentObjectiveId: "reach-conservatory",
      }),
    );

    state = apply(
      state,
      {
        type: WORLD_EVENT_TYPES.COOPERATION_RECEIPT,
        id: "resonance:out-of-order",
        receiptId: "resonance:out-of-order",
        mode: "resonance",
      },
      1_400,
    );
    expect(
      selectObjectiveProgress(
        state,
        SUNTHREAD_ID,
        "resonate-together",
      ),
    ).toEqual(expect.objectContaining({ current: 0, status: "locked" }));

    state = apply(
      state,
      {
        type: WORLD_EVENT_TYPES.LANDMARK_VISITED,
        id: "ordered-visit",
        landmarkId: "conservatory",
      },
      1_500,
    );
    expect(selectQuestProgress(state, SUNTHREAD_ID).currentObjectiveId).toBe(
      "recover-rain-prism",
    );

    state = apply(
      state,
      {
        type: WORLD_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED,
        id: "ordered-prism",
        landmarkId: "conservatory",
        activityId: "recover-prism",
      },
      1_600,
    );
    state = apply(
      state,
      {
        type: WORLD_EVENT_TYPES.COOPERATION_RECEIPT,
        id: "resonance:fresh-duet",
        receiptId: "resonance:fresh-duet",
        mode: "resonance",
      },
      1_700,
    );

    expect(state.quests[SUNTHREAD_ID].status).toBe("ready-to-turn-in");
    expect(state.xp).toBe(0);
    expect(selectActiveQuests(state)[0].currentObjectiveId).toBeNull();

    state = apply(
      state,
      {
        type: WORLD_EVENT_TYPES.QUEST_TURNED_IN,
        id: "wrong-turn-in",
        questId: SUNTHREAD_ID,
        npcId: "juno",
      },
      1_800,
    );
    expect(state.quests[SUNTHREAD_ID].status).toBe("ready-to-turn-in");
    expect(state.xp).toBe(0);

    state = turnIn(state, SUNTHREAD_ID, "sol-turn-in", 1_900);
    expect(state.quests[SUNTHREAD_ID]).toEqual(
      expect.objectContaining({ status: "completed", completedAt: 1_900 }),
    );
    expect(state.quests[RAINLIGHT_ID].status).toBe("available");
    expect(selectCompletedQuests(state).map((quest) => quest.id)).toEqual([
      SUNTHREAD_ID,
    ]);
  });

  it("applies every event and quest reward idempotently without spam XP", () => {
    let state = createWorldProgression(1_000);
    const acceptEvent = {
      type: WORLD_EVENT_TYPES.QUEST_ACCEPTED,
      id: "accept-once",
      questId: SUNTHREAD_ID,
      npcId: "sol",
      occurredAt: 1_100,
    };
    state = applyWorldProgressionEvent(state, acceptEvent, 1_100);
    const acceptedOnce = state;
    state = applyWorldProgressionEvent(state, acceptEvent, 9_999);
    expect(state).toEqual(acceptedOnce);

    const visit = {
      type: WORLD_EVENT_TYPES.LANDMARK_VISITED,
      id: "visit-once",
      landmarkId: "conservatory",
      occurredAt: 1_200,
    };
    state = applyWorldProgressionEvent(state, visit, 1_200);
    const visitedOnce = state;
    state = applyWorldProgressionEvent(state, visit, 5_000);
    expect(state).toEqual(visitedOnce);

    // A different event ID for the same objective is still only one unit.
    state = apply(
      state,
      {
        ...visit,
        id: "visit-again",
      },
      1_300,
    );
    expect(
      selectObjectiveProgress(
        state,
        SUNTHREAD_ID,
        "reach-conservatory",
      ).current,
    ).toBe(1);

    state = apply(
      state,
      {
        type: WORLD_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED,
        id: "prism-once",
        landmarkId: "conservatory",
        activityId: "recover-prism",
      },
      1_400,
    );
    state = apply(
      state,
      {
        type: WORLD_EVENT_TYPES.COOPERATION_RECEIPT,
        id: "resonance:once",
        receiptId: "resonance:once",
        mode: "resonance",
      },
      1_500,
    );
    state = turnIn(state, SUNTHREAD_ID, "turn-in-once", 1_600);
    expect(state.xp).toBe(50);
    expect(state.level).toBe(2);
    expect(state.unlockedCosmetics).toEqual([
      "cosmetic:scarf:sunthread",
    ]);

    state = turnIn(state, SUNTHREAD_ID, "turn-in-with-another-id", 1_700);
    expect(state.xp).toBe(50);
    expect(state.unlockedCosmetics).toEqual([
      "cosmetic:scarf:sunthread",
    ]);
  });

  it("unlocks and completes the district Relay follow-up for another level and cosmetic", () => {
    let state = completeSunthread();
    state = accept(state, RAINLIGHT_ID, "accept-rainlight", 2_000);
    state = apply(
      state,
      {
        type: WORLD_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED,
        id: "wake-rainlight",
        questId: RAINLIGHT_ID,
        landmarkId: "resonance",
        activityId: "wake-rainlight",
      },
      2_100,
    );
    state = apply(
      state,
      {
        type: WORLD_EVENT_TYPES.PUBLIC_EVENT_SOURCE_RECEIPT,
        id: "relay:source:one",
        receiptId: "relay:source:one",
        publicEventId: "rainlight-relay",
      },
      2_200,
    );
    state = apply(
      state,
      {
        type: WORLD_EVENT_TYPES.PUBLIC_EVENT_COMPLETION_RECEIPT,
        id: "relay:complete:one",
        receiptId: "relay:complete:one",
        publicEventId: "rainlight-relay",
      },
      2_300,
    );
    state = turnIn(state, RAINLIGHT_ID, "turn-in-rainlight", 2_400);

    expect(state.xp).toBe(150);
    expect(state.level).toBe(3);
    expect(selectLevelProgress(state)).toEqual(
      expect.objectContaining({
        level: 3,
        totalXp: 150,
        xpIntoLevel: 0,
        xpForNextLevel: 150,
      }),
    );
    expect(selectCompletedQuests(state).map((quest) => quest.id)).toEqual([
      SUNTHREAD_ID,
      RAINLIGHT_ID,
    ]);
    expect(selectUnlockedCosmetics(state).map((cosmetic) => cosmetic.id)).toEqual([
      "cosmetic:scarf:sunthread",
      "cosmetic:scarf:rainlight",
    ]);
  });

  it("hydrates a trusted expedition receipt, then grants its finite reward only at Juno", () => {
    let state = hydrateWorldProgression(
      {
        createdAt: 1_000,
        updatedAt: 4_000,
        xp: 150,
        unlockedCosmetics: [
          "cosmetic:scarf:sunthread",
          "cosmetic:scarf:rainlight",
        ],
        quests: {
          [SUNTHREAD_ID]: {
            status: "completed",
            startedAt: 1_100,
            completedAt: 2_000,
            objectives: {
              "reach-conservatory": { evidence: ["conservatory"] },
              "recover-rain-prism": {
                evidence: ["conservatory:recover-prism"],
              },
              "resonate-together": { evidence: ["resonance"] },
            },
          },
          [RAINLIGHT_ID]: {
            status: "completed",
            startedAt: 2_100,
            completedAt: 3_000,
            objectives: {
              "wake-rainlight": { evidence: ["resonance:wake-rainlight"] },
              "bank-rainlight": { evidence: ["rainlight-relay"] },
              "complete-rainlight-relay": {
                evidence: ["rainlight-relay"],
              },
            },
          },
          [LANTERNKEEPER_ID]: {
            status: "ready-to-turn-in",
            startedAt: 3_100,
            objectives: {
              "complete-expedition": {
                evidence: ["lanternkeeper-expedition"],
              },
            },
          },
        },
      },
      4_000,
    );

    expect(selectQuestProgress(state, LANTERNKEEPER_ID)).toEqual(
      expect.objectContaining({
        status: "ready-to-turn-in",
        currentObjectiveId: null,
      }),
    );
    expect(state.xp).toBe(150);

    state = turnIn(
      state,
      LANTERNKEEPER_ID,
      "turn-in-lanternkeeper",
      4_100,
    );
    expect(state.xp).toBe(300);
    expect(state.level).toBe(4);
    expect(selectUnlockedCosmetics(state).map((cosmetic) => cosmetic.id)).toEqual([
      "cosmetic:scarf:sunthread",
      "cosmetic:scarf:rainlight",
      "cosmetic:charm:lanternkeeper",
    ]);

    const repeated = turnIn(
      state,
      LANTERNKEEPER_ID,
      "turn-in-lanternkeeper-again",
      4_200,
    );
    expect(repeated.xp).toBe(300);
  });

  it("migrates and sanitizes persisted data while preserving invariants", () => {
    const state = hydrateWorldProgression(
      {
        version: 1,
        createdAt: 500,
        totalXp: 75.9,
        level: 99,
        cosmetics: [
          "cosmetic:scarf:sunthread",
          "cosmetic:power:instant-win",
        ],
        seenEvents: ["safe-event", "safe-event", null],
        questProgress: {
          [SUNTHREAD_ID]: {
            status: "active",
            acceptedAt: 600,
            objectives: {
              "reach-conservatory": { evidence: ["invented-place"] },
              "recover-rain-prism": {
                evidence: ["conservatory:recover-prism"],
              },
              "resonate-together": { evidence: ["resonance"] },
            },
          },
          "invented-quest": { status: "completed" },
        },
      },
      1_000,
    );

    expect(state.version).toBe(WORLD_PROGRESSION_VERSION);
    expect(state.xp).toBe(75);
    expect(state.level).toBe(2);
    expect(state.unlockedCosmetics).toEqual([
      "cosmetic:scarf:sunthread",
    ]);
    expect(state.processedEventIds).toEqual(["safe-event"]);
    expect(Object.keys(state.quests)).toEqual(WORLD_QUESTS.map((quest) => quest.id));
    expect(state.quests[SUNTHREAD_ID].status).toBe("active");
    expect(
      state.quests[SUNTHREAD_ID].objectives["recover-rain-prism"].evidence,
    ).toEqual([]);
    expect(
      state.quests[SUNTHREAD_ID].objectives["resonate-together"].evidence,
    ).toEqual([]);
  });

  it("adapts content-free shared receipts and ignores matching or Sparks", () => {
    const receiptEvent = progressionEventFromSharedReceipt({
      id: "resonance:match-123",
      mode: "resonance",
      matchId: "match-123",
      completedAt: 2_000,
      partnerName: "must not cross the boundary",
    });
    expect(receiptEvent).toEqual({
      type: WORLD_EVENT_TYPES.COOPERATION_RECEIPT,
      id: "resonance:match-123",
      receiptId: "resonance:match-123",
      mode: "resonance",
      occurredAt: 2_000,
    });
    expect(progressionEventFromSharedReceipt({ mode: "spark" })).toBeNull();

    const initial = createWorldProgression(1_000);
    const afterSpark = applyWorldProgressionEvent(
      initial,
      { type: "spark-earned", id: "spark-1", occurredAt: 2_000 },
      2_000,
    );
    const afterMatch = applyWorldProgressionEvent(
      afterSpark,
      { type: "match-created", id: "match-1", occurredAt: 3_000 },
      3_000,
    );
    expect(afterMatch).toEqual(initial);
  });

  it("defines cosmetic-only quest rewards with no power or paid stats", () => {
    const cosmeticIds = new Set(WORLD_COSMETICS.map((cosmetic) => cosmetic.id));
    WORLD_QUESTS.forEach((quest) => {
      expect(quest.rewards.xp).toBeGreaterThan(0);
      quest.rewards.cosmetics.forEach((id) => expect(cosmeticIds.has(id)).toBe(true));
      expect(quest.rewards).not.toHaveProperty("power");
      expect(quest.rewards).not.toHaveProperty("stats");
      expect(quest.rewards).not.toHaveProperty("currency");
    });
    WORLD_COSMETICS.forEach((cosmetic) => {
      expect(cosmetic).toEqual(
        expect.objectContaining({ id: expect.any(String), slot: expect.any(String) }),
      );
      expect(cosmetic).not.toHaveProperty("power");
      expect(cosmetic).not.toHaveProperty("stats");
    });
  });
});
