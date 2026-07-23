const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const functionsSource = fs.readFileSync(
  path.join(root, "functions", "index.js"),
  "utf8",
);
const bridgeSource = fs.readFileSync(
  path.join(root, "src", "firebase", "generateMatchesForUser.js"),
  "utf8",
);
const refreshSource = fs.readFileSync(
  path.join(root, "functions", "discoveryRefresh.js"),
  "utf8",
);
const profilePageSource = fs.readFileSync(
  path.join(root, "src", "components", "ProfilePage.js"),
  "utf8",
);
const matchQueueSource = fs.readFileSync(
  path.join(root, "src", "components", "MatchQueue.js"),
  "utf8",
);

describe("private server-authoritative discovery wiring", () => {
  it("derives candidates from authenticated Admin-side user documents", () => {
    expect(functionsSource).toContain("exports.refreshDiscoveryMatches = onCall");
    expect(functionsSource).toContain(
      ".limit(DISCOVERY_MAX_USER_DOCUMENTS + 1)",
    );
    expect(functionsSource).toContain("pairQualifiesForDiscovery(caller, candidate)");
    expect(functionsSource).toContain("reconcileDiscoveryMatch(");
    expect(refreshSource).toContain("toDiscoveryMatchProfile(userA)");
    expect(refreshSource).toContain('source: "discovery"');
    expect(refreshSource).toContain("firestore.runTransaction");
  });

  it("bounds and rate-limits discovery without returning candidate counts", () => {
    expect(functionsSource).toContain("reserveDiscoveryRefresh(");
    expect(functionsSource).toContain("usersSnapshot.size > DISCOVERY_MAX_USER_DOCUMENTS");
    expect(functionsSource).toContain('return { refreshed: false }');
    expect(functionsSource).toContain('return { refreshed: true }');
    expect(functionsSource).not.toContain("eligible: eligibleMatchIds.size");
    expect(refreshSource).toContain("DISCOVERY_REFRESH_COOLDOWN_MS");
    expect(refreshSource).toContain("DISCOVERY_REFRESH_WINDOW_MAX");
    expect(refreshSource).toContain("refreshAttemptId");
    expect(functionsSource).toContain(
      "accountDeletionTombstoneRef(candidateUid)",
    );
    expect(functionsSource).toContain("participantUserRefs");
    expect(refreshSource).toContain("currentDiscoveryPair(");
    expect(refreshSource).toContain('return { status: "blocked" }');
    expect(refreshSource).toContain('return { status: "retained" }');
  });

  it("keeps private profiles out of the client bridge", () => {
    expect(bridgeSource).toContain(
      'httpsCallable(functions, "refreshDiscoveryMatches")',
    );
    expect(bridgeSource).toContain("await refresh({})");
    expect(bridgeSource).not.toMatch(/firebase\/firestore|getDocs|collection\(/);
  });

  it("lets authority reconcile active cards instead of client-side deletion", () => {
    expect(profilePageSource).not.toMatch(/deleteExistingMatches|deleteDoc\(/);
    expect(profilePageSource).toContain("generateMatchesForUser(");
  });

  it("refreshes a widened queue through the callable without reading other users", () => {
    expect(matchQueueSource).toContain("generateMatchesForUser(");
    expect(matchQueueSource).not.toMatch(
      /collection\(db,\s*["']users["']\)/,
    );
  });
});
