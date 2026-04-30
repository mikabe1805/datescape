import React, { useState } from "react";

const interestCategories = {
  Gaming: [
    "Story-driven RPGs",
    "Cozy simulators",
    "Competitive shooters",
    "MMORPGs",
    "Indie games",
    "Retro classics",
  ],
  Music: [
    "Bedroom pop",
    "Midwest emo",
    "Hip-hop / Drill",
    "Hyperpop",
    "Classical",
    "Lo-fi beats",
  ],
  Media: [
    "Anime",
    "Coming-of-age dramas",
    "Psychological thrillers",
    "Reality TV",
    "True crime podcasts",
    "Sci-fi / Fantasy",
  ],
  Personality: [
    "Night owl",
    "Extroverted introvert",
    "Physically affectionate",
    "Creative thinker",
    "Neurodivergent-friendly",
    "Emotionally expressive",
  ],
  Lifestyle: [
    "Early riser",
    "Gym rat",
    "Cleanliness is key",
    "Spontaneous traveler",
    "Homebody",
    "Planner-oriented",
    "Vegan",
  ],
};

export default function SignupStep3({ formData, setFormData, nextStep, prevStep, loading }) {
  const [selectedCategory, setSelectedCategory] = useState(Object.keys(interestCategories)[0]);
  const selectedInterests = formData.interests || [];

  const toggleInterest = (interest) => {
    const exists = selectedInterests.includes(interest);
    const updated = exists
      ? selectedInterests.filter((i) => i !== interest)
      : [...selectedInterests, interest];
    setFormData({ ...formData, interests: updated });
  };

  return (
    <div className="ds-card ds-card--wide">
      <div className="ds-card__eyebrow">Step 4 · Interests</div>
      <h1 className="ds-card__title">What lights you up?</h1>
      <p className="ds-card__subtitle">
        Pick anything that fits. The more you choose, the better the matches.
      </p>

      <div className="ds-card__section">
        <div className="ds-tabs-section-title">Browse by category</div>
        <div className="ds-tabs" role="tablist">
          {Object.keys(interestCategories).map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={cat === selectedCategory}
              className={`ds-tab${cat === selectedCategory ? " is-active" : ""}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="ds-tabs-section-title">Tap to add</div>
        <div className="ds-tag-row">
          {interestCategories[selectedCategory].map((interest) => (
            <button
              key={interest}
              type="button"
              className={`ds-tag${selectedInterests.includes(interest) ? " is-selected" : ""}`}
              onClick={() => toggleInterest(interest)}
            >
              {interest}
            </button>
          ))}
        </div>
      </div>

      {selectedInterests.length > 0 && (
        <div className="ds-card__section">
          <div className="ds-field__label">Picked ({selectedInterests.length})</div>
          <div className="ds-tag-row">
            {selectedInterests.map((interest) => (
              <button
                key={interest}
                type="button"
                className="ds-tag is-selected"
                onClick={() => toggleInterest(interest)}
              >
                {interest} ✕
              </button>
            ))}
          </div>
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
          disabled={loading || selectedInterests.length === 0}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
