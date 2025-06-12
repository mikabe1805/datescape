import React, { useEffect, useState } from 'react';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { calculateMatchScore } from '../utils/MatchingEngine';

export default function MatchQueue() {
  const [candidates, setCandidates] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mediaIndex, setMediaIndex] = useState(0);

  const auth = getAuth();
  const user = auth.currentUser;

  useEffect(() => {
    const fetchCandidates = async () => {
      if (!user) return;

      const snapshot = await getDocs(collection(db, "users"));
      const currentUserDoc = snapshot.docs.find(doc => doc.id === user.uid);
      const currentUserData = currentUserDoc.data().profile;

      const otherUsers = snapshot.docs
        .filter(doc => doc.id !== user.uid)
        .map(doc => ({ uid: doc.id, ...doc.data().profile }));

      const scoredCandidates = otherUsers
        .map(candidate => {
          const score = calculateMatchScore(currentUserData, candidate);
          return { ...candidate, score };
        })
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score);

      setCandidates(scoredCandidates);
      setLoading(false);
    };

    fetchCandidates();
  }, [user]);

  const handleLike = () => {
    nextCandidate();
  };

  const handlePass = () => {
    nextCandidate();
  };

  const nextCandidate = () => {
    setMediaIndex(0);
    setCurrentIndex(prev => prev + 1);
  };

  if (loading) return <h2>Loading...</h2>;
  if (currentIndex >= candidates.length) return <h2>No more candidates!</h2>;

  const person = candidates[currentIndex];
  const media = person.media || [];

  return (
    <div className="swipe-card-glass">
      <h2>{person.username || "Unnamed"}</h2>
      <h3 className="score-label">{getMatchLabel(person.score)}</h3>

      {/* Carousel */}
      <div className="carousel-container">
        {media.length > 0 ? (
          <>
            <div className="carousel-media">
              {media[mediaIndex].includes(".mp4") ? (
                <video src={media[mediaIndex]} controls className="carousel-media-file" />
              ) : (
                <img src={media[mediaIndex]} alt="Profile" className="carousel-media-file" />
              )}
            </div>
            <div className="carousel-buttons">
              <button onClick={() => setMediaIndex((mediaIndex - 1 + media.length) % media.length)}>←</button>
              <button onClick={() => setMediaIndex((mediaIndex + 1) % media.length)}>→</button>
            </div>
          </>
        ) : (
          <p>No media</p>
        )}
      </div>

      {/* Details */}
      <div className="details">
        <p><b>Age:</b> {calculateAge(person.birthdate)}</p>
        <p><b>Height:</b> {person.selfHeight} ft</p>
        <p><b>Religion:</b> {arraySafe(person.religions).join(", ")}</p>
        <p><b>Race:</b> {arraySafe(person.races).join(", ")}</p>
        <p><b>Interests:</b> {arraySafe(person.interests).join(", ")}</p>

        <div className="prompts-section">
          {person.prompts && Object.entries(person.prompts).map(([question, answer], idx) => (
            <div key={idx} className="prompt-card">
              <b>{question}</b>
              <p>{answer}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="swipe-buttons-glass">
        <button className="pass-btn-glass" onClick={handlePass}>Pass</button>
        <button className="like-btn-glass" onClick={handleLike}>Like</button>
      </div>
    </div>
  );
}

// Match score labels
function getMatchLabel(score) {
  if (score >= 50) return "Incredible Match 💖";
  if (score >= 30) return "Strong Compatibility 🌟";
  if (score >= 15) return "Has Potential 💡";
  return "Might Not Click 🤔";
}

// Age calc
function calculateAge(birthdate) {
  if (!birthdate) return "Unknown";
  const today = new Date();
  const birth = new Date(birthdate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

// Safety array handling
function arraySafe(val) {
  return Array.isArray(val) ? val : [];
}
