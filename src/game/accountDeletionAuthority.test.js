const fs = require("node:fs");
const path = require("node:path");
const {
  accountAdmissionIsActive,
  accountDeletionTombstoneId,
  deletionManifestMatchIds,
  uniqueAccountUids,
} = require("../../functions/accountDeletion");

const root = path.resolve(__dirname, "../..");
const functionsSource = fs.readFileSync(
  path.join(root, "functions", "index.js"),
  "utf8",
);

describe("account deletion admission", () => {
  it("fails closed unless every unique account exists without either marker", () => {
    expect(
      accountAdmissionIsActive([
        {
          userExists: true,
          hashedTombstoneExists: false,
          rulesMarkerExists: false,
        },
      ]),
    ).toBe(true);
    for (const record of [
      { userExists: false },
      { userExists: true, hashedTombstoneExists: true },
      { userExists: true, rulesMarkerExists: true },
    ]) {
      expect(accountAdmissionIsActive([record])).toBe(false);
    }
    expect(accountAdmissionIsActive([])).toBe(false);
  });

  it("normalizes identities and preserves the deletion match manifest across retries", () => {
    expect(uniqueAccountUids([" alice ", "bob", "alice", "", null])).toEqual([
      "alice",
      "bob",
    ]);
    expect(
      deletionManifestMatchIds(
        { matchIds: ["m-2", "m-1", "m-2", " "] },
        ["m-3", "m-1"],
      ),
    ).toEqual(["m-1", "m-2", "m-3"]);
    expect(accountDeletionTombstoneId("alice")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("loads the user, hashed tombstone, and rules marker through one admission helper", () => {
    const helper = functionsSource.slice(
      functionsSource.indexOf("function accountAdmissionRefs"),
      functionsSource.indexOf("function realtimeEdgeValue"),
    );
    expect(helper).toContain('db.collection("users").doc(uid)');
    expect(helper).toContain("accountDeletionTombstoneRef(uid)");
    expect(helper).toContain("deletingAccountRef(uid)");
    expect(helper).toContain("transaction.get(reference)");
    expect(helper).toContain("const after = await loadAccountAdmission(uids)");
    expect(helper.indexOf("const after = await loadAccountAdmission(uids)"))
      .toBeLessThan(helper.indexOf("if (mutationError) throw mutationError"));
  });

  it("commits both permanent Firestore markers before RTDB and cleanup", () => {
    const deletion = functionsSource.slice(
      functionsSource.indexOf("exports.deleteMyAccount = onCall"),
      functionsSource.indexOf("async function sendEmail"),
    );
    const batchCommit = deletion.indexOf("await markerBatch.commit()");
    const realtimeMarker = deletion.indexOf("worldAccountDeletionTombstones");
    const discovery = deletion.indexOf("matchingDocumentRefs(uid)");
    expect(deletion).toContain("accountDeletionTombstoneRef(uid)");
    expect(deletion).toContain("deletingAccountRef(uid)");
    expect(batchCommit).toBeGreaterThan(0);
    expect(batchCommit).toBeLessThan(realtimeMarker);
    expect(realtimeMarker).toBeLessThan(discovery);
  });

  it("persists retryable storage paths, purges twice, and deletes Auth last", () => {
    const deletion = functionsSource.slice(
      functionsSource.indexOf("exports.deleteMyAccount = onCall"),
      functionsSource.indexOf("async function sendEmail"),
    );
    expect(deletion).toContain("persistAccountDeletionManifest(");
    expect(
      (deletion.match(/purgeAccountStorage\(bucket, uid, matchIds\)/g) || [])
        .length,
    ).toBe(2);
    expect(deletion).toContain(
      "db.collection(SAFETY_REPORT_RATE_LIMIT_COLLECTION).doc(uid)",
    );
    expect(deletion.lastIndexOf("purgeAccountStorage(bucket, uid, matchIds)"))
      .toBeLessThan(deletion.indexOf("getAuth().deleteUser(uid)"));
  });
});
