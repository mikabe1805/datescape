import React from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

function MatchCard({ match, currentUserId }) {
  const otherUserId = match.participants.find((id) => id !== currentUserId);
  const otherUser = currentUserId === match.userA ? match.userBProfile : match.userAProfile;

  const handleLike = async () => {
    const matchRef = doc(db, "matches", `${match.userA}_${match.userB}`);
    await updateDoc(matchRef, {
      [`likedBy${currentUserId === match.userA ? "A" : "B"}`]: true,
    });
    // optimistic UX; avoid full reload
  };

  const handlePass = async () => {
    const matchRef = doc(db, "matches", `${match.userA}_${match.userB}`);
    await updateDoc(matchRef, { isActiveA: false, isActiveB: false });
    // optimistic UX; avoid full reload
  };

  return (
    <div className="swipe-card-glass">
      {otherUser.media?.length > 0 && (
        <img src={otherUser.media[0]} alt="Profile" className="carousel-media-file" loading="lazy" />
      )}
      <div className="card-header-glass">
        <h2>{otherUser.displayName}</h2>
        {otherUser.zodiac && <div className="zodiac-tag">{otherUser.zodiac}</div>}
        {otherUser.lookingFor && <div className="lookingfor-tag">{otherUser.lookingFor}</div>}
      </div>
      <div className="details">
        <p>{otherUser.bio || "No bio available."}</p>
        {typeof match.matchScore !== 'undefined' && (
          <div className="match-strength">Match Score: {match.matchScore}</div>
        )}
      </div>
      <div className="swipe-buttons-glass">
        <button className="pass-btn-glass" onClick={handlePass}>Pass</button>
        <button className="like-btn-glass" onClick={handleLike}>Like</button>
      </div>
    </div>
  );
}

export default MatchCard;
