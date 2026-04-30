// utils/MatchActions.js
import { auth, db } from "../firebase";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
function currentUid() {
  return auth.currentUser?.uid || null;
}

function sortedMatchId(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

// Adds otherId to current user's blockedUsers list and tears down the existing
// match so the chat disappears for both sides. Future calls to
// `failsDealbreakers` will skip pairs in either user's blocklist.
export async function blockUser(otherId) {
  const uid = currentUid();
  if (!uid || !otherId || uid === otherId) return;

  await updateDoc(doc(db, "users", uid), {
    blockedUsers: arrayUnion(otherId),
    blockedAt: serverTimestamp(),
  });

  const matchId = sortedMatchId(uid, otherId);
  await updateDoc(doc(db, "matches", matchId), {
    isActiveA: false,
    isActiveB: false,
    matched: false,
    blockedBy: arrayUnion(uid),
  }).catch(() => {
    // Match doc may not exist yet (e.g. blocking from a world like) — ignore.
  });
}

// Files a report keyed by reporter so we can audit duplicates and so the
// reported user can't see who flagged them.
export async function reportUser(otherId, reason = null) {
  const uid = currentUid();
  if (!uid || !otherId) return;

  await addDoc(collection(db, "reports"), {
    reportedUserId: otherId,
    reporterId: uid,
    reason: reason || null,
    type: "user",
    createdAt: serverTimestamp(),
  });
}

export async function reportPhoto(otherId, photoUrl, reason = null) {
  const uid = currentUid();
  if (!uid || !otherId || !photoUrl) return;

  await addDoc(collection(db, "reports"), {
    reportedUserId: otherId,
    reporterId: uid,
    photoUrl,
    reason: reason || null,
    type: "photo",
    createdAt: serverTimestamp(),
  });
}

export async function unmatch(matchId) {
  const ref = doc(db, "matches", matchId);
  await updateDoc(ref, {
    isActiveA: false,
    isActiveB: false,
    matched: false,
  });
}
