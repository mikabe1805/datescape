// utils/matchActions.js
import { db } from "../firebase";
import {
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";

export async function blockUser(otherId) {
  const ref = doc(db, "blocks", otherId);
  await setDoc(ref, { blockedAt: serverTimestamp() }, { merge: true });
}

export async function reportUser(otherId) {
  const ref = doc(db, "reports", otherId);
  await setDoc(ref, { reports: arrayUnion(serverTimestamp()) }, { merge: true });
}

export async function unmatch(matchId) {
  const ref = doc(db, "matches", matchId);
  await updateDoc(ref, { isActive: false });
}
