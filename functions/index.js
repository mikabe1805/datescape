const {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");
const { getStorage } = require("firebase-admin/storage");
const { createHash } = require("node:crypto");
const functionsV1 = require("firebase-functions/v1");
const sgMail = require("@sendgrid/mail");
const {
  FIRST_LIGHT_NODES,
  FIRST_LIGHT_QUEST_ID,
  FIRST_LIGHT_REWARD_COSMETIC,
  LANTERNKEEPER_QUEST_ID,
  LANTERNKEEPER_REWARD_COSMETIC,
  RAINLIGHT_QUEST_ID,
  RAINLIGHT_REWARD_COSMETIC,
  applyFirstLightClientEvent,
  applyVerifiedLanternkeeperExpeditionReceipt,
  applyVerifiedRelayCompletionReceipt,
  applyVerifiedRelaySourceReceipt,
  applyVerifiedResonanceEchoReceipt,
  applyVerifiedResonanceReceipt,
  createWorldPlayerState,
  normalizeFirstLightClientEvent,
  normalizeWorldPlayerState,
  publicWorldPlayerState,
  verifyResonanceCompletion,
} = require("./firstLightProgression");
const {
  MAX_CONTRIBUTIONS_PER_SOURCE,
  MAX_CONTRIBUTORS,
  MAX_STANDARD_CONTRIBUTIONS_PER_PLAYER,
  RAINLIGHT_RELAY_EVENT_ID,
  RAINLIGHT_RELAY_ROOM_ID,
  RAINLIGHT_RELAY_SOURCES,
  STANDARD_TARGET,
  applyRainlightRelayContribution,
  createRainlightRelayState,
  normalizeRainlightRelayState,
  selectRainlightRelayParticipantUids,
  selectRainlightRelaySourceIds,
} = require("./rainlightRelay");
const {
  LANTERNKEEPER_DEFINITION_ID,
  LANTERNKEEPER_EXPEDITION_ID,
  LANTERNKEEPER_ROOM_ID,
  MAX_ACTIVE_MEMBERS: LANTERNKEEPER_MEMBER_CAPACITY,
  TARGET_IDS: LANTERNKEEPER_TARGET_IDS,
  applyLanternkeeperExpeditionContribution,
  applyLanternkeeperExpeditionJoin,
  applyLanternkeeperExpeditionLeave,
  applyLanternkeeperExpeditionStart,
  instanceIdFor: lanternkeeperInstanceIdFor,
  normalizeLanternkeeperExpeditionState,
  personalLanternkeeperExpeditionState,
  publicLanternkeeperExpeditionState,
  scrubLanternkeeperExpeditionParticipant,
  selectLanternkeeperActiveMemberUids,
} = require("./lanternkeeperExpedition");
const {
  blockedUsersFromUser,
  hasLanternkeeperBlock,
  lanternkeeperParticipantSetIsUnblocked,
  lanternkeeperMembershipConflict,
} = require("./lanternkeeperExpeditionServerHelpers");
const {
  SHARED_ENCOUNTER_COLLECTION,
  applySharedEncounterResponse,
  createVerifiedSharedEncounter,
  normalizeSharedEncounter,
  projectSharedEncounter,
  sanitizeWorldCallingCard,
  sharedEncounterIdForReceipt,
  sharedEncounterPairIsBlocked,
  verifyListeningCompletion,
} = require("./sharedEncounter");
const {
  RESONANCE_ECHO_QUEST_ID,
  RESONANCE_ECHO_ROOM_ID,
  RESONANCE_ECHO_WAIT_MS,
  completeResonanceEcho: reduceResonanceEchoCompletion,
  createResonanceEchoState,
  pollResonanceEcho: reduceResonanceEchoPoll,
  publicResonanceEchoState,
  startResonanceEcho: reduceResonanceEchoStart,
} = require("./resonanceEcho");
const {
  blockFilterUpdates,
  blockedUidSet,
  closeBlockedMatchDocument,
  realtimePairCleanupUpdates,
  safeWorldUid,
  syncWorldBlockProjection,
} = require("./worldBlockProjection");
const {
  applyStationChessMove,
  blockedStationPaths,
  evictBlockedStationPair,
  normalizeStationChessMoveRequest,
  stationChessPairForRequest,
} = require("./stationChess");
const {
  WORLD_PRESENCE_ROOMS,
  currentMembershipMatchesEvent,
  membershipViewReconciliation,
  normalizeRoomMembership,
  pairViewReconciliation,
  presenceProjectionDeletionUpdates,
  presenceViewEntryUpdates,
  safePresenceRoom,
  safePresenceSessionId,
  safePresenceUid,
} = require("./worldPresenceProjection");
const {
  flattenDiscoveryUser,
  pairQualifiesForDiscovery,
  requiredDiscoveryProfile,
} = require("./discoveryMatching");
const {
  SAFETY_REPORT_COLLECTION,
  SAFETY_REPORT_RATE_LIMIT_COLLECTION,
  normalizeSafetyReportRequest,
  reserveSafetyReportRateWindow,
} = require("./safetyReport");
const {
  matchPairIsBlocked,
  reduceMatchDecision,
  safeMatchDecision,
  safeMatchId,
} = require("./matchDecision");
const {
  DISCOVERY_MAX_USER_DOCUMENTS,
  closeIneligibleDiscoveryMatch,
  discoveryProfileFingerprint,
  mapWithConcurrency,
  reconcileDiscoveryMatch,
  reserveDiscoveryRefresh,
} = require("./discoveryRefresh");
const {
  ACCOUNT_DELETION_TOMBSTONE_COLLECTION,
  DELETING_ACCOUNT_COLLECTION,
  accountAdmissionIsActive,
  accountDeletionTombstoneId,
  deletionManifestMatchIds,
  uniqueAccountUids,
} = require("./accountDeletion");

initializeApp();
const db = getFirestore();

const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");
const MIGRATION_SECRET = defineSecret("MIGRATION_SECRET");

function requireAuthenticatedUid(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to continue your quest.");
  return uid;
}

function accountDeletionTombstoneRef(uid) {
  return db
    .collection(ACCOUNT_DELETION_TOMBSTONE_COLLECTION)
    .doc(accountDeletionTombstoneId(uid));
}

function deletingAccountRef(uid) {
  return db.collection(DELETING_ACCOUNT_COLLECTION).doc(uid);
}

function accountAdmissionRefs(uid) {
  return [
    db.collection("users").doc(uid),
    accountDeletionTombstoneRef(uid),
    deletingAccountRef(uid),
  ];
}

async function loadAccountAdmission(uids, transaction = null) {
  const accountUids = uniqueAccountUids(uids);
  const records = await Promise.all(
    accountUids.map(async (uid) => {
      const [userSnapshot, hashedTombstone, rulesMarker] = await Promise.all(
        accountAdmissionRefs(uid).map((reference) =>
          transaction ? transaction.get(reference) : reference.get(),
        ),
      );
      return {
        uid,
        userSnapshot,
        userExists: userSnapshot.exists,
        hashedTombstoneExists: hashedTombstone.exists,
        rulesMarkerExists: rulesMarker.exists,
      };
    }),
  );
  return {
    active: accountAdmissionIsActive(records),
    records,
    users: new Map(
      records
        .filter((record) => record.userExists)
        .map((record) => [record.uid, record.userSnapshot.data()]),
    ),
  };
}

function rejectInactiveAccounts(
  admission,
  message = "This account is no longer available.",
) {
  if (!admission.active) {
    throw new HttpsError("failed-precondition", message);
  }
  return admission.users;
}

async function requireActiveAccounts(uids, message) {
  return rejectInactiveAccounts(await loadAccountAdmission(uids), message);
}

async function requireActiveAccountsInTransaction(transaction, uids, message) {
  return rejectInactiveAccounts(
    await loadAccountAdmission(uids, transaction),
    message,
  );
}

function accountDeletionGuardRefs(uids) {
  return uniqueAccountUids(uids).flatMap((uid) => [
    accountDeletionTombstoneRef(uid),
    deletingAccountRef(uid),
  ]);
}

async function runActiveAccountCrossServiceMutation({
  uids,
  mutate,
  cleanup = null,
  message,
}) {
  await requireActiveAccounts(uids, message);
  let result;
  let mutationError = null;
  try {
    result = await mutate();
  } catch (error) {
    mutationError = error;
  }
  const after = await loadAccountAdmission(uids);
  if (!after.active) {
    if (cleanup) await cleanup();
    rejectInactiveAccounts(after, message);
  }
  if (mutationError) throw mutationError;
  return result;
}

function realtimeEdgeValue(record, uid) {
  return Object.prototype.hasOwnProperty.call(record || {}, uid)
    ? record[uid]
    : null;
}

async function presenceBlockStatesForPeers(realtime, uid, peerUids) {
  if (!peerUids.length) return {};
  const [outgoingSnapshot, incomingSnapshots] = await Promise.all([
    realtime.ref(`worldBlockEdges/${uid}`).get(),
    Promise.all(
      peerUids.map((otherUid) =>
        realtime.ref(`worldBlockEdges/${otherUid}/${uid}`).get(),
      ),
    ),
  ]);
  const outgoing = outgoingSnapshot.val();
  const outgoingStateValid =
    outgoing === null ||
    (outgoing && typeof outgoing === "object" && !Array.isArray(outgoing));
  const outgoingRecord = outgoingStateValid && outgoing ? outgoing : {};
  const states = {};
  peerUids.forEach((otherUid, index) => {
    states[otherUid] = {
      complete: true,
      uidBlockedOther: outgoingStateValid
        ? realtimeEdgeValue(outgoingRecord, otherUid)
        : undefined,
      otherBlockedUid: incomingSnapshots[index].val(),
    };
  });
  return states;
}

async function reconcileWorldPresencePair(uidValue, otherUidValue) {
  const uid = safePresenceUid(uidValue);
  const otherUid = safePresenceUid(otherUidValue);
  if (!uid || !otherUid || uid === otherUid) return;
  const realtime = getDatabase();
  const [outgoing, incoming, ...roomMembershipSnapshots] = await Promise.all([
    realtime.ref(`worldBlockEdges/${uid}/${otherUid}`).get(),
    realtime.ref(`worldBlockEdges/${otherUid}/${uid}`).get(),
    ...WORLD_PRESENCE_ROOMS.map((room) =>
      realtime.ref(`worldRoomMemberships/${room}`).get(),
    ),
  ]);
  const blockState = {
    complete: true,
    uidBlockedOther: outgoing.val(),
    otherBlockedUid: incoming.val(),
  };
  const updates = {};
  WORLD_PRESENCE_ROOMS.forEach((room, index) => {
    const plan = pairViewReconciliation({
      room,
      uid,
      otherUid,
      memberships: roomMembershipSnapshots[index].val(),
      membershipStateLoaded: true,
      blockState,
    });
    Object.assign(updates, plan.updates);
  });
  if (Object.keys(updates).length) {
    await realtime.ref().update(updates);
  }
}

exports.syncWorldPresenceMembership = functionsV1
  .runWith({ failurePolicy: true })
  .database
  .ref("/worldRoomMemberships/{room}/{uid}")
  .onWrite(async (change, context) => {
    const room = safePresenceRoom(context.params.room);
    const uid = safePresenceUid(context.params.uid);
    if (!room || !uid) return null;

    const realtime = getDatabase();
    const [membershipsSnapshot, viewerRosterSnapshot] = await Promise.all([
      realtime.ref(`worldRoomMemberships/${room}`).get(),
      realtime.ref(`worldPresenceViews/${uid}/${room}`).get(),
    ]);
    const memberships = membershipsSnapshot.val() || {};
    const afterMembership = change.after.val();

    // Database events are at-least-once and can arrive after a quick reconnect.
    // Never let an older join/leave erase the currently observed session.
    if (!currentMembershipMatchesEvent(afterMembership, memberships[uid])) {
      return null;
    }

    const peerUids = normalizeRoomMembership(afterMembership)
      ? Object.entries(memberships)
          .filter(
            ([otherUid, value]) =>
              otherUid !== uid &&
              safePresenceUid(otherUid) === otherUid &&
              Boolean(normalizeRoomMembership(value)),
          )
          .map(([otherUid]) => otherUid)
          .sort()
      : [];
    const blockStates = await presenceBlockStatesForPeers(
      realtime,
      uid,
      peerUids,
    );
    const plan = membershipViewReconciliation({
      room,
      uid,
      beforeMembership: change.before.val(),
      afterMembership,
      memberships,
      membershipStateLoaded: true,
      viewerRoster: viewerRosterSnapshot.val(),
      blockStates,
    });
    if (Object.keys(plan.updates).length) {
      await realtime.ref().update(plan.updates);
    }
    return null;
  });

async function removeOwnedPresenceSession(reference, sessionId) {
  return reference.transaction(
    (value) =>
      value && value.sessionId === sessionId ? null : undefined,
    undefined,
    false,
  );
}

exports.cleanupWorldPresenceDisconnect = functionsV1
  .runWith({ failurePolicy: true })
  .database
  .ref("/worldRoomDisconnects/{room}/{uid}/{sessionId}")
  .onCreate(async (snapshot, context) => {
    const room = safePresenceRoom(context.params.room);
    const uid = safePresenceUid(context.params.uid);
    const sessionId = safePresenceSessionId(context.params.sessionId);
    if (!room || !uid || !sessionId || snapshot.val() !== true) {
      await snapshot.ref.remove();
      return null;
    }

    try {
      const realtime = getDatabase();
      // Transactions compare the session again at commit time. A delayed
      // disconnect from an older tab can never delete a newer reconnect.
      await removeOwnedPresenceSession(
        realtime.ref(`presence/${room}/${uid}`),
        sessionId,
      );
      await removeOwnedPresenceSession(
        realtime.ref(`worldRoomMemberships/${room}/${uid}`),
        sessionId,
      );
    } finally {
      await snapshot.ref.remove();
    }
    return null;
  });

async function clearRealtimePairInteractions(uid, otherUid) {
  const realtime = getDatabase();
  const [signalsForUid, signalsForOtherUid, stations] = await Promise.all([
    realtime.ref(`signals/${uid}`).get(),
    realtime.ref(`signals/${otherUid}`).get(),
    realtime.ref("stations").get(),
  ]);
  const updates = realtimePairCleanupUpdates(
    {
      signalsForUid: signalsForUid.val(),
      signalsForOtherUid: signalsForOtherUid.val(),
      stations: stations.val(),
    },
    uid,
    otherUid,
  );
  if (Object.keys(updates).length) {
    await realtime.ref().update(updates);
  }
  await Promise.all(
    blockedStationPaths(stations.val(), uid, otherUid).map((path) =>
      evictBlockedStationAtRef(realtime.ref(path), uid, otherUid),
    ),
  );
}

async function evictBlockedStationAtRef(
  stationRef,
  uid,
  otherUid,
  matchId = null,
) {
  return stationRef.transaction(
    (station) => {
      const eviction = evictBlockedStationPair(
        station,
        uid,
        otherUid,
        matchId,
      );
      return eviction.applied ? eviction.station : undefined;
    },
    undefined,
    false,
  );
}

async function closeCanonicalBlockedMatch(uid, otherUid) {
  const matchId = [uid, otherUid].sort().join("_");
  return closeBlockedMatchDocument(
    db.collection("matches").doc(matchId),
    FieldValue.arrayUnion(uid),
  );
}

async function projectImmediateWorldBlock(uid, otherUid) {
  const presenceRevocations = {};
  WORLD_PRESENCE_ROOMS.forEach((room) => {
    Object.assign(
      presenceRevocations,
      presenceViewEntryUpdates(room, uid, null, otherUid, null, false),
    );
  });
  await getDatabase()
    .ref()
    .update({
      [`worldBlockEdges/${uid}/${otherUid}`]: true,
      ...blockFilterUpdates(uid, otherUid, true),
      ...presenceRevocations,
    });
  await Promise.all([
    clearRealtimePairInteractions(uid, otherUid),
    separateBlockedLanternkeeperPair(uid, otherUid),
  ]);
}

async function scrubRealtimeUnavailableAccounts(uids) {
  const admission = await loadAccountAdmission(uids);
  const unavailableUids = admission.records
    .filter(
      (record) =>
        !record.userExists ||
        record.hashedTombstoneExists ||
        record.rulesMarkerExists,
    )
    .map((record) => record.uid);
  if (!unavailableUids.length) return;
  const realtime = getDatabase();
  const rootSnapshot = await realtime.ref().once("value");
  const rootValue = rootSnapshot.val() || {};
  const updates = {};
  unavailableUids.forEach((uid) => {
    Object.assign(updates, collectRealtimeDeletionUpdates(rootValue, uid));
  });
  if (Object.keys(updates).length) await realtime.ref().update(updates);
}

exports.blockWorldUser = onCall(async (request) => {
  const uid = requireAuthenticatedUid(request);
  const otherUid = safeWorldUid(request.data?.otherUid);
  if (!otherUid || otherUid === uid) {
    throw new HttpsError("invalid-argument", "Choose another traveler to block.");
  }

  const userRef = db.collection("users").doc(uid);
  const matchId = [uid, otherUid].sort().join("_");
  const matchRef = db.collection("matches").doc(matchId);
  await db.runTransaction(async (transaction) => {
    const matchSnapshot = await transaction.get(matchRef);
    await requireActiveAccountsInTransaction(
      transaction,
      [uid, otherUid],
      "This block is no longer available.",
    );
    transaction.update(userRef, {
      blockedUsers: FieldValue.arrayUnion(otherUid),
      blockedAt: FieldValue.serverTimestamp(),
    });
    if (matchSnapshot.exists) {
      transaction.update(matchRef, {
        isActiveA: false,
        isActiveB: false,
        likedByA: false,
        likedByB: false,
        matched: false,
        blockedBy: FieldValue.arrayUnion(uid),
      });
    }
  });

  // Publish the deny edge before returning. The Firestore trigger below is an
  // idempotent repair path for retries, legacy writers, and future unblock
  // support; clients never get write access to either RTDB projection.
  await runActiveAccountCrossServiceMutation({
    uids: [uid, otherUid],
    message: "This block is no longer available.",
    mutate: () => projectImmediateWorldBlock(uid, otherUid),
    cleanup: () => scrubRealtimeUnavailableAccounts([uid, otherUid]),
  });

  return { blocked: true };
});

async function stationChessPairIsUnblocked(uid, otherUid) {
  const admission = await loadAccountAdmission([uid, otherUid]);
  if (!admission.active) return false;
  return (
    !blockedUidSet(admission.users.get(uid)).has(otherUid) &&
    !blockedUidSet(admission.users.get(otherUid)).has(uid)
  );
}

function stationChessError(result) {
  if (result?.code === "move-limit") {
    return new HttpsError(
      "resource-exhausted",
      "This chess record has reached its move limit.",
    );
  }
  if (result?.code === "action-conflict") {
    return new HttpsError("aborted", "That chess action could not be replayed.");
  }
  if (
    result?.code === "wrong-turn" ||
    result?.code === "illegal-move" ||
    result?.code === "game-ended"
  ) {
    return new HttpsError(
      "failed-precondition",
      "That move is not available on the current board.",
    );
  }
  return new HttpsError(
    "failed-precondition",
    "This station match is no longer available.",
  );
}

exports.submitStationChessMove = onCall(async (request) => {
  const uid = requireAuthenticatedUid(request);
  const normalized = normalizeStationChessMoveRequest(request.data);
  if (!normalized.ok) {
    throw new HttpsError("invalid-argument", "That chess action is invalid.");
  }

  const action = { ...normalized.action, uid };
  const stationRef = getDatabase().ref(
    `stations/${action.room}/${action.stationId}`,
  );
  const initialStation = (await stationRef.get()).val();
  const pair = stationChessPairForRequest(
    initialStation,
    uid,
    action.matchId,
  );
  if (!pair) throw stationChessError({ code: "station-unavailable" });
  const otherUid = pair.whiteUid === uid ? pair.blackUid : pair.whiteUid;

  if (!(await stationChessPairIsUnblocked(uid, otherUid))) {
    await evictBlockedStationAtRef(
      stationRef,
      uid,
      otherUid,
      action.matchId,
    );
    throw stationChessError({ code: "station-unavailable" });
  }

  let transition = null;
  const transaction = await stationRef.transaction(
    (station) => {
      transition = applyStationChessMove(station, action, Date.now(), {
        blocked: false,
      });
      return transition.ok ? transition.station : undefined;
    },
    undefined,
    false,
  );
  if (!transaction.committed || !transition?.ok) {
    throw stationChessError(transition);
  }

  // A block may commit after the preflight read while the RTDB transaction is
  // in flight. Recheck the Firestore source of truth. The block path performs
  // the inverse cleanup too, so either race ordering removes this exact match.
  if (!(await stationChessPairIsUnblocked(uid, otherUid))) {
    await evictBlockedStationAtRef(
      stationRef,
      uid,
      otherUid,
      action.matchId,
    );
    throw stationChessError({ code: "station-unavailable" });
  }

  return {
    accepted: true,
    duplicate: transition.duplicate,
    move: transition.move,
    result: transition.result,
  };
});

exports.submitMatchDecision = onCall(async (request) => {
  const uid = requireAuthenticatedUid(request);
  const matchId = safeMatchId(request.data?.matchId);
  const decision = safeMatchDecision(request.data?.decision);
  if (!matchId || !decision) {
    throw new HttpsError("invalid-argument", "Choose a valid match response.");
  }

  const matchRef = db.collection("matches").doc(matchId);
  return db.runTransaction(async (transaction) => {
    const matchSnapshot = await transaction.get(matchRef);
    if (!matchSnapshot.exists) {
      throw new HttpsError("not-found", "This match is no longer available.");
    }

    const match = matchSnapshot.data();
    const preliminary = reduceMatchDecision(match, { uid, decision });
    if (!preliminary.ok) {
      throw new HttpsError(preliminary.code, preliminary.message);
    }

    const users = await requireActiveAccountsInTransaction(
      transaction,
      [match.userA, match.userB],
      "This match response is no longer available.",
    );
    if (
      matchPairIsBlocked(
        match,
        users.get(match.userA),
        users.get(match.userB),
      )
    ) {
      throw new HttpsError(
        "failed-precondition",
        "This match response is no longer available.",
      );
    }

    const result = reduceMatchDecision(match, { uid, decision });
    if (!result.ok) {
      throw new HttpsError(result.code, result.message);
    }
    if (result.applied) {
      transaction.update(matchRef, {
        ...result.updates,
        decisionUpdatedAt: FieldValue.serverTimestamp(),
        ...(result.matched
          ? { matchedAt: FieldValue.serverTimestamp() }
          : {}),
        ...(decision === "unmatch"
          ? {
              unmatchedAt: FieldValue.serverTimestamp(),
              unmatchedBy: uid,
            }
          : {}),
      });
    }
    return {
      applied: result.applied,
      matched: result.matched,
      matchId,
    };
  });
});

exports.submitSafetyReport = onCall(async (request) => {
  const reporterUid = request.auth?.uid;
  if (!reporterUid) {
    throw new HttpsError(
      "unauthenticated",
      "Sign in to submit a safety report.",
    );
  }
  const normalized = normalizeSafetyReportRequest(request.data, reporterUid);
  if (!normalized.ok) {
    throw new HttpsError(
      "invalid-argument",
      "The safety report could not be submitted.",
    );
  }

  const reportRef = db.collection(SAFETY_REPORT_COLLECTION).doc();
  const rateLimitRef = db
    .collection(SAFETY_REPORT_RATE_LIMIT_COLLECTION)
    .doc(reporterUid);
  try {
    await db.runTransaction(async (transaction) => {
      const rateLimitSnapshot = await transaction.get(rateLimitRef);
      await requireActiveAccountsInTransaction(
        transaction,
        [reporterUid, normalized.report.reportedUserId],
        "The safety report could not be submitted.",
      );
      const reservation = reserveSafetyReportRateWindow(
        rateLimitSnapshot.exists ? rateLimitSnapshot.data() : null,
        Date.now(),
      );
      if (!reservation.allowed) {
        throw new HttpsError(
          "resource-exhausted",
          "Safety reports are temporarily unavailable.",
        );
      }

      transaction.set(rateLimitRef, {
        acceptedAt: reservation.acceptedAt,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(reportRef, {
        ...normalized.report,
        reporterId: reporterUid,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("[submitSafetyReport] Submission failed", error);
    throw new HttpsError(
      "internal",
      "The safety report could not be submitted.",
    );
  }
  return { submitted: true };
});

exports.syncWorldBlockProjection = onDocumentWritten(
  { document: "users/{uid}", retry: true },
  async (event) => {
    const uid = safeWorldUid(event.params.uid);
    if (!uid) return;
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    const result = await syncWorldBlockProjection(
      getDatabase(),
      uid,
      before,
      after,
    );
    await Promise.all(
      result.addedUids.map((otherUid) =>
        Promise.all([
          closeCanonicalBlockedMatch(uid, otherUid),
          clearRealtimePairInteractions(uid, otherUid),
          separateBlockedLanternkeeperPair(uid, otherUid),
        ]),
      ),
    );
    await Promise.all(
      [...new Set([...result.addedUids, ...result.removedUids])].map(
        (otherUid) => reconcileWorldPresencePair(uid, otherUid),
      ),
    );
  },
);

exports.refreshDiscoveryMatches = onCall(async (request) => {
  const uid = requireAuthenticatedUid(request);
  const admission = await loadAccountAdmission([uid]);
  const admissionUsers = rejectInactiveAccounts(
    admission,
    "This account is being removed.",
  );
  const caller = flattenDiscoveryUser(uid, admissionUsers.get(uid));
  if (!caller) {
    throw new HttpsError("not-found", "Complete your profile before refreshing discovery.");
  }

  const refreshStateRef = db
    .collection("worldDiscoveryRefreshStates")
    .doc(uid);
  const reservation = await reserveDiscoveryRefresh(
    db,
    refreshStateRef,
    {
      fingerprint: discoveryProfileFingerprint(caller),
      now: Date.now(),
      admissionRefs: accountDeletionGuardRefs([uid]),
    },
  );
  if (reservation.reason === "account-deleting") {
    throw new HttpsError("failed-precondition", "This account is being removed.");
  }
  if (!reservation.acquired) return { refreshed: false };

  const hasRequiredProfile = requiredDiscoveryProfile(caller);
  const [usersSnapshot, matchRefs] = await Promise.all([
    hasRequiredProfile
      ? db
          .collection("users")
          .limit(DISCOVERY_MAX_USER_DOCUMENTS + 1)
          .get()
      : Promise.resolve(null),
    matchingDocumentRefs(uid),
  ]);
  if (usersSnapshot && usersSnapshot.size > DISCOVERY_MAX_USER_DOCUMENTS) {
    throw new HttpsError(
      "resource-exhausted",
      "Discovery is temporarily unavailable.",
    );
  }

  const users = new Map([[uid, caller]]);
  usersSnapshot?.docs.forEach((snapshot) => {
    const profile = flattenDiscoveryUser(snapshot.id, snapshot.data());
    if (profile) users.set(snapshot.id, profile);
  });

  const matchSnapshots = matchRefs.length ? await db.getAll(...matchRefs) : [];
  const existingMatches = new Map(
    matchSnapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => [snapshot.id, snapshot]),
  );
  const eligibleMatchIds = new Set();
  const eligiblePairs = [];

  if (hasRequiredProfile) {
    for (const [candidateUid, candidate] of users) {
      if (candidateUid === uid || !pairQualifiesForDiscovery(caller, candidate)) {
        continue;
      }
      const [uidA, uidB] = [uid, candidateUid].sort();
      const matchId = `${uidA}_${uidB}`;
      const profiles = { [uid]: caller, [candidateUid]: candidate };
      eligibleMatchIds.add(matchId);
      eligiblePairs.push({
        candidateUid,
        matchId,
        userA: profiles[uidA],
        userB: profiles[uidB],
      });
    }
  }

  await mapWithConcurrency(
    eligiblePairs,
    12,
    ({ candidateUid, matchId, userA, userB }) =>
      reconcileDiscoveryMatch(
        db,
        db.collection("matches").doc(matchId),
        userA,
        userB,
        () => FieldValue.serverTimestamp(),
        {
          refreshStateRef,
          refreshAttemptId: reservation.attemptId,
          deletionTombstoneRefs: accountDeletionGuardRefs([
            uid,
            candidateUid,
          ]),
          participantUserRefs: [userA, userB].map((profile) => ({
            uid: profile.uid,
            ref: db.collection("users").doc(profile.uid),
          })),
        },
      ),
  );

  const closeEntries = [];
  existingMatches.forEach((snapshot, matchId) => {
    if (!eligibleMatchIds.has(matchId)) {
      const match = snapshot.data() || {};
      closeEntries.push({
        matchRef: snapshot.ref,
        participantUids: [match.userA, match.userB].filter(
          (participantUid) => typeof participantUid === "string",
        ),
      });
    }
  });
  await mapWithConcurrency(closeEntries, 12, ({ matchRef, participantUids }) =>
    closeIneligibleDiscoveryMatch(db, matchRef, {
      refreshStateRef,
      refreshAttemptId: reservation.attemptId,
      deletionTombstoneRefs: accountDeletionGuardRefs([uid]),
      participantUserRefs: participantUids.map((participantUid) => ({
        uid: participantUid,
        ref: db.collection("users").doc(participantUid),
      })),
    }),
  );

  return { refreshed: true };
});

async function syncWorldCosmeticEntitlements(uid, state) {
  const unlocked = new Set(state?.unlockedCosmetics || []);
  const updates = {};
  if (unlocked.has(FIRST_LIGHT_REWARD_COSMETIC)) updates.sunthread = true;
  if (unlocked.has(RAINLIGHT_REWARD_COSMETIC)) updates.rainlight = true;
  if (unlocked.has(LANTERNKEEPER_REWARD_COSMETIC)) {
    updates.lanternkeeper = true;
  }
  if (!Object.keys(updates).length) return;
  const entitlementRef = getDatabase().ref(`worldCosmeticEntitlements/${uid}`);
  await runActiveAccountCrossServiceMutation({
    uids: [uid],
    message: "Account deletion is in progress.",
    mutate: () => entitlementRef.update(updates),
    cleanup: () => entitlementRef.remove(),
  });
}

exports.getWorldProgression = onCall(async (request) => {
  const uid = requireAuthenticatedUid(request);
  const playerRef = db.collection("worldPlayers").doc(uid);
  const now = Date.now();
  const state = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(playerRef);
    await requireActiveAccountsInTransaction(
      transaction,
      [uid],
      "Account deletion is in progress.",
    );
    if (snapshot.exists) return normalizeWorldPlayerState(snapshot.data(), now);
    const initial = createWorldPlayerState(now);
    transaction.create(playerRef, initial);
    return initial;
  });
  await syncWorldCosmeticEntitlements(uid, state);
  return { progression: publicWorldPlayerState(state, now) };
});

exports.recordWorldQuestEvent = onCall(async (request) => {
  const uid = requireAuthenticatedUid(request);
  const normalizedEvent = normalizeFirstLightClientEvent(request.data);
  if (!normalizedEvent.ok) {
    throw new HttpsError(normalizedEvent.code, normalizedEvent.message);
  }

  const playerRef = db.collection("worldPlayers").doc(uid);
  const now = Date.now();
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(playerRef);
    await requireActiveAccountsInTransaction(
      transaction,
      [uid],
      "Account deletion is in progress.",
    );
    const next = applyFirstLightClientEvent(
      snapshot.exists ? snapshot.data() : createWorldPlayerState(now),
      normalizedEvent.event,
      now,
    );
    if (!next.ok) throw new HttpsError(next.code, next.message);
    if (next.applied) transaction.set(playerRef, next.state);
    return next;
  });

  await syncWorldCosmeticEntitlements(uid, result.state);

  return {
    applied: result.applied,
    duplicate: result.duplicate,
    progression: publicWorldPlayerState(result.state, now),
  };
});

const RAINLIGHT_RELAY_DOCUMENT_ID =
  "afterlight-market-garden-v1--rainlight-relay";
const RAINLIGHT_RELAY_PUBLIC_PATH =
  `worldEvents/${RAINLIGHT_RELAY_ROOM_ID}/${RAINLIGHT_RELAY_EVENT_ID}/public`;
const RAINLIGHT_COMPLETION_CELEBRATION_MS = 30_000;
const RAINLIGHT_PRESENCE_FRESH_MS = 12_000;
const RAINLIGHT_PRESENCE_FUTURE_TOLERANCE_MS = 5_000;
const RAINLIGHT_ACTION_ID_PATTERN = /^[A-Za-z0-9:_-]{1,160}$/;
const RAINLIGHT_SOURCE_LOCATIONS = Object.freeze({
  conservatory: Object.freeze({ x: 0, z: 25, radius: 9 }),
  market: Object.freeze({ x: 0, z: 3.5, radius: 8 }),
  resonance: Object.freeze({ x: -4.8, z: -14, radius: 8 }),
});

function requireRainlightScope(data) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    data.eventId !== RAINLIGHT_RELAY_EVENT_ID ||
    data.room !== RAINLIGHT_RELAY_ROOM_ID
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Choose the Rainlight Relay in the Afterlight district.",
    );
  }
}

function requireRainlightContribution(data) {
  requireRainlightScope(data);
  if (!RAINLIGHT_RELAY_SOURCES.includes(data.sourceId)) {
    throw new HttpsError(
      "invalid-argument",
      "Choose a supported Rainlight source.",
    );
  }
  if (
    typeof data.actionId !== "string" ||
    !RAINLIGHT_ACTION_ID_PATTERN.test(data.actionId)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Provide a valid Rainlight action identifier.",
    );
  }
  return { sourceId: data.sourceId, actionId: data.actionId };
}

function relaySourceCounts(value) {
  const state = normalizeRainlightRelayState(value);
  const counts = Object.fromEntries(
    RAINLIGHT_RELAY_SOURCES.map((sourceId) => [sourceId, 0]),
  );
  Object.values(state.contributions).forEach((sources) => {
    RAINLIGHT_RELAY_SOURCES.forEach((sourceId) => {
      if (
        sources?.[sourceId] &&
        counts[sourceId] < MAX_CONTRIBUTIONS_PER_SOURCE
      ) {
        counts[sourceId] += 1;
      }
    });
  });
  return counts;
}

function rainlightRelayRevision(value) {
  const revision = Number(value?.revision);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function rainlightCompletedTombstone(value) {
  const source = value?.completedTombstone;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }
  const startedAt = Number(source.startedAt);
  const echoAvailableAt = Number(source.echoAvailableAt);
  const completedAt = Number(source.completedAt);
  const cooldownEndsAt = Number(source.cooldownEndsAt);
  if (
    typeof source.instanceId !== "string" ||
    !RAINLIGHT_ACTION_ID_PATTERN.test(source.instanceId) ||
    !Number.isFinite(startedAt) ||
    !Number.isFinite(echoAvailableAt) ||
    !Number.isFinite(completedAt) ||
    !Number.isFinite(cooldownEndsAt) ||
    startedAt <= 0 ||
    echoAvailableAt < startedAt ||
    completedAt < startedAt ||
    cooldownEndsAt <= completedAt
  ) {
    return null;
  }
  const rawCounts = source.sourceCounts || {};
  const sourceCounts = Object.fromEntries(
    RAINLIGHT_RELAY_SOURCES.map((sourceId) => {
      const count = Number(rawCounts[sourceId]);
      return [
        sourceId,
        Number.isInteger(count)
          ? Math.max(0, Math.min(MAX_CONTRIBUTIONS_PER_SOURCE, count))
          : 0,
      ];
    }),
  );
  const contributionCount = Object.values(sourceCounts).reduce(
    (total, count) => total + count,
    0,
  );
  const contributorCount = Number(source.contributorCount);
  return {
    instanceId: source.instanceId,
    startedAt,
    echoAvailableAt,
    completedAt,
    cooldownEndsAt,
    contributionCount: Math.min(STANDARD_TARGET, contributionCount),
    contributorCount:
      Number.isInteger(contributorCount) && contributorCount >= 0
        ? Math.min(MAX_CONTRIBUTORS, contributorCount)
        : 0,
    sourceCount: Object.values(sourceCounts).filter(Boolean).length,
    sourceCounts,
    resultMode:
      source.resultMode === "community" || source.resultMode === "echo"
        ? source.resultMode
        : null,
  };
}

function idleRainlightRelayAggregate(revision = 0) {
  return {
    id: RAINLIGHT_RELAY_EVENT_ID,
    revision,
    instanceId: null,
    phase: "idle",
    startedAt: null,
    echoAvailableAt: null,
    completedAt: null,
    cooldownEndsAt: null,
    contributionCount: 0,
    targetCount: STANDARD_TARGET,
    contributorCount: 0,
    sourceCount: 0,
    sourceCounts: Object.fromEntries(
      RAINLIGHT_RELAY_SOURCES.map((sourceId) => [sourceId, 0]),
    ),
    resultMode: null,
  };
}

function publicRainlightRelayAggregate(value, now = Date.now()) {
  const revision = rainlightRelayRevision(value);
  const completedTombstone = rainlightCompletedTombstone(value);
  if (completedTombstone) {
    if (now >= completedTombstone.cooldownEndsAt) {
      return idleRainlightRelayAggregate(revision);
    }
    return {
      id: RAINLIGHT_RELAY_EVENT_ID,
      revision,
      ...completedTombstone,
      phase:
        now <
        completedTombstone.completedAt +
          RAINLIGHT_COMPLETION_CELEBRATION_MS
          ? "completed"
          : "cooldown",
      targetCount: STANDARD_TARGET,
    };
  }
  const state = normalizeRainlightRelayState(value);
  if (
    !state.instanceId ||
    !state.gatheringStartedAt ||
    (state.completedAt && now >= state.cooldownEndsAt)
  ) {
    return idleRainlightRelayAggregate(revision);
  }

  const participantUids = selectRainlightRelayParticipantUids(state);
  const sourceCounts = relaySourceCounts(state);
  const contributionCount = Object.values(sourceCounts).reduce(
    (total, count) => total + count,
    0,
  );
  const sourceCount = Object.values(sourceCounts).filter(Boolean).length;
  let phase = "gathering";
  if (state.completedAt) {
    phase =
      now < state.completedAt + RAINLIGHT_COMPLETION_CELEBRATION_MS
        ? "completed"
        : "cooldown";
  } else if (
    participantUids.length === 1 &&
    now >= state.echoAvailableAt
  ) {
    phase = "echo-available";
  }

  return {
    id: RAINLIGHT_RELAY_EVENT_ID,
    revision,
    instanceId: state.instanceId,
    phase,
    startedAt: state.gatheringStartedAt,
    echoAvailableAt: state.echoAvailableAt,
    completedAt: state.completedAt,
    cooldownEndsAt: state.cooldownEndsAt,
    contributionCount: Math.min(STANDARD_TARGET, contributionCount),
    targetCount: STANDARD_TARGET,
    contributorCount: participantUids.length,
    sourceCount,
    sourceCounts,
    resultMode:
      state.completionMode === "standard"
        ? "community"
        : state.completionMode === "echo"
          ? "echo"
          : null,
  };
}

function personalRainlightRelayState(value, uid, now = Date.now()) {
  const state = normalizeRainlightRelayState(value);
  const aggregate = publicRainlightRelayAggregate(state, now);
  if (!aggregate.instanceId || aggregate.phase === "idle") {
    return {
      instanceId: null,
      contributedSources: [],
      availableSources: [...RAINLIGHT_RELAY_SOURCES],
      contributed: false,
    };
  }

  const contributedSources = RAINLIGHT_RELAY_SOURCES.filter(
    (sourceId) => Boolean(state.contributions[uid]?.[sourceId]),
  );
  const contributorUids = selectRainlightRelayParticipantUids(state);
  const sourceCounts = relaySourceCounts(state);
  const contributionOpen =
    aggregate.phase === "gathering" ||
    aggregate.phase === "echo-available";
  const playerCanJoin =
    contributorUids.includes(uid) || contributorUids.length < MAX_CONTRIBUTORS;
  const echoThirdContribution =
    contributedSources.length === MAX_STANDARD_CONTRIBUTIONS_PER_PLAYER &&
    contributorUids.length === 1 &&
    contributorUids[0] === uid &&
    now >= state.echoAvailableAt;
  const belowPersonalLimit =
    contributedSources.length < MAX_STANDARD_CONTRIBUTIONS_PER_PLAYER ||
    echoThirdContribution;
  const availableSources =
    contributionOpen && playerCanJoin && belowPersonalLimit
      ? RAINLIGHT_RELAY_SOURCES.filter(
          (sourceId) =>
            !contributedSources.includes(sourceId) &&
            sourceCounts[sourceId] < MAX_CONTRIBUTIONS_PER_SOURCE,
        )
      : [];

  return {
    instanceId: aggregate.instanceId,
    contributedSources,
    availableSources,
    contributed: contributedSources.length > 0,
  };
}

function rainlightRelayError(result) {
  const resourceCodes = new Set([
    "contributor-limit",
    "source-capacity-reached",
  ]);
  const invalidCodes = new Set([
    "invalid-action-id",
    "invalid-contribution",
    "invalid-room",
    "invalid-source",
    "invalid-time",
    "invalid-uid",
  ]);
  const code = resourceCodes.has(result.code)
    ? "resource-exhausted"
    : invalidCodes.has(result.code)
      ? "invalid-argument"
      : "failed-precondition";
  return new HttpsError(code, result.message || "That Relay action is unavailable.");
}

async function requireFreshRainlightPresence(uid, sourceId, now = Date.now()) {
  const presenceSnapshot = await getDatabase()
    .ref(`presence/${RAINLIGHT_RELAY_ROOM_ID}/${uid}`)
    .once("value");
  const presence = presenceSnapshot.val();
  const source = RAINLIGHT_SOURCE_LOCATIONS[sourceId];
  const x = Number(presence?.x);
  const z = Number(presence?.z);
  const lastUpdate = Number(presence?.lastUpdate);
  const fresh =
    Number.isFinite(lastUpdate) &&
    now - lastUpdate <= RAINLIGHT_PRESENCE_FRESH_MS &&
    lastUpdate - now <= RAINLIGHT_PRESENCE_FUTURE_TOLERANCE_MS;
  const nearby =
    Number.isFinite(x) &&
    Number.isFinite(z) &&
    Math.hypot(x - source.x, z - source.z) <= source.radius;
  if (!presenceSnapshot.exists() || !fresh || !nearby) {
    throw new HttpsError(
      "failed-precondition",
      "Move close to that Rainlight beacon and try again.",
    );
  }
}

function rainlightReceiptId(kind, ...parts) {
  const digest = createHash("sha256").update(parts.join("|")).digest("hex");
  return `${kind}:${digest}`;
}

async function publishRainlightRelayAggregate(aggregate) {
  const publishedAt = Date.now();
  await getDatabase()
    .ref(RAINLIGHT_RELAY_PUBLIC_PATH)
    .transaction(
      (current) => {
        const currentRevision = rainlightRelayRevision(current);
        const nextRevision = rainlightRelayRevision(aggregate);
        const currentPublishedAt = Number(current?.publishedAt) || 0;
        if (
          currentRevision > nextRevision ||
          (currentRevision === nextRevision &&
            currentPublishedAt >= publishedAt)
        ) {
          return undefined;
        }
        return { ...aggregate, publishedAt };
      },
      undefined,
      false,
    );
}

async function publishRainlightRelayAggregateForAccounts(aggregate, uids) {
  const aggregateRef = getDatabase().ref(RAINLIGHT_RELAY_PUBLIC_PATH);
  await runActiveAccountCrossServiceMutation({
    uids,
    message: "This Rainlight Relay is no longer available.",
    mutate: () => publishRainlightRelayAggregate(aggregate),
    cleanup: () => aggregateRef.remove(),
  });
}

exports.getRainlightRelay = onCall(async (request) => {
  const uid = requireAuthenticatedUid(request);
  await requireActiveAccounts([uid], "Account deletion is in progress.");
  requireRainlightScope(request.data);
  const now = Date.now();
  const snapshot = await db
    .collection("worldEventStates")
    .doc(RAINLIGHT_RELAY_DOCUMENT_ID)
    .get();
  const state = snapshot.exists ? snapshot.data() : createRainlightRelayState();
  const event = publicRainlightRelayAggregate(state, now);
  await publishRainlightRelayAggregateForAccounts(event, [uid]);
  return {
    event,
    personal: personalRainlightRelayState(state, uid, now),
  };
});

exports.contributeRainlightRelay = onCall(async (request) => {
  const uid = requireAuthenticatedUid(request);
  const { sourceId, actionId } = requireRainlightContribution(request.data);
  await requireFreshRainlightPresence(uid, sourceId, Date.now());

  const eventRef = db
    .collection("worldEventStates")
    .doc(RAINLIGHT_RELAY_DOCUMENT_ID);
  const result = await db.runTransaction(async (transaction) => {
    const attemptNow = Date.now();
    const eventSnapshot = await transaction.get(eventRef);
    const currentEvent = eventSnapshot.exists
      ? eventSnapshot.data()
      : createRainlightRelayState();
    const completedTombstone = rainlightCompletedTombstone(currentEvent);
    if (
      completedTombstone &&
      attemptNow < completedTombstone.cooldownEndsAt
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Rainlight Relay is cooling down.",
      );
    }
    const reduced = applyRainlightRelayContribution(
      completedTombstone ? createRainlightRelayState() : currentEvent,
      {
        uid,
        roomId: RAINLIGHT_RELAY_ROOM_ID,
        source: sourceId,
        actionId,
      },
      attemptNow,
    );
    if (!reduced.ok) throw rainlightRelayError(reduced);
    const relay = {
      ...reduced,
      state: {
        ...reduced.state,
        revision:
          rainlightRelayRevision(currentEvent) + (reduced.applied ? 1 : 0),
      },
    };

    const participantUids = relay.applied && relay.completed
      ? selectRainlightRelayParticipantUids(relay.state)
      : [];
    const progressionUids = [...new Set([uid, ...participantUids])];
    await requireActiveAccountsInTransaction(
      transaction,
      progressionUids,
      "This Rainlight contribution is no longer available.",
    );
    const progressionEntries = [];
    for (const playerUid of progressionUids) {
      const ref = db.collection("worldPlayers").doc(playerUid);
      progressionEntries.push({
        uid: playerUid,
        ref,
        snapshot: await transaction.get(ref),
      });
    }

    let callerState = null;
    const sourceVerifiedAt = relay.state.contributions[uid]?.[sourceId];
    const shouldApplySourceReceipt =
      Boolean(sourceVerifiedAt) && relay.applied;
    const relaySourceIds = relay.applied && relay.completed
      ? selectRainlightRelaySourceIds(relay.state)
      : [];

    progressionEntries.forEach((entry) => {
      let playerState = entry.snapshot.exists
        ? entry.snapshot.data()
        : createWorldPlayerState(attemptNow);
      let shouldWrite = !entry.snapshot.exists;

      if (entry.uid === uid && shouldApplySourceReceipt) {
        const sourceResult = applyVerifiedRelaySourceReceipt(
          playerState,
          {
            id: rainlightReceiptId(
              "relay-source",
              uid,
              relay.state.instanceId,
              sourceId,
            ),
            instanceId: relay.state.instanceId,
            sourceId,
            verifiedAt: sourceVerifiedAt,
          },
          attemptNow,
        );
        playerState = sourceResult.state;
        shouldWrite = shouldWrite || sourceResult.applied;
      }

      if (relay.applied && relay.completed && participantUids.includes(entry.uid)) {
        const completionResult = applyVerifiedRelayCompletionReceipt(
          playerState,
          {
            id: rainlightReceiptId(
              "relay-completion",
              relay.state.instanceId,
            ),
            instanceId: relay.state.instanceId,
            sourceIds: relaySourceIds,
            verifiedAt: relay.state.completedAt,
          },
          attemptNow,
        );
        playerState = completionResult.state;
        shouldWrite = shouldWrite || completionResult.applied;
      }

      if (shouldWrite) transaction.set(entry.ref, playerState);
      if (entry.uid === uid) callerState = playerState;
    });

    if (relay.applied) transaction.set(eventRef, relay.state);
    return { relay, callerState, progressionUids, attemptNow };
  });

  const responseNow = Date.now();
  const event = publicRainlightRelayAggregate(result.relay.state, responseNow);
  await Promise.all([
    publishRainlightRelayAggregateForAccounts(event, result.progressionUids),
    syncWorldCosmeticEntitlements(uid, result.callerState),
  ]);
  return {
    applied: result.relay.applied,
    duplicate: result.relay.duplicate,
    event,
    personal: personalRainlightRelayState(
      result.relay.state,
      uid,
      responseNow,
    ),
    progression: publicWorldPlayerState(
      result.callerState,
      result.attemptNow,
    ),
  };
});

async function scrubRainlightRelayParticipant(uid) {
  const eventRef = db
    .collection("worldEventStates")
    .doc(RAINLIGHT_RELAY_DOCUMENT_ID);
  const event = await db.runTransaction(async (transaction) => {
    const attemptNow = Date.now();
    const snapshot = await transaction.get(eventRef);
    if (!snapshot.exists) return null;
    const currentEvent = snapshot.data();
    const state = normalizeRainlightRelayState(currentEvent);
    if (!state.contributions[uid]) {
      return publicRainlightRelayAggregate(currentEvent, attemptNow);
    }

    const revision = rainlightRelayRevision(currentEvent) + 1;
    let nextState;
    if (state.completedAt) {
      // A completed instance is immutable. Replace all keyed contributions
      // with its already-public aggregate so deleting one participant cannot
      // reopen a partial Relay or cancel the shared completion cooldown.
      const completed = publicRainlightRelayAggregate(currentEvent, attemptNow);
      nextState = completed.instanceId
        ? {
            ...createRainlightRelayState(),
            revision,
            completedTombstone: {
              instanceId: completed.instanceId,
              startedAt: completed.startedAt,
              echoAvailableAt: completed.echoAvailableAt,
              completedAt: completed.completedAt,
              cooldownEndsAt: completed.cooldownEndsAt,
              contributionCount: completed.contributionCount,
              contributorCount: completed.contributorCount,
              sourceCount: completed.sourceCount,
              sourceCounts: completed.sourceCounts,
              resultMode: completed.resultMode,
            },
          }
        : { ...createRainlightRelayState(), revision };
    } else {
      const contributions = { ...state.contributions };
      delete contributions[uid];
      nextState = Object.keys(contributions).length
        ? {
            ...normalizeRainlightRelayState({ ...state, contributions }),
            revision,
          }
        : { ...createRainlightRelayState(state.processedActionIds), revision };
    }
    transaction.set(eventRef, nextState);
    return publicRainlightRelayAggregate(nextState, attemptNow);
  });
  if (event) await publishRainlightRelayAggregate(event);
}

exports.rainlightRelayServer = {
  RAINLIGHT_QUEST_ID,
  RAINLIGHT_RELAY_DOCUMENT_ID,
  RAINLIGHT_RELAY_EVENT_ID,
  RAINLIGHT_RELAY_ROOM_ID,
  personalRainlightRelayState,
  publicRainlightRelayAggregate,
};

const LANTERNKEEPER_STATE_COLLECTION = "worldExpeditionStates";
const LANTERNKEEPER_MEMBERSHIP_COLLECTION = "worldExpeditionMemberships";
const LANTERNKEEPER_PUBLIC_ROOT =
  `worldExpeditions/${LANTERNKEEPER_EXPEDITION_ID}/public`;
const LANTERNKEEPER_PUBLIC_LIST_LIMIT = 12;
const LANTERNKEEPER_QUERY_LIMIT = 32;
const LANTERNKEEPER_PRESENCE_FRESH_MS = 12_000;
const LANTERNKEEPER_PRESENCE_FUTURE_TOLERANCE_MS = 5_000;
const LANTERNKEEPER_ACTION_ID_PATTERN = /^[A-Za-z0-9:_-]{1,160}$/;
const LANTERNKEEPER_INSTANCE_ID_PATTERN =
  /^lanternkeeper-expedition:[a-f0-9]{40}$/;
const LANTERNKEEPER_LOCATIONS = Object.freeze({
  lobby: Object.freeze({ x: -4.8, z: -14, radius: 8 }),
  "conservatory-scan": Object.freeze({ x: 0, z: 25, radius: 8 }),
  "market-west": Object.freeze({ x: -3.8, z: 3.5, radius: 3.4 }),
  "market-east": Object.freeze({ x: 3.8, z: 3.5, radius: 3.4 }),
  "resonance-left": Object.freeze({ x: -6.4, z: -14, radius: 3.4 }),
  "resonance-right": Object.freeze({ x: -3.2, z: -14, radius: 3.4 }),
});

function requireLanternkeeperScope(data, requireInstance = false) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    data.expeditionId !== LANTERNKEEPER_EXPEDITION_ID ||
    data.definitionId !== LANTERNKEEPER_DEFINITION_ID ||
    data.room !== LANTERNKEEPER_ROOM_ID
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Choose the current Lanternkeeper Expedition in Afterlight.",
    );
  }
  if (
    requireInstance &&
    (typeof data.instanceId !== "string" ||
      !LANTERNKEEPER_INSTANCE_ID_PATTERN.test(data.instanceId))
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Choose a valid Lanternkeeper Expedition instance.",
    );
  }
}

function requireLanternkeeperAction(data, options = {}) {
  requireLanternkeeperScope(data, options.requireInstance === true);
  if (
    typeof data.actionId !== "string" ||
    !LANTERNKEEPER_ACTION_ID_PATTERN.test(data.actionId)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Provide a valid Lanternkeeper action identifier.",
    );
  }
  const expectedRevision = Number(data.expectedRevision);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new HttpsError(
      "invalid-argument",
      "Provide the latest Lanternkeeper revision.",
    );
  }
  if (
    options.requireTarget === true &&
    !LANTERNKEEPER_TARGET_IDS.includes(data.targetId)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Choose an authored Lanternkeeper target.",
    );
  }
  return {
    actionId: data.actionId,
    expectedRevision,
    instanceId: data.instanceId || null,
    targetId: data.targetId || null,
  };
}

function lanternkeeperReducerInput(uid, action) {
  return {
    uid,
    actionId: action.actionId,
    expectedRevision: action.expectedRevision,
    instanceId: action.instanceId,
    targetId: action.targetId,
    expeditionId: LANTERNKEEPER_EXPEDITION_ID,
    definitionId: LANTERNKEEPER_DEFINITION_ID,
    roomId: LANTERNKEEPER_ROOM_ID,
  };
}

function lanternkeeperError(result) {
  if (result.code === "invalid-state") {
    return new HttpsError("data-loss", result.message);
  }
  if (result.code === "revision-mismatch") {
    return new HttpsError(
      "aborted",
      result.message || "Refresh the expedition and try again.",
      { currentRevision: result.currentRevision },
    );
  }
  if (result.code === "instance-not-found") {
    return new HttpsError("not-found", result.message);
  }
  if (
    result.code === "member-capacity-reached" ||
    result.code === "member-record-limit"
  ) {
    return new HttpsError("resource-exhausted", result.message);
  }
  if (
    typeof result.code === "string" &&
    (result.code.startsWith("invalid-") ||
      result.code === "instance-mismatch")
  ) {
    return new HttpsError("invalid-argument", result.message);
  }
  return new HttpsError(
    "failed-precondition",
    result.message || "That expedition action is unavailable.",
  );
}

async function requireFreshLanternkeeperPresence(
  uid,
  locationId,
  now = Date.now(),
) {
  const location = LANTERNKEEPER_LOCATIONS[locationId];
  if (!location) {
    throw new HttpsError("invalid-argument", "Choose an authored expedition target.");
  }
  const snapshot = await getDatabase()
    .ref(`presence/${LANTERNKEEPER_ROOM_ID}/${uid}`)
    .once("value");
  const presence = snapshot.val();
  const x = Number(presence?.x);
  const z = Number(presence?.z);
  const lastUpdate = Number(presence?.lastUpdate);
  const fresh =
    Number.isFinite(lastUpdate) &&
    now - lastUpdate <= LANTERNKEEPER_PRESENCE_FRESH_MS &&
    lastUpdate - now <= LANTERNKEEPER_PRESENCE_FUTURE_TOLERANCE_MS;
  const nearby =
    Number.isFinite(x) &&
    Number.isFinite(z) &&
    Math.hypot(x - location.x, z - location.z) <= location.radius;
  if (!snapshot.exists() || !fresh || !nearby) {
    throw new HttpsError(
      "failed-precondition",
      locationId === "lobby"
        ? "Meet beside Juno before starting or joining an expedition."
        : "Move close to that expedition target and try again.",
    );
  }
}

async function requireUnblockedLanternkeeperParticipants(
  transaction,
  state,
  joiningUid = null,
) {
  const userUids = [
    ...new Set([
      ...selectLanternkeeperActiveMemberUids(state),
      ...(joiningUid ? [joiningUid] : []),
    ]),
  ];
  const users = await requireActiveAccountsInTransaction(
    transaction,
    userUids,
    "That expedition action is unavailable.",
  );
  if (!lanternkeeperParticipantSetIsUnblocked(userUids, users)) {
    // Do not reveal which direction a block exists in.
    throw new HttpsError(
      "permission-denied",
      "That expedition action is unavailable.",
    );
  }
}

function activeLanternkeeperMembership(state, now) {
  return {
    expeditionId: LANTERNKEEPER_EXPEDITION_ID,
    definitionId: LANTERNKEEPER_DEFINITION_ID,
    roomId: LANTERNKEEPER_ROOM_ID,
    activeInstanceId: state.instanceId,
    activeExpiresAt: state.expiresAt,
    lastJoinedInstanceId: state.instanceId,
    lastJoinedAt: now,
    updatedAt: now,
  };
}

function inactiveLanternkeeperMembership(value, state, now) {
  return {
    expeditionId: LANTERNKEEPER_EXPEDITION_ID,
    definitionId: LANTERNKEEPER_DEFINITION_ID,
    roomId: LANTERNKEEPER_ROOM_ID,
    activeInstanceId:
      value?.activeInstanceId === state.instanceId
        ? null
        : value?.activeInstanceId || null,
    activeExpiresAt:
      value?.activeInstanceId === state.instanceId
        ? null
        : Number(value?.activeExpiresAt) || null,
    lastJoinedInstanceId: state.instanceId,
    lastJoinedAt: Number(value?.lastJoinedAt) || now,
    lastCompletedInstanceId: value?.lastCompletedInstanceId || null,
    lastCompletedAt: Number(value?.lastCompletedAt) || null,
    updatedAt: now,
  };
}

function completedLanternkeeperMembership(state, now) {
  return {
    expeditionId: LANTERNKEEPER_EXPEDITION_ID,
    definitionId: LANTERNKEEPER_DEFINITION_ID,
    roomId: LANTERNKEEPER_ROOM_ID,
    activeInstanceId: null,
    activeExpiresAt: null,
    lastJoinedInstanceId: state.instanceId,
    lastJoinedAt: now,
    lastCompletedInstanceId: state.instanceId,
    lastCompletedAt: state.completedAt,
    updatedAt: now,
  };
}

function lanternkeeperCompletionReceiptId(instanceId) {
  const digest = createHash("sha256").update(instanceId).digest("hex");
  return `expedition-completion:${digest}`;
}

async function publishLanternkeeperExpeditionAggregate(aggregate) {
  if (!aggregate) return;
  const publishedAt = Date.now();
  await getDatabase()
    .ref(`${LANTERNKEEPER_PUBLIC_ROOT}/${aggregate.instanceId}`)
    .transaction(
      (current) => {
        const currentRevision = Number(current?.revision);
        const nextRevision = Number(aggregate.revision);
        const safeCurrentRevision = Number.isSafeInteger(currentRevision)
          ? currentRevision
          : -1;
        const safeNextRevision = Number.isSafeInteger(nextRevision)
          ? nextRevision
          : 0;
        const currentPublishedAt = Number(current?.publishedAt) || 0;
        if (
          safeCurrentRevision > safeNextRevision ||
          (safeCurrentRevision === safeNextRevision &&
            currentPublishedAt >= publishedAt)
        ) {
          return undefined;
        }
        return { ...aggregate, publishedAt };
      },
      undefined,
      false,
    );
}

async function publishLanternkeeperExpeditionAggregateForAccounts(
  aggregate,
  uids,
) {
  if (!aggregate) return;
  const aggregateRef = getDatabase().ref(
    `${LANTERNKEEPER_PUBLIC_ROOT}/${aggregate.instanceId}`,
  );
  await runActiveAccountCrossServiceMutation({
    uids,
    message: "That expedition action is unavailable.",
    mutate: () => publishLanternkeeperExpeditionAggregate(aggregate),
    cleanup: () => aggregateRef.remove(),
  });
}

exports.listLanternkeeperExpeditions = onCall(async (request) => {
  const uid = requireAuthenticatedUid(request);
  requireLanternkeeperScope(request.data);
  await requireActiveAccounts(
    [uid],
    "That expedition action is unavailable.",
  );
  const now = Date.now();
  const [statesSnapshot, membershipSnapshot] = await Promise.all([
    db
      .collection(LANTERNKEEPER_STATE_COLLECTION)
      .orderBy("startedAt", "desc")
      .limit(LANTERNKEEPER_QUERY_LIMIT)
      .get(),
    db.collection(LANTERNKEEPER_MEMBERSHIP_COLLECTION).doc(uid).get(),
  ]);
  const recentExpeditions = statesSnapshot.docs
    .map((snapshot) => publicLanternkeeperExpeditionState(snapshot.data(), now))
    .filter(
      (entry) =>
        entry &&
        entry.definitionId === LANTERNKEEPER_DEFINITION_ID &&
        entry.room === LANTERNKEEPER_ROOM_ID,
    );
  // Refresh completed/expired projections too. Otherwise an RTDB entry that
  // was last published while open could remain visibly joinable after its
  // server deadline until somebody explicitly fetched that instance.
  await Promise.all(
    recentExpeditions.map((aggregate) =>
      publishLanternkeeperExpeditionAggregateForAccounts(aggregate, [uid]),
    ),
  );
  const expeditions = recentExpeditions
    .filter((entry) => entry.canJoin)
    .slice(0, LANTERNKEEPER_PUBLIC_LIST_LIMIT);

  const membership = membershipSnapshot.exists
    ? membershipSnapshot.data()
    : {};
  const personalInstanceId =
    membership.activeInstanceId && Number(membership.activeExpiresAt) > now
      ? membership.activeInstanceId
      : membership.lastCompletedInstanceId || null;
  return { expeditions, personalInstanceId };
});

exports.getLanternkeeperExpedition = onCall(async (request) => {
  const uid = requireAuthenticatedUid(request);
  requireLanternkeeperScope(request.data, true);
  await requireActiveAccounts(
    [uid],
    "That expedition action is unavailable.",
  );
  const now = Date.now();
  const snapshot = await db
    .collection(LANTERNKEEPER_STATE_COLLECTION)
    .doc(request.data.instanceId)
    .get();
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "That expedition no longer exists.");
  }
  const state = normalizeLanternkeeperExpeditionState(snapshot.data());
  if (!state) {
    throw new HttpsError("data-loss", "That expedition state is invalid.");
  }
  const expedition = publicLanternkeeperExpeditionState(state, now);
  await publishLanternkeeperExpeditionAggregateForAccounts(expedition, [uid]);
  return {
    expedition,
    personal: personalLanternkeeperExpeditionState(state, uid, now),
  };
});

exports.startLanternkeeperExpedition = onCall(async (request) => {
  const uid = requireAuthenticatedUid(request);
  const action = requireLanternkeeperAction(request.data);
  await requireFreshLanternkeeperPresence(uid, "lobby", Date.now());
  const instanceId = lanternkeeperInstanceIdFor(uid, action.actionId);
  const stateRef = db
    .collection(LANTERNKEEPER_STATE_COLLECTION)
    .doc(instanceId);
  const membershipRef = db
    .collection(LANTERNKEEPER_MEMBERSHIP_COLLECTION)
    .doc(uid);
  const result = await db.runTransaction(async (transaction) => {
    const attemptNow = Date.now();
    const stateSnapshot = await transaction.get(stateRef);
    await requireActiveAccountsInTransaction(
      transaction,
      [uid],
      "That expedition action is unavailable.",
    );
    const reduced = applyLanternkeeperExpeditionStart(
      stateSnapshot.exists ? stateSnapshot.data() : null,
      lanternkeeperReducerInput(uid, action),
      attemptNow,
    );
    if (!reduced.ok) throw lanternkeeperError(reduced);
    if (!reduced.applied) return { reduced, attemptNow };
    const membershipSnapshot = await transaction.get(membershipRef);
    const membership = membershipSnapshot.exists
      ? membershipSnapshot.data()
      : {};
    if (lanternkeeperMembershipConflict(membership, instanceId, attemptNow)) {
      throw new HttpsError(
        "failed-precondition",
        "Leave your current expedition before starting another.",
      );
    }
    transaction.create(stateRef, reduced.state);
    transaction.set(
      membershipRef,
      activeLanternkeeperMembership(reduced.state, attemptNow),
      { merge: true },
    );
    return { reduced, attemptNow };
  });
  const expedition = publicLanternkeeperExpeditionState(
    result.reduced.state,
    result.attemptNow,
  );
  await publishLanternkeeperExpeditionAggregateForAccounts(expedition, [uid]);
  return {
    applied: result.reduced.applied,
    duplicate: result.reduced.duplicate,
    expedition,
    personal: personalLanternkeeperExpeditionState(
      result.reduced.state,
      uid,
      result.attemptNow,
    ),
  };
});

exports.joinLanternkeeperExpedition = onCall(async (request) => {
  const uid = requireAuthenticatedUid(request);
  const action = requireLanternkeeperAction(request.data, {
    requireInstance: true,
  });
  await requireFreshLanternkeeperPresence(uid, "lobby", Date.now());
  const stateRef = db
    .collection(LANTERNKEEPER_STATE_COLLECTION)
    .doc(action.instanceId);
  const membershipRef = db
    .collection(LANTERNKEEPER_MEMBERSHIP_COLLECTION)
    .doc(uid);
  const result = await db.runTransaction(async (transaction) => {
    const attemptNow = Date.now();
    const stateSnapshot = await transaction.get(stateRef);
    const reduced = applyLanternkeeperExpeditionJoin(
      stateSnapshot.exists ? stateSnapshot.data() : null,
      lanternkeeperReducerInput(uid, action),
      attemptNow,
    );
    if (!reduced.ok) throw lanternkeeperError(reduced);
    await requireUnblockedLanternkeeperParticipants(
      transaction,
      stateSnapshot.data(),
      uid,
    );
    if (!reduced.applied) return { reduced, attemptNow };
    const membershipSnapshot = await transaction.get(membershipRef);
    const membership = membershipSnapshot.exists
      ? membershipSnapshot.data()
      : {};
    if (
      lanternkeeperMembershipConflict(
        membership,
        reduced.state.instanceId,
        attemptNow,
      )
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Leave your current expedition before joining another.",
      );
    }
    transaction.set(stateRef, reduced.state);
    transaction.set(
      membershipRef,
      activeLanternkeeperMembership(reduced.state, attemptNow),
      { merge: true },
    );
    return { reduced, attemptNow };
  });
  const expedition = publicLanternkeeperExpeditionState(
    result.reduced.state,
    result.attemptNow,
  );
  await publishLanternkeeperExpeditionAggregateForAccounts(
    expedition,
    selectLanternkeeperActiveMemberUids(result.reduced.state),
  );
  return {
    applied: result.reduced.applied,
    duplicate: result.reduced.duplicate,
    expedition,
    personal: personalLanternkeeperExpeditionState(
      result.reduced.state,
      uid,
      result.attemptNow,
    ),
  };
});

exports.leaveLanternkeeperExpedition = onCall(async (request) => {
  const uid = requireAuthenticatedUid(request);
  const action = requireLanternkeeperAction(request.data, {
    requireInstance: true,
  });
  const stateRef = db
    .collection(LANTERNKEEPER_STATE_COLLECTION)
    .doc(action.instanceId);
  const membershipRef = db
    .collection(LANTERNKEEPER_MEMBERSHIP_COLLECTION)
    .doc(uid);
  const result = await db.runTransaction(async (transaction) => {
    const attemptNow = Date.now();
    const stateSnapshot = await transaction.get(stateRef);
    const membershipSnapshot = await transaction.get(membershipRef);
    await requireActiveAccountsInTransaction(
      transaction,
      [uid],
      "That expedition action is unavailable.",
    );
    const reduced = applyLanternkeeperExpeditionLeave(
      stateSnapshot.exists ? stateSnapshot.data() : null,
      lanternkeeperReducerInput(uid, action),
      attemptNow,
    );
    if (!reduced.ok) throw lanternkeeperError(reduced);
    if (reduced.applied) {
      transaction.set(stateRef, reduced.state);
      transaction.set(
        membershipRef,
        inactiveLanternkeeperMembership(
          membershipSnapshot.exists ? membershipSnapshot.data() : {},
          reduced.state,
          attemptNow,
        ),
        { merge: true },
      );
    }
    return { reduced, attemptNow };
  });
  const expedition = publicLanternkeeperExpeditionState(
    result.reduced.state,
    result.attemptNow,
  );
  await publishLanternkeeperExpeditionAggregateForAccounts(expedition, [uid]);
  return {
    applied: result.reduced.applied,
    duplicate: result.reduced.duplicate,
    expedition,
    personal: personalLanternkeeperExpeditionState(
      result.reduced.state,
      uid,
      result.attemptNow,
    ),
  };
});

exports.contributeLanternkeeperExpedition = onCall(async (request) => {
  const uid = requireAuthenticatedUid(request);
  const action = requireLanternkeeperAction(request.data, {
    requireInstance: true,
    requireTarget: true,
  });
  await requireFreshLanternkeeperPresence(uid, action.targetId, Date.now());
  const stateRef = db
    .collection(LANTERNKEEPER_STATE_COLLECTION)
    .doc(action.instanceId);
  const result = await db.runTransaction(async (transaction) => {
    const attemptNow = Date.now();
    const stateSnapshot = await transaction.get(stateRef);
    const reduced = applyLanternkeeperExpeditionContribution(
      stateSnapshot.exists ? stateSnapshot.data() : null,
      lanternkeeperReducerInput(uid, action),
      attemptNow,
    );
    if (!reduced.ok) throw lanternkeeperError(reduced);
    await requireUnblockedLanternkeeperParticipants(
      transaction,
      stateSnapshot.data(),
      uid,
    );

    const completionUids = reduced.newlyCompleted
      ? selectLanternkeeperActiveMemberUids(reduced.state)
      : [];
    const progressionUids = [...new Set([uid, ...completionUids])];
    const progressionEntries = [];
    for (const playerUid of progressionUids) {
      const ref = db.collection("worldPlayers").doc(playerUid);
      progressionEntries.push({
        uid: playerUid,
        ref,
        snapshot: await transaction.get(ref),
      });
    }

    let callerState = null;
    progressionEntries.forEach((entry) => {
      let playerState = entry.snapshot.exists
        ? entry.snapshot.data()
        : createWorldPlayerState(attemptNow);
      let shouldWrite = !entry.snapshot.exists;
      if (reduced.newlyCompleted && completionUids.includes(entry.uid)) {
        const receipt = applyVerifiedLanternkeeperExpeditionReceipt(
          playerState,
          {
            id: lanternkeeperCompletionReceiptId(reduced.state.instanceId),
            instanceId: reduced.state.instanceId,
            resultMode: reduced.state.resultMode,
            verifiedAt: reduced.state.completedAt,
          },
          attemptNow,
        );
        playerState = receipt.state;
        shouldWrite = shouldWrite || receipt.applied;
      }
      if (shouldWrite) transaction.set(entry.ref, playerState);
      if (entry.uid === uid) callerState = playerState;
    });

    if (reduced.applied) transaction.set(stateRef, reduced.state);
    if (reduced.newlyCompleted) {
      completionUids.forEach((playerUid) => {
        transaction.set(
          db.collection(LANTERNKEEPER_MEMBERSHIP_COLLECTION).doc(playerUid),
          completedLanternkeeperMembership(reduced.state, attemptNow),
          { merge: true },
        );
      });
    }
    return { reduced, callerState, attemptNow };
  });
  const expedition = publicLanternkeeperExpeditionState(
    result.reduced.state,
    result.attemptNow,
  );
  await publishLanternkeeperExpeditionAggregateForAccounts(
    expedition,
    selectLanternkeeperActiveMemberUids(result.reduced.state),
  );
  return {
    applied: result.reduced.applied,
    duplicate: result.reduced.duplicate,
    completed: result.reduced.completed,
    expedition,
    personal: personalLanternkeeperExpeditionState(
      result.reduced.state,
      uid,
      result.attemptNow,
    ),
    progression: publicWorldPlayerState(result.callerState, result.attemptNow),
  };
});

async function scrubLanternkeeperExpeditionsParticipant(uid) {
  const statesSnapshot = await db
    .collection(LANTERNKEEPER_STATE_COLLECTION)
    .where("memberUids", "array-contains", uid)
    .get();
  const aggregates = [];
  for (const snapshot of statesSnapshot.docs) {
    const aggregate = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(snapshot.ref);
      if (!current.exists) return null;
      const scrubbed = scrubLanternkeeperExpeditionParticipant(
        current.data(),
        uid,
      );
      if (!scrubbed.applied) return null;
      transaction.set(snapshot.ref, scrubbed.state);
      return publicLanternkeeperExpeditionState(scrubbed.state, Date.now());
    });
    if (aggregate) aggregates.push(aggregate);
  }
  await Promise.all(aggregates.map(publishLanternkeeperExpeditionAggregate));
}

async function separateBlockedLanternkeeperPair(uid, otherUid) {
  const now = Date.now();
  const membershipRef = db
    .collection(LANTERNKEEPER_MEMBERSHIP_COLLECTION)
    .doc(uid);
  const membershipSnapshot = await membershipRef.get();
  const membership = membershipSnapshot.exists ? membershipSnapshot.data() : {};
  const instanceId = membership.activeInstanceId;
  if (
    typeof instanceId !== "string" ||
    !LANTERNKEEPER_INSTANCE_ID_PATTERN.test(instanceId) ||
    Number(membership.activeExpiresAt) <= now
  ) {
    return;
  }
  const stateRef = db.collection(LANTERNKEEPER_STATE_COLLECTION).doc(instanceId);
  const aggregate = await db.runTransaction(async (transaction) => {
    const [stateSnapshot, currentMembershipSnapshot] = await Promise.all([
      transaction.get(stateRef),
      transaction.get(membershipRef),
    ]);
    if (!stateSnapshot.exists) return null;
    const state = normalizeLanternkeeperExpeditionState(stateSnapshot.data());
    if (
      !state ||
      state.completedAt ||
      state.expiresAt <= Date.now() ||
      !selectLanternkeeperActiveMemberUids(state).includes(uid) ||
      !selectLanternkeeperActiveMemberUids(state).includes(otherUid)
    ) {
      return null;
    }
    const scrubbed = scrubLanternkeeperExpeditionParticipant(state, uid);
    if (!scrubbed.applied) return null;
    const attemptNow = Date.now();
    transaction.set(stateRef, scrubbed.state);
    transaction.set(
      membershipRef,
      inactiveLanternkeeperMembership(
        currentMembershipSnapshot.exists
          ? currentMembershipSnapshot.data()
          : {},
        scrubbed.state,
        attemptNow,
      ),
      { merge: true },
    );
    return publicLanternkeeperExpeditionState(scrubbed.state, attemptNow);
  });
  if (aggregate) await publishLanternkeeperExpeditionAggregate(aggregate);
}

exports.lanternkeeperExpeditionServer = {
  ACCOUNT_DELETION_TOMBSTONE_COLLECTION,
  LANTERNKEEPER_DEFINITION_ID,
  LANTERNKEEPER_EXPEDITION_ID,
  LANTERNKEEPER_MEMBER_CAPACITY,
  LANTERNKEEPER_QUEST_ID,
  LANTERNKEEPER_ROOM_ID,
  LANTERNKEEPER_STATE_COLLECTION,
  blockedUsersFromUser,
  hasLanternkeeperBlock,
  lanternkeeperMembershipConflict,
  publicLanternkeeperExpeditionState,
};

const RESONANCE_ECHO_STATE_COLLECTION = "worldResonanceEchoStates";
const RESONANCE_ECHO_PRESENCE_FRESH_MS = 12_000;
const RESONANCE_ECHO_PRESENCE_FUTURE_TOLERANCE_MS = 5_000;
const RESONANCE_ECHO_LOCATION = Object.freeze({
  x: -4.8,
  z: -14,
  radius: 8,
});

function resonanceEchoReducerInput(uid, data, requireActionId = false) {
  return {
    uid,
    roomId: data?.roomId,
    questId: data?.questId,
    ...(requireActionId ? { actionId: data?.actionId } : {}),
  };
}

function resonanceEchoError(result) {
  if (
    typeof result?.code === "string" &&
    result.code.startsWith("invalid-")
  ) {
    return new HttpsError("invalid-argument", result.message);
  }
  if (result?.code === "binding-mismatch") {
    return new HttpsError(
      "data-loss",
      "The stored Resonance Echo route is invalid.",
    );
  }
  return new HttpsError(
    "failed-precondition",
    result?.message || "That Resonance Echo action is unavailable.",
    Number.isSafeInteger(result?.retryAt)
      ? { retryAt: result.retryAt }
      : undefined,
  );
}

function requireResonanceEchoQuestEligibility(value, now) {
  const state = normalizeWorldPlayerState(value, now);
  const quest = state.quests[FIRST_LIGHT_QUEST_ID];
  if (
    RESONANCE_ECHO_QUEST_ID !== FIRST_LIGHT_QUEST_ID ||
    quest?.status !== "active" ||
    quest?.nodeId !== FIRST_LIGHT_NODES.RESONATE_TOGETHER
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Reach the Sunthread Resonance objective before starting an Echo.",
    );
  }
  return state;
}

async function requireFreshResonanceEchoPresence(uid, now = Date.now()) {
  const snapshot = await getDatabase()
    .ref(`presence/${RESONANCE_ECHO_ROOM_ID}/${uid}`)
    .once("value");
  const presence = snapshot.val();
  const x = Number(presence?.x);
  const z = Number(presence?.z);
  const lastUpdate = Number(presence?.lastUpdate);
  const fresh =
    Number.isFinite(lastUpdate) &&
    now - lastUpdate <= RESONANCE_ECHO_PRESENCE_FRESH_MS &&
    lastUpdate - now <= RESONANCE_ECHO_PRESENCE_FUTURE_TOLERANCE_MS;
  const nearby =
    Number.isFinite(x) &&
    Number.isFinite(z) &&
    Math.hypot(
      x - RESONANCE_ECHO_LOCATION.x,
      z - RESONANCE_ECHO_LOCATION.z,
    ) <= RESONANCE_ECHO_LOCATION.radius;
  if (!snapshot.exists() || !fresh || !nearby) {
    throw new HttpsError(
      "failed-precondition",
      "Stay beside the Resonance Loom while listening for an Echo.",
    );
  }
}

function storedResonanceEchoState(state) {
  return {
    ...state,
    serverUpdatedAt: FieldValue.serverTimestamp(),
  };
}

exports.startResonanceEcho = onCall(async (request) => {
  const uid = requireAuthenticatedUid(request);
  const input = resonanceEchoReducerInput(uid, request.data, true);
  await requireFreshResonanceEchoPresence(uid, Date.now());
  const echoRef = db.collection(RESONANCE_ECHO_STATE_COLLECTION).doc(uid);
  const playerRef = db.collection("worldPlayers").doc(uid);

  const result = await db.runTransaction(async (transaction) => {
    const attemptNow = Date.now();
    const echoSnapshot = await transaction.get(echoRef);
    const playerSnapshot = await transaction.get(playerRef);
    await requireActiveAccountsInTransaction(
      transaction,
      [uid],
      "That Resonance Echo action is unavailable.",
    );
    const playerState = requireResonanceEchoQuestEligibility(
      playerSnapshot.exists
        ? playerSnapshot.data()
        : createWorldPlayerState(attemptNow),
      attemptNow,
    );
    let reduced = reduceResonanceEchoStart(
      echoSnapshot.exists ? echoSnapshot.data() : createResonanceEchoState(),
      input,
      attemptNow,
    );
    // Re-entering the Loom resumes the same server timer. Exact action retries
    // still use the reducer's hashed duplicate marker.
    if (!reduced.ok && reduced.code === "already-started") {
      reduced = reduceResonanceEchoPoll(reduced.state, {
        uid,
        roomId: input.roomId,
        questId: input.questId,
      }, attemptNow);
    }
    if (!reduced.ok) throw resonanceEchoError(reduced);
    if (reduced.applied) {
      transaction.set(echoRef, storedResonanceEchoState(reduced.state));
    }
    return { reduced, playerState, attemptNow };
  });

  return {
    applied: result.reduced.applied,
    duplicate: result.reduced.duplicate,
    alreadyCompleted: false,
    echo: result.reduced.echo,
    progression: publicWorldPlayerState(
      result.playerState,
      result.attemptNow,
    ),
  };
});

exports.pollResonanceEcho = onCall(async (request) => {
  const uid = requireAuthenticatedUid(request);
  const input = resonanceEchoReducerInput(uid, request.data);
  const now = Date.now();
  await requireFreshResonanceEchoPresence(uid, now);
  await requireActiveAccounts(
    [uid],
    "That Resonance Echo action is unavailable.",
  );
  const [echoSnapshot, playerSnapshot] = await Promise.all([
    db.collection(RESONANCE_ECHO_STATE_COLLECTION).doc(uid).get(),
    db.collection("worldPlayers").doc(uid).get(),
  ]);
  const reduced = reduceResonanceEchoPoll(
    echoSnapshot.exists ? echoSnapshot.data() : createResonanceEchoState(),
    input,
    now,
  );
  if (!reduced.ok) throw resonanceEchoError(reduced);
  return {
    applied: false,
    duplicate: false,
    alreadyCompleted: reduced.echo.phase === "completed",
    echo: reduced.echo,
    progression: playerSnapshot.exists
      ? publicWorldPlayerState(playerSnapshot.data(), now)
      : null,
  };
});

exports.completeResonanceEcho = onCall(async (request) => {
  const uid = requireAuthenticatedUid(request);
  const input = resonanceEchoReducerInput(uid, request.data, true);
  await requireFreshResonanceEchoPresence(uid, Date.now());
  const echoRef = db.collection(RESONANCE_ECHO_STATE_COLLECTION).doc(uid);
  const playerRef = db.collection("worldPlayers").doc(uid);

  const result = await db.runTransaction(async (transaction) => {
    const attemptNow = Date.now();
    const echoSnapshot = await transaction.get(echoRef);
    const playerSnapshot = await transaction.get(playerRef);
    await requireActiveAccountsInTransaction(
      transaction,
      [uid],
      "That Resonance Echo action is unavailable.",
    );
    const reduced = reduceResonanceEchoCompletion(
      echoSnapshot.exists ? echoSnapshot.data() : createResonanceEchoState(),
      input,
      attemptNow,
    );
    if (!reduced.ok) throw resonanceEchoError(reduced);
    if (!reduced.receipt) {
      throw new HttpsError(
        "data-loss",
        "The completed Resonance Echo proof is unavailable.",
      );
    }

    const progressionResult = applyVerifiedResonanceEchoReceipt(
      playerSnapshot.exists
        ? playerSnapshot.data()
        : createWorldPlayerState(attemptNow),
      reduced.receipt,
      uid,
      attemptNow,
    );
    if (!progressionResult.eligible) {
      throw new HttpsError(
        "failed-precondition",
        "The Sunthread quest is no longer waiting for this Echo.",
      );
    }

    if (reduced.applied) {
      transaction.set(echoRef, storedResonanceEchoState(reduced.state));
    }
    if (progressionResult.applied) {
      transaction.set(playerRef, progressionResult.state);
    }
    return { reduced, progressionResult, attemptNow };
  });

  return {
    applied: result.reduced.applied,
    duplicate: result.reduced.duplicate,
    alreadyCompleted: result.reduced.alreadyCompleted === true,
    echo: publicResonanceEchoState(
      result.reduced.state,
      result.attemptNow,
    ),
    progression: publicWorldPlayerState(
      result.progressionResult.state,
      result.attemptNow,
    ),
  };
});

exports.resonanceEchoServer = {
  RESONANCE_ECHO_PRESENCE_FRESH_MS,
  RESONANCE_ECHO_QUEST_ID,
  RESONANCE_ECHO_ROOM_ID,
  RESONANCE_ECHO_STATE_COLLECTION,
  RESONANCE_ECHO_WAIT_MS,
};

function sharedActivityReceiptId(mode, room, stationId, matchId) {
  const digest = createHash("sha256")
    .update(`${room}|${stationId}|${matchId}`)
    .digest("hex");
  return `${mode}:${digest}`;
}

function resonanceReceiptId(room, stationId, matchId) {
  return sharedActivityReceiptId("resonance", room, stationId, matchId);
}

function listeningReceiptId(room, stationId, matchId) {
  return sharedActivityReceiptId("social", room, stationId, matchId);
}

async function advanceVerifiedResonanceParticipants(verification, receiptId, now) {
  const refs = verification.participants.map((uid) =>
    db.collection("worldPlayers").doc(uid),
  );
  return db.runTransaction(async (transaction) => {
    const admission = await loadAccountAdmission(
      verification.participants,
      transaction,
    );
    if (!admission.active) return 0;
    const snapshots = [];
    for (const ref of refs) snapshots.push(await transaction.get(ref));

    let advanced = 0;
    snapshots.forEach((snapshot, index) => {
      if (!snapshot.exists) return;
      const result = applyVerifiedResonanceReceipt(
        snapshot.data(),
        {
          id: receiptId,
          matchId: verification.matchId,
          verifiedAt: now,
        },
        now,
      );
      if (result.applied) {
        transaction.set(refs[index], result.state);
        advanced += 1;
      }
    });
    return advanced;
  });
}

async function recordVerifiedSharedEncounter(
  verification,
  receiptId,
  now,
  mode = "resonance",
) {
  const encounterId = sharedEncounterIdForReceipt(
    receiptId,
    verification.participants,
  );
  const initial = createVerifiedSharedEncounter({
    receiptId,
    sourceId: verification.matchId,
    participants: verification.participants,
    mode,
    now,
  });
  if (!encounterId || !initial) {
    throw new Error("Verified shared-activity proof produced an invalid encounter.");
  }

  const encounterRef = db.collection(SHARED_ENCOUNTER_COLLECTION).doc(encounterId);
  return db.runTransaction(async (transaction) => {
    const current = await transaction.get(encounterRef);
    const admission = await loadAccountAdmission(
      initial.participantUids,
      transaction,
    );
    if (!admission.active) {
      return { created: false, unavailable: true, id: encounterId };
    }
    if (
      sharedEncounterPairIsBlocked(
        initial.participantUids[0],
        admission.users.get(initial.participantUids[0]),
        initial.participantUids[1],
        admission.users.get(initial.participantUids[1]),
      )
    ) {
      return { created: false, blocked: true, id: encounterId };
    }
    if (current.exists) {
      const normalized = normalizeSharedEncounter(current.data());
      if (
        !normalized ||
        normalized.id !== initial.id ||
        normalized.sourceId !== initial.sourceId ||
        normalized.mode !== initial.mode
      ) {
        throw new Error("Existing shared encounter failed its authority contract.");
      }
      return { created: false, duplicate: true, id: encounterId };
    }
    transaction.create(encounterRef, initial);
    return { created: true, duplicate: false, id: encounterId };
  });
}

// A participant ACK is only the trigger signal. It is not proof of completion:
// the function fetches the live match and independently validates both players'
// match-bound notes for all three rounds before writing either Firestore receipt.
exports.recordVerifiedResonanceCompletion = functionsV1
  .runWith({ failurePolicy: true })
  .database
  .ref("/stations/{room}/resonance-duet/match/completionAcks/{uid}")
  .onWrite(async (change, context) => {
    const acknowledgement = change.after.val();
    if (!acknowledgement) return null;

    const { room, uid } = context.params;
    const stationId = "resonance-duet";
    const matchSnapshot = await getDatabase()
      .ref(`stations/${room}/${stationId}/match`)
      .once("value");
    const verification = verifyResonanceCompletion(
      matchSnapshot.val(),
      uid,
      acknowledgement,
      Date.now(),
    );
    if (!verification.ok) {
      console.warn(
        "[recordVerifiedResonanceCompletion] Ignored unverified ACK:",
        verification.reason,
      );
      return null;
    }

    const now = Date.now();
    const receiptId = resonanceReceiptId(room, stationId, verification.matchId);
    const advanced = await advanceVerifiedResonanceParticipants(
      verification,
      receiptId,
      now,
    );
    const encounter = await recordVerifiedSharedEncounter(
      verification,
      receiptId,
      now,
    );
    console.log(
      `[recordVerifiedResonanceCompletion] ${receiptId} advanced ${advanced} player(s); encounter ${encounter.id} ${encounter.created ? "created" : "preserved"}.`,
    );
    return null;
  });

// Listening Crescent creates the same private, consent-safe continuation
// surface as Resonance, but only after the server independently observes a
// completed (non-pass) authored round and both match-bound acknowledgements.
exports.recordVerifiedListeningCompletion = functionsV1
  .runWith({ failurePolicy: true })
  .database
  .ref("/stations/{room}/listening-crescent/match/completionAcks/{uid}")
  .onWrite(async (change, context) => {
    const acknowledgement = change.after.val();
    if (!acknowledgement) return null;

    const { room, uid } = context.params;
    const stationId = "listening-crescent";
    const matchSnapshot = await getDatabase()
      .ref(`stations/${room}/${stationId}/match`)
      .once("value");
    const verification = verifyListeningCompletion(
      matchSnapshot.val(),
      uid,
      acknowledgement,
      Date.now(),
    );
    if (!verification.ok) {
      console.warn(
        "[recordVerifiedListeningCompletion] Ignored unverified ACK:",
        verification.reason,
      );
      return null;
    }

    const now = Date.now();
    const receiptId = listeningReceiptId(
      room,
      stationId,
      verification.matchId,
    );
    const encounter = await recordVerifiedSharedEncounter(
      verification,
      receiptId,
      now,
      "social",
    );
    console.log(
      `[recordVerifiedListeningCompletion] ${receiptId} encounter ${encounter.id} ${encounter.created ? "created" : "preserved"}.`,
    );
    return null;
  });

exports.firstLightProgression = {
  FIRST_LIGHT_QUEST_ID,
  LANTERNKEEPER_QUEST_ID,
  RAINLIGHT_QUEST_ID,
  applyFirstLightClientEvent,
  applyVerifiedLanternkeeperExpeditionReceipt,
  applyVerifiedRelayCompletionReceipt,
  applyVerifiedRelaySourceReceipt,
  applyVerifiedResonanceEchoReceipt,
  applyVerifiedResonanceReceipt,
  createWorldPlayerState,
  normalizeFirstLightClientEvent,
  normalizeWorldPlayerState,
  publicWorldPlayerState,
  verifyResonanceCompletion,
};

function stationAfterSeatDelete(station, uid, deletedSessionId) {
  const match = station?.match;
  if (!match || (match.white !== uid && match.black !== uid)) return undefined;

  const seats = station.seats || {};
  const currentSeat = seats[uid];
  const matchSessionId =
    match.white === uid
      ? match.whiteSeatSessionId
      : match.blackSeatSessionId;

  if (matchSessionId) {
    // A tokenized delete event owns only the match created for that exact seat
    // incarnation. It must never erase a newer re-seat or newer match.
    if (!deletedSessionId || deletedSessionId !== matchSessionId) {
      return undefined;
    }
    if (currentSeat?.sessionId === deletedSessionId) return undefined;
  } else if (currentSeat) {
    // Legacy tokenless matches keep the original UID/path grace behavior.
    return undefined;
  }

  const next = { ...station };
  delete next.match;
  return next;
}

exports.stationAfterSeatDelete = stationAfterSeatDelete;

// A client can disappear between its seat subscription and its local cleanup.
// Recheck and remove only the deleted seat incarnation's match in one Admin
// transaction, so a reconnect or fast replay cannot be erased by a stale tab.
exports.cleanupStationMatchOnSeatDelete = functionsV1
  .runWith({ failurePolicy: true })
  .database
  .ref("/stations/{room}/{stationId}/seats/{uid}")
  .onDelete(async (snapshot, context) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const { room, stationId, uid } = context.params;
    const deletedSessionId = snapshot.val()?.sessionId || null;
    const stationRef = getDatabase().ref(`stations/${room}/${stationId}`);
    return stationRef.transaction(
      (station) => stationAfterSeatDelete(station, uid, deletedSessionId),
      undefined,
      false,
    );
  });

async function matchingDocumentRefs(uid) {
  const queries = [
    db.collection("matches").where("participants", "array-contains", uid),
    db.collection("matches").where("userA", "==", uid),
    db.collection("matches").where("userB", "==", uid),
  ];
  const snapshots = await Promise.all(queries.map((query) => query.get()));
  const refs = new Map();
  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((document) => refs.set(document.ref.path, document.ref));
  });
  return [...refs.values()];
}

async function sharedEncounterDocumentRefs(uid) {
  const snapshot = await db
    .collection(SHARED_ENCOUNTER_COLLECTION)
    .where("participantUids", "array-contains", uid)
    .get();
  return snapshot.docs.map((document) => document.ref);
}

async function persistAccountDeletionManifest(uid, discoveredMatchIds) {
  const rulesMarkerRef = deletingAccountRef(uid);
  const hashedMarkerRef = accountDeletionTombstoneRef(uid);
  return db.runTransaction(async (transaction) => {
    const [rulesMarkerSnapshot, hashedMarkerSnapshot] = await Promise.all([
      transaction.get(rulesMarkerRef),
      transaction.get(hashedMarkerRef),
    ]);
    const matchIds = deletionManifestMatchIds(
      rulesMarkerSnapshot.exists ? rulesMarkerSnapshot.data() : null,
      deletionManifestMatchIds(
        hashedMarkerSnapshot.exists ? hashedMarkerSnapshot.data() : null,
        discoveredMatchIds,
      ),
    );
    const manifest = {
      deleting: true,
      matchIds,
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.set(rulesMarkerRef, manifest, { merge: true });
    transaction.set(hashedMarkerRef, manifest, { merge: true });
    return matchIds;
  });
}

async function purgeAccountStorage(bucket, uid, matchIds) {
  await Promise.all([
    bucket.deleteFiles({ prefix: `userMedia/${uid}/`, force: true }),
    ...deletionManifestMatchIds(null, matchIds).map((matchId) =>
      bucket.deleteFiles({ prefix: `chatMedia/${matchId}/`, force: true }),
    ),
  ]);
}

function collectRealtimeDeletionUpdates(rootValue, uid) {
  const updates = {
    [`worldLikesByRecipient/${uid}`]: null,
    [`signals/${uid}`]: null,
    [`worldCosmeticEntitlements/${uid}`]: null,
    [`worldBlockEdges/${uid}`]: null,
    [`worldBlockFilters/${uid}`]: null,
    ...presenceProjectionDeletionUpdates(rootValue, uid),
  };

  Object.entries(rootValue.worldBlockEdges || {}).forEach(
    ([fromUid, blockedUids]) => {
      if (blockedUids && Object.prototype.hasOwnProperty.call(blockedUids, uid)) {
        updates[`worldBlockEdges/${fromUid}/${uid}`] = null;
      }
    },
  );
  Object.entries(rootValue.worldBlockFilters || {}).forEach(
    ([viewerUid, filteredUids]) => {
      if (filteredUids && Object.prototype.hasOwnProperty.call(filteredUids, uid)) {
        updates[`worldBlockFilters/${viewerUid}/${uid}`] = null;
      }
    },
  );

  Object.entries(rootValue.worldLikesByRecipient || {}).forEach(([toUid, likes]) => {
    if (likes && Object.prototype.hasOwnProperty.call(likes, uid)) {
      updates[`worldLikesByRecipient/${toUid}/${uid}`] = null;
    }
  });

  Object.entries(rootValue.signals || {}).forEach(([toUid, signals]) => {
    Object.entries(signals || {}).forEach(([signalId, signal]) => {
      if (signal?.fromUid === uid) updates[`signals/${toUid}/${signalId}`] = null;
    });
  });

  Object.entries(rootValue.presence || {}).forEach(([roomId, room]) => {
    if (room && Object.prototype.hasOwnProperty.call(room, uid)) {
      updates[`presence/${roomId}/${uid}`] = null;
    }
  });

  Object.entries(rootValue.stations || {}).forEach(([roomId, stations]) => {
    Object.entries(stations || {}).forEach(([stationId, station]) => {
      if (station?.seats && Object.prototype.hasOwnProperty.call(station.seats, uid)) {
        updates[`stations/${roomId}/${stationId}/seats/${uid}`] = null;
      }
      if (station?.match?.white === uid || station?.match?.black === uid) {
        updates[`stations/${roomId}/${stationId}/match`] = null;
      }
    });
  });

  return updates;
}

const PUBLIC_MATCH_FIELDS = [
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
];

function flattenProfile(data = {}) {
  return { ...(data.profile || {}), ...data };
}

function publicMatchProfile(uid, data) {
  const source = flattenProfile(data);
  const result = { uid };
  PUBLIC_MATCH_FIELDS.forEach((field) => {
    if (source[field] !== undefined) result[field] = source[field];
  });
  result.media = (Array.isArray(result.media) ? result.media : [])
    .map((item) => (typeof item === "string" ? item : item?.url))
    .filter(Boolean);
  return result;
}

function profileCoordinates(data) {
  const profile = flattenProfile(data);
  if (typeof profile.location?.lat === "number" && typeof profile.location?.lng === "number") {
    return profile.location;
  }
  if (typeof profile.lat === "number" && typeof profile.lng === "number") {
    return { lat: profile.lat, lng: profile.lng };
  }
  return null;
}

function distanceMiles(dataA, dataB) {
  const a = profileCoordinates(dataA);
  const b = profileCoordinates(dataB);
  if (!a || !b) return null;
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

const SHARED_ENCOUNTER_ID_PATTERN = /^encounter:[a-f0-9]{64}$/;
const SHARED_ENCOUNTER_ACTION_ID_PATTERN = /^[A-Za-z0-9:_-]{1,160}$/;
const SHARED_ENCOUNTER_LIST_DEFAULT = 12;
const SHARED_ENCOUNTER_LIST_MAX = 20;
const SHARED_ENCOUNTER_QUERY_LIMIT = 100;

function requireSharedEncounterListLimit(value) {
  if (value === undefined || value === null) {
    return SHARED_ENCOUNTER_LIST_DEFAULT;
  }
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > SHARED_ENCOUNTER_LIST_MAX) {
    throw new HttpsError(
      "invalid-argument",
      `Choose between 1 and ${SHARED_ENCOUNTER_LIST_MAX} shared encounters.`,
    );
  }
  return limit;
}

function sharedEncounterOtherUid(encounter, uid) {
  return encounter.participantUids.find((participantUid) => participantUid !== uid) || null;
}

function assertSharedEncounterMatchIdentity(snapshot, participantUids) {
  if (!snapshot.exists) return;
  const data = snapshot.data() || {};
  const existingParticipants = [data.userA, data.userB].filter(Boolean).sort();
  if (
    existingParticipants.length !== 2 ||
    existingParticipants.some((uid, index) => uid !== participantUids[index])
  ) {
    throw new HttpsError(
      "failed-precondition",
      "This private connection has an incompatible identity.",
    );
  }
}

exports.listSharedEncounters = onCall(async (request) => {
  const uid = requireAuthenticatedUid(request);
  const limit = requireSharedEncounterListLimit(request.data?.limit);
  const now = Date.now();
  const callerUsers = await requireActiveAccounts(
    [uid],
    "This account is no longer available.",
  );
  const encountersSnapshot = await db
    .collection(SHARED_ENCOUNTER_COLLECTION)
    .where("participantUids", "array-contains", uid)
    .limit(SHARED_ENCOUNTER_QUERY_LIMIT)
    .get();

  const candidates = encountersSnapshot.docs
    .map((snapshot) => normalizeSharedEncounter(snapshot.data()))
    .filter(
      (encounter) =>
        encounter &&
        encounter.participantUids.includes(uid) &&
        now < encounter.expiresAt,
    )
    .sort((a, b) => b.createdAt - a.createdAt);
  const opponentUids = [
    ...new Set(
      candidates.map((encounter) => sharedEncounterOtherUid(encounter, uid)).filter(Boolean),
    ),
  ];
  const opponentAdmission = opponentUids.length
    ? await loadAccountAdmission(opponentUids)
    : { records: [], users: new Map() };
  const unavailableOpponents = new Set(
    opponentAdmission.records
      .filter(
        (record) =>
          !record.userExists ||
          record.hashedTombstoneExists ||
          record.rulesMarkerExists,
      )
      .map((record) => record.uid),
  );
  const opponents = opponentAdmission.users;
  const callerProfile = callerUsers.get(uid);
  const encounters = [];
  for (const encounter of candidates) {
    const opponentUid = sharedEncounterOtherUid(encounter, uid);
    const opponentProfile = opponents.get(opponentUid);
    if (
      !opponentProfile ||
      unavailableOpponents.has(opponentUid) ||
      sharedEncounterPairIsBlocked(uid, callerProfile, opponentUid, opponentProfile)
    ) {
      continue;
    }
    const projection = projectSharedEncounter(encounter, uid, opponentProfile, now);
    if (projection) encounters.push(projection);
    if (encounters.length >= limit) break;
  }
  return { encounters };
});

exports.respondSharedEncounter = onCall(async (request) => {
  const uid = requireAuthenticatedUid(request);
  const encounterId = request.data?.encounterId;
  const response = request.data?.response;
  const actionId = request.data?.actionId;
  if (
    typeof encounterId !== "string" ||
    !SHARED_ENCOUNTER_ID_PATTERN.test(encounterId) ||
    !["spark", "pass"].includes(response) ||
    typeof actionId !== "string" ||
    !SHARED_ENCOUNTER_ACTION_ID_PATTERN.test(actionId)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Choose Spark or pass for a valid shared encounter action.",
    );
  }

  const encounterRef = db.collection(SHARED_ENCOUNTER_COLLECTION).doc(encounterId);
  const now = Date.now();
  return db.runTransaction(async (transaction) => {
    const encounterSnapshot = await transaction.get(encounterRef);
    const encounter = normalizeSharedEncounter(
      encounterSnapshot.exists ? encounterSnapshot.data() : null,
    );
    if (!encounter || !encounter.participantUids.includes(uid)) {
      throw new HttpsError("not-found", "This shared encounter is unavailable.");
    }
    const opponentUid = sharedEncounterOtherUid(encounter, uid);
    const users = await requireActiveAccountsInTransaction(
      transaction,
      [uid, opponentUid],
      "This shared encounter is unavailable.",
    );
    const callerProfile = users.get(uid);
    const opponentProfile = users.get(opponentUid);
    if (
      sharedEncounterPairIsBlocked(
        uid,
        callerProfile,
        opponentUid,
        opponentProfile,
      )
    ) {
      throw new HttpsError("permission-denied", "This connection is not available.");
    }

    const reduced = applySharedEncounterResponse(encounter, {
      uid,
      response,
      actionId,
      now,
    });
    if (!reduced.ok) {
      throw new HttpsError(reduced.code, reduced.message);
    }

    let created = false;
    if (reduced.mutual) {
      const matchRef = db.collection("matches").doc(reduced.matchId);
      const matchSnapshot = await transaction.get(matchRef);
      assertSharedEncounterMatchIdentity(
        matchSnapshot,
        reduced.encounter.participantUids,
      );
      if (!matchSnapshot.exists || matchSnapshot.data()?.matched !== true) {
        const [uidA, uidB] = reduced.encounter.participantUids;
        const profiles = {
          [uid]: callerProfile,
          [opponentUid]: opponentProfile,
        };
        transaction.set(
          matchRef,
          {
            participants: [uidA, uidB],
            userA: uidA,
            userB: uidB,
            userAProfile: publicMatchProfile(uidA, profiles[uidA]),
            userBProfile: publicMatchProfile(uidB, profiles[uidB]),
            distanceMiles: distanceMiles(profiles[uidA], profiles[uidB]),
            likedByA: true,
            likedByB: true,
            matched: true,
            isActiveA: false,
            isActiveB: false,
            matchScore: 80,
            source: "shared-encounter",
            sourceEncounterId: reduced.encounter.id,
            timestamp: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        created = true;
      }
    }
    if (reduced.applied) transaction.set(encounterRef, reduced.encounter);

    return {
      encounter: projectSharedEncounter(
        reduced.encounter,
        uid,
        opponentProfile,
        now,
      ),
      mutual: reduced.mutual,
      matchId: reduced.mutual ? reduced.matchId : null,
      created,
    };
  });
});

exports.getWorldCallingCard = onCall(async (request) => {
  const uid = requireAuthenticatedUid(request);
  const targetUid = request.data?.uid;
  if (
    typeof targetUid !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(targetUid) ||
    targetUid === uid
  ) {
    throw new HttpsError("invalid-argument", "Choose another available wayfarer.");
  }
  const users = await requireActiveAccounts(
    [uid, targetUid],
    "This calling card is unavailable.",
  );
  const callerProfile = users.get(uid);
  const targetProfile = users.get(targetUid);
  if (
    sharedEncounterPairIsBlocked(
      uid,
      callerProfile,
      targetUid,
      targetProfile,
    )
  ) {
    throw new HttpsError("permission-denied", "This calling card is unavailable.");
  }
  return {
    profile: sanitizeWorldCallingCard(targetUid, targetProfile),
  };
});

exports.promoteWorldConnection = onCall(async (request) => {
  const fromUid = request.auth?.uid;
  const toUid = request.data?.toUid;
  if (!fromUid) throw new HttpsError("unauthenticated", "Sign in before connecting.");
  if (typeof toUid !== "string" || !toUid || toUid === fromUid || toUid.length > 128) {
    throw new HttpsError("invalid-argument", "Choose another person to connect with.");
  }

  const [uidA, uidB] = [fromUid, toUid].sort();
  const matchId = `${uidA}_${uidB}`;
  const matchRef = db.collection("matches").doc(matchId);

  await requireActiveAccounts(
    [fromUid, toUid],
    "This connection is no longer available.",
  );
  const existing = await matchRef.get();
  if (existing.exists && existing.data()?.matched === true) {
    return { matchId, created: false };
  }
  // Legacy callers may still check an already-created connection, but raw
  // RTDB like edges are no longer authority for creating one. A new world
  // connection is created atomically only by respondSharedEncounter after two
  // independent Sparks on trusted shared-play evidence.
  throw new HttpsError(
    "failed-precondition",
    "Complete a shared moment and choose Spark from its afterglow.",
  );
});

// Destructive cross-user cleanup must run with trusted credentials. Every
// operation is idempotent so a failed invocation can be retried safely; Auth is
// deleted last to preserve the caller's ability to retry.
exports.deleteMyAccount = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in before deleting your account.");

  try {
    // Close authoritative mutation admission before taking any cleanup
    // snapshot. Both permanent, server-owned markers are committed together:
    // one is visible to Firestore/Storage rules and the hashed marker is used by
    // trusted server admission. Neither is removed after Auth deletion.
    const requestedAt = FieldValue.serverTimestamp();
    const markerBatch = db.batch();
    markerBatch.set(
      accountDeletionTombstoneRef(uid),
      { deleting: true, requestedAt },
      { merge: true },
    );
    markerBatch.set(
      deletingAccountRef(uid),
      { deleting: true, requestedAt },
      { merge: true },
    );
    await markerBatch.commit();
    const realtime = getDatabase();
    await realtime
      .ref(`worldAccountDeletionTombstones/${uid}`)
      .set(true);
    const [matchRefs, sharedEncounterRefs] = await Promise.all([
      matchingDocumentRefs(uid),
      sharedEncounterDocumentRefs(uid),
    ]);
    // Persist the union before deleting match documents. A retry can therefore
    // repeat both Storage purges even after Firestore no longer reveals paths.
    const matchIds = await persistAccountDeletionManifest(
      uid,
      matchRefs.map((ref) => ref.id),
    );

    await Promise.all([
      scrubRainlightRelayParticipant(uid),
      scrubLanternkeeperExpeditionsParticipant(uid),
    ]);

    const rootSnapshot = await realtime.ref().once("value");
    await realtime.ref().update(
      collectRealtimeDeletionUpdates(rootSnapshot.val() || {}, uid)
    );

    const bucket = getStorage().bucket();
    await purgeAccountStorage(bucket, uid, matchIds);

    await Promise.all([
      ...matchRefs.map((ref) => db.recursiveDelete(ref)),
      ...sharedEncounterRefs.map((ref) => db.recursiveDelete(ref)),
    ]);

    const filedReports = await db
      .collection("reports")
      .where("reporterId", "==", uid)
      .get();
    await Promise.all(filedReports.docs.map((report) => report.ref.delete()));

    // Re-scrub after all long-running external cleanup. Admission has been
    // closed since the beginning, so this pass also catches any transaction
    // that was already in flight when deletion started.
    await scrubLanternkeeperExpeditionsParticipant(uid);
    const finalRealtimeSnapshot = await realtime.ref().once("value");
    await realtime.ref().update(
      collectRealtimeDeletionUpdates(finalRealtimeSnapshot.val() || {}, uid),
    );

    await Promise.all([
      db.recursiveDelete(db.collection("users").doc(uid)),
      db.recursiveDelete(db.collection("worldPlayers").doc(uid)),
      db.recursiveDelete(
        db.collection("worldDiscoveryRefreshStates").doc(uid),
      ),
      db.recursiveDelete(
        db.collection(RESONANCE_ECHO_STATE_COLLECTION).doc(uid),
      ),
      db.recursiveDelete(
        db.collection(LANTERNKEEPER_MEMBERSHIP_COLLECTION).doc(uid),
      ),
      db.recursiveDelete(
        db.collection(SAFETY_REPORT_RATE_LIMIT_COLLECTION).doc(uid),
      ),
    ]);
    // Repeat Storage last: long-running Firestore/RTDB cleanup can overlap a
    // previously admitted upload, and deletion must converge on an empty set.
    await purgeAccountStorage(bucket, uid, matchIds);
    await getAuth().deleteUser(uid);
    return { ok: true };
  } catch (error) {
    console.error("[deleteMyAccount] Cleanup failed for", uid, error);
    throw new HttpsError(
      "internal",
      "Account deletion started but did not finish. Sign in again and retry if prompted."
    );
  }
});

async function sendEmail(to, subject, text) {
  const SENDGRID_KEY = process.env.SENDGRID_API_KEY;
  if (!SENDGRID_KEY || !SENDGRID_KEY.startsWith("SG.")) {
    console.error("[SendGrid] Missing or invalid API key.");
    return;
  }

  sgMail.setApiKey(SENDGRID_KEY);
  await sgMail.send({ to, from: "datescapenotifications@gmail.com", subject, text });
  console.log(`[SendGrid] Email sent to ${to}`);
}

function getMatchParticipants(matchData = {}) {
  const participants = matchData.userIds || matchData.participants;
  if (Array.isArray(participants) && participants.length) {
    return uniqueAccountUids(participants);
  }

  return uniqueAccountUids([matchData.userA, matchData.userB]);
}

function exactCurrentMatchParticipants(matchData = {}) {
  const canonical = uniqueAccountUids([matchData.userA, matchData.userB]);
  const advertised = getMatchParticipants(matchData);
  if (canonical.length !== 2 || advertised.length !== 2) return null;
  const canonicalSorted = [...canonical].sort();
  const advertisedSorted = [...advertised].sort();
  return canonicalSorted.every(
    (uid, index) => uid === advertisedSorted[index],
  )
    ? canonical
    : null;
}

async function loadCurrentMatchNotificationContext(
  matchId,
  transaction = null,
) {
  const matchRef = db.collection("matches").doc(matchId);
  const matchSnapshot = transaction
    ? await transaction.get(matchRef)
    : await matchRef.get();
  if (!matchSnapshot.exists) return null;
  const match = matchSnapshot.data() || {};
  if (match.matched !== true) return null;
  const participants = exactCurrentMatchParticipants(match);
  if (!participants) return null;
  const admission = await loadAccountAdmission(participants, transaction);
  if (!admission.active) return null;
  if (
    matchPairIsBlocked(
      match,
      admission.users.get(match.userA),
      admission.users.get(match.userB),
    )
  ) {
    return null;
  }
  return {
    match,
    matchRef,
    participants,
    users: admission.users,
  };
}

function notificationDocumentId(type, matchId, senderId = "") {
  const digest = createHash("sha256")
    .update(`${type}|${matchId}|${senderId}`)
    .digest("hex");
  return `${type}:${digest}`;
}

function notificationDeliveryKey(eventId) {
  return createHash("sha256")
    .update(String(eventId || "missing-event-id"))
    .digest("hex");
}

async function reserveCurrentMatchNotification({
  matchId,
  recipientId,
  senderId,
  type,
  eventId,
  notificationData,
}) {
  return db.runTransaction(async (transaction) => {
    const context = await loadCurrentMatchNotificationContext(
      matchId,
      transaction,
    );
    if (
      !context ||
      senderId === recipientId ||
      !context.participants.includes(senderId) ||
      !context.participants.includes(recipientId)
    ) {
      return null;
    }
    const recipientData = context.users.get(recipientId);
    if (!recipientData?.notifications) return null;
    const senderData = context.users.get(senderId);
    const data = notificationData({ recipientData, senderData });
    if (!data || typeof data.text !== "string") return null;
    const notificationRef = db
      .collection("users")
      .doc(recipientId)
      .collection("notifications")
      .doc(notificationDocumentId(type, matchId, senderId));
    const notificationSnapshot = await transaction.get(notificationRef);
    const deliveryKey = notificationDeliveryKey(eventId);
    if (
      notificationSnapshot.exists &&
      notificationSnapshot.data()?.deliveryKey === deliveryKey
    ) {
      return { deliver: false };
    }
    transaction.set(
      notificationRef,
      {
        ...data,
        type,
        matchId,
        deliveryKey,
        timestamp: FieldValue.serverTimestamp(),
        read: false,
      },
      { merge: true },
    );
    return {
      deliver: true,
      recipientData,
      senderData,
    };
  });
}

async function updateCurrentNotificationUser({
  matchId,
  recipientId,
  senderId,
  updates,
}) {
  return db.runTransaction(async (transaction) => {
    const context = await loadCurrentMatchNotificationContext(
      matchId,
      transaction,
    );
    if (
      !context ||
      !context.participants.includes(recipientId) ||
      !context.participants.includes(senderId)
    ) {
      return false;
    }
    transaction.update(db.collection("users").doc(recipientId), updates);
    return true;
  });
}

function buildPushPayload({ title, body, type, matchId, senderId = "", senderName = "" }) {
  return {
    data: {
      title,
      body,
      type,
      matchId: matchId || "",
      senderId,
      senderName,
      clickPath: matchId ? `/app/chat/${matchId}` : "/app/match-queue"
    },
    webpush: {
      headers: {
        Urgency: "high"
      }
    }
  };
}

async function sendPushToUser(userData, payload) {
  const tokens = [...new Set((userData?.notifications?.webPushTokens || []).filter(Boolean))];
  if (!tokens.length) return [];

  const result = await getMessaging().sendEachForMulticast({
    tokens,
    ...payload
  });

  const invalidTokens = [];
  result.responses.forEach((response, index) => {
    if (response.success) return;

    const code = response.error?.code || "unknown";
    console.error("[Push] Delivery failure:", code);
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token"
    ) {
      invalidTokens.push(tokens[index]);
    }
  });

  return invalidTokens;
}

function notificationActivityState(userData) {
  const lastActive = userData?.lastActive?.toDate
    ? userData.lastActive.toDate()
    : null;
  const minutesSinceActive = lastActive
    ? (Date.now() - lastActive.getTime()) / 60000
    : null;
  return {
    consideredInactive: minutesSinceActive === null || minutesSinceActive > 5,
    isActive: userData?.active === true,
  };
}

async function deliverCurrentMatchNotification({
  matchId,
  recipientId,
  senderId,
  title,
  pushBody,
  type,
  senderName = "",
  emailSubject,
  emailText,
  emailFlag,
}) {
  // External delivery cannot participate in the Firestore reservation
  // transaction, so re-read the complete lifecycle immediately before each
  // channel. A stale queued event therefore cannot deliver after deletion,
  // unmatch, or a block.
  const pushContext = await loadCurrentMatchNotificationContext(matchId);
  if (
    pushContext &&
    pushContext.participants.includes(recipientId) &&
    pushContext.participants.includes(senderId)
  ) {
    const userData = pushContext.users.get(recipientId);
    const { consideredInactive, isActive } = notificationActivityState(userData);
    if (!isActive || consideredInactive) {
      const invalidTokens = await sendPushToUser(
        userData,
        buildPushPayload({
          title,
          body: pushBody,
          type,
          matchId,
          senderId,
          senderName,
        }),
      );
      if (invalidTokens.length) {
        await updateCurrentNotificationUser({
          matchId,
          recipientId,
          senderId,
          updates: {
            "notifications.webPushTokens": FieldValue.arrayRemove(
              ...invalidTokens,
            ),
          },
        });
      }
    }
  }

  const emailContext = await loadCurrentMatchNotificationContext(matchId);
  if (
    !emailContext ||
    !emailContext.participants.includes(recipientId) ||
    !emailContext.participants.includes(senderId)
  ) {
    return;
  }
  const userData = emailContext.users.get(recipientId);
  const { consideredInactive } = notificationActivityState(userData);
  const notifications = userData?.notifications || {};
  const email =
    notifications.emailEnabled === true &&
    typeof notifications.email === "string"
      ? notifications.email
      : null;
  if (!email || !consideredInactive || notifications[emailFlag] === true) return;
  await sendEmail(email, emailSubject, emailText);
  await updateCurrentNotificationUser({
    matchId,
    recipientId,
    senderId,
    updates: { [`notifications.${emailFlag}`]: true },
  });
}

async function handleMatchActivated(matchId, eventId) {
  const context = await loadCurrentMatchNotificationContext(matchId);
  if (!context) return;
  await Promise.all(
    context.participants.map(async (recipientId) => {
      const senderId = context.participants.find((uid) => uid !== recipientId);
      const notificationText = "You have a new match on DateScape!";
      const reservation = await reserveCurrentMatchNotification({
        matchId,
        recipientId,
        senderId,
        type: "new_match",
        eventId,
        notificationData: () => ({ text: notificationText }),
      });
      if (!reservation?.deliver) return;
      await deliverCurrentMatchNotification({
        matchId,
        recipientId,
        senderId,
        title: "New Match",
        pushBody: notificationText,
        type: "new_match",
        emailSubject: "New Match",
        emailText: notificationText,
        emailFlag: "notifiedMatchWhileInactive",
      });
    }),
  );
}

exports.notifyOnMatchCreated = onDocumentCreated(
  {
    document: "matches/{matchId}",
    secrets: [SENDGRID_API_KEY],
  },
  async (event) => {
    if (event.data.data()?.matched !== true) return;
    await handleMatchActivated(event.params.matchId, event.id);
  },
);

exports.notifyOnMatchActivated = onDocumentUpdated(
  {
    document: "matches/{matchId}",
    secrets: [SENDGRID_API_KEY]
  },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    if (before.matched || !after.matched) return;
    await handleMatchActivated(event.params.matchId, event.id);
  }
);

exports.notifyOnNewMessage = onDocumentCreated(
  {
    document: "matches/{matchId}/messages/{messageId}",
    secrets: [SENDGRID_API_KEY]
  },
  async (event) => {
    const message = event.data.data();
    const matchId = event.params.matchId;
    console.log("[notifyOnNewMessage] Triggered for match", matchId);
    const senderId = message?.senderId;
    if (typeof senderId !== "string") return;
    const context = await loadCurrentMatchNotificationContext(matchId);
    if (!context || !context.participants.includes(senderId)) return;
    const recipientId = context.participants.find((id) => id !== senderId);
    if (!recipientId) return;
    let senderName = "Someone";
    const reservation = await reserveCurrentMatchNotification({
      matchId,
      recipientId,
      senderId,
      type: "new_message",
      eventId: event.id || event.params.messageId,
      notificationData: ({ senderData }) => {
        senderName =
          typeof senderData?.displayName === "string" && senderData.displayName
            ? senderData.displayName
            : "Someone";
        return {
          text: `You have new messages from ${senderName}!`,
          senderId,
          senderName,
        };
      },
    });
    if (!reservation?.deliver) return;
    await deliverCurrentMatchNotification({
      matchId,
      recipientId,
      senderId,
      title: senderName,
      pushBody: message.text || "Sent you a new message.",
      type: "new_message",
      senderName,
      emailSubject: "New Messages",
      emailText: "You have new messages on DateScape!",
      emailFlag: "notifiedWhileInactive",
    });
  }
);

exports.migrateRaceToEthnicity = onRequest(
  { cors: true, secrets: [MIGRATION_SECRET] },
  async (req, res) => {
    try {
      const provided = req.query.key || req.get("x-migration-key");
      const expected = process.env.MIGRATION_SECRET;
      if (!expected || provided !== expected) {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }

      const users = await db.collection("users").get();
      let updated = 0;

      for (const docSnap of users.docs) {
        const data = docSnap.data() || {};
        const profile = data.profile || {};
        const updates = {};
        const deletes = {};

        const sourceEthnicities = profile.ethnicities || profile.races;
        if (sourceEthnicities && !profile.ethnicities) {
          updates["profile.ethnicities"] = sourceEthnicities;
          deletes["profile.races"] = FieldValue.delete();
        }
        const sourcePrefs = profile.ethnicityPreferences || profile.racePreferences;
        if (sourcePrefs && !profile.ethnicityPreferences) {
          updates["profile.ethnicityPreferences"] = sourcePrefs;
          deletes["profile.racePreferences"] = FieldValue.delete();
        }
        const strength = profile.ethnicityPrefStrength || profile.racePrefStrength;
        if (
          typeof strength !== "undefined" &&
          typeof profile.ethnicityPrefStrength === "undefined"
        ) {
          updates["profile.ethnicityPrefStrength"] = strength;
          deletes["profile.racePrefStrength"] = FieldValue.delete();
        }
        const hasPref =
          typeof profile.hasEthnicityPref !== "undefined"
            ? profile.hasEthnicityPref
            : profile.hasRacePref;
        if (
          typeof hasPref !== "undefined" &&
          typeof profile.hasEthnicityPref === "undefined"
        ) {
          updates["profile.hasEthnicityPref"] = hasPref;
          if (typeof profile.hasRacePref !== "undefined") {
            deletes["profile.hasRacePref"] = FieldValue.delete();
          }
        }
        const dealbreaker =
          typeof profile.ethnicityDealbreaker !== "undefined"
            ? profile.ethnicityDealbreaker
            : profile.raceDealbreaker;
        if (
          typeof dealbreaker !== "undefined" &&
          typeof profile.ethnicityDealbreaker === "undefined"
        ) {
          updates["profile.ethnicityDealbreaker"] = dealbreaker;
          if (typeof profile.raceDealbreaker !== "undefined") {
            deletes["profile.raceDealbreaker"] = FieldValue.delete();
          }
        }

        if (Object.keys(updates).length || Object.keys(deletes).length) {
          await docSnap.ref.update({
            ...updates,
            ...deletes,
            "profile._migratedEthnicity": true
          });
          updated += 1;
        }
      }

      return res.json({ ok: true, updated, total: users.size });
    } catch (error) {
      console.error("Migration failed", error);
      return res.status(500).json({ ok: false, error: error.message });
    }
  }
);
