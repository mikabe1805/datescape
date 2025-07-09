import React, { useState } from 'react';
import { getAuth, createUserWithEmailAndPassword, fetchSignInMethodsForEmail  } from 'firebase/auth';
import { auth, db } from "../firebase";
import { getDocs, query, collection, where } from 'firebase/firestore';
import SignupLayout from '../components/SignupLayout';
import CardWrapper from '../components/CardWrapper';
import { Link } from "react-router-dom";


async function checkIfEmailUsedAnywhere(email) {
  const methods = await fetchSignInMethodsForEmail(auth, email);
  if (methods.includes("password")) return true;

  // Backup check: is this email in Firestore?
  const q = query(collection(db, "users"), where("email", "==", email));
  const snap = await getDocs(q);
  return !snap.empty;
}


export default function SignupStep1({ formData, setFormData, onNext }) {
  const [error, setError] = useState("");

  const handleCreateAccount = async () => {
  await auth.signOut(); // ensure clean state
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

  try {
    const emailExists = await checkIfEmailUsedAnywhere(email);
    if (emailExists) {
      setError("Email already used! Try logging in instead");
      return;
    }
  } catch (err) {
    console.error("Error checking email:", err);
    setError("Something went wrong. Please try again.");
    return;
  }

  setError(""); // clear any previous errors
  onNext();
};




  return (
    <SignupLayout>
      <CardWrapper>
        <h2>Create Your Account</h2>

        <div className="input-group">
          <label htmlFor="email" className="input-label">Email</label>
          <input
            id="email"
            type="email"
            placeholder="Enter your email"
            value={formData.email || ''}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="login-input"
          />
        </div>

        <div className="input-group">
          <label htmlFor="password" className="input-label">Password</label>
          <input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={formData.password || ''}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            className="login-input"
          />
        </div>

        <div className="input-group">
          <label htmlFor="confirmPassword" className="input-label">Confirm Password</label>
          <input
            id="confirmPassword"
            type="password"
            placeholder="Confirm your password"
            value={formData.confirmPassword || ''}
            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
            className="login-input"
          />
        </div>

        {error && <div className="login-error">{error}</div>}

        <button className="nav-button" onClick={handleCreateAccount}>Next</button>
        <p className="signup-link">
          Already have an account? <Link to="/login">Login here</Link>
        </p>
      </CardWrapper>
    </SignupLayout>
  );
}