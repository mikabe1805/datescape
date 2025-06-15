import React, { useState } from 'react';
import '../styles.css';

export default function MediaCarousel({ media }) {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % media.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + media.length) % media.length);
  };

  return (
    <div className="carousel-container" style={{ position: 'relative', borderRadius: '20px', overflow: 'hidden' }}>
      {media.map((url, index) => (
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
            <video src={url} controls style={{ maxHeight: '400px', width: '100%', objectFit: 'contain' }} />
          ) : (
            <img src={url} alt={`media-${index}`} style={{ maxHeight: '400px', width: '100%', objectFit: 'contain' }} />
          )}
        </div>
      ))}

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
    </div>
  );
}
