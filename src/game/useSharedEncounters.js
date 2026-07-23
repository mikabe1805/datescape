import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSharedEncounterActionId,
  listSharedEncounters,
  respondSharedEncounter,
  sanitizeSharedEncounter,
} from "./sharedEncounter";

function replaceEncounter(current, value) {
  const encounter = sanitizeSharedEncounter(value);
  if (!encounter) return current;
  const without = current.filter((entry) => entry.id !== encounter.id);
  return [encounter, ...without].sort(
    (first, second) => (second.createdAt || 0) - (first.createdAt || 0),
  );
}

export function useSharedEncounters({
  enabled = true,
  sessionKey = null,
  limit = 12,
} = {}) {
  const [encounters, setEncounters] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [busyEncounterId, setBusyEncounterId] = useState(null);
  const [error, setError] = useState(null);
  const mountedRef = useRef(false);
  const sessionKeyRef = useRef(sessionKey);
  const refreshTokenRef = useRef(null);
  const mutationTokenRef = useRef(null);
  const actionCounterRef = useRef(0);
  sessionKeyRef.current = sessionKey;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      refreshTokenRef.current = null;
      mutationTokenRef.current = null;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || sessionKeyRef.current !== sessionKey) {
      return { ignored: true, encounters: [] };
    }
    const token = {};
    const requestSessionKey = sessionKey;
    refreshTokenRef.current = token;
    setLoading(true);
    setError(null);
    let result;
    try {
      result = await listSharedEncounters({ limit });
    } catch {
      result = {
        encounters: [],
        error: "Shared moments are unavailable right now.",
      };
    }
    if (
      !mountedRef.current ||
      refreshTokenRef.current !== token ||
      sessionKeyRef.current !== requestSessionKey
    ) {
      return { ignored: true, encounters: [] };
    }
    refreshTokenRef.current = null;
    setLoading(false);
    if (result.error) setError(result.error);
    else setEncounters(result.encounters);
    return result;
  }, [enabled, limit, sessionKey]);

  useEffect(() => {
    refreshTokenRef.current = null;
    mutationTokenRef.current = null;
    setEncounters([]);
    setBusyEncounterId(null);
    setError(null);
    setLoading(Boolean(enabled));
    if (enabled) void refresh();
  }, [enabled, refresh, sessionKey]);

  const respond = useCallback(
    async (encounterId, response) => {
      if (
        !enabled ||
        sessionKeyRef.current !== sessionKey ||
        mutationTokenRef.current
      ) {
        return { ignored: true };
      }
      const actionId = createSharedEncounterActionId(
        response,
        actionCounterRef.current++,
      );
      if (!actionId) {
        const message = "Choose Spark or pass.";
        setError(message);
        return { error: message };
      }
      const token = {};
      const requestSessionKey = sessionKey;
      mutationTokenRef.current = token;
      setBusyEncounterId(encounterId);
      setError(null);
      let result;
      try {
        result = await respondSharedEncounter({
          encounterId,
          response,
          actionId,
        });
      } catch {
        result = {
          encounter: null,
          mutual: false,
          matchId: null,
          error: "Your choice could not be confirmed.",
        };
      }
      if (
        !mountedRef.current ||
        mutationTokenRef.current !== token ||
        sessionKeyRef.current !== requestSessionKey
      ) {
        return { ignored: true };
      }
      mutationTokenRef.current = null;
      setBusyEncounterId(null);
      if (result.error) setError(result.error);
      else if (result.encounter) {
        setEncounters((current) =>
          replaceEncounter(current, result.encounter),
        );
      }
      return result;
    },
    [enabled, sessionKey],
  );

  const sendSpark = useCallback(
    (encounterId) => respond(encounterId, "spark"),
    [respond],
  );
  const pass = useCallback(
    (encounterId) => respond(encounterId, "pass"),
    [respond],
  );
  const clearError = useCallback(() => setError(null), []);

  return {
    encounters,
    loading,
    busy: Boolean(busyEncounterId),
    busyEncounterId,
    error,
    refresh,
    respond,
    sendSpark,
    pass,
    clearError,
  };
}
