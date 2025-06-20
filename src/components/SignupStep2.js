// SignupStep2.js
import React, { useState } from "react";
import "../styles.css";
import CardWrapper from '../components/CardWrapper';
import SignupLayout from '../components/SignupLayout';

function SignupStep2({ onNext, onBack, formData, setFormData }) {
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleNext = (e) => {
    e.preventDefault();

    const birthDate = new Date(formData.birthDate);
    const today = new Date();
    const ageLimit = new Date(today.setFullYear(today.getFullYear() - 18));

    if (birthDate > ageLimit) {
    setError("You must be at least 18 years old to use DateScape.");
    return;
    }

        // Calculate age
        const age = Math.floor((new Date() - birthDate) / (365.25 * 24 * 60 * 60 * 1000));

        // Calculate zodiac sign
        const month = birthDate.getMonth() + 1;
        const day = birthDate.getDate();
        const zodiac = getZodiacSign(month, day);
        if (formData.lookingFor === "Friendship") {
          formData.genderPref = "all"
        }


        // Save to formData
        setFormData({
        ...formData,
        age,
        zodiacSign: zodiac
        });

        setError(null);
        onNext();

  };

  return (
    <SignupLayout>
          <CardWrapper>
      <h2 className="form-title">Tell Us About You</h2>
      <form onSubmit={handleNext}>
        <input
          type="text"
          name="displayName"
          placeholder="Display Name"
          value={formData.displayName || ""}
          onChange={handleChange}
          required
        />

        <label className="form-label">Birth Date</label>
        <input
          type="date"
          name="birthDate"
          value={formData.birthDate || ""}
          onChange={handleChange}
          required
          className="styled-input"
          max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split("T")[0]}
        />

        <label className="form-label">Gender</label>
        <select
          name="gender"
          value={formData.gender || ""}
          onChange={handleChange}
          required
          className="styled-select"
        >
          <option value="">Select Gender</option>
          <option value="Man">Man</option>
          <option value="Woman">Woman</option>
          <option value="Nonbinary">Nonbinary</option>
          <option value="Other">Other</option>
        </select>

        <label className="form-label">Looking For</label>
        <select
          name="lookingFor"
          value={formData.lookingFor || ""}
          onChange={handleChange}
          required
          className="styled-select"
        >
          <option value="">Looking for...</option>
          <option value="Friendship">Friendship</option>
          <option value="Dating">Dating</option>
          <option value="Both">Both</option>
        </select>

        {error && <p className="error-message">{error}</p>}

        <div className="button-group">
          <button type="button" onClick={onBack} className="button secondary">Back</button>
          <button type="submit" className="button primary">Next</button>
        </div>
      </form>
    </CardWrapper>
    </SignupLayout>
  );
}

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
    { name: "Capricorn", end: [12, 31] } // wrap around for Capricorn
  ];

  for (let i = 0; i < signs.length; i++) {
    const [m, d] = signs[i].end;
    if (month < m || (month === m && day <= d)) {
      return signs[i].name;
    }
  }
}

export default SignupStep2;
