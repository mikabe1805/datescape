import React, { useCallback, useEffect, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, query, updateDoc, where } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { Carousel } from "react-responsive-carousel";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { generateMatchesForUser } from "../firebase/generateMatchesForUser";
import { useMatchStore } from "./MatchStore";
import { distanceBetween } from "../utils/MatchingEngine";
import { DISTANCE_NO_LIMIT } from "../utils/geo";
import { submitMatchDecision } from "../utils/MatchActions";
import { isVideoMedia, mediaUrl } from "../utils/MediaUtils";
import "react-responsive-carousel/lib/styles/carousel.min.css";
import "../styles.css";

function intentLabel(lookingFor) {
  const lc = (lookingFor || "").toLowerCase();
  if (lc === "friendship") return { text: "Friendship", className: "intent-pill intent-pill--friendship" };
  if (lc === "dating") return { text: "Dating", className: "intent-pill intent-pill--dating" };
  if (lc === "both") return { text: "Friends or dating", className: "intent-pill intent-pill--both" };
  return null;
}

function formatDistanceMiles(miles) {
  if (typeof miles !== "number" || !Number.isFinite(miles)) return null;
  if (miles < 1) return "<1 mi away";
  if (miles < 10) return `${miles.toFixed(1)} mi away`;
  return `${Math.round(miles)} mi away`;
}

// How many candidates per side we pull from Firestore in one go. Each side
// query (userA / userB) caps at this, so the realised queue is up to 2× this.
// 10 was leftover from when we hadn't built proper empty-state CTAs and a
// reload-on-empty fallback hid the cliff; with the new banners + CTAs the
// limit can be much more generous without blowing up the read budget.
const QUEUE_FETCH_LIMIT = 50;

// One-shot grace window after login: matches are generated fire-and-forget on
// sign-in, so the very first fetch can land before they're in Firestore.
// This is in milliseconds — short enough to feel instant, long enough that
// most generation runs finish first.
const POST_LOGIN_RETRY_MS = 1500;

function formatHeight(height) {
  if (!height) return "Unknown";
  const feet = Math.floor(height / 12);
  const inches = height % 12;
  return `${feet}'${inches}"`;
}

// Mirrors the required-field check in `generateMatchesForUser` so we can warn
// the user when their own profile is excluded from other users' queues.
const REQUIRED_FIELDS = [
  { key: "displayName", label: "name", isMissing: (p) => !(p.displayName || p.name) },
  { key: "age", label: "age", isMissing: (p) => !p.age },
  { key: "gender", label: "gender", isMissing: (p) => !p.gender },
  { key: "lookingFor", label: "looking-for", isMissing: (p) => !p.lookingFor },
  { key: "media", label: "a photo", isMissing: (p) => !Array.isArray(p.media) || p.media.length === 0 },
];

const ENCOURAGED_FIELDS = [
  {
    key: "location",
    label: "location",
    isMissing: (p) =>
      typeof p.location?.lat !== "number" || typeof p.location?.lng !== "number",
  },
];

function listMissing(fields, profile) {
  return fields.filter((f) => f.isMissing(profile)).map((f) => f.label);
}

function joinNatural(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
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
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState(null);

  useEffect(() => {
    if (!currentUserId) return;
    getDoc(doc(db, "users", currentUserId))
      .then((snap) => {
        if (snap.exists()) setCurrentUserProfile({ uid: currentUserId, ...snap.data() });
      })
      .catch(() => {});
  }, [currentUserId]);

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
        limit(QUEUE_FETCH_LIMIT)
      );
      const queryB = query(
        collection(db, "matches"),
        where("userB", "==", currentUserId),
        where("isActiveB", "==", true),
        limit(QUEUE_FETCH_LIMIT)
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

      setMatches(validMatches);
      setCurrentIndex(0);
    } catch (error) {
      console.error("Error fetching matches:", error);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, setMatches]);

  useEffect(() => {
    if (!matches.length) {
      fetchMatches();
      return;
    }
    setLoading(false);
  }, [fetchMatches, matches.length]);

  // Matches are generated fire-and-forget at login, so the very first fetch
  // can race the writes. If we just logged in and came up empty, give the
  // backfill one polite retry before showing the empty state.
  useEffect(() => {
    if (sessionStorage.getItem("justLoggedIn") !== "true") return undefined;
    sessionStorage.removeItem("justLoggedIn");
    const timer = setTimeout(() => {
      fetchMatches();
    }, POST_LOGIN_RETRY_MS);
    return () => clearTimeout(timer);
  }, [fetchMatches]);

  useEffect(() => {
    if (matches.length > 0) {
      setLoading(false);
    }
  }, [matches.length]);

  const handleAction = async (liked) => {
    const queuedMatch = matches[currentIndex];
    if (!queuedMatch || !currentUserId || decisionBusy) return;

    setSwipeDirection(liked ? "right" : "left");
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    setDecisionBusy(true);
    setDecisionError(null);
    try {
      await submitMatchDecision(queuedMatch.id, liked ? "like" : "pass");
      setMatches((prev) =>
        prev.filter((matchItem) => matchItem.id !== queuedMatch.id),
      );
    } catch (error) {
      console.warn("Match response failed", error);
      setDecisionError(
        "That response could not be saved. Check your connection and try again.",
      );
    } finally {
      setDecisionBusy(false);
    }
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
    const currentDistMax = Number(currentUserProfile?.distMax);
    const canWidenDistance =
      Number.isFinite(currentDistMax) && currentDistMax < DISTANCE_NO_LIMIT;
    const widenDistance = async () => {
      if (!currentUserId) return;
      try {
        await updateDoc(doc(db, "users", currentUserId), {
          distMax: DISTANCE_NO_LIMIT,
        });
        await generateMatchesForUser(
          { ...currentUserProfile, uid: currentUserId, distMax: DISTANCE_NO_LIMIT },
          currentUserId,
        );
        setCurrentUserProfile((current) => ({
          ...current,
          distMax: DISTANCE_NO_LIMIT,
        }));
        await fetchMatches();
      } catch (error) {
        console.error("Failed to widen distance", error);
      }
    };

    return (
      <div className="queue-empty-state">
        <p className="queue-empty-state__eyebrow">Match Queue</p>
        <h2>Nothing queued here yet.</h2>
        <p>
          We are refreshing your queue. If this keeps happening, tighten the profile details that
          matter most and check back in a minute.
        </p>
        <div className="queue-empty-state__actions">
          <button className="queue-empty-state__primary" onClick={() => window.location.reload()}>
            Refresh Queue
          </button>
          {canWidenDistance && (
            <button className="queue-empty-state__secondary" onClick={widenDistance}>
              Widen Distance
            </button>
          )}
          <button className="queue-empty-state__secondary" onClick={() => navigate("/app/profile")}>
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
          <div className="queue-header__title-row">
            <h1 className="queue-title">Introductions</h1>
            <button type="button" className="queue-likes-link" onClick={() => navigate("/app/likes")}>See likes</button>
          </div>
          <div className="queue-subline">
            <span className="queue-tagline">A quieter way to discover people</span>
            <span>{matches.length} introductions</span>
          </div>
        </header>
        {currentUserProfile && (() => {
          const missingRequired = listMissing(REQUIRED_FIELDS, currentUserProfile);
          const missingEncouraged = listMissing(ENCOURAGED_FIELDS, currentUserProfile);
          if (!missingRequired.length && !missingEncouraged.length) return null;

          const totalFields = REQUIRED_FIELDS.length + ENCOURAGED_FIELDS.length;
          const completeFields = totalFields - missingRequired.length - missingEncouraged.length;
          const percent = Math.round((completeFields / totalFields) * 100);

          let title;
          let description;
          if (missingRequired.length) {
            title = `Profile ${percent}% complete — finish to be visible`;
            description = `Add ${joinNatural(missingRequired)} so other users can match with you.${
              missingEncouraged.length ? ` Also missing: ${joinNatural(missingEncouraged)}.` : ""
            }`;
          } else {
            title = "Add your location";
            description =
              "Your distance filter is off until you share where you are. Match quality improves once you do.";
          }

          return (
            <div className="queue-location-banner">
              <div>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
              <button
                type="button"
                className="queue-location-banner__btn"
                onClick={() => navigate("/app/profile")}
              >
                {missingRequired.length ? "Finish profile" : "Set location"}
              </button>
            </div>
          );
        })()}
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
                    {profile.displayName || profile.username}
                    {profile.age ? <span className="match-age">, {profile.age}</span> : null}
                  </h2>
                  <div className="match-meta-row">
                    {(() => {
                      const intent = intentLabel(profile.lookingFor);
                      return intent ? (
                        <span className={intent.className}>{intent.text}</span>
                      ) : null;
                    })()}
                    {(() => {
                      const miles =
                        typeof currentMatch.distanceMiles === "number"
                          ? currentMatch.distanceMiles
                          : currentUserProfile
                            ? distanceBetween(currentUserProfile, profile)
                            : null;
                      const formatted = formatDistanceMiles(miles);
                      return formatted ? (
                        <span className="match-distance-pill">{formatted}</span>
                      ) : null;
                    })()}
                    {profile.zodiacSign && (
                      <span className="zodiac-tag">{profile.zodiacSign}</span>
                    )}
                  </div>
                </div>

                <Carousel
                  showThumbs={false}
                  infiniteLoop
                  emulateTouch
                  showStatus={false}
                  dynamicHeight={false}
                  className="carousel-wrapper"
                >
                  {(profile.media || []).map((media, index) => (
                    <div key={index} className="carousel-slide">
                      {isVideoMedia(media) ? (
                        <video src={mediaUrl(media)} controls className="carousel-media" preload="metadata" />
                      ) : (
                        <img src={mediaUrl(media)} alt={`media-${index}`} className="carousel-media" />
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
                  <button
                    className="glass-button ripple"
                    onClick={() => handleAction(false)}
                    disabled={decisionBusy}
                  >
                    Pass
                  </button>
                  <button
                    className="glass-button ripple"
                    onClick={() => handleAction(true)}
                    disabled={decisionBusy}
                  >
                    Like
                  </button>
                </div>
                {decisionError ? (
                  <p className="matchqueue-decision-error" role="alert">
                    {decisionError}
                  </p>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
