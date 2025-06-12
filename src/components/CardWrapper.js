import React from 'react';
import '../styles.css';  // ensure your styles already include .form-card

export default function CardWrapper({ children }) {
  return (
    <div className="form-card">
      {children}
    </div>
  );
}
