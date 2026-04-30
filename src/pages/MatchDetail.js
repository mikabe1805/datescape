import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Carousel } from "react-responsive-carousel";
import { motion } from "framer-motion";
import { ArrowLeft, Flag, Heart, MessageCircle, X } from "lucide-react";
import "react-responsive-carousel/lib/styles/carousel.min.css";
import "../styles.css";
import { auth, db } from "../firebase";
import MatchOptionsMenu from "../components/MatchOptionsMenu";
import { parseCombinedIds } from "../utils/MatchIds";
import { reportPhoto } from "../utils/MatchActions";

function formatHeight(height) {
  if (!height) return "Unknown";
  const feet = Math.floor(height / 12);
  const inches = height % 12;
  return `${feet}'${inches}"`;
}

export default function MatchDetail() {
  const { combinedIds } = useParams();
  const currentUserId = auth.currentUser?.uid;
  const { otherId: userId, matchId } = parseCombinedIds(combinedIds, currentUserId);
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [matchData, setMatchData] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setProfile(userSnap.data());
        }

        const matchRef = doc(db, "matches", matchId);
        const matchSnap = await getDoc(matchRef);
        if (matchSnap.exists()) {
          setMatchData(matchSnap.data());
        }
      } catch (error) {
        console.error("Error fetching user:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [matchId, userId]);

  const handleDecision = async (liked) => {
    if (!matchData || !currentUserId) return;

    const isUserA = matchData.userA === currentUserId;
    const matchRef = doc(db, "matches", matchId);
    const payload = {
      [isUserA ? "likedByA" : "likedByB"]: liked,
      [isUserA ? "isActiveA" : "isActiveB"]: false
    };

    if (liked && (isUserA ? matchData.likedByB : matchData.likedByA)) {
      payload.matched = true;
      payload.isActiveA = false;
      payload.isActiveB = false;
    }

    await updateDoc(matchRef, payload);
    navigate("/app/match-queue");
  };

  if (loading) {
    return (
      <div className="loader-center">
        <div className="loader" />
      </div>
    );
  }

  if (!profile) {
    return <p className="mt-10 text-center text-amber-100">User not found</p>;
  }

  return (
    <div className="match-detail-page">
      <div className="match-queue-container">
        <div className="jungle-veil" />
        <div className="fullscreen-background" />

        <div className="main-content">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="swipe-card-glass relative"
          >
            <div className="mb-4 flex items-center justify-between">
              <button
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-white/14"
              >
                <ArrowLeft size={16} />
                Back
              </button>
              <MatchOptionsMenu
                matchId={matchId}
                otherUserId={userId}
                onAction={(action) => {
                  if (action === "Block" || action === "Unmatch") {
                    navigate("/app/matches");
                  }
                }}
              />
            </div>

            <div className="card-header-glass">
              <h2>{profile.displayName || profile.username}, {profile.age}</h2>
              <div>{profile.zodiacSign}</div>
              <div className="lookingfor-tag">{profile.lookingFor}</div>
            </div>

            <Carousel showThumbs={false} infiniteLoop emulateTouch showStatus={false}>
              {(profile.media || []).map((url, index) => (
                <div key={index} className="carousel-slide carousel-slide--reportable">
                  {url.includes(".mp4") ? (
                    <video src={url} controls className="carousel-media" preload="metadata" />
                  ) : (
                    <img src={url} alt={`media-${index}`} className="carousel-media" />
                  )}
                  <button
                    type="button"
                    className="carousel-report-btn"
                    aria-label="Report this photo"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const reason = window.prompt("Report this photo — what's wrong? (optional)") ?? null;
                      if (reason === null) return;
                      try {
                        await reportPhoto(userId, url, reason || null);
                        alert("Thanks — our team will review this photo.");
                      } catch (error) {
                        console.error("Photo report failed", error);
                        alert("Couldn't submit the report. Try again in a moment.");
                      }
                    }}
                  >
                    <Flag size={14} />
                    Report photo
                  </button>
                </div>
              ))}
            </Carousel>

            <div className="interests-bubbles">
              {(profile.interests || []).map((interest, index) => (
                <span key={index} className="interest-bubble">{interest}</span>
              ))}
            </div>

            {profile.lookingFor !== "Friendship" && (
              <div className="badges-section">
                <span className="demographic-bubble">{(profile.ethnicities || profile.races)?.join(", ") || "Unknown"}</span>
                <span className="demographic-bubble">{profile.religions?.join(", ") || "None"}</span>
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

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              {matchData?.matched ? (
                <button
                  onClick={() => navigate(`/app/chat/${matchId}`)}
                  className="glass-button px-6 py-3 text-base"
                >
                  <span className="inline-flex items-center gap-2">
                    <MessageCircle size={18} />
                    Open Chat
                  </span>
                </button>
              ) : (
                <>
                  <button
                    onClick={() => handleDecision(false)}
                    className="glass-button px-6 py-3 text-base"
                  >
                    <span className="inline-flex items-center gap-2">
                      <X size={18} />
                      Pass
                    </span>
                  </button>
                  <button
                    onClick={() => handleDecision(true)}
                    className="glass-button px-6 py-3 text-base"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Heart size={18} />
                      Like
                    </span>
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
