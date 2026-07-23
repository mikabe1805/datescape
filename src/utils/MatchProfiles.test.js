import { otherProfileFromMatch } from "./MatchProfiles";

describe("participant-scoped match profiles", () => {
  const match = {
    userA: "traveler-a",
    userB: "traveler-b",
    userAProfile: { displayName: "Ari", media: ["ari.jpg"] },
    userBProfile: { displayName: "Bea", media: ["bea.jpg"] },
  };

  test("returns only the other participant's denormalized profile", () => {
    expect(otherProfileFromMatch(match, "traveler-a")).toEqual({
      uid: "traveler-b",
      displayName: "Bea",
      media: ["bea.jpg"],
    });
    expect(otherProfileFromMatch(match, "traveler-b")?.displayName).toBe(
      "Ari",
    );
  });

  test("does not reveal a profile to a non-participant", () => {
    expect(otherProfileFromMatch(match, "traveler-c")).toBeNull();
    expect(otherProfileFromMatch(null, "traveler-a")).toBeNull();
  });
});
