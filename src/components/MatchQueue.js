import React, { useEffect, useState, useCallback } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, limit, runTransaction } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { Carousel } from 'react-responsive-carousel';
import { useMatchStore } from "./MatchStore";
import Navbar from "./Navbar";
import Slider from 'react-slick';
import MediaCarousel from './MediaCarousel';
import 'slick-carousel/slick/slick.css'; 
import 'slick-carousel/slick/slick-theme.css';
import 'react-responsive-carousel/lib/styles/carousel.min.css';
import '../styles.css';

export default function MatchQueue() {
  const { matches, setMatches } = useMatchStore();
  console.log("MatchStore:", matches.length);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchMatches = async () => {
  if (matches.length > 0) return;

  try {
    setLoading(true);
    const userId = auth.currentUser.uid;

    const qA = query(collection(db, "matches"), where("userA", "==", userId), where("isActiveA", "==", true), limit(10));
    const qB = query(collection(db, "matches"), where("userB", "==", userId), where("isActiveB", "==", true), limit(10));

    const [snapA, snapB] = await Promise.all([getDocs(qA), getDocs(qB)]);

    const matchData = [
      ...snapA.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      ...snapB.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    ];

    const validMatches = matchData.filter(match => {
      const otherProfile =
        userId === match.userA ? match.userBProfile : match.userAProfile;

      // Require at least a displayName and one media item.
      return (
        otherProfile &&
        otherProfile.displayName &&
        Array.isArray(otherProfile.media) &&
        otherProfile.media.length > 0
      );
    });

    setMatches(validMatches);
    setCurrentIndex(0);
  } catch (err) {
    console.error("Error fetching matches:", err);
  } finally {
    setLoading(false);
  }
};

// ✅ Call it from a stable effect
useEffect(() => {
  const fetchMatches = async () => {
    if (matches.length > 0) {
      setLoading(false); // ✅ already cached
      return;
    }

    try {
      setLoading(true);
      const userId = auth.currentUser.uid;

      const qA = query(
        collection(db, "matches"),
        where("userA", "==", userId),
        where("isActiveA", "==", true),
        limit(10)
      );

      const qB = query(
        collection(db, "matches"),
        where("userB", "==", userId),
        where("isActiveB", "==", true),
        limit(10)
      );

      const [snapA, snapB] = await Promise.all([getDocs(qA), getDocs(qB)]);
      const matchData = [
        ...snapA.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        ...snapB.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      ];

      const validMatches = matchData.filter(match => {
      const otherProfile =
        userId === match.userA ? match.userBProfile : match.userAProfile;

      // Require at least a displayName and one media item.
      return (
        otherProfile &&
        otherProfile.displayName &&
        Array.isArray(otherProfile.media) &&
        otherProfile.media.length > 0
      );
    });

      setMatches(validMatches);
      setCurrentIndex(0);
    } catch (err) {
      console.error("Error fetching matches:", err);
    } finally {
      setLoading(false);
    }
  };

  fetchMatches();
}, []); // 👈 no dynamic values here




  const displayHeight = () => {
    if (!profile?.selfHeight) return 'Unknown';
    const feet = Math.floor(profile.selfHeight / 12);
    const inches = profile.selfHeight % 12;
    return `${feet}'${inches}"`;
  };

const handleAction = async (liked) => {
  if (currentIndex >= matches.length) return;
  const match = matches[currentIndex];
  const userId = auth.currentUser.uid;
  const matchDocRef = doc(db, 'matches', match.id);

  const isUserA = match.userA === userId;
  const updateField = isUserA ? 'likedByA' : 'likedByB';

  await updateDoc(matchDocRef, { [updateField]: liked });

  if (!liked) {
    await updateDoc(matchDocRef, {
      isActiveA: false,
      isActiveB: false
    });
  } else {
    const bothLiked = (isUserA ? match.likedByB : match.likedByA) === true;
    await updateDoc(matchDocRef, {
      isActiveA: false,
      isActiveB: false,
      matched: bothLiked
    });
  }

  // ✅ Remove the match from Zustand in both cases
  setMatches(prev => prev.filter((m) => m.id !== match.id));
  setCurrentIndex(prev =>
  prev >= matches.length - 1 ? 0 : prev   // jump to first card or stay in range
);

};





  if (loading) return (
  <>
    <Navbar />
    <div className="matchqueue-loading">
      <div className="loader" />
      <p>Loading your matches...</p>
    </div>
  </>
);


if (currentIndex >= matches.length) {
  return (
    <>
      <Navbar />
      <div className="no-matches-message">
        <h2>No matches available</h2>
      </div>
    </>
  );
}

  const match = matches[currentIndex];
  const userId = auth.currentUser.uid;
  const profile = userId === match.userA 
  ? match.userBProfile 
  : match.userAProfile;


  if (!profile) {
  return (
    <>
      <Navbar />
      <div className="no-matches-message">
        <h2>No matches available</h2>
      </div>
    </>
  );
}

  return (
    <div id="root">
      <Navbar />
      {/* jungle veil over the entire top area */}
      <div className="jungle-veil" />

     <header className="queue-header fadeInDown">
        <h1 className="queue-title">Match&nbsp;Queue</h1>
        <div className="queue-subline">
          <span className="queue-tagline">
           Explore new potential
          </span>
          <span className="queue-count">{matches.length - currentIndex}&nbsp;cards&nbsp;left</span>
        </div>
      </header>
      <div className="fullscreen-background" />
    <div className="main-content">
    
    <div className="match-background">
      <AnimatePresence>
        <motion.div
          className="match-card"
          key={profile.uid}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -30 }}
          transition={{ duration: 0.5 }}
        >
          <div style={{
  background: 'rgba(255, 255, 255, 0.3)',
  backdropFilter: 'blur(14px)',
  borderRadius: '20px',
  padding: '20px 30px',
  marginBottom: '20px',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  boxShadow: 'inset 0 0 20px rgba(255, 255, 255, 0.1)',  // soft inner glow instead of outer shadow
  textAlign: 'center',
  transition: 'all 0.3s ease'
}}>
  <h2 style={{ margin: 0, color: '#222' }}>{profile.displayName}, {profile.age}</h2>
  <div style={{ fontSize: '1rem', color: '#666', marginTop: '5px' }}>{profile.zodiacSign}</div>
  <div style={{
    marginTop: '10px',
    padding: '5px 15px',
    background: 'rgba(255, 255, 255, 0.25)',
    borderRadius: '50px',
    color: '#333',
    fontWeight: '500',
    fontSize: '0.9rem'
  }}>{formatLookingFor(profile.lookingFor)}</div>
</div>



          <Carousel
          showThumbs={false}
          infiniteLoop
          emulateTouch
          showStatus={false}
          dynamicHeight={false}  // <-- important!
          autoFocus={false}
          swipeable={true}
          useKeyboardArrows={true}

          className="carousel-wrapper"
        >
          {(profile.media || []).map((url, index) => (
            <div key={index} className="carousel-slide">
              {url.includes('.mp4') ? (
                <video
                  src={url}
                  controls
                  className="carousel-media"
                  preload="metadata"
                />
              ) : (
                <img
                  src={url}
                  alt={`media-${index}`}
                  className="carousel-media"
                />
              )}
            </div>
          ))}
        </Carousel>

          



          <div className="interests-bubbles">
            {(profile.interests || []).map((interest, i) => (
              <span key={i} className="interest-bubble">{interest}</span>
            ))}
          </div>

          {profile.lookingFor !== "Friendship" && ( // friendship matches dont get demographics

          <div className="badges-section">
            <span className="demographic-bubble">{profile.races?.join(', ') || 'Unknown'}</span>
            <span className="demographic-bubble">{profile.religions?.join(', ') || 'None'}</span>
            <span className="demographic-bubble">{profile.politics} wing</span>
            <span className="demographic-bubble">{displayHeight()}</span>
          </div>
          )}

          <div className="prompts-section">
        {(profile.profilePrompts || []).map((promptObj, index) => (
          <div key={index} className="prompt-card">
            <strong>{promptObj.prompt}</strong>
            <p>{promptObj.answer}</p>
          </div>
        ))}
      </div>

      <div className="match-strength">
            {getMatchLabel(match.matchScore || 0)}
          </div>


          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '30px' }}>
  <button style={{
    background: 'rgba(255, 255, 255, 0.3)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    padding: '15px 40px',
    borderRadius: '50px',
    color: '#222',
    fontWeight: '600',
    fontSize: '1.1rem',
    boxShadow: 'inset 0 0 20px rgba(255, 255, 255, 0.15)',
    transition: 'transform 0.2s ease'
  }}
  onMouseOver={e => e.currentTarget.style.transform = 'scale(1.03)'}
  onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
  onClick={() => handleAction(false)}
>
    ❌ Pass
  </button>

  <button style={{
    background: 'rgba(255, 255, 255, 0.3)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    padding: '15px 40px',
    borderRadius: '50px',
    color: '#222',
    fontWeight: '600',
    fontSize: '1.1rem',
    boxShadow: 'inset 0 0 20px rgba(255, 255, 255, 0.15)',
    transition: 'transform 0.2s ease'
  }}
  onMouseOver={e => e.currentTarget.style.transform = 'scale(1.03)'}
  onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
  onClick={() => handleAction(true)}
>
    💖 Like
  </button>
</div>


        </motion.div>
      </AnimatePresence>
    </div>
    </div>
    </div>
  );
}

// Utility functions (same as before)
function calculateAge(birthdate) {
  if (!birthdate) return "Unknown";
  const today = new Date();
  const birth = new Date(birthdate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function formatLookingFor(val) {
  if (val === "Friendship") return "Friendship";
  if (val === "Dating") return "Dating";
  if (val === "Both") return "Friendship & Dating";
  return "Unknown";
}

const getMatchLabel = (score) => {
  if (score >= 80) return "woah";
  if (score >= 65) return "Amazing Match 💞";
  if (score >= 30) return "Great Match 🔥";
  if (score >= 0) return "Good Potential ✨";
  return "Might Not Be A Fit 🤔";
};

function arraySafe(val) { return Array.isArray(val) ? val : []; }
