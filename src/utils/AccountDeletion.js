// Account deletion is intentionally server-authoritative. A browser cannot
// reliably discover or delete every cross-user reference without broad read
// permissions, and it must never remove Auth before the data purge succeeds.
import { signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import {
  auth,
  functions,
  disableMessagingForCurrentUser,
} from "../firebase";

export async function deleteAccount() {
  if (!auth.currentUser) throw new Error("Not signed in");

  // This is best-effort device cleanup. The trusted function also removes the
  // stored token with the user document, even if browser messaging is blocked.
  await disableMessagingForCurrentUser().catch((error) => {
    console.warn("[deleteAccount] Device notification cleanup failed", error);
  });

  const deleteMyAccount = httpsCallable(functions, "deleteMyAccount");
  await deleteMyAccount();

  // The Admin SDK has removed the account. Clear the local Firebase session so
  // the UI transitions immediately instead of waiting for a token refresh.
  await signOut(auth).catch(() => {});
}
