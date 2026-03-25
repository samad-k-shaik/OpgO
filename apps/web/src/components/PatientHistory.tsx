import React from 'react';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { firestore } from '../lib/firebase';

type Visit = {
  id: string;
  tokenNumber: number;
  doctorId: string;
  doctorName?: string;
  status: string;
  bookingType: string;
  date: Date;
};

type Props = {
  hospitalId: string;
  phone: string;
  doctors: { id: string; name: string }[];
};

export default function PatientHistory({ hospitalId, phone, doctors }: Props) {
  const [visits, setVisits] = React.useState<Visit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [searched, setSearched] = React.useState(false);

  React.useEffect(() => {
    if (!phone || phone.length < 10 || !hospitalId) {
      setVisits([]);
      setSearched(false);
      return;
    }

    let cancelled = false;
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(
          query(
            collection(firestore, 'tokens'),
            where('hospitalId', '==', hospitalId),
            where('patientPhone', '==', phone)
          )
        );
        if (cancelled) return;

        const vList = snap.docs.map(d => {
          const data = d.data();
          const createdAt = (data.createdAt as Timestamp)?.toDate();
          return {
            id: d.id,
            tokenNumber: data.tokenNumber,
            doctorId: data.doctorId,
            status: data.status,
            bookingType: data.bookingType,
            date: createdAt,
          };
        })
        .filter(v => v.date != null)
        .sort((a, b) => b.date.getTime() - a.date.getTime());

        // Attach doctor names
        const withNames = vList.map(v => ({
          ...v,
          doctorName: doctors.find(d => d.id === v.doctorId)?.name || 'Unknown',
        }));

        setVisits(withNames);
        setSearched(true);
      } catch (e) {
        console.error('Failed to fetch patient history:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const timer = setTimeout(fetchHistory, 500); // Debounce
    return () => { cancelled = true; clearTimeout(timer); };
  }, [phone, hospitalId, doctors]);

  if (!phone || phone.length < 10) return null;
  if (loading) return <div style={containerStyle}><span style={{ color: '#6b7280', fontSize: 13 }}>Checking patient history...</span></div>;
  if (!searched) return null;

  // Separate today's visits from past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pastVisits = visits.filter(v => v.date < today);

  if (pastVisits.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🆕</span>
          <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>New Patient — First Visit</span>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>🔁</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>
          Returning Patient — {pastVisits.length} past visit{pastVisits.length > 1 ? 's' : ''}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {pastVisits.slice(0, 5).map(v => (
          <div key={v.id} style={visitRowStyle}>
            <span style={{ fontSize: 12, color: '#374151' }}>
              {v.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Dr. {v.doctorName}</span>
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600, background: v.status === 'COMPLETED' ? '#d1fae5' : '#fef3c7', color: v.status === 'COMPLETED' ? '#065f46' : '#92400e' }}>
              {v.status}
            </span>
          </div>
        ))}
        {pastVisits.length > 5 && (
          <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: 4 }}>
            + {pastVisits.length - 5} more visits
          </div>
        )}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  background: '#f0f9ff',
  border: '1px solid #bae6fd',
  borderRadius: 12,
  padding: '10px 14px',
  marginTop: 8,
};

const visitRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '4px 0',
  borderBottom: '1px solid #e0f2fe',
  gap: 8,
};
