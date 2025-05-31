// SignupStep1.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles.css";

function SignupStep1({ onNext, formData, setFormData }) {
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleNext = (e) => {
    e.preventDefault();
    const { email, password, confirmPassword, username } = formData;
    if (!email || !password || !confirmPassword) {
      setError("All fields are required.");
    } else if (password !== confirmPassword) {
      setError("Passwords do not match.");
    } else {
      setError(null);
      onNext();
    }
  };

  return (
    <div className="signup-background">
      <div className="signup-card">
        <h2 className="form-title">Create Your Account</h2>
        <form onSubmit={handleNext}>
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email || ""}
            onChange={handleChange}
            required
          />
          <input
            type="text"
            name="username"
            placeholder="Username"
            value={formData.username || ""}
            onChange={handleChange}
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password || ""}
            onChange={handleChange}
            required
          />
          <input
            type="password"
            name="confirmPassword"
            placeholder="Confirm Password"
            value={formData.confirmPassword || ""}
            onChange={handleChange}
            required
          />
          {error && <p className="error-message">{error}</p>}
          <button type="submit" className="button primary">Next</button>
        </form>
      </div>
    </div>
  );
}

export default SignupStep1;
