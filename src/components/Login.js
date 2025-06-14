// Login.js
import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate, Link } from "react-router-dom";
import "../styles.css";
import { generateMatchesForUser } from "../firebase/generateMatchesForUser";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      // await generateMatchesForUser(user.uid);
      navigate("/app");
    } catch (err) {
      setError("Login failed. Please check your email and password.");
    }
  };

  return (
    <div className="full-landing-wrapper login-background">
      <div className="login-container">
        <div className="card login-card">
          <h2 className="form-title">Log In</h2>
          <form onSubmit={handleLogin}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className="error-message">{error}</p>}
            <button type="submit" className="button primary">Log In</button>
          </form>
          <p className="signup-link">
            Don’t have an account? <Link to="/signup">Sign up here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
