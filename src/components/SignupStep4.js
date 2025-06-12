import React, { useState } from 'react';
import '../styles.css';
import CardWrapper from '../components/CardWrapper';
import SignupLayout from '../components/SignupLayout';

const promptCategories = {
  Recommended: [
    'A core value I live by is...',
    'What I look for in a relationship is...',
    'Something that brings me long-term happiness is...'
  ],
  "Conversation Starters": [
    'You should message me if...',
    'A green flag I look for is...',
    'One unpopular opinion I have is...'
  ],
  "Fandom & Media": [
    'My comfort movie or game is...',
    'A fictional character I relate to is...',
    'The last thing I obsessed over was...'
  ],
  "Personal Growth": [
    'One thing I’ve worked on recently is...',
    'A fear I’ve overcome is...',
    'Something I’ve learned about myself is...'
  ]
};

export default function SignupStep4({ formData, setFormData, nextStep, prevStep }) {
  const [selectedPrompts, setSelectedPrompts] = useState(formData.profilePrompts || []);
  const [openCategories, setOpenCategories] = useState({});

  const toggleCategory = (category) => {
    setOpenCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const handleSelectPrompt = (prompt) => {
    if (selectedPrompts.length < 2 && !selectedPrompts.some(p => p.prompt === prompt)) {
      const updated = [...selectedPrompts, { prompt, answer: '' }];
      setSelectedPrompts(updated);
      setFormData({ ...formData, profilePrompts: updated });
    }
  };

  const handleRemovePrompt = (prompt) => {
    const updated = selectedPrompts.filter(p => p.prompt !== prompt);
    setSelectedPrompts(updated);
    setFormData({ ...formData, profilePrompts: updated });
  };

  const handleAnswerChange = (prompt, value) => {
    const updated = selectedPrompts.map(p =>
      p.prompt === prompt ? { ...p, answer: value } : p
    );
    setSelectedPrompts(updated);
    setFormData({ ...formData, profilePrompts: updated });
  };

  return (
    <SignupLayout>
          <CardWrapper>
      <h2 className="signup-title">Step 4: Choose Profile Prompts</h2>
      <p className="signup-subtext">Pick up to 2 prompts to answer — these help show off your personality!</p>

      {Object.entries(promptCategories).map(([category, prompts]) => (
        <div key={category} className="prompt-section">
          <div
            className="prompt-category"
            onClick={() => toggleCategory(category)}
          >
            {category}
            <span>{openCategories[category] ? '▾' : '▸'}</span>
          </div>
          <div className={`prompt-options ${openCategories[category] ? 'open' : ''}`}>
            {prompts.map(prompt => (
              <button
                key={prompt}
                className={`prompt-button ${selectedPrompts.some(p => p.prompt === prompt) ? 'selected' : ''}`}
                onClick={() => handleSelectPrompt(prompt)}
                disabled={selectedPrompts.length >= 2 && !selectedPrompts.some(p => p.prompt === prompt)}>
                {prompt}
              </button>
            ))}
          </div>
        </div>
      ))}

      {selectedPrompts.length > 0 && (
        <div className="prompt-response-fields">
          {selectedPrompts.map(({ prompt, answer }) => (
            <div key={prompt} className="prompt-response">
              <label>{prompt}</label>
              <textarea
                className="prompt-textarea"
                value={answer}
                onChange={(e) => handleAnswerChange(prompt, e.target.value)}
                placeholder="Your answer..."
              />
              <button onClick={() => handleRemovePrompt(prompt)} className="remove-btn">Remove</button>
            </div>
          ))}
        </div>
      )}

      <div className="form-navigation">
        <button className="form-nav-btn" onClick={prevStep}>Back</button>
        <button className="form-nav-btn" onClick={nextStep} disabled={selectedPrompts.length === 0}>Next</button>
      </div>
    </CardWrapper>
    </SignupLayout>
  );
}
