import { httpsCallable } from "firebase/functions";
import {
  getWorldCallingCard,
  listSharedEncounters,
  respondSharedEncounter,
  sanitizeSharedEncounter,
  sanitizeSharedEncounterList,
  sanitizeWorldCallingCard,
} from "./sharedEncounter";

jest.mock("../firebase", () => ({ functions: {} }));
jest.mock("firebase/functions", () => ({ httpsCallable: jest.fn() }));

const rawEncounter = {
  id: "encounter:one",
  sourceId: "resonance:match_one",
  mode: "resonance",
  opponent: { uid: "traveler_b", name: "Bea", email: "private@example.com" },
  state: "open",
  response: null,
  createdAt: 2_000,
  expiresAt: 12_000,
  members: ["private"],
  reward: { xp: 999 },
};

describe("shared encounter client contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("projects only bounded encounter fields and keeps source and connection IDs distinct", () => {
    expect(
      sanitizeSharedEncounter({
        ...rawEncounter,
        state: "mutual",
        mutual: true,
        matchId: "traveler_a_traveler_b",
      }),
    ).toEqual({
      id: "encounter:one",
      sourceId: "resonance:match_one",
      mode: "resonance",
      opponent: { uid: "traveler_b", name: "Bea" },
      response: "spark",
      state: "mutual",
      createdAt: 2_000,
      expiresAt: 12_000,
      matchId: "traveler_a_traveler_b",
    });
    expect(JSON.stringify(sanitizeSharedEncounter(rawEncounter))).not.toMatch(
      /email|members|reward|"xp"|private@example/,
    );
    expect(
      sanitizeSharedEncounter({ ...rawEncounter, sourceId: "bad source id" }),
    ).toBeNull();
  });

  it("deduplicates, sorts, and bounds encounter lists", () => {
    const result = sanitizeSharedEncounterList(
      [
        rawEncounter,
        { ...rawEncounter, id: "encounter:two", createdAt: 3_000 },
        { ...rawEncounter, opponent: { uid: "bad uid!" } },
        { ...rawEncounter, state: "passed", viewerResponse: "pass" },
      ],
      2,
    );
    expect(result.map((entry) => entry.id)).toEqual([
      "encounter:two",
      "encounter:one",
    ]);
  });

  it("sanitizes the callable-only calling card projection", () => {
    expect(
      sanitizeWorldCallingCard(
        {
          uid: "traveler_b",
          displayName: "  Bea  ",
          photoUrl: "https://cdn.example/bea.jpg",
          bio: "Night-market regular",
          age: 29,
          lookingFor: "Kind adventures",
          interests: ["Music", "Music", "Gardens", 42, "Ceramics"],
          email: "never-return@example.com",
          location: { exact: true },
        },
        "traveler_b",
      ),
    ).toEqual({
      uid: "traveler_b",
      displayName: "Bea",
      photoUrl: "https://cdn.example/bea.jpg",
      bio: "Night-market regular",
      age: 29,
      lookingFor: "Kind adventures",
      interests: ["Music", "Gardens", "Ceramics"],
    });
    expect(
      sanitizeWorldCallingCard({ uid: "somebody_else" }, "traveler_b"),
    ).toBeNull();
  });

  it("calls list and response endpoints with exact bounded payloads", async () => {
    const listInvoke = jest.fn().mockResolvedValue({
      data: { encounters: [rawEncounter] },
    });
    const respondInvoke = jest.fn().mockResolvedValue({
      data: {
        encounter: { ...rawEncounter, response: "spark", state: "pending" },
        mutual: false,
      },
    });
    httpsCallable
      .mockReturnValueOnce(listInvoke)
      .mockReturnValueOnce(respondInvoke);

    await expect(listSharedEncounters({ limit: 999 })).resolves.toEqual({
      encounters: [sanitizeSharedEncounter(rawEncounter)],
      error: null,
    });
    expect(listInvoke).toHaveBeenCalledWith({ limit: 20 });

    const response = await respondSharedEncounter({
      encounterId: "encounter:one",
      response: "spark",
      actionId: "shared-encounter:spark:one",
    });
    expect(respondInvoke).toHaveBeenCalledWith({
      encounterId: "encounter:one",
      response: "spark",
      actionId: "shared-encounter:spark:one",
    });
    expect(response.encounter.state).toBe("pending");
    expect(JSON.stringify(respondInvoke.mock.calls)).not.toMatch(
      /opponent|profile|reward|sourceId|matchId/,
    );
  });

  it("rejects malformed responses before invoking a callable", async () => {
    await expect(
      respondSharedEncounter({
        encounterId: "bad id",
        response: "spark",
        actionId: "safe",
      }),
    ).resolves.toEqual(expect.objectContaining({ error: expect.any(String) }));
    await expect(
      respondSharedEncounter({
        encounterId: "encounter:one",
        response: "reward-me",
        actionId: "safe",
      }),
    ).resolves.toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(httpsCallable).not.toHaveBeenCalled();
  });

  it("loads calling cards only through the sanitized callable", async () => {
    const invoke = jest.fn().mockResolvedValue({
      data: {
        profile: {
          uid: "traveler_b",
          displayName: "Bea",
          photoUrl: null,
          bio: "Hello",
          age: null,
          lookingFor: null,
          interests: [],
          password: "private",
        },
      },
    });
    httpsCallable.mockReturnValue(invoke);
    const result = await getWorldCallingCard("traveler_b");
    expect(httpsCallable).toHaveBeenCalledWith({}, "getWorldCallingCard");
    expect(invoke).toHaveBeenCalledWith({
      uid: "traveler_b",
      room: "afterlight-market-garden-v1",
    });
    expect(result.profile).toEqual(
      expect.objectContaining({ uid: "traveler_b", displayName: "Bea" }),
    );
    expect(JSON.stringify(result)).not.toMatch(/password|private/);
  });
});
