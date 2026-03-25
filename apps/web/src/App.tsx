import React from 'react';
import { Link, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ReceptionPage from './pages/ReceptionPage';
import PatientTrackingPage from './pages/PatientTrackingPage';
import DisplayPage from './pages/DisplayPage';
import AdminPage from './pages/AdminPage';
import ReceptionLoginPage from './pages/ReceptionLoginPage';
import DoctorPage from './pages/DoctorPage';
import DoctorLoginPage from './pages/DoctorLoginPage';
import { getHospitalAccessToken, setHospitalAccessToken, getReceptionistName, getDoctorName } from './lib/storage';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const isReception = location.pathname.startsWith('/reception');
  const isDoctor = location.pathname.startsWith('/doctor');
  const isPWA = isReception || isDoctor;

  const [token, setToken] = React.useState(() => getHospitalAccessToken() ?? '');

  React.useEffect(() => {
    const t = getHospitalAccessToken();
    if (t && !token) setToken(t);
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', minHeight: '100vh' }}>
      {!isPWA && (
        <div style={{ padding: 16, borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 18, color: '#111827' }}>OP go</strong>
          <nav style={{ display: 'flex', gap: 12 }}>
            <Link to="/" style={{ color: '#111827', textDecoration: 'none' }}>Home</Link>
            <Link to="/reception" style={{ color: '#111827', textDecoration: 'none' }}>Reception</Link>
            <Link to="/patient" style={{ color: '#111827', textDecoration: 'none' }}>Patient</Link>
            <Link to="/display" style={{ color: '#111827', textDecoration: 'none' }}>TV Display</Link>
            <Link to="/admin" style={{ color: '#111827', textDecoration: 'none' }}>Admin</Link>
          </nav>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={token}
              onChange={(e) => {
                const v = e.target.value;
                setToken(v);
                setHospitalAccessToken(v);
              }}
              placeholder="Hospital access token"
              style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 8, minWidth: 280 }}
            />
            <button
              onClick={() => navigate('/display')}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #111827', background: '#111827', color: '#fff' }}
            >
              Go
            </button>
          </div>
        </div>
      )}

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/reception"
          element={
            getReceptionistName() ? <ReceptionPage /> : <ReceptionLoginPage />
          }
        />
        <Route path="/reception/login" element={<ReceptionLoginPage />} />
        <Route
          path="/doctor"
          element={
            getDoctorName() ? <DoctorPage /> : <DoctorLoginPage />
          }
        />
        <Route path="/doctor/login" element={<DoctorLoginPage />} />
        <Route path="/patient" element={<PatientTrackingPage />} />
        <Route path="/display" element={<DisplayPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </div>
  );
}

