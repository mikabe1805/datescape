import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Circle, Sparkles } from "lucide-react";
import {
  listeningCardFor,
  safeSocialChoiceId,
  socialMomentOutcome,
} from "../../game/socialMoment";

function participant(uid, name, color, myUid) {
  return {
    uid,
    name: String(name || "Guest").slice(0, 30),
    color: color || "#8ad6c6",
    isMe: uid === myUid,
  };
}

export default function SocialMoment({
  match,
  myUid,
  choices = {},
  partnerLeft = false,
  onChoose,
  onResolved,
  onComplete,
  onReplay,
  handoffBusy = false,
  handoffError = false,
  onRetryHandoff,
  onLeave,
}) {
  const card = useMemo(
    () =>
      listeningCardFor({
        id: match?.id,
        socialCardId: match?.socialCardId,
      }),
    [match?.id, match?.socialCardId],
  );
  const people = useMemo(
    () => [
      participant(match?.white, match?.whiteName, match?.whiteColor, myUid),
      participant(match?.black, match?.blackName, match?.blackColor, myUid),
    ],
    [match, myUid],
  );
  const opponent = people.find((person) => !person.isMe) || people[1];
  const savedChoice = choices?.[myUid];
  const opponentChoice = choices?.[opponent?.uid];
  const savedChoiceId =
    savedChoice?.matchId === match?.id
      ? safeSocialChoiceId(savedChoice.choiceId)
      : null;
  const opponentChoiceId =
    opponentChoice?.matchId === match?.id
      ? safeSocialChoiceId(opponentChoice.choiceId)
      : null;
  const outcome = useMemo(
    () => socialMomentOutcome(match, myUid, choices),
    [choices, match, myUid],
  );
  const [pendingChoiceId, setPendingChoiceId] = useState(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState(null);
  const [submitError, setSubmitError] = useState("");
  const resolvedMatchesRef = useRef(new Set());
  const revealHeadingRef = useRef(null);

  useEffect(() => {
    setPendingChoiceId(null);
    setSelectedChoiceId(null);
    setSubmitError("");
  }, [match?.id]);

  useEffect(() => {
    if (savedChoiceId) {
      setPendingChoiceId(null);
      setSubmitError("");
    }
  }, [savedChoiceId]);

  useEffect(() => {
    if (
      !outcome ||
      resolvedMatchesRef.current.has(outcome.matchId)
    ) {
      return;
    }
    resolvedMatchesRef.current.add(outcome.matchId);
    onResolved?.(outcome);
  }, [onResolved, outcome]);

  useEffect(() => {
    if (!outcome?.completed) return;
    revealHeadingRef.current?.focus();
  }, [outcome?.completed]);

  const displayedChoiceId =
    savedChoiceId || pendingChoiceId || selectedChoiceId;
  const submitting = Boolean(pendingChoiceId && !savedChoiceId);
  const choiceLocked = Boolean(
    savedChoiceId || pendingChoiceId || outcome || partnerLeft || !onChoose,
  );

  const choose = async (choiceId) => {
    if (choiceLocked || !safeSocialChoiceId(choiceId)) return;
    setPendingChoiceId(choiceId);
    setSubmitError("");
    try {
      const result = await onChoose(choiceId);
      if (result?.error) {
        setPendingChoiceId(null);
        setSubmitError(
          "That answer did not reach the Crescent. Check your connection and try again.",
        );
      }
    } catch {
      setPendingChoiceId(null);
      setSubmitError(
        "That answer did not reach the Crescent. Check your connection and try again.",
      );
    }
  };

  const headerCopy = outcome?.completed
    ? "Both answers are here. There is no score to earn."
    : outcome?.passed
      ? "This card was passed. Nothing was saved, and nothing is owed."
      : partnerLeft
        ? "The other person moved on before the reveal. Nothing was saved."
        : submitting
          ? "Sending your answer to the Crescent…"
          : savedChoiceId
            ? savedChoiceId === "pass"
              ? `You passed. Waiting for ${opponent?.name || "the other person"}. No explanation is owed.`
              : `Your answer is locked. Waiting for ${opponent?.name || "the other person"}.`
            : opponentChoiceId
              ? `${opponent?.name || "The other person"} has responded. Their answer stays out of view in the card until you respond.`
              : "Choose on your card. If you both choose, the two answers open together.";

  if (!card) {
    return (
      <section className="social-moment" aria-labelledby="social-moment-title">
        <header className="social-moment__header">
          <div className="social-moment__eyebrow">Listening Crescent</div>
          <h2 id="social-moment-title">This card cannot open safely</h2>
          <p>
            The shared card changed before this round reached you. No answer or
            receipt was created.
          </p>
        </header>
        <div className="social-moment__actions">
          <button
            type="button"
            className="social-moment__leave"
            onClick={onLeave}
          >
            Return to the district
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="social-moment" aria-labelledby="social-moment-title">
      <header className="social-moment__header">
        <div className="social-moment__eyebrow">
          Listening Crescent · one shared card
        </div>
        <h2 id="social-moment-title">
          {outcome?.completed ? "A little more known" : "A moment for two"}
        </h2>
        <p aria-live="polite">{headerCopy}</p>
      </header>

      <div className="social-moment__people" aria-label="People in this moment">
        {people.map((person, index) => (
          <div
            className="social-moment__person"
            key={person.uid || `${person.name}-${index}`}
          >
            <span
              className="social-moment__avatar"
              style={{ "--social-person-color": person.color }}
              aria-hidden="true"
            />
            <span className="social-moment__name">{person.name}</span>
            {person.isMe && <span className="social-moment__you">you</span>}
          </div>
        ))}
      </div>

      <div className="social-moment__card">
        <span>{card.kicker}</span>
        <p>{card.prompt}</p>
      </div>

      {!outcome && !partnerLeft && (
        <fieldset
          className="social-moment__choices"
          disabled={choiceLocked}
          aria-busy={submitting}
        >
          <legend>
            {savedChoiceId
              ? "Your answer is locked for this round"
              : "Which feels most like you tonight?"}
          </legend>
          <div className="social-moment__choice-grid">
            {card.choices.map((choice, index) => {
              const selected = displayedChoiceId === choice.id;
              return (
                <label
                  key={choice.id}
                  className={`social-moment__choice${selected ? " is-selected" : ""}`}
                >
                  <input
                    type="radio"
                    name={`social-choice-${match?.id || "round"}`}
                    value={choice.id}
                    checked={selected}
                    onChange={() => setSelectedChoiceId(choice.id)}
                  />
                  <span aria-hidden="true">
                    {String.fromCharCode(65 + index)}
                  </span>
                  <strong>{choice.label}</strong>
                  {savedChoiceId === choice.id && <small>Answer sent</small>}
                </label>
              );
            })}
          </div>
          {!savedChoiceId && (
            <div className="social-moment__choice-actions">
              <button
                type="button"
                className="social-moment__lock"
                disabled={!selectedChoiceId || submitting}
                onClick={() => choose(selectedChoiceId)}
              >
                {submitting && pendingChoiceId !== "pass"
                  ? "Locking your choice…"
                  : "Lock my choice"}
              </button>
              <button
                type="button"
                className={`social-moment__pass${displayedChoiceId === "pass" ? " is-selected" : ""}`}
                onClick={() => choose("pass")}
              >
                {submitting && pendingChoiceId === "pass"
                  ? "Passing this card…"
                  : "Pass this card"}
              </button>
            </div>
          )}
        </fieldset>
      )}

      {submitError && (
        <p className="social-moment__error" role="alert">
          {submitError}
        </p>
      )}

      {outcome?.completed && (
        <div className="social-moment__reveal" aria-live="polite">
          <div
            ref={revealHeadingRef}
            className="social-moment__reveal-heading"
            tabIndex={-1}
          >
            <span aria-hidden="true"><Sparkles size={16} /></span>
            <div>
              <small>Both answers revealed</small>
              <strong>
                {outcome.sameChoice
                  ? "The same answer can hold two different stories."
                  : "Two honest answers are better than a match score."}
              </strong>
            </div>
          </div>
          <dl className="social-moment__answers">
            <div>
              <dt>You chose</dt>
              <dd>{outcome.myChoiceLabel}</dd>
            </div>
            <div>
              <dt>{opponent?.name || "They"} chose</dt>
              <dd>{outcome.opponentChoiceLabel}</dd>
            </div>
          </dl>
          <p>
            If you want, tell each other what made that answer feel true. Profile
            sharing stays a separate choice after this moment.
          </p>
        </div>
      )}

      {(outcome?.passed || (!outcome && partnerLeft)) && (
        <div className="social-moment__passed" role="status">
          <span aria-hidden="true"><Circle size={15} /></span>
          <div>
            <strong>
              {outcome?.passed ? "Card passed kindly" : "The reveal stayed closed"}
            </strong>
            <p>
              {outcome?.passed
                ? "No receipt, compatibility result, or profile reveal was created."
                : "A shared moment needs two present answers, so this round does not count toward your Journey."}
            </p>
          </div>
        </div>
      )}

      {outcome && handoffError ? (
        <div className="social-moment__sync-error" role="alert">
          <span>
            The Crescent could not confirm that both people can keep this
            result. Try again or leave without penalty.
          </span>
          <button type="button" onClick={onRetryHandoff}>
            Try the handoff again
          </button>
        </div>
      ) : outcome && handoffBusy ? (
        <div
          className="social-moment__sync"
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true" />
          Keeping this round available to both people…
        </div>
      ) : null}

      {!outcome?.completed && !outcome?.passed && !partnerLeft && (
        <div className="social-moment__consent">
          <span aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
          <p>
            Choose only what feels comfortable. Either person may pass or leave
            at any time. Passing closes the reveal and creates no receipt. This
            is a conversation opening, not a compatibility test.
          </p>
        </div>
      )}

      <div className="social-moment__actions">
        {outcome?.completed ? (
          <button
            type="button"
            className="social-moment__complete"
            onClick={() => onComplete?.(outcome)}
            disabled={handoffBusy}
          >
            {handoffBusy
              ? "Holding the shared reveal…"
              : "Carry this moment onward"}
          </button>
        ) : outcome?.passed || partnerLeft ? (
          <button
            type="button"
            className="social-moment__complete"
            onClick={onReplay}
            disabled={handoffBusy}
          >
            {handoffBusy
              ? "Holding this round…"
              : "Find another moment"}
          </button>
        ) : null}
        <button
          type="button"
          className="social-moment__leave"
          onClick={onLeave}
        >
          {outcome?.passed || partnerLeft
            ? "Return to the district"
            : "Leave kindly"}
        </button>
      </div>
    </section>
  );
}
