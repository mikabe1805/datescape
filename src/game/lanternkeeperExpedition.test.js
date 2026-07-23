import {
  createLanternkeeperExpedition,
  hydrateLanternkeeperExpedition,
  hydrateLanternkeeperExpeditionList,
  hydrateLanternkeeperPersonalState,
  lanternkeeperProgress,
  lanternkeeperRendererState,
} from "./lanternkeeperExpedition";

const aggregate = {
  id: "lanternkeeper-expedition",
  definitionId: "lanternkeeper-expedition-v1",
  room: "afterlight-market-garden-v1",
  instanceId: "lanternkeeper:route-1",
  revision: 4,
  phase: "market",
  startedAt: 1_000,
  echoAvailableAt: 91_000,
  expiresAt: 601_000,
  completedAt: null,
  activeMemberCount: 2,
  memberCapacity: 4,
  canJoin: true,
  stageIndex: 1,
  targetStates: {
    "conservatory-scan": true,
    "market-west": true,
    "market-east": false,
    "resonance-left": false,
    "resonance-right": false,
    privateUid: true,
  },
  resultMode: null,
  members: { privateUid: {} },
};

describe("Lanternkeeper Expedition public client state", () => {
  it("starts with a privacy-safe empty projection", () => {
    expect(hydrateLanternkeeperExpedition(null)).toEqual(
      createLanternkeeperExpedition(),
    );
    expect(JSON.stringify(hydrateLanternkeeperExpedition(aggregate))).not.toMatch(
      /privateUid|members/,
    );
  });

  it("bounds aggregate fields and derives the current route", () => {
    const state = hydrateLanternkeeperExpedition({
      ...aggregate,
      activeMemberCount: 99,
      memberCapacity: 99,
      targetStates: { ...aggregate.targetStates, "market-east": "yes" },
    });
    expect(state).toEqual(
      expect.objectContaining({
        phase: "market",
        activeMemberCount: 4,
        memberCapacity: 4,
        openSlots: 0,
        canJoin: false,
      }),
    );
    expect(state.targetStates["market-west"]).toBe(true);
    expect(state.targetStates["market-east"]).toBe(false);
  });

  it("keeps private membership scoped and computes identical Echo eligibility", () => {
    const personal = hydrateLanternkeeperPersonalState({
      instanceId: aggregate.instanceId,
      joined: true,
      active: true,
      joinedAt: 2_000,
      contributedTargets: ["market-west", "market-west", "invented"],
      availableTargets: ["market-east", "invented"],
      canLeave: true,
      uid: "private",
    });
    expect(personal.contributedTargets).toEqual(["market-west"]);
    expect(personal.availableTargets).toEqual(["market-east"]);
    expect(JSON.stringify(personal)).not.toMatch(/uid|private/);

    const beforeEcho = lanternkeeperProgress(aggregate, personal, 90_999);
    expect(beforeEcho.canUseEcho).toBe(false);
    expect(beforeEcho.echoSecondsRemaining).toBe(1);
    const afterEcho = lanternkeeperProgress(aggregate, personal, 91_000);
    expect(afterEcho.canUseEcho).toBe(true);
    expect(afterEcho.availableTargets).toEqual(["market-east"]);
  });

  it("produces the exact bounded renderer protocol projection", () => {
    const state = lanternkeeperRendererState(
      aggregate,
      {
        instanceId: aggregate.instanceId,
        joined: true,
        active: true,
        contributedTargets: ["market-west"],
        availableTargets: ["market-east"],
      },
      92_000,
    );
    expect(state).toEqual({
      id: "lanternkeeper-expedition",
      instanceId: aggregate.instanceId,
      revision: 4,
      status: "active",
      stageId: "market-lanterns",
      memberCount: 2,
      maxMembers: 4,
      expiresAt: 601_000,
      echoAvailableAt: 91_000,
      resultMode: null,
      completedTargetIds: ["conservatory-scan", "market-west"],
      personal: {
        joined: true,
        completedTargetIds: ["market-west"],
        availableTargetIds: ["market-east"],
        canUseEcho: true,
      },
      serverNow: 92_000,
    });
  });

  it("keeps legal solo targets actionable and paired targets server-gated", () => {
    const soloConservatory = lanternkeeperRendererState(
      {
        ...aggregate,
        phase: "conservatory",
        activeMemberCount: 1,
        targetStates: {
          "conservatory-scan": false,
          "market-west": false,
          "market-east": false,
          "resonance-left": false,
          "resonance-right": false,
        },
      },
      {
        instanceId: aggregate.instanceId,
        joined: true,
        active: true,
        contributedTargets: [],
        availableTargets: ["conservatory-scan"],
      },
      92_000,
    );
    expect(soloConservatory.status).toBe("forming");
    expect(soloConservatory.personal.canUseEcho).toBe(false);
    expect(soloConservatory.personal.availableTargetIds).toEqual([
      "conservatory-scan",
    ]);

    const pairedPersonal = {
      instanceId: aggregate.instanceId,
      joined: true,
      active: true,
      contributedTargets: ["market-west"],
      availableTargets: ["market-east"],
    };
    expect(
      lanternkeeperRendererState(aggregate, pairedPersonal, 90_999).personal
        .availableTargetIds,
    ).toEqual([]);
    expect(
      lanternkeeperRendererState(aggregate, pairedPersonal, 91_000).personal
        .availableTargetIds,
    ).toEqual(["market-east"]);
  });

  it("sorts and bounds public board entries without exposing arbitrary keys", () => {
    const list = hydrateLanternkeeperExpeditionList({
      first: aggregate,
      second: {
        ...aggregate,
        instanceId: "lanternkeeper:route-2",
        startedAt: 2_000,
      },
      malformed: { instanceId: "not safe!", members: { private: true } },
    });
    expect(list.map((entry) => entry.instanceId)).toEqual([
      "lanternkeeper:route-2",
      "lanternkeeper:route-1",
    ]);
  });
});
