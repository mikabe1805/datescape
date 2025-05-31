// JungleOverlay.js
import React from 'react';
import jungleGif from '../assets/jungle-leaves.gif';

const JungleOverlay = () => (
  <div className="jungle-overlay">
    <img src={jungleGif} alt="Animated leaves" className="jungle-gif" />
  </div>
);

export default JungleOverlay;
