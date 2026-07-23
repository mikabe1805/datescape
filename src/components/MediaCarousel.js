import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { isVideoMedia, mediaUrl } from "../utils/MediaUtils";
import "../styles.css";

export default function MediaCarousel({ media }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const safeMedia = useMemo(
    () => (Array.isArray(media) ? media : []).slice(0, 10),
    [media],
  );

  const nextSlide = () => {
    setCurrentSlide((previous) => (previous + 1) % safeMedia.length);
  };

  const previousSlide = () => {
    setCurrentSlide(
      (previous) => (previous - 1 + safeMedia.length) % safeMedia.length,
    );
  };

  return (
    <div
      className="carousel-container"
      style={{ position: "relative", borderRadius: "20px", overflow: "hidden" }}
    >
      {safeMedia.map((mediaItem, index) => {
        const url = mediaUrl(mediaItem);
        return (
          <div
            key={`${url}-${index}`}
            style={{
              display: index === currentSlide ? "block" : "none",
              width: "100%",
              height: "100%",
              textAlign: "center",
            }}
          >
            {isVideoMedia(mediaItem) ? (
              <video
                src={url}
                aria-label={`Profile video ${index + 1}`}
                controls
                preload="metadata"
                style={{
                  maxHeight: "400px",
                  width: "100%",
                  objectFit: "contain",
                }}
              />
            ) : (
              <img
                src={url}
                alt={`Profile media ${index + 1}`}
                loading="lazy"
                style={{
                  maxHeight: "400px",
                  width: "100%",
                  objectFit: "contain",
                }}
              />
            )}
          </div>
        );
      })}

      {safeMedia.length > 1 && (
        <button
          type="button"
          aria-label="Previous media"
          onClick={previousSlide}
          style={{
            position: "absolute",
            top: "50%",
            left: "10px",
            transform: "translateY(-50%)",
            zIndex: 5,
            backgroundColor: "rgba(0,0,0,0.3)",
            color: "white",
            borderRadius: "50%",
            border: "none",
            padding: "10px",
            cursor: "pointer",
          }}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
      )}

      {safeMedia.length > 1 && (
        <button
          type="button"
          aria-label="Next media"
          onClick={nextSlide}
          style={{
            position: "absolute",
            top: "50%",
            right: "10px",
            transform: "translateY(-50%)",
            zIndex: 5,
            backgroundColor: "rgba(0,0,0,0.3)",
            color: "white",
            borderRadius: "50%",
            border: "none",
            padding: "10px",
            cursor: "pointer",
          }}
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
