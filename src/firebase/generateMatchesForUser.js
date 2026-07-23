import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../firebase";

// Keep the legacy call signature so signup, login, and profile-save callers do
// not need to handle private candidate data. The server derives the caller from
// Auth and reads matching inputs with Admin credentials.
export async function generateMatchesForUser(_currentUserProfile, currentUserId) {
  const uid = auth.currentUser?.uid || null;
  if (!uid || (currentUserId && currentUserId !== uid)) return null;

  try {
    const refresh = httpsCallable(functions, "refreshDiscoveryMatches");
    const response = await refresh({});
    return response.data || null;
  } catch (error) {
    console.error("Discovery refresh failed:", error);
    return null;
  }
}
