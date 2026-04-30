import { useEffect, useMemo, useState } from "react";

// Lobby shown when the player sits at a multiplayer station.
// Modes: "waiting" (alone), "matched" (paired up but match doc not ready), "playing" (handed to game)
// Calls onPlayNpc() to fall back to NPC, onCancel() to stand up.
export default function StationLobby({
  stationName,
  npcName,
  myUid,
  seats,
  match,
  waitTimeoutMs = 25000,
  onCancel,
  onPlayNpc,
  onMatchReady,
}) {
  const [waitedMs, setWaitedMs] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setWaitedMs(Date.now() - start), 250);
    return () => clearInterval(id);
  }, []);

  const seatList = useMemo(
    () =>
      Object.entries(seats || {})
        .map(([uid, data]) => ({ uid, ...data }))
        .sort((a, b) => (a.sitAt || 0) - (b.sitAt || 0)),
    [seats]
  );

  const otherPlayer = seatList.find((s) => s.uid !== myUid);
  const otherCount = seatList.filter((s) => s.uid !== myUid).length;
  const overTime = waitedMs > waitTimeoutMs;

  // When match doc is ready and includes both players, hand off.
  useEffect(() => {
    if (!match) return;
    if (match.white && match.black && match.id) {
      onMatchReady?.(match);
    }
  }, [match, onMatchReady]);

  return (
    <div className="station-lobby">
      <div className="station-lobby__title">{stationName}</div>
      {otherPlayer ? (
        <>
          <div className="station-lobby__pair">
            <div className="station-lobby__seat">
              <div className="station-lobby__avatar" style={{ background: seatList[0]?.color || "#f5c973" }} />
              <div className="station-lobby__name">
                {seatList[0]?.uid === myUid ? "You" : seatList[0]?.name}
              </div>
            </div>
            <div className="station-lobby__vs">vs</div>
            <div className="station-lobby__seat">
              <div className="station-lobby__avatar" style={{ background: seatList[1]?.color || "#99b4ff" }} />
              <div className="station-lobby__name">
                {seatList[1]?.uid === myUid ? "You" : seatList[1]?.name}
              </div>
            </div>
          </div>
          <div className="station-lobby__status">
            {match?.id ? "Setting up the board…" : "Match found! Setting up…"}
          </div>
          {otherCount > 1 && (
            <div className="station-lobby__hint">
              {otherCount} others waiting. Next round queues up after this match.
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
          <div className="station-lobby__status">Waiting for another player…</div>
          <div className="station-lobby__hint">
            Other players in the plaza will see your seat and can join.
          </div>
        </>
      )}

      <div className="station-lobby__actions">
        {!otherPlayer && npcName && (
          <button
            type="button"
            className="station-lobby__btn station-lobby__btn--primary"
            onClick={onPlayNpc}
            disabled={!overTime}
            title={overTime ? "Play the NPC instead" : "Available after 25s"}
          >
            {overTime ? `Play ${npcName} instead` : `Play ${npcName} in ${Math.ceil((waitTimeoutMs - waitedMs) / 1000)}s`}
          </button>
        )}
        <button type="button" className="station-lobby__btn" onClick={onCancel}>
          Stand up
        </button>
      </div>
    </div>
  );
}
