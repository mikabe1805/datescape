import React from 'react';
import '../styles.css';

export default function SignupLayout({ children }) {
  return (
    <div className="signup-layout">
      <div className="vines-background" />
      <div className="signup-content">
        {children}
      </div>
    </div>
  );
}

