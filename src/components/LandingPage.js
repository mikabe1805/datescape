// LandingPage.js
import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import "../styles.css";
import JungleOverlay from "./JungleOverlay";

function LandingPage() {
  useEffect(() => {
    const handleScroll = () => {
      const scroll = window.scrollY * 0.2;
      document.querySelectorAll(".parallax").forEach((el) => {
        el.style.setProperty("--scroll", `${scroll}px`);
      });
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="full-landing-wrapper">
      <div className="landing-container">
        <div className="trail-wrapper">
          <svg className="journey-path" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path
    d="M 85 3 C 75 25, 60 55, 10 85"
    className="animated-path"
    fill="none"
    stroke="#aaa"
    strokeWidth="0.5"
    vectorEffect="non-scaling-stroke"
  />
</svg>


        </div>

        <JungleOverlay />

        <img src="/icons/compass.png" alt="Compass" className="floating-icon parallax" style={{ top: '2%', left: '80%', width: '40px' }} />
        <img src="/icons/chat.png" alt="Chat" className="floating-icon parallax" style={{ top: '25%', left: '75%', width: '40px' }} />
        <img src="/icons/avatar-companion.png" alt="Companion Bot" className="floating-icon parallax" style={{ top: '55%', left: '60%', width: '40px' }} />
        <img src="/icons/heart.png" alt="Heart" className="floating-icon parallax" style={{ top: '85%', left: '10%', width: '40px' }} />

        <div className="hero">
          <h1 className="title">Welcome to DateScape</h1>
          <p className="subtitle">Virtual dating (and friendships!) taken to the next level</p>
          <div className="hero-buttons">
            <Link to="/signup">
              <button className="button primary">Create Account</button>
            </Link>

            <Link to="/login" className="button secondary">Log In</Link>
          </div>
        </div>

        <div className="about">
          <h2>About Us</h2>
          <p>
            DateScape is more than a dating app — it's a place to explore new connections in a virtual open-world.
            Whether you're looking for love or friendship, you'll find meaningful interactions through shared experiences,
            customizable avatars, and co-op mini-games designed to bring people together.
          </p>
        </div>

        <div className="avatar-section">
          <h2>Create Your Own Avatar</h2>
          <p>Start your journey by customizing your own virtual self. Pick your style, outfit, and vibe before stepping into the world of DateScape.</p>
          <Link to="/signup" className="button primary">Get Started</Link>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;