import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { auth, db, serverTimestamp } from "./firebase";
import { doc, updateDoc } from "firebase/firestore";
const Navbar = React.lazy(() => import('./components/Navbar'));
const MatchQueue = React.lazy(() => import('./components/MatchQueue'));
const ProfilePage = React.lazy(() => import('./components/ProfilePage'));
const LikesPage = React.lazy(() => import('./components/LikesPage'));
const MatchesPage = React.lazy(() => import('./components/MatchList'));
const MatchDetail = React.lazy(() => import('./pages/MatchDetail'));
const WorldPage = React.lazy(() => import('./components/WorldPage'));
const AllMatchesPage = React.lazy(() => import('./pages/AllMatchesPage'));
const ChatPage = React.lazy(() => import('./pages/ChatPage'))

function MainApp() {
  React.useEffect(() => {
    let intervalId;
    const updateHeartbeat = async () => {
      const user = auth.currentUser;
      if (!user) return;
      try {
        await updateDoc(doc(db, "users", user.uid), {
          lastActive: serverTimestamp(),
          active: document.visibilityState === "visible"
        });
      } catch (_) {}
    };
    const start = () => {
      updateHeartbeat();
      intervalId = setInterval(updateHeartbeat, 60000);
    };
    const stop = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = undefined;
    };
    const onVis = () => {
      if (document.visibilityState === "visible") start(); else stop();
    };
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      stop();
    };
  }, []);
  return (
    <div className="main-app-wrapper">
      <React.Suspense fallback={<div>Loading...</div>}>
        <Navbar />
        <Routes>
          <Route path="profile" element={<ProfilePage />} />
          <Route path="match-queue" element={<MatchQueue />} />
          <Route path="matches" element={<MatchesPage />} />
          <Route path="likes" element={<LikesPage />} />
          <Route path="match/:combinedIds" element={<MatchDetail />} />
          <Route path="chat/:matchId" element={<ChatPage />} />
          <Route path="matches/all" element={<AllMatchesPage />} />
          <Route path="*" element={<Navigate to="match-queue" replace />} />
        </Routes>
      </React.Suspense>
    </div>
  );
}

export default MainApp;
