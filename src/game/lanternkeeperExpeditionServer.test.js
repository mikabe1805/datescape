const {
  ECHO_DELAY_MS,
  EXPEDITION_DURATION_MS,
  LANTERNKEEPER_DEFINITION_ID,
  LANTERNKEEPER_EXPEDITION_ID,
  LANTERNKEEPER_ROOM_ID,
  MAX_ACTIVE_MEMBERS,
  MAX_PROCESSED_ACTION_IDS,
  RESONANCE_WINDOW_MS,
  TARGET_IDS,
  actionOwnerPrefix,
  applyLanternkeeperExpeditionContribution,
  applyLanternkeeperExpeditionJoin,
  applyLanternkeeperExpeditionLeave,
  applyLanternkeeperExpeditionStart,
  normalizeLanternkeeperExpeditionState,
  personalLanternkeeperExpeditionState,
  publicLanternkeeperExpeditionState,
  scrubLanternkeeperExpeditionParticipant,
  selectLanternkeeperActiveMemberUids,
} = require("../../functions/lanternkeeperExpedition");

const START = 1_000_000;

function scope(extra = {}) {
  return {
    expeditionId: LANTERNKEEPER_EXPEDITION_ID,
    definitionId: LANTERNKEEPER_DEFINITION_ID,
    roomId: LANTERNKEEPER_ROOM_ID,
    ...extra,
  };
}

function start(uid = "u1", actionId = "start-1", now = START) {
  return applyLanternkeeperExpeditionStart(
    null,
    scope({ uid, actionId, expectedRevision: 0 }),
    now,
  );
}

function join(state, uid, revision = state.revision, now = START + 1) {
  return applyLanternkeeperExpeditionJoin(
    state,
    scope({
      uid,
      actionId: `join-${uid}-${revision}`,
      expectedRevision: revision,
      instanceId: state.instanceId,
    }),
    now,
  );
}

function leave(state, uid, revision = state.revision, now = START + 2) {
  return applyLanternkeeperExpeditionLeave(
    state,
    scope({
      uid,
      actionId: `leave-${uid}-${revision}`,
      expectedRevision: revision,
      instanceId: state.instanceId,
    }),
    now,
  );
}

function contribute(
  state,
  uid,
  targetId,
  now,
  actionId = `${targetId}-${uid}-${state.revision}`,
) {
  return applyLanternkeeperExpeditionContribution(
    state,
    scope({
      uid,
      targetId,
      actionId,
      expectedRevision: state.revision,
      instanceId: state.instanceId,
    }),
    now,
  );
}

function reachMarketWithTwo() {
  let state = start().state;
  state = join(state, "u2").state;
  state = contribute(state, "u1", "conservatory-scan", START + 10).state;
  return state;
}

function reachResonanceWithTwo() {
  let state = reachMarketWithTwo();
  state = contribute(state, "u1", "market-west", START + 20).state;
  state = contribute(state, "u2", "market-east", START + 21).state;
  return state;
}

describe("Lanternkeeper Expedition authoritative reducer", () => {
  it("starts deterministically and treats a retried start action as idempotent", () => {
    const first = start();
    expect(first).toMatchObject({ ok: true, applied: true, started: true });
    expect(first.state).toMatchObject({
      revision: 1,
      stage: "conservatory",
      echoAvailableAt: START + ECHO_DELAY_MS,
      expiresAt: START + EXPEDITION_DURATION_MS,
    });

    const retried = applyLanternkeeperExpeditionStart(
      first.state,
      scope({ uid: "u1", actionId: "start-1", expectedRevision: 0 }),
      START + 100,
    );
    expect(retried).toMatchObject({ ok: true, applied: false, duplicate: true });
    expect(retried.state.instanceId).toBe(first.state.instanceId);
  });

  it("requires explicit joins, caps four active members, and preserves contributions through leave/rejoin", () => {
    let state = start().state;
    const unjoined = contribute(
      state,
      "u2",
      "conservatory-scan",
      START + 1,
    );
    expect(unjoined).toMatchObject({ ok: false, code: "membership-required" });

    for (const uid of ["u2", "u3", "u4"]) state = join(state, uid).state;
    expect(selectLanternkeeperActiveMemberUids(state)).toHaveLength(
      MAX_ACTIVE_MEMBERS,
    );
    expect(join(state, "u5")).toMatchObject({
      ok: false,
      code: "member-capacity-reached",
    });

    state = contribute(state, "u2", "conservatory-scan", START + 20).state;
    state = contribute(state, "u2", "market-west", START + 30).state;
    state = leave(state, "u2").state;
    expect(state.targetContributions["market-west"].u2).toBe(START + 30);
    state = join(state, "u5").state;
    expect(state.members.u5.active).toBe(true);
    state = leave(state, "u5").state;
    state = join(state, "u2").state;
    expect(state.members.u2.active).toBe(true);
    expect(state.targetContributions["market-west"].u2).toBe(START + 30);
  });

  it("rejects out-of-order physical targets and stale revisions", () => {
    const state = start().state;
    expect(contribute(state, "u1", "market-west", START + 1)).toMatchObject({
      ok: false,
      code: "target-out-of-order",
    });
    const stale = applyLanternkeeperExpeditionJoin(
      state,
      scope({
        uid: "u2",
        actionId: "stale-join",
        expectedRevision: 0,
        instanceId: state.instanceId,
      }),
      START + 1,
    );
    expect(stale).toMatchObject({
      ok: false,
      code: "revision-mismatch",
      currentRevision: 1,
    });
  });

  it("requires distinct joined players for standard Market and Resonance pairs", () => {
    let state = reachMarketWithTwo();
    state = contribute(state, "u1", "market-west", START + 20).state;
    const earlySoloMarket = contribute(
      state,
      "u1",
      "market-east",
      START + 21,
    );
    expect(earlySoloMarket).toMatchObject({
      ok: false,
      code: "echo-not-ready",
    });
    state = earlySoloMarket.state;
    expect(state.stage).toBe("market");
    expect(state.completedTargets["market-east"]).toBe(false);
    state = contribute(state, "u2", "market-east", START + 22).state;
    expect(state).toMatchObject({ stage: "resonance", marketMode: "standard" });

    state = contribute(state, "u1", "resonance-left", START + 30).state;
    const earlySoloResonance = contribute(
      state,
      "u1",
      "resonance-right",
      START + 31,
    );
    expect(earlySoloResonance).toMatchObject({
      ok: false,
      code: "echo-not-ready",
    });
    state = earlySoloResonance.state;
    expect(state.stage).toBe("resonance");
    expect(state.completedTargets["resonance-right"]).toBe(false);
    const completed = contribute(
      state,
      "u2",
      "resonance-right",
      START + 32,
    );
    expect(completed).toMatchObject({
      ok: true,
      newlyCompleted: true,
      completed: true,
    });
    expect(completed.state).toMatchObject({
      stage: "completed",
      resultMode: "standard",
      completionMemberCount: 2,
    });
  });

  it("requires both Resonance pads inside the server window and allows a retry", () => {
    let state = reachResonanceWithTwo();
    state = contribute(state, "u1", "resonance-left", START + 100).state;
    expect(
      publicLanternkeeperExpeditionState(
        state,
        START + 100 + RESONANCE_WINDOW_MS + 1,
      ).targetStates,
    ).toMatchObject({
      "resonance-left": false,
      "resonance-right": false,
    });
    state = contribute(
      state,
      "u2",
      "resonance-right",
      START + 100 + RESONANCE_WINDOW_MS + 1,
    ).state;
    expect(state.stage).toBe("resonance");
    expect(state.completedTargets).toMatchObject({
      "resonance-left": false,
      "resonance-right": true,
    });
    const completed = contribute(
      state,
      "u1",
      "resonance-left",
      START + 100 + RESONANCE_WINDOW_MS + 2,
    );
    expect(completed.state.stage).toBe("completed");
  });

  it("opens Echo after 90 seconds so one active player can complete complementary pads", () => {
    let state = start().state;
    state = contribute(state, "u1", "conservatory-scan", START + 10).state;
    state = contribute(state, "u1", "market-west", START + 20).state;
    const earlyMarket = contribute(state, "u1", "market-east", START + 21);
    expect(earlyMarket).toMatchObject({ ok: false, code: "echo-not-ready" });
    state = earlyMarket.state;
    expect(state.stage).toBe("market");
    state = contribute(
      state,
      "u1",
      "market-east",
      START + ECHO_DELAY_MS,
      "echo-market",
    ).state;
    expect(state).toMatchObject({ stage: "resonance", marketMode: "echo" });
    state = contribute(
      state,
      "u1",
      "resonance-left",
      START + ECHO_DELAY_MS + 1,
    ).state;
    const completed = contribute(
      state,
      "u1",
      "resonance-right",
      START + ECHO_DELAY_MS + 2,
    );
    expect(completed.state).toMatchObject({
      stage: "completed",
      resultMode: "echo",
      completionMemberCount: 1,
    });
  });

  it("lets one member use Echo even when joined companions stay idle", () => {
    let state = start().state;
    state = join(state, "u2").state;
    state = contribute(state, "u1", "conservatory-scan", START + 10).state;
    state = contribute(state, "u1", "market-west", START + 20).state;
    state = contribute(
      state,
      "u1",
      "market-east",
      START + ECHO_DELAY_MS,
    ).state;
    expect(state).toMatchObject({ stage: "resonance", marketMode: "echo" });
    state = contribute(
      state,
      "u1",
      "resonance-left",
      START + ECHO_DELAY_MS + 1,
    ).state;
    state = contribute(
      state,
      "u1",
      "resonance-right",
      START + ECHO_DELAY_MS + 2,
    ).state;
    expect(state).toMatchObject({ stage: "completed", resultMode: "echo" });
    expect(state.completionMemberCount).toBe(2);
  });

  it("keeps joined proof when a contributor leaves and restores their receipts on rejoin", () => {
    let state = reachMarketWithTwo();
    state = contribute(state, "u1", "market-west", START + 20).state;
    state = leave(state, "u1", state.revision, START + 21).state;
    expect(state.targetContributions["market-west"].u1).toBe(START + 20);

    state = contribute(state, "u2", "market-east", START + 22).state;
    expect(state).toMatchObject({ stage: "resonance", marketMode: "standard" });
    expect(selectLanternkeeperActiveMemberUids(state)).toEqual(["u2"]);

    state = join(state, "u1", state.revision, START + 23).state;
    expect(state.targetContributions["market-west"].u1).toBe(START + 20);
    expect(selectLanternkeeperActiveMemberUids(state)).toEqual(["u1", "u2"]);
  });

  it("expires at ten minutes without erasing banked target state", () => {
    let state = start().state;
    state = contribute(state, "u1", "conservatory-scan", START + 10).state;
    const expiredAt = START + EXPEDITION_DURATION_MS;
    expect(publicLanternkeeperExpeditionState(state, expiredAt)).toMatchObject({
      phase: "expired",
      canJoin: false,
      targetStates: { "conservatory-scan": true },
    });
    expect(
      contribute(state, "u1", "market-west", expiredAt),
    ).toMatchObject({ ok: false, code: "instance-expired" });
  });

  it("publishes only a privacy-safe aggregate and keeps membership personal", () => {
    let state = reachMarketWithTwo();
    state = contribute(state, "u1", "market-west", START + 20).state;
    const aggregate = publicLanternkeeperExpeditionState(state, START + 21);
    expect(Object.keys(aggregate).sort()).toEqual(
      [
        "activeMemberCount",
        "canJoin",
        "completedAt",
        "definitionId",
        "echoAvailableAt",
        "expiresAt",
        "id",
        "instanceId",
        "memberCapacity",
        "openSlots",
        "phase",
        "resultMode",
        "revision",
        "room",
        "stageIndex",
        "startedAt",
        "targetStates",
      ].sort(),
    );
    expect(aggregate).toMatchObject({
      id: LANTERNKEEPER_EXPEDITION_ID,
      phase: "market",
      activeMemberCount: 2,
      memberCapacity: 4,
      targetStates: { "market-west": true },
    });
    expect(JSON.stringify(aggregate)).not.toMatch(/u1|u2|uid|name|profile|intent/i);

    const personal = personalLanternkeeperExpeditionState(
      state,
      "u1",
      START + 21,
    );
    expect(Object.keys(personal).sort()).toEqual(
      [
        "active",
        "availableTargets",
        "canLeave",
        "contributedTargets",
        "instanceId",
        "joined",
        "joinedAt",
        "leftAt",
      ].sort(),
    );
    expect(personal).toMatchObject({
      joined: true,
      active: true,
      contributedTargets: ["conservatory-scan", "market-west"],
    });
  });

  it("scrubs a deleted open participant and tombstones every identity after completion", () => {
    let open = reachMarketWithTwo();
    open = contribute(open, "u1", "market-west", START + 20).state;
    const scrubbedOpen = scrubLanternkeeperExpeditionParticipant(open, "u1");
    expect(scrubbedOpen.applied).toBe(true);
    expect(scrubbedOpen.state.members.u1).toBeUndefined();
    expect(scrubbedOpen.state.targetContributions["market-west"].u1).toBeUndefined();
    expect(scrubbedOpen.state.completedTargets["market-west"]).toBe(false);
    expect(
      publicLanternkeeperExpeditionState(scrubbedOpen.state, START + 21)
        .targetStates["market-west"],
    ).toBe(false);
    expect(scrubbedOpen.state.processedActionIds.join("|")).not.toContain(
      actionOwnerPrefix("u1"),
    );

    let completed = reachResonanceWithTwo();
    completed = contribute(completed, "u1", "resonance-left", START + 30).state;
    completed = contribute(completed, "u2", "resonance-right", START + 31).state;
    const tombstone = scrubLanternkeeperExpeditionParticipant(completed, "u1").state;
    expect(tombstone).toMatchObject({ privacyTombstone: true, members: {}, memberUids: [] });
    expect(tombstone.processedActionIds).toEqual([]);
    const publicBefore = publicLanternkeeperExpeditionState(completed, START + 40);
    const publicAfter = publicLanternkeeperExpeditionState(tombstone, START + 40);
    expect({ ...publicAfter, revision: publicBefore.revision }).toEqual(publicBefore);
    expect(publicAfter.revision).toBe(publicBefore.revision + 1);
  });

  it("normalizes malformed maps and bounds the finite action log", () => {
    let state = reachResonanceWithTwo();
    for (let index = 0; index < MAX_PROCESSED_ACTION_IDS + 20; index += 1) {
      state = contribute(
        state,
        "u1",
        "resonance-left",
        START + 100 + index,
        `retry-${index}`,
      ).state;
    }
    expect(state.processedActionIds).toHaveLength(MAX_PROCESSED_ACTION_IDS);

    const normalized = normalizeLanternkeeperExpeditionState({
      ...state,
      members: {
        ...state.members,
        __proto__: { joinedAt: START, active: true },
        "bad uid": { joinedAt: START, active: true },
      },
      targetContributions: {
        ...state.targetContributions,
        "not-authored": { u1: START },
      },
    });
    expect(normalized.memberUids).toEqual(["u1", "u2"]);
    expect(Object.keys(normalized.targetContributions)).toEqual(TARGET_IDS);
  });
});
