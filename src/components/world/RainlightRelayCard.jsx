import { Circle, Sparkles } from "lucide-react";

const SOURCE_LABELS = {
  conservatory: { label: "Conservatory", actionLabel: "Conservatory" },
  market: { label: "Market", actionLabel: "Lantern Market" },
  resonance: { label: "Garden", actionLabel: "Resonance Garden" },
};

function phaseCopy(event, echoSecondsRemaining) {
  switch (event.phase) {
    case "gathering":
      return echoSecondsRemaining > 0
        ? `Two travelers can finish now. The solo Echo route opens in ${echoSecondsRemaining}s.`
        : "Bank light from another place, or invite a nearby traveler to answer.";
    case "echo-available":
      return event.contributorCount <= 1
        ? "Echo route open: one traveler can finish by lighting all three places. Quest credit is the same."
        : "The relay is still open. Each traveler can bank light at two places.";
    case "completed":
      return event.resultMode === "echo"
        ? "The solo Echo crossed the shore. Everyone who helped has the same quest credit."
        : "The district answered together. The relay is glowing across all three places.";
    case "cooldown":
      return "The relay is holding tonight's chorus. A fresh route opens shortly.";
    default:
      return "Bank the first light at any landmark to wake a district-wide route.";
  }
}

export default function RainlightRelayCard({
  event,
  personal,
  nearbySourceId = null,
  echoSecondsRemaining = 0,
  canContribute = false,
  busySourceId = null,
  signedIn = false,
  error = null,
  onContribute,
  onSignIn,
}) {
  const safeEvent = event || {
    phase: "idle",
    contributionCount: 0,
    targetCount: 4,
    contributorCount: 0,
    sourceCounts: {},
    resultMode: null,
  };
  const availableSources = new Set(personal?.availableSources || []);
  const sourceAvailable =
    nearbySourceId &&
    canContribute &&
    (safeEvent.phase === "idle" || availableSources.has(nearbySourceId));
  const complete =
    safeEvent.phase === "completed" || safeEvent.phase === "cooldown";
  const displayedContributionCount = complete
    ? safeEvent.targetCount
    : safeEvent.contributionCount;
  const participantLabel = `${safeEvent.contributorCount} ${
    safeEvent.contributorCount === 1 ? "traveler" : "travelers"
  }`;

  return (
    <aside
      className={`world-public-event is-${safeEvent.phase}`}
      aria-labelledby="world-public-event-title"
    >
      <header className="world-public-event__header">
        <div>
          <span className="world-public-event__eyebrow">Live world event</span>
          <h2 id="world-public-event-title">Rainlight Relay</h2>
        </div>
        <span className="world-public-event__count">
          {complete
            ? "Complete"
            : `${safeEvent.contributionCount}/${safeEvent.targetCount}`}
        </span>
      </header>

      <progress
        className="world-public-event__meter"
        value={displayedContributionCount}
        max={safeEvent.targetCount}
        aria-label={
          complete
            ? "Rainlight Relay complete"
            : `${safeEvent.contributionCount} of ${safeEvent.targetCount} Rainlight contributions banked`
        }
      />

      <p className="world-public-event__summary">
        {participantLabel} · {phaseCopy(safeEvent, echoSecondsRemaining)}
      </p>

      <ul className="world-public-event__sources" aria-label="Relay sources">
        {Object.entries(SOURCE_LABELS).map(([sourceId, source]) => {
          const count = Number(safeEvent.sourceCounts?.[sourceId]) || 0;
          const mine = personal?.contributedSources?.includes(sourceId);
          return (
            <li key={sourceId} className={count ? "is-lit" : "is-dark"}>
              <span aria-hidden="true">
                {count ? <Sparkles size={12} /> : <Circle size={12} />}
              </span>
              <span>{source.label}</span>
              <small>
                {mine ? "Your light" : count ? `${count} banked` : "Unlit"}
              </small>
            </li>
          );
        })}
      </ul>

      {nearbySourceId && signedIn && sourceAvailable && (
        <button
          type="button"
          className="world-public-event__action"
          disabled={Boolean(busySourceId)}
          onClick={() => onContribute?.(nearbySourceId)}
        >
          {busySourceId === nearbySourceId
            ? "Banking light…"
            : `Bank ${SOURCE_LABELS[nearbySourceId].actionLabel} light`}
        </button>
      )}
      {nearbySourceId && signedIn && !sourceAvailable && personal?.contributed && (
        <p className="world-public-event__banked" role="status">
          {personal.contributedSources?.includes(nearbySourceId)
            ? "Your light here is banked. Explore another source or keep moving."
            : "Your route is banked for this relay. Keep exploring while the shared light travels."}
        </p>
      )}
      {!signedIn && (
        <button
          type="button"
          className="world-public-event__action"
          onClick={onSignIn}
        >
          Sign in to join the live relay
        </button>
      )}
      {error && (
        <p className="world-public-event__error" role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}
