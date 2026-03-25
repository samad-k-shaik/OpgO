// Placeholder so Firebase Functions emulator has a valid exported function surface.
// Actual admin + token functions will be added in later to-dos.
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import type { Request, Response } from 'express';
import { adminAuth } from './lib/adminAuth.js';
import {
  createHospitalForAdmin,
  getAdminRecentSessions,
  getAdminSummaryForDate,
  listHospitalsForAdmin,
} from './lib/adminService.js';
import { initFirebaseAdmin } from './lib/firebaseAdmin.js';

export const health = onRequest((req, res) => {
  res.status(200).json({ ok: true });
});

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const s = value.trim();
  if (!s) return undefined;
  return s;
}

function parseDateParam(dateStr?: string): Date {
  if (!dateStr) return new Date();
  // Expected format: YYYY-MM-DD (same as existing Express admin route).
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid date format. Use YYYY-MM-DD.');
  }
  return parsed;
}

export const adminCreateHospital = onRequest(async (req: Request, res: Response) => {
  if (!(await adminAuth(req, res))) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const hospital = await createHospitalForAdmin(req.body);
    res.json({ hospital });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed to create hospital' });
  }
});

export const adminListHospitals = onRequest(async (req: Request, res: Response) => {
  if (!(await adminAuth(req, res))) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const hospitals = await listHospitalsForAdmin();
  res.json({ hospitals });
});

// Single endpoint so Hosting rewrites can map `/api/v1/admin/hospitals` for both GET and POST.
export const adminHospitals = onRequest(async (req: Request, res: Response) => {
  if (!(await adminAuth(req, res))) return;

  if (req.method === 'GET') {
    const hospitals = await listHospitalsForAdmin();
    res.json({ hospitals });
    return;
  }

  if (req.method === 'POST') {
    const hospital = await createHospitalForAdmin(req.body);
    res.json({ hospital });
    return;
  }

  res.status(405).json({ error: 'Method Not Allowed' });
});

export const adminGetSummaryForDate = onRequest(async (req: Request, res: Response) => {
  if (!(await adminAuth(req, res))) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const dateParam = parseOptionalString(req.query.date);
    const date = parseDateParam(dateParam);
    const summary = await getAdminSummaryForDate(date);
    res.json({ summary });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed to get summary' });
  }
});

export const adminGetSessions = onRequest(async (req: Request, res: Response) => {
  if (!(await adminAuth(req, res))) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const hospitalId = parseOptionalString(req.query.hospitalId);
  const sessions = await getAdminRecentSessions(hospitalId);
  res.json({ sessions });
});

export const hospitalLogin = onCall(async (request) => {
  const data = request.data ?? {};
  const accessToken = typeof data.accessToken === 'string' ? data.accessToken.trim() : '';
  const clientType =
    typeof data.clientType === 'string' && data.clientType.trim()
      ? data.clientType.trim()
      : 'unknown';
  const allowedClientTypes = ['reception', 'patient', 'display', 'admin', 'unknown'];
  if (!allowedClientTypes.includes(clientType)) {
    throw new HttpsError('invalid-argument', 'Invalid clientType');
  }
  const patientPhone = typeof data.patientPhone === 'string' ? data.patientPhone.trim() : undefined;

  if (!accessToken) throw new HttpsError('invalid-argument', 'Missing accessToken');

  const admin = initFirebaseAdmin();
  const db = admin.firestore();

  const hospitalSnap = await db.collection('hospitals').where('accessToken', '==', accessToken).limit(1).get();
  if (hospitalSnap.empty) throw new HttpsError('permission-denied', 'Invalid hospital access token');

  const hospitalDoc = hospitalSnap.docs[0];
  const hospitalId = hospitalDoc.id;

  // Stable-ish UID so the presence doc can update by `uid`.
  const uid = `h_${hospitalId}_${clientType}_${patientPhone ?? ''}`.slice(0, 128);
  const customToken = await admin.auth().createCustomToken(uid, {
    hospitalId,
    role: clientType,
    clientType,
  });

  return { customToken };
});

function requireAdminCall(request: { auth?: any }) {
  const token = request.auth?.token;
  const adminEmailFallback = (process.env.ADMIN_EMAIL_ALLOWLIST ?? 'samad.k.shaik@gmail.com').toLowerCase();
  const tokenEmail = (token?.email ?? '').toString().toLowerCase();

  // MVP/dev fallback: allow a known admin email even if `admin=true` custom claim isn't set.
  // For production, disable this fallback and rely only on `token.admin === true`.
  if (!token || (token.admin !== true && tokenEmail !== adminEmailFallback)) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }
}

export const adminListHospitalsCallable = onCall(async (request) => {
  requireAdminCall(request);
  const hospitals = await listHospitalsForAdmin();
  return { hospitals };
});

export const adminCreateHospitalCallable = onCall(async (request) => {
  requireAdminCall(request);
  const hospital = await createHospitalForAdmin(request.data);
  return { hospital };
});

export const adminGetSummaryForDateCallable = onCall(async (request) => {
  requireAdminCall(request);
  const data = request.data ?? {};
  const dateString = typeof data.date === 'string' ? data.date : undefined;
  const date = dateString ? new Date(dateString) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new HttpsError('invalid-argument', 'Invalid date format. Use YYYY-MM-DD.');
  }

  const summary = await getAdminSummaryForDate(date);
  return { summary };
});

export const adminGetSessionsCallable = onCall(async (request) => {
  requireAdminCall(request);
  const data = request.data ?? {};
  const hospitalId = typeof data.hospitalId === 'string' ? data.hospitalId : undefined;
  const sessions = await getAdminRecentSessions(hospitalId);
  return { sessions };
});

function requireHospitalCaller(request: { auth?: any }, allowedRoles: string[]) {
  const token = request.auth?.token;
  if (!token) throw new HttpsError('unauthenticated', 'Sign in required');
  const hospitalId = token.hospitalId;
  const role = token.role;

  if (!hospitalId || typeof hospitalId !== 'string') {
    throw new HttpsError('permission-denied', 'hospitalId claim missing');
  }
  if (!role || typeof role !== 'string' || !allowedRoles.includes(role)) {
    throw new HttpsError('permission-denied', 'Insufficient role');
  }
  return { hospitalId, role };
}

export const receptionCreateToken = onCall(async (request) => {
  const { hospitalId, role } = requireHospitalCaller(request, ['reception', 'unknown']);
  void role;

  const data = request.data ?? {};
  const doctorId =
    typeof data.doctorId === 'string' && data.doctorId.trim() ? data.doctorId.trim() : 'default';
  const patientPhone = typeof data.patientPhone === 'string' ? data.patientPhone.trim() : '';
  const bookingType = data.bookingType as 'REMOTE' | 'WALK_IN';

  if (!patientPhone) throw new HttpsError('invalid-argument', 'patientPhone is required');
  if (bookingType !== 'REMOTE' && bookingType !== 'WALK_IN') throw new HttpsError('invalid-argument', 'Invalid bookingType');

  const admin = initFirebaseAdmin();
  const db = admin.firestore();

  const maxSnap = await db
    .collection('tokens')
    .where('hospitalId', '==', hospitalId)
    .where('doctorId', '==', doctorId)
    .orderBy('tokenNumber', 'desc')
    .limit(1)
    .get();

  const nextTokenNumber = (() => {
    if (maxSnap.empty) return 1;
    const t = maxSnap.docs[0].data() as any;
    const n = typeof t.tokenNumber === 'number' ? t.tokenNumber : Number(t.tokenNumber ?? 0);
    return n + 1;
  })();

  const tokenRef = db.collection('tokens').doc();

  await tokenRef.set({
    hospitalId,
    doctorId,
    tokenNumber: nextTokenNumber,
    patientPhone,
    bookingType,
    premiumEnabled: false,
    premiumActivatedAt: null,
    lastPremiumReminderAt: null,
    status: 'WAITING',
    arrivalAt: null,
    consultationStartAt: null,
    consultationEndAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    token: {
      tokenId: tokenRef.id,
      tokenNumber: nextTokenNumber,
    },
  };
});

export const enablePremiumTrackingCallable = onCall(async (request) => {
  // Premium should be enabled by the patient identity (clientType=patient).
  const { hospitalId } = requireHospitalCaller(request, ['patient', 'unknown', 'reception', 'display']);
  const data = request.data ?? {};

  const tokenId = typeof data.tokenId === 'string' ? data.tokenId : '';
  const phone = typeof data.phone === 'string' ? data.phone.trim() : '';
  if (!tokenId) throw new HttpsError('invalid-argument', 'tokenId is required');
  if (!phone) throw new HttpsError('invalid-argument', 'phone is required');

  const admin = initFirebaseAdmin();
  const db = admin.firestore();

  const tokenRef = db.collection('tokens').doc(tokenId);
  const tokenSnap = await tokenRef.get();
  if (!tokenSnap.exists) throw new HttpsError('not-found', 'Token not found');

  const tokenData = tokenSnap.data() as any;
  if (tokenData.hospitalId !== hospitalId) throw new HttpsError('permission-denied', 'Wrong hospital');
  if (tokenData.patientPhone !== phone) throw new HttpsError('permission-denied', 'Phone does not match token');

  const premiumEnabled = tokenData.premiumEnabled === true;
  if (!premiumEnabled) {
    await db.collection('premiumPayments').doc().set({
      hospitalId,
      tokenId,
      phone,
      amountPaise: 2500,
      status: 'SUCCESS',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await tokenRef.set(
    {
      premiumEnabled: true,
      premiumActivatedAt: premiumEnabled ? tokenData.premiumActivatedAt ?? null : admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { ok: true };
});

export const getHospitalDoctors = onCall(async (request) => {
  const { hospitalId } = requireHospitalCaller(request, ['reception', 'display', 'admin', 'unknown']);

  const admin = initFirebaseAdmin();
  const db = admin.firestore();

  const snap = await db.collection('hospitals').doc(hospitalId).collection('doctors').orderBy('name').get();
  const doctors = snap.docs.map((d) => ({ id: d.id, name: d.data().name }));

  return { doctors };
});

export const getQueueView = onCall(async (request) => {
  const { hospitalId } = requireHospitalCaller(request, ['reception', 'display', 'admin', 'unknown']);
  const data = request.data ?? {};
  const limit = typeof data.limit === 'number' ? data.limit : 4;

  const admin = initFirebaseAdmin();
  const db = admin.firestore();

  // Get doctors
  const doctorsSnap = await db.collection('hospitals').doc(hospitalId).collection('doctors').orderBy('name').get();
  const doctors = doctorsSnap.docs.map((d) => ({ id: d.id, name: d.data().name }));

  // Get tokens for today
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const tokensSnap = await db
    .collection('tokens')
    .where('hospitalId', '==', hospitalId)
    .where('createdAt', '>=', start)
    .orderBy('createdAt', 'asc')
    .get();

  const tokens = tokensSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

  const doctorsView = doctors.map((doc) => {
    const docTokens = tokens.filter((t) => t.doctorId === doc.id);
    const serving = docTokens.find((t) => t.status === 'SERVING') ?? null;
    const next = docTokens
      .filter((t) => t.status === 'WAITING')
      .slice(0, limit)
      .map((t) => ({
        tokenId: t.id,
        tokenNumber: t.tokenNumber,
        patientPhone: t.patientPhone,
      }));

    return {
      doctorId: doc.id,
      doctorName: doc.name,
      serving: serving
        ? {
            tokenId: serving.id,
            tokenNumber: serving.tokenNumber,
            patientPhone: serving.patientPhone,
            status: serving.status,
          }
        : null,
      next,
    };
  });

  return { doctors: doctorsView };
});

export const updateTokenStatus = onCall(async (request) => {
  const { hospitalId } = requireHospitalCaller(request, ['reception', 'admin', 'unknown']);
  const data = request.data ?? {};
  const tokenId = typeof data.tokenId === 'string' ? data.tokenId : '';
  const action = typeof data.action === 'string' ? data.action : '';

  if (!tokenId || !action) throw new HttpsError('invalid-argument', 'tokenId and action are required');

  const admin = initFirebaseAdmin();
  const db = admin.firestore();

  const tokenRef = db.collection('tokens').doc(tokenId);
  const snap = await tokenRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Token not found');
  if (snap.data()?.hospitalId !== hospitalId) throw new HttpsError('permission-denied', 'Wrong hospital');

  const updates: any = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

  switch (action) {
    case 'start':
      updates.status = 'SERVING';
      updates.consultationStartAt = admin.firestore.FieldValue.serverTimestamp();
      break;
    case 'complete':
      updates.status = 'COMPLETED';
      updates.consultationEndAt = admin.firestore.FieldValue.serverTimestamp();
      break;
    case 'skip':
      updates.status = 'SKIPPED';
      break;
    case 'cancel':
      updates.status = 'CANCELLED';
      break;
    case 'arrived':
      updates.arrivalAt = admin.firestore.FieldValue.serverTimestamp();
      break;
    default:
      throw new HttpsError('invalid-argument', 'Invalid action');
  }

  await tokenRef.update(updates);
  return { ok: true };
});

export const getPatientTokenStatus = onCall(async (request) => {
  // Use 'unknown' or 'patient' role
  const { hospitalId } = requireHospitalCaller(request, ['patient', 'unknown', 'reception', 'display']);
  const data = request.data ?? {};
  const tokenId = typeof data.tokenId === 'string' ? data.tokenId : '';

  if (!tokenId) throw new HttpsError('invalid-argument', 'tokenId is required');

  const admin = initFirebaseAdmin();
  const db = admin.firestore();

  const tokenRef = db.collection('tokens').doc(tokenId);
  const snap = await tokenRef.get();

  if (!snap.exists || snap.data()?.hospitalId !== hospitalId) {
    return { found: false };
  }

  const token = snap.data() as any;

  // Calculate position in queue for the same doctor
  let positionInQueue: number | null = null;
  let tokensAhead = 0;

  if (token.status === 'WAITING') {
    const listSnap = await db
      .collection('tokens')
      .where('hospitalId', '==', hospitalId)
      .where('doctorId', '==', token.doctorId)
      .where('status', '==', 'WAITING')
      .where('createdAt', '<=', token.createdAt)
      .orderBy('createdAt', 'asc')
      .get();

    tokensAhead = listSnap.docs.findIndex((d) => d.id === tokenId);
    positionInQueue = tokensAhead + 1;
  }

  return {
    found: true,
    tokenId: snap.id,
    tokenNumber: token.tokenNumber,
    state: token.status,
    premiumEnabled: token.premiumEnabled,
    positionInQueue,
    tokensAhead,
  };
});

