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

enableIndexedDbPersistence(db).catch((err) => {
  console.warn("Firestore persistence not enabled", err.code);
});

export { auth, db, rtdb };
export const storage = getStorage(app);
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

    if (!messaging) messaging = getMessaging(app);

    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    if (!token) return { status: "token_unavailable" };
    const user = auth.currentUser;
    if (!user) return { status: "signed_out" };

    const userRef = doc(db, "users", user.uid);
    const previousToken = window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
    if (previousToken && previousToken !== token) {
      await updateDoc(userRef, {
        "notifications.webPushTokens": arrayRemove(previousToken)
      });
    }

    await updateDoc(userRef, {
      "notifications.webPushTokens": arrayUnion(token),
      "notifications.pushPermission": "granted",
      "notifications.pushUpdatedAt": serverTimestamp()
    });
    window.localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
    return { status: "granted", token };
  } catch (e) {
    console.warn('Web push init failed', e);
    return { status: "error", error: e };
  }
}

export async function disableMessagingForCurrentUser() {
  const supported = await getMessagingSupport();
  const user = auth.currentUser;
  const storedToken =
    typeof window !== "undefined"
      ? window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY)
      : null;

  try {
    if (supported) {
      if (!messaging) messaging = getMessaging(app);
      await deleteToken(messaging).catch(() => {});
    }

    if (user && storedToken) {
      await updateDoc(doc(db, "users", user.uid), {
        "notifications.webPushTokens": arrayRemove(storedToken),
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
