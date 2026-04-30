import { db } from "../firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

// Build the canonical match id from two uids by lex-sorting them so both sides
// produce the same id.
export function makeMatchId(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

// When two users have mutually liked each other in the world, promote to a real
// Firestore match document so they show up in the existing match queue/chat flow.
//
// Idempotent: if the match already exists with `matched: true`, this is a no-op.
// Returns { matchId, created } where `created` is true on first promotion.
export async function promoteWorldLikeToMatch({ fromUid, toUid }) {
  if (!fromUid || !toUid || fromUid === toUid) {
    return { matchId: null, created: false };
  }
  const [uidA, uidB] = [fromUid, toUid].sort();
  const matchId = `${uidA}_${uidB}`;
  const matchRef = doc(db, "matches", matchId);

  try {
    const existing = await getDoc(matchRef);
    if (existing.exists() && existing.data()?.matched === true) {
      return { matchId, created: false };
    }

    const [profA, profB] = await Promise.all([
      getDoc(doc(db, "users", uidA)),
      getDoc(doc(db, "users", uidB)),
    ]);
    if (!profA.exists() || !profB.exists()) {
      return { matchId, created: false };
    }

    const dataA = profA.data();
    const dataB = profB.data();

    await setDoc(
      matchRef,
      {
        participants: [uidA, uidB],
        userA: uidA,
        userB: uidB,
        userAProfile: stripProfile(dataA),
        userBProfile: stripProfile(dataB),
        likedByA: true,
        likedByB: true,
        matched: true,
        isActiveA: true,
        isActiveB: true,
        matchScore: 80,
        source: "world",
        timestamp: serverTimestamp(),
      },
      { merge: true }
    );

    return { matchId, created: true };
  } catch (err) {
    console.warn("[matchBridge] promote failed:", err.message);
    return { matchId, created: false, error: err.message };
  }
}

// Trim user docs down to fields the match list / chat actually use.
function stripProfile(data) {
  if (!data) return {};
  const media = Array.isArray(data.media)
    ? data.media.map((m) => (typeof m === "string" ? m : m?.url)).filter(Boolean)
    : [];
  return {
    displayName: data.displayName || "",
    bio: data.bio || "",
    media,
    zodiac: data.zodiac || "",
    lookingFor: data.lookingFor || "",
    gender: data.gender || "",
    age: data.age || null,
  };
}
