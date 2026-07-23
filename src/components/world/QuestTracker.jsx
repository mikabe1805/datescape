function boundedNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

const QUEST_STATUS_LABELS = {
  available: "Available quest",
  active: "Active quest",
  "ready-to-turn-in": "Ready to turn in",
  completed: "Quest complete",
};

export default function QuestTracker({
  level = 1,
  xpIntoLevel = 0,
  xpNeededForNextLevel = 50,
  quest = null,
  objective = null,
  reward = null,
  busy = false,
  error = null,
  onAccept,
  onClaim,
}) {
  const safeLevel = Math.max(1, Math.trunc(boundedNumber(level, 1)));
  const safeNeeded = Math.max(1, boundedNumber(xpNeededForNextLevel, 50));
  const safeInto = Math.min(safeNeeded, boundedNumber(xpIntoLevel));
  const questStatus = QUEST_STATUS_LABELS[quest?.status]
    ? quest.status
    : quest
      ? "active"
      : null;
  const objectivePosition = Math.max(
    1,
    Math.trunc(boundedNumber(objective?.position, 1)),
  );
  const objectiveTotal = Math.max(
    objectivePosition,
    Math.trunc(boundedNumber(objective?.total, objectivePosition)),
  );
  const cosmeticLabel =
    reward?.cosmeticLabel ||
    (Array.isArray(reward?.cosmeticLabels)
      ? reward.cosmeticLabels.filter(Boolean).join(", ")
      : null);
  const canAccept = questStatus === "available" && typeof onAccept === "function";
  const canClaim =
    questStatus === "ready-to-turn-in" && typeof onClaim === "function";

  return (
    <aside
      className={`world-quest-tracker${questStatus ? ` is-${questStatus}` : " is-idle"}`}
      aria-labelledby="world-quest-tracker-title"
    >
      <header className="world-quest-tracker__progression">
        <div>
          <span className="world-quest-tracker__eyebrow">Wayfarer level</span>
          <strong id="world-quest-tracker-title">Level {safeLevel}</strong>
        </div>
        <span className="world-quest-tracker__xp-count">
          {safeInto}/{safeNeeded} XP
        </span>
      </header>

      <progress
        className="world-quest-tracker__xp-meter"
        value={safeInto}
        max={safeNeeded}
        aria-label={`${safeInto} of ${safeNeeded} XP toward level ${safeLevel + 1}`}
      />

      {quest ? (
        <section
          className="world-quest-tracker__quest"
          aria-labelledby={`world-quest-${quest.id || "active"}-title`}
        >
          <span className="world-quest-tracker__status">
            {QUEST_STATUS_LABELS[questStatus]}
          </span>
          <h2 id={`world-quest-${quest.id || "active"}-title`}>
            {quest.title || "Untitled quest"}
          </h2>
          {quest.description && <p>{quest.description}</p>}

          {objective && questStatus !== "completed" && (
            <div className="world-quest-tracker__objective">
              <span>
                Objective {objectivePosition} of {objectiveTotal}
              </span>
              <strong>{objective.label}</strong>
              {objective.detail && <p>{objective.detail}</p>}
            </div>
          )}

          {reward && (
            <div className="world-quest-tracker__reward">
              <span>Quest reward</span>
              <strong>
                {boundedNumber(reward.xp)} XP
                {cosmeticLabel ? ` + ${cosmeticLabel}` : ""}
              </strong>
            </div>
          )}

          {canAccept && (
            <button
              type="button"
              className="world-quest-tracker__action"
              disabled={busy}
              onClick={() => onAccept(quest.id)}
            >
              {busy ? "Starting quest…" : "Accept quest"}
            </button>
          )}
          {canClaim && (
            <button
              type="button"
              className="world-quest-tracker__action"
              disabled={busy}
              onClick={() => onClaim(quest.id)}
            >
              {busy ? "Claiming reward…" : "Claim reward"}
            </button>
          )}
        </section>
      ) : (
        <p className="world-quest-tracker__empty">
          Explore Afterlight to discover your next quest.
        </p>
      )}

      {error && (
        <p className="world-quest-tracker__error" role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}
