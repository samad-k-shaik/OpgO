import React from 'react';
import { auth } from '../lib/firebase';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
} from 'firebase/auth';
import {
  collection,
  doc,
  deleteDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  Timestamp,
} from 'firebase/firestore';
import { firestore } from '../lib/firebase';

type Hospital = { id: string; name: string; accessToken: string; createdAt?: string };

type AdminSummaryRow = {
  hospitalId: string;
  hospitalName: string;
  tokensRemoteToday: number;
  tokensWalkInToday: number;
  premiumRevenueTodayPaise: number;
  premiumPaymentsTodayCount: number;
  activeClientsNow: number;
};

type Session = {
  hospitalId: string;
  socketId: string;
  clientType: string;
  patientPhone: string | null;
  receptionistName?: string | null;
  receptionistPhone?: string | null;
  doctorName?: string | null;
  connectedAt: string;
  lastSeenAt: string;
  disconnectedAt: string | null;
};

export default function AdminPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [createdHospitalAccessToken, setCreatedHospitalAccessToken] = React.useState<string | null>(null);

  const [adminUser, setAdminUser] = React.useState(() => auth.currentUser);
  const [checkingAdmin, setCheckingAdmin] = React.useState(true);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const provider = React.useMemo(() => new GoogleAuthProvider(), []);

  const [hospitals, setHospitals] = React.useState<Hospital[]>([]);
  const [summary, setSummary] = React.useState<AdminSummaryRow[]>([]);

  const [selectedHospitalId, setSelectedHospitalId] = React.useState<string | null>(null);
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [hospitalDoctors, setHospitalDoctors] = React.useState<any[]>([]);
  const [hospitalTokens, setHospitalTokens] = React.useState<any[]>([]);
  const [loadingDoctors, setLoadingDoctors] = React.useState(false);
  const [loadingTokens, setLoadingTokens] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const [addHospitalName, setAddHospitalName] = React.useState('');
  const [addHospitalDoctors, setAddHospitalDoctors] = React.useState('General Physician (General), Dental Clinic (Dentist)');
  const [creating, setCreating] = React.useState(false);

  const todayString = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const refresh = React.useCallback(async () => {
    try {
      setError(null);
      const hSnap = await getDocs(query(collection(firestore, 'hospitals'), orderBy('createdAt', 'desc')));
      const hList = hSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        accessToken: d.data().accessToken,
        createdAt: (d.data().createdAt as Timestamp | undefined)?.toDate().toISOString(),
      })) as (Hospital & { accessToken: string })[];
      setHospitals(hList);

      const start = new Date(todayString);
      start.setHours(0, 0, 0, 0);
      const end = new Date(todayString);
      end.setHours(23, 59, 59, 999);

      const tSnap = await getDocs(collection(firestore, 'tokens'));

      const hospitalMap = new Map<string, AdminSummaryRow>();
      hList.forEach((h) => {
        hospitalMap.set(h.id, {
          hospitalId: h.id,
          hospitalName: h.name,
          tokensRemoteToday: 0,
          tokensWalkInToday: 0,
          premiumRevenueTodayPaise: 0,
          premiumPaymentsTodayCount: 0,
          activeClientsNow: 0,
        });
      });

      tSnap.docs.forEach((d) => {
        const data = d.data();
        const row = hospitalMap.get(data.hospitalId);
        const createdAt = (data.createdAt as Timestamp)?.toDate();
        if (row && createdAt && createdAt >= start && createdAt <= end) {
          if (data.bookingType === 'REMOTE') row.tokensRemoteToday++;
          else row.tokensWalkInToday++;
        }
      });

      setSummary(Array.from(hospitalMap.values()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load admin data');
    }
  }, [todayString]);

  const refreshSessions = React.useCallback(async (hospitalId: string) => {
    try {
      setError(null);
      const activeSince = new Date(Date.now() - 10 * 60 * 1000);
      const sSnap = await getDocs(
        query(
          collection(firestore, 'hospitalSessions'),
          where('hospitalId', '==', hospitalId)
        )
      );
      const allSessions = sSnap.docs.map((d) => {
        const data = d.data();
        return {
          hospitalId: data.hospitalId,
          socketId: data.socketId ?? d.id,
          clientType: data.clientType,
          patientPhone: data.patientPhone,
          receptionistName: data.receptionistName,
          receptionistPhone: data.receptionistPhone,
          doctorName: data.doctorName,
          connectedAt: (data.connectedAt as Timestamp)?.toDate().toISOString(),
          lastSeenAt: (data.lastSeenAt as Timestamp)?.toDate().toISOString(),
          disconnectedAt: (data.disconnectedAt as Timestamp | undefined)?.toDate().toISOString() ?? null,
        };
      });

      const activeSessions = allSessions
        .filter(s => new Date(s.lastSeenAt).getTime() >= activeSince.getTime())
        .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());

      setSessions(activeSessions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sessions');
    }
  }, []);

  const refreshHospitalData = React.useCallback(async (hospitalId: string) => {
    try {
      setLoadingDoctors(true);
      setLoadingTokens(true);
      
      const dSnap = await getDocs(collection(firestore, 'hospitals', hospitalId, 'doctors'));
      setHospitalDoctors(dSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const tSnap = await getDocs(query(collection(firestore, 'tokens'), where('hospitalId', '==', hospitalId)));
      const start = new Date(todayString).getTime();
      const end = start + 24 * 60 * 60 * 1000;
      
      const tList = tSnap.docs.map(d => {
        const data = d.data();
        return { id: d.id, ...data, createdAt: (data.createdAt as Timestamp)?.toDate() };
      }).filter(t => t.createdAt.getTime() >= start && t.createdAt.getTime() < end)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      
      setHospitalTokens(tList);
    } catch (e) {
      console.error('Error fetching hospital detail data:', e);
    } finally {
      setLoadingDoctors(false);
      setLoadingTokens(false);
    }
  }, [todayString]);

  React.useEffect(() => {
    if (selectedHospitalId) {
      void refreshHospitalData(selectedHospitalId);
      void refreshSessions(selectedHospitalId);
    } else {
      setHospitalDoctors([]);
      setHospitalTokens([]);
      setSessions([]);
    }
  }, [selectedHospitalId, refreshHospitalData, refreshSessions]);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setAdminUser(u);
      if (!u) {
        setIsAdmin(false);
        setCheckingAdmin(false);
        return;
      }
      setIsAdmin(true);
      setCheckingAdmin(false);
    });
    return () => unsub();
  }, []);

  React.useEffect(() => {
    if (!isAdmin) return;
    void refresh();
  }, [refresh, isAdmin]);

  const onSignIn = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    }
  };

  const onAddHospital = async () => {
    if (!addHospitalName.trim() || creating) return;
    try {
      setCreating(true);
      setError(null);
      const doctorsRaw = addHospitalDoctors.split(',').map((x) => x.trim()).filter(Boolean);
      const slug = addHospitalName.trim().toLowerCase().replace(/[^a-z0-h0-9]/g, '-').slice(0, 30);
      const randomPart = Math.random().toString(36).substring(2, 6);
      const friendlyId = `${slug}-${randomPart}`;
      
      const hRef = doc(firestore, 'hospitals', friendlyId);
      const accessToken = Math.random().toString(36).substring(2, 15);

      await setDoc(hRef, {
        name: addHospitalName,
        accessToken,
        consultationFee: 300,
        urgentFee: 500,
        emergencyFee: 1000,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (const raw of doctorsRaw) {
        let name = raw;
        let specialty = '';
        if (raw.includes('(') && raw.includes(')')) {
          const match = raw.match(/(.*)\((.*)\)/);
          if (match) {
            name = match[1].trim();
            specialty = match[2].trim();
          }
        }
        await setDoc(doc(collection(hRef, 'doctors')), {
          name,
          specialty,
          status: 'AVAILABLE',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setAddHospitalName('');
      await refresh();
      alert(`Hospital created: ${addHospitalName}. Access Token: ${accessToken}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create hospital');
    } finally {
      setCreating(false);
    }
  };

  const onDeleteHospital = async (hospitalId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      setError(null);
      await deleteDoc(doc(firestore, 'hospitals', hospitalId));
      await refresh();
      if (selectedHospitalId === hospitalId) setSelectedHospitalId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete hospital');
    }
  };

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: '#111827' }}>OP go Admin Dashboard <span style={{fontSize: 10, color: '#9ca3af'}}>v2.6.5 Build 999</span></h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {adminUser ? (
            <>
              <span style={{ color: '#6b7280', fontSize: 12 }}>{adminUser.email}</span>
              <button style={ghostButton} onClick={() => void signOut(auth)}>Sign out</button>
              <button style={primaryButton} onClick={() => void refresh()} disabled={checkingAdmin || !isAdmin}>Refresh</button>
            </>
          ) : (
            <button style={primaryButton} onClick={() => void onSignIn()} disabled={checkingAdmin}>
              {checkingAdmin ? 'Checking...' : 'Sign in with Google'}
            </button>
          )}
        </div>
      </header>

      {error ? <div style={{ color: '#b91c1c', marginBottom: 12, padding: 12, background: '#fef2f2', borderRadius: 8 }}>{error}</div> : null}
      
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 14, alignItems: 'start' }}>
        <div style={card}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>Today Analytics ({todayString})</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Hospital</th>
                  <th style={th}>Access Token</th>
                  <th style={th}>Tokens</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(summary ?? []).map((row) => (
                  <tr key={row.hospitalId}>
                    <td style={td}>{row.hospitalName}</td>
                    <td style={td}>
                      <code style={{ fontSize: 11, background: '#f3f4f6', padding: '2px 4px', borderRadius: 4 }}>
                        {hospitals.find(h => h.id === row.hospitalId)?.accessToken}
                      </code>
                    </td>
                    <td style={td}>{row.tokensRemoteToday + row.tokensWalkInToday}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button 
                          style={{ ...smallButton, fontWeight: row.hospitalId === selectedHospitalId ? 800 : 400, borderColor: row.hospitalId === selectedHospitalId ? '#111827' : '#e5e7eb' }} 
                          onClick={() => setSelectedHospitalId(row.hospitalId)}
                        >
                          {row.hospitalId === selectedHospitalId ? 'Viewing' : 'Manage'}
                        </button>
                        <button style={{ ...smallButton, color: '#b91c1c' }} onClick={() => void onDeleteHospital(row.hospitalId, row.hospitalName)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!summary.length && <tr><td colSpan={4} style={{ ...td, textAlign: 'center', padding: '30px 0', color: '#9ca3af' }}>No hospitals found. Get started by adding one!</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>Add Hospital</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Clinic Name</label>
              <input value={addHospitalName} onChange={(e) => setAddHospitalName(e.target.value)} placeholder="e.g. City Care Center" style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Doctor Assignments (Name (Specialty))</label>
              <input value={addHospitalDoctors} onChange={(e) => setAddHospitalDoctors(e.target.value)} placeholder="Dr. Smith (GP), Dr. Jones (Dental)" style={{ ...inputStyle, width: '100%' }} />
            </div>
            <button style={primaryButton} onClick={() => void onAddHospital()} disabled={addHospitalName.trim().length < 2 || !isAdmin || creating}>
              {creating ? 'Creating...' : 'Create Hospital'}
            </button>
          </div>
        </div>
      </div>

      {selectedHospitalId && (
        <div style={{ marginTop: 24, padding: 20, border: '1px solid #e5e7eb', borderRadius: 16, background: '#fcfcfc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: 20 }}>🏥 {hospitals.find(h => h.id === selectedHospitalId)?.name} Command Center</h3>
            <button style={ghostButton} onClick={() => setSelectedHospitalId(null)}>Close Panel</button>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 1.5fr', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Credentials Card */}
              <div style={card}>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>📋 Clinic Credentials</div>
                <div style={{ padding: 12, borderRadius: 12, background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>Access Token (for Reception/Doctor)</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, margin: '8px 0', color: '#111827' }}>
                    {hospitals.find(h => h.id === selectedHospitalId)?.accessToken}
                  </div>
                  <button 
                    onClick={() => {
                      const t = hospitals.find(h => h.id === selectedHospitalId)?.accessToken;
                      if (t) {
                        navigator.clipboard.writeText(t);
                        setCopiedId(selectedHospitalId);
                        setTimeout(() => setCopiedId(null), 2000);
                      }
                    }}
                    style={{ fontSize: 12, color: '#3b82f6', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 600 }}
                  >
                    {copiedId === selectedHospitalId ? '✅ Copied to clipboard!' : 'Copy to clipboard'}
                  </button>
                </div>
              </div>

              {/* Doctors Card */}
              <div style={card}>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>🩺 Assigned Doctors</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {loadingDoctors ? (
                    <div style={{ color: '#6b7280', fontSize: 13 }}>Loading...</div>
                  ) : hospitalDoctors.length > 0 ? (
                    hospitalDoctors.map(d => (
                      <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f9fafb', borderRadius: 10, border: '1px solid #f3f4f6' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>{d.specialty || 'General'}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: d.status === 'AVAILABLE' ? '#10b981' : '#f59e0b', background: '#fff', padding: '2px 6px', borderRadius: 4, border: '1px solid #f3f4f6' }}>
                            {d.status || 'AVAILABLE'}
                          </div>
                          {d.statusMessage && <div style={{ fontSize: 10, color: '#ef4444', marginTop: 2 }}>{d.statusMessage}</div>}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: '#6b7280', fontSize: 13 }}>No doctors assigned.</div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Active Sessions Card */}
              <div style={card}>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>🌐 Live Monitoring / Active Devices</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={th}>Role</th>
                        <th style={th}>Identity</th>
                        <th style={th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s) => (
                        <tr key={s.socketId}>
                          <td style={{ ...td, fontSize: 11, textTransform: 'uppercase' }}>{s.clientType}</td>
                          <td style={td}>
                            {s.clientType === 'reception' ? (
                              <div style={{ fontWeight: 600 }}>{s.receptionistName || 'Front Desk'}</div>
                            ) : s.clientType === 'doctor' ? (
                              <div style={{ fontWeight: 600 }}>Dr. {s.doctorName}</div>
                            ) : (
                              <div style={{ fontSize: 12 }}>Patient ({s.patientPhone?.slice(-4) || 'Anon'})</div>
                            )}
                          </td>
                          <td style={td}>
                            <div style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>● Online</div>
                            <div style={{ fontSize: 10, color: '#9ca3af' }}>Since {new Date(s.connectedAt).toLocaleTimeString()}</div>
                          </td>
                        </tr>
                      ))}
                      {!sessions.length && <tr><td colSpan={3} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: '20px 0' }}>No active devices right now.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Tokens Card */}
              <div style={card}>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>🎟️ Recent Tokens (Today)</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={th}>Token</th>
                        <th style={th}>Patient</th>
                        <th style={th}>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingTokens ? (
                        <tr><td colSpan={3} style={{ ...td, textAlign: 'center' }}>Loading tokens...</td></tr>
                      ) : hospitalTokens.map((t) => (
                        <tr key={t.id}>
                          <td style={{ ...td, fontWeight: 700 }}>#{t.tokenNumber}</td>
                          <td style={td}>{t.patientPhone || 'Anonymous'}</td>
                          <td style={td}>
                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, fontWeight: 700, background: t.bookingType === 'REMOTE' ? '#dbeafe' : '#fef3c7', color: t.bookingType === 'REMOTE' ? '#1e40af' : '#92400e' }}>
                              {t.bookingType}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {!loadingTokens && !hospitalTokens.length && <tr><td colSpan={3} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: '20px 0' }}>No tokens generated today yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  padding: 14,
  background: '#fff',
};

const inputStyle: React.CSSProperties = {
  padding: 10,
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  minWidth: 260,
};

const primaryButton: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid #111827',
  background: '#111827',
  color: '#fff',
  cursor: 'pointer',
};

const ghostButton: React.CSSProperties = {
  padding: '9px 12px',
  borderRadius: 10,
  border: '1px solid #e5e7eb',
  background: '#fff',
  color: '#111827',
  cursor: 'pointer',
};

const smallButton: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 10,
  border: '1px solid #e5e7eb',
  background: '#fff',
  fontSize: 12,
  cursor: 'pointer',
};

const th: React.CSSProperties = {
  textAlign: 'left',
  borderBottom: '1px solid #e5e7eb',
  padding: '10px 8px',
  color: '#374151',
  fontSize: 12,
};

const td: React.CSSProperties = {
  borderBottom: '1px solid #f3f4f6',
  padding: '10px 8px',
  fontSize: 13,
};
