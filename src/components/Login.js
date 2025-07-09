import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../firebase";
import { useNavigate, Link } from "react-router-dom";
import "../styles.css";
import { doc, getDoc } from "firebase/firestore";
import { generateMatchesForUser } from "../firebase/generateMatchesForUser";
import blossom1 from "../assets/blossom1.png";
import blossom2 from "../assets/blossom2.png";
import vines9 from "../assets/vines9.png";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (!userDocSnap.exists()) {
        setLoading(false);
        setError("No profile found. Please complete signup.");
        return;
      }

      const userData = userDocSnap.data();
      await generateMatchesForUser({ uid: user.uid, ...userData }, user.uid);

      sessionStorage.setItem("justLoggedIn", "true");
      navigate("/app/match-queue");

    } catch (err) {
      console.error("Login failed:", err);
      setError("Login failed. Please check your email and password.");
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="login-background">
        <div className="login-vine-overlay" />
        <div className="login-container">
          <div className="login-card-glass">
            <h2 className="login-title">Loading your matches...</h2>
            <div className="login-spinner" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-background">
      <div 
        className="login-vine-overlay"
        style={{
          backgroundImage: `url(${vines9})`,
          backgroundSize: '60% auto',
          backgroundPosition: 'top right',
          backgroundRepeat: 'no-repeat'
        }}
      />
      <div className="login-container">
        <div className="login-card-glass">
          <div className="login-header">
            <h2 className="login-title">Welcome Back</h2>
            <p className="login-subtitle">Continue your journey into DateScape</p>
          </div>
          
          <form onSubmit={handleLogin} className="login-form">
            <div className="input-group">
              <label htmlFor="email" className="input-label">Email</label>
              <input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="login-input"
              />
            </div>
            
            <div className="input-group">
              <label htmlFor="password" className="input-label">Password</label>
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="login-input"
              />
            </div>
            
            {error && <p className="login-error">{error}</p>}
            
            <button type="submit" className="login-button">
              Log In
            </button>
          </form>
          
          <p className="login-signup-link">
            Don't have an account? <Link to="/signup">Sign up here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
