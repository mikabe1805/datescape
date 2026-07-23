import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  limitToLast,
  onValue,
  orderByChild,
  query,
  ref as dbRef,
} from "firebase/database";
import { rtdb } from "../firebase";
import {
  createLanternkeeperExpedition,
  createLanternkeeperPersonalState,
  hydrateLanternkeeperExpedition,
  hydrateLanternkeeperExpeditionList,
  hydrateLanternkeeperPersonalState,
  lanternkeeperProgress,
  lanternkeeperRendererState,
  LANTERNKEEPER_EXPEDITION_ID,
} from "./lanternkeeperExpedition";
import {
  contributeLanternkeeperExpedition,
  getLanternkeeperExpedition,
  joinLanternkeeperExpedition,
  leaveLanternkeeperExpedition,
  listLanternkeeperExpeditions,
  startLanternkeeperExpedition,
} from "./lanternkeeperExpeditionBridge";

function makeActionId(action, counter) {
  const nonce = window.crypto?.randomUUID?.() || `${Date.now()}:${counter}`;
  return `lanternkeeper:${action}:${nonce}`;
}

export function useLanternkeeperExpedition({
  enabled = true,
  sessionKey = null,
} = {}) {
  const [expeditions, setExpeditions] = useState([]);
  const [expedition, setExpedition] = useState(createLanternkeeperExpedition);
  const [personal, setPersonal] = useState(createLanternkeeperPersonalState);
  const [busyAction, setBusyAction] = useState(null);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now);
  const actionCounterRef = useRef(0);
  const mountedRef = useRef(true);
  const pendingRef = useRef(false);
  const activeRequestRef = useRef(null);
  const sessionKeyRef = useRef(sessionKey);
  const currentInstanceIdRef = useRef(null);
  const serverTimeOffsetRef = useRef(0);
  const fetchedRevisionRef = useRef(new Map());
  const latestRevisionRef = useRef(new Map());
  const staleRefreshRef = useRef(new Set());
  sessionKeyRef.current = sessionKey;
  currentInstanceIdRef.current = expedition.instanceId;

  const applyResponse = useCallback(function applyResult(result) {
    if (!mountedRef.current) return result || {};
    if (result?.expedition) {
      const next = hydrateLanternkeeperExpedition(result.expedition);
      const knownRevision = latestRevisionRef.current.get(next.instanceId) || 0;
      const stale = next.revision < knownRevision;
      if (!stale) {
        latestRevisionRef.current.set(next.instanceId, next.revision);
        setExpedition((current) =>
          current.instanceId === next.instanceId &&
          current.revision > next.revision
            ? current
            : next,
        );
      }
      setExpeditions((current) => {
        const existing = current.find(
          (entry) => entry.instanceId === next.instanceId,
        );
        const preferred =
          existing && existing.revision > next.revision ? existing : next;
        const without = current.filter(
          (entry) => entry.instanceId !== next.instanceId,
        );
        return hydrateLanternkeeperExpeditionList([preferred, ...without]);
      });
      if (
        result?.personal &&
        !stale &&
        result.personal.instanceId === next.instanceId
      ) {
        setPersonal(hydrateLanternkeeperPersonalState(result.personal));
      } else if (result?.personal && stale) {
        const refreshKey = `${next.instanceId}:${knownRevision}`;
        if (!staleRefreshRef.current.has(refreshKey)) {
          staleRefreshRef.current.add(refreshKey);
          const requestSessionKey = sessionKeyRef.current;
          void getLanternkeeperExpedition(next.instanceId).then((fresh) => {
            staleRefreshRef.current.delete(refreshKey);
            if (
              mountedRef.current &&
              sessionKeyRef.current === requestSessionKey
            ) {
              applyResult(fresh);
            }
          });
        }
      }
    } else if (result?.personal) {
      const nextPersonal = hydrateLanternkeeperPersonalState(result.personal);
      if (nextPersonal.instanceId === currentInstanceIdRef.current) {
        setPersonal(nextPersonal);
      }
    }
    if (result?.error) setError(result.error);
    return result || {};
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRequestRef.current = null;
      pendingRef.current = false;
    };
  }, []);

  const loadInstance = useCallback(
    async (instanceId, requestSessionKey = sessionKey) => {
      if (!enabled || !instanceId) return null;
      const result = await getLanternkeeperExpedition(instanceId);
      if (
        !mountedRef.current ||
        sessionKeyRef.current !== requestSessionKey
      ) {
        return null;
      }
      applyResponse(result);
      return result;
    },
    [applyResponse, enabled, sessionKey],
  );

  useEffect(() => {
    pendingRef.current = false;
    activeRequestRef.current = null;
    fetchedRevisionRef.current = new Map();
    latestRevisionRef.current = new Map();
    staleRefreshRef.current = new Set();
    setBusyAction(null);
    setError(null);
    setExpeditions([]);
    setExpedition(createLanternkeeperExpedition());
    setPersonal(createLanternkeeperPersonalState());
  }, [enabled, sessionKey]);

  useEffect(() => {
    if (!enabled) return undefined;
    const unsubscribe = onValue(
      dbRef(rtdb, ".info/serverTimeOffset"),
      (snapshot) => {
        const offset = Number(snapshot.val());
        serverTimeOffsetRef.current = Number.isFinite(offset) ? offset : 0;
        setNow(Date.now() + serverTimeOffsetRef.current);
      },
    );
    return unsubscribe;
  }, [enabled, sessionKey]);

  useEffect(() => {
    if (!enabled) return undefined;
    const currentNow = Math.max(
      now,
      Date.now() + serverTimeOffsetRef.current,
    );
    const deadlines = [
      expedition.echoAvailableAt,
      expedition.expiresAt,
      ...expeditions.map((entry) => entry.expiresAt),
    ]
      .filter((deadline) => Number.isFinite(deadline) && deadline > currentNow)
      .sort((first, second) => first - second);
    if (!deadlines.length) return undefined;
    const delay = Math.min(2_147_000_000, deadlines[0] - currentNow + 25);
    const timer = window.setTimeout(
      () => setNow(Date.now() + serverTimeOffsetRef.current),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [
    enabled,
    expedition.echoAvailableAt,
    expedition.expiresAt,
    expeditions,
    now,
    sessionKey,
  ]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let receivedLiveSnapshot = false;
    const publicRef = dbRef(
      rtdb,
      `worldExpeditions/${LANTERNKEEPER_EXPEDITION_ID}/public`,
    );
    const publicBoardQuery = query(
      publicRef,
      orderByChild("startedAt"),
      limitToLast(12),
    );
    const unsubscribe = onValue(
      publicBoardQuery,
      (snapshot) => {
        if (cancelled) return;
        receivedLiveSnapshot = true;
        const next = hydrateLanternkeeperExpeditionList(snapshot.val());
        next.forEach((entry) => {
          const known = latestRevisionRef.current.get(entry.instanceId) || 0;
          if (entry.revision >= known) {
            latestRevisionRef.current.set(entry.instanceId, entry.revision);
          }
        });
        setExpeditions(next);
        const activeId = currentInstanceIdRef.current;
        if (activeId) {
          const live = next.find((entry) => entry.instanceId === activeId);
          if (live) {
            setExpedition((current) =>
              current.instanceId === live.instanceId &&
              current.revision > live.revision
                ? current
                : live,
            );
          }
        }
      },
      (subscriptionError) => {
        if (!cancelled) setError(subscriptionError.message);
      },
    );

    listLanternkeeperExpeditions().then(async (result) => {
      if (cancelled || sessionKeyRef.current !== sessionKey) return;
      if (!receivedLiveSnapshot && result?.expeditions) {
        setExpeditions(hydrateLanternkeeperExpeditionList(result.expeditions));
      }
      if (result?.error) setError(result.error);
      if (result?.personalInstanceId) {
        await loadInstance(result.personalInstanceId, sessionKey);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled, loadInstance, sessionKey]);

  // The public board is intentionally bounded, but a busy district can push a
  // still-active party outside its newest twelve rows. Keep exactly one
  // additional listener for the selected route so teammate revisions remain
  // live without reopening the unbounded collection subscription.
  useEffect(() => {
    const instanceId = expedition.instanceId;
    if (!enabled || !instanceId) return undefined;
    const selectedRef = dbRef(
      rtdb,
      `worldExpeditions/${LANTERNKEEPER_EXPEDITION_ID}/public/${instanceId}`,
    );
    return onValue(
      selectedRef,
      (snapshot) => {
        const value = snapshot.val();
        if (value) applyResponse({ expedition: value });
      },
      (subscriptionError) => setError(subscriptionError.message),
    );
  }, [applyResponse, enabled, expedition.instanceId, sessionKey]);

  // Public revisions can advance because another party member acted. Refresh
  // the private projection once per revision so available targets and quest
  // reconciliation stay current after reconnects and co-op actions.
  useEffect(() => {
    const instanceId = expedition.instanceId;
    if (!enabled || !instanceId || !personal.joined) return;
    const fetchedRevision = fetchedRevisionRef.current.get(instanceId);
    if (fetchedRevision === expedition.revision) return;
    fetchedRevisionRef.current.set(instanceId, expedition.revision);
    void loadInstance(instanceId, sessionKey).then((result) => {
      if (result?.error) fetchedRevisionRef.current.delete(instanceId);
    });
  }, [
    enabled,
    expedition.instanceId,
    expedition.revision,
    loadInstance,
    personal.joined,
    sessionKey,
  ]);

  const runMutation = useCallback(
    async (action, invoke) => {
      if (!enabled || pendingRef.current) return { ignored: true };
      const requestToken = {};
      const requestSessionKey = sessionKey;
      pendingRef.current = true;
      activeRequestRef.current = requestToken;
      setBusyAction(action);
      setError(null);
      try {
        const result = await invoke();
        if (
          activeRequestRef.current !== requestToken ||
          !mountedRef.current ||
          sessionKeyRef.current !== requestSessionKey
        ) {
          return { ignored: true };
        }
        return applyResponse(result);
      } catch (unexpectedError) {
        if (
          activeRequestRef.current !== requestToken ||
          !mountedRef.current ||
          sessionKeyRef.current !== requestSessionKey
        ) {
          return { ignored: true };
        }
        const message =
          unexpectedError instanceof Error
            ? unexpectedError.message
            : "The expedition could not connect.";
        setError(message);
        return { error: message };
      } finally {
        if (activeRequestRef.current === requestToken) {
          activeRequestRef.current = null;
          pendingRef.current = false;
          setBusyAction(null);
        }
      }
    },
    [applyResponse, enabled, sessionKey],
  );

  const start = useCallback(
    () =>
      runMutation("start", () =>
        startLanternkeeperExpedition(
          makeActionId("start", actionCounterRef.current++),
        ),
      ),
    [runMutation],
  );

  const join = useCallback(
    (instanceId) => {
      const target = expeditions.find(
        (entry) => entry.instanceId === instanceId,
      );
      return runMutation("join", () =>
        joinLanternkeeperExpedition(
          instanceId,
          makeActionId("join", actionCounterRef.current++),
          target?.revision || 0,
        ),
      );
    },
    [expeditions, runMutation],
  );

  const leave = useCallback(
    () =>
      runMutation("leave", () =>
        leaveLanternkeeperExpedition(
          expedition.instanceId,
          makeActionId("leave", actionCounterRef.current++),
          expedition.revision,
        ),
      ),
    [expedition.instanceId, expedition.revision, runMutation],
  );

  const contribute = useCallback(
    (targetId) =>
      runMutation(`contribute:${targetId}`, () =>
        contributeLanternkeeperExpedition(
          expedition.instanceId,
          targetId,
          makeActionId(targetId, actionCounterRef.current++),
          expedition.revision,
        ),
      ),
    [expedition.instanceId, expedition.revision, runMutation],
  );

  const progress = useMemo(
    () => lanternkeeperProgress(expedition, personal, now),
    [expedition, now, personal],
  );
  const rendererState = useMemo(
    () => lanternkeeperRendererState(expedition, personal, now),
    [expedition, now, personal],
  );

  return {
    ...progress,
    expeditions,
    rendererState,
    busyAction,
    error,
    start,
    join,
    leave,
    contribute,
    refresh: () => loadInstance(expedition.instanceId, sessionKey),
    serverTimeOffset: serverTimeOffsetRef.current,
  };
}
