import React, { useState } from 'react';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import SignupLayout from '../components/SignupLayout';
import CardWrapper from '../components/CardWrapper';

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

    try {
      const auth = getAuth();
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Attach UID into formData to use later
      setFormData(prev => ({ ...prev, uid: user.uid }));

      setError("");
      onNext(); // proceed to Step 2
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
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
      </CardWrapper>
    </SignupLayout>
  );
}