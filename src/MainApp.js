// MainApp.js
import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import MatchQueue from "./components/MatchQueue";
import ProfilePage from "./components/ProfilePage";
import LikesPage from "./components/LikesPage";     // if exists
import MatchesPage from "./components/MatchList"; // if exists
import WorldPage from "./components/WorldPage";     // if exists
import { useLocation } from "react-router-dom";

function MainApp() {
  const location = useLocation();

  return (
    <div className="main-app-wrapper">
      {location.pathname === "/app/profile" && <ProfilePage />}
      {location.pathname === "/app/match-queue" && <MatchQueue />}
      {/* add others as needed */}
      <Navbar />
    </div>
  );
}


export default MainApp;
