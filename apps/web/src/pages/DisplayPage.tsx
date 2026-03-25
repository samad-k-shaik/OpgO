import React from 'react';
import { useHospitalPresence } from '../lib/hospitalPresence';
import { onSnapshot, collection, query, where, Timestamp, getDocs, orderBy } from 'firebase/firestore';
import { firestore } from '../lib/firebase';
import { getHospitalAccessToken } from '../lib/storage';

type DoctorQueueView = {
  doctorId: string;
  doctorName: string;
  status?: string;
  statusMessage?: string;
  serving: null | { tokenId: string; tokenNumber: number; patientPhone: string; status: string };
  next: Array<{ tokenId: string; tokenNumber: number; patientPhone: string }>;
};

type DisplayView = { doctors: DoctorQueueView[] };

export default function DisplayPage() {
  useHospitalPresence('display');

  const [view, setView] = React.useState<DisplayView | null>(null);
  const [connected, setConnected] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      const token = getHospitalAccessToken();
      if (!token) return;

      const hSnap = await getDocs(query(collection(firestore, 'hospitals'), where('accessToken', '==', token)));
      if (hSnap.empty) return;
      const hospitalId = hSnap.docs[0].id;

      const dSnap = await getDocs(collection(firestore, 'hospitals', hospitalId, 'doctors'));
      const doctorInfos = dSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name as string,
        status: d.data().status as string,
        statusMessage: d.data().statusMessage as string,
      }));

      const start = new Date();
      start.setHours(0, 0, 0, 0);

      const tSnap = await getDocs(
        query(
          collection(firestore, 'tokens'),
          where('hospitalId', '==', hospitalId),
          where('createdAt', '>=', Timestamp.fromDate(start)),
          orderBy('createdAt', 'asc')
        )
      );

      const tokens = tSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

      const doctorViews: DoctorQueueView[] = doctorInfos.map((d) => {
        const dTokens = tokens.filter((t: any) => t.doctorId === d.id);
        const servingToken = dTokens.find((t: any) => t.status === 'CONSULTING');
        const nextTokens = dTokens
          .filter((t: any) => t.status === 'WAITING' || t.status === 'ARRIVED')
          .slice(0, 4);

        return {
          doctorId: d.id,
          doctorName: d.name,
          status: d.status,
          statusMessage: d.statusMessage,
          serving: servingToken
            ? {
                tokenId: servingToken.id,
                tokenNumber: servingToken.tokenNumber,
                patientPhone: servingToken.patientPhone,
                status: servingToken.status,
              }
            : null,
          next: nextTokens.map((t: any) => ({
            tokenId: t.id,
            tokenNumber: t.tokenNumber,
            patientPhone: t.patientPhone,
          })),
        };
      });

      setView({ doctors: doctorViews });
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        await refresh();
      } catch {
        // ignore
      }
    };
    void run();

    // Listen to tokens collection for changes
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const q = query(
      collection(firestore, 'tokens'),
      where('createdAt', '>=', Timestamp.fromDate(start)),
    );

    const unsub = onSnapshot(q, () => {
      if (!alive) return;
      setConnected(true);
      void refresh().catch(() => undefined);
    }, (err) => {
      // eslint-disable-next-line no-console
      console.error('Firestore sync error', err);
      setConnected(false);
    });

    return () => {
      alive = false;
      unsub();
    };
  }, [refresh]);

  return (
    <div style={{ padding: 18, background: '#0b1220', color: '#fff', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 20 }}>Live Queue Display</div>
          <div style={{ color: '#93c5fd', marginTop: 4, fontSize: 13 }}>{connected ? 'Realtime connected' : 'Connecting...'}</div>
        </div>
        <div style={{ color: '#93c5fd', fontSize: 13 }}>Updates when reception changes token state.</div>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>
        {(view?.doctors ?? []).map((d) => (
          <div key={d.doctorId} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 24 }}>{d.doctorName}</div>
              <div style={{
                fontSize: 14,
                fontWeight: 700,
                color: d.status === 'AVAILABLE' || !d.status ? '#10b981' : '#f59e0b',
                background: 'rgba(255,255,255,0.05)',
                padding: '4px 10px',
                borderRadius: 8
              }}>
                {d.status || 'AVAILABLE'}
              </div>
            </div>
            {d.statusMessage && (
              <div style={{ color: '#ef4444', fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                ⚠️ {d.statusMessage}
              </div>
            )}

            <div style={{ marginTop: 10, padding: 14, borderRadius: 14, background: '#111c33', border: '1px solid #172554' }}>
              {d.serving ? (
                <>
                  <div style={{ color: '#93c5fd', fontSize: 12 }}>Token #</div>
                  <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.05 }}>{d.serving.tokenNumber}</div>
                  <div style={{ color: '#c7d2fe', fontSize: 13, marginTop: 6 }}>Patient: {d.serving.patientPhone}</div>
                </>
              ) : (
                <div style={{ color: '#93c5fd' }}>No active patient</div>
              )}
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#c7d2fe' }}>Next</div>
              {d.next.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  {d.next.map((t) => (
                    <div key={t.tokenId} style={nextRow}>
                      <div style={{ fontWeight: 800 }}>#{t.tokenNumber}</div>
                      <div style={{ color: '#93c5fd', fontSize: 12 }}>({t.patientPhone})</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ marginTop: 10, color: '#93c5fd' }}>Queue empty</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  border: '1px solid #172554',
  borderRadius: 18,
  padding: 14,
  background: '#0f1b35',
};

const nextRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 12px',
  borderRadius: 14,
  background: '#0b1630',
  border: '1px solid #172554',
};

