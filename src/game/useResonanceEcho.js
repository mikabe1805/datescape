import { useCallback, useEffect, useRef, useState } from "react";
import {
  completeResonanceEcho,
  createResonanceEchoClientState,
  pollResonanceEcho,
  startResonanceEcho,
} from "./resonanceEcho";

function actionId(kind, counter) {
  return `resonance-echo:${kind}:${Date.now().toString(36)}:${counter}`;
}

export function useResonanceEcho({
  enabled = true,
  sessionKey = null,
} = {}) {
  const [echo, setEcho] = useState(createResonanceEchoClientState);
  const [busyAction, setBusyAction] = useState(null);
  const [error, setError] = useState(null);
  const mountedRef = useRef(false);
  const sessionKeyRef = useRef(sessionKey);
  const requestTokenRef = useRef(null);
  const actionCounterRef = useRef(0);
  sessionKeyRef.current = sessionKey;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestTokenRef.current = null;
    };
  }, []);

  useEffect(() => {
    requestTokenRef.current = null;
    actionCounterRef.current = 0;
    setEcho(createResonanceEchoClientState());
    setBusyAction(null);
    setError(null);
  }, [enabled, sessionKey]);

  const run = useCallback(
    async (kind, invoke) => {
      if (
        !enabled ||
        sessionKeyRef.current !== sessionKey ||
        requestTokenRef.current
      ) {
        return { ignored: true };
      }
      const token = {};
      const requestSessionKey = sessionKey;
      requestTokenRef.current = token;
      setBusyAction(kind);
      setError(null);
      let result;
      try {
        result = await invoke();
      } catch {
        result = { error: "Resonance Echo is unavailable right now." };
      }
      if (
        !mountedRef.current ||
        requestTokenRef.current !== token ||
        sessionKeyRef.current !== requestSessionKey
      ) {
        return { ignored: true };
      }
      requestTokenRef.current = null;
      setBusyAction(null);
      if (result?.error) {
        setError(result.error);
      } else if (result?.echo) {
        setEcho(result.echo);
      }
      return result;
    },
    [enabled, sessionKey],
  );

  const start = useCallback(() => {
    const id = actionId("start", actionCounterRef.current++);
    return run("start", () => startResonanceEcho(id));
  }, [run]);

  const poll = useCallback(
    () => run("poll", () => pollResonanceEcho()),
    [run],
  );

  const complete = useCallback(() => {
    const id = actionId("complete", actionCounterRef.current++);
    return run("complete", () => completeResonanceEcho(id));
  }, [run]);

  const clear = useCallback(() => {
    requestTokenRef.current = null;
    setEcho(createResonanceEchoClientState());
    setBusyAction(null);
    setError(null);
  }, []);

  return {
    echo,
    busy: Boolean(busyAction),
    busyAction,
    error,
    start,
    poll,
    complete,
    clear,
  };
}
