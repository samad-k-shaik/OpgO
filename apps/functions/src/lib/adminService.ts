import crypto from 'crypto';
import { initFirebaseAdmin, admin } from './firebaseAdmin.js';

export type AdminHospitalSummary = {
  hospitalId: string;
  hospitalName: string;
  tokensRemoteToday: number;
  tokensWalkInToday: number;
  premiumRevenueTodayPaise: number;
  premiumPaymentsTodayCount: number;
  activeClientsNow: number;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDayExclusive(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return new Date(x.getTime() + 1);
}

function toISODateOrNull(ts: admin.firestore.Timestamp | Date | null | undefined): string | null {
  if (!ts) return null;
  // Firestore Timestamp
  if (typeof (ts as any).toDate === 'function') return (ts as admin.firestore.Timestamp).toDate().toISOString();
  if (ts instanceof Date) return ts.toISOString();
  return null;
}

export async function listHospitalsForAdmin() {
  const db = initFirebaseAdmin().firestore();
  const snap = await db.collection('hospitals').orderBy('createdAt', 'desc').get();
  return snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      name: data.name as string,
      createdAt: data.createdAt ? toISODateOrNull(data.createdAt) ?? undefined : undefined,
    };
  });
}

export async function createHospitalForAdmin(input: unknown) {
  // Keep schema validation lightweight: MVP endpoint.
  const parsed = input as { name?: unknown; doctors?: unknown };
  if (typeof parsed.name !== 'string' || parsed.name.trim().length < 2) {
    throw new Error('Hospital name is required');
  }

  const hospitalName = parsed.name.trim();
  const doctors =
    Array.isArray(parsed.doctors) && parsed.doctors.every((x) => typeof x === 'string')
      ? (parsed.doctors as string[]).map((s) => s.trim()).filter(Boolean)
      : [];

  // Token needs to be deterministic-ish but secure enough for MVP local usage.
  const accessToken = crypto.randomBytes(16).toString('hex');

  const db = initFirebaseAdmin().firestore();
  const hospitalRef = db.collection('hospitals').doc();

  await hospitalRef.set({
    name: hospitalName,
    accessToken,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Create doctors as a subcollection (doesn't affect current admin dashboard UI).
  const doctorsCol = hospitalRef.collection('doctors');
  const batch = db.batch();
  for (const docName of doctors.slice(0, 20)) {
    const docRef = doctorsCol.doc();
    batch.set(docRef, { name: docName, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  }
  await batch.commit();

  // Re-read createdAt to return a stable value.
  const created = await hospitalRef.get();
  const data = created.data() as any;

  return {
    id: created.id,
    name: data.name as string,
    accessToken,
    createdAt: data.createdAt ? toISODateOrNull(data.createdAt) ?? undefined : undefined,
  };
}

export async function getAdminSummaryForDate(date: Date) {
  const db = initFirebaseAdmin().firestore();

  const start = startOfDay(date);
  const end = endOfDayExclusive(date);

  const hospitalsSnap = await db.collection('hospitals').get();
  const hospitals = hospitalsSnap.docs.map((d) => {
    const data = d.data() as any;
    return { id: d.id, name: data.name as string };
  });

  // Tokens by hospitalId + bookingType
  const tokensSnap = await db
    .collection('tokens')
    .where('createdAt', '>=', start)
    .where('createdAt', '<', end)
    .get();

  const tokenCountByHospital = new Map<string, { remote: number; walkin: number }>();
  for (const t of tokensSnap.docs) {
    const data = t.data() as any;
    const hospitalId = data.hospitalId as string;
    const bookingType = data.bookingType as string;
    const prev = tokenCountByHospital.get(hospitalId) ?? { remote: 0, walkin: 0 };

    if (bookingType === 'REMOTE') prev.remote += 1;
    if (bookingType === 'WALK_IN') prev.walkin += 1;
    tokenCountByHospital.set(hospitalId, prev);
  }

  // Premium payments by hospitalId
  const paymentsSnap = await db
    .collection('premiumPayments')
    .where('createdAt', '>=', start)
    .where('createdAt', '<', end)
    .get();

  const paymentByHospital = new Map<string, { sum: number; count: number }>();
  for (const p of paymentsSnap.docs) {
    const data = p.data() as any;
    if (data.status !== 'SUCCESS') continue;

    const hospitalId = data.hospitalId as string;
    const amountPaise = typeof data.amountPaise === 'number' ? data.amountPaise : Number(data.amountPaise ?? 0);
    const prev = paymentByHospital.get(hospitalId) ?? { sum: 0, count: 0 };
    prev.sum += amountPaise;
    prev.count += 1;
    paymentByHospital.set(hospitalId, prev);
  }

  const activeSince = new Date(Date.now() - 10 * 60 * 1000);
  const sessionsSnap = await db.collection('hospitalSessions').where('lastSeenAt', '>=', activeSince).get();

  const sessionsCountByHospital = new Map<string, number>();
  for (const s of sessionsSnap.docs) {
    const data = s.data() as any;
    const hospitalId = data.hospitalId as string;
    sessionsCountByHospital.set(hospitalId, (sessionsCountByHospital.get(hospitalId) ?? 0) + 1);
  }

  const result: AdminHospitalSummary[] = hospitals.map((h) => {
    const tokenCounts = tokenCountByHospital.get(h.id) ?? { remote: 0, walkin: 0 };
    const p = paymentByHospital.get(h.id) ?? { sum: 0, count: 0 };
    return {
      hospitalId: h.id,
      hospitalName: h.name,
      tokensRemoteToday: tokenCounts.remote,
      tokensWalkInToday: tokenCounts.walkin,
      premiumRevenueTodayPaise: p.sum,
      premiumPaymentsTodayCount: p.count,
      activeClientsNow: sessionsCountByHospital.get(h.id) ?? 0,
    };
  });

  return result;
}

export type Session = {
  hospitalId: string;
  socketId: string;
  clientType: string;
  patientPhone: string | null;
  connectedAt: string;
  lastSeenAt: string;
  disconnectedAt: string | null;
};

export async function getAdminRecentSessions(hospitalId?: string) {
  const db = initFirebaseAdmin().firestore();
  const activeSince = new Date(Date.now() - 10 * 60 * 1000);

  let q = db
    .collection('hospitalSessions')
    .where('lastSeenAt', '>=', activeSince)
    .orderBy('lastSeenAt', 'desc')
    .limit(50);

  if (hospitalId) {
    q = db
      .collection('hospitalSessions')
      .where('hospitalId', '==', hospitalId)
      .where('lastSeenAt', '>=', activeSince)
      .orderBy('lastSeenAt', 'desc')
      .limit(50);
  }

  const snap = await q.get();
  return snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      hospitalId: data.hospitalId as string,
      socketId: (data.socketId as string) ?? d.id,
      clientType: (data.clientType as string) ?? 'unknown',
      patientPhone: (data.patientPhone as string | undefined) ?? null,
      connectedAt: toISODateOrNull(data.connectedAt) ?? new Date().toISOString(),
      lastSeenAt: toISODateOrNull(data.lastSeenAt) ?? new Date().toISOString(),
      disconnectedAt: toISODateOrNull(data.disconnectedAt),
    };
  });
}

