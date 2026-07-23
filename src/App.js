import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import './index.css';
import { auth, initMessagingForCurrentUser } from "./firebase";
import { onAuthStateChanged, setPersistence, browserLocalPersistence } from "firebase/auth";
import { ensureCoreServiceWorker, setupPwaInstallEvents } from "./utils/pwaInstall";
import { useMatchStore } from "./components/MatchStore";
const InstallBanner = React.lazy(() => import('./components/InstallBanner'));
const Login = React.lazy(() => import('./components/Login'));
const LandingPage = React.lazy(() => import('./components/LandingPage'));
const MultiStepSignup = React.lazy(() => import('./components/MultiStepSignup'));
const MainApp = React.lazy(() => import('./MainApp'));
const WorldPage = React.lazy(() => import('./components/WorldPage'));

// The PWA install banner is only useful on entry-point pages (landing/login/
// signup). Once you're inside the app shell at /app/*, the banner competes
// with chat headers and the world topbar for the same screen real estate.
function ConditionalInstallBanner() {
  const location = useLocation();
  if (location.pathname.startsWith("/app") || location.pathname === "/afterlight") return null;
  return (
    <div className="app-route-shell__banner">
      <InstallBanner />
    </div>
  );
}


function App() {
  const [user, setUser] = React.useState(null);
  const [authLoading, setAuthLoading] = React.useState(true);

  React.useEffect(() => {
    let unsubscribe = () => {};
    Promise.resolve(setPersistence(auth, browserLocalPersistence))
      .then(() => {
        unsubscribe = onAuthStateChanged(auth, (user) => {
          // Zustand lives outside the React route tree; clear account-scoped
          // candidates whenever auth changes so a shared browser cannot show
          // the previous person's queue.
          useMatchStore.getState().clearMatches();
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

  React.useEffect(() => {
    const cleanup = setupPwaInstallEvents();
    ensureCoreServiceWorker();
    return cleanup;
  }, []);

  if (authLoading) {
    return <div>Loading...</div>;
  }
  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <React.Suspense fallback={<div>Loading...</div>}>
        <div className="app-route-shell">
          <ConditionalInstallBanner />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/signup" element={<MultiStepSignup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/afterlight" element={<WorldPage preview />} />
            <Route path="/app/*" element={user ? <MainApp /> : <Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to={user ? "/app/explore" : "/signup"} replace />} />
          </Routes>
        </div>
      </React.Suspense>
    </Router>
  );
}

export default App;
