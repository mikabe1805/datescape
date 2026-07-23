const {
  COOLDOWN_MS,
  ECHO_DELAY_MS,
  RAINLIGHT_RELAY_ROOM_ID,
  applyRainlightRelayContribution,
  createRainlightRelayState,
  normalizeRainlightRelayState,
  publicRainlightRelayState,
  selectRainlightRelayParticipantUids,
  selectRainlightRelaySourceIds,
  validateRainlightRelayContribution,
} = require("../../functions/rainlightRelay");

function contribution(actionId, uid, source) {
  return { actionId, uid, source, roomId: RAINLIGHT_RELAY_ROOM_ID };
}

function apply(state, actionId, uid, source, at) {
  const result = applyRainlightRelayContribution(
    state,
    contribution(actionId, uid, source),
    at,
  );
  expect(result.ok).toBe(true);
  return result;
}

describe("Rainlight Relay server reducer", () => {
  it("starts on the first contribution and completes standard play at four units", () => {
    let state = createRainlightRelayState();
    let result = apply(state, "a:1", "player-a", "conservatory", 1_000);
    state = result.state;
    expect(result.started).toBe(true);
    expect(state.instanceId).toBe("rainlight-relay:1000");
    expect(state.echoAvailableAt).toBe(1_000 + ECHO_DELAY_MS);

    state = apply(state, "a:2", "player-a", "market", 2_000).state;
    state = apply(state, "b:1", "player-b", "conservatory", 3_000).state;
    result = apply(state, "b:2", "player-b", "resonance", 4_000);

    expect(result.completed).toBe(true);
    expect(result.state.completionMode).toBe("standard");
    expect(result.state.cooldownEndsAt).toBe(4_000 + COOLDOWN_MS);
    expect(selectRainlightRelayParticipantUids(result.state)).toEqual([
      "player-a",
      "player-b",
    ]);
    expect(selectRainlightRelaySourceIds(result.state)).toEqual([
      "conservatory",
      "market",
      "resonance",
    ]);
  });

  it("returns idempotent duplicates without changing contribution state", () => {
    const first = apply(
      createRainlightRelayState(),
      "same-action",
      "player-a",
      "market",
      1_000,
    );
    const duplicate = applyRainlightRelayContribution(
      first.state,
      contribution("same-action", "player-a", "market"),
      9_000,
    );

    expect(duplicate).toEqual(
      expect.objectContaining({ ok: true, applied: false, duplicate: true }),
    );
    expect(duplicate.state).toEqual(first.state);
  });

  it("scopes idempotency keys to the authenticated player", () => {
    const first = apply(
      createRainlightRelayState(),
      "same-action",
      "player-a",
      "market",
      1_000,
    );
    const secondPlayer = applyRainlightRelayContribution(
      first.state,
      contribution("same-action", "player-b", "conservatory"),
      2_000,
    );

    expect(secondPlayer).toEqual(
      expect.objectContaining({ ok: true, applied: true, duplicate: false }),
    );
    expect(secondPlayer.state.contributions).toEqual({
      "player-a": { market: 1_000 },
      "player-b": { conservatory: 2_000 },
    });
  });

  it("enforces one unit per player/source and two standard units per player", () => {
    let state = apply(
      createRainlightRelayState(),
      "a:1",
      "player-a",
      "market",
      1_000,
    ).state;
    const repeatedSource = applyRainlightRelayContribution(
      state,
      contribution("a:repeat", "player-a", "market"),
      2_000,
    );
    expect(repeatedSource.code).toBe("source-already-contributed");

    state = apply(state, "a:2", "player-a", "resonance", 3_000).state;
    const earlyThird = applyRainlightRelayContribution(
      state,
      contribution("a:3", "player-a", "conservatory"),
      1_000 + ECHO_DELAY_MS - 1,
    );
    expect(earlyThird.code).toBe("player-contribution-limit");
  });

  it("caps each source at two banked contributions", () => {
    let state = apply(
      createRainlightRelayState(),
      "a:market",
      "player-a",
      "market",
      1_000,
    ).state;
    state = apply(
      state,
      "b:market",
      "player-b",
      "market",
      2_000,
    ).state;
    const fullSource = applyRainlightRelayContribution(
      state,
      contribution("c:market", "player-c", "market"),
      3_000,
    );

    expect(fullSource.code).toBe("source-capacity-reached");
  });

  it("allows one waiting contributor to complete all three sources in echo mode", () => {
    let state = apply(
      createRainlightRelayState(),
      "solo:1",
      "solo-player",
      "conservatory",
      1_000,
    ).state;
    state = apply(state, "solo:2", "solo-player", "market", 2_000).state;
    const result = apply(
      state,
      "solo:3",
      "solo-player",
      "resonance",
      1_000 + ECHO_DELAY_MS,
    );

    expect(result.completed).toBe(true);
    expect(result.state.completionMode).toBe("echo");
    expect(publicRainlightRelayState(result.state, result.state.completedAt)).toEqual(
      expect.objectContaining({
        contributorCount: 1,
        contributionCount: 3,
        sourceCount: 3,
      }),
    );
  });

  it("rejects cooldown contributions, then starts a fresh deterministic instance", () => {
    let state = createRainlightRelayState();
    state = apply(state, "a:1", "player-a", "conservatory", 1_000).state;
    state = apply(state, "a:2", "player-a", "market", 2_000).state;
    state = apply(state, "b:1", "player-b", "conservatory", 3_000).state;
    state = apply(state, "b:2", "player-b", "resonance", 4_000).state;

    const cooldown = applyRainlightRelayContribution(
      state,
      contribution("next:early", "player-c", "market"),
      state.cooldownEndsAt - 1,
    );
    expect(cooldown.code).toBe("cooldown-active");

    const restarted = applyRainlightRelayContribution(
      state,
      contribution("next:on-time", "player-c", "market"),
      state.cooldownEndsAt,
    );
    expect(restarted).toEqual(
      expect.objectContaining({ ok: true, applied: true, started: true }),
    );
    expect(restarted.state.instanceId).toBe(
      `rainlight-relay:${state.cooldownEndsAt}`,
    );
    expect(restarted.state.contributions).toEqual({
      "player-c": { market: state.cooldownEndsAt },
    });
  });

  it("publishes aggregates without participant or action identifiers", () => {
    const state = apply(
      createRainlightRelayState(),
      "private-action",
      "private-player",
      "market",
      1_000,
    ).state;
    const publicState = publicRainlightRelayState(
      state,
      1_000 + ECHO_DELAY_MS,
    );

    expect(publicState).toEqual(
      expect.objectContaining({
        phase: "gathering",
        echoAvailable: true,
        contributorCount: 1,
        sources: ["market"],
      }),
    );
    expect(JSON.stringify(publicState)).not.toMatch(
      /private-player|private-action|processedActionIds|contributions/,
    );
  });

  it("strictly validates action ids, uids, rooms, and sources", () => {
    expect(
      validateRainlightRelayContribution(
        contribution("valid:1", "player-a", "market"),
      ).ok,
    ).toBe(true);
    expect(
      validateRainlightRelayContribution(
        contribution("bad/id", "player-a", "market"),
      ).code,
    ).toBe("invalid-action-id");
    expect(
      validateRainlightRelayContribution(
        contribution("valid:2", "__proto__", "market"),
      ).code,
    ).toBe("invalid-uid");
    expect(
      validateRainlightRelayContribution({
        ...contribution("valid:3", "player-a", "market"),
        roomId: "another-room",
      }).code,
    ).toBe("invalid-room");
    expect(
      validateRainlightRelayContribution(
        contribution("valid:4", "player-a", "invented"),
      ).code,
    ).toBe("invalid-source");
  });

  it("normalizes malformed completion fields from contribution evidence", () => {
    const normalized = normalizeRainlightRelayState({
      gatheringStartedAt: 1_000,
      completedAt: 2_000,
      completionMode: "standard",
      cooldownEndsAt: 99_999,
      processedActionIds: ["safe", "bad/id", "safe"],
      contributions: {
        "player-a": { market: 1_100, invented: 1_200 },
      },
    });

    expect(normalized.completedAt).toBeNull();
    expect(normalized.completionMode).toBeNull();
    expect(normalized.cooldownEndsAt).toBeNull();
    expect(normalized.processedActionIds).toEqual(["safe"]);
    expect(normalized.contributions).toEqual({
      "player-a": { market: 1_100 },
    });
  });

  it("deterministically caps malformed gathering contributions", () => {
    const normalized = normalizeRainlightRelayState({
      gatheringStartedAt: 1_000,
      contributions: {
        "player-c": { conservatory: 1_300, resonance: 1_301 },
        "player-b": {
          conservatory: 1_200,
          market: 1_201,
          resonance: 1_202,
        },
        "player-a": {
          conservatory: 1_100,
          market: 1_101,
          resonance: 1_102,
        },
      },
    });

    expect(normalized.contributions).toEqual({
      "player-a": { conservatory: 1_100, market: 1_101 },
      "player-b": { conservatory: 1_200, market: 1_201 },
      "player-c": { resonance: 1_301 },
    });
  });
});
