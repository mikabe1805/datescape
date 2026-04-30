import React, { useEffect, useState } from "react";
import { Globe, Heart, Mail, Sparkles, User, X } from "lucide-react";

const STORAGE_KEY = "datescape:firstLaunchTourSeen";

const TOUR_STEPS = [
  {
    icon: Sparkles,
    title: "Queue",
    body: "Your daily stack of profiles, ranked by fit. Pass or like — mutual likes become matches.",
  },
  {
    icon: Heart,
    title: "Likes",
    body: "People who liked you. Like them back to start chatting.",
  },
  {
    icon: Mail,
    title: "Matches",
    body: "Mutual likes land here. Tap to chat.",
  },
  {
    icon: Globe,
    title: "Explore",
    body: "Drop into the world to wave, like, or play chess with people in real-time.",
  },
  {
    icon: User,
    title: "Profile",
    body: "Edit your photos, preferences, and notification settings. Don't forget to set your location.",
  },
];

export default function FirstLaunchTour() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY) === "true") return;
    // Defer slightly so the rest of the app paints first.
    const timer = setTimeout(() => setOpen(true), 700);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {}
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="first-tour-overlay" onClick={dismiss}>
      <div
        className="first-tour-card"
        role="dialog"
        aria-label="Welcome to DateScape"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="first-tour-close" onClick={dismiss} aria-label="Close">
          <X size={18} />
        </button>
        <p className="first-tour-eyebrow">Welcome to DateScape</p>
        <h2 className="first-tour-title">Here's the lay of the land.</h2>
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
