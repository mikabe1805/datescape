const INVALID_REALTIME_KEY = /[.#$\[\]\/]/;

function safeWorldUid(value) {
  if (typeof value !== "string") return null;
  const uid = value.trim();
  if (!uid || uid.length > 128 || INVALID_REALTIME_KEY.test(uid)) return null;
  return uid;
}

function blockedUidSet(value) {
  const source = value && typeof value === "object" ? value : {};
  const blockedUsers = Array.isArray(source.blockedUsers)
    ? source.blockedUsers
    : Array.isArray(source.profile?.blockedUsers)
      ? source.profile.blockedUsers
      : [];

  return new Set(blockedUsers.map(safeWorldUid).filter(Boolean));
}

function blockEdgeUpdates(uidValue, beforeValue, afterValue) {
  const uid = safeWorldUid(uidValue);
  if (!uid) return { affectedUids: [], updates: {} };

  const before = blockedUidSet(beforeValue);
  const after = blockedUidSet(afterValue);
  before.delete(uid);
  after.delete(uid);
  const affectedUids = [...new Set([...before, ...after])]
    .filter((otherUid) => before.has(otherUid) !== after.has(otherUid))
    .sort();
  const updates = {};

  affectedUids.forEach((otherUid) => {
    updates[`worldBlockEdges/${uid}/${otherUid}`] = after.has(otherUid)
      ? true
      : null;
  });

  return { affectedUids, updates };
}

function blockFilterUpdates(uidValue, otherUidValue, blocked) {
  const uid = safeWorldUid(uidValue);
  const otherUid = safeWorldUid(otherUidValue);
  if (!uid || !otherUid || uid === otherUid) return {};
  const value = blocked ? true : null;
  return {
    [`worldBlockFilters/${uid}/${otherUid}`]: value,
    [`worldBlockFilters/${otherUid}/${uid}`]: value,
  };
}

function realtimePairCleanupUpdates(
  { signalsForUid, signalsForOtherUid } = {},
  uidValue,
  otherUidValue,
) {
  const uid = safeWorldUid(uidValue);
  const otherUid = safeWorldUid(otherUidValue);
  if (!uid || !otherUid || uid === otherUid) return {};
  const updates = {
    [`worldLikesByRecipient/${uid}/${otherUid}`]: null,
    [`worldLikesByRecipient/${otherUid}/${uid}`]: null,
    [`worldSignalRateLimits/${uid}/${otherUid}`]: null,
    [`worldSignalRateLimits/${otherUid}/${uid}`]: null,
  };

  Object.entries(signalsForUid || {}).forEach(([signalId, signal]) => {
    if (signal?.fromUid === otherUid) {
      updates[`signals/${uid}/${signalId}`] = null;
    }
  });
  Object.entries(signalsForOtherUid || {}).forEach(([signalId, signal]) => {
    if (signal?.fromUid === uid) {
      updates[`signals/${otherUid}/${signalId}`] = null;
    }
  });

  return updates;
}

function isNotFoundError(error) {
  return error?.code === 5 || error?.code === "not-found";
}

async function closeBlockedMatchDocument(matchRef, blockedByValue) {
  try {
    await matchRef.update({
      isActiveA: false,
      isActiveB: false,
      likedByA: false,
      likedByB: false,
      matched: false,
      blockedBy: blockedByValue,
    });
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

async function syncWorldBlockProjection(database, uid, beforeValue, afterValue) {
  const projection = blockEdgeUpdates(uid, beforeValue, afterValue);
  const rootRef = database.ref();
  if (Object.keys(projection.updates).length) {
    await rootRef.update(projection.updates);
  }

  await Promise.all(
    projection.affectedUids.map(async (otherUid) => {
      const [outgoing, incoming] = await Promise.all([
        database.ref(`worldBlockEdges/${uid}/${otherUid}`).get(),
        database.ref(`worldBlockEdges/${otherUid}/${uid}`).get(),
      ]);
      const blocked = outgoing.val() === true || incoming.val() === true;
      await rootRef.update(blockFilterUpdates(uid, otherUid, blocked));
    }),
  );

  const before = blockedUidSet(beforeValue);
  const after = blockedUidSet(afterValue);
  before.delete(uid);
  after.delete(uid);
  return {
    addedUids: [...after].filter((otherUid) => !before.has(otherUid)).sort(),
    removedUids: [...before].filter((otherUid) => !after.has(otherUid)).sort(),
  };
}

module.exports = {
  blockEdgeUpdates,
  blockedUidSet,
  blockFilterUpdates,
  closeBlockedMatchDocument,
  realtimePairCleanupUpdates,
  safeWorldUid,
  syncWorldBlockProjection,
};
