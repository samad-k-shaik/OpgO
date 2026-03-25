import React from 'react';
import { useHospitalPresence } from '../lib/hospitalPresence';
import {
  collection, doc, getDocs, onSnapshot, query, where,
  Timestamp, addDoc, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { firestore } from '../lib/firebase';
import { getHospitalAccessToken, getReceptionistName, setReceptionistName, setReceptionistPhone } from '../lib/storage';
import PatientHistory from '../components/PatientHistory';

type Token = { id: string; tokenNumber: number; patientPhone: string; status: 'WAITING' | 'CONSULTING' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED' | 'ARRIVED'; doctorId: string; priority?: 'NORMAL' | 'EMERGENCY'; session?: string; bookingType?: string };
type Doctor = { id: string; name: string; specialty?: string; status?: string; statusMessage?: string; morningSlots?: number; eveningSlots?: number };
type HospitalData = { id: string; name: string; consultationFee?: number; emergencyFee?: number };

function curSession(): 'morning' | 'evening' { return new Date().getHours() < 14 ? 'morning' : 'evening'; }

export default function ReceptionPage() {
  useHospitalPresence('reception');
  const [hospital, setHospital] = React.useState<HospitalData | null>(null);
  const [doctors, setDoctors] = React.useState<Doctor[]>([]);
  const [tokens, setTokens] = React.useState<Token[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [phone, setPhone] = React.useState('');
  const [selDoc, setSelDoc] = React.useState('');
  const [selPri, setSelPri] = React.useState<'NORMAL' | 'EMERGENCY'>('NORMAL');
  const [showAdd, setShowAdd] = React.useState(false);

  React.useEffect(() => {
    const t = getHospitalAccessToken();
    if (!t) { setError('Please sign in first.'); setLoading(false); return; }
    (async () => { try { const s = await getDocs(query(collection(firestore, 'hospitals'), where('accessToken', '==', t))); if (s.empty) { setError('Invalid token.'); return; } const d = s.docs[0].data(); setHospital({ id: s.docs[0].id, name: d.name, consultationFee: d.consultationFee || 300, emergencyFee: d.emergencyFee || 1000 }); } catch { setError('Connection failed.'); } })();
  }, []);

  React.useEffect(() => {
    if (!hospital?.id) return;
    const u1 = onSnapshot(collection(firestore, 'hospitals', hospital.id, 'doctors'), (snap) => {
      const dl = snap.docs.map(d => ({ id: d.id, ...d.data() } as Doctor));
      setDoctors(dl); if (dl.length > 0 && !selDoc) setSelDoc(dl[0].id);
    });
    const u2 = onSnapshot(query(collection(firestore, 'tokens'), where('hospitalId', '==', hospital.id)), (snap) => {
      const ts = new Date(); ts.setHours(0, 0, 0, 0);
      setTokens(snap.docs.map(d => ({ id: d.id, ...d.data() } as Token & { createdAt?: Timestamp })).filter(t => { const c = (t as any).createdAt as Timestamp | undefined; return c && c.toDate() >= ts; })); setLoading(false);
    }, () => setLoading(false));
    return () => { u1(); u2(); };
  }, [hospital?.id]);

  const cs = curSession();

  const addToken = async () => {
    if (!phone.trim() || !selDoc || !hospital) return;
    const doc2 = doctors.find(d => d.id === selDoc);
    const dT = tokens.filter(t => t.doctorId === selDoc);
    const sT = dT.filter(t => (t.session || 'morning') === cs);
    const limit = cs === 'morning' ? (doc2?.morningSlots || 15) : (doc2?.eveningSlots || 15);
    if (selPri !== 'EMERGENCY' && sT.length >= limit) { alert(`Slots full for Dr. ${doc2?.name}. Only Emergency tokens allowed.`); return; }
    try {
      const mx = dT.length > 0 ? Math.max(...dT.map(t => t.tokenNumber)) : 0;
      await addDoc(collection(firestore, 'tokens'), { hospitalId: hospital.id, doctorId: selDoc, patientPhone: phone.trim(), tokenNumber: mx + 1, status: 'WAITING', priority: selPri, session: cs, bookingType: 'WALK_IN', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      setPhone(''); setSelPri('NORMAL'); setShowAdd(false);
    } catch { alert('Failed to add token'); }
  };

  const setTokSt = async (id: string, st: Token['status']) => { await updateDoc(doc(firestore, 'tokens', id), { status: st, updatedAt: serverTimestamp() }).catch(() => alert('Failed')); };
  
  const sortQ = (l: Token[]) => [...l].sort((a, b) => { if (a.priority === 'EMERGENCY' && b.priority !== 'EMERGENCY') return -1; if (b.priority === 'EMERGENCY' && a.priority !== 'EMERGENCY') return 1; return a.tokenNumber - b.tokenNumber; });

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: 14, color: '#6b7280' }}>Connecting to clinic...</div>;
  if (error) return <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: 20, textAlign: 'center', gap: 12 }}><p style={{ color: '#b91c1c' }}>{error}</p><button onClick={() => window.location.reload()} style={primaryBtn}>Retry</button></div>;

  const alertDocs = doctors.filter(d => d.statusMessage && d.status !== 'AVAILABLE');

  return (
    <div style={{ padding: 16, maxWidth: 800, margin: '0 auto' }}>
      {/* Header — Admin Theme */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, color: '#111827' }}>{hospital?.name} <span style={{ fontSize: 10, color: '#9ca3af' }}>Reception</span></h2>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{getReceptionistName()} • {cs === 'morning' ? '🌅 Morning' : '🌙 Evening'}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={primaryBtn} onClick={() => setShowAdd(true)}>+ New Token</button>
          <button style={ghostBtn} onClick={() => { setReceptionistName(''); setReceptionistPhone(''); window.location.reload(); }}>Sign out</button>
        </div>
      </header>

      {/* Doctor Alerts — Clean Banners */}
      {alertDocs.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {alertDocs.map(d => (
            <div key={d.id} style={{ padding: '10px 14px', background: d.status === 'DELAYED' ? '#fef2f2' : '#eff6ff', border: `1px solid ${d.status === 'DELAYED' ? '#fecaca' : '#bfdbfe'}`, borderRadius: 10, marginBottom: 8, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16 }}>{d.status === 'DELAYED' ? '⛔' : '🔵'}</span>
              <span style={{ fontWeight: 700 }}>Dr. {d.name}:</span> {d.statusMessage}
            </div>
          ))}
        </div>
      )}

      {/* Main Grid — Doctors List */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        {doctors.map(doctor => {
          const dT = tokens.filter(t => t.doctorId === doctor.id);
          const serving = dT.find(t => t.status === 'CONSULTING');
          const waiting = sortQ(dT.filter(t => t.status === 'WAITING' || t.status === 'ARRIVED'));
          const mS = doctor.morningSlots || 15, eS = doctor.eveningSlots || 15;
          const mB = dT.filter(t => (t.session || 'morning') === 'morning').length;
          const eB = dT.filter(t => t.session === 'evening').length;

          return (
            <div key={doctor.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18, color: '#111827' }}>Dr. {doctor.name}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{doctor.specialty || 'General Physician'} • <span style={{ color: stClr(doctor.status), fontWeight: 700 }}>{doctor.status || 'AVAILABLE'}</span></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Waiting</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#111827' }}>{waiting.length}</div>
                </div>
              </div>

              {/* Slots Info Table */}
              <div style={{ marginBottom: 16, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Session</th><th style={th}>Booked</th><th style={th}>Limit</th><th style={th}>Availability</th></tr></thead>
                  <tbody>
                    <tr style={{ background: cs === 'morning' ? '#f9fafb' : 'transparent' }}>
                      <td style={td}>🌅 Morning</td><td style={td}>{mB}</td><td style={td}>{mS}</td>
                      <td style={td}>{mB >= mS ? <span style={{ color: '#b91c1c', fontWeight: 700, fontSize: 11 }}>🔒 FULL</span> : <span style={{ color: '#059669', fontSize: 11 }}>{mS - mB} Free</span>}</td>
                    </tr>
                    <tr style={{ background: cs === 'evening' ? '#f9fafb' : 'transparent' }}>
                      <td style={td}>🌙 Evening</td><td style={td}>{eB}</td><td style={td}>{eS}</td>
                      <td style={td}>{eB >= eS ? <span style={{ color: '#b91c1c', fontWeight: 700, fontSize: 11 }}>🔒 FULL</span> : <span style={{ color: '#059669', fontSize: 11 }}>{eS - eB} Free</span>}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Now Serving Highlight */}
              <div style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f9fafb', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', fontWeight: 800 }}>Currently Consulting</div>
                    {serving ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <span style={{ fontSize: 32, fontWeight: 900, color: '#111827' }}>#{serving.tokenNumber}</span>
                        {serving.priority === 'EMERGENCY' && <span style={emergTag}> EMERGENCY</span>}
                        <span style={{ fontSize: 14, color: '#374151' }}>{serving.patientPhone}</span>
                      </div>
                    ) : <div style={{ fontSize: 14, color: '#9ca3af', marginTop: 4 }}>Waiting for next patient</div>}
                  </div>
                  {serving && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={smallBtn} onClick={() => void setTokSt(serving.id, 'COMPLETED')}>✅ Done</button>
                      <button style={smallBtn} onClick={() => void setTokSt(serving.id, 'SKIPPED')}>⏭ Skip</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Waiting Tokens Table */}
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, color: '#374151' }}>Queue List</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Token</th><th style={th}>Patient</th><th style={th}>Type</th><th style={th}>Priority</th><th style={th}>Action</th></tr></thead>
                <tbody>
                  {waiting.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: 20 }}>No patients waiting in queue.</td></tr>}
                  {waiting.map(t => (
                    <tr key={t.id}>
                      <td style={{ ...td, fontWeight: 800 }}>#{t.tokenNumber}</td>
                      <td style={td}>{t.patientPhone} {t.status === 'ARRIVED' && <span style={{ color: '#059669', fontSize: 10, fontWeight: 800 }}>[ARRIVED]</span>}</td>
                      <td style={{ ...td, fontSize: 11, color: '#6b7280' }}>{(t.session || 'morning') === 'morning' ? '🌅' : '🌙'} • {t.bookingType === 'REMOTE' ? 'Online' : 'Walk-in'}</td>
                      <td style={td}>{t.priority === 'EMERGENCY' ? <span style={emergTag}>EMERGENCY</span> : 'Normal'}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button style={smallBtn} onClick={() => void setTokSt(t.id, 'ARRIVED')} disabled={t.status === 'ARRIVED'}>Check-in</button>
                          <button style={{ ...smallBtn, color: '#b91c1c' }} onClick={() => void setTokSt(t.id, 'CANCELLED')}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {/* Add Token Bottom Sheet Modal — Admin Theme */}
      {showAdd && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', zIndex: 1000 }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 500, padding: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20, boxShadow: '0 -4px 20px rgba(0,0,0,0.1)' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e5e7eb', margin: '0 auto 16px' }} />
            <h3 style={{ margin: '0 0 20px', fontSize: 18, color: '#111827' }}>Add New Patient</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={lbl}>Patient Phone Number</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 9876543210" style={inputSt} />
                {hospital && <PatientHistory hospitalId={hospital.id} phone={phone} doctors={doctors.map(d => ({ id: d.id, name: d.name }))} />}
              </div>

              <div>
                <label style={lbl}>Assigned Doctor</label>
                <select value={selDoc} onChange={(e) => setSelDoc(e.target.value)} style={inputSt}>
                  {doctors.map(d => {
                    const dt = tokens.filter(t => t.doctorId === d.id && (t.session || 'morning') === cs);
                    const lim = cs === 'morning' ? (d.morningSlots || 15) : (d.eveningSlots || 15);
                    return <option key={d.id} value={d.id}>Dr. {d.name} ({dt.length}/{lim}) {dt.length >= lim ? '🔒 FULL' : ''}</option>;
                  })}
                </select>
              </div>

              <div>
                <label style={lbl}>Priority Level</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setSelPri('NORMAL')} style={{ flex: 1, padding: 14, borderRadius: 10, border: selPri === 'NORMAL' ? '1.5px solid #111827' : '1px solid #e5e7eb', background: selPri === 'NORMAL' ? '#fff' : '#fff', color: '#111827', fontWeight: 700, textAlign: 'center', cursor: 'pointer' }}>
                    <div style={{ fontSize: 12 }}>⚪ Normal</div>
                    <div style={{ fontSize: 18, marginTop: 4 }}>₹{hospital?.consultationFee || 300}</div>
                  </button>
                  <button onClick={() => setSelPri('EMERGENCY')} style={{ flex: 1, padding: 14, borderRadius: 10, border: selPri === 'EMERGENCY' ? '1.5px solid #b91c1c' : '1px solid #e5e7eb', background: selPri === 'EMERGENCY' ? '#fef2f2' : '#fff', color: '#b91c1c', fontWeight: 700, textAlign: 'center', cursor: 'pointer' }}>
                    <div style={{ fontSize: 12 }}>🔴 Emergency</div>
                    <div style={{ fontSize: 18, marginTop: 4 }}>₹{hospital?.emergencyFee || 1000}</div>
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button style={{ ...primaryBtn, flex: 2, padding: 16, fontSize: 16 }} onClick={() => void addToken()}>Confirm Token</button>
                <button style={{ ...ghostBtn, flex: 1, padding: 16, fontSize: 16 }} onClick={() => { setShowAdd(false); setSelPri('NORMAL'); }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function stClr(s?: string) { return s === 'AVAILABLE' ? '#059669' : s === 'ON_ROUNDS' ? '#2563eb' : s === 'LUNCH_BREAK' ? '#d97706' : s === 'DELAYED' ? '#b91c1c' : '#059669'; }

// Admin Matching Styles
const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' };
const primaryBtn: React.CSSProperties = { background: '#111827', color: '#fff', border: '1px solid #111827', borderRadius: 10, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { background: '#fff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 10, padding: '9px 12px', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const smallBtn: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#374151' };
const inputSt: React.CSSProperties = { padding: 12, border: '1px solid #e5e7eb', borderRadius: 10, width: '100%', fontSize: 15, outline: 'none' };
const th: React.CSSProperties = { textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '10px 8px', color: '#374151', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 };
const td: React.CSSProperties = { borderBottom: '1px solid #f3f4f6', padding: '12px 8px', fontSize: 13, color: '#111827' };
const lbl: React.CSSProperties = { fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 600 };
const emergTag: React.CSSProperties = { fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4, color: '#b91c1c', background: '#fef2f2' };
