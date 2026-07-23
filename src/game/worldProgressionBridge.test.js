import { httpsCallable } from "firebase/functions";
import {
  firstLightServerEvent,
  loadWorldProgression,
  recordWorldProgressionEvent,
} from "./worldProgressionBridge";
import { WORLD_EVENT_TYPES } from "./worldProgression";

jest.mock("../firebase", () => ({ functions: {} }));
jest.mock("firebase/functions", () => ({ httpsCallable: jest.fn() }));

describe("world progression server bridge", () => {
  beforeEach(() => jest.clearAllMocks());

  it("maps only bounded client evidence from the authoritative quest graph", () => {
    expect(
      firstLightServerEvent({
        id: "wake:1",
        type: WORLD_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED,
        questId: "afterlight-rainlight-rising",
        landmarkId: "resonance",
        activityId: "wake-rainlight",
      }),
    ).toEqual({
      eventId: "wake:1",
      questId: "afterlight-rainlight-rising",
      type: WORLD_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED,
      landmarkId: "resonance",
      activityId: "wake-rainlight",
    });
    expect(
      firstLightServerEvent({
        id: "visit:1",
        type: WORLD_EVENT_TYPES.LANDMARK_VISITED,
        landmarkId: "conservatory",
      }),
    ).toEqual({
      eventId: "visit:1",
      questId: "afterlight-sunthread",
      type: WORLD_EVENT_TYPES.LANDMARK_VISITED,
      landmarkId: "conservatory",
    });
    expect(
      firstLightServerEvent({
        id: "private-match",
        type: WORLD_EVENT_TYPES.COOPERATION_RECEIPT,
        mode: "resonance",
      }),
    ).toBeNull();
    expect(
      firstLightServerEvent({
        id: "forged-relay",
        type: WORLD_EVENT_TYPES.PUBLIC_EVENT_COMPLETION_RECEIPT,
        publicEventId: "rainlight-relay",
      }),
    ).toBeNull();
    expect(
      firstLightServerEvent({
        id: "spark:1",
        type: "spark-sent",
        questId: "afterlight-sunthread",
      }),
    ).toBeNull();
  });

  it("returns authenticated callable progression without widening the payload", async () => {
    const invoke = jest
      .fn()
      .mockResolvedValue({ data: { applied: true, progression: { xp: 50 } } });
    httpsCallable.mockReturnValue(invoke);
    const result = await recordWorldProgressionEvent({
      id: "turnin:1",
      type: WORLD_EVENT_TYPES.QUEST_TURNED_IN,
      questId: "afterlight-sunthread",
      npcId: "sol",
      inventory: ["private"],
    });
    expect(httpsCallable).toHaveBeenCalledWith(
      {},
      "recordWorldQuestEvent",
    );
    expect(invoke).toHaveBeenCalledWith({
      eventId: "turnin:1",
      questId: "afterlight-sunthread",
      type: WORLD_EVENT_TYPES.QUEST_TURNED_IN,
      npcId: "sol",
    });
    expect(result.progression).toEqual({ xp: 50 });
  });

  it("maps Lanternkeeper accept and turn-in at Juno but no client completion proof", () => {
    for (const type of [
      WORLD_EVENT_TYPES.QUEST_ACCEPTED,
      WORLD_EVENT_TYPES.QUEST_TURNED_IN,
    ]) {
      expect(
        firstLightServerEvent({
          id: `lanternkeeper:${type}`,
          type,
          questId: "afterlight-lanternkeeper-expedition",
          npcId: "juno",
          completionReceipt: "forged",
        }),
      ).toEqual({
        eventId: `lanternkeeper:${type}`,
        questId: "afterlight-lanternkeeper-expedition",
        type,
        npcId: "juno",
      });
    }
    expect(
      firstLightServerEvent({
        id: "lanternkeeper:wrong-npc",
        type: WORLD_EVENT_TYPES.QUEST_ACCEPTED,
        questId: "afterlight-lanternkeeper-expedition",
        npcId: "sol",
      }),
    ).toBeNull();
    expect(
      firstLightServerEvent({
        id: "lanternkeeper:forged-completion",
        type: "expedition-completion-receipt",
        questId: "afterlight-lanternkeeper-expedition",
      }),
    ).toBeNull();
  });

  it("loads the server-owned state", async () => {
    httpsCallable.mockReturnValue(
      jest.fn().mockResolvedValue({ data: { progression: { level: 2 } } }),
    );
    await expect(loadWorldProgression()).resolves.toEqual({
      progression: { level: 2 },
    });
  });
});
