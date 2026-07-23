import { httpsCallable } from "firebase/functions";
import { makeMatchId, promoteWorldLikeToMatch } from "./matchBridge";

const callable = jest.fn();

jest.mock("../firebase", () => ({ functions: { name: "functions" } }));
jest.mock("firebase/functions", () => ({ httpsCallable: jest.fn() }));

describe("world match promotion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    httpsCallable.mockReturnValue(callable);
  });

  it("uses a stable participant-order-independent id", () => {
    expect(makeMatchId("b", "a")).toBe("a_b");
  });

  it("delegates mutual verification and creation to the trusted backend", async () => {
    callable.mockResolvedValue({ data: { matchId: "a_b", created: true } });

    await expect(
      promoteWorldLikeToMatch({ fromUid: "b", toUid: "a" })
    ).resolves.toEqual({ matchId: "a_b", created: true });

    expect(httpsCallable).toHaveBeenCalledWith(
      { name: "functions" },
      "promoteWorldConnection"
    );
    expect(callable).toHaveBeenCalledWith({ toUid: "a" });
  });
});
