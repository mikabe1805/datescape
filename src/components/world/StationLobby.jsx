import { useEffect, useMemo, useState } from "react";

// Lobby shown when the player joins a two-person activity station.
// Chess can fall back to its host NPC; consent activities wait for a person.
export default function StationLobby({
  stationName,
  mode = "chess",
  npcName,
  myUid,
  seats,
  match,
  waitTimeoutMs = 25000,
  onCancel,
  onPlayNpc,
  onMatchReady,
  echoAvailableAt = null,
  echoServerNow = null,
  echoBusy = false,
  echoError = null,
  error = null,
  onEcho,
  onEchoRetry,
}) {
  const [waitedMs, setWaitedMs] = useState(0);
  const [echoNow, setEchoNow] = useState(Date.now);
  const [echoDeadline, setEchoDeadline] = useState(null);
  const isSocial = mode === "social";
  const isResonance = mode === "resonance";
  const isConsentActivity = isSocial || isResonance;

  useEffect(() => {
    setWaitedMs(0);
    const start = Date.now();
    const id = setInterval(() => setWaitedMs(Date.now() - start), 250);
    return () => clearInterval(id);
  }, [mode, stationName]);

  const seatList = useMemo(
    () =>
      Object.entries(seats || {})
        .map(([uid, data]) => ({ uid, ...data }))
        .sort((a, b) => (a.sitAt || 0) - (b.sitAt || 0)),
    [seats],
  );

  const otherPlayer = seatList.find((seat) => seat.uid !== myUid);
  const otherCount = seatList.filter((seat) => seat.uid !== myUid).length;
  const overTime = waitedMs > waitTimeoutMs;
  const matchIncludesMe = Boolean(
    match && myUid && (match.white === myUid || match.black === myUid),
  );

  useEffect(() => {
    const clientNow = Date.now();
    if (!Number.isFinite(echoAvailableAt)) {
      setEchoDeadline(null);
      setEchoNow(clientNow);
      return;
    }
    const trustedNow = Number.isFinite(echoServerNow)
      ? echoServerNow
      : clientNow;
    setEchoDeadline(
      clientNow + Math.max(0, echoAvailableAt - trustedNow),
    );
    setEchoNow(clientNow);
  }, [echoAvailableAt, echoServerNow]);

  const echoEligible = Boolean(
    isResonance &&
      !otherPlayer &&
      !match?.id &&
      typeof onEcho === "function" &&
      Number.isFinite(echoDeadline),
  );
  const echoSecondsRemaining = echoEligible
    ? Math.max(0, Math.ceil((echoDeadline - echoNow) / 1000))
    : 0;
  const echoReady = echoEligible && echoSecondsRemaining === 0;
  const echoCanRetry = Boolean(
    isResonance &&
      !otherPlayer &&
      !match?.id &&
      echoError &&
      !Number.isFinite(echoAvailableAt) &&
      typeof onEchoRetry === "function",
  );

  useEffect(() => {
    if (!echoEligible || echoReady) return undefined;
    setEchoNow(Date.now());
    const timer = window.setInterval(() => setEchoNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [echoEligible, echoReady]);

  useEffect(() => {
    if (!match) return;
    if (match.white && match.black && match.id && matchIncludesMe) {
      onMatchReady?.(match);
    }
  }, [match, matchIncludesMe, onMatchReady]);

  const eyebrow = isResonance
    ? "Resonance Garden · cooperative duet"
    : "Lantern Market · shared moment";

  const pairStatus = match?.id
    ? isResonance
      ? "Waking the Loom for both of you..."
      : isSocial
        ? "Opening a prompt for both of you..."
        : "Setting up the board..."
    : isResonance
      ? "You found each other. The first pulse is rising..."
      : isSocial
        ? "You found each other. Opening the prompt..."
        : "Match found! Setting up...";

  return (
    <div
      className={`station-lobby${isConsentActivity ? " station-lobby--social" : ""}${isResonance ? " station-lobby--resonance" : ""}`}
    >
      {isConsentActivity && (
        <div className="station-lobby__eyebrow">{eyebrow}</div>
      )}
      <div className="station-lobby__title">{stationName}</div>
      {otherPlayer ? (
        <>
          <div className="station-lobby__pair">
            <div className="station-lobby__seat">
              <div
                className="station-lobby__avatar"
                style={{ background: seatList[0]?.color || "#f5c973" }}
              />
              <div className="station-lobby__name">
                {seatList[0]?.uid === myUid
                  ? "You"
                  : seatList[0]?.name || "Guest"}
              </div>
            </div>
            <div className="station-lobby__vs">
              {isConsentActivity ? "with" : "vs"}
            </div>
            <div className="station-lobby__seat">
              <div
                className="station-lobby__avatar"
                style={{ background: seatList[1]?.color || "#99b4ff" }}
              />
              <div className="station-lobby__name">
                {seatList[1]?.uid === myUid
                  ? "You"
                  : seatList[1]?.name || "Guest"}
              </div>
            </div>
          </div>
          <div className="station-lobby__status">
            {match?.id && !matchIncludesMe
              ? isResonance
                ? "The Loom is in use. You are next if you choose to stay."
                : isSocial
                  ? "This circle is in use. You are next if you choose to stay."
                  : "The current round is finishing. You are next in line."
              : pairStatus}
          </div>
          {otherCount > 1 && (
            <div className="station-lobby__hint">
              {isResonance
                ? `${otherCount} others are waiting. The Loom makes one duet at a time.`
                : isSocial
                  ? `${otherCount} others are waiting. The Crescent pairs people two at a time.`
                  : `${otherCount} others waiting. Next round queues up after this match.`}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="station-lobby__pulse">
            <div className="station-lobby__pulse-dot" />
            <div className="station-lobby__pulse-dot" />
            <div className="station-lobby__pulse-dot" />
          </div>
          <div className="station-lobby__status">
            {isResonance
              ? "Listening for one more light..."
              : isSocial
                ? "Waiting for one person to join..."
                : "Waiting for another player..."}
          </div>
          <div className="station-lobby__hint">
            {isResonance
              ? "Choose and time three tones together. There is no winning or compatibility score, and either person can leave at any time."
              : isSocial
                ? "This is a two-person, guided conversation. Share only what feels comfortable; you can leave at any time."
                : "Other players in the plaza will see your seat and can join."}
          </div>
          {echoEligible && (
            <div className="station-lobby__echo" role="status" aria-live="polite">
              <strong>
                {echoReady
                  ? "Echo guide ready"
                  : `Echo guide in ${echoSecondsRemaining}s`}
              </strong>
              <span>
                Finish this quest objective alone for identical quest credit.
                Echo creates no shared encounter or matching prompt.
              </span>
            </div>
          )}
          {echoError && (
            <p className="station-lobby__echo-error" role="alert">
              {echoError}
            </p>
          )}
          {isConsentActivity && overTime && !echoEligible && !error && (
            <div
              className="station-lobby__wait-note"
              role="status"
              aria-live="polite"
            >
              <strong>No one else has joined yet.</strong>
              <span>
                You can keep waiting, or return to the district and try another
                activity. No choice has been recorded.
              </span>
            </div>
          )}
        </>
      )}

      {error && (
        <div className="station-lobby__connection-error" role="alert">
          <strong>The queue lost its connection.</strong>
          <span>
            Return to the district, then enter this activity again to retry.
          </span>
        </div>
      )}

      <div className="station-lobby__actions">
        {echoCanRetry && (
          <button
            type="button"
            className="station-lobby__btn station-lobby__btn--primary"
            onClick={onEchoRetry}
            disabled={echoBusy}
          >
            {echoBusy ? "Finding the Echo…" : "Retry Echo guide"}
          </button>
        )}
        {echoEligible && (
          <button
            type="button"
            className="station-lobby__btn station-lobby__btn--primary"
            onClick={onEcho}
            disabled={!echoReady || echoBusy}
          >
            {echoBusy
              ? "Following Echo…"
              : echoReady
                ? "Follow the Echo alone"
                : `Echo available in ${echoSecondsRemaining}s`}
          </button>
        )}
        {!isConsentActivity && !otherPlayer && npcName && (
          <button
            type="button"
            className="station-lobby__btn station-lobby__btn--primary"
            onClick={onPlayNpc}
            disabled={!overTime}
            title={overTime ? "Play the NPC instead" : "Available after 25s"}
          >
            {overTime
              ? `Play ${npcName} instead`
              : `Play ${npcName} in ${Math.ceil((waitTimeoutMs - waitedMs) / 1000)}s`}
          </button>
        )}
        <button type="button" className="station-lobby__btn" onClick={onCancel}>
          {isConsentActivity
            ? overTime || error
              ? "Return to district"
              : "Leave the queue"
            : "Stand up"}
        </button>
      </div>
    </div>
  );
}
