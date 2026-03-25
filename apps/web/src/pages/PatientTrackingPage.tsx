import React from 'react';
import { getPatientPhone, setPatientPhone } from '../lib/storage';
import { useHospitalPresence } from '../lib/hospitalPresence';
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { firestore } from '../lib/firebase';

type PatientQueueState = {
  found: boolean;
  tokenNumber: number;
  status: string;
  positionInQueue: number;
  currentlyServing: number | null;
  // Legacy properties for JSX compatibility
  tokenId?: string;
  state?: string;
  premiumEnabled?: boolean;
  hospitalName?: string;
  doctorName?: string;
};

type PremiumReminderPayload = {
  tokenId: string;
  positionInQueue: number;
  message: string;
};

export default function PatientTrackingPage() {
  const [phone, setPhone] = React.useState(getPatientPhone() ?? '');
  useHospitalPresence('patient', phone);

  const [tokenId, setTokenId] = React.useState('');
  const [state, setState] = React.useState<PatientQueueState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reminders, setReminders] = React.useState<Array<PremiumReminderPayload & { ts: number }>>([]);
  const [loading, setLoading] = React.useState(false); // Added loading state

  const refresh = React.useCallback(async () => {
    if (!phone.trim()) return;
    setLoading(true);
    try {
      setError(null); // Clear previous errors
      const start = new Date();
      start.setHours(0, 0, 0, 0);

      const tSnap = await getDocs(
        query(
          collection(firestore, 'tokens'),
          where('patientPhone', '==', phone.trim()),
          where('createdAt', '>=', Timestamp.fromDate(start)),
          orderBy('createdAt', 'desc')
        )
      );

      if (tSnap.empty) {
        setState(null);
        return;
      }

      const myToken = tSnap.docs[0].data() as any;
      const myTokenId = tSnap.docs[0].id;

      // Calculate position: Count tokens for the same doctor today that are WAITING and were created before mine
      const allTSnap = await getDocs(
        query(
          collection(firestore, 'tokens'),
          where('hospitalId', '==', myToken.hospitalId),
          where('doctorId', '==', myToken.doctorId),
          where('status', '==', 'WAITING'),
          where('createdAt', '>=', Timestamp.fromDate(start)),
          orderBy('createdAt', 'asc')
        )
      );

      let position = 0;
      for (const d of allTSnap.docs) {
        position++;
        if (d.id === myTokenId) break;
      }

      // Find serving token for the same doctor
      const sSnap = await getDocs(
        query(
          collection(firestore, 'tokens'),
          where('hospitalId', '==', myToken.hospitalId),
          where('doctorId', '==', myToken.doctorId),
          where('status', '==', 'CONSULTING'),
          where('createdAt', '>=', Timestamp.fromDate(start))
        )
      );

      const servingToken = sSnap.empty ? null : (sSnap.docs[0].data() as any).tokenNumber;

      setState({
        found: true,
        tokenNumber: myToken.tokenNumber,
        status: myToken.status,
        positionInQueue: myToken.status === 'WAITING' ? position : 0,
        currentlyServing: servingToken,
        state: myToken.status,
        premiumEnabled: false,
        hospitalName: 'Hospital',
        doctorName: 'Doctor',
      } as any);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [phone]); // Changed dependency from tokenId to phone

  React.useEffect(() => {
    setPatientPhone(phone.trim());
  }, [phone]);

  React.useEffect(() => {
    let alive = true;

    if (!phone.trim()) return;

    // Listen to tokens collection for changes
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const q = query(
      collection(firestore, 'tokens'),
      where('createdAt', '>=', Timestamp.fromDate(start)),
    );

    const unsub = onSnapshot(q, () => {
      if (!alive) return;
      void refresh().catch(() => undefined);
    });

    // Initial fetch
    void refresh().catch(() => undefined);

    return () => {
      alive = false;
      unsub();
    };
  }, [phone, refresh]);

  return (
    <div style={{ padding: 16, maxWidth: 860, margin: '0 auto' }}>
      <h2 style={{ marginTop: 0 }}>Patient Live Tracking</h2>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Your booking phone"
          style={inputStyle}
        />
        <input
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value)}
          placeholder="Token ID (from WhatsApp / reception)"
          style={inputStyle}
        />
        <button style={primaryButton} onClick={() => void refresh()}>
          Check Status
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        {error ? (
          <div style={{ color: '#b91c1c' }}>{error}</div>
        ) : !state ? (
          <div style={{ color: '#6b7280' }}>Enter your phone and token ID to see your queue position.</div>
        ) : !state.found ? (
          <div style={{ color: '#b91c1c' }}>Token not found for this hospital.</div>
        ) : (
          <div style={panel}>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <div>
                <div style={label}>Token</div>
                <div style={value}>
                  #{state.tokenNumber} <span style={{ color: '#6b7280', fontSize: 12 }}>({state.tokenId?.slice(0, 8)}...)</span>
                </div>
              </div>
              <div>
                <div style={label}>State</div>
                <div style={value}>{state.state}</div>
              </div>
              <div>
                <div style={label}>Position</div>
                <div style={value}>
                  {typeof state.positionInQueue === 'number' ? state.positionInQueue : 'N/A'}
                  {typeof state.positionInQueue === 'number' && state.positionInQueue > 0 ? (
                    <span style={{ color: '#6b7280', fontSize: 12 }}> (turn is near when position &lt;= 2)</span>
                  ) : null}
                </div>
              </div>
              <div>
                <div style={label}>Live Tracking</div>
                <div style={value}>{state.premiumEnabled ? 'Premium (enabled)' : 'Free (no reminders)'}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <h3 style={{ marginBottom: 8 }}>Premium Reminders</h3>
        {reminders.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reminders.map((r) => (
              <div key={r.ts + r.tokenId} style={reminderCard}>
                <div style={{ fontWeight: 600 }}>
                  Position {r.positionInQueue}: {r.message}
                </div>
                <div style={{ color: '#6b7280', fontSize: 12 }}>
                  {new Date(r.ts).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: '#6b7280' }}>No reminders yet. Enable premium to receive alerts.</div>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: 10,
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  minWidth: 240,
};

const primaryButton: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid #111827',
  background: '#111827',
  color: '#fff',
};

const panel: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  padding: 14,
  background: '#fff',
};

const label: React.CSSProperties = {
  color: '#6b7280',
  fontSize: 12,
};

const value: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
};

const reminderCard: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  padding: 12,
  background: '#fafafa',
};

