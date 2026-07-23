import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

// Both clients and the trusted backend use this stable identifier.
export function makeMatchId(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

// A browser may record its own Spark, but only the backend may verify the two
// reciprocal edges, inspect private profiles, and create a mutual connection.
export async function promoteWorldLikeToMatch({ fromUid, toUid }) {
  if (!fromUid || !toUid || fromUid === toUid) {
    return { matchId: null, created: false };
  }

  const matchId = makeMatchId(fromUid, toUid);
  try {
    const promote = httpsCallable(functions, "promoteWorldConnection");
    const response = await promote({ toUid });
    return {
      matchId: response.data?.matchId || matchId,
      created: response.data?.created === true,
    };
  } catch (error) {
    console.warn("[matchBridge] promote failed:", error.message);
    return { matchId, created: false, error: error.message };
  }
}
