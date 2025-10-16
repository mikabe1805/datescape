import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import dotenv from 'dotenv';

dotenv.config();

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  appId: process.env.FIREBASE_APP_ID,
};

// Validate required config
const requiredKeys = ['FIREBASE_API_KEY', 'FIREBASE_AUTH_DOMAIN', 'FIREBASE_PROJECT_ID', 'FIREBASE_APP_ID'];
const missing = requiredKeys.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`❌ Missing required Firebase config: ${missing.join(', ')}`);
  console.error('Please copy env.example to .env and fill in your Firebase configuration.');
  process.exit(1);
}

// Warn if using production project
if (process.env.FIREBASE_PROJECT_ID === 'datescape-9ec9e') {
  console.error('⚠️  ERROR: You are using the production project!');
  console.error('Please use a staging project for benchmarks to avoid polluting production data.');
  console.error('Set FIREBASE_PROJECT_ID in .env to your staging project.');
  process.exit(1);
}

console.log(`🔥 Initializing Firebase (Project: ${firebaseConfig.projectId})...`);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Optional: Connect to emulator if specified
if (process.env.FIRESTORE_EMULATOR_HOST) {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  console.log(`🔧 Connecting to Firestore emulator at ${host}:${port}`);
  connectFirestoreEmulator(db, host, parseInt(port));
}

/**
 * Sign in anonymously if not already authenticated
 */
export async function ensureAuth() {
  if (!auth.currentUser) {
    console.log('🔐 Signing in anonymously...');
    try {
      await signInAnonymously(auth);
      console.log('✅ Anonymous authentication successful');
    } catch (error) {
      console.error('❌ Authentication failed:', error.message);
      console.error('Make sure your Firebase rules allow anonymous authentication.');
      throw error;
    }
  }
  return auth.currentUser;
}

export { app, db, auth };

