const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const functionsIndex = fs.readFileSync(
  path.join(root, "functions", "index.js"),
  "utf8",
);

const echoBackend = functionsIndex.slice(
  functionsIndex.indexOf("const RESONANCE_ECHO_STATE_COLLECTION"),
  functionsIndex.indexOf("function resonanceReceiptId"),
);
const startCallable = echoBackend.slice(
  echoBackend.indexOf("exports.startResonanceEcho = onCall"),
  echoBackend.indexOf("exports.pollResonanceEcho = onCall"),
);
const pollCallable = echoBackend.slice(
  echoBackend.indexOf("exports.pollResonanceEcho = onCall"),
  echoBackend.indexOf("exports.completeResonanceEcho = onCall"),
);
const completeCallable = echoBackend.slice(
  echoBackend.indexOf("exports.completeResonanceEcho = onCall"),
  echoBackend.indexOf("exports.resonanceEchoServer"),
);

describe("Resonance Echo callable authority wiring", () => {
  it.each([
    "exports.startResonanceEcho = onCall",
    "exports.pollResonanceEcho = onCall",
    "exports.completeResonanceEcho = onCall",
  ])("exports the canonical callable surface: %s", (signature) => {
    expect(functionsIndex).toContain(signature);
  });

  it("stores one private state document per authenticated uid", () => {
    expect(echoBackend).toContain(
      'const RESONANCE_ECHO_STATE_COLLECTION = "worldResonanceEchoStates"',
    );
    expect(startCallable).toContain("const uid = requireAuthenticatedUid(request)");
    expect(startCallable).toContain(
      "resonanceEchoReducerInput(uid, request.data, true)",
    );
    expect(startCallable).toContain(
      "db.collection(RESONANCE_ECHO_STATE_COLLECTION).doc(uid)",
    );
    expect(startCallable).not.toContain("request.data?.uid");
  });

  it("requires fresh server-observed presence beside the authored Garden Loom", () => {
    expect(echoBackend).toContain("RESONANCE_ECHO_PRESENCE_FRESH_MS = 12_000");
    expect(echoBackend).toContain("RESONANCE_ECHO_PRESENCE_FUTURE_TOLERANCE_MS = 5_000");
    expect(echoBackend).toContain("x: -4.8");
    expect(echoBackend).toContain("z: -14");
    expect(echoBackend).toContain(
      ".ref(`presence/${RESONANCE_ECHO_ROOM_ID}/${uid}`)",
    );
    [startCallable, pollCallable, completeCallable].forEach((callable) => {
      expect(callable).toContain("requireFreshResonanceEchoPresence(uid");
    });
  });

  it("closes mutation admission with the account-deletion tombstone", () => {
    [startCallable, completeCallable].forEach((callable) => {
      expect(callable).toContain("accountDeletionTombstoneRef(uid)");
      expect(callable).toContain(
        "rejectDeletedResonanceEchoAccount(deletionTombstone)",
      );
    });
    expect(pollCallable).toContain("accountDeletionTombstoneRef(uid).get()");
    expect(pollCallable).toContain(
      "rejectDeletedResonanceEchoAccount(deletionTombstone)",
    );
  });

  it("uses server time and the strict 90-second reducer for start and completion", () => {
    expect(startCallable).toContain("const attemptNow = Date.now()");
    expect(startCallable).toContain("reduceResonanceEchoStart(");
    expect(completeCallable).toContain("const attemptNow = Date.now()");
    expect(completeCallable).toContain("reduceResonanceEchoCompletion(");
    expect(echoBackend).toContain("serverUpdatedAt: FieldValue.serverTimestamp()");
    expect(echoBackend).toContain("RESONANCE_ECHO_WAIT_MS");
  });

  it("checks quest eligibility before waiting and applies proof only at completion", () => {
    expect(startCallable).toContain("requireResonanceEchoQuestEligibility(");
    expect(echoBackend).toContain("FIRST_LIGHT_NODES.RESONATE_TOGETHER");
    expect(completeCallable).toContain("applyVerifiedResonanceEchoReceipt(");
    expect(completeCallable).toMatch(
      /applyVerifiedResonanceEchoReceipt\([\s\S]*?reduced\.receipt,[\s\S]*?uid,[\s\S]*?attemptNow/,
    );
    expect(completeCallable).toContain("if (!progressionResult.eligible)");
  });

  it("writes Echo completion and progression in the same transaction", () => {
    expect(completeCallable).toContain("db.runTransaction(async (transaction)");
    expect(completeCallable).toContain(
      "transaction.set(echoRef, storedResonanceEchoState(reduced.state))",
    );
    expect(completeCallable).toContain(
      "transaction.set(playerRef, progressionResult.state)",
    );
    expect(completeCallable).toContain(
      "progression: publicWorldPlayerState(",
    );
  });

  it("keeps the solo availability path outside shared encounters and matching", () => {
    expect(echoBackend).not.toContain("recordVerifiedSharedEncounter");
    expect(echoBackend).not.toContain("SHARED_ENCOUNTER_COLLECTION");
    expect(echoBackend).not.toContain('collection("matches")');
    expect(echoBackend).not.toContain("worldLikes");
  });

  it("removes the private Echo state during account deletion", () => {
    const accountDeletion = functionsIndex.slice(
      functionsIndex.indexOf("exports.deleteMyAccount = onCall"),
      functionsIndex.indexOf("async function sendEmail"),
    );
    expect(accountDeletion).toContain(
      "db.collection(RESONANCE_ECHO_STATE_COLLECTION).doc(uid)",
    );
  });
});
