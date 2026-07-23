import {
  advanceNightJourney,
  createNightJourney,
  hydrateNightKeepsakes,
  hydrateNightJourney,
  nightJourneyBridgeState,
  nightJourneyProgress,
} from "./nightJourney";

describe("Afterlight night journey", () => {
  it("requires exploration, a place moment, and an intentional pace choice", () => {
    let journey = createNightJourney(1_000, "test");
    journey = advanceNightJourney(journey, {
      type: "visit",
      landmarkId: "market",
    });
    journey = advanceNightJourney(journey, {
      type: "visit",
      landmarkId: "market",
    });
    expect(nightJourneyProgress(journey).completed).toBe(0);

    journey = advanceNightJourney(journey, {
      type: "visit",
      landmarkId: "resonance",
    });
    journey = advanceNightJourney(journey, {
      type: "moment",
      id: "market:taste-note",
    });
    expect(nightJourneyProgress(journey)).toEqual(
      expect.objectContaining({ completed: 2, complete: false }),
    );

    journey = advanceNightJourney(
      journey,
      { type: "choice", choiceId: "quiet" },
      2_000,
    );
    expect(nightJourneyProgress(journey).complete).toBe(true);
    expect(journey.completedAt).toBe(2_000);
    expect(journey.keepsake).toEqual(
      expect.objectContaining({
        kind: "quiet",
        title: "Moonwater Pause",
      }),
    );
  });

  it("sanitizes persisted progress and derives a safe renderer payload", () => {
    const hydrated = hydrateNightJourney(
      {
        id: "saved-thread",
        startedAt: 500,
        visited: ["market", "invented", "market", "resonance"],
        moments: ["taste-note", "taste-note", null],
        choices: ["shared", "invalid"],
        completedAt: 900,
      },
      1_000,
    );

    expect(hydrated.visited).toEqual(["market", "resonance"]);
    expect(hydrated.moments).toEqual(["taste-note"]);
    expect(hydrated.choices).toEqual(["shared"]);
    expect(hydrated.keepsake.kind).toBe("shared");
    expect(nightJourneyBridgeState(hydrated)).toEqual({
      id: "saved-thread",
      visited: ["market", "resonance"],
      stage: "complete",
      complete: true,
    });
  });

  it("locks a completed thread until the player starts another one", () => {
    let journey = createNightJourney(1_000, "first");
    [
      { type: "visit", landmarkId: "market" },
      { type: "visit", landmarkId: "resonance" },
      { type: "moment", id: "garden:pulse" },
      { type: "choice", choiceId: "shared" },
    ].forEach((event) => {
      journey = advanceNightJourney(journey, event, 2_000);
    });
    const completed = journey;

    expect(
      advanceNightJourney(
        completed,
        { type: "visit", landmarkId: "conservatory" },
        3_000,
      ).visited,
    ).toEqual(["market", "resonance"]);
    expect(createNightJourney(3_000, "second").id).not.toBe(completed.id);
  });

  it("keeps only safe local keepsake summaries", () => {
    expect(
      hydrateNightKeepsakes([
        {
          id: "safe:quiet",
          kind: "quiet",
          title: "Moonwater Pause",
          note: "A quiet note",
          prompt: "A gentle question?",
          color: "#8ad6c6",
          completedAt: 2_000,
        },
        { id: "unsafe", kind: "invented" },
      ]),
    ).toEqual([
      expect.objectContaining({ id: "safe:quiet", kind: "quiet" }),
    ]);
  });
});
