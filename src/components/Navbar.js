import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaUser, FaHeart, FaGlobe, FaEnvelope, FaHandshake } from 'react-icons/fa';
import { Bell } from 'lucide-react';
import NotificationPopup from './NotificationPopup';
import { db, auth } from '../firebase';
import { collection, query, orderBy, getDocs, doc, writeBatch, updateDoc } from 'firebase/firestore';

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Notification state
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [hasUnread, setHasUnread] = useState(false);

  // Fetch notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      if (!auth.currentUser) return;
      const q = query(
        collection(db, `users/${auth.currentUser.uid}/notifications`),
        orderBy('timestamp', 'desc')
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setNotifications(data);
      setHasUnread(data.some((n) => !n.read));
    };
    fetchNotifications();
  }, [auth.currentUser, showNotifications]);

  // Mark all as read
  const onMarkAllRead = async () => {
    if (!auth.currentUser || notifications.length === 0) return;
    const batch = writeBatch(db);
    notifications.forEach((n) => {
      if (!n.read) {
        const ref = doc(db, `users/${auth.currentUser.uid}/notifications`, n.id);
        batch.update(ref, { read: true });
      }
    });
    await batch.commit();
    const updated = notifications.map(n => ({ ...n, read: true }));
    setNotifications(updated);
    setHasUnread(false);
  };

  // Handle notification click
  const handleNotificationClick = async (notif) => {
    if (!notif.read && auth.currentUser) {
      try {
        const ref = doc(db, `users/${auth.currentUser.uid}/notifications`, notif.id);
        await updateDoc(ref, { read: true });
        setNotifications((prev) => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
      } catch (e) {
        console.error('Failed to mark notification as read:', e);
      }
    }
    if (notif.type === "new_message" && notif.matchId) {
      navigate(`/app/chat/${notif.matchId}`);
    } else if (notif.type === "new_match" && notif.matchId) {
      navigate(`/app/match/${notif.matchId}`);
    }
    setShowNotifications(false);
  };

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
          {/* Notification Bell */}
          <li className="flex-1 text-center">
            <button onClick={() => { setShowNotifications((prev) => !prev); if (!showNotifications) onMarkAllRead(); }} className="relative">
              <Bell className="w-8 h-8 text-white hover:text-amber-300" />
              {hasUnread && (
                <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full" />
              )}
            </button>
            {showNotifications && (
              <NotificationPopup
                notifications={notifications}
                onClose={() => setShowNotifications(false)}
                onMarkAllRead={onMarkAllRead}
                onNotificationClick={handleNotificationClick}
              />
            )}
          </li>
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
