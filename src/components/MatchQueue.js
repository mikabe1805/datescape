import React, { useCallback, useEffect, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, query, updateDoc, where } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { Carousel } from "react-responsive-carousel";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { useMatchStore } from "./MatchStore";
import "react-responsive-carousel/lib/styles/carousel.min.css";
import "../styles.css";

const RELOAD_FLAG = "matchQueueSoftReloaded";

function formatHeight(height) {
  if (!height) return "Unknown";
  const feet = Math.floor(height / 12);
  const inches = height % 12;
  return `${feet}'${inches}"`;
}

function getMatchLabel(score) {
  if (score >= 80) return "You should probably match.";
  if (score >= 65) return "Amazing match";
  if (score >= 30) return "Great match";
  if (score >= 0) return "Good potential";
  return "Probably not a fit";
}

export default function MatchQueue() {
  const { matches, setMatches } = useMatchStore();
  const currentUserId = auth.currentUser?.uid;
  const navigate = useNavigate();
  const matchCardRef = useRef(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(matches.length === 0);
  const [swipeDirection, setSwipeDirection] = useState("right");
  const hasFetchedOnce = useRef(false);

  const attemptSoftReload = useCallback((reason = "") => {
    if (sessionStorage.getItem(RELOAD_FLAG)) return;
    console.log("Soft reload:", reason);
    sessionStorage.setItem(RELOAD_FLAG, "true");
    setTimeout(() => window.location.reload(), 1200);
  }, []);

  const fetchMatches = useCallback(async () => {
    if (!currentUserId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const queryA = query(
        collection(db, "matches"),
        where("userA", "==", currentUserId),
        where("isActiveA", "==", true),
        limit(10)
      );
      const queryB = query(
        collection(db, "matches"),
        where("userB", "==", currentUserId),
        where("isActiveB", "==", true),
        limit(10)
      );

      const [snapA, snapB] = await Promise.all([getDocs(queryA), getDocs(queryB)]);
      const allMatches = [...snapA.docs, ...snapB.docs].map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      const validMatches = allMatches.filter((match) => {
        const otherProfile =
          currentUserId === match.userA ? match.userBProfile : match.userAProfile;
        return (
          otherProfile &&
          (otherProfile.displayName || otherProfile.username) &&
          Array.isArray(otherProfile.media) &&
          otherProfile.media.length > 0
        );
      });

      hasFetchedOnce.current = true;

      if (!validMatches.length) {
        setLoading(false);
        attemptSoftReload("fetch-empty");
        return;
      }

      sessionStorage.removeItem(RELOAD_FLAG);
      setMatches(validMatches);
      setCurrentIndex(0);
    } catch (error) {
      console.error("Error fetching matches:", error);
    } finally {
      setLoading(false);
    }
  }, [attemptSoftReload, currentUserId, setMatches]);

  useEffect(() => {
    const justLoggedIn = sessionStorage.getItem("justLoggedIn");
    if (justLoggedIn) {
      sessionStorage.removeItem("justLoggedIn");
      attemptSoftReload("post-login");
      return;
    }

    if (!matches.length) {
      fetchMatches();
      return;
    }

    setLoading(false);
  }, [attemptSoftReload, fetchMatches, matches.length]);

  useEffect(() => {
    if (hasFetchedOnce.current && matches.length === 0 && !loading) {
      attemptSoftReload("queue-exhausted");
    }
  }, [attemptSoftReload, loading, matches.length]);

  useEffect(() => {
    if (matches.length > 0) {
      setLoading(false);
    }
  }, [matches.length]);

  const handleAction = async (liked) => {
    const queuedMatch = matches[currentIndex];
    if (!queuedMatch || !currentUserId) return;

    setSwipeDirection(liked ? "right" : "left");
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    const matchRef = doc(db, "matches", queuedMatch.id);
    const snapshot = await getDoc(matchRef);

    if (!snapshot.exists()) {
      setMatches((prev) => prev.filter((match) => match.id !== queuedMatch.id));
      return;
    }

    const match = snapshot.data();
    const isUserA = match.userA === currentUserId;
    const likeField = isUserA ? "likedByA" : "likedByB";
    const activeField = isUserA ? "isActiveA" : "isActiveB";
    const otherLiked = isUserA ? match.likedByB : match.likedByA;

    const updates = {
      [likeField]: liked,
      [activeField]: false
    };

    if (liked && otherLiked) {
      updates.isActiveA = false;
      updates.isActiveB = false;
      updates.matched = true;
    }

    await updateDoc(matchRef, updates);
    setMatches((prev) => prev.filter((matchItem) => matchItem.id !== queuedMatch.id));
  };

  if (loading) {
    return (
      <div className="matchqueue-loading">
        <div className="loader" />
        <p>Loading your matches...</p>
      </div>
    );
  }

  if (!matches.length) {
    return (
      <div className="no-matches-message">
        <h2>No matches available</h2>
        <p>We are refreshing your queue. Update your profile if this keeps happening.</p>
        <div className="no-matches-actions">
          <button className="glass-button" onClick={() => window.location.reload()}>
            Refresh
          </button>
          <button className="glass-button" onClick={() => navigate("/app/profile")}>
            Edit Profile
          </button>
        </div>
      </div>
    );
  }

  const currentMatch = matches[Math.min(currentIndex, matches.length - 1)];
  const profile =
    currentUserId === currentMatch.userA
      ? currentMatch.userBProfile
      : currentMatch.userAProfile;

  return (
    <div className="match-queue-page">
      <div className="match-queue-container">
        <div className="jungle-veil" />
        <header className="queue-header fadeInDown">
          <h1 className="queue-title">Match Queue</h1>
          <div className="queue-subline">
            <span className="queue-tagline">Explore new potential</span>
            <span>{matches.length} cards left</span>
          </div>
        </header>
        <div className="fullscreen-background" style={{ willChange: "transform" }} />
        <div className="main-content">
          <div className="match-background">
            <AnimatePresence>
              <motion.div
                ref={matchCardRef}
                key={currentMatch.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  x: swipeDirection === "right" ? 300 : -300,
                  opacity: 0,
                  rotate: swipeDirection === "right" ? 10 : -10
                }}
                transition={{ duration: 0.3 }}
                className="swipe-card-glass"
                style={{ willChange: "transform" }}
                whileHover={{ rotateZ: -0.4, rotateX: 1, rotateY: -1 }}
                whileTap={{ scale: 0.99 }}
              >
                <div className="card-header-glass">
                  <h2>
                    {profile.displayName || profile.username}, {profile.age}
                  </h2>
                  <div>{profile.zodiacSign}</div>
                  <div className="lookingfor-tag">{profile.lookingFor}</div>
                </div>

                <Carousel
                  showThumbs={false}
                  infiniteLoop
                  emulateTouch
                  showStatus={false}
                  dynamicHeight={false}
                  className="carousel-wrapper"
                >
                  {(profile.media || []).map((url, index) => (
                    <div key={index} className="carousel-slide">
                      {url.includes(".mp4") ? (
                        <video src={url} controls className="carousel-media" preload="metadata" />
                      ) : (
                        <img src={url} alt={`media-${index}`} className="carousel-media" />
                      )}
                    </div>
                  ))}
                </Carousel>

                <div className="interests-bubbles">
                  {(profile.interests || []).map((interest, index) => (
                    <span key={index} className="interest-bubble">
                      {interest}
                    </span>
                  ))}
                </div>

                {profile.lookingFor !== "Friendship" && (
                  <div className="badges-section">
                    <span className="demographic-bubble">
                      {(profile.ethnicities || profile.races)?.join(", ") || "Unknown"}
                    </span>
                    <span className="demographic-bubble">
                      {profile.religions?.join(", ") || "None"}
                    </span>
                    <span className="demographic-bubble">{profile.politics} wing</span>
                    <span className="demographic-bubble">{formatHeight(profile.selfHeight)}</span>
                  </div>
                )}

                <div className="prompts-section">
                  {(profile.profilePrompts || []).map((prompt, index) => (
                    <div key={index} className="prompt-card">
                      <strong>{prompt.prompt}</strong>
                      <p>{prompt.answer}</p>
                    </div>
                  ))}
                </div>

                <div className="match-strength">
                  {getMatchLabel(currentMatch.matchScore || 0)}
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    gap: "20px",
                    marginTop: "30px"
                  }}
                >
                  <button className="glass-button ripple" onClick={() => handleAction(false)}>
                    Pass
                  </button>
                  <button className="glass-button ripple" onClick={() => handleAction(true)}>
                    Like
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
