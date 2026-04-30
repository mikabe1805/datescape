import React, { useState } from "react";
import { fetchSignInMethodsForEmail } from "firebase/auth";
import { auth, db } from "../firebase";
import { getDocs, query, collection, where } from "firebase/firestore";
import { Link } from "react-router-dom";

async function checkIfEmailUsedAnywhere(email) {
  const methods = await fetchSignInMethodsForEmail(auth, email);
  if (methods.includes("password")) return true;
  const q = query(collection(db, "users"), where("email", "==", email));
  const snap = await getDocs(q);
  return !snap.empty;
}

export default function SignupStep1({ formData, setFormData, onNext, loading }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleNext = async () => {
    setError("");
    const { email, password, confirmPassword } = formData;
    if (!email || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email.");
      return;
    }
    setBusy(true);
    try {
      try {
        await auth.signOut();
      } catch {}
      const exists = await checkIfEmailUsedAnywhere(email);
      if (exists) {
        setError("Email is already in use. Try logging in instead.");
        return;
      }
      onNext();
    } catch (e) {
      console.warn("Email check failed:", e);
      setError("Couldn't check this email. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ds-card">
      <div className="ds-card__eyebrow">Create your account</div>
      <h1 className="ds-card__title">Welcome to DateScape</h1>
      <p className="ds-card__subtitle">
        Set up your login. You'll build out your profile over the next few steps.
      </p>

      <label className="ds-field">
        <span className="ds-field__label">Email</span>
        <input
          className="ds-input"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={formData.email || ""}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        />
      </label>

      <label className="ds-field">
        <span className="ds-field__label">Password</span>
        <input
          className="ds-input"
          type="password"
          autoComplete="new-password"
          placeholder="At least 6 characters"
          value={formData.password || ""}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
        />
      </label>

      <label className="ds-field">
        <span className="ds-field__label">Confirm password</span>
        <input
          className="ds-input"
          type="password"
          autoComplete="new-password"
          placeholder="Type it again"
          value={formData.confirmPassword || ""}
          onChange={(e) =>
            setFormData({ ...formData, confirmPassword: e.target.value })
          }
        />
      </label>

      {error && <div className="ds-field__error">{error}</div>}

      <button
        type="button"
        className="ds-btn ds-btn--primary ds-btn--block"
        onClick={handleNext}
        disabled={busy || loading}
        style={{ marginTop: 8 }}
      >
        {busy ? "Checking…" : "Continue"}
      </button>

      <p className="ds-field__hint" style={{ textAlign: "center", marginTop: 16 }}>
        Already have an account? <Link to="/login" style={{ color: "var(--ds-amber-2)" }}>Log in</Link>
      </p>
    </div>
  );
}
