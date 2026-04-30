import React, { useState } from "react";
import { getBrowserLocation, geocodeCity, reverseGeocode } from "../utils/geo";

export default function SignupStepLocation({ formData, setFormData, onNext, onBack, loading }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cityInput, setCityInput] = useState(formData.location?.city || "");

  const setLocation = (location) => {
    setFormData({ ...formData, location });
  };

  const handleUseGPS = async () => {
    setBusy(true);
    setError("");
    try {
      const coords = await getBrowserLocation();
      const reverse = await reverseGeocode(coords.lat, coords.lng);
      const cityLabel = reverse?.label || "";
      setLocation({
        lat: coords.lat,
        lng: coords.lng,
        city: cityLabel,
        source: "geo",
      });
      if (cityLabel) setCityInput(cityLabel);
    } catch (err) {
      setError(err?.message || "Couldn't read your location.");
    } finally {
      setBusy(false);
    }
  };

  const handleUseCity = async () => {
    const trimmed = cityInput.trim();
    if (!trimmed) {
      setError("Type a city or town first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await geocodeCity(trimmed);
      if (result) {
        setLocation({
          lat: result.lat,
          lng: result.lng,
          city: result.label,
          source: "manual",
        });
        setCityInput(result.label);
      } else {
        // Fallback: store the text only. Distance filter won't apply for this user.
        setLocation({
          lat: null,
          lng: null,
          city: trimmed,
          source: "manual",
        });
      }
    } catch {
      setLocation({ lat: null, lng: null, city: trimmed, source: "manual" });
    } finally {
      setBusy(false);
    }
  };

  const clearLocation = () => {
    setLocation(null);
    setCityInput("");
  };

  const handleNext = () => {
    if (!formData.location?.city && !formData.location?.lat) {
      setError("Pick a location first — either share it, or type a city.");
      return;
    }
    setError("");
    onNext();
  };

  const loc = formData.location;
  const hasCoords = typeof loc?.lat === "number" && typeof loc?.lng === "number";

  return (
    <div className="ds-card">
      <div className="ds-card__eyebrow">Step 3 · Location</div>
      <h1 className="ds-card__title">Where are you based?</h1>
      <p className="ds-card__subtitle">
        We use this to show people in your area and respect your distance preference.
        Your exact spot is never shown — only general distance.
      </p>

      <div className="ds-card__section">
        <button
          type="button"
          className="ds-btn ds-btn--primary ds-btn--block"
          onClick={handleUseGPS}
          disabled={busy || loading}
          style={{ marginBottom: 10 }}
        >
          {busy && loc?.source !== "manual" ? "Reading…" : "Use my current location"}
        </button>

        <div className="ds-tabs-section-title" style={{ textAlign: "center", margin: "10px 0" }}>
          or
        </div>

        <label className="ds-field">
          <span className="ds-field__label">Type a city or town</span>
          <input
            className="ds-input"
            type="text"
            placeholder="e.g. Brooklyn, NY"
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            autoComplete="address-level2"
          />
        </label>
        <button
          type="button"
          className="ds-btn ds-btn--secondary ds-btn--block"
          onClick={handleUseCity}
          disabled={busy || loading || !cityInput.trim()}
        >
          {busy && loc?.source === "manual" ? "Looking up…" : "Use this city"}
        </button>
      </div>

      {loc && (loc.lat || loc.city) && (
        <div className="signup-location-summary">
          <div className="signup-location-summary__line">
            <strong>Saved:</strong> {loc.city || `${loc.lat?.toFixed(2)}, ${loc.lng?.toFixed(2)}`}
          </div>
          <div className="signup-location-summary__hint">
            {hasCoords
              ? "Distance filtering is enabled."
              : "We couldn't get coordinates from that — distance filter will be skipped for you. You can refine this later."}
          </div>
          <button type="button" className="ds-btn ds-btn--ghost" onClick={clearLocation} disabled={busy}>
            Clear
          </button>
        </div>
      )}

      {error && <div className="ds-field__error">{error}</div>}

      <div className="ds-btn-row">
        <button type="button" className="ds-btn ds-btn--secondary" onClick={onBack} disabled={busy || loading}>
          Back
        </button>
        <button
          type="button"
          className="ds-btn ds-btn--primary"
          onClick={handleNext}
          disabled={busy || loading || (!loc?.city && !loc?.lat)}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
