import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaUser, FaHeart, FaGlobe, FaEnvelope, FaHandshake } from 'react-icons/fa';

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { icon: <FaHandshake />, path: '/app/match-queue' },
    { icon: <FaHeart />, path: '/app/likes' },
    { icon: <FaEnvelope />, path: '/app/matches' },
    { icon: <FaGlobe />, path: '/app/explore' },
    { icon: <FaUser />, path: '/app/profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 w-full z-50">
      <div className="mx-auto px-4">
        <ul className="flex justify-between items-center w-full max-w-screen-xl mx-auto bg-white/30 backdrop-blur-md shadow-lg rounded-none md:rounded-full py-3 px-6">
          {navItems.map((item, index) => {
            const isActive = location.pathname === item.path;
            return (
              <li key={index} className="flex-1 text-center">
                <button
                  onClick={() => navigate(item.path)}
                  className={`text-xl transition-transform duration-200 transform hover:scale-110 ${
                    isActive
                      ? 'text-emerald-400 drop-shadow-md'
                      : 'text-gray-400'
                  }`}
                >
                  {item.icon}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;
