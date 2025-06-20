// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, serverTimestamp, enableIndexedDbPersistence  } from "firebase/firestore";
import { getStorage } from 'firebase/storage';

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBagpj_hR9hCLZsbqUlQvtTQb2ncaaH6OY",
  authDomain: "datescape-ed925.firebaseapp.com",
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

// ✅ Add this right here:
enableIndexedDbPersistence(db).catch((err) => {
  console.warn("Firestore persistence not enabled", err.code);
});

export { auth, db };
export const storage = getStorage(app);
export { serverTimestamp };
