// MatchDetail.js
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { Carousel } from "react-responsive-carousel";
import { motion } from "framer-motion";
import Navbar from "../components/Navbar";
import 'react-responsive-carousel/lib/styles/carousel.min.css';
import '../styles.css';
import MatchOptionsMenu from "../components/MatchOptionsMenu";
import { parseCombinedIds } from "../utils/MatchIds";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react"; // or any icon


export default function MatchDetail() {
  const { combinedIds } = useParams();     
  const currentUserId = auth.currentUser?.uid;
  const { otherId: userId, matchId } = parseCombinedIds(combinedIds, currentUserId);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [matchData, setMatchData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const ref = doc(db, "users", userId);
        const snap = await getDoc(ref);
        if (snap.exists()) setProfile(snap.data());
        const matchRef = doc(db, "matches", matchId);
        const matchSnap = await getDoc(matchRef);
        if (matchSnap.exists()) {
          setMatchData(matchSnap.data());
        }

      } catch (err) {
        console.error("Error fetching user:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [userId]);

  const displayHeight = () => {
    if (!profile?.selfHeight) return 'Unknown';
    const ft = Math.floor(profile.selfHeight / 12);
    const inch = profile.selfHeight % 12;
    return `${ft}'${inch}"`;
  };

  if (loading) return (<><Navbar /><div className="loader-center"><div className="loader" /></div></>);
  if (!profile) return (<><Navbar /><p className="text-center mt-10">User not found</p></>);

  return (
    <div id="root">
      <Navbar />
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
            <MatchOptionsMenu matchId={matchId} otherUserId={profile.id} />

            <div className="card-header-glass">
              <h2>{profile.displayName || profile.username}, {profile.age}</h2>
              <div>{profile.zodiacSign}</div>
              <div className="lookingfor-tag">{profile.lookingFor}</div>
            </div>

            <Carousel showThumbs={false} infiniteLoop emulateTouch showStatus={false}>
              {(profile.media || []).map((url, i) => (
                <div key={i} className="carousel-slide">
                  {url.includes(".mp4") ? (
                    <video src={url} controls className="carousel-media" preload="metadata" />
                  ) : (
                    <img src={url} alt={`media-${i}`} className="carousel-media" />
                  )}
                </div>
              ))}
            </Carousel>

            <div className="interests-bubbles">
              {(profile.interests || []).map((int, i) => (
                <span key={i} className="interest-bubble">{int}</span>
              ))}
            </div>

            {profile.lookingFor !== "Friendship" && (
              <div className="badges-section">
                <span className="demographic-bubble">{profile.races?.join(", ") || "Unknown"}</span>
                <span className="demographic-bubble">{profile.religions?.join(", ") || "None"}</span>
                <span className="demographic-bubble">{profile.politics} wing</span>
                <span className="demographic-bubble">{displayHeight()}</span>
              </div>
            )}

            <div className="prompts-section">
              {(profile.profilePrompts || []).map((p, i) => (
                <div key={i} className="prompt-card">
                  <strong>{p.prompt}</strong>
                  <p>{p.answer}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center mt-4">
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 text-sm text-gray-700 hover:text-emerald-800"
              >
                <ArrowLeft size={18} /> Back
              </button>

              {matchData?.matched ? (
                <button
                  onClick={() => navigate(`/app/chat/${matchId}`)}
                  className="glass-button px-6 py-2 text-base"
                >
                  💬 Chat
                </button>
              ) : (
                <div className="flex gap-4">
                  <button
                    onClick={async () => {
                      const isUserA = matchData.userA === currentUserId;
                      const ref = doc(db, "matches", matchId);
                      const payload = {
                        [isUserA ? "likedByA" : "likedByB"]: true,
                        [isUserA ? "isActiveA" : "isActiveB"]: false,
                      };
                      if ((isUserA ? matchData.likedByB : matchData.likedByA)) {
                        payload.matched = true;
                        payload.isActiveA = false;
                        payload.isActiveB = false;
                      }
                      await updateDoc(ref, payload);
                      navigate("/app/match-queue"); // or to chat?
                    }}
                    className="glass-button px-6 py-2 text-base"
                  >
                    ❤️ Like
                  </button>

                  <button
                    onClick={async () => {
                      const isUserA = matchData.userA === currentUserId;
                      const ref = doc(db, "matches", matchId);
                      await updateDoc(ref, {
                        [isUserA ? "likedByA" : "likedByB"]: false,
                        [isUserA ? "isActiveA" : "isActiveB"]: false,
                      });
                      navigate("/app/match-queue");
                    }}
                    className="glass-button px-6 py-2 text-base"
                  >
                    ❌ Pass
                  </button>
                </div>
              )}
            </div>

          </motion.div>
        </div>
      </div>
    </div>
  );
}
