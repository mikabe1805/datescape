const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const functionsSource = fs.readFileSync(
  path.join(root, "functions", "index.js"),
  "utf8",
);
const clientSource = fs.readFileSync(
  path.join(root, "src", "game", "usePresence.js"),
  "utf8",
);
const databaseRules = fs.readFileSync(
  path.join(root, "database.rules.json"),
  "utf8",
);

describe("world presence projection wiring", () => {
  it("fans membership events through the pure session-aware reconciler", () => {
    expect(functionsSource).toContain("exports.syncWorldPresenceMembership");
    expect(functionsSource).toContain(
      '.ref("/worldRoomMemberships/{room}/{uid}")',
    );
    expect(functionsSource).toContain("currentMembershipMatchesEvent(");
    expect(functionsSource).toContain("membershipViewReconciliation({");
    expect(functionsSource).toContain("presenceBlockStatesForPeers(");
  });

  it("uses a session-specific disconnect marker and conditional cleanup", () => {
    expect(functionsSource).toContain("exports.cleanupWorldPresenceDisconnect");
    expect(functionsSource).toContain(
      '.ref("/worldRoomDisconnects/{room}/{uid}/{sessionId}")',
    );
    expect(functionsSource).toContain("removeOwnedPresenceSession(");
    expect(functionsSource).toContain(
      "value && value.sessionId === sessionId ? null : undefined",
    );
    expect(clientSource).toContain("await disconnectGuard.set(true)");
    expect(clientSource.indexOf("await disconnectGuard.set(true)")).toBeLessThan(
      clientSource.indexOf("await set(membershipRef"),
    );
  });

  it("revokes projected pairs on block and repairs them after block changes", () => {
    expect(functionsSource).toContain("presenceRevocations");
    expect(functionsSource).toContain("reconcileWorldPresencePair(uid, otherUid)");
    expect(functionsSource).toContain(
      "[...new Set([...result.addedUids, ...result.removedUids])]",
    );
  });

  it("purges owned and inbound presence projection state on account deletion", () => {
    expect(functionsSource).toContain(
      "...presenceProjectionDeletionUpdates(rootValue, uid)",
    );
    expect(functionsSource).toContain(
      `.ref(\`worldAccountDeletionTombstones/\${uid}\`)`,
    );
    expect(
      (
        functionsSource.match(/collectRealtimeDeletionUpdates\(/g) || []
      ).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("never subscribes the client to a raw room parent", () => {
    expect(clientSource).toContain(
      `\`worldPresenceViews/\${myUid}/\${currentRoom}\``,
    );
    expect(clientSource).toContain(`\`presence/\${currentRoom}/\${uid}\``);
    expect(clientSource).not.toContain(`\`presence/\${currentRoom}\``);
  });

  it("requires a fresh viewer session before projected roster or peer reads", () => {
    expect(databaseRules).toContain(
      "child($viewerUid).child('sessionId').val() === root.child('presence')",
    );
    expect(databaseRules).toContain(
      "child(auth.uid).child('lastUpdate').val() >= now - 15000",
    );
  });
});
