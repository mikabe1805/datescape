import React, { useEffect, useState } from "react";
import { Globe, Heart, Sparkles, User, X } from "lucide-react";

const STORAGE_KEY_PREFIX = "datescape:firstLaunchTourSeen";

export function firstLaunchTourStorageKey(uid) {
  const normalizedUid = typeof uid === "string" ? uid.trim() : "";
  return normalizedUid
    ? `${STORAGE_KEY_PREFIX}:${encodeURIComponent(normalizedUid)}`
    : null;
}

const TOUR_STEPS = [
  {
    icon: Globe,
    title: "World",
    body: "Choose your pace along Afterlight Shore: arrive through the Conservatory, meet at Lantern Market, and drift toward Resonance Garden.",
  },
  {
    icon: Sparkles,
    title: "Discover",
    body: "Optional introductions for quieter nights. You can also see who has already liked you here.",
  },
  {
    icon: Heart,
    title: "Connections",
    body: "Mutual Sparks and likes become private connections. Continue in chat when you are ready.",
  },
  {
    icon: User,
    title: "You",
    body: "Edit your calling card, preferences, safety, and notification settings.",
  },
];

export default function FirstLaunchTour({ uid }) {
  const [open, setOpen] = useState(false);
  const storageKey = firstLaunchTourStorageKey(uid);

  useEffect(() => {
    setOpen(false);
    if (typeof window === "undefined" || !storageKey) return undefined;

    try {
      if (window.localStorage.getItem(storageKey) === "true") {
        return undefined;
      }
    } catch {}

    // Defer slightly so the rest of the app paints first.
    const timer = setTimeout(() => setOpen(true), 700);
    return () => clearTimeout(timer);
  }, [storageKey]);

  const dismiss = () => {
    try {
      if (storageKey) window.localStorage.setItem(storageKey, "true");
    } catch {}
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="first-tour-overlay" onClick={dismiss}>
      <div
        className="first-tour-card"
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to DateScape"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="first-tour-close"
          onClick={dismiss}
          aria-label="Close"
        >
          <X size={18} />
        </button>
        <p className="first-tour-eyebrow">Welcome to DateScape</p>
        <h2 className="first-tour-title">The world is the starting point.</h2>
        <ul className="first-tour-list">
          {TOUR_STEPS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="first-tour-item">
              <span className="first-tour-iconwrap">
                <Icon size={18} />
              </span>
              <div>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ul>
        <button className="first-tour-cta" onClick={dismiss}>
          Got it — show me around
        </button>
      </div>
    </div>
  );
}
