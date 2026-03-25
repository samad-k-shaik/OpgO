import admin from 'firebase-admin';

let initialized = false;

export function initFirebaseAdmin() {
  if (initialized) return admin;

  if (admin.apps.length === 0) {
    admin.initializeApp();
  }

  // Local emulator wiring. When running `firebase emulators:start --only auth,firestore,functions`
  // Firebase tools will set these env vars automatically, but we also provide safe defaults.
  const isLocalEmulator =
    !!process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    !!process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.NODE_ENV === 'development';

  if (isLocalEmulator) {
    const authEmulatorHost =
      process.env.FIREBASE_AUTH_EMULATOR_HOST ?? 'http://localhost:9099';
    const firestoreEmulatorHost =
      process.env.FIRESTORE_EMULATOR_HOST ?? 'localhost:8080';

    // Auth emulator: not strictly required for most callable/HTTP functions,
    // because the Auth Emulator is handled by Firebase Tools during emulation.
    // Leaving this out avoids SDK typing mismatches across firebase-admin versions.

    // Firestore emulator
    admin.firestore().settings({
      host: firestoreEmulatorHost,
      ssl: false,
    });
  }

  initialized = true;
  return admin;
}

export { admin };

