import {
  listeningCardFor,
  safeSocialChoiceId,
  socialCardIdForMatchId,
  socialMomentOutcome,
} from "./socialMoment";

const match = {
  id: "listening-a-b",
  white: "a",
  black: "b",
};

describe("Listening Crescent choice reveal", () => {
  it("selects the same authored card for both participants", () => {
    expect(listeningCardFor(match.id)).toBe(listeningCardFor(match.id));
    expect(listeningCardFor(match.id).choices).toHaveLength(3);
    expect(listeningCardFor(match.id).id).toBe(
      socialCardIdForMatchId(match.id),
    );
  });

  it("honors the match-owned card id and fails closed on an unknown id", () => {
    expect(
      listeningCardFor({ ...match, socialCardId: "small-care" }).id,
    ).toBe("small-care");
    expect(
      listeningCardFor({ ...match, socialCardId: "invented-card" }),
    ).toBeNull();
  });

  it("does not reveal until both participants have chosen", () => {
    expect(
      socialMomentOutcome(match, "a", {
        a: { matchId: match.id, choiceId: "a" },
      }),
    ).toBeNull();
  });

  it("reveals two valid answers without turning them into a score", () => {
    expect(
      socialMomentOutcome(match, "a", {
        a: { matchId: match.id, choiceId: "a" },
        b: { matchId: match.id, choiceId: "c" },
      }),
    ).toEqual(
      expect.objectContaining({
        completed: true,
        passed: false,
        sameChoice: false,
        myChoiceLabel: expect.any(String),
        opponentChoiceLabel: expect.any(String),
      }),
    );
  });

  it("keeps passing distinct from completing a shared moment", () => {
    const outcome = socialMomentOutcome(match, "a", {
      a: { matchId: match.id, choiceId: "pass" },
    });
    expect(outcome).toEqual(
      expect.objectContaining({ passed: true, completed: false }),
    );
    expect(safeSocialChoiceId("invented")).toBeNull();
  });

  it("closes the round for both people as soon as either person passes", () => {
    expect(
      socialMomentOutcome(match, "a", {
        b: { matchId: match.id, choiceId: "pass" },
      }),
    ).toEqual(
      expect.objectContaining({
        passed: true,
        completed: false,
        myChoiceId: null,
        opponentChoiceId: "pass",
      }),
    );
  });

  it("fails closed for choices from an earlier round", () => {
    expect(
      socialMomentOutcome(match, "a", {
        a: { matchId: "older-round", choiceId: "a" },
        b: { matchId: match.id, choiceId: "b" },
      }),
    ).toBeNull();
  });
});
