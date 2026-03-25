import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase';

const functions = getFunctions(firebaseApp);

// Emulator wiring (only when running locally).
if (typeof window !== 'undefined') {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isLocal) {
    const host = import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST ?? 'localhost';
    const port = Number(import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT ?? 5004);
    connectFunctionsEmulator(functions, host, port);
  }
}

export const hospitalLogin = httpsCallable(functions, 'hospitalLogin');

export const adminListHospitalsCallable = httpsCallable(functions, 'adminListHospitalsCallable');
export const adminCreateHospitalCallable = httpsCallable(functions, 'adminCreateHospitalCallable');
export const adminGetSummaryForDateCallable = httpsCallable(functions, 'adminGetSummaryForDateCallable');
export const adminGetSessionsCallable = httpsCallable(functions, 'adminGetSessionsCallable');

export const receptionCreateTokenCallable = httpsCallable(functions, 'receptionCreateToken');

export const getHospitalDoctorsCallable = httpsCallable(functions, 'getHospitalDoctors');
export const getQueueViewCallable = httpsCallable(functions, 'getQueueView');
export const updateTokenStatusCallable = httpsCallable(functions, 'updateTokenStatus');
export const getPatientTokenStatusCallable = httpsCallable(functions, 'getPatientTokenStatus');

