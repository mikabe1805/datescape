const {
  SHARED_ENCOUNTER_TTL_MS,
  applySharedEncounterResponse,
  createVerifiedSharedEncounter,
  normalizeSharedEncounter,
  privateMatchIdForParticipants,
  projectSharedEncounter,
  sanitizeWorldCallingCard,
  sharedEncounterIdForReceipt,
  sharedEncounterPairIsBlocked,
  verifyListeningCompletion,
} = require("../../functions/sharedEncounter");

const START = 1_700_000_000_000;
const PARTICIPANTS = ["traveler-b", "traveler-a"];

function encounter() {
  return createVerifiedSharedEncounter({
    receiptId: `resonance:${"a".repeat(64)}`,
    sourceId: "resonance-duet-1700000000000",
    participants: PARTICIPANTS,
    now: START,
  });
}

function listeningMatch(overrides = {}) {
  const matchId = "listening-crescent-1700000000000";
  return {
    id: matchId,
    mode: "social",
    white: "traveler-a",
    black: "traveler-b",
    startedAt: START,
    socialCardId: "easy-conversation",
    socialChoices: {
      "traveler-a": {
        matchId,
        choiceId: "a",
        chosenAt: START + 1_000,
      },
      "traveler-b": {
        matchId,
        choiceId: "c",
        chosenAt: START + 1_200,
      },
    },
    completionAcks: {
      "traveler-a": {
        matchId,
        acknowledgedAt: START + 1_500,
      },
      "traveler-b": {
        matchId,
        acknowledgedAt: START + 1_600,
      },
    },
    ...overrides,
  };
}

describe("server-owned shared encounters", () => {
  it("creates one deterministic short-lived encounter for exactly two verified people", () => {
    const value = encounter();
    expect(value).toEqual(
      expect.objectContaining({
        id: sharedEncounterIdForReceipt(value.sourceReceiptId, PARTICIPANTS),
        mode: "resonance",
        participantUids: ["traveler-a", "traveler-b"],
        sourceId: "resonance-duet-1700000000000",
        status: "open",
        expiresAt: START + SHARED_ENCOUNTER_TTL_MS,
      }),
    );
    expect(createVerifiedSharedEncounter({
      receiptId: value.sourceReceiptId,
      sourceId: value.sourceId,
      participants: ["traveler-a", "traveler-a"],
      now: START,
    })).toBeNull();
    expect(normalizeSharedEncounter({ ...value, participantUids: ["traveler-a"] }))
      .toBeNull();
    expect(
      normalizeSharedEncounter({
        ...value,
        decisions: {
          outsider: {
            response: "spark",
            actionId: "forged",
            decidedAt: START + 10,
          },
        },
      }),
    ).toBeNull();
  });

  it("supports distinct verified social and Resonance encounter modes", () => {
    const social = createVerifiedSharedEncounter({
      receiptId: `social:${"b".repeat(64)}`,
      sourceId: "listening-crescent-1700000000000",
      participants: PARTICIPANTS,
      mode: "social",
      now: START,
    });
    expect(social).toEqual(
      expect.objectContaining({ mode: "social", status: "open" }),
    );
    expect(normalizeSharedEncounter(social)?.mode).toBe("social");
    expect(
      createVerifiedSharedEncounter({
        receiptId: "unknown:receipt",
        sourceId: "source",
        participants: PARTICIPANTS,
        mode: "unknown",
        now: START,
      }),
    ).toBeNull();
  });

  it("verifies a completed Listening Crescent round from live match evidence", () => {
    const match = listeningMatch();
    expect(
      verifyListeningCompletion(
        match,
        "traveler-b",
        match.completionAcks["traveler-b"],
        START + 2_000,
      ),
    ).toEqual({
      ok: true,
      matchId: match.id,
      participants: ["traveler-a", "traveler-b"],
      cardId: "easy-conversation",
    });
  });

  it("rejects passes, partial ACKs, and mismatched Listening evidence", () => {
    const match = listeningMatch();
    expect(
      verifyListeningCompletion(
        {
          ...match,
          socialChoices: {
            ...match.socialChoices,
            "traveler-b": {
              ...match.socialChoices["traveler-b"],
              choiceId: "pass",
            },
          },
        },
        "traveler-b",
        match.completionAcks["traveler-b"],
        START + 2_000,
      ),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(
      verifyListeningCompletion(
        {
          ...match,
          completionAcks: {
            "traveler-b": match.completionAcks["traveler-b"],
          },
        },
        "traveler-b",
        match.completionAcks["traveler-b"],
        START + 2_000,
      ),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(
      verifyListeningCompletion(
        match,
        "traveler-b",
        { ...match.completionAcks["traveler-b"], matchId: "forged" },
        START + 2_000,
      ),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it("keeps a one-way Spark secret until the other person independently reciprocates", () => {
    const first = applySharedEncounterResponse(encounter(), {
      uid: "traveler-a",
      response: "spark",
      actionId: "spark-a-1",
      now: START + 1_000,
    });
    expect(first).toEqual(
      expect.objectContaining({
        ok: true,
        applied: true,
        mutual: false,
        matchId: null,
      }),
    );
    expect(
      projectSharedEncounter(first.encounter, "traveler-a", {
        displayName: "Bea",
      }, START + 1_500),
    ).toEqual(
      expect.objectContaining({ response: "spark", state: "pending", matchId: null }),
    );
    expect(
      projectSharedEncounter(first.encounter, "traveler-b", {
        displayName: "Ari",
      }, START + 1_500),
    ).toEqual(
      expect.objectContaining({ response: null, state: "open", matchId: null }),
    );

    const mutual = applySharedEncounterResponse(first.encounter, {
      uid: "traveler-b",
      response: "spark",
      actionId: "spark-b-1",
      now: START + 2_000,
    });
    expect(mutual).toEqual(
      expect.objectContaining({
        ok: true,
        applied: true,
        mutual: true,
        matchId: "traveler-a_traveler-b",
      }),
    );
    expect(
      projectSharedEncounter(
        mutual.encounter,
        "traveler-a",
        {},
        START + 2_500,
      ).state,
    ).toBe("mutual");
  });

  it("makes the first response final and retries idempotent", () => {
    const first = applySharedEncounterResponse(encounter(), {
      uid: "traveler-a",
      response: "spark",
      actionId: "action-one",
      now: START + 100,
    });
    const retry = applySharedEncounterResponse(first.encounter, {
      uid: "traveler-a",
      response: "spark",
      actionId: "action-one",
      now: START + 200,
    });
    expect(retry).toEqual(
      expect.objectContaining({ ok: true, applied: false, duplicate: true }),
    );
    const conflicting = applySharedEncounterResponse(first.encounter, {
      uid: "traveler-a",
      response: "pass",
      actionId: "action-two",
      now: START + 200,
    });
    expect(conflicting).toEqual(
      expect.objectContaining({ ok: false, code: "failed-precondition" }),
    );
  });

  it("closes on pass without exposing the other person's one-way response", () => {
    const spark = applySharedEncounterResponse(encounter(), {
      uid: "traveler-a",
      response: "spark",
      actionId: "spark-a",
      now: START + 100,
    });
    const passed = applySharedEncounterResponse(spark.encounter, {
      uid: "traveler-b",
      response: "pass",
      actionId: "pass-b",
      now: START + 200,
    });
    expect(passed.mutual).toBe(false);
    expect(passed.matchId).toBeNull();
    expect(
      projectSharedEncounter(
        passed.encounter,
        "traveler-b",
        {},
        START + 300,
      ).state,
    ).toBe("passed");
    expect(
      projectSharedEncounter(
        passed.encounter,
        "traveler-a",
        {},
        START + 300,
      ),
    ).toEqual(expect.objectContaining({ response: "spark", state: "closed", matchId: null }));
  });

  it("rejects outsiders and responses at or after expiry", () => {
    expect(
      applySharedEncounterResponse(encounter(), {
        uid: "outsider",
        response: "spark",
        actionId: "outsider-action",
        now: START + 100,
      }),
    ).toEqual(expect.objectContaining({ ok: false, code: "permission-denied" }));
    expect(
      applySharedEncounterResponse(encounter(), {
        uid: "traveler-a",
        response: "spark",
        actionId: "late-action",
        now: START + SHARED_ENCOUNTER_TTL_MS,
      }),
    ).toEqual(expect.objectContaining({ ok: false, code: "failed-precondition" }));
  });

  it("treats blocks symmetrically, including nested legacy profiles", () => {
    expect(
      sharedEncounterPairIsBlocked(
        "traveler-a",
        { blockedUsers: ["traveler-b"] },
        "traveler-b",
        {},
      ),
    ).toBe(true);
    expect(
      sharedEncounterPairIsBlocked(
        "traveler-a",
        {},
        "traveler-b",
        { profile: { blockedUsers: ["traveler-a"] } },
      ),
    ).toBe(true);
    expect(
      sharedEncounterPairIsBlocked("traveler-a", {}, "traveler-b", {}),
    ).toBe(false);
  });

  it("returns only the bounded calling-card contract", () => {
    const profile = sanitizeWorldCallingCard("traveler-a", {
      displayName: "A".repeat(50),
      media: [
        { url: "https://cdn.example.test/photo.jpg", secret: "hidden" },
        "https://cdn.example.test/second.jpg",
      ],
      bio: "B".repeat(500),
      age: 31,
      lookingFor: "A thoughtful walk",
      interests: ["Gardens", "Gardens", "Pottery", "Music", "Hiking", "Tea"],
      blockedUsers: ["traveler-b"],
      email: "private@example.test",
      location: { lat: 1, lng: 2 },
    });
    expect(profile).toEqual({
      uid: "traveler-a",
      displayName: "A".repeat(30),
      photoUrl: "https://cdn.example.test/photo.jpg",
      bio: "B".repeat(280),
      age: 31,
      lookingFor: "A thoughtful walk",
      interests: ["Gardens", "Pottery", "Music", "Hiking", "Tea"],
    });
    expect(profile).not.toHaveProperty("blockedUsers");
    expect(profile).not.toHaveProperty("email");
    expect(profile).not.toHaveProperty("location");
  });

  it("uses the stable sorted private match id", () => {
    expect(privateMatchIdForParticipants(PARTICIPANTS)).toBe(
      "traveler-a_traveler-b",
    );
  });
});
