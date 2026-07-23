import { useEffect, useRef, useState } from "react";
import {
  ref as dbRef,
  onValue,
  onDisconnect,
  runTransaction,
  set,
  serverTimestamp,
} from "firebase/database";
import { rtdb, auth } from "../firebase";
import {
  avatarAppearanceSignature,
  publicAvatarAppearance,
} from "./avatarAppearance";

const PRESENCE_HZ = 6;
const STALE_MS = 7000;
const DEFAULT_COLOR = "#f5c973";
const DEFAULT_WORLD_ROOM = "afterlight-market-garden-v1";
const ALLOWED_WORLD_ROOMS = new Set([DEFAULT_WORLD_ROOM]);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const INTENTS = new Set(["meet", "friends", "match", "solo"]);
const INVALID_REALTIME_KEY_CHARACTERS = [".", "#", "$", "[", "]", "/"];
const SAFE_SESSION_ID = /^[A-Za-z0-9_-]{16,128}$/;

function createPresenceSessionId() {
  const cryptoApi = window.crypto;
  if (!cryptoApi?.getRandomValues) return null;
  const bytes = new Uint8Array(24);
  cryptoApi.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

function publicPresenceProfile(profile) {
  return {
    name: String(profile?.name || "Wayfarer").slice(0, 22),
    color: HEX_COLOR.test(profile?.color) ? profile.color : DEFAULT_COLOR,
    intent: INTENTS.has(profile?.intent) ? profile.intent : "solo",
    appearance: publicAvatarAppearance(profile?.appearance),
  };
}

function publicRemotePresence(uid, data) {
  if (!data || typeof data !== "object") return null;
  const player = {
    uid,
    ...publicPresenceProfile(data),
    x: Number.isFinite(data.x) ? data.x : 0,
    z: Number.isFinite(data.z) ? data.z : 0,
    heading: Number.isFinite(data.heading) ? data.heading : 0,
    speed: Number.isFinite(data.speed) ? data.speed : 0,
    lastUpdate: Number.isFinite(data.lastUpdate) ? data.lastUpdate : 0,
  };
  if (data.emote && typeof data.emote === "object") player.emote = data.emote;
  if (data.say && typeof data.say === "object") player.say = data.say;
  return player;
}

function sessionValue(value, sessionId) {
  if (!value || typeof value !== "object") return undefined;
  return value.sessionId === sessionId ? null : undefined;
}

function isSafeRealtimeKey(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !INVALID_REALTIME_KEY_CHARACTERS.some((character) =>
      value.includes(character),
    )
  );
}

// Publishes one session-bound presence row and consumes only the server-owned
// roster for this viewer. The client never reads a room's presence parent.
export function usePresence({
  snapshotRef,
  extrasRef,
  profile,
  enabled = true,
  currentRoom = DEFAULT_WORLD_ROOM,
}) {
  const [remotePlayers, setRemotePlayers] = useState([]);
  const [myUid] = useState(auth.currentUser?.uid || null);
  const [connectionReady, setConnectionReady] = useState(false);
  const lastWriteRef = useRef({ x: 0, z: 0, heading: 0, speed: 0, at: 0 });
  const hasWrittenRef = useRef(false);
  const writeInFlightRef = useRef(false);
  const profileRef = useRef(null);
  const forceProfileWriteRef = useRef(false);
  const sessionIdRef = useRef(null);
  const appearanceSignature = avatarAppearanceSignature(profile?.appearance);
  const profileAvailable = Boolean(profile);
  const roomAllowed = ALLOWED_WORLD_ROOMS.has(currentRoom);

  useEffect(() => {
    profileRef.current = profile ? publicPresenceProfile(profile) : null;
    forceProfileWriteRef.current = true;
  }, [profile, appearanceSignature]);

  useEffect(() => {
    setConnectionReady(false);
    if (!enabled || !roomAllowed || !myUid || !profileRef.current) {
      return undefined;
    }

    const membershipRef = dbRef(
      rtdb,
      `worldRoomMemberships/${currentRoom}/${myUid}`,
    );
    const myPresenceRef = dbRef(rtdb, `presence/${currentRoom}/${myUid}`);
    const connectedRef = dbRef(rtdb, ".info/connected");
    let active = true;
    let generation = 0;
    let currentDisconnectGuard = null;
    let currentDisconnectRef = null;

    const writeNow = async (force = false, expectedSessionId = null) => {
      const sessionId = expectedSessionId || sessionIdRef.current;
      const snapshot = snapshotRef.current;
      const publicProfile = profileRef.current;
      if (
        !active ||
        !sessionId ||
        !snapshot ||
        !publicProfile ||
        writeInFlightRef.current
      ) {
        return false;
      }

      const extras = extrasRef?.current || {};
      const last = lastWriteRef.current;
      const moved =
        Math.hypot(snapshot.x - last.x, snapshot.z - last.z) > 0.04 ||
        Math.abs(snapshot.heading - last.heading) > 0.04 ||
        Math.abs(snapshot.speed - last.speed) > 0.1;
      const extrasChanged =
        (extras.emote?.at || 0) !== (last.emoteAt || 0) ||
        (extras.say?.at || 0) !== (last.sayAt || 0);
      const stale = Date.now() - last.at > 4000;
      if (
        !force &&
        hasWrittenRef.current &&
        !forceProfileWriteRef.current &&
        !moved &&
        !extrasChanged &&
        !stale
      ) {
        return true;
      }

      const payload = {
        ...publicProfile,
        sessionId,
        x: snapshot.x,
        z: snapshot.z,
        heading: snapshot.heading,
        speed: snapshot.speed,
        lastUpdate: serverTimestamp(),
      };
      if (extras.emote) payload.emote = extras.emote;
      if (extras.say) payload.say = extras.say;

      writeInFlightRef.current = true;
      try {
        await set(myPresenceRef, payload);
        if (!active || sessionIdRef.current !== sessionId) return false;
        lastWriteRef.current = {
          ...snapshot,
          at: Date.now(),
          emoteAt: extras.emote?.at || 0,
          sayAt: extras.say?.at || 0,
        };
        hasWrittenRef.current = true;
        forceProfileWriteRef.current = false;
        return true;
      } catch (error) {
        if (!hasWrittenRef.current) {
          console.warn(
            "[presence] write failed (multiplayer disabled):",
            error.message,
          );
        }
        return false;
      } finally {
        writeInFlightRef.current = false;
      }
    };

    const connectSession = async () => {
      const attempt = ++generation;
      setConnectionReady(false);
      sessionIdRef.current = null;
      hasWrittenRef.current = false;
      const sessionId = createPresenceSessionId();
      if (!sessionId) {
        console.warn("[presence] secure session creation is unavailable.");
        return;
      }
      const disconnectRef = dbRef(
        rtdb,
        `worldRoomDisconnects/${currentRoom}/${myUid}/${sessionId}`,
      );
      const disconnectGuard = onDisconnect(disconnectRef);
      currentDisconnectGuard = disconnectGuard;
      currentDisconnectRef = disconnectRef;

      try {
        // The session-specific disconnect marker is armed first. Its trusted
        // trigger removes presence only if this session still owns membership,
        // so an old tab cannot erase a newer reconnect.
        await disconnectGuard.set(true);
        if (!active || attempt !== generation) return;
        await set(membershipRef, {
          sessionId,
          joinedAt: serverTimestamp(),
        });
        if (!active || attempt !== generation) return;
        sessionIdRef.current = sessionId;
        lastWriteRef.current = { x: 0, z: 0, heading: 0, speed: 0, at: 0 };
        forceProfileWriteRef.current = true;
        if (active && attempt === generation) {
          setConnectionReady(true);
        }
        await writeNow(true, sessionId);
      } catch (error) {
        if (active && attempt === generation) {
          sessionIdRef.current = null;
          setConnectionReady(false);
          console.warn("[presence] session join failed:", error.message);
        }
      }
    };

    const unsubscribeConnected = onValue(
      connectedRef,
      (snapshot) => {
        if (snapshot.val() === true) {
          void connectSession();
          return;
        }
        generation += 1;
        sessionIdRef.current = null;
        hasWrittenRef.current = false;
        setConnectionReady(false);
      },
      (error) => {
        generation += 1;
        sessionIdRef.current = null;
        setConnectionReady(false);
        console.warn("[presence] connection state unavailable:", error.message);
      },
    );
    const writeTimer = setInterval(() => {
      void writeNow();
    }, 1000 / PRESENCE_HZ);

    return () => {
      const leavingSessionId = sessionIdRef.current;
      active = false;
      generation += 1;
      unsubscribeConnected();
      clearInterval(writeTimer);
      sessionIdRef.current = null;
      hasWrittenRef.current = false;
      currentDisconnectGuard?.cancel().catch(() => {});
      if (leavingSessionId) {
        void runTransaction(
          myPresenceRef,
          (value) => sessionValue(value, leavingSessionId),
          { applyLocally: false },
        )
          .catch(() => {})
          .finally(() =>
            runTransaction(
              membershipRef,
              (value) => sessionValue(value, leavingSessionId),
              { applyLocally: false },
            ).catch(() => {}),
          );
      }
      if (currentDisconnectRef) {
        set(currentDisconnectRef, null).catch(() => {});
      }
    };
  }, [
    enabled,
    roomAllowed,
    myUid,
    profileAvailable,
    currentRoom,
    snapshotRef,
    extrasRef,
  ]);

  useEffect(() => {
    setRemotePlayers([]);
    if (!enabled || !roomAllowed || !connectionReady || !myUid) {
      return undefined;
    }

    const entries = new Map();
    const desiredSessions = new Map();
    const retryTimers = new Map();
    const retryAttempts = new Map();
    const publish = () => {
      const now = Date.now();
      const players = [];
      entries.forEach((entry, uid) => {
        const data = entry.data;
        if (
          !data ||
          data.sessionId !== entry.sessionId ||
          !Number.isFinite(data.lastUpdate) ||
          now - data.lastUpdate > STALE_MS
        ) {
          return;
        }
        const player = publicRemotePresence(uid, data);
        if (player) players.push(player);
      });
      setRemotePlayers(players);
    };
    const clearEntry = (uid) => {
      const entry = entries.get(uid);
      entry?.unsubscribe?.();
      entries.delete(uid);
    };
    const clearAll = () => {
      retryTimers.forEach(clearTimeout);
      retryTimers.clear();
      retryAttempts.clear();
      desiredSessions.clear();
      [...entries.keys()].forEach(clearEntry);
      setRemotePlayers([]);
    };
    const subscribeLeaf = (uid, sessionId) => {
      if (entries.has(uid) || desiredSessions.get(uid) !== sessionId) return;
      const entry = { sessionId, data: null, unsubscribe: null };
      entries.set(uid, entry);
      const leafRef = dbRef(rtdb, `presence/${currentRoom}/${uid}`);
      const unsubscribe = onValue(
        leafRef,
        (leafSnapshot) => {
          const data = leafSnapshot.val();
          entry.data = data && data.sessionId === sessionId ? data : null;
          retryAttempts.delete(uid);
          publish();
        },
        (error) => {
          console.warn("[presence] leaf subscribe failed:", error.message);
          clearEntry(uid);
          publish();
          if (desiredSessions.get(uid) !== sessionId) return;
          const attempt = (retryAttempts.get(uid) || 0) + 1;
          retryAttempts.set(uid, attempt);
          const retryTimer = setTimeout(() => {
            retryTimers.delete(uid);
            subscribeLeaf(uid, sessionId);
          }, Math.min(8000, 500 * 2 ** Math.min(attempt - 1, 4)));
          retryTimers.set(uid, retryTimer);
        },
      );
      entry.unsubscribe = unsubscribe;
      if (!entries.has(uid)) unsubscribe();
    };
    const rosterRef = dbRef(
      rtdb,
      `worldPresenceViews/${myUid}/${currentRoom}`,
    );
    const unsubscribeRoster = onValue(
      rosterRef,
      (snapshot) => {
        const value = snapshot.val();
        const roster =
          value && typeof value === "object" && !Array.isArray(value)
            ? value
            : {};
        const desired = new Map();
        Object.entries(roster).forEach(([uid, sessionId]) => {
          if (
            uid !== myUid &&
            isSafeRealtimeKey(uid) &&
            typeof sessionId === "string" &&
            SAFE_SESSION_ID.test(sessionId)
          ) {
            desired.set(uid, sessionId);
          }
        });

        desiredSessions.forEach((sessionId, uid) => {
          if (desired.get(uid) !== sessionId) {
            const retryTimer = retryTimers.get(uid);
            if (retryTimer) clearTimeout(retryTimer);
            retryTimers.delete(uid);
            retryAttempts.delete(uid);
          }
        });
        desiredSessions.clear();
        desired.forEach((sessionId, uid) => {
          desiredSessions.set(uid, sessionId);
        });
        entries.forEach((entry, uid) => {
          if (desired.get(uid) !== entry.sessionId) clearEntry(uid);
        });
        desired.forEach((sessionId, uid) => {
          subscribeLeaf(uid, sessionId);
        });
        publish();
      },
      (error) => {
        console.warn("[presence] roster subscribe failed:", error.message);
        clearAll();
      },
    );
    const staleTimer = setInterval(publish, 1000);

    return () => {
      unsubscribeRoster();
      clearInterval(staleTimer);
      clearAll();
    };
  }, [enabled, roomAllowed, connectionReady, myUid, currentRoom]);

  return { remotePlayers, myUid };
}
