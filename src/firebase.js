// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, serverTimestamp, enableIndexedDbPersistence, doc, updateDoc, arrayUnion  } from "firebase/firestore";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { getStorage } from 'firebase/storage';

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBagpj_hR9hCLZsbqUlQvtTQb2ncaaH6OY",
  authDomain: "datescape-ed925.firebaseapp.com",
  projectId: "datescape-ed925",
  storageBucket: "datescape-ed925.appspot.com",
  messagingSenderId: "156304129791",
  appId: "1:156304129791:web:410647e39d18227d14d6ca",
  measurementId: "G-KHVJQ41ESN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let messaging;

enableIndexedDbPersistence(db).catch((err) => {
  console.warn("Firestore persistence not enabled", err.code);
});

export { auth, db };
export const storage = getStorage(app);
export { serverTimestamp };

export async function initMessagingForCurrentUser() {
  try {
    const supported = await isSupported();
    if (!supported) return;
    const vapidKey = process.env.REACT_APP_VAPID_KEY;
    if (!vapidKey) return;
    if (!messaging) messaging = getMessaging(app);

    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    if (!token) return;
    const user = auth.currentUser;
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), {
      'notifications.webPushTokens': arrayUnion(token)
    });
  } catch (e) {
    console.warn('Web push init failed', e);
  }
}
