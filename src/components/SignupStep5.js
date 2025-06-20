import React, { useState, useEffect } from 'react';
import '../styles.css';

export default function StepMediaUpload({ formData, setFormData, onNext, onBack }) {
  const [previews, setPreviews] = useState(Array(6).fill(null));

  useEffect(() => {
    const newPreviews = (formData.media || []).map(file => {
      if (!file) return null;
      return URL.createObjectURL(file);
    });

    setPreviews(prev => prev.map((_, i) => newPreviews[i] || null));

    return () => newPreviews.forEach(url => {
      if (url) URL.revokeObjectURL(url);
    });
}, [formData.media]);

  const handleMediaChange = (e, index) => {
    const file = e.target.files[0];
    if (!file) return;
    const updatedMedia = [...(formData.media || [])];
    updatedMedia[index] = file;
    setFormData({ ...formData, media: updatedMedia });
  };

  const handleNext = () => {
    if (!formData.media || !formData.media[0]) {
      alert('Please upload at least one photo.');
      return;
    }
    onNext();
  };

  return (
    <div className="media-upload-page">
      <h2 className="media-upload-title">Show Yourself</h2>
      <p className="media-upload-subtitle">Upload at least one photo to begin your journey into DateScape. You may add up to 5 more photos or short videos!</p>

      <div className="media-grid">
        {Array.from({ length: 6 }).map((_, index) => (
        <label key={index} htmlFor={`upload-${index}`} className="media-label">
          <div className="media-slot">
            {previews[index] ? (
              formData.media[index]?.type?.startsWith('video') ? (
                <video src={previews[index]} controls className="media-preview" />
              ) : (
                <img src={previews[index]} alt={`Upload ${index + 1}`} className="media-preview" />
              )
            ) : (
              <span className="media-placeholder">+</span>
            )}
            <input
              id={`upload-${index}`}
              type="file"
              accept="image/*,video/*"
              style={{ display: 'none' }}
              onChange={(e) => handleMediaChange(e, index)}
            />
          </div>
        </label>
      ))}
      </div>

      <div className="navigation-buttons">
        <button className="nav-button" onClick={onBack}>Back</button>
        <button 
          className="reset-button" 
          onClick={() => setFormData({ ...formData, media: Array(6).fill(null) })}>
          Reset All
        </button>

        
        <button className="nav-button" onClick={handleNext}>Next</button>
      </div>
    </div>
  );
}
