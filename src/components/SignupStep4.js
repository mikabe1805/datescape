import React, { useState } from "react";

const promptCategories = {
  Recommended: [
    "A core value I live by is...",
    "What I look for in a relationship is...",
    "Something that brings me long-term happiness is...",
  ],
  "Conversation starters": [
    "You should message me if...",
    "A green flag I look for is...",
    "One unpopular opinion I have is...",
  ],
  "Fandom & media": [
    "My comfort movie or game is...",
    "A fictional character I relate to is...",
    "The last thing I obsessed over was...",
  ],
  "Personal growth": [
    "One thing I've worked on recently is...",
    "A fear I've overcome is...",
    "Something I've learned about myself is...",
  ],
};

export default function SignupStep4({ formData, setFormData, nextStep, prevStep, loading }) {
  const [activeCategory, setActiveCategory] = useState("Recommended");
  const selectedPrompts = formData.profilePrompts || [];

  const togglePrompt = (prompt) => {
    const exists = selectedPrompts.some((p) => p.prompt === prompt);
    if (exists) {
      const updated = selectedPrompts.filter((p) => p.prompt !== prompt);
      setFormData({ ...formData, profilePrompts: updated });
      return;
    }
    if (selectedPrompts.length >= 2) return;
    const updated = [...selectedPrompts, { prompt, answer: "" }];
    setFormData({ ...formData, profilePrompts: updated });
  };

  const updateAnswer = (prompt, value) => {
    const updated = selectedPrompts.map((p) =>
      p.prompt === prompt ? { ...p, answer: value } : p
    );
    setFormData({ ...formData, profilePrompts: updated });
  };

  const canProceed = selectedPrompts.length > 0 && selectedPrompts.every((p) => p.answer.trim());

  return (
    <div className="ds-card ds-card--wide">
      <div className="ds-card__eyebrow">Step 5 · Prompts</div>
      <h1 className="ds-card__title">Show some personality</h1>
      <p className="ds-card__subtitle">
        Pick up to two prompts and answer them. Honest beats clever.
      </p>

      <div className="ds-tabs-section-title">Browse by category</div>
      <div className="ds-tabs" role="tablist">
        {Object.keys(promptCategories).map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={cat === activeCategory}
            className={`ds-tab${cat === activeCategory ? " is-active" : ""}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="ds-card__section" style={{ display: "grid", gap: 8 }}>
        {promptCategories[activeCategory].map((prompt) => {
          const selected = selectedPrompts.some((p) => p.prompt === prompt);
          const disabled = !selected && selectedPrompts.length >= 2;
          return (
            <button
              key={prompt}
              type="button"
              className={`ds-choice${selected ? " is-selected" : ""}`}
              onClick={() => togglePrompt(prompt)}
              disabled={disabled}
            >
              {prompt}
            </button>
          );
        })}
      </div>

      {selectedPrompts.length > 0 && (
        <div className="ds-card__section">
          <hr className="ds-card__hr" />
          {selectedPrompts.map(({ prompt, answer }) => (
            <label key={prompt} className="ds-field">
              <span className="ds-field__label">{prompt}</span>
              <textarea
                className="ds-textarea"
                value={answer}
                placeholder="Your answer…"
                onChange={(e) => updateAnswer(prompt, e.target.value)}
              />
            </label>
          ))}
        </div>
      )}

      <div className="ds-btn-row">
        <button type="button" className="ds-btn ds-btn--secondary" onClick={prevStep} disabled={loading}>
          Back
        </button>
        <button
          type="button"
          className="ds-btn ds-btn--primary"
          onClick={nextStep}
          disabled={loading || !canProceed}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
