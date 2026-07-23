import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ref as dbRef,
  onValue,
  set,
  remove,
  onDisconnect,
  serverTimestamp,
  get,
  runTransaction,
  query,
  orderByChild,
  limitToFirst,
  limitToLast,
} from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { rtdb, auth, functions } from "../firebase";
import { socialCardIdForMatchId } from "./socialMoment";
import { useWorldBlockFilter } from "./useWorldBlockFilter";

// Station seating + matchmaking.
// Schema:
//   /stations/<room>/<stationId>/seats/<uid> =
//     {name, color, sitAt, sessionId}
//   /stations/<room>/<stationId>/match =
//     {id, mode, white, black, whiteSeatSessionId, blackSeatSessionId,
//      startedAt, ...modeData}
//   /stations/<room>/<stationId>/match/completionAcks/<uid> =
//     {matchId, acknowledgedAt}
//   /stations/<room>/<stationId>/match/socialChoices/<uid> =
//     {matchId, choiceId, chosenAt}
//
// Sitting flow:
//   - sit() writes a seat for myUid with onDisconnect cleanup.
//   - Subscribes to the bounded /seats roster, then to /match only while this
//     exact client owns a seat. RTDB rules bind the private match read to that
//     seat's session token.
//   - When 2 seats present and no match: the lower-uid client creates it with an RTDB transaction.
//
// Modes:
//   - chess adds fen, moves[] and lastMoveAt.
//   - social creates a neutral two-person session with no board or move data.
//   - resonance adds three rounds of player-owned notes to a shared duet.
//
// Chess sync:
//   - submitMove(action) asks the server to validate and commit the move.
//   - Both clients render only the ordered server move log from RTDB.
//
// All multiplayer state is best-effort: if RTDB rules block writes, the local game still works.

export function hasAllCompletionAcks(match) {
  const participantIds = [match?.white, match?.black].filter(Boolean);
  return Boolean(
    match?.id &&
      participantIds.length === 2 &&
      participantIds.every(
        (uid) => match.completionAcks?.[uid]?.matchId === match.id,
      ),
  );
}

const SOCIAL_CHOICE_IDS = new Set(["a", "b", "c", "pass"]);
const SEAT_SESSION_ID_PATTERN = /^[a-f0-9]{32}$/;
const CHESS_MOVE_KEY_PATTERN = /^m(\d{3})$/;
const CHESS_SQUARE_PATTERN = /^[a-h][1-8]$/;
const MAX_CHESS_MOVES = 512;

function createSeatSessionId() {
  const bytes = new Uint8Array(16);
  const cryptoApi = window.crypto;
  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

function safeSeatSessionId(value) {
  return typeof value === "string" && SEAT_SESSION_ID_PATTERN.test(value)
    ? value
    : null;
}

export function nextChessMoveKey(moves) {
  const source = moves && typeof moves === "object" ? moves : {};
  const highestPly = Object.keys(source).reduce((highest, key) => {
    const match = CHESS_MOVE_KEY_PATTERN.exec(key);
    if (!match) return highest;
    const ply = Number(match[1]);
    return ply >= 1 && ply <= MAX_CHESS_MOVES
      ? Math.max(highest, ply)
      : highest;
  }, 0);
  if (highestPly >= MAX_CHESS_MOVES) return null;
  return `m${String(highestPly + 1).padStart(3, "0")}`;
}

export function orderedChessMoves(value) {
  if (value == null) return [];
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value)
    .map(([key, move]) => {
      const keyMatch = CHESS_MOVE_KEY_PATTERN.exec(key);
      const ply = keyMatch ? Number(keyMatch[1]) : null;
      if (
        !ply ||
        ply > MAX_CHESS_MOVES ||
        !move ||
        typeof move !== "object" ||
        move.ply !== ply ||
        typeof move.san !== "string" ||
        !move.san ||
        typeof move.by !== "string" ||
        !move.by ||
        !Number.isFinite(move.at)
      ) {
        return null;
      }
      return { key, ...move, ply };
    })
    .sort((first, second) => (first?.ply || 0) - (second?.ply || 0));
  if (
    entries.length > MAX_CHESS_MOVES ||
    entries.some((entry, index) => !entry || entry.ply !== index + 1)
  ) {
    return null;
  }
  return entries;
}

async function removeSeatIfSessionMatches(seatRef, sessionId) {
  if (!seatRef) return false;
  const safeSessionId = safeSeatSessionId(sessionId);
  if (!safeSessionId) {
    await remove(seatRef);
    return true;
  }

  const result = await runTransaction(
    seatRef,
    (current) => {
      if (!current || current.sessionId !== safeSessionId) return undefined;
      return null;
    },
    { applyLocally: false },
  );
  return Boolean(result.committed || result.snapshot?.exists?.() === false);
}

function sanitizeSocialChoices(match) {
  if (match?.mode !== "social" || !match.id) return {};
  const choices = match.socialChoices;
  if (!choices || typeof choices !== "object") return {};

  return [match.white, match.black].filter(Boolean).reduce((safe, uid) => {
    const choice = choices[uid];
    if (
      choice &&
      typeof choice === "object" &&
      choice.matchId === match.id &&
      SOCIAL_CHOICE_IDS.has(choice.choiceId) &&
      Number.isFinite(choice.chosenAt)
    ) {
      safe[uid] = {
        matchId: choice.matchId,
        choiceId: choice.choiceId,
        chosenAt: choice.chosenAt,
      };
    }
    return safe;
  }, {});
}

export function useStation({
  stationId,
  room = "ember-plaza",
  profile,
  enabled = true,
  mode = "chess",
  excludedUids = [],
}) {
  const stationMode =
    mode === "social" || mode === "resonance" ? mode : "chess";
  const myUid = auth.currentUser?.uid || null;
  const {
    blockedUids: projectedBlockedUids,
    ready: blockFilterReady,
    error: blockFilterError,
  } = useWorldBlockFilter({ enabled, uid: myUid });
  const excludedUidKey = [
    ...(Array.isArray(excludedUids) ? excludedUids : []),
    ...projectedBlockedUids,
  ]
    .filter(Boolean)
    .sort()
    .join("\u0000");
  const excludedUidSet = useMemo(
    () => new Set(excludedUidKey ? excludedUidKey.split("\u0000") : []),
    [excludedUidKey],
  );
  const profileName = profile?.name;
  const profileColor = profile?.color;
  const [seats, setSeats] = useState({});
  const [ownSeat, setOwnSeat] = useState(null);
  const [match, setMatch] = useState(null);
  const [fullyAcknowledgedMatchIds, setFullyAcknowledgedMatchIds] = useState(
    [],
  );
  const [error, setError] = useState(null);
  const seatRefRef = useRef(null);
  const seatDisconnectRef = useRef(null);
  const desiredSeatRef = useRef(null);
  const seatWriteInFlightRef = useRef(false);
  const seatWritePendingRef = useRef(false);
  const seatSessionRef = useRef(0);
  const sittingRef = useRef(false);
  const latestMatchRef = useRef(null);
  const matchCreationRef = useRef(false);
  const acknowledgedMatchIdsRef = useRef(new Set());
  const profileRef = useRef(profile);
  const blockFilterReadyRef = useRef(blockFilterReady);

  const seatsPath = `stations/${room}/${stationId}/seats`;
  const matchPath = `stations/${room}/${stationId}/match`;
  const currentOwnSeat = ownSeat || (myUid ? seats[myUid] : null);
  const hasOwnSeat = Boolean(currentOwnSeat);
  const matchmakingSeatSessionId =
    myUid &&
    seats[myUid] &&
    currentOwnSeat &&
    seats[myUid].sessionId === currentOwnSeat.sessionId
      ? currentOwnSeat.sessionId || "legacy-seat"
      : null;
  profileRef.current = profile;
  blockFilterReadyRef.current = blockFilterReady;
  latestMatchRef.current = match;
  const completionAcks = useMemo(() => {
    const value = match?.completionAcks;
    return value && typeof value === "object" ? value : {};
  }, [match]);
  const completionAcknowledged = Boolean(
    myUid &&
      match?.id &&
      completionAcks[myUid]?.matchId === match.id,
  );
  const socialChoices = useMemo(() => sanitizeSocialChoices(match), [match]);
  const socialChoice = myUid ? socialChoices[myUid] || null : null;

  useEffect(() => {
    if (!enabled || !stationId || !myUid || !blockFilterReady) {
      setSeats({});
      setOwnSeat(null);
      setMatch(null);
      setFullyAcknowledgedMatchIds([]);
      setError(blockFilterError);
      acknowledgedMatchIdsRef.current = new Set();
      return undefined;
    }

    setSeats({});
    setOwnSeat(null);
    setMatch(null);
    setFullyAcknowledgedMatchIds([]);
    setError(null);
    acknowledgedMatchIdsRef.current = new Set();

    const seatsRef = query(
      dbRef(rtdb, seatsPath),
      orderByChild("sitAt"),
      limitToFirst(2),
    );
    const ownSeatRef = dbRef(rtdb, `${seatsPath}/${myUid}`);
    const unsubSeats = onValue(
      seatsRef,
      (snap) => {
        setSeats(snap.val() || {});
      },
      (err) => setError(err.message),
    );
    const unsubOwnSeat = onValue(
      ownSeatRef,
      (snap) => setOwnSeat(snap.val() || null),
      (err) => setError(err.message),
    );

    return () => {
      unsubSeats();
      unsubOwnSeat();
    };
  }, [
    enabled,
    seatsPath,
    stationId,
    myUid,
    blockFilterReady,
    blockFilterError,
  ]);

  useEffect(() => {
    if (
      !enabled ||
      !stationId ||
      !blockFilterReady ||
      !myUid ||
      !matchmakingSeatSessionId
    ) {
      setMatch(null);
      return undefined;
    }

    setMatch(null);
    const matchRef = dbRef(rtdb, matchPath);
    const unsubMatch = onValue(
      matchRef,
      (snap) => {
        const nextMatch = snap.val() || null;
        if (hasAllCompletionAcks(nextMatch)) {
          setFullyAcknowledgedMatchIds((current) =>
            current.includes(nextMatch.id)
              ? current
              : [...current.slice(-7), nextMatch.id],
          );
        }
        setMatch(nextMatch);
      },
      (err) => {
        // A seat-session change or new block revokes the private listener at
        // the rules layer. Drop any locally cached payload immediately.
        setMatch(null);
        setError(err.message);
      },
    );

    return () => {
      unsubMatch();
    };
  }, [
    enabled,
    matchPath,
    stationId,
    myUid,
    matchmakingSeatSessionId,
    blockFilterReady,
  ]);

  const clearMatchIfCurrent = useCallback(
    async (matchId) => {
      if (!matchId) return;
      try {
        await runTransaction(
          dbRef(rtdb, matchPath),
          (current) => (current?.id === matchId ? null : undefined),
          { applyLocally: false },
        );
      } catch (err) {
        setError(err.message);
      }
    },
    [matchPath],
  );

  // When 2 seats and no current match: lowest-uid creates a match.
  useEffect(() => {
    if (
      !enabled ||
      !blockFilterReady ||
      !sittingRef.current ||
      !desiredSeatRef.current
    ) {
      return;
    }
    const seatList = Object.entries(seats)
      .map(([uid, data]) => ({ uid, ...data }))
      .filter((seat) => safeSeatSessionId(seat.sessionId))
      .filter((seat) => !excludedUidSet.has(seat.uid))
      .sort((a, b) => (a.sitAt || 0) - (b.sitAt || 0));
    if (seatList.length < 2) return;
    if (match && match.white && match.black) return;
    const [first, second] = seatList;
    if (!myUid || (myUid !== first.uid && myUid !== second.uid)) return;
    // Only the lower uid creates the match to avoid both clients writing.
    if (myUid !== (first.uid < second.uid ? first.uid : second.uid)) return;
    if (matchCreationRef.current) return;

    const matchId = `${stationId}-${Date.now()}`;
    const startedAt = Date.now();
    const payload = {
      id: matchId,
      mode: stationMode,
      white: first.uid,
      black: second.uid,
      whiteName:
        first.name || (stationMode === "chess" ? "White" : "Guest one"),
      blackName:
        second.name || (stationMode === "chess" ? "Black" : "Guest two"),
      whiteColor: first.color || "#f5c973",
      blackColor: second.color || "#99b4ff",
      startedAt,
    };
    const whiteSeatSessionId = safeSeatSessionId(first.sessionId);
    const blackSeatSessionId = safeSeatSessionId(second.sessionId);
    if (whiteSeatSessionId) {
      payload.whiteSeatSessionId = whiteSeatSessionId;
    }
    if (blackSeatSessionId) {
      payload.blackSeatSessionId = blackSeatSessionId;
    }
    if (stationMode === "chess") {
      payload.fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      payload.lastMoveAt = startedAt;
    } else if (stationMode === "social") {
      payload.socialCardId = socialCardIdForMatchId(matchId);
    }
    matchCreationRef.current = true;
    runTransaction(
      dbRef(rtdb, matchPath),
      (current) => {
        if (!sittingRef.current || !desiredSeatRef.current) return undefined;
        if (current?.white && current?.black) return undefined;
        return payload;
      },
      { applyLocally: false },
    )
      .catch((err) => setError(err.message))
      .finally(() => {
        matchCreationRef.current = false;
      });
  }, [
    enabled,
    seats,
    match,
    myUid,
    matchPath,
    stationId,
    stationMode,
    excludedUidSet,
    blockFilterReady,
  ]);

  // Presence filtering is not enough for a consent activity: reject any
  // station session if the other participant is on this player's block list.
  // The server projection also clears the shared match, while this path drops
  // the local seat so the blocked pair cannot immediately reform.
  useEffect(() => {
    if (!match?.id || !myUid) return;
    const includesMe = match.white === myUid || match.black === myUid;
    if (!includesMe) return;
    const otherUid = match.white === myUid ? match.black : match.white;
    if (!otherUid || !excludedUidSet.has(otherUid)) return;
    // Leave the blocked pairing as well as removing its match. Otherwise the
    // unblocked client can immediately recreate the same lowest-uid pairing.
    const leavingSession = seatSessionRef.current;
    const blockedMatchId = match.id;
    const blockedSeatSessionId =
      desiredSeatRef.current?.payload?.sessionId || currentOwnSeat?.sessionId;
    sittingRef.current = false;
    desiredSeatRef.current = null;
    const seatDisconnect = seatDisconnectRef.current;
    seatDisconnectRef.current = null;
    const mySeatRef = dbRef(rtdb, `${seatsPath}/${myUid}`);
    seatRefRef.current = null;
    removeSeatIfSessionMatches(mySeatRef, blockedSeatSessionId)
      .then((removedSeat) => {
        if (
          removedSeat &&
          !sittingRef.current &&
          seatSessionRef.current === leavingSession
        ) {
          return seatDisconnect?.cancel().catch(() => {});
        }
        return undefined;
      })
      .catch(() => {});
    void clearMatchIfCurrent(blockedMatchId);
  }, [
    match,
    myUid,
    excludedUidSet,
    seats,
    currentOwnSeat,
    seatsPath,
    clearMatchIfCurrent,
  ]);

  const ensureDesiredSeat = useCallback(async () => {
    if (!blockFilterReadyRef.current) return;
    if (seatWriteInFlightRef.current) {
      seatWritePendingRef.current = true;
      return;
    }

    seatWriteInFlightRef.current = true;
    try {
      do {
        seatWritePendingRef.current = false;
        let desired = desiredSeatRef.current;
        if (!blockFilterReadyRef.current || !sittingRef.current || !desired) {
          break;
        }

        const myRef = dbRef(rtdb, desired.path);
        const disconnect = onDisconnect(myRef);
        try {
          // Arm server cleanup before publishing the seat so a disconnect can
          // never leave a ghost player in the queue.
          await disconnect.remove();
          if (!sittingRef.current || desiredSeatRef.current !== desired) {
            await disconnect.cancel().catch(() => {});
            continue;
          }

          const seatIntent = desired;
          const currentSeatSnapshot = await get(myRef);
          if (
            !sittingRef.current ||
            desiredSeatRef.current !== seatIntent
          ) {
            await disconnect.cancel().catch(() => {});
            continue;
          }
          const currentSeat = currentSeatSnapshot.val();
          const sitAt =
            currentSeat?.sessionId === desired.payload.sessionId &&
            Number.isFinite(currentSeat?.sitAt)
              ? currentSeat.sitAt
              : serverTimestamp();
          desired = {
            ...desired,
            payload: { ...desired.payload, sitAt },
          };
          desiredSeatRef.current = desired;

          // Replacing this reference must not cancel the previous handle:
          // cancel() is path-scoped and could clear the cleanup just armed.
          seatDisconnectRef.current = disconnect;
          seatRefRef.current = myRef;
          await set(myRef, desired.payload);
          if (!sittingRef.current || desiredSeatRef.current !== desired) {
            await removeSeatIfSessionMatches(
              myRef,
              desired.payload.sessionId,
            ).catch(() => {});
          }
        } catch (err) {
          if (seatDisconnectRef.current === disconnect) {
            seatDisconnectRef.current = null;
          }
          await disconnect.cancel().catch(() => {});
          setError(err.message);
        }
      } while (seatWritePendingRef.current);
    } finally {
      seatWriteInFlightRef.current = false;
      if (seatWritePendingRef.current && sittingRef.current) {
        seatWritePendingRef.current = false;
        void ensureDesiredSeat();
      }
    }
  }, []);

  // Firebase removes onDisconnect seats on transient network loss too. Keep
  // the player's explicit desire to sit locally, then re-arm cleanup and
  // publish that same seat whenever the connection returns.
  useEffect(() => {
    if (!enabled || !stationId || !blockFilterReady) return undefined;
    const connectedRef = dbRef(rtdb, ".info/connected");
    return onValue(connectedRef, (snapshot) => {
      if (snapshot.val() === true && sittingRef.current) {
        void ensureDesiredSeat();
      }
    });
  }, [enabled, stationId, ensureDesiredSeat, blockFilterReady]);

  const sit = useCallback(async () => {
    const currentProfile = profileRef.current;
    if (!enabled || !blockFilterReady || !myUid || !currentProfile) {
      if (!blockFilterReady) {
        setError(blockFilterError || "Block safety filter unavailable");
        return;
      }
      sittingRef.current = true;
      return;
    }
    seatSessionRef.current += 1;
    sittingRef.current = true;
    desiredSeatRef.current = {
      path: `${seatsPath}/${myUid}`,
      payload: {
        name: currentProfile.name,
        color: currentProfile.color,
        sitAt: Date.now(),
        sessionId: createSeatSessionId(),
      },
    };
    await ensureDesiredSeat();
  }, [
    enabled,
    blockFilterReady,
    blockFilterError,
    myUid,
    seatsPath,
    ensureDesiredSeat,
  ]);

  useEffect(() => {
    const desired = desiredSeatRef.current;
    if (!sittingRef.current || !desired || !profileName || !profileColor) return;
    if (
      desired.payload.name === profileName &&
      desired.payload.color === profileColor
    ) {
      return;
    }
    desiredSeatRef.current = {
      ...desired,
      payload: {
        ...desired.payload,
        name: profileName,
        color: profileColor,
      },
    };
    void ensureDesiredSeat();
  }, [ensureDesiredSeat, profileColor, profileName]);

  const stand = useCallback(async () => {
    const leavingSession = seatSessionRef.current;
    const leavingMatch = latestMatchRef.current;
    const leavingSeatSessionId = desiredSeatRef.current?.payload?.sessionId;
    sittingRef.current = false;
    desiredSeatRef.current = null;
    seatWritePendingRef.current = false;
    const seatDisconnect = seatDisconnectRef.current;
    seatDisconnectRef.current = null;
    const myRef = seatRefRef.current;
    let removedSeat = !myRef;
    if (myRef) {
      try {
        removedSeat = await removeSeatIfSessionMatches(
          myRef,
          leavingSeatSessionId,
        );
      } catch {}
      if (seatRefRef.current === myRef) seatRefRef.current = null;
    }
    if (
      seatDisconnect &&
      removedSeat &&
      !sittingRef.current &&
      seatSessionRef.current === leavingSession
    ) {
      try {
        await seatDisconnect.cancel();
      } catch {}
    }
    // Once this client has safely acknowledged a shared result, leave the
    // match in place until the other participant has captured it too. The
    // server's seat-delete cleanup remains the bounded fallback if they never
    // acknowledge. Early departures and chess retain immediate teardown.
    if (
      leavingMatch &&
      (leavingMatch.white === myUid || leavingMatch.black === myUid)
    ) {
      const bothAcknowledged = hasAllCompletionAcks(leavingMatch);
      const mineAcknowledged =
        acknowledgedMatchIdsRef.current.has(leavingMatch.id) ||
        leavingMatch.completionAcks?.[myUid]?.matchId === leavingMatch.id;
      if (
        leavingMatch.mode === "chess" ||
        !mineAcknowledged ||
        bothAcknowledged
      ) {
        await clearMatchIfCurrent(leavingMatch.id);
      }
    }
    if (latestMatchRef.current?.id === leavingMatch?.id) {
      latestMatchRef.current = null;
    }
  }, [clearMatchIfCurrent, myUid]);

  // RTDB can revoke the match listener before the symmetric block projection
  // reaches this hook. The public two-seat roster is enough to fail closed and
  // release our own queued seat even after the private payload is gone.
  useEffect(() => {
    if (!myUid || !sittingRef.current || match?.id || !hasOwnSeat) return;
    const hasBlockedSeatmate = Object.keys(seats).some(
      (uid) => uid !== myUid && excludedUidSet.has(uid),
    );
    if (hasBlockedSeatmate) void stand();
  }, [excludedUidSet, hasOwnSeat, match, myUid, seats, stand]);

  // Losing the viewer-owned safety projection is a hard stop: leave any
  // queued or active seat rather than continuing with a stale allow-list.
  useEffect(() => {
    if (!blockFilterReady && sittingRef.current) {
      void stand();
    }
  }, [blockFilterReady, stand]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      const unmountedSeatSessionId =
        desiredSeatRef.current?.payload?.sessionId;
      sittingRef.current = false;
      desiredSeatRef.current = null;
      seatWritePendingRef.current = false;
      seatDisconnectRef.current = null;
      const myRef = seatRefRef.current;
      if (myRef) {
        // Do not cancel the path-scoped onDisconnect here. A new hook instance
        // may already have re-armed cleanup for a fresh session at this uid.
        // The conditional transaction prevents this teardown from deleting it.
        removeSeatIfSessionMatches(myRef, unmountedSeatSessionId).catch(
          () => {},
        );
      }
      seatRefRef.current = null;
    };
  }, []);

  // Submit only a coordinate intent. FEN, turn, SAN, result, clock, and ply
  // are derived and committed atomically by the authenticated callable.
  const submitMove = useCallback(
    async ({ from, to, promotion = "q" } = {}) => {
      const submittedMatchId = match?.id;
      const seatSessionId = safeSeatSessionId(currentOwnSeat?.sessionId);
      const includesMe =
        match && (match.white === myUid || match.black === myUid);
      if (
        stationMode !== "chess" ||
        !submittedMatchId ||
        !includesMe ||
        !seatSessionId ||
        !CHESS_SQUARE_PATTERN.test(from || "") ||
        !CHESS_SQUARE_PATTERN.test(to || "") ||
        from === to ||
        !["q", "r", "b", "n"].includes(promotion)
      ) {
        return { ok: false, error: "Invalid active chess move" };
      }
      try {
        const invoke = httpsCallable(functions, "submitStationChessMove");
        const response = await invoke({
          room,
          stationId,
          matchId: submittedMatchId,
          seatSessionId,
          actionId: `chess:${createSeatSessionId()}`,
          from,
          to,
          promotion,
        });
        return { ok: true, ...(response.data || {}) };
      } catch (err) {
        setError(err.message);
        return { ok: false, error: err.message };
      }
    },
    [currentOwnSeat?.sessionId, match, myUid, room, stationId, stationMode],
  );

  // Add one player-owned note to the cooperative Resonance Loom. The round,
  // tone, and timing score are constrained here and again by RTDB rules.
  const submitResonance = useCallback(
    async (round, tone, accuracy) => {
      const safeRound = Number(round);
      const safeAccuracy = Number(accuracy);
      const submittedMatchId = match?.id;
      const allowedTones = new Set(["tide", "bloom", "ember"]);
      const includesMe =
        match && (match.white === myUid || match.black === myUid);
      if (
        stationMode !== "resonance" ||
        !submittedMatchId ||
        !includesMe ||
        !Number.isInteger(safeRound) ||
        safeRound < 0 ||
        safeRound > 2 ||
        !allowedTones.has(tone) ||
        !Number.isFinite(safeAccuracy)
      ) {
        return { ok: false, error: "Invalid resonance note" };
      }

      try {
        const note = {
          tone,
          accuracy: Math.min(1, Math.max(0, safeAccuracy)),
          at: Date.now(),
          matchId: submittedMatchId,
        };
        const result = await runTransaction(
          dbRef(rtdb, `${matchPath}/notes/${safeRound}/${myUid}`),
          (current) => (current ? undefined : note),
          { applyLocally: false },
        );
        if (!result.committed) {
          return {
            ok: false,
            error: "This duet changed before the note landed",
          };
        }
        return { ok: true };
      } catch (err) {
        setError(err.message);
        return { ok: false, error: err.message };
      }
    },
    [match, matchPath, myUid, stationMode],
  );

  // Seal one participant-owned choice for the active Listening Crescent
  // round. The captured match id makes a late transaction fail closed if the
  // station advances to a different pairing before the write reaches RTDB.
  const submitSocialChoice = useCallback(
    async (choiceId) => {
      const submittedMatchId = match?.id;
      const includesMe =
        match && (match.white === myUid || match.black === myUid);
      const hasActiveSeat = hasOwnSeat;
      if (
        stationMode !== "social" ||
        !submittedMatchId ||
        !includesMe ||
        !hasActiveSeat ||
        !SOCIAL_CHOICE_IDS.has(choiceId)
      ) {
        return { ok: false, error: "Invalid active listening choice" };
      }

      try {
        const choice = {
          matchId: submittedMatchId,
          choiceId,
          chosenAt: serverTimestamp(),
        };
        const result = await runTransaction(
          dbRef(rtdb, `${matchPath}/socialChoices/${myUid}`),
          (current) => (current ? undefined : choice),
          { applyLocally: false },
        );
        if (!result.committed) {
          return {
            ok: false,
            error: "This listening choice was already sealed",
          };
        }
        return { ok: true };
      } catch (err) {
        setError(err.message);
        return { ok: false, error: err.message };
      }
    },
    [hasOwnSeat, match, matchPath, myUid, stationMode],
  );

  // Add an immutable, participant-owned receipt for the active shared moment.
  // The uid is encoded in the path, so the payload contains no partner or
  // profile data. Repeating this call for the same match preserves the first
  // server timestamp.
  const acknowledgeCompletion = useCallback(async () => {
    const acknowledgedMatchId = match?.id;
    const includesMe =
      match && (match.white === myUid || match.black === myUid);
    const hasActiveSeat = hasOwnSeat;
    if (!acknowledgedMatchId || !includesMe || !hasActiveSeat) {
      return { ok: false, error: "No active seated shared moment" };
    }

    // Mark the handoff intent before awaiting the network so a user who closes
    // the modal immediately cannot synchronously erase the other player's
    // result. Failed writes remove the optimistic marker again.
    acknowledgedMatchIdsRef.current.add(acknowledgedMatchId);
    try {
      const acknowledgement = {
        matchId: acknowledgedMatchId,
        acknowledgedAt: serverTimestamp(),
      };
      const result = await runTransaction(
        dbRef(rtdb, `${matchPath}/completionAcks/${myUid}`),
        (current) =>
          current?.matchId === acknowledgedMatchId
            ? current
            : acknowledgement,
        { applyLocally: false },
      );
      if (!result.committed) {
        acknowledgedMatchIdsRef.current.delete(acknowledgedMatchId);
        return {
          ok: false,
          error: "This shared moment changed before completion landed",
        };
      }
      acknowledgedMatchIdsRef.current.add(acknowledgedMatchId);
      return { ok: true };
    } catch (err) {
      acknowledgedMatchIdsRef.current.delete(acknowledgedMatchId);
      setError(err.message);
      return { ok: false, error: err.message };
    }
  }, [hasOwnSeat, match, matchPath, myUid]);

  // Are we currently seated?
  const seated = hasOwnSeat;

  return {
    seats,
    seated,
    match,
    sit,
    stand,
    submitMove,
    submitResonance,
    submitSocialChoice,
    socialChoices,
    socialChoice,
    acknowledgeCompletion,
    completionAcks,
    completionAcknowledged,
    fullyAcknowledgedMatchIds,
    mode: stationMode,
    error,
  };
}

// Subscribe to moves of a match for incremental playback.
export function useMatchMoves(matchPath, enabled) {
  const [moves, setMoves] = useState([]);
  useEffect(() => {
    if (!enabled || !matchPath) {
      setMoves([]);
      return undefined;
    }
    const movesRef = dbRef(rtdb, `${matchPath}/moves`);
    const unsub = onValue(
      movesRef,
      (snap) => {
        setMoves(orderedChessMoves(snap.val()));
      },
      () => setMoves(null),
    );
    return () => unsub();
  }, [enabled, matchPath]);
  return moves;
}

const WORLD_SIGNAL_ROOM = "afterlight-market-garden-v1";
const WORLD_SIGNAL_TYPES = new Set([
  "wave",
  "invite-chess",
  "invite-chess-accepted",
  "invite-chess-declined",
]);
const WORLD_SIGNAL_RESPONSE_TYPES = new Set([
  "invite-chess-accepted",
  "invite-chess-declined",
]);
const pendingWorldSignalActions = new Map();

function createWorldSignalActionId(type) {
  const cryptoApi = typeof window !== "undefined" ? window.crypto : null;
  const nonce =
    cryptoApi?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `world-signal:${type}:${nonce}`;
}

function worldSignalRetryKey({ toUid, type, replyToActionId }) {
  return `${toUid}:${type}:${replyToActionId || "new"}`;
}

// Signals are delivered by a callable that derives identity/display fields and
// verifies fresh reciprocal co-presence. A failed attempt keeps its action id,
// so an explicit retry resumes rather than duplicating the action.
export async function sendSignal({
  toUid,
  type,
  replyToActionId = null,
}) {
  const fromUid = auth.currentUser?.uid || null;
  const isResponse = WORLD_SIGNAL_RESPONSE_TYPES.has(type);
  if (
    !fromUid ||
    !toUid ||
    toUid === fromUid ||
    !WORLD_SIGNAL_TYPES.has(type) ||
    (isResponse && !replyToActionId) ||
    (!isResponse && replyToActionId)
  ) {
    return { ok: false, error: "Invalid signal request" };
  }

  const retryKey = worldSignalRetryKey({ toUid, type, replyToActionId });
  const actionId =
    pendingWorldSignalActions.get(retryKey) || createWorldSignalActionId(type);
  pendingWorldSignalActions.set(retryKey, actionId);
  try {
    const invoke = httpsCallable(functions, "submitWorldSignal");
    const response = await invoke({
      room: WORLD_SIGNAL_ROOM,
      toUid,
      type,
      actionId,
      ...(replyToActionId ? { replyToActionId } : {}),
    });
    const ok = response.data?.ok !== false;
    if (ok) pendingWorldSignalActions.delete(retryKey);
    return {
      ok,
      duplicate: response.data?.duplicate === true,
      actionId,
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "That signal could not be delivered.",
      retryAfterMs: Number(error?.details?.retryAfterMs) || null,
      actionId,
    };
  }
}

// Subscribe to incoming signals for me.
export function useSignals({ enabled = true } = {}) {
  const [signals, setSignals] = useState([]);
  const myUid = auth.currentUser?.uid || null;
  const {
    blockedUids: projectedBlockedUids,
    ready: blockFilterReady,
  } = useWorldBlockFilter({ enabled, uid: myUid });
  const projectedBlockedUidSet = useMemo(
    () => new Set(projectedBlockedUids),
    [projectedBlockedUids],
  );
  useEffect(() => {
    if (!enabled || !myUid || !blockFilterReady) {
      setSignals([]);
      return undefined;
    }
    const ref = dbRef(rtdb, `signals/${myUid}`);
    const recentSignalsQuery = query(
      ref,
      orderByChild("at"),
      limitToLast(10),
    );
    const unsub = onValue(recentSignalsQuery, (snap) => {
      const value = snap.val() || {};
      const list = Object.entries(value)
        .map(([key, data]) => ({ key, ...data }))
        .filter((signal) => !projectedBlockedUidSet.has(signal.fromUid))
        .sort((a, b) => (a.at || 0) - (b.at || 0))
        .slice(-10);
      setSignals(list);
    });
    return () => unsub();
  }, [enabled, myUid, projectedBlockedUidSet, blockFilterReady]);

  const consume = useCallback(
    async (key) => {
      if (!myUid || !key) return;
      try {
        await remove(dbRef(rtdb, `signals/${myUid}/${key}`));
      } catch {}
    },
    [myUid],
  );

  return { signals, consume };
}
