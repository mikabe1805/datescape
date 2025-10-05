import React, { useMemo, useState } from 'react';
import '../styles.css';

export default function MediaCarousel({ media }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const safeMedia = useMemo(() => (Array.isArray(media) ? media : []).slice(0, 10), [media]);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % safeMedia.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + safeMedia.length) % safeMedia.length);
  };

  return (
    <div className="carousel-container" style={{ position: 'relative', borderRadius: '20px', overflow: 'hidden' }}>
      {safeMedia.map((url, index) => (
        <div
          key={index}
          style={{
            display: index === currentSlide ? 'block' : 'none',
            width: '100%',
            height: '100%',
            textAlign: 'center'
          }}
        >
          {url.includes('.mp4') ? (
            <video src={url} controls preload="metadata" style={{ maxHeight: '400px', width: '100%', objectFit: 'contain' }} />
          ) : (
            <img src={url} alt={`media-${index}`} loading="lazy" style={{ maxHeight: '400px', width: '100%', objectFit: 'contain' }} />
          )}
        </div>
      ))}

      {safeMedia.length > 1 && (
      <button
        onClick={prevSlide}
        style={{
          position: 'absolute',
          top: '50%',
          left: '10px',
          transform: 'translateY(-50%)',
          zIndex: 5,
          backgroundColor: 'rgba(0,0,0,0.3)',
          color: 'white',
          borderRadius: '50%',
          border: 'none',
          padding: '10px',
          cursor: 'pointer'
        }}
      >
        ‹
      </button>
      )}

      {safeMedia.length > 1 && (
      <button
        onClick={nextSlide}
        style={{
          position: 'absolute',
          top: '50%',
          right: '10px',
          transform: 'translateY(-50%)',
          zIndex: 5,
          backgroundColor: 'rgba(0,0,0,0.3)',
          color: 'white',
          borderRadius: '50%',
          border: 'none',
          padding: '10px',
          cursor: 'pointer'
        }}
      >
        ›
      </button>
      )}
    </div>
  );
}
