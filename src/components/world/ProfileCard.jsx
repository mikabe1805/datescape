import { useEffect, useState } from "react";
import { ArrowRight, Gamepad2, Hand, Sparkles, X } from "lucide-react";
import { getWorldCallingCard } from "../../game/sharedEncounter";

const INTENT_LABELS = {
  meet: "Open to meeting",
  friends: "Here to hang out",
  match: "Meeting a connection",
  solo: "Exploring quietly",
};

// A deliberately limited public calling card. Full profile and direct chat
// belong behind mutual consent rather than a tap on any avatar in the room.
export default function ProfileCard({
  uid,
  name,
  color,
  intent,
  onClose,
  onLike,
  onWave,
  onInvite,
  onMute,
  onBlock,
  onReport,
  onOpenConnection,
  mutual,
  liked,
  sparkAllowed = false,
}) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setProfile(null);
    setProfileError(null);
    if (!uid) {
      setLoading(false);
      return undefined;
    }
    getWorldCallingCard(uid)
      .then((result) => {
        if (cancelled) return;
        setProfile(result.profile || null);
        setProfileError(result.error || null);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setProfileError("This calling card is unavailable.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const photo = profile?.photoUrl || null;
  const displayName = profile?.displayName || name || "Player";
  const bio = profile?.bio || "";
  const interests = Array.isArray(profile?.interests)
    ? profile.interests.slice(0, 3)
    : [];
  const isQuiet = intent === "solo";
  const showSpark = Boolean(sparkAllowed && onLike);

  return (
    <div
      className="world-profile-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="world-calling-card-name"
    >
      <div className="world-profile-card__backdrop" onClick={onClose} />
      <div
        className="world-profile-card__panel world-profile-card__panel--calling-card"
        tabIndex={-1}
      >
        <button
          type="button"
          className="world-profile-card__close"
          onClick={onClose}
          aria-label="Close calling card"
        >
          <X size={18} aria-hidden="true" />
        </button>

        <div className="world-profile-card__eyebrow">Nearby calling card</div>
        <div className="world-profile-card__header">
          <div
            className="world-profile-card__avatar"
            style={{ "--profile-light": color || "#72e6cf" }}
          >
            {photo ? (
              <img src={photo} alt="" className="world-profile-card__photo" />
            ) : (
              <span>{displayName?.[0]?.toUpperCase() || "?"}</span>
            )}
          </div>
          <div className="world-profile-card__identity">
            <div className="world-profile-card__presence">
              <span style={{ background: color || "#72e6cf" }} />
              {INTENT_LABELS[intent] || "Exploring Afterlight"}
            </div>
            <div
              className="world-profile-card__name"
              id="world-calling-card-name"
            >
              {displayName}
            </div>
            {profile?.age && (
              <div className="world-profile-card__meta">
                {profile.age} · {profile.lookingFor || "Open to connection"}
              </div>
            )}
            {mutual && (
              <div className="world-profile-card__mutual">Mutual Spark</div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="world-profile-card__bio">Opening calling card…</div>
        ) : profileError ? (
          <p
            className="world-profile-card__bio world-profile-card__bio--muted"
            role="status"
          >
            {profileError} You can close this card and keep exploring.
          </p>
        ) : bio ? (
          <p className="world-profile-card__bio">{bio}</p>
        ) : (
          <p className="world-profile-card__bio world-profile-card__bio--muted">
            A little mystery is allowed. Start with the place you are both
            standing in.
          </p>
        )}

        {interests.length > 0 && (
          <div
            className="world-profile-card__interests"
            aria-label="A few interests"
          >
            {interests.map((interest) => (
              <span key={interest}>{interest}</span>
            ))}
          </div>
        )}

        {mutual ? (
          <button
            type="button"
            className="world-profile-card__continue"
            onClick={onOpenConnection}
          >
            Continue privately <ArrowRight size={17} aria-hidden="true" />
          </button>
        ) : (
          <div
            className={`world-profile-card__actions world-profile-card__actions--afterlight${showSpark ? " has-spark" : ""}`}
          >
            <button
              type="button"
              className="world-profile-card__action"
              onClick={onWave}
              disabled={isQuiet}
              title={isQuiet ? "They are exploring quietly" : undefined}
            >
              <span className="world-profile-card__action-icon">
                <Hand size={21} aria-hidden="true" />
              </span>
              <span>{isQuiet ? "Quiet mode" : "Say hello"}</span>
            </button>
            <button
              type="button"
              className="world-profile-card__action"
              onClick={onInvite}
              disabled={isQuiet}
            >
              <span className="world-profile-card__action-icon">
                <Gamepad2 size={21} aria-hidden="true" />
              </span>
              <span>Invite</span>
            </button>
            {showSpark && (
              <button
                type="button"
                className={`world-profile-card__action world-profile-card__action--like${liked ? " is-active" : ""}`}
                onClick={onLike}
                disabled={liked || isQuiet}
              >
                <span className="world-profile-card__action-icon">
                  <Sparkles size={21} aria-hidden="true" />
                </span>
                <span>{liked ? "Spark sent" : "Send Spark"}</span>
              </button>
            )}
          </div>
        )}

        <div className="world-profile-card__safety" aria-label="Safety actions">
          <button type="button" onClick={onMute}>
            Mute
          </button>
          <button type="button" onClick={onBlock}>
            Block
          </button>
          <button type="button" onClick={onReport}>
            Report
          </button>
          <span>These actions are private.</span>
        </div>
      </div>
    </div>
  );
}
