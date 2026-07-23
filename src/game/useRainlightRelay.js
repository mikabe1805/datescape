import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onValue, ref as dbRef } from "firebase/database";
import { rtdb } from "../firebase";
import {
  createRainlightRelayState,
  hydrateRainlightPersonalState,
  hydrateRainlightRelayState,
  RAINLIGHT_RELAY_ID,
  RAINLIGHT_ROOM_ID,
  selectRainlightRelayProgress,
} from "./rainlightRelay";
import {
  contributeRainlightRelay,
  loadRainlightRelay,
} from "./rainlightRelayBridge";

function actionId(sourceId, counter) {
  const nonce = window.crypto?.randomUUID?.() || `${Date.now()}:${counter}`;
  return `rainlight:${sourceId}:${nonce}`;
}

export function useRainlightRelay({ enabled = true, sessionKey = null } = {}) {
  const [eventState, setEventState] = useState(createRainlightRelayState);
  const [personalState, setPersonalState] = useState(() =>
    hydrateRainlightPersonalState(null),
  );
  const [busySourceId, setBusySourceId] = useState(null);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now);
  const actionCounterRef = useRef(0);
  const contributionPendingRef = useRef(false);
  const activeContributionTokenRef = useRef(null);
  const serverTimeOffsetRef = useRef(0);
  const sessionKeyRef = useRef(sessionKey);
  sessionKeyRef.current = sessionKey;

  useEffect(() => {
    contributionPendingRef.current = false;
    activeContributionTokenRef.current = null;
    setBusySourceId(null);
    setError(null);
    setPersonalState(hydrateRainlightPersonalState(null));
    if (!enabled) setEventState(createRainlightRelayState());
  }, [enabled, sessionKey]);

  useEffect(() => {
    if (!enabled) return undefined;
    const unsubscribe = onValue(dbRef(rtdb, ".info/serverTimeOffset"), (snapshot) => {
      const offset = Number(snapshot.val());
      serverTimeOffsetRef.current = Number.isFinite(offset) ? offset : 0;
      setNow(Date.now() + serverTimeOffsetRef.current);
    });
    return unsubscribe;
  }, [enabled, sessionKey]);

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = window.setInterval(
      () => setNow(Date.now() + serverTimeOffsetRef.current),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [enabled, sessionKey]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let receivedLiveSnapshot = false;
    const eventRef = dbRef(
      rtdb,
      `worldEvents/${RAINLIGHT_ROOM_ID}/${RAINLIGHT_RELAY_ID}/public`,
    );
    const unsubscribe = onValue(
      eventRef,
      (snapshot) => {
        if (!cancelled && snapshot.exists()) {
          receivedLiveSnapshot = true;
          setEventState(
            hydrateRainlightRelayState(
              snapshot.val(),
              Date.now() + serverTimeOffsetRef.current,
            ),
          );
        }
      },
      (subscriptionError) => {
        if (!cancelled) setError(subscriptionError.message);
      },
    );
    loadRainlightRelay().then((result) => {
      if (cancelled) return;
      if (result.event && !receivedLiveSnapshot) {
        setEventState(
          hydrateRainlightRelayState(
            result.event,
            Date.now() + serverTimeOffsetRef.current,
          ),
        );
      }
      if (result.personal) {
        setPersonalState(hydrateRainlightPersonalState(result.personal));
      }
      if (result.error) setError(result.error);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled, sessionKey]);

  const contribute = useCallback(
    async (sourceId) => {
      if (!enabled || contributionPendingRef.current) return { ignored: true };
      const requestSessionKey = sessionKey;
      const requestToken = {};
      contributionPendingRef.current = true;
      activeContributionTokenRef.current = requestToken;
      setBusySourceId(sourceId);
      setError(null);
      try {
        const result = await contributeRainlightRelay(
          sourceId,
          actionId(sourceId, actionCounterRef.current++),
        );
        if (
          sessionKeyRef.current !== requestSessionKey ||
          activeContributionTokenRef.current !== requestToken
        ) {
          return { ignored: true };
        }
        if (result.event) {
          setEventState(
            hydrateRainlightRelayState(
              result.event,
              Date.now() + serverTimeOffsetRef.current,
            ),
          );
        }
        if (result.personal) {
          setPersonalState(hydrateRainlightPersonalState(result.personal));
        }
        if (result.error) setError(result.error);
        return result;
      } catch (unexpectedError) {
        if (
          sessionKeyRef.current !== requestSessionKey ||
          activeContributionTokenRef.current !== requestToken
        ) {
          return { ignored: true };
        }
        const message =
          unexpectedError instanceof Error
            ? unexpectedError.message
            : "The Rainlight Relay could not connect.";
        setError(message);
        return { error: message };
      } finally {
        if (activeContributionTokenRef.current === requestToken) {
          activeContributionTokenRef.current = null;
          contributionPendingRef.current = false;
          setBusySourceId(null);
        }
      }
    },
    [enabled, sessionKey],
  );

  const progress = useMemo(
    () => selectRainlightRelayProgress(eventState, personalState, now),
    [eventState, now, personalState],
  );

  return {
    ...progress,
    busySourceId,
    error,
    contribute,
  };
}
