// Account deletion cascade — removes every trace of a user across Firestore,
// Realtime DB, and Storage so deleting your account doesn't leave orphaned data
// that other users still see. Safe to call piece-by-piece: every step swallows
// errors so a partial failure (e.g. blocked rule) still lets the rest proceed.
import { auth, db, rtdb, storage, disableMessagingForCurrentUser } from "../firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { ref as dbRef, remove, get } from "firebase/database";
import { deleteObject, listAll, ref as storageRef } from "firebase/storage";

async function safe(label, op) {
  try {
    await op();
  } catch (error) {
    console.warn(`[deleteAccount] ${label} failed`, error);
  }
}

async function deleteMatchAndChildren(matchDocRef) {
  const messagesSnap = await getDocs(collection(matchDocRef, "messages"));
  await Promise.all(messagesSnap.docs.map((d) => deleteDoc(d.ref)));

  const typingSnap = await getDocs(collection(matchDocRef, "typingStatus")).catch(
    () => ({ docs: [] })
  );
  await Promise.all(typingSnap.docs.map((d) => deleteDoc(d.ref)));

  await deleteDoc(matchDocRef);
}

async function deleteAllMatches(uid) {
  // Fetch via the participants array — covers active and inactive matches in
  // either userA/userB position with one query.
  const allSnap = await getDocs(
    query(collection(db, "matches"), where("participants", "array-contains", uid))
  );

  // Older docs may pre-date `participants` — fall back to userA/userB queries.
  const fallbackA = await getDocs(
    query(collection(db, "matches"), where("userA", "==", uid))
  );
  const fallbackB = await getDocs(
    query(collection(db, "matches"), where("userB", "==", uid))
  );

  const seen = new Set();
  const refs = [];
  for (const docSnap of [...allSnap.docs, ...fallbackA.docs, ...fallbackB.docs]) {
    if (seen.has(docSnap.ref.path)) continue;
    seen.add(docSnap.ref.path);
    refs.push(docSnap.ref);
  }

  await Promise.all(refs.map((ref) => deleteMatchAndChildren(ref)));
}

async function deleteWorldLikes(uid) {
  // worldLikes/{from}/{to} = timestamp. Wipe outgoing in one shot, then walk
  // every other user's outgoing list to scrub references back to this uid.
  await safe("worldLikes outgoing", () => remove(dbRef(rtdb, `worldLikes/${uid}`)));

  const allSnap = await get(dbRef(rtdb, "worldLikes"));
  if (!allSnap.exists()) return;
  const all = allSnap.val() || {};
  const removals = [];
  for (const fromUid of Object.keys(all)) {
    if (fromUid === uid) continue;
    if (all[fromUid] && Object.prototype.hasOwnProperty.call(all[fromUid], uid)) {
      removals.push(remove(dbRef(rtdb, `worldLikes/${fromUid}/${uid}`)));
    }
  }
  await Promise.all(removals);
}

async function deleteSignals(uid) {
  await safe("signals", () => remove(dbRef(rtdb, `signals/${uid}`)));
}

async function deletePresence(uid) {
  // Presence is keyed by room — we don't have a static list, so walk the
  // top-level `presence` node and delete this uid from every room.
  const snap = await get(dbRef(rtdb, "presence"));
  if (!snap.exists()) return;
  const rooms = snap.val() || {};
  await Promise.all(
    Object.keys(rooms).map((room) =>
      safe(`presence/${room}`, () => remove(dbRef(rtdb, `presence/${room}/${uid}`)))
    )
  );
}

async function deleteUserMedia(uid) {
  const folder = storageRef(storage, `userMedia/${uid}`);
  const list = await listAll(folder).catch(() => null);
  if (!list) return;
  await Promise.all([
    ...list.items.map((item) => safe(`storage ${item.fullPath}`, () => deleteObject(item))),
    ...list.prefixes.map(async (prefix) => {
      const inner = await listAll(prefix).catch(() => null);
      if (!inner) return;
      await Promise.all(inner.items.map((item) => safe(`storage ${item.fullPath}`, () => deleteObject(item))));
    }),
  ]);
}

async function deleteReports(uid) {
  // Reports the user filed — keep reports filed *against* them for moderation.
  const filed = await getDocs(
    query(collection(db, "reports"), where("reporterId", "==", uid))
  ).catch(() => ({ docs: [] }));
  await Promise.all(filed.docs.map((d) => deleteDoc(d.ref)));
}

// Deletes everything we know about a user, in order:
//   1. push tokens (so the soon-to-be-deleted account stops getting pings)
//   2. Firestore matches + chat subcollections
//   3. RTDB world likes, signals, presence
//   4. Storage media
//   5. user doc
//   6. auth account
// Each step is wrapped in `safe` so a single failure doesn't strand the others.
export async function deleteAccount() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const uid = user.uid;

  await safe("disable messaging", () => disableMessagingForCurrentUser());
  await safe("matches", () => deleteAllMatches(uid));
  await safe("world likes", () => deleteWorldLikes(uid));
  await safe("signals", () => deleteSignals(uid));
  await safe("presence", () => deletePresence(uid));
  await safe("media", () => deleteUserMedia(uid));
  await safe("reports", () => deleteReports(uid));
  await safe("user doc", () => deleteDoc(doc(db, "users", uid)));
  await user.delete();
}
