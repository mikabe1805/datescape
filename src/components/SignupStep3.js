// SignupStep3.js
import React, { useState } from "react";
import "../styles.css";

const interestsList = [
  "Art", "Music", "Gaming", "Fitness", "Travel",
  "Tech", "Food", "Books", "Movies", "Nature",
  "Fashion", "Writing", "Animals", "Theater", "Spirituality"
];

function SignupStep3({ onNext, onBack, formData, setFormData }) {
  const [selected, setSelected] = useState(formData.interests || []);

  const toggleInterest = (interest) => {
    if (selected.includes(interest)) {
      setSelected(selected.filter((item) => item !== interest));
    } else {
      setSelected([...selected, interest]);
    }
  };

  const handleNext = (e) => {
    e.preventDefault();
    setFormData({ ...formData, interests: selected });
    onNext();
  };

  return (
    <div className="signup-card">
      <h2 className="form-title">Pick Your Interests</h2>
      <form onSubmit={handleNext}>
        <div className="interest-grid">
          {interestsList.map((interest) => (
            <button
              type="button"
              key={interest}
              className={`interest-button ${selected.includes(interest) ? "selected" : ""}`}
              onClick={() => toggleInterest(interest)}
            >
              {interest}
            </button>
          ))}
        </div>
        <div className="button-group">
          <button type="button" onClick={onBack} className="button secondary">Back</button>
          <button type="submit" className="button primary">Next</button>
        </div>
      </form>
    </div>
  );
}

export default SignupStep3;
