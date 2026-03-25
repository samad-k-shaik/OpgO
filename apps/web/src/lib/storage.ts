const HOSPITAL_TOKEN_KEY = 'hospitalAccessToken';
const PATIENT_PHONE_KEY = 'patientPhone';
const RECEPTIONIST_NAME_KEY = 'receptionistName';
const RECEPTIONIST_PHONE_KEY = 'receptionistPhone';
const DOCTOR_NAME_KEY = 'doctorName';

export function getHospitalAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(HOSPITAL_TOKEN_KEY);
}

export function setHospitalAccessToken(v: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HOSPITAL_TOKEN_KEY, v);
}

export function getPatientPhone(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(PATIENT_PHONE_KEY);
}

export function setPatientPhone(v: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PATIENT_PHONE_KEY, v);
}

export function getReceptionistName(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(RECEPTIONIST_NAME_KEY);
}

export function setReceptionistName(v: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RECEPTIONIST_NAME_KEY, v);
}

export function getReceptionistPhone(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(RECEPTIONIST_PHONE_KEY);
}

export function setReceptionistPhone(v: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RECEPTIONIST_PHONE_KEY, v);
}

export function getDoctorName(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(DOCTOR_NAME_KEY);
}

export function setDoctorName(v: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DOCTOR_NAME_KEY, v);
}
