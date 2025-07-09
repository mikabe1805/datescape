import React, { useState, useEffect } from 'react';
import '../styles.css';

export default function StepMediaUpload({ formData, setFormData, onNext, onBack, loading }) {
  const [previews, setPreviews] = useState(Array(6).fill(null));
  const [errors, setErrors] = useState({});

  // File size limits (in bytes)
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB for videos

  // Supported file types
  const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

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

  const validateFile = (file, index) => {
    const newErrors = { ...errors };
    
    // Check file type
    const isValidImage = SUPPORTED_IMAGE_TYPES.includes(file.type);
    const isValidVideo = SUPPORTED_VIDEO_TYPES.includes(file.type);
    
    if (!isValidImage && !isValidVideo) {
      newErrors[index] = `Unsupported file type. Please use JPEG, PNG, WebP, MP4, WebM, or QuickTime files.`;
      setErrors(newErrors);
      return false;
    }

    // Check file size
    const maxSize = isValidVideo ? MAX_VIDEO_SIZE : MAX_FILE_SIZE;
    if (file.size > maxSize) {
      const maxSizeMB = maxSize / (1024 * 1024);
      newErrors[index] = `File too large. Maximum size is ${maxSizeMB}MB.`;
      setErrors(newErrors);
      return false;
    }

    // Clear error if validation passes
    if (newErrors[index]) {
      delete newErrors[index];
      setErrors(newErrors);
    }
    
    return true;
  };

  const handleMediaChange = (e, index) => {
    const file = e.target.files[0];
    if (!file) return;

    if (validateFile(file, index)) {
      const updatedMedia = [...(formData.media || [])];
      updatedMedia[index] = file;
      setFormData({ ...formData, media: updatedMedia });
    }
  };

  const handleNext = () => {
    if (!formData.media || !formData.media[0]) {
      alert('Please upload at least one photo.');
      return;
    }

    // Check if there are any validation errors
    if (Object.keys(errors).length > 0) {
      alert('Please fix the file validation errors before proceeding.');
      return;
    }

    onNext();
  };

  return (
    <div className="media-upload-page">
      <h2 className="media-upload-title">Show Yourself</h2>
      <p className="media-upload-subtitle">Upload at least one photo to begin your journey into DateScape. You may add up to 5 more photos or short videos!</p>
      
      <div className="file-requirements">
        <p><strong>File Requirements:</strong></p>
        <ul>
          <li>Images: JPEG, PNG, WebP (max 50MB)</li>
          <li>Videos: MP4, WebM, QuickTime (max 100MB)</li>
          <li>At least 1 photo required</li>
        </ul>
      </div>

      <div className="media-grid">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="media-slot-container">
            <label htmlFor={`upload-${index}`} className="media-label">
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
            {errors[index] && (
              <div className="file-error">{errors[index]}</div>
            )}
          </div>
        ))}
      </div>

      <div className="navigation-buttons">
        <button className="nav-button" onClick={onBack} disabled={loading}>Back</button>
        
        <button 
          className="reset-button" 
          onClick={() => {
            setFormData({ ...formData, media: Array(6).fill(null) });
            setErrors({});
          }}
          disabled={loading}
        >
          Reset All
        </button>

        <button 
          className="nav-button" 
          onClick={handleNext} 
          disabled={loading}
        >
          {loading ? "Submitting..." : "Next"}
        </button>
      </div>
    </div>
  );
}
