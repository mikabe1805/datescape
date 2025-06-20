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
    window.location.reload();
  };

  const handlePass = async () => {
    const matchRef = doc(db, "matches", `${match.userA}_${match.userB}`);
    await updateDoc(matchRef, { isActiveA: false, isActiveB: false });
    window.location.reload();
  };

  return (
    <div className="match-card">
      <img src={otherUser.media?.[0]} alt="Profile" className="match-photo" />
      <h3>{otherUser.displayName}</h3>
      <p>{otherUser.bio || "No bio available."}</p>
      <p><strong>Looking For:</strong> {otherUser.lookingFor}</p>
      <p><strong>Match Score:</strong> {match.matchScore}</p>

      <div className="match-card-buttons">
        <button className="pass-btn" onClick={handlePass}>Pass</button>
        <button className="like-btn" onClick={handleLike}>Like</button>
      </div>
    </div>
  );
}

export default MatchCard;
