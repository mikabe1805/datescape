const fs = require("node:fs");
const path = require("node:path");
const {
  hasLanternkeeperBlock,
  lanternkeeperParticipantSetIsUnblocked,
  lanternkeeperMembershipConflict,
} = require("../../functions/lanternkeeperExpeditionServerHelpers");

const functionsSource = fs.readFileSync(
  path.resolve(__dirname, "../../functions/index.js"),
  "utf8",
);

describe("Lanternkeeper Expedition callable authority helpers", () => {
  it("exports the fixed contract and all callable entry points", () => {
    [
      "listLanternkeeperExpeditions",
      "getLanternkeeperExpedition",
      "startLanternkeeperExpedition",
      "joinLanternkeeperExpedition",
      "leaveLanternkeeperExpedition",
      "contributeLanternkeeperExpedition",
    ].forEach((name) => {
      expect(functionsSource).toContain(`exports.${name} = onCall`);
    });
  });

  it("filters joins when either participant has blocked the other", () => {
    expect(
      hasLanternkeeperBlock(
        "joiner",
        { blockedUsers: ["member"] },
        "member",
        {},
      ),
    ).toBe(true);
    expect(
      hasLanternkeeperBlock(
        "joiner",
        {},
        "member",
        { blockedUsers: ["joiner"] },
      ),
    ).toBe(true);
    expect(
      hasLanternkeeperBlock("joiner", {}, "member", {}),
    ).toBe(false);
  });

  it("fails closed when any active participant pair is blocked or unknown", () => {
    expect(
      lanternkeeperParticipantSetIsUnblocked(
        ["caller", "blocked-a", "blocked-b"],
        new Map([
          ["caller", {}],
          ["blocked-a", { blockedUsers: ["blocked-b"] }],
          ["blocked-b", {}],
        ]),
      ),
    ).toBe(false);
    expect(
      lanternkeeperParticipantSetIsUnblocked(
        ["caller", "blocked-a", "blocked-b"],
        new Map([
          ["caller", {}],
          ["blocked-a", {}],
          ["blocked-b", { blockedUsers: ["blocked-a"] }],
        ]),
      ),
    ).toBe(false);
    expect(
      lanternkeeperParticipantSetIsUnblocked(
        ["caller", "missing-user"],
        new Map([["caller", {}]]),
      ),
    ).toBe(false);
    expect(
      lanternkeeperParticipantSetIsUnblocked(
        ["caller", null],
        new Map([
          ["caller", {}],
          [null, {}],
        ]),
      ),
    ).toBe(false);
    expect(
      lanternkeeperParticipantSetIsUnblocked(
        ["caller", "member-a", "member-b"],
        new Map([
          ["caller", {}],
          ["member-a", {}],
          ["member-b", {}],
        ]),
      ),
    ).toBe(true);
  });

  it("prevents one user from being active in two live instances", () => {
    expect(
      lanternkeeperMembershipConflict(
        { activeInstanceId: "one", activeExpiresAt: 20_000 },
        "two",
        10_000,
      ),
    ).toBe(true);
    expect(
      lanternkeeperMembershipConflict(
        { activeInstanceId: "one", activeExpiresAt: 5_000 },
        "two",
        10_000,
      ),
    ).toBe(false);
  });

  it("rechecks blocks for contributions and separates a newly blocked pair", () => {
    const joinSource = functionsSource.slice(
      functionsSource.indexOf("exports.joinLanternkeeperExpedition = onCall"),
      functionsSource.indexOf("exports.leaveLanternkeeperExpedition = onCall"),
    );
    const contributionSource = functionsSource.slice(
      functionsSource.indexOf(
        "exports.contributeLanternkeeperExpedition = onCall",
      ),
      functionsSource.indexOf(
        "async function scrubLanternkeeperExpeditionsParticipant",
      ),
    );
    expect(joinSource).toContain("requireUnblockedLanternkeeperParticipants(");
    expect(joinSource.indexOf("requireUnblockedLanternkeeperParticipants("))
      .toBeLessThan(joinSource.indexOf("if (!reduced.applied)"));
    expect(contributionSource).toContain(
      "await requireUnblockedLanternkeeperParticipants(",
    );
    expect(functionsSource).toContain("separateBlockedLanternkeeperPair(");
    expect(functionsSource).toContain(
      "scrubLanternkeeperExpeditionParticipant(state, uid)",
    );
    expect(functionsSource).toContain(
      "selectLanternkeeperActiveMemberUids(state).includes(otherUid)",
    );
  });

  it("closes expedition admission before account-deletion scrubbing", () => {
    expect(
      (functionsSource.match(/rejectDeletedLanternkeeperAccount\(/g) || [])
        .length,
    ).toBeGreaterThanOrEqual(4);
    const deletionSource = functionsSource.slice(
      functionsSource.indexOf("exports.deleteMyAccount = onCall"),
    );
    expect(deletionSource.indexOf("accountDeletionTombstoneRef(uid).set"))
      .toBeGreaterThanOrEqual(0);
    expect(deletionSource.indexOf("accountDeletionTombstoneRef(uid).set"))
      .toBeLessThan(
        deletionSource.indexOf("scrubLanternkeeperExpeditionsParticipant(uid)"),
      );
    expect(
      (deletionSource.match(/scrubLanternkeeperExpeditionsParticipant\(uid\)/g) || [])
        .length,
    ).toBeGreaterThanOrEqual(2);
  });
});
