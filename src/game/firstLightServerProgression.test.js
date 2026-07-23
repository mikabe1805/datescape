const {
  FIRST_LIGHT_EVENT_TYPES,
  FIRST_LIGHT_QUEST_ID,
  applyFirstLightClientEvent,
  applyVerifiedResonanceReceipt,
  createWorldPlayerState,
  verifyResonanceCompletion,
} = require("../../functions/firstLightProgression");

function apply(state, type, eventId, now) {
  const result = applyFirstLightClientEvent(
    state,
    { type, eventId, questId: FIRST_LIGHT_QUEST_ID },
    now,
  );
  expect(result.ok).toBe(true);
  return result.state;
}

function completedMatch(matchId = "resonance-test-1") {
  const match = {
    id: matchId,
    mode: "resonance",
    white: "white-player",
    black: "black-player",
    startedAt: 4000,
    notes: {},
  };
  for (let round = 0; round < 3; round += 1) {
    match.notes[round] = {};
    for (const uid of [match.white, match.black]) {
      match.notes[round][uid] = {
        matchId,
        tone: round === 0 ? "tide" : round === 1 ? "bloom" : "ember",
        accuracy: 0.8,
        at: 5000 + round * 100,
      };
    }
  }
  return match;
}

describe("server-owned First Light progression", () => {
  it("requires verified Resonance proof before one-time turn-in rewards", () => {
    let state = createWorldPlayerState(1000);
    state = apply(state, FIRST_LIGHT_EVENT_TYPES.QUEST_ACCEPTED, "accept:1", 2000);
    state = apply(state, FIRST_LIGHT_EVENT_TYPES.LANDMARK_VISITED, "visit:1", 3000);
    state = apply(
      state,
      FIRST_LIGHT_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED,
      "prism:1",
      4000,
    );

    const earlyTurnIn = applyFirstLightClientEvent(
      state,
      {
        type: FIRST_LIGHT_EVENT_TYPES.QUEST_TURNED_IN,
        eventId: "turnin:early",
        questId: FIRST_LIGHT_QUEST_ID,
      },
      4500,
    );
    expect(earlyTurnIn.ok).toBe(false);
    expect(earlyTurnIn.code).toBe("failed-precondition");

    const match = completedMatch();
    const verification = verifyResonanceCompletion(
      match,
      match.white,
      { matchId: match.id, acknowledgedAt: 6000 },
      6000,
    );
    expect(verification).toEqual(
      expect.objectContaining({
        ok: true,
        participants: [match.white, match.black],
      }),
    );

    const verified = applyVerifiedResonanceReceipt(
      state,
      {
        id: `resonance:${"a".repeat(64)}`,
        matchId: match.id,
        verifiedAt: 6000,
      },
      6000,
    );
    expect(verified.applied).toBe(true);
    expect(
      verified.state.quests[FIRST_LIGHT_QUEST_ID].status,
    ).toBe("ready-to-turn-in");

    state = apply(
      verified.state,
      FIRST_LIGHT_EVENT_TYPES.QUEST_TURNED_IN,
      "turnin:1",
      7000,
    );
    expect(state.xp).toBe(50);
    expect(state.level).toBe(2);
    expect(state.unlockedCosmetics).toContain(
      "cosmetic:scarf:sunthread",
    );

    const replay = applyFirstLightClientEvent(
      state,
      {
        type: FIRST_LIGHT_EVENT_TYPES.QUEST_TURNED_IN,
        eventId: "turnin:2",
        questId: FIRST_LIGHT_QUEST_ID,
      },
      8000,
    );
    expect(replay.ok).toBe(false);
    expect(state.xp).toBe(50);
  });

  it("rejects incomplete or non-match-bound Resonance notes", () => {
    const match = completedMatch("resonance-test-2");
    match.notes[2][match.black].matchId = "another-match";
    expect(
      verifyResonanceCompletion(
        match,
        match.white,
        { matchId: match.id, acknowledgedAt: 6000 },
        6000,
      ),
    ).toEqual({
      ok: false,
      reason: "invalid-note:2:black-player",
    });
  });
});
