import { memo, useEffect, useState } from "react";
import { Check, Circle, Sparkles } from "lucide-react";

const TARGETS = [
  {
    id: "conservatory-scan",
    short: "Glasshouse scan",
    place: "Arrival Conservatory",
  },
  { id: "market-west", short: "West lantern", place: "Lantern Market" },
  { id: "market-east", short: "East lantern", place: "Lantern Market" },
  {
    id: "resonance-left",
    short: "Tide chime",
    place: "Resonance Garden",
  },
  {
    id: "resonance-right",
    short: "Bloom chime",
    place: "Resonance Garden",
  },
];

const PHASE_COPY = {
  conservatory: {
    eyebrow: "Stage 1 of 3",
    title: "Read the glasshouse trail",
    detail: "Travel to the Conservatory and scan the glowing field marker.",
  },
  market: {
    eyebrow: "Stage 2 of 3",
    title: "Light both market lanterns",
    detail:
      "Two party members take opposite lanterns. The Echo can answer both after the wait.",
  },
  resonance: {
    eyebrow: "Stage 3 of 3",
    title: "Ring the paired garden chimes",
    detail:
      "Regroup in the Garden and answer both glowing pads before their harmony fades.",
  },
  completed: {
    eyebrow: "Expedition complete",
    title: "The Lanternkeeper trail is restored",
    detail: "Return to Juno to claim quest XP and the Lanternkeeper charm.",
  },
  expired: {
    eyebrow: "Route closed",
    title: "The trail has gone quiet",
    detail: "There is no penalty. Meet at Juno's board to begin a fresh route.",
  },
};

function duration(seconds) {
  const safe = Math.max(0, Math.trunc(Number(seconds) || 0));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function OpenExpeditionList({
  entries,
  signedIn,
  atBoard,
  busyAction,
  onJoin,
}) {
  if (!entries.length) return null;
  return (
    <ul className="world-expedition__open" aria-label="Open expeditions">
      {entries.slice(0, 3).map((entry, index) => {
        const routeLabel = `Route ${index + 1}`;
        return (
          <li key={entry.instanceId}>
            <span>
              {routeLabel}
              <small>{entry.activeMemberCount} already traveling</small>
            </span>
            <button
              type="button"
              aria-label={`Join ${routeLabel}, ${entry.activeMemberCount} already traveling`}
              disabled={!signedIn || !atBoard || Boolean(busyAction)}
              onClick={() => onJoin?.(entry.instanceId)}
            >
              Join
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function LanternkeeperExpeditionCard({
  expeditions = [],
  expedition,
  personal,
  completedTargetIds = [],
  currentTargets = [],
  availableTargetIds = [],
  nearbyTargetId = null,
  canUseEcho = false,
  echoAvailableAt = null,
  expiresAt = null,
  serverTimeOffset = 0,
  busyAction = null,
  signedIn = false,
  atBoard = false,
  rewardReady = false,
  error = null,
  onStart,
  onJoin,
  onLeave,
  onContribute,
  onSignIn,
}) {
  const phase = expedition?.phase || "expired";
  const joined = Boolean(expedition?.instanceId && personal?.active);
  const phaseCopy = PHASE_COPY[phase] || PHASE_COPY.expired;
  const boardNow = Date.now() + (Number(serverTimeOffset) || 0);
  const joinable = expeditions.filter(
    (entry) =>
      entry.canJoin &&
      Number.isFinite(entry.expiresAt) &&
      entry.expiresAt > boardNow &&
      (entry.instanceId !== expedition?.instanceId || !personal?.active),
  );
  const active = joined && phase !== "completed" && phase !== "expired";
  const partnerStage = phase === "market" || phase === "resonance";
  const waitingForPairedMark = Boolean(
    active &&
      partnerStage &&
      !canUseEcho &&
      availableTargetIds.length === 0 &&
      personal?.contributedTargets?.some((targetId) =>
        currentTargets.includes(targetId),
      ),
  );
  const showEchoGuide = Boolean(
    active &&
      partnerStage &&
      (canUseEcho ||
        expedition.activeMemberCount < 2 ||
        waitingForPairedMark),
  );
  const hasAvailableTarget = active && availableTargetIds.length > 0;
  const targetAvailable =
    active &&
    nearbyTargetId &&
    availableTargetIds.includes(nearbyTargetId);
  const canStartAnother = !active && atBoard;
  const [localNow, setLocalNow] = useState(Date.now);

  useEffect(() => {
    if (!active) return undefined;
    setLocalNow(Date.now());
    const timer = window.setInterval(() => setLocalNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active]);

  const serverNow = localNow + (Number(serverTimeOffset) || 0);
  const secondsRemaining = expiresAt
    ? Math.max(0, Math.ceil((expiresAt - serverNow) / 1_000))
    : 0;
  const echoSecondsRemaining = echoAvailableAt
    ? Math.max(0, Math.ceil((echoAvailableAt - serverNow) / 1_000))
    : 0;

  return (
    <aside
      className={`world-expedition${joined ? " is-joined" : " is-board"} is-${phase}`}
      aria-labelledby="world-expedition-title"
    >
      <header className="world-expedition__header">
        <div>
          <span className="world-expedition__eyebrow">
            {joined ? phaseCopy.eyebrow : "Co-op field contract"}
          </span>
          <h2 id="world-expedition-title">Lanternkeeper Expedition</h2>
        </div>
        <span className="world-expedition__party">
          {joined
            ? `${expedition.activeMemberCount}/${expedition.memberCapacity}`
            : "2–4"}
        </span>
      </header>

      {joined ? (
        <>
          <div className="world-expedition__mission">
            <span>{phaseCopy.title}</span>
            {active && (
              <time dateTime={`PT${secondsRemaining}S`}>
                {duration(secondsRemaining)}
              </time>
            )}
          </div>
          <p className="world-expedition__summary">
            {phase === "completed" && !rewardReady
              ? "The route is restored. If you carried Juno's contract, check your quest log; otherwise you may begin or join another route."
              : phaseCopy.detail}
          </p>

          <ol className="world-expedition__route" aria-label="Expedition route">
            {TARGETS.map((target) => {
              const complete = completedTargetIds.includes(target.id);
              const current = currentTargets.includes(target.id);
              const mine = personal?.contributedTargets?.includes(target.id);
              const TargetMark = complete ? Check : current ? Sparkles : Circle;
              return (
                <li
                  key={target.id}
                  className={`${complete ? "is-complete" : ""}${current ? " is-current" : ""}`}
                >
                  <span aria-hidden="true">
                    <TargetMark size={13} strokeWidth={complete ? 3 : 2} />
                  </span>
                  <span>
                    <span className="world-visually-hidden">
                      {complete
                        ? "Completed objective: "
                        : current
                          ? "Current objective: "
                          : "Upcoming objective: "}
                    </span>
                    {target.short}
                    <small>{mine ? "Your mark" : target.place}</small>
                  </span>
                </li>
              );
            })}
          </ol>

          {showEchoGuide && (
            <p className="world-expedition__echo">
              {canUseEcho
                ? (
                    <span role="status">
                      Echo guide ready — you may answer both halves for identical
                      quest credit.
                    </span>
                  )
                : (
                    <>
                      {expedition.activeMemberCount < 2
                        ? "Waiting for another traveler"
                        : "Waiting for the other field mark"}
                      {" · Echo guide in "}
                      <span aria-hidden="true">{echoSecondsRemaining}s</span>
                      <span className="world-visually-hidden">
                        under two minutes
                      </span>
                    </>
                  )}
            </p>
          )}

          {targetAvailable && (
            <button
              type="button"
              className="world-expedition__primary"
              disabled={Boolean(busyAction)}
              onClick={() => onContribute?.(nearbyTargetId)}
            >
              {busyAction?.startsWith("contribute:")
                ? "Attuning…"
                : `Attune ${TARGETS.find((target) => target.id === nearbyTargetId)?.short || "objective"}`}
            </button>
          )}

          {hasAvailableTarget && !targetAvailable && (
            <p className="world-expedition__hint">
              Follow the gold trail in the world. Stand in a glowing field marker
              and {" "}
              <strong>press E</strong> or tap its action prompt.
            </p>
          )}

          {!active && (
            <OpenExpeditionList
              entries={joinable}
              signedIn={signedIn}
              atBoard={atBoard}
              busyAction={busyAction}
              onJoin={onJoin}
            />
          )}

          <div className="world-expedition__actions">
            {personal?.canLeave && active && (
              <button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={onLeave}
              >
                Leave without penalty
              </button>
            )}
            {canStartAnother && (
              <button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={onStart}
              >
                Start a fresh route
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="world-expedition__summary">
            Form an opt-in party, cross all three districts, and solve a shared
            route in the physical world. Invites, chat, matching, and profile
            attention never grant XP.
          </p>

          <OpenExpeditionList
            entries={joinable}
            signedIn={signedIn}
            atBoard={atBoard}
            busyAction={busyAction}
            onJoin={onJoin}
          />

          {!signedIn ? (
            <button
              type="button"
              className="world-expedition__primary"
              onClick={onSignIn}
            >
              Sign in to join an expedition
            </button>
          ) : atBoard ? (
            <button
              type="button"
              className="world-expedition__primary"
              disabled={Boolean(busyAction)}
              onClick={onStart}
            >
              {busyAction === "start" ? "Opening route…" : "Start an expedition"}
            </button>
          ) : (
            <p className="world-expedition__board-note">
              Meet at Juno's Lanternkeeper board in the Resonance Garden to
              start or join.
            </p>
          )}
        </>
      )}

      {error && (
        <p className="world-expedition__error" role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}

export default memo(LanternkeeperExpeditionCard);
