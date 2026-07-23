const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getDatabase } = require("firebase-admin/database");
const {
  blockedUidSet,
  safeWorldUid,
} = require("../worldBlockProjection");

// Dry-run by default. Apply reviewed, additive projection writes with:
// npm --prefix functions run security:backfill-world-blocks -- --apply
initializeApp();

async function main() {
  const apply = process.argv.includes("--apply");
  const snapshot = await getFirestore().collection("users").get();
  const updates = {};
  let edgeCount = 0;

  snapshot.docs.forEach((document) => {
    const uid = safeWorldUid(document.id);
    if (!uid) return;
    blockedUidSet(document.data()).forEach((otherUid) => {
      if (otherUid === uid) return;
      updates[`worldBlockEdges/${uid}/${otherUid}`] = true;
      updates[`worldBlockFilters/${uid}/${otherUid}`] = true;
      updates[`worldBlockFilters/${otherUid}/${uid}`] = true;
      edgeCount += 1;
    });
  });

  if (apply && Object.keys(updates).length) {
    // This is intentionally additive. Replacing either projection root could
    // erase a block created after the Firestore scan began.
    await getDatabase().ref().update(updates);
  }
  console.log(
    `${apply ? "Projected" : "Dry run:"} ${edgeCount} directional block edges for ${snapshot.size} users.`,
  );
  if (!apply) {
    console.log("No writes made. Re-run with --apply after reviewing the count.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
