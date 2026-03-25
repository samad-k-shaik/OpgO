import type { Timestamp } from 'firebase-admin/firestore';

export type BookingType = 'REMOTE' | 'WALK_IN';
export type TokenStatus = 'WAITING' | 'SERVING' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED';

export type PaymentStatus = 'INITIATED' | 'SUCCESS' | 'FAILED';

export type PremiumPayment = {
  hospitalId: string;
  tokenId: string;
  phone: string;
  amountPaise: number;
  status: PaymentStatus;
  createdAt: Timestamp;
};

export type Hospital = {
  name: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
};

export type Doctor = {
  hospitalId: string;
  name: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
};

export type Token = {
  hospitalId: string;
  doctorId: string | null;
  tokenNumber: number;
  patientPhone: string;
  bookingType: BookingType;
  premiumEnabled: boolean;
  premiumActivatedAt: Timestamp | null;
  lastPremiumReminderAt: Timestamp | null;

  status: TokenStatus;
  arrivalAt: Timestamp | null;
  consultationStartAt: Timestamp | null;
  consultationEndAt: Timestamp | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type HospitalSession = {
  hospitalId: string;
  clientType: 'reception' | 'patient' | 'display' | 'admin' | 'unknown';
  patientPhone: string | null;
  connectedAt: Timestamp;
  lastSeenAt: Timestamp;
  disconnectedAt: Timestamp | null;
};

