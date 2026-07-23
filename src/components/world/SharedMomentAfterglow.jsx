const COPY = {
  resonance: {
    eyebrow: "Resonance Garden · afterglow",
    title: "Your shared song is safe",
    body: "The duet already counts. What happens next is a separate choice for each of you.",
  },
  social: {
    eyebrow: "Listening Crescent · afterglow",
    title: "One good question, carried",
    body: "This moment already counts. You can return alone, try another prompt, or choose whether to continue.",
  },
};

const ENCOUNTER_COPY = {
  pending: {
    title: "Your Spark was sent privately",
    body: "Nothing else is required. You will only hear about it if the Spark becomes mutual.",
  },
  mutual: {
    title: "The Spark is mutual",
    body: "A private connection is ready whenever both of you want to continue.",
  },
  passed: {
    title: "Nothing was sent",
    body: "Passing is complete and penalty-free. The shared moment still counts in full.",
  },
  closed: {
    title: "This choice has closed",
    body: "Your shared moment remains safe. No response or continued contact is required.",
  },
};

function encounterState(encounter) {
  const state = encounter?.state;
  return state === "pending" ||
    state === "mutual" ||
    state === "passed" ||
    state === "closed"
    ? state
    : "open";
}

export default function SharedMomentAfterglow({
  mode,
  opponent,
  prompt,
  ready = true,
  busyLabel,
  onReturn,
  onReplay,
  onViewProfile,
  encounter = null,
  encounterLoading = false,
  encounterBusy = false,
  encounterError = null,
  onSpark,
  onPass,
}) {
  const copy = COPY[mode] || COPY.social;
  const resolvedOpponent = opponent || encounter?.opponent || null;
  const opponentName = String(
    resolvedOpponent?.name || "the other person",
  ).slice(0, 30);
  const state = encounterState(encounter);
  const responseCopy = ENCOUNTER_COPY[state] || null;
  const hasEncounterSurface = Boolean(
    encounter || encounterLoading || encounterError,
  );
  const canRespond = Boolean(
    ready && encounter?.id && state === "open" && !encounterBusy,
  );

  return (
    <section
      className="shared-afterglow"
      aria-labelledby="shared-afterglow-title"
    >
      <div className="shared-afterglow__orb" aria-hidden="true">
        <span />
        <span />
      </div>
      <header>
        <div className="shared-afterglow__eyebrow">{copy.eyebrow}</div>
        <h2 id="shared-afterglow-title">{copy.title}</h2>
        <p>{copy.body}</p>
      </header>

      {prompt && <blockquote>{prompt}</blockquote>}

      {!ready && (
        <div className="shared-afterglow__sync" role="status" aria-live="polite">
          <span aria-hidden="true" />
          {busyLabel ||
            (mode === "resonance"
              ? "Letting both players receive their own copy…"
              : "Saving your private copy…")}
        </div>
      )}

      {hasEncounterSurface && ready && (
        <div
          className={`shared-afterglow__encounter is-${encounterLoading && !encounter ? "loading" : state}`}
          role="group"
          aria-label="Private continuation choice"
        >
          {encounterLoading && !encounter ? (
            <p className="shared-afterglow__encounter-status" role="status">
              Preparing private continuation choices…
            </p>
          ) : !encounter ? (
            <p className="shared-afterglow__encounter-status" role="status">
              Private continuation choices are unavailable right now. You can
              return or replay without changing what you earned.
            </p>
          ) : state === "open" ? (
            <>
              <div className="shared-afterglow__encounter-copy">
                <strong>Would you like to leave a private Spark?</strong>
                <span>
                  {opponentName} will not see a rejection, and this choice never
                  changes rewards.
                </span>
              </div>
              <div className="shared-afterglow__encounter-actions">
                {onSpark && (
                  <button
                    type="button"
                    className="shared-afterglow__spark"
                    onClick={() => onSpark(encounter?.id)}
                    disabled={!canRespond}
                  >
                    {encounterBusy ? "Confirming…" : "Send private Spark"}
                  </button>
                )}
                {onPass && (
                  <button
                    type="button"
                    className="shared-afterglow__pass"
                    onClick={() => onPass(encounter?.id)}
                    disabled={!canRespond}
                  >
                    Pass — nothing sent
                  </button>
                )}
              </div>
              {encounterBusy && (
                <p className="shared-afterglow__encounter-status" role="status">
                  Waiting for the server to confirm your choice. You may still
                  return to the district.
                </p>
              )}
            </>
          ) : (
            <div
              className="shared-afterglow__encounter-result"
              role="status"
              aria-live="polite"
            >
              <strong>{responseCopy.title}</strong>
              <span>{responseCopy.body}</span>
            </div>
          )}
          {encounterError && (
            <p className="shared-afterglow__encounter-error" role="alert">
              {encounterError} Your shared activity credit is unchanged.
            </p>
          )}
        </div>
      )}

      <div className="shared-afterglow__actions">
        <button type="button" onClick={onReturn} disabled={!ready}>
          Return to the district
        </button>
        <button type="button" onClick={onReplay} disabled={!ready}>
          Join another moment
        </button>
        {resolvedOpponent?.uid && (
          <button
            type="button"
            className="shared-afterglow__profile"
            onClick={onViewProfile}
            disabled={!ready}
          >
            View {opponentName}’s calling card
          </button>
        )}
      </div>

      <p className="shared-afterglow__consent">
        Calling cards and Sparks are optional. No response is owed, and passing
        or returning never changes what you earned together.
      </p>
    </section>
  );
}
