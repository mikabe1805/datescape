import { useEffect, useState } from "react";
import { db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";

// Slide-up profile card shown when tapping another player.
// Props: { uid, name, color, onClose, onLike, onWave, onInvite, mutual }
export default function ProfileCard({ uid, name, color, onClose, onLike, onWave, onInvite, mutual, liked }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setProfile(null);
    if (!uid) {
      setLoading(false);
      return undefined;
    }
    getDoc(doc(db, "users", uid))
      .then((snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          setProfile(snap.data());
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const photo = profile?.media?.[0]?.url || profile?.media?.[0];
  const displayName = profile?.displayName || name || "Player";
  const bio = profile?.bio || "";

  return (
    <div className="profile-card" role="dialog" aria-modal="true">
      <div className="profile-card__backdrop" onClick={onClose} />
      <div className="profile-card__panel">
        <button type="button" className="profile-card__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="profile-card__header">
          <div className="profile-card__avatar" style={{ background: color || "#aac8df" }}>
            {photo ? (
              <img src={photo} alt="" className="profile-card__photo" />
            ) : (
              <span>{displayName?.[0]?.toUpperCase() || "?"}</span>
            )}
          </div>
          <div>
            <div className="profile-card__name">{displayName}</div>
            {profile?.gender && (
              <div className="profile-card__meta">
                {profile.gender}
                {profile.age ? ` · ${profile.age}` : ""}
              </div>
            )}
            {mutual && <div className="profile-card__mutual">It's a match!</div>}
          </div>
        </div>
        {loading ? (
          <div className="profile-card__bio">Loading…</div>
        ) : bio ? (
          <p className="profile-card__bio">{bio}</p>
        ) : (
          <p className="profile-card__bio profile-card__bio--muted">
            They haven't filled in a bio yet — say hello and find out the rest.
          </p>
        )}

        <div className="profile-card__actions">
          <button
            type="button"
            className={`profile-card__action profile-card__action--like${liked ? " is-active" : ""}`}
            onClick={onLike}
            disabled={liked}
          >
            <span className="profile-card__action-icon">♥</span>
            <span>{liked ? "Liked" : "Like"}</span>
          </button>
          <button type="button" className="profile-card__action" onClick={onWave}>
            <span className="profile-card__action-icon">👋</span>
            <span>Wave</span>
          </button>
          <button type="button" className="profile-card__action profile-card__action--primary" onClick={onInvite}>
            <span className="profile-card__action-icon">♟</span>
            <span>Play chess</span>
          </button>
        </div>
      </div>
    </div>
  );
}
