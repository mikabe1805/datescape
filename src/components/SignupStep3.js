import React, { useState } from 'react';
import '../styles.css';

const interestCategories = {
  Gaming: [
    'Story-driven RPGs',
    'Cozy simulators',
    'Competitive shooters',
    'MMORPGs',
    'Indie games',
    'Retro classics',
  ],
  Music: [
    'Bedroom pop',
    'Midwest emo',
    'Hip-hop / Drill',
    'Hyperpop',
    'Classical',
    'Lo-fi beats',
  ],
  Media: [
    'Anime',
    'Coming-of-age dramas',
    'Psychological thrillers',
    'Reality TV',
    'True crime podcasts',
    'Sci-fi / Fantasy',
  ],
  Personality: [
    'Night owl',
    'Extroverted introvert',
    'Physically affectionate',
    'Creative thinker',
    'Neurodivergent-friendly',
    'Emotionally expressive',
  ],
  Lifestyle: [
    'Early riser',
    'Gym rat',
    'Cleanliness is key',
    'Spontaneous traveler',
    'Homebody',
    'Planner-oriented',
    'Vegan',
  ],
};

export default function SignupStep3({ formData, setFormData, nextStep, prevStep }) {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedInterests, setSelectedInterests] = useState(formData.interests || []);

  const handleAddInterest = (interest) => {
    if (!selectedInterests.includes(interest)) {
      const updated = [...selectedInterests, interest];
      setSelectedInterests(updated);
      setFormData({ ...formData, interests: updated });
    }
  };

  const handleRemoveInterest = (interest) => {
    const updated = selectedInterests.filter(i => i !== interest);
    setSelectedInterests(updated);
    setFormData({ ...formData, interests: updated });
  };

  return (
    <div className="signup-card">
      <h2 className="signup-title">Step 3: Choose Your Interests</h2>
      <p className="signup-subtext">Pick interests that best reflect you — this helps with meaningful matches.</p>

      <label htmlFor="category-select" className="category-label">Select a category:</label>
      <select
        id="category-select"
        className="dropdown-select styled-dropdown"
        value={selectedCategory}
        onChange={(e) => setSelectedCategory(e.target.value)}>
        <option value="">-- Choose a category --</option>
        {Object.keys(interestCategories).map((category) => (
          <option key={category} value={category}>{category}</option>
        ))}
      </select>

      {selectedCategory && (
        <div className="interest-options">
          {interestCategories[selectedCategory].map((interest) => (
            <button
              key={interest}
              className={`interest-button styled-button ${selectedInterests.includes(interest) ? 'selected' : ''}`}
              onClick={() => handleAddInterest(interest)}>
              {interest}
            </button>
          ))}
        </div>
      )}

      {selectedInterests.length > 0 && (
        <div className="selected-interests">
          <h4>Selected:</h4>
          {selectedInterests.map((interest) => (
            <span
              key={interest}
              className="interest-tag styled-tag"
              onClick={() => handleRemoveInterest(interest)}>
              {interest} ✕
            </span>
          ))}
        </div>
      )}

      <div className="form-navigation">
        <button className="form-nav-btn" onClick={prevStep}>Back</button>
        <button className="form-nav-btn" onClick={nextStep} disabled={selectedInterests.length === 0}>Next</button>
      </div>
    </div>
  );
}
