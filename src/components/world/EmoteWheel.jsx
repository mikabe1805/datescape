import { useEffect } from "react";

const EMOTES = [
  { id: "wave", glyph: "👋", label: "Wave" },
  { id: "heart", glyph: "❤️", label: "Heart" },
  { id: "dance", glyph: "💃", label: "Dance" },
  { id: "sit", glyph: "🪑", label: "Sit" },
];

export const EMOTE_GLYPHS = EMOTES.reduce((acc, e) => {
  acc[e.id] = e.glyph;
  return acc;
}, {});

export default function EmoteWheel({ open, onPick, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" || e.code === "KeyQ") {
        e.preventDefault();
        onClose?.();
      }
      const num = parseInt(e.key, 10);
      if (!Number.isNaN(num) && num >= 1 && num <= EMOTES.length) {
        e.preventDefault();
        onPick?.(EMOTES[num - 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onPick, onClose]);

  if (!open) return null;

  return (
    <div className="emote-wheel" role="dialog" aria-label="Emotes">
      <div className="emote-wheel__backdrop" onClick={onClose} />
      <div className="emote-wheel__panel">
        <div className="emote-wheel__title">Emotes</div>
        <div className="emote-wheel__grid">
          {EMOTES.map((emote, i) => (
            <button
              key={emote.id}
              type="button"
              className="emote-wheel__btn"
              onClick={() => onPick?.(emote.id)}
              aria-label={emote.label}
            >
              <span className="emote-wheel__glyph">{emote.glyph}</span>
              <span className="emote-wheel__label">{emote.label}</span>
              <span className="emote-wheel__hotkey">{i + 1}</span>
            </button>
          ))}
        </div>
        <div className="emote-wheel__hint">Press 1–4, or click. Q closes.</div>
      </div>
    </div>
  );
}

export const EMOTE_LIST = EMOTES;
