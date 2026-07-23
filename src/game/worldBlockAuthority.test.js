const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const functionsSource = fs.readFileSync(
  path.join(root, "functions", "index.js"),
  "utf8",
);
const clientSource = fs.readFileSync(
  path.join(root, "src", "utils", "MatchActions.js"),
  "utf8",
);
const presenceSource = fs.readFileSync(
  path.join(root, "src", "game", "usePresence.js"),
  "utf8",
);
const stationSource = fs.readFileSync(
  path.join(root, "src", "game", "useStation.js"),
  "utf8",
);

describe("world block authority wiring", () => {
  it("uses a callable for the user action and an idempotent Firestore repair trigger", () => {
    expect(clientSource).toContain('httpsCallable(functions, "blockWorldUser")');
    expect(functionsSource).toContain("exports.blockWorldUser = onCall");
    expect(functionsSource).toContain("exports.syncWorldBlockProjection");
    expect(functionsSource).toContain(
      'onDocumentWritten(\n  { document: "users/{uid}", retry: true }',
    );
    expect(functionsSource).toContain("syncWorldBlockProjection(");
  });

  it("atomically closes canonical consent and never swallows a close failure", () => {
    const blockStart = functionsSource.indexOf("exports.blockWorldUser = onCall");
    const blockEnd = functionsSource.indexOf(
      "exports.submitStationChessMove = onCall",
      blockStart,
    );
    const blockSource = functionsSource.slice(blockStart, blockEnd);
    expect(blockSource).toContain("await db.runTransaction");
    expect(blockSource).toContain("transaction.update(userRef");
    expect(blockSource).toContain("transaction.update(matchRef");
    expect(blockSource).toContain("likedByA: false");
    expect(blockSource).toContain("likedByB: false");
    expect(blockSource).toContain("matched: false");
    expect(blockSource).not.toContain(".catch(() => {})");
    expect(functionsSource).toContain("closeCanonicalBlockedMatch(uid, otherUid)");
  });

  it("uses the server-owned projection in presence and symmetric filters elsewhere", () => {
    expect(presenceSource).toContain(
      `worldPresenceViews/\${myUid}/\${currentRoom}`,
    );
    expect(presenceSource).toContain(`\`presence/\${currentRoom}/\${uid}\``);
    expect(presenceSource).not.toContain(`\`presence/\${currentRoom}\``);
    expect(presenceSource).toContain("setRemotePlayers([])");
    expect(stationSource).toContain("...projectedBlockedUids");
    expect(stationSource).toContain("!blockFilterReady");
    expect(stationSource).toContain(
      ".filter((signal) => !projectedBlockedUidSet.has(signal.fromUid))",
    );
  });

  it("purges live pair interactions as part of the server block path", () => {
    expect(functionsSource).toContain("clearRealtimePairInteractions");
    expect(functionsSource).toContain("realtimePairCleanupUpdates");
    expect(functionsSource).toContain("projectImmediateWorldBlock");
    expect(functionsSource).toContain("evictBlockedStationAtRef");
  });
});
