const INVALID_REALTIME_KEY = /[.#$\[\]\/]/;
const WORLD_ROOM_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,79})$/;
const PRESENCE_SESSION_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const WORLD_PRESENCE_ROOMS = Object.freeze([
  "afterlight-market-garden-v1",
]);
const WORLD_PRESENCE_ROOM_SET = new Set(WORLD_PRESENCE_ROOMS);

function safePresenceUid(value) {
  if (typeof value !== "string") return null;
  const uid = value;
  if (uid !== uid.trim()) return null;
  if (!uid || uid.length > 128 || INVALID_REALTIME_KEY.test(uid)) return null;
  return uid;
}

function safePresenceRoom(value) {
  if (typeof value !== "string") return null;
  const room = value;
  return WORLD_ROOM_PATTERN.test(room) && WORLD_PRESENCE_ROOM_SET.has(room)
    ? room
    : null;
}

function safePresenceSessionId(value) {
  if (typeof value !== "string") return null;
  const sessionId = value;
  return PRESENCE_SESSION_PATTERN.test(sessionId) ? sessionId : null;
}

function normalizeRoomMembership(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const sessionId = safePresenceSessionId(value.sessionId);
  return sessionId ? { sessionId } : null;
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function knownBlockEdge(value) {
  if (value === true) return { known: true, blocked: true };
  if (value === false || value === null) {
    return { known: true, blocked: false };
  }
  return { known: false, blocked: false };
}

// A pair may share presence only after both directional block reads completed.
// One known true edge is enough to revoke immediately; missing or malformed
// state is deliberately treated as unknown and therefore denied.
function reciprocalPresenceDecision(blockState) {
  const source = asRecord(blockState);
  const outgoing = knownBlockEdge(source.uidBlockedOther);
  const incoming = knownBlockEdge(source.otherBlockedUid);

  if (outgoing.blocked || incoming.blocked) {
    return { allowed: false, reason: "blocked" };
  }
  if (source.complete !== true || !outgoing.known || !incoming.known) {
    return { allowed: false, reason: "unknown" };
  }
  return { allowed: true, reason: "unblocked" };
}

function presenceViewEntryUpdates(
  roomValue,
  uidValue,
  uidSessionValue,
  otherUidValue,
  otherSessionValue,
  visible,
) {
  const room = safePresenceRoom(roomValue);
  const uid = safePresenceUid(uidValue);
  const otherUid = safePresenceUid(otherUidValue);
  if (!room || !uid || !otherUid || uid === otherUid) return {};

  if (!visible) {
    return {
      [`worldPresenceViews/${uid}/${room}/${otherUid}`]: null,
      [`worldPresenceViews/${otherUid}/${room}/${uid}`]: null,
    };
  }

  const uidSessionId = safePresenceSessionId(uidSessionValue);
  const otherSessionId = safePresenceSessionId(otherSessionValue);
  if (!uidSessionId || !otherSessionId) {
    return {
      [`worldPresenceViews/${uid}/${room}/${otherUid}`]: null,
      [`worldPresenceViews/${otherUid}/${room}/${uid}`]: null,
    };
  }

  return {
    [`worldPresenceViews/${uid}/${room}/${otherUid}`]: otherSessionId,
    [`worldPresenceViews/${otherUid}/${room}/${uid}`]: uidSessionId,
  };
}

function membershipEventKind(beforeValue, afterValue) {
  const before = normalizeRoomMembership(beforeValue);
  const after = normalizeRoomMembership(afterValue);
  if (!before && after) return "join";
  if (before && !after) return "leave";
  if (before && after && before.sessionId !== after.sessionId) return "rotate";
  if (before && after) return "refresh";
  return "empty";
}

function currentMembershipMatchesEvent(afterValue, observedValue) {
  const after = normalizeRoomMembership(afterValue);
  const observed = normalizeRoomMembership(observedValue);
  if (!after) return !observed;
  return Boolean(observed && observed.sessionId === after.sessionId);
}

function candidatePeerUids(uid, memberships, viewerRoster) {
  const candidates = [
    ...Object.keys(asRecord(memberships)),
    ...Object.keys(asRecord(viewerRoster)),
  ]
    .map(safePresenceUid)
    .filter((otherUid) => otherUid && otherUid !== uid);
  return [...new Set(candidates)].sort();
}

// Plans one membership trigger as leaf-only multi-location updates. The room
// membership snapshot must be read after the trigger. If it no longer matches
// the event's after value, this is an out-of-order delivery and must not erase a
// newer session's projection.
function membershipViewReconciliation({
  room: roomValue,
  uid: uidValue,
  beforeMembership,
  afterMembership,
  memberships,
  membershipStateLoaded = false,
  viewerRoster,
  blockStates,
} = {}) {
  const room = safePresenceRoom(roomValue);
  const uid = safePresenceUid(uidValue);
  const event = membershipEventKind(beforeMembership, afterMembership);
  if (!room || !uid) {
    return { status: "invalid", event, updates: {}, incompleteBlockUids: [] };
  }
  if (membershipStateLoaded !== true) {
    return {
      status: "state-unavailable",
      event,
      updates: {},
      incompleteBlockUids: [],
    };
  }

  const membershipRecord = asRecord(memberships);
  if (
    !currentMembershipMatchesEvent(
      afterMembership,
      membershipRecord[uid],
    )
  ) {
    return {
      status: "stale-event",
      event,
      updates: {},
      incompleteBlockUids: [],
    };
  }

  const actorMembership = normalizeRoomMembership(afterMembership);
  const states = asRecord(blockStates);
  const updates = {};
  const incompleteBlockUids = [];

  candidatePeerUids(uid, membershipRecord, viewerRoster).forEach(
    (otherUid) => {
      const otherMembership = normalizeRoomMembership(
        membershipRecord[otherUid],
      );
      const decision = reciprocalPresenceDecision(states[otherUid]);
      const visible = Boolean(
        actorMembership && otherMembership && decision.allowed,
      );
      if (actorMembership && otherMembership && decision.reason === "unknown") {
        incompleteBlockUids.push(otherUid);
      }
      Object.assign(
        updates,
        presenceViewEntryUpdates(
          room,
          uid,
          actorMembership?.sessionId,
          otherUid,
          otherMembership?.sessionId,
          visible,
        ),
      );
    },
  );

  return {
    status: "reconciled",
    event,
    updates,
    incompleteBlockUids,
  };
}

// Reconciles one pair in one room after a block or unblock. A block (or an
// incomplete block lookup) can always revoke without membership state. Grants
// require a complete block decision and two current, valid memberships.
function pairViewReconciliation({
  room: roomValue,
  uid: uidValue,
  otherUid: otherUidValue,
  memberships,
  membershipStateLoaded = false,
  blockState,
} = {}) {
  const room = safePresenceRoom(roomValue);
  const uid = safePresenceUid(uidValue);
  const otherUid = safePresenceUid(otherUidValue);
  if (!room || !uid || !otherUid || uid === otherUid) {
    return { status: "invalid", updates: {} };
  }

  const decision = reciprocalPresenceDecision(blockState);
  if (!decision.allowed) {
    return {
      status: decision.reason === "blocked" ? "blocked" : "state-unavailable",
      updates: presenceViewEntryUpdates(
        room,
        uid,
        null,
        otherUid,
        null,
        false,
      ),
    };
  }

  if (membershipStateLoaded !== true) {
    return { status: "state-unavailable", updates: {} };
  }
  const membershipRecord = asRecord(memberships);
  const uidMembership = normalizeRoomMembership(membershipRecord[uid]);
  const otherMembership = normalizeRoomMembership(membershipRecord[otherUid]);
  const visible = Boolean(uidMembership && otherMembership);
  return {
    status: visible ? "visible" : "not-co-located",
    updates: presenceViewEntryUpdates(
      room,
      uid,
      uidMembership?.sessionId,
      otherUid,
      otherMembership?.sessionId,
      visible,
    ),
  };
}

function presenceProjectionDeletionUpdates(rootValue, uidValue) {
  const uid = safePresenceUid(uidValue);
  if (!uid) return {};
  const root = asRecord(rootValue);
  const updates = {
    [`worldPresenceViews/${uid}`]: null,
  };

  Object.entries(asRecord(root.worldRoomMemberships)).forEach(
    ([roomValue, memberships]) => {
      const room = safePresenceRoom(roomValue);
      if (
        room &&
        Object.prototype.hasOwnProperty.call(asRecord(memberships), uid)
      ) {
        updates[`worldRoomMemberships/${room}/${uid}`] = null;
      }
    },
  );

  Object.entries(asRecord(root.worldRoomDisconnects)).forEach(
    ([roomValue, memberships]) => {
      const room = safePresenceRoom(roomValue);
      if (
        room &&
        Object.prototype.hasOwnProperty.call(asRecord(memberships), uid)
      ) {
        updates[`worldRoomDisconnects/${room}/${uid}`] = null;
      }
    },
  );

  Object.entries(asRecord(root.worldPresenceViews)).forEach(
    ([viewerValue, rooms]) => {
      const viewerUid = safePresenceUid(viewerValue);
      if (!viewerUid || viewerUid === uid) return;
      Object.entries(asRecord(rooms)).forEach(([roomValue, roster]) => {
        const room = safePresenceRoom(roomValue);
        if (
          room &&
          Object.prototype.hasOwnProperty.call(asRecord(roster), uid)
        ) {
          updates[`worldPresenceViews/${viewerUid}/${room}/${uid}`] = null;
        }
      });
    },
  );

  return updates;
}

module.exports = {
  WORLD_PRESENCE_ROOMS,
  currentMembershipMatchesEvent,
  membershipEventKind,
  membershipViewReconciliation,
  normalizeRoomMembership,
  pairViewReconciliation,
  presenceProjectionDeletionUpdates,
  presenceViewEntryUpdates,
  reciprocalPresenceDecision,
  safePresenceRoom,
  safePresenceSessionId,
  safePresenceUid,
};
