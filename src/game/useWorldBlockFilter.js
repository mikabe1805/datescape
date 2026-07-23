import { useEffect, useState } from "react";
import { onValue, ref as dbRef } from "firebase/database";
import { auth, rtdb } from "../firebase";

export function projectedBlockedUids(value) {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value)
    .filter(
      ([uid, blocked]) =>
        typeof uid === "string" && uid.length > 0 && blocked === true,
    )
    .map(([uid]) => uid)
    .sort();
}

// This projection is deliberately directionless: consumers of this path learn
// only that a pair must not share presence or an activity.
export function useWorldBlockFilter({ enabled = true, uid } = {}) {
  const viewerUid = uid || auth.currentUser?.uid || null;
  const [state, setState] = useState({
    blockedUids: [],
    ready: false,
    error: null,
  });

  useEffect(() => {
    if (!enabled || !viewerUid) {
      setState({ blockedUids: [], ready: false, error: null });
      return undefined;
    }

    setState({ blockedUids: [], ready: false, error: null });
    return onValue(
      dbRef(rtdb, `worldBlockFilters/${viewerUid}`),
      (snapshot) =>
        setState({
          blockedUids: projectedBlockedUids(snapshot.val()),
          ready: true,
          error: null,
        }),
      (error) =>
        setState({
          blockedUids: [],
          ready: false,
          error: error?.message || "Block safety filter unavailable",
        }),
    );
  }, [enabled, viewerUid]);

  return state;
}
