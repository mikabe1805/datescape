import React, { useEffect, useState } from "react";

const MAX_IMAGE_SIZE = 50 * 1024 * 1024;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const SUPPORTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const SLOTS = 6;

function validateFile(file) {
  const isImage = SUPPORTED_IMAGE_TYPES.includes(file.type);
  const isVideo = SUPPORTED_VIDEO_TYPES.includes(file.type);
  if (!isImage && !isVideo) {
    return { ok: false, reason: "Use JPEG, PNG, WebP, MP4, WebM, or QuickTime." };
  }
  const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
  if (file.size > maxSize) {
    return { ok: false, reason: `Too big. Max ${maxSize / (1024 * 1024)}MB.` };
  }
  return { ok: true, isVideo };
}

export default function SignupStep5({ formData, setFormData, onNext, onBack, loading }) {
  const [previews, setPreviews] = useState(Array(SLOTS).fill(null));
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const urls = (formData.media || []).map((file) => {
      if (!file) return null;
      if (typeof file === "string") return file;
      return URL.createObjectURL(file);
    });
    setPreviews(Array.from({ length: SLOTS }, (_, i) => urls[i] || null));
    return () => {
      urls.forEach((u, i) => {
        const f = (formData.media || [])[i];
        if (u && f && typeof f !== "string") URL.revokeObjectURL(u);
      });
    };
  }, [formData.media]);

  const handlePick = (e, index) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const v = validateFile(file);
    if (!v.ok) {
      setErrors((prev) => ({ ...prev, [index]: v.reason }));
      return;
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    const updated = [...(formData.media || [])];
    updated[index] = file;
    setFormData({ ...formData, media: updated });
  };

  const handleRemove = (index) => {
    const updated = [...(formData.media || [])];
    updated[index] = null;
    setFormData({ ...formData, media: updated });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const handleNext = () => {
    if (!formData.media?.[0]) {
      setErrors((prev) => ({ ...prev, _form: "Add at least one photo." }));
      return;
    }
    if (Object.keys(errors).filter((k) => k !== "_form").length > 0) {
      setErrors((prev) => ({ ...prev, _form: "Fix the file errors above first." }));
      return;
    }
    setErrors({});
    onNext();
  };

  const filledCount = (formData.media || []).filter(Boolean).length;

  return (
    <div className="ds-card ds-card--wide">
      <div className="ds-card__eyebrow">Step 6 · Photos</div>
      <h1 className="ds-card__title">Show yourself</h1>
      <p className="ds-card__subtitle">
        Drop in at least one photo to begin. Add up to six photos or short videos.
      </p>

      <div className="media-grid-v2">
        {Array.from({ length: SLOTS }).map((_, i) => {
          const preview = previews[i];
          const file = (formData.media || [])[i];
          const isVideo = file && typeof file !== "string" && file.type?.startsWith("video");
          const isPrimary = i === 0;
          return (
            <div key={i} className="media-slot-v2">
              <label className={`media-slot-v2__inner${preview ? " is-filled" : ""}${isPrimary ? " is-primary" : ""}`}>
                {preview ? (
                  isVideo ? (
                    <video src={preview} className="media-slot-v2__preview" muted loop playsInline />
                  ) : (
                    <img src={preview} alt="" className="media-slot-v2__preview" />
                  )
                ) : (
                  <span className="media-slot-v2__plus">＋</span>
                )}
                <input
                  type="file"
                  accept="image/*,video/*"
                  className="media-slot-v2__input"
                  onChange={(e) => handlePick(e, i)}
                />
              </label>
              {isPrimary && !preview && (
                <span className="media-slot-v2__hint">Cover photo</span>
              )}
              {preview && (
                <button
                  type="button"
                  className="media-slot-v2__remove"
                  onClick={() => handleRemove(i)}
                  aria-label="Remove photo"
                >
                  ✕
                </button>
              )}
              {errors[i] && <div className="ds-field__error">{errors[i]}</div>}
            </div>
          );
        })}
      </div>

      <p className="ds-field__hint" style={{ marginTop: 14 }}>
        Images up to 50MB · Videos up to 100MB · {filledCount}/{SLOTS} added
      </p>

      {errors._form && <div className="ds-field__error">{errors._form}</div>}

      <div className="ds-btn-row">
        <button type="button" className="ds-btn ds-btn--secondary" onClick={onBack} disabled={loading}>
          Back
        </button>
        <button type="button" className="ds-btn ds-btn--primary" onClick={handleNext} disabled={loading}>
          {loading ? "Working…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
