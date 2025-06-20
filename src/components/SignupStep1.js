import React, { useState } from 'react';
import { getAuth, createUserWithEmailAndPassword, fetchSignInMethodsForEmail  } from 'firebase/auth';
import { auth } from "../firebase";
import SignupLayout from '../components/SignupLayout';
import CardWrapper from '../components/CardWrapper';
import { Link } from "react-router-dom";


async function checkIfEmailExists(email) {
  const methods = await fetchSignInMethodsForEmail(auth, email);
  return methods.length > 0;
}

export default function SignupStep1({ formData, setFormData, onNext }) {
  const [error, setError] = useState("");

  const handleCreateAccount = async () => {
  const { email, password, confirmPassword } = formData;

  if (!email || !password || !confirmPassword) {
    setError("Please fill in all fields.");
    return;
  }

  if (password !== confirmPassword) {
    setError("Passwords do not match.");
    return;
  }

  const emailExists = await checkIfEmailExists(email);
  if (emailExists) {
    setError("Email already used! Try logging in instead");
    return;
  }

  onNext();
};


  return (
    <SignupLayout>
      <CardWrapper>
        <h2>Create Your Account</h2>

        <label>Email:</label>
        <input
          type="email"
          value={formData.email || ''}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        />

        <label>Password:</label>
        <input
          type="password"
          value={formData.password || ''}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
        />

        <label>Confirm Password:</label>
        <input
          type="password"
          value={formData.confirmPassword || ''}
          onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
        />

        {error && <div style={{ color: 'red', marginTop: '10px' }}>{error}</div>}

        <button className="nav-button" onClick={handleCreateAccount}>Next</button>
        <p className="signup-link">
                    Already have an account? <Link to="/login">Login here</Link>
                  </p>
      </CardWrapper>
    </SignupLayout>
  );
}