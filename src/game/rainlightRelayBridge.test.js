import { httpsCallable } from "firebase/functions";
import {
  contributeRainlightRelay,
  loadRainlightRelay,
  rainlightContributionPayload,
} from "./rainlightRelayBridge";

jest.mock("../firebase", () => ({ functions: {} }));
jest.mock("firebase/functions", () => ({ httpsCallable: jest.fn() }));

describe("Rainlight Relay server bridge", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates only the bounded event contribution payload", () => {
    expect(rainlightContributionPayload("market", "relay:action-1")).toEqual({
      eventId: "rainlight-relay",
      room: "afterlight-market-garden-v1",
      sourceId: "market",
      actionId: "relay:action-1",
    });
    expect(rainlightContributionPayload("private-room", "relay:action-2")).toBeNull();
    expect(rainlightContributionPayload("market", "spaces are not safe")).toBeNull();
  });

  it("loads aggregate and personalized state through the authenticated callable", async () => {
    const invoke = jest.fn().mockResolvedValue({
      data: {
        event: { instanceId: "relay:1" },
        personal: { contributedSources: ["market"] },
      },
    });
    httpsCallable.mockReturnValue(invoke);
    await expect(loadRainlightRelay()).resolves.toEqual({
      event: { instanceId: "relay:1" },
      personal: { contributedSources: ["market"] },
    });
    expect(httpsCallable).toHaveBeenCalledWith({}, "getRainlightRelay");
    expect(invoke).toHaveBeenCalledWith({
      eventId: "rainlight-relay",
      room: "afterlight-market-garden-v1",
    });
  });

  it("returns only server-owned progression from a contribution", async () => {
    const invoke = jest.fn().mockResolvedValue({
      data: {
        applied: true,
        event: { phase: "gathering" },
        personal: { contributedSources: ["resonance"] },
        progression: { xp: 50 },
      },
    });
    httpsCallable.mockReturnValue(invoke);
    await expect(
      contributeRainlightRelay("resonance", "relay:source-1"),
    ).resolves.toEqual({
      applied: true,
      duplicate: false,
      event: { phase: "gathering" },
      personal: { contributedSources: ["resonance"] },
      progression: { xp: 50 },
    });
    expect(invoke).toHaveBeenCalledWith({
      eventId: "rainlight-relay",
      room: "afterlight-market-garden-v1",
      sourceId: "resonance",
      actionId: "relay:source-1",
    });
  });
});

