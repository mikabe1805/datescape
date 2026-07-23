import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

// A world visit only needs a recent, bounded connection roster to distinguish
// an existing mutual from a new encounter. The complete, paginated history
// remains on the Connections page.
export const WORLD_CONNECTION_LIMIT = 100;

export function otherParticipantUid(match, uid) {
  if (!match || !uid) return null;

  const participants = Array.isArray(match.participants)
    ? match.participants
    : [];
  const participant = participants.find(
    (candidate) => typeof candidate === "string" && candidate !== uid,
  );
  if (participant) return participant;
  if (match.userA === uid && typeof match.userB === "string") {
    return match.userB;
  }
  if (match.userB === uid && typeof match.userA === "string") {
    return match.userA;
  }
  return null;
}

export function connectionMapFromSnapshot(snapshot, uid) {
  const connections = {};
  snapshot.docs.forEach((docSnapshot) => {
    const match = docSnapshot.data();
    if (match?.matched !== true) return;
    const otherUid = otherParticipantUid(match, uid);
    if (otherUid) connections[otherUid] = docSnapshot.id;
  });
  return connections;
}

export function subscribeToWorldConnections({
  db,
  uid,
  onConnections,
  onError,
}) {
  if (!db || !uid || typeof onConnections !== "function") {
    return () => {};
  }

  const connectionsQuery = query(
    collection(db, "matches"),
    where("participants", "array-contains", uid),
    where("matched", "==", true),
    orderBy("timestamp", "desc"),
    limit(WORLD_CONNECTION_LIMIT),
  );

  return onSnapshot(
    connectionsQuery,
    (snapshot) => onConnections(connectionMapFromSnapshot(snapshot, uid)),
    (error) => onError?.(error),
  );
}
