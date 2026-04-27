import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaUser, FaHeart, FaGlobe, FaEnvelope, FaHandshake } from 'react-icons/fa';
import { Bell } from 'lucide-react';
import NotificationPopup from './NotificationPopup';
import { db, auth } from '../firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  writeBatch,
  updateDoc
} from 'firebase/firestore';

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUserId = auth.currentUser?.uid;

  // Notification state
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    if (!currentUserId) {
      setNotifications([]);
      setHasUnread(false);
      return undefined;
    }

    const q = query(
      collection(db, `users/${currentUserId}/notifications`),
      orderBy('timestamp', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data()
      }));
      setNotifications(data);
      setHasUnread(data.some((notification) => !notification.read));
    });
  }, [currentUserId]);

  const onMarkAllRead = async () => {
    if (!currentUserId || notifications.length === 0) return;
    const batch = writeBatch(db);
    notifications.forEach((n) => {
      if (!n.read) {
        const ref = doc(db, `users/${currentUserId}/notifications`, n.id);
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
    if (!notif.read && currentUserId) {
      try {
        const ref = doc(db, `users/${currentUserId}/notifications`, notif.id);
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

  const unreadCount = useMemo(
    () => notifications.reduce((count, notification) => count + (notification.read ? 0 : 1), 0),
    [notifications]
  );

  const navItems = [
    { icon: <FaHandshake />, label: "Queue", path: '/app/match-queue' },
    { icon: <FaHeart />, label: "Likes", path: '/app/likes' },
    { icon: <FaEnvelope />, label: "Matches", path: '/app/matches' },
    { icon: <FaGlobe />, label: "Explore", path: '/app/explore' },
    { icon: <FaUser />, label: "Profile", path: '/app/profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-screen-xl sm:px-4">
        <ul className="flex items-center gap-1 border-t border-white/10 bg-[#0d1b16]/92 px-2 py-2 shadow-[0_-16px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:rounded-[24px] sm:border">
          <li className="relative flex-1">
            <button
              onClick={() => setShowNotifications((prev) => !prev)}
              className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl transition ${
                showNotifications ? "bg-amber-300 text-[#10201a]" : "bg-white/6 text-amber-100 hover:bg-white/10"
              }`}
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" strokeWidth={2.25} />
              {hasUnread && (
                <>
                  <span className="absolute right-[calc(50%-18px)] top-1 h-3 w-3 rounded-full bg-rose-500 ring-2 ring-[#0d1b16]" />
                  <span className="sr-only">{unreadCount} unread notifications</span>
                </>
              )}
            </button>
            {showNotifications && (
              <div className="absolute bottom-full left-0 mb-3 w-[min(22rem,calc(100vw-1.5rem))] sm:w-[24rem]">
                <NotificationPopup
                  notifications={notifications}
                  onClose={() => setShowNotifications(false)}
                  onMarkAllRead={onMarkAllRead}
                  onNotificationClick={handleNotificationClick}
                />
              </div>
            )}
          </li>
          {navItems.map((item, index) => {
            const isActive = location.pathname === item.path;
            return (
              <li key={index} className="flex-1">
                <button
                  onClick={() => navigate(item.path)}
                  className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-lg transition ${
                    isActive
                      ? 'navbar-active text-amber-200'
                      : 'text-white/60 hover:bg-white/8 hover:text-amber-100'
                  }`}
                  aria-label={item.label}
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
