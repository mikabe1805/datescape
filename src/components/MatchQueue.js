import React, { useEffect, useState, useCallback, useRef } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, limit, runTransaction, startAfter } from 'firebase/firestore';
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
  const [totalMatches, setTotalMatches] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [swipeDirection, setSwipeDirection] = useState("right");
  const [reloadTriggered, setReloadTriggered] = useState(false);
  const [showNoMatchesMessage, setShowNoMatchesMessage] = useState(false);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const hasReloaded = useRef(false);
  const RELOAD_FLAG = "matchQueueSoftReloaded";









  const fetchMatches = async () => {
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
      ...snapA.docs.map(d => ({ id: d.id, ...d.data() })),
      ...snapB.docs.map(d => ({ id: d.id, ...d.data() })),
    ];

    const valid = matchData.filter(m => {
      const other = userId === m.userA ? m.userBProfile : m.userAProfile;
      return other && other.displayName && Array.isArray(other.media) && other.media.length > 0;
    });

    setHasFetchedOnce(true); // ✅ flag set after fetch completes

    if (valid.length === 0) {
  // If we’ve never reloaded in this tab, do it once
    if (!sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, "true");
      setShowNoMatchesMessage(true);
      setTimeout(() => window.location.reload(), 1500);
    }
    // Either we just scheduled a reload, or we already did it earlier.
    // In both cases, just return so we don’t loop.
    return;
  }

  // ✅ We got matches → clear the flag so next real “empty” state can reload again.
  sessionStorage.removeItem(RELOAD_FLAG);


    setMatches(valid);
    setCurrentIndex(0);
  } catch (err) {
    console.error("Error fetching matches:", err);
  } finally {
    setLoading(false);
  }
};






// ✅ Call it from a stable effect
useEffect(() => {
  const justSignedUp = sessionStorage.getItem("justSignedUp");
  if (justSignedUp) {
    sessionStorage.removeItem("justSignedUp");
    const checkAuth = setInterval(() => {
      if (auth.currentUser) {
        clearInterval(checkAuth);
        window.location.reload();
      }
    }, 100);
    return;
  }
 if (matches.length > 0) {
    // We already have matches from Zustand → skip spinner
    setLoading(false);
    return;
  }

  fetchMatches();
}, []);











  const displayHeight = () => {
    if (!profile?.selfHeight) return 'Unknown';
    const feet = Math.floor(profile.selfHeight / 12);
    const inches = profile.selfHeight % 12;
    return `${feet}'${inches}"`;
  };

const handleAction = async (liked) => {
  if (currentIndex >= matches.length) return;

  if (liked) {
    setSwipeDirection("right");
  } else {
    setSwipeDirection("left");
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const match = matches[currentIndex];
  const userId = auth.currentUser.uid;
  const matchDocRef = doc(db, 'matches', match.id);

  const isUserA = match.userA === userId;
  const updateField = isUserA ? 'likedByA' : 'likedByB';
  const activeField = isUserA ? 'isActiveA' : 'isActiveB';

  try {
    // Step 1: Save the user’s action
    await updateDoc(matchDocRef, { [updateField]: liked });

    // Step 2: Update active status for this user
    const updatePayload = { [activeField]: false };

    // If both liked, flag as matched and deactivate for both
    const otherLiked = isUserA ? match.likedByB : match.likedByA;
    if (liked && otherLiked) {
      updatePayload.isActiveA = false;
      updatePayload.isActiveB = false;
      updatePayload.matched = true;
    }

    await updateDoc(matchDocRef, updatePayload);

    setMatches(prev => prev.filter(m => m.id !== match.id));
    // Step 4: Adjust index if needed
    // setCurrentIndex(prev =>
    //   prev >= matches.length - 1 ? 0 : prev
    // );
  } catch (err) {
    console.error("Error processing action:", err);
    alert("Something went wrong. Please try again.");
  }
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
      <div className="match-queue-container">
      <div className="jungle-veil" />

     <header className="queue-header fadeInDown">
        <h1 className="queue-title">Match&nbsp;Queue</h1>
        <div className="queue-subline">
          <span className="queue-tagline">
           Explore new potential
          </span>
          <span>{matches.length} cards left</span>
        </div>
      </header>
      <div className="fullscreen-background" />
    <div className="main-content">
    
    <div className="match-background">
      <AnimatePresence>
      <motion.div
        key={matches[currentIndex].id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{
          x: swipeDirection === "right" ? 300 : -300,
          opacity: 0,
          rotate: swipeDirection === "right" ? 10 : -10,
        }}
        transition={{ duration: 0.4 }}
        className="swipe-card-glass" // <- or make a new class just for this
      >

<div className="card-header-glass">
  <h2>{profile.displayName}, {profile.age}</h2>
  <div>{profile.zodiacSign}</div>
  <div className="lookingfor-tag">{formatLookingFor(profile.lookingFor)}</div>
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
          <button className="glass-button" onClick={() => handleAction(false)}>❌ Pass</button>
          <button className="glass-button" onClick={() => handleAction(true)}>💖 Like</button>


          </div>


        </motion.div>
        {showNoMatchesMessage && (
          <div className="no-matches-transition">
            <p>No matches left... checking for new ones 🔄</p>
          </div>
        )}

      </AnimatePresence>
    </div>
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
  if (score >= 80) return "woah, you guys gotta match.";
  if (score >= 65) return "Amazing Match 💞";
  if (score >= 30) return "Great Match 🔥";
  if (score >= 0) return "Good Potential ✨";
  return "Might Not Be A Fit 🤔";
};

function arraySafe(val) { return Array.isArray(val) ? val : []; }
