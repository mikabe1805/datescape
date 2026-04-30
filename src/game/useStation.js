import { useCallback, useEffect, useRef, useState } from "react";
import {
  ref as dbRef,
  onValue,
  set,
  remove,
  push,
  onDisconnect,
  serverTimestamp,
  update,
  get,
} from "firebase/database";
import { rtdb, auth } from "../firebase";

// Station seating + matchmaking.
// Schema:
//   /stations/<room>/<stationId>/seats/<uid> = {name, color, sitAt}
//   /stations/<room>/<stationId>/match = {id, white, black, fen, moves[], startedAt, lastMoveAt}
//
// Sitting flow:
//   - sit() writes a seat for myUid with onDisconnect cleanup.
//   - Subscribes to /seats and /match for that station.
//   - When 2 seats present and no match: the lower-uid client creates the match (idempotent via transaction-ish check).
//
// Chess sync:
//   - submitMove(move) appends to match.moves and updates fen + lastMoveAt.
//   - The other client's onValue picks up the new move.
//
// All multiplayer state is best-effort: if RTDB rules block writes, the local game still works.

export function useStation({ stationId, room = "ember-plaza", profile, enabled = true }) {
  const myUid = auth.currentUser?.uid || null;
  const [seats, setSeats] = useState({});
  const [match, setMatch] = useState(null);
  const [error, setError] = useState(null);
  const seatRefRef = useRef(null);
  const sittingRef = useRef(false);

  const seatsPath = `stations/${room}/${stationId}/seats`;
  const matchPath = `stations/${room}/${stationId}/match`;

  useEffect(() => {
    if (!enabled || !stationId) return undefined;

    const seatsRef = dbRef(rtdb, seatsPath);
    const matchRef = dbRef(rtdb, matchPath);

    const unsubSeats = onValue(
      seatsRef,
      (snap) => {
        setSeats(snap.val() || {});
      },
      (err) => setError(err.message)
    );
    const unsubMatch = onValue(matchRef, (snap) => {
      setMatch(snap.val() || null);
    });

    return () => {
      unsubSeats();
      unsubMatch();
    };
  }, [enabled, seatsPath, matchPath, stationId]);

  // When 2 seats and no current match: lowest-uid creates a match.
  useEffect(() => {
    if (!enabled) return;
    const seatList = Object.entries(seats)
      .map(([uid, data]) => ({ uid, ...data }))
      .sort((a, b) => (a.sitAt || 0) - (b.sitAt || 0));
    if (seatList.length < 2) return;
    if (match && match.white && match.black) return;
    const [first, second] = seatList;
    if (!myUid || (myUid !== first.uid && myUid !== second.uid)) return;
    // Only the lower uid creates the match to avoid both clients writing.
    if (myUid !== (first.uid < second.uid ? first.uid : second.uid)) return;

    const matchId = `${stationId}-${Date.now()}`;
    const payload = {
      id: matchId,
      white: first.uid,
      black: second.uid,
      whiteName: first.name || "White",
      blackName: second.name || "Black",
      whiteColor: first.color || "#f5c973",
      blackColor: second.color || "#99b4ff",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      startedAt: serverTimestamp(),
      lastMoveAt: serverTimestamp(),
    };
    set(dbRef(rtdb, matchPath), payload).catch((err) => setError(err.message));
  }, [enabled, seats, match, myUid, matchPath, stationId]);

  const sit = useCallback(async () => {
    if (!enabled || !myUid || !profile) {
      sittingRef.current = true;
      return;
    }
    const myRef = dbRef(rtdb, `${seatsPath}/${myUid}`);
    seatRefRef.current = myRef;
    onDisconnect(myRef)
      .remove()
      .catch(() => {});
    try {
      await set(myRef, {
        name: profile.name,
        color: profile.color,
        sitAt: Date.now(),
      });
      sittingRef.current = true;
    } catch (err) {
      setError(err.message);
      sittingRef.current = true; // local sit-state still useful
    }
  }, [enabled, myUid, profile, seatsPath]);

  const stand = useCallback(async () => {
    sittingRef.current = false;
    const myRef = seatRefRef.current;
    if (myRef) {
      try {
        await remove(myRef);
      } catch {}
      seatRefRef.current = null;
    }
    // If we are part of the active match, end it.
    if (match && (match.white === myUid || match.black === myUid)) {
      try {
        await remove(dbRef(rtdb, matchPath));
      } catch {}
    }
  }, [match, matchPath, myUid]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      const myRef = seatRefRef.current;
      if (myRef) remove(myRef).catch(() => {});
      seatRefRef.current = null;
    };
  }, []);

  // Submit a chess move (only valid for the player whose turn it is).
  const submitMove = useCallback(
    async (moveSan, fen) => {
      if (!match) return;
      const movesRef = dbRef(rtdb, `${matchPath}/moves`);
      try {
        await push(movesRef, { san: moveSan, by: myUid, at: Date.now() });
        await update(dbRef(rtdb, matchPath), { fen, lastMoveAt: serverTimestamp() });
      } catch (err) {
        setError(err.message);
      }
    },
    [match, matchPath, myUid]
  );

  // Concede / end match (writes a result then clears).
  const endMatch = useCallback(
    async (result) => {
      if (!match) return;
      try {
        await update(dbRef(rtdb, matchPath), { result, endedAt: serverTimestamp() });
      } catch {}
    },
    [match, matchPath]
  );

  // Are we currently seated?
  const seated = Boolean(myUid && seats[myUid]);

  return {
    seats,
    seated,
    match,
    sit,
    stand,
    submitMove,
    endMatch,
    error,
  };
}

// Subscribe to moves of a match for incremental playback.
export function useMatchMoves(matchPath, enabled) {
  const [moves, setMoves] = useState([]);
  useEffect(() => {
    if (!enabled || !matchPath) return undefined;
    const movesRef = dbRef(rtdb, `${matchPath}/moves`);
    const unsub = onValue(movesRef, (snap) => {
      const value = snap.val() || {};
      const list = Object.entries(value)
        .map(([key, data]) => ({ key, ...data }))
        .sort((a, b) => (a.at || 0) - (b.at || 0));
      setMoves(list);
    });
    return () => unsub();
  }, [enabled, matchPath]);
  return moves;
}

// Send an emote/wave/like signal to another player (lightweight pings).
export async function sendSignal({ toUid, fromUid, fromName, fromColor, type }) {
  try {
    const ref = dbRef(rtdb, `signals/${toUid}`);
    await push(ref, { type, fromUid, fromName, fromColor, at: Date.now() });
  } catch {}
}

// Subscribe to incoming signals for me.
export function useSignals({ enabled = true }) {
  const [signals, setSignals] = useState([]);
  const myUid = auth.currentUser?.uid || null;
  useEffect(() => {
    if (!enabled || !myUid) return undefined;
    const ref = dbRef(rtdb, `signals/${myUid}`);
    const unsub = onValue(ref, (snap) => {
      const value = snap.val() || {};
      const list = Object.entries(value)
        .map(([key, data]) => ({ key, ...data }))
        .sort((a, b) => (a.at || 0) - (b.at || 0))
        .slice(-10);
      setSignals(list);
    });
    return () => unsub();
  }, [enabled, myUid]);

  const consume = useCallback(
    async (key) => {
      if (!myUid || !key) return;
      try {
        await remove(dbRef(rtdb, `signals/${myUid}/${key}`));
      } catch {}
    },
    [myUid]
  );

  return { signals, consume };
}

// Like another user (mutual likes can later be promoted to a match).
export async function recordWorldLike({ fromUid, toUid }) {
  if (!fromUid || !toUid) return { mutual: false };
  try {
    await set(dbRef(rtdb, `worldLikes/${fromUid}/${toUid}`), Date.now());
    const reverse = await get(dbRef(rtdb, `worldLikes/${toUid}/${fromUid}`));
    return { mutual: reverse.exists() };
  } catch (err) {
    return { mutual: false, error: err.message };
  }
}
