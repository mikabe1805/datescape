import {
  createRainlightRelayState,
  hydrateRainlightPersonalState,
  hydrateRainlightRelayState,
  selectRainlightRelayProgress,
} from "./rainlightRelay";

describe("Rainlight Relay public state", () => {
  it("starts idle and strips malformed aggregate fields", () => {
    expect(hydrateRainlightRelayState(null, 1_000)).toEqual(
      createRainlightRelayState(),
    );
    const state = hydrateRainlightRelayState(
      {
        id: "invented",
        instanceId: "relay:1",
        phase: "admin",
        startedAt: 1_000,
        contributionCount: 99,
        contributorCount: -2,
        sourceCounts: { conservatory: 1, market: 99, resonance: -1, uid: 4 },
        privateContributors: ["secret"],
      },
      2_000,
    );
    expect(state).toEqual(
      expect.objectContaining({
        id: "rainlight-relay",
        phase: "gathering",
        contributionCount: 3,
        contributorCount: 0,
        sourceCounts: { conservatory: 1, market: 2, resonance: 0 },
      }),
    );
    expect(JSON.stringify(state)).not.toMatch(/uid|private|secret/);
  });

  it("derives echo, celebration, cooldown, and rollover from trusted times", () => {
    const gathering = {
      instanceId: "relay:2",
      phase: "gathering",
      startedAt: 1_000,
      echoAvailableAt: 91_000,
      contributionCount: 1,
      contributorCount: 1,
      sourceCount: 1,
      sourceCounts: { conservatory: 1, market: 0, resonance: 0 },
    };
    expect(hydrateRainlightRelayState(gathering, 90_999).phase).toBe(
      "gathering",
    );
    expect(hydrateRainlightRelayState(gathering, 91_000).phase).toBe(
      "echo-available",
    );
    expect(
      hydrateRainlightRelayState(
        { ...gathering, contributorCount: 2 },
        91_000,
      ).phase,
    ).toBe("gathering");

    const completed = {
      ...gathering,
      phase: "completed",
      completedAt: 100_000,
      cooldownEndsAt: 220_000,
      resultMode: "community",
    };
    expect(hydrateRainlightRelayState(completed, 110_000).phase).toBe(
      "completed",
    );
    expect(hydrateRainlightRelayState(completed, 140_000).phase).toBe(
      "cooldown",
    );
    expect(hydrateRainlightRelayState(completed, 220_000)).toEqual(
      createRainlightRelayState(),
    );
  });

  it("keeps personalized contribution options bounded and computes countdown", () => {
    const personal = hydrateRainlightPersonalState({
      instanceId: "relay:3",
      contributedSources: ["market", "market", "private"],
      availableSources: ["resonance", "private"],
      uid: "secret",
    });
    expect(personal).toEqual({
      instanceId: "relay:3",
      contributedSources: ["market"],
      availableSources: ["resonance"],
      contributed: true,
    });
    const progress = selectRainlightRelayProgress(
      {
        instanceId: "relay:3",
        startedAt: 10_000,
        echoAvailableAt: 100_000,
        sourceCounts: { market: 1 },
      },
      personal,
      75_500,
    );
    expect(progress.echoSecondsRemaining).toBe(25);
    expect(progress.canContribute).toBe(true);
  });

  it("re-derives personal options when remote contributions change the route", () => {
    const personal = {
      instanceId: "relay:4",
      contributedSources: ["conservatory", "market"],
      availableSources: ["resonance"],
    };
    const shared = {
      instanceId: "relay:4",
      startedAt: 1_000,
      echoAvailableAt: 91_000,
      contributorCount: 2,
      sourceCounts: { conservatory: 1, market: 1, resonance: 1 },
    };

    expect(
      selectRainlightRelayProgress(shared, personal, 92_000).personal
        .availableSources,
    ).toEqual([]);

    expect(
      selectRainlightRelayProgress(
        {
          ...shared,
          contributorCount: 1,
          sourceCounts: { conservatory: 1, market: 1, resonance: 0 },
        },
        personal,
        92_000,
      ).personal.availableSources,
    ).toEqual(["resonance"]);

    expect(
      selectRainlightRelayProgress(
        {
          ...shared,
          contributorCount: 4,
          sourceCounts: { conservatory: 1, market: 1, resonance: 1 },
        },
        {
          instanceId: "relay:4",
          contributedSources: [],
          availableSources: ["conservatory", "market", "resonance"],
        },
        50_000,
      ).personal.availableSources,
    ).toEqual([]);
  });
});
