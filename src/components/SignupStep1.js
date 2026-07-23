import React, { useRef, useState } from "react";
import { fetchSignInMethodsForEmail } from "firebase/auth";
import { auth } from "../firebase";
import { Link } from "react-router-dom";

async function checkIfPasswordEmailExists(email) {
  const methods = await fetchSignInMethodsForEmail(auth, email);
  return methods.includes("password");
}

export default function SignupStep1({ formData, setFormData, onNext, loading }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [invalidField, setInvalidField] = useState(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);
  const fieldRefs = {
    email: emailRef,
    password: passwordRef,
    confirmPassword: confirmPasswordRef,
  };

  const showError = (message, field) => {
    setError(message);
    setInvalidField(field);
    fieldRefs[field]?.current?.focus();
  };

  const updateField = (field, value) => {
    setFormData({ ...formData, [field]: value });
    if (invalidField === field) {
      setError("");
      setInvalidField(null);
    }
  };

  const handleNext = async (event) => {
    event?.preventDefault();
    setError("");
    setInvalidField(null);
    const { email, password, confirmPassword } = formData;
    const firstMissing = ["email", "password", "confirmPassword"].find(
      (field) => !formData[field],
    );
    if (firstMissing) {
      showError("Please fill in all fields.", firstMissing);
      return;
    }
    if (password !== confirmPassword) {
      showError("Passwords do not match.", "confirmPassword");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showError("Please enter a valid email.", "email");
      return;
    }
    setBusy(true);
    try {
      try {
        await auth.signOut();
      } catch {}
      // Never query the private users collection to discover an email. Auth
      // remains authoritative; account creation handles a race or an
      // enumeration-protected empty method list with email-already-in-use.
      const exists = await checkIfPasswordEmailExists(email);
      if (exists) {
        showError("Email is already in use. Try logging in instead.", "email");
        return;
      }
      onNext();
    } catch (e) {
      console.warn("Email check failed:", e);
      showError("Couldn't check this email. Try again in a moment.", "email");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="ds-card" onSubmit={handleNext}>
      <div className="ds-card__eyebrow">Create your account</div>
      <h1 className="ds-card__title">Welcome to DateScape</h1>
      <p className="ds-card__subtitle">
        Set up your login. You'll build out your profile over the next few steps.
      </p>

      <label className="ds-field">
        <span className="ds-field__label">Email</span>
        <input
          ref={emailRef}
          id="signup-email"
          className="ds-input"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={formData.email || ""}
          onChange={(e) => updateField("email", e.target.value)}
          aria-invalid={invalidField === "email"}
          aria-describedby={invalidField === "email" ? "signup-step1-error" : undefined}
        />
      </label>

      <label className="ds-field">
        <span className="ds-field__label">Password</span>
        <input
          ref={passwordRef}
          id="signup-password"
          className="ds-input"
          type="password"
          autoComplete="new-password"
          placeholder="At least 6 characters"
          value={formData.password || ""}
          onChange={(e) => updateField("password", e.target.value)}
          aria-invalid={invalidField === "password"}
          aria-describedby={invalidField === "password" ? "signup-step1-error" : undefined}
        />
      </label>

      <label className="ds-field">
        <span className="ds-field__label">Confirm password</span>
        <input
          ref={confirmPasswordRef}
          id="signup-confirm-password"
          className="ds-input"
          type="password"
          autoComplete="new-password"
          placeholder="Type it again"
          value={formData.confirmPassword || ""}
          onChange={(e) => updateField("confirmPassword", e.target.value)}
          aria-invalid={invalidField === "confirmPassword"}
          aria-describedby={invalidField === "confirmPassword" ? "signup-step1-error" : undefined}
        />
      </label>

      {error && (
        <div
          id="signup-step1-error"
          className="ds-field__error"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        className="ds-btn ds-btn--primary ds-btn--block"
        disabled={busy || loading}
        style={{ marginTop: 8 }}
      >
        {busy ? "Checking…" : "Continue"}
      </button>

      <p className="ds-field__hint" style={{ textAlign: "center", marginTop: 16 }}>
        Already have an account? <Link to="/login" style={{ color: "var(--ds-amber-2)" }}>Log in</Link>
      </p>
    </form>
  );
}
