import { httpsCallable } from "firebase/functions";
import {
  contributeLanternkeeperExpedition,
  getLanternkeeperExpedition,
  joinLanternkeeperExpedition,
  listLanternkeeperExpeditions,
  startLanternkeeperExpedition,
} from "./lanternkeeperExpeditionBridge";

jest.mock("../firebase", () => ({ functions: {} }));
jest.mock("firebase/functions", () => ({ httpsCallable: jest.fn() }));

const scope = {
  expeditionId: "lanternkeeper-expedition",
  definitionId: "lanternkeeper-expedition-v1",
  room: "afterlight-market-garden-v1",
};

describe("Lanternkeeper callable bridge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    httpsCallable.mockReturnValue(jest.fn().mockResolvedValue({ data: {} }));
  });

  it("lists and gets only the fixed authored scope", async () => {
    await listLanternkeeperExpeditions();
    expect(httpsCallable).toHaveBeenLastCalledWith(
      {},
      "listLanternkeeperExpeditions",
    );
    expect(httpsCallable.mock.results[0].value).toHaveBeenCalledWith(scope);

    await getLanternkeeperExpedition(
      "lanternkeeper-expedition:0123456789abcdef0123456789abcdef01234567",
    );
    expect(httpsCallable).toHaveBeenLastCalledWith(
      {},
      "getLanternkeeperExpedition",
    );
    expect(httpsCallable.mock.results[1].value).toHaveBeenCalledWith({
      ...scope,
      instanceId:
        "lanternkeeper-expedition:0123456789abcdef0123456789abcdef01234567",
    });
  });

  it("bounds start, join, and contribution actions without private data", async () => {
    await startLanternkeeperExpedition("lanternkeeper:start:one");
    expect(httpsCallable.mock.results[0].value).toHaveBeenCalledWith({
      ...scope,
      actionId: "lanternkeeper:start:one",
      expectedRevision: 0,
    });

    const instanceId =
      "lanternkeeper-expedition:0123456789abcdef0123456789abcdef01234567";
    await joinLanternkeeperExpedition(
      instanceId,
      "lanternkeeper:join:one",
      3,
    );
    expect(httpsCallable.mock.results[1].value).toHaveBeenCalledWith({
      ...scope,
      instanceId,
      actionId: "lanternkeeper:join:one",
      expectedRevision: 3,
    });

    await contributeLanternkeeperExpedition(
      instanceId,
      "market-east",
      "lanternkeeper:market-east:one",
      4,
    );
    expect(httpsCallable.mock.results[2].value).toHaveBeenCalledWith({
      ...scope,
      instanceId,
      targetId: "market-east",
      actionId: "lanternkeeper:market-east:one",
      expectedRevision: 4,
    });
    expect(
      JSON.stringify(httpsCallable.mock.results[2].value.mock.calls),
    ).not.toMatch(/uid|profile|match|spark|chat/);
  });

  it("rejects malformed IDs, targets, and revisions before a callable runs", async () => {
    await expect(
      joinLanternkeeperExpedition("bad id", "safe", 1),
    ).resolves.toEqual(expect.objectContaining({ error: expect.any(String) }));
    await expect(
      contributeLanternkeeperExpedition("safe", "admin", "safe", 1),
    ).resolves.toEqual(expect.objectContaining({ error: expect.any(String) }));
    await expect(
      joinLanternkeeperExpedition("safe", "safe", -1),
    ).resolves.toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(httpsCallable).not.toHaveBeenCalled();
  });
});

