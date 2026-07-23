const { createHash, randomUUID } = require("node:crypto");
const {
  calculateMatchScore,
  distanceBetween,
  flattenDiscoveryUser,
  pairQualifiesForDiscovery,
  toDiscoveryMatchProfile,
} = require("./discoveryMatching");

const DISCOVERY_MAX_USER_DOCUMENTS = 500;
const DISCOVERY_REFRESH_COOLDOWN_MS = 60 * 1000;
const DISCOVERY_REFRESH_WINDOW_MS = 10 * 60 * 1000;
const DISCOVERY_REFRESH_WINDOW_MAX = 10;
const DISCOVERY_FINGERPRINT_FIELDS = [
  "uid",
  "displayName",
  "name",
  "username",
  "age",
  "gender",
  "lookingFor",
  "bio",
  "media",
  "interests",
  "profilePrompts",
  "ethnicities",
  "races",
  "religions",
  "politics",
  "selfHeight",
  "zodiac",
  "zodiacSign",
  "ageMin",
  "ageMax",
  "distMax",
  "location",
  "lat",
  "lng",
  "genderPref",
  "genderScale",
  "transPref",
  "isTrans",
  "asexualPref",
  "isAsexual",
  "hasHeightPref",
  "heightDealbreaker",
  "heightMin",
  "heightMax",
  "hasEthnicityPref",
  "hasRacePref",
  "ethnicityPreferences",
  "racePreferences",
  "ethnicityPrefStrength",
  "racePrefStrength",
  "hasReligionPref",
  "religionPref",
  "children",
  "childrenPref",
  "substances",
  "substancePref",
  "politicsPref",
  "blockedUsers",
];

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

function discoveryProfileFingerprint(profile) {
  const projection = {};
  DISCOVERY_FINGERPRINT_FIELDS.forEach((field) => {
    if (profile?.[field] !== undefined) {
      projection[field] = canonicalValue(profile[field]);
    }
  });
  return createHash("sha256")
    .update(JSON.stringify(projection))
    .digest("hex");
}

async function reserveDiscoveryRefresh(
  firestore,
  stateRef,
  {
    fingerprint,
    now,
    attemptId = randomUUID(),
    admissionRefs = [],
  },
) {
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(stateRef);
    const admissionSnapshots = [];
    for (const reference of admissionRefs) {
      admissionSnapshots.push(await transaction.get(reference));
    }
    if (admissionSnapshots.some((entry) => entry.exists)) {
      return { acquired: false, reason: "account-deleting" };
    }
    const state = snapshot.exists ? snapshot.data() || {} : {};
    const lastStartedAt = Number(state.lastStartedAt) || 0;
    const sameProfile = state.profileFingerprint === fingerprint;
    if (
      sameProfile &&
      lastStartedAt > 0 &&
      now - lastStartedAt < DISCOVERY_REFRESH_COOLDOWN_MS
    ) {
      return { acquired: false, reason: "cooldown" };
    }

    const previousWindowStartedAt = Number(state.windowStartedAt) || 0;
    const sameWindow =
      previousWindowStartedAt > 0 &&
      now - previousWindowStartedAt < DISCOVERY_REFRESH_WINDOW_MS;
    const windowStartedAt = sameWindow ? previousWindowStartedAt : now;
    const windowCount = sameWindow ? (Number(state.windowCount) || 0) + 1 : 1;
    if (windowCount > DISCOVERY_REFRESH_WINDOW_MAX) {
      return { acquired: false, reason: "rate-limit" };
    }

    transaction.set(stateRef, {
      refreshAttemptId: attemptId,
      profileFingerprint: fingerprint,
      lastStartedAt: now,
      windowStartedAt,
      windowCount,
    });
    return { acquired: true, attemptId };
  });
}

async function discoveryAdmissionStatus(transaction, guard) {
  if (!guard) return null;
  if (guard.refreshStateRef) {
    const refreshSnapshot = await transaction.get(guard.refreshStateRef);
    if (
      !refreshSnapshot.exists ||
      refreshSnapshot.data()?.refreshAttemptId !== guard.refreshAttemptId
    ) {
      return "superseded";
    }
  }
  for (const tombstoneRef of guard.deletionTombstoneRefs || []) {
    const tombstone = await transaction.get(tombstoneRef);
    if (tombstone.exists) return "account-deleting";
  }
  return null;
}

async function currentDiscoveryPair(transaction, userA, userB, guard) {
  if (!guard?.participantUserRefs) return { userA, userB };
  const profiles = new Map();
  for (const entry of guard.participantUserRefs) {
    const snapshot = await transaction.get(entry.ref);
    if (!snapshot.exists) return { status: "profile-unavailable" };
    const profile = flattenDiscoveryUser(entry.uid, snapshot.data());
    if (!profile) return { status: "profile-unavailable" };
    profiles.set(entry.uid, profile);
  }
  const currentUserA = profiles.get(userA.uid);
  const currentUserB = profiles.get(userB.uid);
  if (!currentUserA || !currentUserB) {
    return { status: "profile-unavailable" };
  }
  if (
    (Array.isArray(currentUserA.blockedUsers) &&
      currentUserA.blockedUsers.includes(currentUserB.uid)) ||
    (Array.isArray(currentUserB.blockedUsers) &&
      currentUserB.blockedUsers.includes(currentUserA.uid))
  ) {
    return { status: "blocked" };
  }
  if (!pairQualifiesForDiscovery(currentUserA, currentUserB)) {
    return { status: "ineligible" };
  }
  return { userA: currentUserA, userB: currentUserB };
}

function discoveryAuthorityFields(userA, userB, timestamp) {
  return {
    participants: [userA.uid, userB.uid],
    userA: userA.uid,
    userB: userB.uid,
    userAProfile: toDiscoveryMatchProfile(userA),
    userBProfile: toDiscoveryMatchProfile(userB),
    distanceMiles: distanceBetween(userA, userB),
    matchScore: calculateMatchScore(userA, userB).finalScore,
    source: "discovery",
    timestamp,
  };
}

function discoveryIdentityMatches(match, uidA, uidB) {
  if (!match || typeof match !== "object") return true;
  const participants = [match.userA, match.userB].filter(Boolean).sort();
  return (
    participants.length === 2 &&
    participants[0] === uidA &&
    participants[1] === uidB
  );
}

async function reconcileDiscoveryMatch(
  firestore,
  matchRef,
  userA,
  userB,
  timestampFactory,
  guard = null,
) {
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(matchRef);
    const admissionStatus = await discoveryAdmissionStatus(transaction, guard);
    if (admissionStatus) return { status: admissionStatus };
    const existing = snapshot.exists ? snapshot.data() || {} : null;
    if (
      existing &&
      !discoveryIdentityMatches(
        existing,
        userA.uid,
        userB.uid,
      )
    ) {
      return { status: "identity-conflict" };
    }
    if (
      existing &&
      (existing.matched === true ||
        existing.source === "shared-encounter" ||
        existing.sourceEncounterId ||
        (existing.source && existing.source !== "discovery"))
    ) {
      return { status: "protected" };
    }
    if (
      existing &&
      existing.isActiveA === false &&
      existing.isActiveB === false
    ) {
      return { status: "inactive" };
    }

    const currentPair = await currentDiscoveryPair(
      transaction,
      userA,
      userB,
      guard,
    );
    if (currentPair.status) {
      if (existing) {
        transaction.set(
          matchRef,
          { isActiveA: false, isActiveB: false },
          { merge: true },
        );
        return { status: "closed" };
      }
      return { status: currentPair.status };
    }

    const authority = discoveryAuthorityFields(
      currentPair.userA,
      currentPair.userB,
      timestampFactory(),
    );
    if (existing) {
      // Participant decisions are intentionally absent. A transaction retry
      // observes any concurrent swipe, and the merge touches authority only.
      transaction.set(matchRef, authority, { merge: true });
      return { status: "updated" };
    }

    transaction.set(matchRef, {
      ...authority,
      likedByA: false,
      likedByB: false,
      matched: false,
      isActiveA: true,
      isActiveB: true,
    });
    return { status: "created" };
  });
}

async function closeIneligibleDiscoveryMatch(
  firestore,
  matchRef,
  guard = null,
) {
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(matchRef);
    const admissionStatus = await discoveryAdmissionStatus(transaction, guard);
    if (admissionStatus) return { status: admissionStatus };
    if (!snapshot.exists) return { status: "missing" };
    const existing = snapshot.data() || {};
    if (
      existing.matched === true ||
      existing.source === "shared-encounter" ||
      existing.sourceEncounterId ||
      (existing.source && existing.source !== "discovery")
    ) {
      return { status: "protected" };
    }
    if (existing.isActiveA === false && existing.isActiveB === false) {
      return { status: "inactive" };
    }
    if (guard?.participantUserRefs) {
      const currentPair = await currentDiscoveryPair(
        transaction,
        { uid: existing.userA },
        { uid: existing.userB },
        guard,
      );
      if (!currentPair.status) return { status: "retained" };
    }
    transaction.set(
      matchRef,
      { isActiveA: false, isActiveB: false },
      { merge: true },
    );
    return { status: "closed" };
  });
}

async function mapWithConcurrency(values, maximum, task) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(values[index], index);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, maximum), values.length) },
      () => worker(),
    ),
  );
  return results;
}

module.exports = {
  DISCOVERY_MAX_USER_DOCUMENTS,
  DISCOVERY_REFRESH_COOLDOWN_MS,
  DISCOVERY_REFRESH_WINDOW_MAX,
  DISCOVERY_REFRESH_WINDOW_MS,
  closeIneligibleDiscoveryMatch,
  discoveryAuthorityFields,
  discoveryIdentityMatches,
  discoveryProfileFingerprint,
  mapWithConcurrency,
  reconcileDiscoveryMatch,
  reserveDiscoveryRefresh,
};
