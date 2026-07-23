// utils/MatchActions.js
import { auth, functions } from "../firebase";
import { httpsCallable } from "firebase/functions";

function currentUid() {
  return auth.currentUser?.uid || null;
}

function reportReason(value) {
  if (typeof value !== "string") return null;
  return value.trim().slice(0, 1000) || null;
}

// The callable writes the private Firestore block and its server-owned RTDB
// deny projection before returning, then tears down any live pair interaction.
export async function blockUser(otherId) {
  const uid = currentUid();
  if (!uid || !otherId || uid === otherId) return;
  const invoke = httpsCallable(functions, "blockWorldUser");
  await invoke({ otherUid: otherId });
}

export async function reportUser(otherId, reason = null) {
  const uid = currentUid();
  if (!uid || !otherId || uid === otherId) return;
  const invoke = httpsCallable(functions, "submitSafetyReport");
  await invoke({
    reportedUserId: otherId,
    reason: reportReason(reason),
    type: "user",
  });
}

export async function reportPhoto(otherId, photoUrl, reason = null) {
  const uid = currentUid();
  if (!uid || !otherId || uid === otherId || !photoUrl) return;
  if (
    typeof photoUrl !== "string" ||
    !photoUrl.startsWith("https://") ||
    photoUrl.length > 2048
  ) {
    throw new Error("That photo cannot be attached to a safety report.");
  }

  const invoke = httpsCallable(functions, "submitSafetyReport");
  await invoke({
    reportedUserId: otherId,
    photoUrl,
    reason: reportReason(reason),
    type: "photo",
  });
}

export async function unmatch(matchId) {
  return submitMatchDecision(matchId, "unmatch");
}

export async function submitMatchDecision(matchId, decision) {
  const uid = currentUid();
  if (!uid || typeof matchId !== "string" || !matchId) return null;
  if (!["like", "pass", "unmatch"].includes(decision)) {
    throw new Error("Choose a valid match response.");
  }
  const invoke = httpsCallable(functions, "submitMatchDecision");
  const response = await invoke({ matchId, decision });
  return response.data || null;
}
