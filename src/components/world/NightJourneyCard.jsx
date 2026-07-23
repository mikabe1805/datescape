import { useEffect, useState } from "react";
import { Check } from "lucide-react";

function compactViewport() {
  return window.matchMedia?.("(max-width: 720px)").matches ?? false;
}

export default function NightJourneyCard({
  city,
  event,
  eventTime,
  weather,
  journey,
  progress,
  keepsakeCount = 0,
  sharedMomentCount = 0,
  controlsHint,
  onRestart,
}) {
  const [expanded, setExpanded] = useState(() => !compactViewport());

  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 720px)");
    if (!media) return undefined;
    const update = () => setExpanded(!media.matches);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  const currentStage = progress.stages.find((stage) => !stage.complete);
  const summary = progress.complete
    ? journey.keepsake?.title || "Night thread complete"
    : currentStage?.label || "Follow the shoreline";

  return (
    <aside
      className={`world-evening-card world-journey-card${progress.complete ? " is-complete" : ""}${expanded ? " is-expanded" : ""}`}
      aria-labelledby="night-journey-title"
    >
      <button
        type="button"
        className="world-journey-card__toggle"
        aria-expanded={expanded}
        aria-controls="night-journey-details"
        onClick={() => setExpanded((value) => !value)}
      >
        <span>
          <span className="world-evening-card__eyebrow">Tonight in {city}</span>
          <strong id="night-journey-title">{event}</strong>
        </span>
        <span className="world-journey-card__count" aria-hidden="true">
          {progress.completed}/{progress.total}
        </span>
      </button>

      <div className="world-journey-card__summary">{summary}</div>
      <progress
        className="world-journey-card__meter"
        value={progress.completed}
        max={progress.total}
        aria-label={`${progress.completed} of ${progress.total} night-thread beats complete`}
      />

      {expanded && (
        <div id="night-journey-details" className="world-journey-card__details">
          <div className="world-evening-card__meta">
            <span>{eventTime}</span>
            <span>{weather}</span>
          </div>

          <ol className="world-journey-card__stages">
            {progress.stages.map((stage) => (
              <li
                key={stage.id}
                className={`${stage.complete ? "is-complete" : ""}${stage.id === currentStage?.id ? " is-current" : ""}`}
              >
                <span className="world-journey-card__stage-mark" aria-hidden="true">
                  {stage.complete ? <Check size={13} strokeWidth={3} /> : null}
                </span>
                <span>
                  <strong>{stage.label}</strong>
                  <small>{stage.detail}</small>
                </span>
              </li>
            ))}
          </ol>

          {progress.complete && journey.keepsake && (
            <div
              className="world-journey-card__keepsake"
              style={{ "--journey-color": journey.keepsake.color }}
            >
              <span>New keepsake</span>
              <strong>{journey.keepsake.title}</strong>
              <p>{journey.keepsake.note}</p>
              <blockquote>{journey.keepsake.prompt}</blockquote>
              <button type="button" onClick={onRestart}>
                Follow another thread
              </button>
            </div>
          )}

          <div className="world-journey-card__footer">
            <span>
              {keepsakeCount} {keepsakeCount === 1 ? "keepsake" : "keepsakes"}
              {" · "}
              {sharedMomentCount} shared {sharedMomentCount === 1 ? "moment" : "moments"}
            </span>
            <span>{controlsHint}</span>
          </div>
        </div>
      )}

      <span className="world-visually-hidden" role="status" aria-live="polite">
        Night thread: {progress.completed} of {progress.total} beats complete.
        {progress.complete ? ` ${summary} earned.` : ` Next: ${summary}.`}
      </span>
    </aside>
  );
}
