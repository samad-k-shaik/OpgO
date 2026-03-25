import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { setDoctorName, setHospitalAccessToken } from '../lib/storage';

export default function DoctorLoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = React.useState<'phone' | 'otp' | 'name' | 'hospital'>('phone');
  const [phone, setPhone] = React.useState('');
  const [token, setToken] = React.useState('');
  const [otp, setOtp] = React.useState('');
  const [name, setName] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmationResult, setConfirmationResult] = React.useState<ConfirmationResult | null>(null);

  const recaptchaRef = React.useRef<HTMLDivElement>(null);
  const verifierRef = React.useRef<RecaptchaVerifier | null>(null);

  React.useEffect(() => {
    if (!verifierRef.current && recaptchaRef.current) {
      verifierRef.current = new RecaptchaVerifier(auth, recaptchaRef.current, {
        size: 'invisible',
      });
    }
  }, []);

  const onSendOtp = async () => {
    let formattedPhone = phone.trim();
    if (!formattedPhone) return;
    if (formattedPhone.length === 10 && !formattedPhone.startsWith('+')) {
      formattedPhone = `+91${formattedPhone}`;
    }
    if (!formattedPhone.startsWith('+')) {
      setError('Please include country code (e.g. +91)');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithPhoneNumber(auth, formattedPhone, verifierRef.current!);
      setConfirmationResult(result);
      setStep('otp');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const onVerifyOtp = async () => {
    if (!otp.trim() || !confirmationResult) return;
    setLoading(true);
    setError(null);
    try {
      await confirmationResult.confirm(otp);
      setStep('name');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const onSaveName = () => {
    if (!name.trim()) return;
    setDoctorName(name.trim());
    setStep('hospital');
  };

  const onSaveToken = async () => {
    const t = token.trim();
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const { getDocs, collection, query, where } = await import('firebase/firestore');
      const { firestore } = await import('../lib/firebase');
      const hSnap = await getDocs(query(collection(firestore, 'hospitals'), where('accessToken', '==', t)));
      if (hSnap.empty) {
        setError('Invalid Hospital Access Token.');
        return;
      }
      setHospitalAccessToken(t);
      navigate('/doctor');
    } catch (e) {
      setError('Failed to validate token.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#6b7280', marginBottom: 4 }}>OP go</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Doctor Access</h1>
        </div>
        <p style={{ margin: '0 0 24px 0', color: '#6b7280', textAlign: 'center', fontSize: 14 }}>
          {step === 'phone' && 'Enter your mobile number to get started'}
          {step === 'otp' && 'Enter the code sent to your mobile'}
          {step === 'name' && 'Welcome! What is your name?'}
          {step === 'hospital' && 'Link to your clinic'}
        </p>

        {error && <div style={errorStyle}>{error}</div>}

        {step === 'phone' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 9988776655" style={inputStyle} />
            <button onClick={() => void onSendOtp()} disabled={loading} style={buttonStyle}>{loading ? 'Sending...' : 'Send OTP'}</button>
          </div>
        )}

        {step === 'otp' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="number" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="000000" style={inputStyle} />
            <button onClick={() => void onVerifyOtp()} disabled={loading} style={buttonStyle}>{loading ? 'Verifying...' : 'Verify OTP'}</button>
            <button onClick={() => setStep('phone')} style={ghostButtonStyle}>Change Phone Number</button>
          </div>
        )}

        {step === 'name' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Name" style={inputStyle} />
            <button onClick={onSaveName} style={buttonStyle}>Next: Link Clinic</button>
          </div>
        )}

        {step === 'hospital' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="text" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Hospital Access Token" style={inputStyle} />
            <button onClick={() => void onSaveToken()} disabled={loading} style={buttonStyle}>{loading ? 'Linking...' : 'Connect to Clinic'}</button>
          </div>
        )}
        <div ref={recaptchaRef} />
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f9fafb', padding: 16 };
const cardStyle: React.CSSProperties = { background: '#fff', padding: 32, borderRadius: 24, boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', width: '100%', maxWidth: 400 };
const inputStyle: React.CSSProperties = { padding: '14px 16px', borderRadius: 14, border: '1px solid #e5e7eb', fontSize: 16, width: '100%', outline: 'none' };
const buttonStyle: React.CSSProperties = { padding: '14px 16px', borderRadius: 14, border: 'none', background: '#111827', color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer' };
const ghostButtonStyle: React.CSSProperties = { padding: '10px 16px', borderRadius: 14, border: '1px solid #e5e7eb', background: 'transparent', color: '#6b7280', fontSize: 14, cursor: 'pointer' };
const errorStyle: React.CSSProperties = { background: '#fee2e2', color: '#b91c1c', padding: '12px 16px', borderRadius: 12, marginBottom: 16, fontSize: 14, textAlign: 'center' };
