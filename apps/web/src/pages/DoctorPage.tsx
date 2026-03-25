import React from 'react';
import { useHospitalPresence } from '../lib/hospitalPresence';
import {
  collection, doc, getDocs, onSnapshot, query, where, updateDoc, deleteDoc,
  serverTimestamp, Timestamp, addDoc,
} from 'firebase/firestore';
import { firestore } from '../lib/firebase';
import { getHospitalAccessToken, getDoctorName, setDoctorName } from '../lib/storage';
import PatientHistory from '../components/PatientHistory';
import { generateReport } from '../lib/reportGenerator';

type Doctor = { id: string; name: string; specialty?: string; status?: string; statusMessage?: string; morningSlots?: number; eveningSlots?: number; clinicHours?: { morning?: { start: string; end: string }; evening?: { start: string; end: string } } };
type TokenDoc = { id: string; tokenNumber: number; patientPhone: string; status: string; bookingType: string; doctorId: string; priority?: string; session?: string; createdAt: Date };
type SessionDoc = { id: string; clientType: string; receptionistName?: string; doctorName?: string; lastSeenAt: Date };

function curSession(): 'morning' | 'evening' { return new Date().getHours() < 14 ? 'morning' : 'evening'; }

export default function DoctorPage() {
  useHospitalPresence('doctor');
  const [hospital, setHospital] = React.useState<{ id: string; name: string; consultationFee: number; emergencyFee: number } | null>(null);
  const [me, setMe] = React.useState<Doctor | null>(null);
  const [doctors, setDoctors] = React.useState<Doctor[]>([]);
  const [todayTokens, setTodayTokens] = React.useState<TokenDoc[]>([]);
  const [weekTokens, setWeekTokens] = React.useState<TokenDoc[]>([]);
  const [sessions, setSessions] = React.useState<SessionDoc[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<'queue' | 'analytics' | 'manage'>('queue');
  const [patientLookup, setPatientLookup] = React.useState('');
  const [sMSlots, setSMSlots] = React.useState('15');
  const [sESlots, setSESlots] = React.useState('15');
  const [sMStart, setSMStart] = React.useState('09:00');
  const [sMEnd, setSMEnd] = React.useState('13:00');
  const [sEStart, setSEStart] = React.useState('17:00');
  const [sEEnd, setSEEnd] = React.useState('20:00');
  const [newDocName, setNewDocName] = React.useState('');
  const [newDocSpec, setNewDocSpec] = React.useState('');
  const [showAlert, setShowAlert] = React.useState(false);

  React.useEffect(() => {
    const t = getHospitalAccessToken(), n = getDoctorName();
    if (!t || !n) { setError('Please sign in first.'); setLoading(false); return; }
    (async () => { try { const s = await getDocs(query(collection(firestore, 'hospitals'), where('accessToken', '==', t))); if (s.empty) { setError('Invalid token.'); return; } const d = s.docs[0].data(); setHospital({ id: s.docs[0].id, name: d.name, consultationFee: d.consultationFee || 300, emergencyFee: d.emergencyFee || 1000 }); } catch { setError('Connection failed.'); } })();
  }, []);

  React.useEffect(() => {
    if (!hospital?.id) return;
    const n = getDoctorName();
    return onSnapshot(collection(firestore, 'hospitals', hospital.id, 'doctors'), (snap) => {
      const dl = snap.docs.map(d => ({ id: d.id, ...d.data() } as Doctor));
      setDoctors(dl);
      const m = dl.find(d => d.name.toLowerCase().includes(n?.toLowerCase() || '')) || dl[0];
      setMe(m);
      if (m) { setSMSlots(String(m.morningSlots || 15)); setSESlots(String(m.eveningSlots || 15)); if (m.clinicHours?.morning) { setSMStart(m.clinicHours.morning.start); setSMEnd(m.clinicHours.morning.end); } if (m.clinicHours?.evening) { setSEStart(m.clinicHours.evening.start); setSEEnd(m.clinicHours.evening.end); } }
      setLoading(false);
    });
  }, [hospital?.id]);

  React.useEffect(() => {
    if (!hospital?.id) return;
    return onSnapshot(query(collection(firestore, 'tokens'), where('hospitalId', '==', hospital.id)), (snap) => {
      const now = new Date(), todayS = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), weekS = todayS - 6 * 86400000;
      const all = snap.docs.map(d => { const x = d.data(); return { id: d.id, tokenNumber: x.tokenNumber, patientPhone: x.patientPhone, status: x.status, bookingType: x.bookingType, doctorId: x.doctorId, priority: x.priority || 'NORMAL', session: x.session || 'morning', createdAt: (x.createdAt as Timestamp)?.toDate() }; }).filter(t => t.createdAt);
      setTodayTokens(all.filter(t => t.createdAt.getTime() >= todayS && t.createdAt.getTime() < todayS + 86400000));
      setWeekTokens(all.filter(t => t.createdAt.getTime() >= weekS));
    });
  }, [hospital?.id]);

  React.useEffect(() => {
    if (!hospital?.id || tab !== 'manage') return;
    (async () => { try { const s = await getDocs(query(collection(firestore, 'hospitalSessions'), where('hospitalId', '==', hospital.id))); const ago = Date.now() - 600000; setSessions(s.docs.map(d => ({ id: d.id, clientType: d.data().clientType, receptionistName: d.data().receptionistName, doctorName: d.data().doctorName, lastSeenAt: (d.data().lastSeenAt as Timestamp)?.toDate() })).filter(x => x.lastSeenAt?.getTime() >= ago)); } catch {} })();
  }, [hospital?.id, tab]);

  const setStatus = async (s: string, m = '') => { if (!me || !hospital) return; await updateDoc(doc(firestore, 'hospitals', hospital.id, 'doctors', me.id), { status: s, statusMessage: m, updatedAt: serverTimestamp() }).catch(() => alert('Failed')); };
  const setTokenSt = async (id: string, s: string) => { await updateDoc(doc(firestore, 'tokens', id), { status: s, updatedAt: serverTimestamp() }).catch(() => alert('Failed')); };
  const sendAlert = async (msg: string) => { if (!me || !hospital) return; await updateDoc(doc(firestore, 'hospitals', hospital.id, 'doctors', me.id), { status: msg === 'STOP_OP' ? 'DELAYED' : msg === 'ON_ROUNDS' ? 'ON_ROUNDS' : me.status, statusMessage: msg === 'STOP_OP' ? '⛔ STOP OP' : msg === 'ON_ROUNDS' ? '🔵 On Rounds' : msg === 'OFFLINE' ? '⚫ Offline today' : msg, updatedAt: serverTimestamp() }).catch(() => alert('Failed')); setShowAlert(false); };
  const saveSett = async () => { if (!me || !hospital) return; await updateDoc(doc(firestore, 'hospitals', hospital.id, 'doctors', me.id), { morningSlots: parseInt(sMSlots) || 15, eveningSlots: parseInt(sESlots) || 15, clinicHours: { morning: { start: sMStart, end: sMEnd }, evening: { start: sEStart, end: sEEnd } }, updatedAt: serverTimestamp() }).then(() => alert('✅ Saved!')).catch(() => alert('Failed')); };
  const addDoctor = async () => { if (!newDocName.trim() || !hospital) return; await addDoc(collection(firestore, 'hospitals', hospital.id, 'doctors'), { name: newDocName.trim(), specialty: newDocSpec.trim(), status: 'AVAILABLE', morningSlots: 15, eveningSlots: 15, clinicHours: { morning: { start: '09:00', end: '13:00' }, evening: { start: '17:00', end: '20:00' } }, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch(() => alert('Failed')); setNewDocName(''); setNewDocSpec(''); };
  const rmDoc = async (id: string, n: string) => { if (!hospital || id === me?.id || !confirm(`Remove Dr. ${n}?`)) return; await deleteDoc(doc(firestore, 'hospitals', hospital.id, 'doctors', id)).catch(() => alert('Failed')); };
  const rmSession = async (id: string) => { if (!confirm('Disconnect?')) return; await deleteDoc(doc(firestore, 'hospitalSessions', id)).catch(() => alert('Failed')); setSessions(s => s.filter(x => x.id !== id)); };
  const getFee = (p?: string) => p === 'EMERGENCY' ? (hospital?.emergencyFee || 1000) : (hospital?.consultationFee || 300);
  const dlReport = (period: 'today' | 'week' | 'month') => { if (!hospital || !me) return; const now = new Date(); const sd = period === 'today' ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : period === 'week' ? new Date(now.getTime() - 6 * 86400000) : new Date(now.getFullYear(), now.getMonth(), 1); const dr = period === 'today' ? sd.toLocaleDateString('en-IN') : period === 'week' ? `${sd.toLocaleDateString('en-IN')} — ${now.toLocaleDateString('en-IN')}` : sd.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); const src = period === 'today' ? todayTokens : weekTokens; generateReport({ hospitalName: hospital.name, doctorName: me.name, dateRange: dr, fees: { normal: hospital.consultationFee, urgent: 0, emergency: hospital.emergencyFee }, tokens: src.filter(t => t.doctorId === me.id && t.createdAt >= sd).map(t => ({ date: t.createdAt.toLocaleDateString('en-IN'), tokenNumber: t.tokenNumber, patientPhone: t.patientPhone, doctorName: me.name, priority: t.priority || 'NORMAL', fee: getFee(t.priority), status: t.status, bookingType: t.bookingType })) }); };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: 14, color: '#6b7280' }}>Connecting to clinic...</div>;
  if (error) return <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: 20, textAlign: 'center', gap: 12 }}><p style={{ color: '#b91c1c' }}>{error}</p><button onClick={() => window.location.reload()} style={primaryBtn}>Retry</button></div>;

  const myT = todayTokens.filter(t => t.doctorId === me?.id);
  const serving = myT.find(t => t.status === 'CONSULTING');
  const waiting = myT.filter(t => t.status === 'WAITING' || t.status === 'ARRIVED').sort((a, b) => { if (a.priority === 'EMERGENCY' && b.priority !== 'EMERGENCY') return -1; if (b.priority === 'EMERGENCY' && a.priority !== 'EMERGENCY') return 1; return a.tokenNumber - b.tokenNumber; });
  const done = myT.filter(t => t.status === 'COMPLETED');
  const cs = curSession();
  const mS = me?.morningSlots || 15, eS = me?.eveningSlots || 15;
  const mB = myT.filter(t => (t.session || 'morning') === 'morning').length;
  const eB = myT.filter(t => t.session === 'evening').length;
  const nDone = done.filter(t => t.priority !== 'EMERGENCY').length;
  const eDone = done.filter(t => t.priority === 'EMERGENCY').length;
  const rev = nDone * (hospital?.consultationFee || 300) + eDone * (hospital?.emergencyFee || 1000);
  const myW = weekTokens.filter(t => t.doctorId === me?.id);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return { l: d.toLocaleDateString('en-IN', { weekday: 'short' }), ds: d.toISOString().slice(0, 10) }; });
  const trend = days.map(d => ({ ...d, c: myW.filter(t => t.createdAt.toISOString().slice(0, 10) === d.ds).length }));
  const maxTr = Math.max(...trend.map(d => d.c), 1);

  return (
    <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
      {/* Header — same style as admin */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, color: '#111827' }}>Dr. {getDoctorName()} <span style={{ fontSize: 10, color: '#9ca3af' }}>{hospital?.name}</span></h2>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{cs === 'morning' ? '🌅 Morning Session' : '🌙 Evening Session'} • {new Date().toLocaleDateString('en-IN')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setShowAlert(true)} style={ghostBtn}>📢 Alert</button>
          <select value={me?.status || 'AVAILABLE'} onChange={(e) => { const v = e.target.value; if (v === 'DELAYED') { const m = prompt('Delay info?'); if (m !== null) void setStatus(v, m); } else void setStatus(v); }}
            style={{ ...ghostBtn, color: sClr(me?.status), fontWeight: 700, paddingRight: 4 }}>
            <option value="AVAILABLE">🟢 Available</option>
            <option value="ON_ROUNDS">🔵 Rounds</option>
            <option value="LUNCH_BREAK">🟡 Lunch</option>
            <option value="DELAYED">🔴 Delayed</option>
          </select>
          <button onClick={() => { setDoctorName(''); window.location.reload(); }} style={ghostBtn}>Sign out</button>
        </div>
      </header>

      {/* Tabs — admin style */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
        {(['queue', 'analytics', 'manage'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '12px 0', textAlign: 'center', fontSize: 13, fontWeight: tab === t ? 800 : 400, background: 'none', border: 'none', cursor: 'pointer', color: tab === t ? '#111827' : '#9ca3af', borderBottom: tab === t ? '2px solid #111827' : '2px solid transparent' }}>
            {t === 'queue' ? `🎟️ Queue (${waiting.length})` : t === 'analytics' ? '📊 Analytics' : '⚙️ Manage'}
          </button>
        ))}
      </div>

      {tab === 'queue' && <>
        {/* Slot Overview — compact table style */}
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Slot Status</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Session</th><th style={th}>Booked</th><th style={th}>Limit</th><th style={th}>Available</th><th style={th}>Status</th></tr></thead>
            <tbody>
              <tr style={{ background: cs === 'morning' ? '#eff6ff' : undefined }}>
                <td style={td}>🌅 Morning</td>
                <td style={{ ...td, fontWeight: 700 }}>{mB}</td>
                <td style={td}>{mS}</td>
                <td style={{ ...td, color: mS - mB > 0 ? '#059669' : '#b91c1c', fontWeight: 700 }}>{mS - mB}</td>
                <td style={td}>{mB >= mS ? <span style={{ color: '#b91c1c', fontWeight: 700, fontSize: 11 }}>🔒 FULL</span> : <span style={{ color: '#059669', fontSize: 11 }}>Open</span>}</td>
              </tr>
              <tr style={{ background: cs === 'evening' ? '#f5f3ff' : undefined }}>
                <td style={td}>🌙 Evening</td>
                <td style={{ ...td, fontWeight: 700 }}>{eB}</td>
                <td style={td}>{eS}</td>
                <td style={{ ...td, color: eS - eB > 0 ? '#059669' : '#b91c1c', fontWeight: 700 }}>{eS - eB}</td>
                <td style={td}>{eB >= eS ? <span style={{ color: '#b91c1c', fontWeight: 700, fontSize: 11 }}>🔒 FULL</span> : <span style={{ color: '#059669', fontSize: 11 }}>Open</span>}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Now Serving */}
        <div style={{ ...card, marginBottom: 14, borderColor: serving ? '#bbf7d0' : '#e5e7eb', background: serving ? '#f0fdf4' : '#fff' }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10, color: serving ? '#059669' : '#9ca3af' }}>{serving ? 'Now Consulting' : 'Idle — No Patient'}</div>
          {serving ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 52, fontWeight: 900, color: '#111827' }}>#{serving.tokenNumber}</span>
                {serving.priority === 'EMERGENCY' && <span style={emergTag}>🔴 EMERGENCY</span>}
              </div>
              <div style={{ fontSize: 15, color: '#374151', marginTop: 4 }}>{serving.patientPhone}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button onClick={() => void setTokenSt(serving.id, 'COMPLETED')} style={{ ...primaryBtn, flex: 2, padding: 14, fontSize: 15, background: '#059669', borderColor: '#059669' }}>✅ Done</button>
                <button onClick={() => void setTokenSt(serving.id, 'SKIPPED')} style={{ ...ghostBtn, flex: 1, padding: 14, fontSize: 15 }}>⏭ Skip</button>
              </div>
            </div>
          ) : waiting.length > 0 ? (
            <button onClick={() => void setTokenSt(waiting[0].id, 'CONSULTING')} style={{ ...primaryBtn, width: '100%', padding: 16, fontSize: 16 }}>
              📢 Call Next — #{waiting[0].tokenNumber} {waiting[0].priority === 'EMERGENCY' ? '🔴' : ''}
            </button>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#9ca3af' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>☕</div>
              <div style={{ fontSize: 14 }}>No patients waiting</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Morning {mB}/{mS} • Evening {eB}/{eS}</div>
            </div>
          )}
        </div>

        {/* Queue Table */}
        {waiting.length > 0 && (
          <div style={{ ...card, marginBottom: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Upcoming ({waiting.length})</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>#</th><th style={th}>Patient</th><th style={th}>Type</th><th style={th}>Priority</th><th style={th}>Action</th></tr></thead>
              <tbody>
                {waiting.map(t => (
                  <tr key={t.id}>
                    <td style={{ ...td, fontWeight: 700 }}>#{t.tokenNumber}</td>
                    <td style={td}>{t.patientPhone} {t.status === 'ARRIVED' ? <span style={{ fontSize: 9, color: '#059669', fontWeight: 700 }}>✓ Arrived</span> : ''}</td>
                    <td style={{ ...td, fontSize: 11, color: '#6b7280' }}>{t.session === 'evening' ? '🌙' : '🌅'} {t.bookingType === 'REMOTE' ? 'Online' : 'Walk-in'}</td>
                    <td style={td}>{t.priority === 'EMERGENCY' ? <span style={emergTag}>EMERGENCY</span> : <span style={{ color: '#6b7280', fontSize: 11 }}>Normal</span>}</td>
                    <td style={td}><button onClick={() => void setTokenSt(t.id, 'CONSULTING')} style={smallBtn}>Start</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Completed */}
        {done.length > 0 && (
          <div style={{ ...card }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Completed ({done.length})</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>#</th><th style={th}>Patient</th><th style={th}>Priority</th><th style={th}>Fee</th></tr></thead>
              <tbody>
                {done.map(t => (
                  <tr key={t.id} style={{ opacity: 0.6 }}>
                    <td style={{ ...td, fontWeight: 700, color: '#059669' }}>#{t.tokenNumber} ✅</td>
                    <td style={td}>{t.patientPhone}</td>
                    <td style={td}>{t.priority === 'EMERGENCY' ? <span style={emergTag}>EMERGENCY</span> : 'Normal'}</td>
                    <td style={{ ...td, fontWeight: 600 }}>₹{getFee(t.priority)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>}

      {tab === 'analytics' && <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
          {[{ v: myT.length, l: 'Total Tokens' }, { v: done.length, l: 'Completed', c: '#059669' }, { v: waiting.length, l: 'Waiting', c: '#d97706' }].map((s, i) => (
            <div key={i} style={card}><div style={{ fontSize: 28, fontWeight: 900, color: s.c || '#111827' }}>{s.v}</div><div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{s.l}</div></div>
          ))}
        </div>

        <div style={{ ...card, marginBottom: 14, textAlign: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>💰 Today's Revenue</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#059669' }}>₹{rev.toLocaleString('en-IN')}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
            <tbody>
              <tr><td style={{ ...td, fontSize: 12 }}>⚪ Normal ({nDone} × ₹{hospital?.consultationFee || 300})</td><td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>₹{(nDone * (hospital?.consultationFee || 300)).toLocaleString('en-IN')}</td></tr>
              <tr><td style={{ ...td, fontSize: 12, color: '#b91c1c' }}>🔴 Emergency ({eDone} × ₹{hospital?.emergencyFee || 1000})</td><td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#b91c1c' }}>₹{(eDone * (hospital?.emergencyFee || 1000)).toLocaleString('en-IN')}</td></tr>
            </tbody>
          </table>
        </div>

        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14 }}>📈 7-Day Trend</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100 }}>
            {trend.map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700 }}>{d.c}</div>
                <div style={{ width: '100%', background: i === 6 ? '#111827' : '#e5e7eb', borderRadius: 6, height: `${Math.max((d.c / maxTr) * 70, 4)}px` }} />
                <div style={{ fontSize: 9, color: '#9ca3af' }}>{d.l}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>📥 Download Reports</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['today', 'week', 'month'] as const).map(p => (
              <button key={p} onClick={() => dlReport(p)} style={{ ...ghostBtn, flex: 1 }}>📄 {p === 'today' ? 'Today' : p === 'week' ? 'Week' : 'Month'}</button>
            ))}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>🔍 Patient Lookup</div>
          <input type="tel" value={patientLookup} onChange={(e) => setPatientLookup(e.target.value)} placeholder="Patient phone number" style={inputSt} />
          {hospital && <PatientHistory hospitalId={hospital.id} phone={patientLookup} doctors={doctors.map(d => ({ id: d.id, name: d.name }))} />}
        </div>
      </>}

      {tab === 'manage' && <>
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>⚙️ Clinic Settings</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div><label style={lbl}>🌅 Morning Slots</label><input type="number" value={sMSlots} onChange={(e) => setSMSlots(e.target.value)} style={inputSt} /></div>
            <div><label style={lbl}>🌙 Evening Slots</label><input type="number" value={sESlots} onChange={(e) => setSESlots(e.target.value)} style={inputSt} /></div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>🌅 Morning Hours</label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input type="time" value={sMStart} onChange={(e) => setSMStart(e.target.value)} style={{ ...inputSt, flex: 1 }} />
              <span style={{ color: '#6b7280', fontSize: 12, fontWeight: 600 }}>to</span>
              <input type="time" value={sMEnd} onChange={(e) => setSMEnd(e.target.value)} style={{ ...inputSt, flex: 1 }} />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>🌙 Evening Hours</label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input type="time" value={sEStart} onChange={(e) => setSEStart(e.target.value)} style={{ ...inputSt, flex: 1 }} />
              <span style={{ color: '#6b7280', fontSize: 12, fontWeight: 600 }}>to</span>
              <input type="time" value={sEEnd} onChange={(e) => setSEEnd(e.target.value)} style={{ ...inputSt, flex: 1 }} />
            </div>
          </div>
          <button onClick={() => void saveSett()} style={{ ...primaryBtn, width: '100%', padding: 14 }}>💾 Save Settings</button>
        </div>

        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>👨‍⚕️ Manage Doctors</div>
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Doctor</th><th style={th}>Specialty</th><th style={th}>Status</th><th style={th}>Actions</th></tr></thead>
              <tbody>
                {doctors.map(d => (
                  <tr key={d.id}>
                    <td style={{ ...td, fontWeight: d.id === me?.id ? 700 : 400 }}>Dr. {d.name} {d.id === me?.id ? '(You)' : ''}</td>
                    <td style={{ ...td, color: '#6b7280' }}>{d.specialty || '—'}</td>
                    <td style={td}><span style={{ fontSize: 11, fontWeight: 700, color: sClr(d.status) }}>{d.status || 'AVAILABLE'}</span></td>
                    <td style={td}>{d.id !== me?.id ? <button onClick={() => void rmDoc(d.id, d.name)} style={{ ...smallBtn, color: '#b91c1c' }}>Remove</button> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 14, background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12, color: '#111827' }}>➕ Add New Doctor</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <input value={newDocName} onChange={(e) => setNewDocName(e.target.value)} placeholder="Full Name" style={inputSt} />
              <input value={newDocSpec} onChange={(e) => setNewDocSpec(e.target.value)} placeholder="Specialty" style={inputSt} />
            </div>
            <button onClick={() => void addDoctor()} disabled={!newDocName.trim()} style={{ ...primaryBtn, width: '100%', background: '#059669', borderColor: '#059669', padding: 12 }}>Create Doctor Profile</button>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>📋 Active Sessions</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>User</th><th style={th}>Role</th><th style={th}>Last Seen</th><th style={th}>Actions</th></tr></thead>
            <tbody>
              {sessions.length === 0 && <tr><td colSpan={4} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: 20 }}>No active sessions</td></tr>}
              {sessions.map(s => (
                <tr key={s.id}>
                  <td style={td}>{s.clientType === 'reception' ? s.receptionistName || 'Receptionist' : `Dr. ${s.doctorName}`}</td>
                  <td style={td}><span style={{ fontSize: 11, background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{s.clientType}</span></td>
                  <td style={{ ...td, fontSize: 11, color: '#6b7280' }}>{s.lastSeenAt?.toLocaleTimeString('en-IN')}</td>
                  <td style={td}><button onClick={() => void rmSession(s.id)} style={{ ...smallBtn, color: '#b91c1c' }}>Disconnect</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}

      {/* Alert Bottom Sheet */}
      {showAlert && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', zIndex: 1000 }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 500, padding: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20, boxShadow: '0 -4px 20px rgba(0,0,0,0.1)' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e5e7eb', margin: '0 auto 16px' }} />
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>📢 Alert Reception</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => void sendAlert('STOP_OP')} style={{ ...primaryBtn, background: '#b91c1c', borderColor: '#b91c1c', padding: 14, fontSize: 15 }}>⛔ Stop OP</button>
              <button onClick={() => void sendAlert('ON_ROUNDS')} style={{ ...primaryBtn, background: '#2563eb', borderColor: '#2563eb', padding: 14, fontSize: 15 }}>🔵 Going on Rounds</button>
              <button onClick={() => void sendAlert('OFFLINE')} style={{ ...primaryBtn, background: '#374151', borderColor: '#374151', padding: 14, fontSize: 15 }}>⚫ Offline for Today</button>
              <button onClick={() => { const m = prompt('Custom message:'); if (m) void sendAlert(m); }} style={{ ...ghostBtn, padding: 14, fontSize: 15 }}>✏️ Custom Message</button>
              <button onClick={() => setShowAlert(false)} style={{ padding: 12, border: 'none', background: 'transparent', color: '#9ca3af', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function sClr(s?: string) { return s === 'AVAILABLE' ? '#059669' : s === 'ON_ROUNDS' ? '#2563eb' : s === 'LUNCH_BREAK' ? '#d97706' : s === 'DELAYED' ? '#b91c1c' : '#059669'; }

/* Admin-matching styles */
const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 14, padding: 14, background: '#fff' };
const primaryBtn: React.CSSProperties = { padding: '10px 14px', borderRadius: 10, border: '1px solid #111827', background: '#111827', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const ghostBtn: React.CSSProperties = { padding: '9px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', cursor: 'pointer', fontSize: 13 };
const smallBtn: React.CSSProperties = { padding: '6px 10px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, cursor: 'pointer' };
const inputSt: React.CSSProperties = { padding: 10, border: '1px solid #e5e7eb', borderRadius: 10, width: '100%', fontSize: 14, outline: 'none' };
const th: React.CSSProperties = { textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '10px 8px', color: '#374151', fontSize: 12 };
const td: React.CSSProperties = { borderBottom: '1px solid #f3f4f6', padding: '10px 8px', fontSize: 13 };
const lbl: React.CSSProperties = { fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 };
const emergTag: React.CSSProperties = { fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, color: '#b91c1c', background: '#fef2f2' };
