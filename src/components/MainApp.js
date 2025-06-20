import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import MatchQueue from './MatchQueue';
import MatchesList from './MatchList';
import Messages from './Messages';
import ProfilePage from './ProfilePage';
import { getAuth } from 'firebase/auth';
import '../styles.css';

export default function MainApp() {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="main-app-container">
      <div className="main-content">
        <Routes>
          <Route path="/" element={<MatchQueue />} />
          <Route path="/matches" element={<MatchesList />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </div>
    </div>
  );
}
