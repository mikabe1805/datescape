import React from "react";
import { Link } from "react-router-dom";
import "../styles/forest.css";

const FEATURES = [
  {
    icon: "🌲",
    title: "An open world to meet in",
    body:
      "Walk through Ember Plaza alongside other real users. Wave, talk, share a quiet bench under the lanterns.",
  },
  {
    icon: "♟",
    title: "Connect through play",
    body:
      "Sit at a chess table, request a song at the dance circle, share a cup at the lantern cart. Activities open profiles.",
  },
  {
    icon: "✨",
    title: "Real matches, real chat",
    body:
      "Mutual likes from the world land in your inbox. Pick up the conversation in chat whenever you want.",
  },
];

export default function LandingPage() {
  return (
    <div className="landing-shell">
      <div className="landing-shell__bg" aria-hidden="true" />
      <div className="landing-shell__veil" aria-hidden="true" />

      <div className="landing-shell__content">
        <header className="landing-hero">
          <div className="landing-hero__brand">DateScape</div>
          <h1 className="landing-hero__title">Meet through wandering.</h1>
          <p className="landing-hero__tagline">
            Step into a small lantern-lit plaza. Bump into people, play a quick game,
            see if you click. Less swiping, more showing up.
          </p>
          <div className="landing-hero__cta">
            <Link to="/signup">
              <button type="button" className="ds-btn ds-btn--primary">
                Create your account
              </button>
            </Link>
            <Link to="/login">
              <button type="button" className="ds-btn ds-btn--secondary">
                Log in
              </button>
            </Link>
          </div>
          <div className="landing-hero__hint">No swipe stacks · Real-time world</div>
        </header>

        <section className="landing-features">
          {FEATURES.map((f) => (
            <article key={f.title} className="landing-feature">
              <div className="landing-feature__icon">{f.icon}</div>
              <h3 className="landing-feature__title">{f.title}</h3>
              <p className="landing-feature__body">{f.body}</p>
            </article>
          ))}
        </section>

        <footer className="landing-footer">© DateScape · meet outside the swipe deck</footer>
      </div>
    </div>
  );
}
