import React, { useRef, useState } from "react";

function getZodiacSign(month, day) {
  const signs = [
    { name: "Capricorn", end: [1, 19] },
    { name: "Aquarius", end: [2, 18] },
    { name: "Pisces", end: [3, 20] },
    { name: "Aries", end: [4, 19] },
    { name: "Taurus", end: [5, 20] },
    { name: "Gemini", end: [6, 20] },
    { name: "Cancer", end: [7, 22] },
    { name: "Leo", end: [8, 22] },
    { name: "Virgo", end: [9, 22] },
    { name: "Libra", end: [10, 22] },
    { name: "Scorpio", end: [11, 21] },
    { name: "Sagittarius", end: [12, 21] },
    { name: "Capricorn", end: [12, 31] },
  ];
  for (let i = 0; i < signs.length; i++) {
    const [m, d] = signs[i].end;
    if (month < m || (month === m && day <= d)) return signs[i].name;
  }
  return "Capricorn";
}

export default function SignupStep2({ onNext, onBack, formData, setFormData, loading }) {
  const [error, setError] = useState(null);
  const [invalidField, setInvalidField] = useState(null);
  const displayNameRef = useRef(null);
  const birthDateRef = useRef(null);
  const genderRef = useRef(null);
  const lookingForRef = useRef(null);
  const fieldRefs = {
    displayName: displayNameRef,
    birthDate: birthDateRef,
    gender: genderRef,
    lookingFor: lookingForRef,
  };

  const showError = (message, field) => {
    setError(message);
    setInvalidField(field);
    fieldRefs[field]?.current?.focus();
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (invalidField === e.target.name) {
      setError(null);
      setInvalidField(null);
    }
  };

  const handleNext = (e) => {
    e.preventDefault();
    setError(null);
    setInvalidField(null);
    const firstMissing = ["displayName", "birthDate", "gender", "lookingFor"].find(
      (field) => !String(formData[field] || "").trim(),
    );
    if (firstMissing) {
      showError("Please fill in every field.", firstMissing);
      return;
    }
    const birthDate = new Date(formData.birthDate);
    if (Number.isNaN(birthDate.getTime())) {
      showError("Enter a valid birth date.", "birthDate");
      return;
    }
    const today = new Date();
    const ageLimit = new Date(today.setFullYear(today.getFullYear() - 18));
    if (birthDate > ageLimit) {
      showError("You must be at least 18 to use DateScape.", "birthDate");
      return;
    }
    const age = Math.floor(
      (Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    );
    const zodiac = getZodiacSign(birthDate.getMonth() + 1, birthDate.getDate());
    const next = { ...formData, age, zodiacSign: zodiac };
    if (formData.lookingFor === "Friendship") next.genderPref = "all";
    setFormData(next);
    setError(null);
    onNext();
  };

  const maxBirthDate = new Date(new Date().setFullYear(new Date().getFullYear() - 18))
    .toISOString()
    .split("T")[0];

  return (
    <form className="ds-card" onSubmit={handleNext}>
      <div className="ds-card__eyebrow">A little about you</div>
      <h1 className="ds-card__title">Who's exploring?</h1>
      <p className="ds-card__subtitle">Pick a name people will see and the basics for matching.</p>

      <label className="ds-field">
        <span className="ds-field__label">Display name</span>
        <input
          ref={displayNameRef}
          id="signup-display-name"
          className="ds-input"
          type="text"
          name="displayName"
          maxLength={32}
          placeholder="What should people call you?"
          value={formData.displayName || ""}
          onChange={handleChange}
          aria-invalid={invalidField === "displayName"}
          aria-describedby={invalidField === "displayName" ? "signup-step2-error" : undefined}
        />
      </label>

      <label className="ds-field">
        <span className="ds-field__label">Birth date</span>
        <input
          ref={birthDateRef}
          id="signup-birth-date"
          className="ds-input"
          type="date"
          name="birthDate"
          value={formData.birthDate || ""}
          onChange={handleChange}
          max={maxBirthDate}
          aria-invalid={invalidField === "birthDate"}
          aria-describedby={invalidField === "birthDate" ? "signup-step2-error" : undefined}
        />
      </label>

      <label className="ds-field">
        <span className="ds-field__label">Gender</span>
        <select
          ref={genderRef}
          id="signup-gender"
          className="ds-select"
          name="gender"
          value={formData.gender || ""}
          onChange={handleChange}
          aria-invalid={invalidField === "gender"}
          aria-describedby={invalidField === "gender" ? "signup-step2-error" : undefined}
        >
          <option value="">Select gender…</option>
          <option value="Man">Man</option>
          <option value="Woman">Woman</option>
          <option value="Nonbinary">Nonbinary</option>
          <option value="Other">Other</option>
        </select>
      </label>

      <label className="ds-field">
        <span className="ds-field__label">Looking for</span>
        <select
          ref={lookingForRef}
          id="signup-looking-for"
          className="ds-select"
          name="lookingFor"
          value={formData.lookingFor || ""}
          onChange={handleChange}
          aria-invalid={invalidField === "lookingFor"}
          aria-describedby={invalidField === "lookingFor" ? "signup-step2-error" : undefined}
        >
          <option value="">What brings you here…</option>
          <option value="Friendship">Friendship</option>
          <option value="Dating">Dating</option>
          <option value="Both">Both</option>
        </select>
      </label>

      {error && (
        <div
          id="signup-step2-error"
          className="ds-field__error"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </div>
      )}

      <div className="ds-btn-row">
        <button type="button" className="ds-btn ds-btn--secondary" onClick={onBack} disabled={loading}>
          Back
        </button>
        <button type="submit" className="ds-btn ds-btn--primary" disabled={loading}>
          Continue
        </button>
      </div>
    </form>
  );
}
