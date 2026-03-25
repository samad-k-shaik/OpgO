import React from 'react';
import { doc, serverTimestamp, setDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { auth, firestore } from './firebase';
import { getHospitalAccessToken, getReceptionistName, getReceptionistPhone, getDoctorName } from './storage';

export type ClientType = 'reception' | 'patient' | 'display' | 'admin' | 'doctor' | 'unknown';

export function useHospitalPresence(clientType: ClientType, patientPhone?: string) {
  React.useEffect(() => {
    const hospitalAccessToken = getHospitalAccessToken();
    if (!hospitalAccessToken) return;

    let cancelled = false;
    const patientPhoneNormalized = patientPhone?.trim() ? patientPhone.trim() : null;

    async function start() {
      try {
        let hospitalId: string | null = null;
        const hSnap = await getDocs(query(collection(firestore, 'hospitals'), where('accessToken', '==', hospitalAccessToken)));
        if (!hSnap.empty) {
          hospitalId = hSnap.docs[0].id;
        }
        if (!hospitalId) return;

        const sessionId = auth.currentUser?.uid || `anon_${Math.random().toString(36).substring(2, 11)}`;
        const ref = doc(firestore, 'hospitalSessions', sessionId);

        const receptionistName = getReceptionistName();
        const receptionistPhone = getReceptionistPhone();
        const doctorName = getDoctorName();

        const writePresence = async () => {
          if (cancelled) return;
          await setDoc(
            ref,
            {
              hospitalId,
              socketId: sessionId,
              clientType,
              patientPhone: patientPhoneNormalized,
              receptionistName: clientType === 'reception' ? receptionistName : null,
              receptionistPhone: clientType === 'reception' ? receptionistPhone : null,
              doctorName: clientType === 'doctor' ? doctorName : null,
              connectedAt: serverTimestamp(),
              lastSeenAt: serverTimestamp(),
              disconnectedAt: null,
            },
            { merge: true },
          );
        };

        await writePresence();

        const interval = window.setInterval(() => {
          void writePresence().catch(() => undefined);
        }, 20_000);

        const onBeforeUnload = () => {
          setDoc(
            ref,
            {
              disconnectedAt: serverTimestamp(),
            },
            { merge: true },
          ).catch(() => undefined);
        };

        window.addEventListener('beforeunload', onBeforeUnload);

        return () => {
          window.removeEventListener('beforeunload', onBeforeUnload);
          window.clearInterval(interval);
        };
      } catch {
        // Presence is best-effort
      }
    }

    let cleanup: void | (() => void);
    void start().then((c) => {
      cleanup = c;
    });

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [clientType, patientPhone]);
}
