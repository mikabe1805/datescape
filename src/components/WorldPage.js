import React from "react";
import "../styles.css";

export default function WorldPage() {
  return (
    <div className="media-upload-page" style={{ minHeight: '100vh' }}>
      <div className="swipe-card-glass" style={{ maxWidth: 720 }}>
        <div className="card-header-glass">
          <h2>Explore World</h2>
          <div className="lookingfor-tag">Coming soon</div>
        </div>
        <p className="subtitle" style={{ marginBottom: 16 }}>
          We’re crafting a beautiful virtual space to meet, play, and hang out.
        </p>
        <p style={{ color: '#36554c' }}>
          Avatars, mini-games, and shared activities are on the way. Stay tuned!
        </p>
        <div className="hero-buttons" style={{ marginTop: 24 }}>
          <button className="glass-button" onClick={() => window.history.back()}>Back</button>
        </div>
      </div>
    </div>
  );
}


