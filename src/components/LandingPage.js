import React from "react";
import { Link } from "react-router-dom";
import { Compass, MessageCircle, UsersRound } from "lucide-react";
import "../styles/forest.css";

const FEATURES = [
  {
    Icon: Compass,
    title: "A world designed for meeting",
    body: "Wander Afterlight Shore alongside other real people. Choose your pace, approach with consent, and let the world give you something to talk about.",
  },
  {
    Icon: UsersRound,
    title: "Meet through shared moments",
    body: "Arrive through the Conservatory, settle into a guided moment at Lantern Market, then follow the music toward Resonance Garden.",
  },
  {
    Icon: MessageCircle,
    title: "Real matches, real chat",
    body: "Private Sparks become connections only when they are mutual. Continue in chat whenever both of you want.",
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
            Step onto Afterlight Shore, an evening route from the glass Arrival
            Conservatory through Lantern Market to Resonance Garden, designed
            for low-pressure encounters and the possibility of staying a little
            longer.
          </p>
          <div className="landing-hero__cta">
            <Link to="/signup" className="ds-btn ds-btn--primary">
              Create your account
            </Link>
            <Link to="/login" className="ds-btn ds-btn--secondary">
              Log in
            </Link>
            <Link
              to="/afterlight"
              className="ds-btn ds-btn--secondary landing-preview-button"
            >
              Preview Afterlight
            </Link>
          </div>
          <div className="landing-hero__hint">
            World-first · Consent-led · Real-time
          </div>
        </header>

        <section className="landing-features">
          {FEATURES.map((f) => (
            <article key={f.title} className="landing-feature">
              <div className="landing-feature__icon">
                <f.Icon size={24} strokeWidth={1.8} aria-hidden="true" />
              </div>
              <h3 className="landing-feature__title">{f.title}</h3>
              <p className="landing-feature__body">{f.body}</p>
            </article>
          ))}
        </section>

        <footer className="landing-footer">
          © DateScape · meet outside the swipe deck
        </footer>
      </div>
    </div>
  );
}
