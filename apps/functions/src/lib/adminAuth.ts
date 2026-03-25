import type { Request, Response } from 'express';
import { initFirebaseAdmin } from './firebaseAdmin.js';

const admin = initFirebaseAdmin();

function setCors(res: Response) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-access-token,Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

export async function adminAuth(req: Request, res: Response): Promise<boolean> {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return false;
  }

  const authHeader = (req.header('Authorization') ?? req.header('authorization') ?? '').toString();
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const idToken = match?.[1];

  if (!idToken) {
    res.status(401).json({ error: 'Missing Bearer token' });
    return false;
  }

  let decoded: any;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch {
    res.status(401).json({ error: 'Invalid Firebase ID token' });
    return false;
  }

  const adminEmailFallback = (process.env.ADMIN_EMAIL_ALLOWLIST ?? 'samad.k.shaik@gmail.com').toLowerCase();
  const decodedEmail = (decoded?.email ?? '').toString().toLowerCase();

  // MVP/dev fallback: allow a known admin email even if custom claim isn't set yet.
  // For production, disable this fallback and rely only on `decoded.admin === true`.
  if (decoded?.admin !== true && decodedEmail !== adminEmailFallback) {
    res.status(403).json({ error: 'Admin access required' });
    return false;
  }

  return true;
}

