import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  // For emulator/dev: fall back to safe placeholders so the app boots
  // even if you haven't pasted production Firebase config yet.
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'local-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'localhost',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'local-project',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? 'local-app-id',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? undefined,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? undefined,
};

const app = (() => {
  return getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
})();

export const firebaseApp = app;
export const auth = getAuth(app);
export const firestore = getFirestore(app);

// No emulator wiring for this deployment.

