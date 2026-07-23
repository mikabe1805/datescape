import {
  calculateMatchScore as clientCalculateMatchScore,
  distanceBetween as clientDistanceBetween,
  failsDealbreakers as clientFailsDealbreakers,
  isIntentCompatible as clientIsIntentCompatible,
} from "../utils/MatchingEngine";
import { flattenUserData } from "../utils/DataUtils";

const server = require("../../functions/discoveryMatching");

const baseA = {
  uid: "traveler-a",
  displayName: "Ari",
  age: 29,
  ageMin: 24,
  ageMax: 40,
  distMax: 50,
  gender: "Woman",
  genderPref: "all",
  lookingFor: "Dating",
  media: ["https://example.test/a.jpg"],
  location: { lat: 40.7128, lng: -74.006 },
  interests: ["art", "hikes"],
  religions: [],
  ethnicities: [],
  children: "no",
  substances: "no",
  politics: "moderate",
  transPref: "2",
  asexualPref: "2",
  childrenPref: "0",
  substancePref: "0",
  politicsPref: "0",
  heightDealbreaker: "0",
  religionPref: "0",
};

const baseB = {
  ...baseA,
  uid: "traveler-b",
  displayName: "Bo",
  age: 31,
  gender: "Man",
  media: ["https://example.test/b.jpg"],
  location: { lat: 40.7306, lng: -73.9352 },
  interests: ["art", "music"],
};

describe("server discovery matcher parity", () => {
  beforeAll(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterAll(() => {
    console.log.mockRestore();
  });

  it.each([
    ["compatible", baseA, baseB],
    ["distance", { ...baseA, distMax: 1 }, baseB],
    ["age", { ...baseA, ageMax: 30 }, { ...baseB, age: 37 }],
    ["block-a", { ...baseA, blockedUsers: [baseB.uid] }, baseB],
    ["block-b", baseA, { ...baseB, blockedUsers: [baseA.uid] }],
    [
      "friendship",
      { ...baseA, lookingFor: "Friendship", ageMin: 28 },
      { ...baseB, lookingFor: "Both" },
    ],
    [
      "dating preferences",
      { ...baseA, genderPref: "women" },
      baseB,
    ],
  ])("matches client results for %s", (_label, first, second) => {
    expect(server.isIntentCompatible(first, second)).toBe(
      clientIsIntentCompatible(first, second),
    );
    expect(server.failsDealbreakers(first, second)).toBe(
      clientFailsDealbreakers(first, second),
    );
    expect(server.failsDealbreakers(second, first)).toBe(
      clientFailsDealbreakers(second, first),
    );
    expect(server.calculateMatchScore(first, second)).toEqual(
      clientCalculateMatchScore(first, second),
    );
    const clientDistance = clientDistanceBetween(first, second);
    const serverDistance = server.distanceBetween(first, second);
    const distancesAgree =
      clientDistance === null
        ? serverDistance === null
        : typeof serverDistance === "number" &&
          Math.abs(serverDistance - clientDistance) < 1e-8;
    expect(distancesAgree).toBe(true);
  });

  it("normalizes legacy nested profiles the same way as the client", () => {
    const raw = {
      profile: {
        name: "Legacy",
        age: "32",
        races: ["Latine"],
        racePreferences: ["Latine"],
      },
      lookingFor: "Both",
      media: [{ url: "https://example.test/legacy.jpg" }],
    };
    const client = flattenUserData({ data: () => raw }, "legacy-user");
    expect(server.flattenDiscoveryUser("legacy-user", raw)).toEqual(client);
  });

  it("requires compatibility and dealbreakers in both directions", () => {
    expect(
      server.pairQualifiesForDiscovery(
        { ...baseA, lookingFor: "Friendship" },
        { ...baseB, lookingFor: "Dating" },
      ),
    ).toBe(false);
    expect(server.pairQualifiesForDiscovery(baseA, baseB)).toBe(true);
  });

  it("projects only bounded calling-card fields", () => {
    const projection = server.toDiscoveryMatchProfile({
      ...baseA,
      password: "secret",
      blockedUsers: [baseB.uid],
      notifications: { email: "private@example.test" },
      bio: "b".repeat(2500),
      media: [
        { url: "https://example.test/a.jpg" },
        ...Array.from({ length: 8 }, (_, index) =>
          `https://example.test/${index}.jpg`,
        ),
      ],
    });

    expect(projection.uid).toBe(baseA.uid);
    expect(projection.media).toHaveLength(6);
    expect(projection.bio).toHaveLength(2000);
    expect(projection).not.toHaveProperty("password");
    expect(projection).not.toHaveProperty("blockedUsers");
    expect(projection).not.toHaveProperty("notifications");
    expect(projection).not.toHaveProperty("location");
  });
});
