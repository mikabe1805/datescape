// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  serverTimestamp,
  enableIndexedDbPersistence,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove
} from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getMessaging, getToken, isSupported, deleteToken } from "firebase/messaging";
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBagpj_hR9hCLZsbqUlQvtTQb2ncaaH6OY",
  authDomain: "datescape-ed925.firebaseapp.com",
  databaseURL:
    process.env.REACT_APP_RTDB_URL ||
    "https://datescape-ed925-default-rtdb.firebaseio.com",
  projectId: "datescape-ed925",
  storageBucket: "datescape-ed925.firebasestorage.app",
  messagingSenderId: "156304129791",
  appId: "1:156304129791:web:410647e39d18227d14d6ca",
  measurementId: "G-KHVJQ41ESN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);
let messaging;
let messagingSupportPromise;
const PUSH_TOKEN_STORAGE_KEY = "datescape:webPushToken";

function readStoredPushToken() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.token === "string") return parsed;
  } catch {
    // Legacy builds stored the bare token with no owner. Treat it as unowned
    // so it is invalidated before another account can inherit this device.
  }
  return { uid: null, token: raw };
}

function storePushToken(uid, token) {
  window.localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, JSON.stringify({ uid, token }));
}

enableIndexedDbPersistence(db).catch((err) => {
  console.warn("Firestore persistence not enabled", err.code);
});

export { auth, db, rtdb };
export const storage = getStorage(app);
export const functions = getFunctions(app);
export { serverTimestamp };

function isPushEnvironmentSupported() {
  return (
    typeof window !== "undefined" &&
    typeof Notification !== "undefined" &&
    "serviceWorker" in navigator &&
    window.isSecureContext
  );
}

async function getMessagingSupport() {
  if (!isPushEnvironmentSupported()) return false;
  if (!messagingSupportPromise) {
    messagingSupportPromise = isSupported().catch(() => false);
  }
  return messagingSupportPromise;
}

export function getPushPermissionState() {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export async function initMessagingForCurrentUser({ requestPermission = false } = {}) {
  try {
    const supported = await getMessagingSupport();
    if (!supported) return { status: "unsupported" };
    const vapidKey = process.env.REACT_APP_VAPID_KEY;
    if (!vapidKey) return { status: "missing_vapid_key" };

    let permission = getPushPermissionState();
    if (permission === "default" && requestPermission) {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") {
      return {
        status: permission === "default" ? "permission_required" : permission
      };
    }

    const user = auth.currentUser;
    if (!user) return { status: "signed_out" };

    if (!messaging) messaging = getMessaging(app);
    const previous = readStoredPushToken();
    if (previous && previous.uid !== user.uid) {
      // A push token identifies the browser installation, not the signed-in
      // account. Invalidate it before registering this device to a new user.
      await deleteToken(messaging).catch(() => {});
      window.localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
    }

    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    if (!token) return { status: "token_unavailable" };

    const userRef = doc(db, "users", user.uid);
    if (previous?.uid === user.uid && previous.token !== token) {
      await updateDoc(userRef, {
        "notifications.webPushTokens": arrayRemove(previous.token)
      });
    }

    await updateDoc(userRef, {
      "notifications.webPushTokens": arrayUnion(token),
      "notifications.pushPermission": "granted",
      "notifications.pushUpdatedAt": serverTimestamp()
    });
    storePushToken(user.uid, token);
    return { status: "granted", token };
  } catch (e) {
    console.warn('Web push init failed', e);
    return { status: "error", error: e };
  }
}

export async function disableMessagingForCurrentUser() {
  const supported = await getMessagingSupport();
  const user = auth.currentUser;
  const stored = readStoredPushToken();

  try {
    if (supported) {
      if (!messaging) messaging = getMessaging(app);
      await deleteToken(messaging).catch(() => {});
    }

    if (user && stored?.uid === user.uid && stored.token) {
      await updateDoc(doc(db, "users", user.uid), {
        "notifications.webPushTokens": arrayRemove(stored.token),
        "notifications.pushUpdatedAt": serverTimestamp()
      });
    }
  } catch (e) {
    console.warn("Web push disable failed", e);
    return { status: "error", error: e };
  } finally {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
    }
  }

  return { status: "disabled" };
}
