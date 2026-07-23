// Emergency cleanup for credentials accidentally copied into Firestore.
// Dry-run is the default. Apply only after reviewing the reported counts:
//   npm run security:purge-profile-secrets -- --apply
// Requires Application Default Credentials, like the other admin migrations.

const admin = require("firebase-admin");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const APPLY = process.argv.includes("--apply");
const SECRET_FIELDS = [
  "password",
  "confirmPassword",
  "passwordConfirmation",
  "accessToken",
  "refreshToken",
  "idToken",
  "authToken",
];

function initAdmin() {
  if (admin.apps.length === 0) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
  return getFirestore();
}

function presentSecretPaths(data, prefix = "") {
  const paths = [];
  for (const field of SECRET_FIELDS) {
    if (data && Object.prototype.hasOwnProperty.call(data, field)) {
      paths.push(`${prefix}${field}`);
    }
  }
  return paths;
}

async function purge() {
  const db = initAdmin();
  const auth = admin.auth();
  const affectedUserIds = new Set();
  let userDocuments = 0;
  let matchDocuments = 0;

  const users = await db.collection("users").get();
  for (const snapshot of users.docs) {
    const data = snapshot.data() || {};
    const paths = [
      ...presentSecretPaths(data),
      ...presentSecretPaths(data.profile, "profile."),
    ];
    if (!paths.length) continue;

    userDocuments += 1;
    affectedUserIds.add(snapshot.id);
    if (APPLY) {
      const update = Object.fromEntries(paths.map((path) => [path, FieldValue.delete()]));
      await snapshot.ref.update(update);
    }
  }

  const matches = await db.collection("matches").get();
  for (const snapshot of matches.docs) {
    const data = snapshot.data() || {};
    const paths = [
      ...presentSecretPaths(data.userAProfile, "userAProfile."),
      ...presentSecretPaths(data.userBProfile, "userBProfile."),
    ];
    if (!paths.length) continue;

    matchDocuments += 1;
    [data.userA, data.userB].filter(Boolean).forEach((uid) => affectedUserIds.add(uid));
    if (APPLY) {
      const update = Object.fromEntries(paths.map((path) => [path, FieldValue.delete()]));
      await snapshot.ref.update(update);
    }
  }

  if (APPLY) {
    for (const uid of affectedUserIds) {
      await auth.revokeRefreshTokens(uid).catch((error) => {
        console.warn(`Could not revoke sessions for ${uid}: ${error.message}`);
      });
    }
  }

  console.log(JSON.stringify({
    mode: APPLY ? "applied" : "dry-run",
    userDocuments,
    matchDocuments,
    affectedUsers: affectedUserIds.size,
  }, null, 2));

  if (!APPLY && affectedUserIds.size) {
    console.log("Re-run with --apply, then require password resets for every affected user.");
  }
}

purge().catch((error) => {
  console.error("Profile-secret purge failed:", error);
  process.exit(1);
});
