import { buildCombinedIds, parseCombinedIds } from "./utils/MatchIds";

test("match id helpers preserve the other user and stable match ids", () => {
  const combined = buildCombinedIds("other-user", "current-user");
  expect(combined).toBe("other-user_current-user");

  expect(parseCombinedIds(combined, "current-user")).toEqual({
    otherId: "other-user",
    matchId: "current-user_other-user"
  });

  expect(parseCombinedIds("current-user_other-user", "current-user")).toEqual({
    otherId: "other-user",
    matchId: "current-user_other-user"
  });
});
