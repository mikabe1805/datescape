import { useEffect, useRef, useState } from "react";
import {
  ref as dbRef,
  onValue,
  onDisconnect,
  set,
  serverTimestamp,
  remove,
} from "firebase/database";
import { rtdb, auth } from "../firebase";

const PRESENCE_HZ = 6; // writes per second
const STALE_MS = 7000;

// Subscribes to /presence and writes my own presence at ~PRESENCE_HZ.
// Returns: { remotePlayers: [{uid,name,color,x,z,heading,speed,lastUpdate}], myUid }
// snapshotRef is the local player {x,z,heading,speed} — read each tick.
// extrasRef (optional) is read each write and included as extra fields (emote, say).
export function usePresence({ snapshotRef, extrasRef, profile, enabled = true, currentRoom = "ember-plaza" }) {
  const [remotePlayers, setRemotePlayers] = useState([]);
  const [myUid, setMyUid] = useState(auth.currentUser?.uid || null);
  const lastWriteRef = useRef({ x: 0, z: 0, heading: 0, speed: 0, at: 0 });
  const timerRef = useRef(null);
  const hasWrittenRef = useRef(false);

  // Track auth changes
  useEffect(() => {
    setMyUid(auth.currentUser?.uid || null);
  }, []);

  // Subscribe to all presences
  useEffect(() => {
    if (!enabled) return undefined;
    const presenceRef = dbRef(rtdb, `presence/${currentRoom}`);
    const unsub = onValue(
      presenceRef,
      (snap) => {
        const value = snap.val() || {};
        const now = Date.now();
        const list = [];
        for (const [uid, data] of Object.entries(value)) {
          if (!data || uid === myUid) continue;
          if (data.lastUpdate && now - data.lastUpdate > STALE_MS) continue;
          list.push({ uid, ...data });
        }
        setRemotePlayers(list);
      },
      (err) => {
        console.warn("[presence] subscribe failed:", err.message);
      }
    );
    return () => unsub();
  }, [enabled, myUid, currentRoom]);

  // Write own presence at fixed interval
  useEffect(() => {
    if (!enabled || !myUid || !profile) return undefined;

    const myRef = dbRef(rtdb, `presence/${currentRoom}/${myUid}`);

    // Initial write + onDisconnect cleanup
    onDisconnect(myRef)
      .remove()
      .catch((err) => console.warn("[presence] onDisconnect failed:", err.message));

    const writeNow = () => {
      const snap = snapshotRef.current;
      if (!snap) return;
      const extras = extrasRef?.current || {};
      const last = lastWriteRef.current;
      const moved =
        Math.hypot(snap.x - last.x, snap.z - last.z) > 0.04 ||
        Math.abs(snap.heading - last.heading) > 0.04 ||
        Math.abs(snap.speed - last.speed) > 0.1;
      const extrasChanged =
        (extras.emote?.at || 0) !== (last.emoteAt || 0) ||
        (extras.say?.at || 0) !== (last.sayAt || 0);
      const stale = Date.now() - last.at > 4000;
      if (!hasWrittenRef.current || moved || extrasChanged || stale) {
        const payload = {
          name: profile.name,
          color: profile.color,
          x: snap.x,
          z: snap.z,
          heading: snap.heading,
          speed: snap.speed,
          lastUpdate: serverTimestamp(),
        };
        if (extras.emote) payload.emote = extras.emote;
        if (extras.say) payload.say = extras.say;
        set(myRef, payload).catch((err) => {
          if (!hasWrittenRef.current) {
            console.warn("[presence] write failed (multiplayer disabled):", err.message);
          }
        });
        lastWriteRef.current = {
          ...snap,
          at: Date.now(),
          emoteAt: extras.emote?.at || 0,
          sayAt: extras.say?.at || 0,
        };
        hasWrittenRef.current = true;
      }
    };

    writeNow();
    timerRef.current = setInterval(writeNow, 1000 / PRESENCE_HZ);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      remove(myRef).catch(() => {});
    };
  }, [enabled, myUid, profile, currentRoom, snapshotRef, extrasRef]);

  return { remotePlayers, myUid };
}
