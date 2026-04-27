import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import './index.css';
import { auth, initMessagingForCurrentUser } from "./firebase";
import { onAuthStateChanged, setPersistence, browserLocalPersistence } from "firebase/auth";
import { setupPwaInstallEvents } from "./utils/pwaInstall";
const Login = React.lazy(() => import('./components/Login'));
const LandingPage = React.lazy(() => import('./components/LandingPage'));
const MultiStepSignup = React.lazy(() => import('./components/MultiStepSignup'));
const MainApp = React.lazy(() => import('./MainApp'));


function App() {
  const [user, setUser] = React.useState(null);
  const [authLoading, setAuthLoading] = React.useState(true);

  React.useEffect(() => {
    let unsubscribe = () => {};
    Promise.resolve(setPersistence(auth, browserLocalPersistence))
      .then(() => {
        unsubscribe = onAuthStateChanged(auth, (user) => {
          setUser(user);
          setAuthLoading(false);
          if (user) {
            initMessagingForCurrentUser();
          }
        });
      })
      .catch((error) => {
        console.error("Error setting persistence:", error);
        setAuthLoading(false);
      });
    return () => unsubscribe();
  }, []);

  React.useEffect(() => setupPwaInstallEvents(), []);

  if (authLoading) {
    return <div>Loading...</div>;
  }
  return (
    <Router>
      <React.Suspense fallback={<div>Loading...</div>}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signup" element={<MultiStepSignup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/app/*" element={user ? <MainApp /> : <Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to={user ? "/app/profile" : "/signup"} />} />
        </Routes>
      </React.Suspense>
    </Router>
  );
}

export default App;
