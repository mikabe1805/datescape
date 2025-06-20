import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Signup from "./components/Signup";
import Login from "./components/Login";
import Profile from "./components/ProfilePage";
import LandingPage from "./components/LandingPage";
import MultiStepSignup from "./components/MultiStepSignup";
import MainApp from './components/MainApp';
import { auth } from "./firebase";
import { onAuthStateChanged, setPersistence, browserLocalPersistence } from "firebase/auth";

function App() {
  const [user, setUser] = React.useState(null);
  const [authLoading, setAuthLoading] = React.useState(true);

  React.useEffect(() => {
  setPersistence(auth, browserLocalPersistence)
    .then(() => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        setUser(user);
        setAuthLoading(false);
      });
      return unsubscribe;
    })
    .catch((error) => {
      console.error("Error setting persistence:", error);
      setAuthLoading(false);
    });
}, []);

  if (authLoading) {
    return <div>Loading...</div>;
  }
  return (
    <Router>
      <Routes>
        <Route path="/app/*" element={<MainApp />} />
        <Route path="/" element={<LandingPage />} />
        <Route path="/signup" element={<MultiStepSignup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/profile" element={user ? <Profile /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={user ? "/profile" : "/signup"} />} />
      </Routes>
    </Router>
  );
}

export default App;
