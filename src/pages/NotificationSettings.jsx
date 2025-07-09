import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const NotificationSettings = () => {
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [smsNotifications, setSmsNotifications] = useState(false);
  const [notificationEmail, setNotificationEmail] = useState("");
  const [notificationPhone, setNotificationPhone] = useState("");
  const [useLoginEmail, setUseLoginEmail] = useState(true);

  const auth = getAuth();
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;
    const fetchSettings = async () => {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const settings = userSnap.data().notificationSettings || {};
        setEmailNotifications(!!settings.emailNotifications);
        setSmsNotifications(!!settings.smsNotifications);
        setNotificationEmail(settings.notificationEmail || "");
        setNotificationPhone(settings.notificationPhone || "");
        setUseLoginEmail(!!settings.useLoginEmail);
      }
    };
    fetchSettings();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, {
      notificationSettings: {
        emailNotifications,
        smsNotifications,
        notificationEmail: useLoginEmail ? user.email : notificationEmail,
        notificationPhone,
        useLoginEmail
      }
    });
    alert("Notification settings saved!");
  };

  return (
    <div className="p-4 rounded-lg shadow-md bg-white">
      <h2 className="text-xl font-semibold mb-4">Notification Settings</h2>
      <div className="mb-4 text-yellow-700 bg-yellow-100 rounded px-2 py-1 text-sm">
        Note: Please check your spam folder for email notifications!
      </div>

      <label className="flex items-center space-x-2 mb-2">
        <input
          type="checkbox"
          checked={emailNotifications}
          onChange={(e) => setEmailNotifications(e.target.checked)}
        />
        <span>Email Notifications</span>
      </label>

      {emailNotifications && (
        <div className="ml-4 mb-4">
          <label className="flex items-center space-x-2 mb-1">
            <input
              type="checkbox"
              checked={useLoginEmail}
              onChange={(e) => setUseLoginEmail(e.target.checked)}
            />
            <span>Use login email ({user?.email})</span>
          </label>
          {!useLoginEmail && (
            <input
              type="email"
              value={notificationEmail}
              onChange={(e) => setNotificationEmail(e.target.value)}
              placeholder="Your notification email"
              className="border rounded px-2 py-1 w-full"
            />
          )}
        </div>
      )}

      <label className="flex items-center space-x-2 mb-2">
        <input
          type="checkbox"
          checked={smsNotifications}
          onChange={(e) => setSmsNotifications(e.target.checked)}
        />
        <span>SMS Notifications</span>
      </label>

      {smsNotifications && (
        <div className="ml-4 mb-4">
          <input
            type="tel"
            value={notificationPhone}
            onChange={(e) => setNotificationPhone(e.target.value)}
            placeholder="Your phone number"
            className="border rounded px-2 py-1 w-full"
          />
        </div>
      )}

      <button
        onClick={handleSave}
        className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Save Settings
      </button>
    </div>
  );
};

export default NotificationSettings;
