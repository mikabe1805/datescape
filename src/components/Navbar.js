import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Heart, Mail, Sparkles, User, Globe } from 'lucide-react';
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
    { icon: <Sparkles className="h-5 w-5" strokeWidth={2.15} />, label: "Queue", path: '/app/match-queue' },
    { icon: <Heart className="h-5 w-5" strokeWidth={2.15} />, label: "Likes", path: '/app/likes' },
    { icon: <Mail className="h-5 w-5" strokeWidth={2.15} />, label: "Matches", path: '/app/matches' },
    { icon: <Globe className="h-5 w-5" strokeWidth={2.15} />, label: "Explore", path: '/app/explore' },
    { icon: <User className="h-5 w-5" strokeWidth={2.15} />, label: "Profile", path: '/app/profile' },
  ];

  return (
    <>
      {showNotifications && (
        <div className="fixed inset-0 z-[70] bg-[#04100d]/50 backdrop-blur-[6px]" onClick={() => setShowNotifications(false)}>
          <div className="absolute inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] px-3 sm:inset-x-auto sm:bottom-[calc(96px+env(safe-area-inset-bottom))] sm:left-4 sm:w-[24rem] sm:px-0">
            <div onClick={(event) => event.stopPropagation()}>
              <NotificationPopup
                notifications={notifications}
                onClose={() => setShowNotifications(false)}
                onMarkAllRead={onMarkAllRead}
                onNotificationClick={handleNotificationClick}
              />
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#07110e] via-[#07110e]/86 to-transparent" />
      <div className="mx-auto w-full max-w-screen-xl px-2 sm:px-4">
        <ul className="relative flex items-stretch gap-1 overflow-visible border border-white/12 bg-[rgba(14,28,23,0.88)] px-2 py-2 shadow-[0_-18px_44px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:rounded-[24px]">
          <li className="relative flex-1">
            <button
              onClick={() => setShowNotifications((prev) => !prev)}
              className={`mx-auto flex h-14 w-full max-w-[5rem] flex-col items-center justify-center gap-1 rounded-2xl transition ${
                showNotifications ? "bg-amber-300 text-[#10201a] shadow-[0_10px_24px_rgba(245,201,115,0.24)]" : "bg-white/6 text-amber-100 hover:bg-white/10"
              }`}
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" strokeWidth={2.25} />
              <span className="text-[10px] font-medium">Alerts</span>
              {hasUnread && (
                <>
                  <span className="absolute right-[calc(50%-18px)] top-1 h-3 w-3 rounded-full bg-rose-500 ring-2 ring-[#0d1b16]" />
                  <span className="sr-only">{unreadCount} unread notifications</span>
                </>
              )}
            </button>
          </li>
          {navItems.map((item, index) => {
            const isActive = location.pathname === item.path;
            return (
              <li key={index} className="flex-1">
                <button
                  onClick={() => navigate(item.path)}
                  className={`mx-auto flex h-14 w-full max-w-[5rem] flex-col items-center justify-center gap-1 rounded-2xl text-lg transition ${
                    isActive
                      ? 'navbar-active text-amber-200'
                      : 'text-white/60 hover:bg-white/8 hover:text-amber-100'
                  }`}
                  aria-label={item.label}
                >
                  {item.icon}
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      </nav>
    </>
  );
};

export default Navbar;
