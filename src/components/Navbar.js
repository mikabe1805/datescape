import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Compass,
  Heart,
  Handshake,
  Globe,
  User,
} from "lucide-react";
import "../Navbar.css";

const navItems = [
  { icon: <Compass size={24} />, route: "/app/match-queue" },
  { icon: <Heart size={24} />, route: "/app/likes" },
  { icon: <Handshake size={24} />, route: "/app/matches" },
  { icon: <Globe size={24} />, route: "/app/world" },
  { icon: <User size={24} />, route: "/app/profile" },
];

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="navbar-glass">
      {navItems.map((item, index) => (
        <div
          key={index}
          className={`nav-icon-container ${location.pathname === item.route ? "active" : ""}`}
          onClick={() => navigate(item.route)}
        >
          {item.icon}
        </div>
      ))}
    </div>
  );
}

export default Navbar;