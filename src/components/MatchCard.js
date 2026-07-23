import React from "react";
import { distanceBetween } from "../utils/MatchingEngine";
import { submitMatchDecision } from "../utils/MatchActions";

function intentLabel(lookingFor) {
  const lc = (lookingFor || "").toLowerCase();
  if (lc === "friendship") return { text: "Friendship", className: "intent-pill intent-pill--friendship" };
  if (lc === "dating") return { text: "Dating", className: "intent-pill intent-pill--dating" };
  if (lc === "both") return { text: "Friends or dating", className: "intent-pill intent-pill--both" };
  return null;
}

function formatDistance(miles) {
  if (typeof miles !== "number" || !Number.isFinite(miles)) return null;
  if (miles < 1) return "<1 mi away";
  if (miles < 10) return `${miles.toFixed(1)} mi away`;
  return `${Math.round(miles)} mi away`;
}

function MatchCard({ match, currentUserId, currentUserProfile }) {
  const otherUser = currentUserId === match.userA ? match.userBProfile : match.userAProfile;
  const intent = intentLabel(otherUser?.lookingFor);
  const distance = formatDistance(
    typeof match.distanceMiles === "number"
      ? match.distanceMiles
      : currentUserProfile && otherUser
        ? distanceBetween(currentUserProfile, otherUser)
        : null
  );

  const handleLike = async () => {
    const matchId = match.id || [match.userA, match.userB].sort().join("_");
    await submitMatchDecision(matchId, "like");
  };

  const handlePass = async () => {
    const matchId = match.id || [match.userA, match.userB].sort().join("_");
    await submitMatchDecision(matchId, "pass");
  };

  return (
    <div className="swipe-card-glass">
      {otherUser?.media?.length > 0 && (
        <img src={otherUser.media[0]} alt="Profile" className="carousel-media-file" loading="lazy" />
      )}
      <div className="card-header-glass">
        <h2>
          {otherUser?.displayName}
          {otherUser?.age ? <span className="match-age">, {otherUser.age}</span> : null}
        </h2>
        <div className="match-meta-row">
          {intent && <span className={intent.className}>{intent.text}</span>}
          {distance && <span className="match-distance-pill">{distance}</span>}
          {otherUser?.zodiac && <span className="zodiac-tag">{otherUser.zodiac}</span>}
        </div>
      </div>
      <div className="details">
        <p>{otherUser?.bio || "No bio yet."}</p>
        {typeof match.matchScore !== "undefined" && (
          <div className="match-strength">Match Score: {match.matchScore}</div>
        )}
      </div>
      <div className="swipe-buttons-glass">
        <button className="glass-button ripple" onClick={handlePass}>Pass</button>
        <button className="glass-button ripple" onClick={handleLike}>Like</button>
      </div>
    </div>
  );
}

export default MatchCard;
