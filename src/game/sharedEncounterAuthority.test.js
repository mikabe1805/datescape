const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const functionsIndex = fs.readFileSync(
  path.join(root, "functions", "index.js"),
  "utf8",
);
const modelSource = fs.readFileSync(
  path.join(root, "functions", "sharedEncounter.js"),
  "utf8",
);

describe("shared-encounter backend wiring", () => {
  it("creates encounter evidence only from trusted verified shared-activity paths", () => {
    expect(functionsIndex).toContain(
      "const encounter = await recordVerifiedSharedEncounter(",
    );
    expect(functionsIndex).toMatch(
      /verifyResonanceCompletion\([\s\S]*?advanceVerifiedResonanceParticipants\([\s\S]*?recordVerifiedSharedEncounter\(/,
    );
    expect(functionsIndex).toContain(
      'exports.recordVerifiedListeningCompletion = functionsV1',
    );
    expect(functionsIndex).toMatch(
      /recordVerifiedListeningCompletion[\s\S]*?verifyListeningCompletion\([\s\S]*?recordVerifiedSharedEncounter\([\s\S]*?"social"/,
    );
    expect(modelSource).not.toContain("firstLightProgression");
    expect(modelSource).not.toContain("worldPlayers");
  });

  it.each([
    "exports.listSharedEncounters = onCall",
    "exports.respondSharedEncounter = onCall",
    "exports.getWorldCallingCard = onCall",
  ])("exports the canonical callable surface: %s", (signature) => {
    expect(functionsIndex).toContain(signature);
  });

  it("checks both profiles and account-deletion tombstones before responding", () => {
    expect(functionsIndex).toContain("sharedEncounterPairIsBlocked(");
    expect(functionsIndex).toContain("accountDeletionTombstoneRef(opponentUid)");
    expect(functionsIndex).toContain(
      'source: "shared-encounter"',
    );
  });

  it("does not let legacy RTDB like edges create a new world match", () => {
    const legacyPromotion = functionsIndex.slice(
      functionsIndex.indexOf("exports.promoteWorldConnection = onCall"),
      functionsIndex.indexOf("exports.deleteMyAccount = onCall"),
    );
    expect(legacyPromotion).not.toContain("worldLikesByRecipient");
    expect(legacyPromotion).toContain(
      "respondSharedEncounter after two",
    );
    expect(legacyPromotion).toContain(
      'throw new HttpsError(\n    "failed-precondition"',
    );
  });

  it("removes private encounter records during account deletion", () => {
    expect(functionsIndex).toContain("sharedEncounterDocumentRefs(uid)");
    expect(functionsIndex).toContain(
      "...sharedEncounterRefs.map((ref) => db.recursiveDelete(ref))",
    );
  });
});
