// MatchQueue.js (performance-patched for scroll + animation)
import React, { useEffect, useState, useRef } from 'react';
import { db, auth } from '../firebase';
import { collection, writeBatch, query, orderBy, where, getDocs, doc, updateDoc, getDoc, limit, addDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { Carousel } from 'react-responsive-carousel';
import { useMatchStore } from "./MatchStore";
import Navbar from "./Navbar";
import 'react-responsive-carousel/lib/styles/carousel.min.css';
import '../styles.css';
import NotificationPopup from "./NotificationPopup";
import { Bell } from "lucide-react"; // or use a different icon set if you prefer
import { useNavigate } from "react-router-dom";


export default function MatchQueue() {
  const { matches, setMatches } = useMatchStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(matches.length === 0);
  const [swipeDirection, setSwipe] = useState("right");
  const [showNoMatchesMessage, setNoMsg] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]); // fetched notifications
  const [hasUnread, setHasUnread] = useState(false);
  const hasFetchedOnce = useRef(false);
  const matchCardRef = useRef(null);
  const RELOAD_FLAG = "matchQueueSoftReloaded";
  const navigate = useNavigate();

  const onMarkAllRead = async () => {
  if (!auth.currentUser || notifications.length === 0) return;

  const batch = writeBatch(db);

  notifications.forEach((n) => {
    if (!n.read) {
      const ref = doc(db, `users/${auth.currentUser.uid}/notifications`, n.id);
      batch.update(ref, { read: true });
    }
  });

  await batch.commit();

  const updated = notifications.map(n => ({ ...n, read: true }));
  setNotifications(updated);
  setHasUnread(false);
};

  const attemptSoftReload = (reason = "") => {
    if (!sessionStorage.getItem(RELOAD_FLAG)) {
      console.log("🔄 Soft-reload:", reason);
      sessionStorage.setItem(RELOAD_FLAG, "true");
      setNoMsg(true);
      setTimeout(() => window.location.reload(), 1200);
    }
  };

  const fetchMatches = async () => {
    try {
      setLoading(true);
      const uid = auth.currentUser.uid;

      const qA = query(collection(db, "matches"), where("userA", "==", uid), where("isActiveA", "==", true), limit(10));
      const qB = query(collection(db, "matches"), where("userB", "==", uid), where("isActiveB", "==", true), limit(10));
      const [snapA, snapB] = await Promise.all([getDocs(qA), getDocs(qB)]);

      const all = [...snapA.docs, ...snapB.docs].map(d => ({ id: d.id, ...d.data() }));
      const valid = all.filter(m => {
        const other = uid === m.userA ? m.userBProfile : m.userAProfile;
        return other && (other.displayName || other.username) && Array.isArray(other.media) && other.media.length > 0;
      });

      hasFetchedOnce.current = true;
      if (valid.length === 0) {
        setLoading(false);
        attemptSoftReload("fetch-empty");
        return;
      }

      sessionStorage.removeItem(RELOAD_FLAG);
      setMatches(valid);
      setCurrentIndex(0);
    } catch (err) {
      console.error("Error fetching matches:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotifications = async () => {
    if (!auth.currentUser) {
      console.log("❌ No current user, skipping notification fetch");
      return;
    }

    console.log("🔍 Fetching notifications for user:", auth.currentUser.uid);

    try {
      const q = query(
        collection(db, `users/${auth.currentUser.uid}/notifications`),
        orderBy("timestamp", "desc")
      );

      console.log("📋 Query path:", `users/${auth.currentUser.uid}/notifications`);

      const snapshot = await getDocs(q);
      console.log("📊 Snapshot size:", snapshot.size);
      console.log("📊 Snapshot empty:", snapshot.empty);

      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      console.log("📬 Fetched notifications:", data);
      setNotifications(data);
      setHasUnread(data.some((n) => !n.read));
    } catch (error) {
      console.error("❌ Error fetching notifications:", error);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [auth.currentUser]);


  useEffect(() => {
    const justLoggedIn = sessionStorage.getItem("justLoggedIn");
    if (justLoggedIn) {
      sessionStorage.removeItem("justLoggedIn");
      attemptSoftReload("post-login");
      return;
    }
    if (matches.length === 0) {
    fetchMatches();                 // first visit
  } else {
    setLoading(false);              // coming back with cached cards
  }
  }, []);

  useEffect(() => {
    if (hasFetchedOnce.current && matches.length === 0 && !loading) {
      attemptSoftReload("queue-exhausted");
    }
  }, [matches.length, loading]);

  // stop the spinner as soon as the store is populated
useEffect(() => {
  if (matches.length > 0) setLoading(false);
}, [matches.length]);


  const handleAction = async liked => {
    if (currentIndex >= matches.length) return;
    setSwipe(liked ? "right" : "left");

    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });



    const queued = matches[currentIndex];
    const uid = auth.currentUser?.uid;
      if (!uid) return;         // wait until auth is ready

    const ref = doc(db, "matches", queued.id);

    const snap = await getDoc(ref);
    if (!snap.exists()) {
      setMatches(prev => prev.filter(m => m.id !== queued.id));
      return;
    }
    const match = snap.data();
    const isUserA = match.userA === uid;
    const likeField = isUserA ? "likedByA" : "likedByB";
    const activeF = isUserA ? "isActiveA" : "isActiveB";
    const otherLiked = isUserA ? match.likedByB : match.likedByA;

    const payload = { [likeField]: liked, [activeF]: false };
    if (liked && otherLiked) {
      payload.isActiveA = false;
      payload.isActiveB = false;
      payload.matched = true;
    }
    await updateDoc(ref, payload);
    setMatches(prev => prev.filter(m => m.id !== queued.id));
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.read && auth.currentUser) {
      try {
        const ref = doc(db, `users/${auth.currentUser.uid}/notifications`, notif.id);
        await updateDoc(ref, { read: true });
        setNotifications((prev) => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
      } catch (e) {
        console.error('Failed to mark notification as read:', e);
      }
    }
    if (notif.type === "new_message" && notif.matchId) {
      navigate(`/app/chat/${notif.matchId}`);
    } else if (notif.type === "new_match" && notif.matchId) {
      navigate(`/app/match/${notif.matchId}`);
    }
  };

  // Mark all as read when bell is clicked
  const handleShowNotifications = () => {
    setShowNotifications((prev) => !prev);
    if (!showNotifications) {
      onMarkAllRead();
    }
  };

  if (loading) return (<><div className="absolute top-4 right-4 z-50 flex gap-2">
    <button onClick={() => setShowNotifications((prev) => !prev)} className="relative">
      <Bell className="w-8 h-8 text-white hover:text-amber-300" />
      {hasUnread && (
        <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full" />
      )}
    </button>
    {showNotifications && (
      <NotificationPopup
        notifications={notifications}
        onClose={() => setShowNotifications(false)}
        onMarkAllRead={onMarkAllRead}
        onNotificationClick={handleNotificationClick}
      />
    )}
  </div><Navbar /><div className="matchqueue-loading"><div className="loader" /><p>Loading your matches...</p></div></>);
  if (matches.length === 0) return (<><div className="absolute top-4 right-4 z-50 flex gap-2">
    <button onClick={() => setShowNotifications((prev) => !prev)} className="relative">
      <Bell className="w-8 h-8 text-white hover:text-amber-300" />
      {hasUnread && (
        <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full" />
      )}
    </button>
    {showNotifications && (
      <NotificationPopup
        notifications={notifications}
        onClose={() => setShowNotifications(false)}
        onMarkAllRead={onMarkAllRead}
        onNotificationClick={handleNotificationClick}
      />
    )}
  </div><Navbar /><div className="no-matches-message"><h2>No matches available</h2></div></>);

  const match = matches[currentIndex];
  const uid = auth.currentUser.uid;
  const profile = uid === match.userA ? match.userBProfile : match.userAProfile;

  const displayHeight = () => {
    if (!profile?.selfHeight) return 'Unknown';
    const ft = Math.floor(profile.selfHeight / 12);
    const inch = profile.selfHeight % 12;
    return `${ft}'${inch}"`;
  };

  const getMatchLabel = score => {
    if (score >= 80) return "woah, you guys gotta match.";
    if (score >= 65) return "Amazing Match 💞";
    if (score >= 30) return "Great Match 🔥";
    if (score >= 0) return "Good Potential ✨";
    return "Might Not Be A Fit 🤔";
  };

  return (
    <div id="root">
      <div className="absolute top-4 right-4 z-50 flex gap-2">
        <button onClick={() => setShowNotifications((prev) => !prev)} className="relative">
          <Bell className="w-8 h-8 text-white hover:text-amber-300" />
          {hasUnread && (
            <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full" />
          )}
        </button>
        {showNotifications && (
          <NotificationPopup
            notifications={notifications}
            onClose={() => setShowNotifications(false)}
            onMarkAllRead={onMarkAllRead}
            onNotificationClick={handleNotificationClick}
          />
        )}
      </div>


      <Navbar />
      <div className="match-queue-container">
        <div className="jungle-veil" />
        <header className="queue-header fadeInDown">
          <h1 className="queue-title">Match&nbsp;Queue</h1>
          <div className="queue-subline">
            <span className="queue-tagline">Explore new potential</span>
            <span>{matches.length} cards left</span>
          </div>
        </header>
        <div className="fullscreen-background" style={{ willChange: 'transform' }} />
        <div className="main-content">
          <div className="match-background">
            <AnimatePresence>
              <motion.div
                ref={matchCardRef}
                key={match.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ x: swipeDirection === "right" ? 300 : -300, opacity: 0, rotate: swipeDirection === "right" ? 10 : -10 }}
                transition={{ duration: 0.3 }}
                className="swipe-card-glass"
                style={{ willChange: 'transform' }}
              >
                <div className="card-header-glass">
                  <h2>{profile.displayName || profile.username}, {profile.age}</h2>
                  <div>{profile.zodiacSign}</div>
                  <div className="lookingfor-tag">{profile.lookingFor}</div>
                </div>

                <Carousel showThumbs={false} infiniteLoop emulateTouch showStatus={false} dynamicHeight={false} className="carousel-wrapper">
                  {(profile.media || []).map((url, i) => (
                    <div key={i} className="carousel-slide">
                      {url.includes('.mp4') ? (<video src={url} controls className="carousel-media" preload="metadata" />) : (<img src={url} alt={`media-${i}`} className="carousel-media" />)}
                    </div>
                  ))}
                </Carousel>

                <div className="interests-bubbles">
                  {(profile.interests || []).map((int, i) => (<span key={i} className="interest-bubble">{int}</span>))}
                </div>

                {profile.lookingFor !== "Friendship" && (
                  <div className="badges-section">
                    <span className="demographic-bubble">{profile.races?.join(', ') || 'Unknown'}</span>
                    <span className="demographic-bubble">{profile.religions?.join(', ') || 'None'}</span>
                    <span className="demographic-bubble">{profile.politics} wing</span>
                    <span className="demographic-bubble">{displayHeight()}</span>
                  </div>
                )}

                <div className="prompts-section">
                  {(profile.profilePrompts || []).map((p, i) => (<div key={i} className="prompt-card"><strong>{p.prompt}</strong><p>{p.answer}</p></div>))}
                </div>

                <div className="match-strength">{getMatchLabel(match.matchScore || 0)}</div>

                <div style={{ display:'flex', justifyContent:'center', gap:'20px', marginTop:'30px' }}>
                  <button className="glass-button" onClick={() => handleAction(false)}>❌ Pass</button>
                  <button className="glass-button" onClick={() => handleAction(true)}>💖 Like</button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}