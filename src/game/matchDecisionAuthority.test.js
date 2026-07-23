const fs = require("node:fs");
const path = require("node:path");
const {
  matchPairIsBlocked,
  reduceMatchDecision,
  safeMatchDecision,
  safeMatchId,
} = require("../../functions/matchDecision");

const root = path.resolve(__dirname, "../..");
const queueSource = fs.readFileSync(
  path.join(root, "src", "components", "MatchQueue.js"),
  "utf8",
);
const likesSource = fs.readFileSync(
  path.join(root, "src", "components", "LikesPage.jsx"),
  "utf8",
);
const actionSource = fs.readFileSync(
  path.join(root, "src", "utils", "MatchActions.js"),
  "utf8",
);
const functionsIndex = fs.readFileSync(
  path.join(root, "functions", "index.js"),
  "utf8",
);

const base = Object.freeze({
  userA: "alice",
  userB: "bob",
  likedByA: false,
  likedByB: false,
  isActiveA: true,
  isActiveB: true,
  matched: false,
});

describe("server-authoritative match decisions", () => {
  test("accepts only bounded path-safe match ids and known decisions", () => {
    expect(safeMatchId("alice_bob")).toBe("alice_bob");
    expect(safeMatchId("bad/path")).toBeNull();
    expect(safeMatchId("x".repeat(301))).toBeNull();
    expect(safeMatchDecision("like")).toBe("like");
    expect(safeMatchDecision("restore")).toBeNull();
  });

  test("records one participant decision without trusting the client for pair state", () => {
    expect(
      reduceMatchDecision(base, { uid: "alice", decision: "like" }),
    ).toEqual({
      ok: true,
      applied: true,
      matched: false,
      updates: { likedByA: true, isActiveA: false },
    });
    expect(
      reduceMatchDecision(base, { uid: "mallory", decision: "like" }).code,
    ).toBe("permission-denied");
  });

  test("the second concurrent transaction produces the mutual connection", () => {
    const afterAlice = { ...base, likedByA: true, isActiveA: false };
    expect(
      reduceMatchDecision(afterAlice, { uid: "bob", decision: "like" }),
    ).toEqual({
      ok: true,
      applied: true,
      matched: true,
      updates: {
        likedByB: true,
        isActiveB: false,
        isActiveA: false,
        matched: true,
      },
    });
  });

  test("unmatch invalidates both prior consents and is idempotent", () => {
    const connected = {
      ...base,
      likedByA: true,
      likedByB: true,
      isActiveA: false,
      isActiveB: false,
      matched: true,
    };
    expect(
      reduceMatchDecision(connected, { uid: "alice", decision: "unmatch" }),
    ).toMatchObject({
      ok: true,
      matched: false,
      updates: {
        likedByA: false,
        likedByB: false,
        isActiveA: false,
        isActiveB: false,
        matched: false,
      },
    });
    expect(
      reduceMatchDecision(
        { ...connected, likedByA: false, likedByB: false, matched: false },
        { uid: "alice", decision: "unmatch" },
      ),
    ).toMatchObject({ ok: true, applied: false, matched: false });
  });

  test("ended decisions cannot be changed and either block direction is detected", () => {
    expect(
      reduceMatchDecision(
        { ...base, isActiveA: false, likedByA: false },
        { uid: "alice", decision: "like" },
      ).code,
    ).toBe("failed-precondition");
    expect(matchPairIsBlocked({ ...base, blockedBy: ["alice"] }, {}, {})).toBe(
      true,
    );
    expect(
      matchPairIsBlocked(base, { blockedUsers: ["bob"] }, { blockedUsers: [] }),
    ).toBe(true);
    expect(matchPairIsBlocked(base, {}, {})).toBe(false);
  });

  test("all discovery clients call the server decision authority", () => {
    expect(actionSource).toContain(
      'httpsCallable(functions, "submitMatchDecision")',
    );
    expect(queueSource).toContain("await submitMatchDecision(");
    expect(likesSource).toContain("await submitMatchDecision(matchId, response)");
    expect(queueSource).not.toContain("await updateDoc(matchRef, updates)");
    expect(likesSource).not.toContain("await updateDoc(matchRef, payload)");
  });

  test("the callable serializes consent and fails closed on blocks or deletion", () => {
    const callable = functionsIndex.slice(
      functionsIndex.indexOf("exports.submitMatchDecision = onCall"),
      functionsIndex.indexOf("exports.submitSafetyReport = onCall"),
    );
    expect(callable).toContain("return db.runTransaction(async (transaction)");
    expect(callable).toContain("transaction.get(accountDeletionTombstoneRef(");
    expect(callable).toContain("matchPairIsBlocked(match");
    expect(callable).toContain("transaction.update(matchRef");
    expect(callable).toContain("unmatchedBy: uid");
  });
});
