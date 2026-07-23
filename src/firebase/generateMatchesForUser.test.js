import { httpsCallable } from "firebase/functions";
import { generateMatchesForUser } from "./generateMatchesForUser";

const mockRefresh = jest.fn();

jest.mock("../firebase", () => ({
  auth: { currentUser: { uid: "traveler-a" } },
  functions: { name: "functions" },
}));

jest.mock("firebase/functions", () => ({
  httpsCallable: jest.fn(),
}));

describe("discovery refresh client bridge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefresh.mockResolvedValue({ data: { eligible: 3, written: 3 } });
    httpsCallable.mockReturnValue(mockRefresh);
  });

  it("sends no profile or candidate data to the authenticated callable", async () => {
    const result = await generateMatchesForUser(
      { uid: "traveler-a", blockedUsers: ["private"], password: "secret" },
      "traveler-a",
    );

    expect(httpsCallable).toHaveBeenCalledWith(
      { name: "functions" },
      "refreshDiscoveryMatches",
    );
    expect(mockRefresh).toHaveBeenCalledWith({});
    expect(result).toEqual({ eligible: 3, written: 3 });
  });

  it("rejects a mismatched caller id before invoking authority", async () => {
    await expect(
      generateMatchesForUser({}, "traveler-b"),
    ).resolves.toBeNull();
    expect(httpsCallable).not.toHaveBeenCalled();
  });
});
