import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import MatchQueue from "./components/MatchQueue";
import ProfilePage from "./components/ProfilePage";
import LikesPage from "./components/LikesPage";     // if exists
import MatchesPage from "./components/MatchList";   // if exists
import MatchDetail from './pages/MatchDetail';
import WorldPage from "./components/WorldPage";     // if exists
import AllMatchesPage from "./pages/AllMatchesPage";
import ChatPage from "./pages/ChatPage"

function MainApp() {
  return (
    <div className="main-app-wrapper">
      <Navbar /> {/* Always visible */}
      <Routes>
  <Route path="profile" element={<ProfilePage />} />
  <Route path="match-queue" element={<MatchQueue />} />
  <Route path="matches" element={<MatchesPage />} />
  <Route path="match/:combinedIds" element={<MatchDetail />} />
  <Route path="chat/:matchId" element={<ChatPage />} />
  <Route path="matches/all" element={<AllMatchesPage />} />
  <Route path="*" element={<Navigate to="match-queue" replace />} />
</Routes>
    </div>
  );
}

export default MainApp;
