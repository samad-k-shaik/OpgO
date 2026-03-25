import React from 'react';
import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div style={{ padding: 16 }}>
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <h1 style={{ fontSize: '3rem', fontWeight: 800, margin: 0, color: '#111827' }}>OP go</h1>
      </div>
      <h2 style={{ marginTop: 0 }}>Phase 1 MVP</h2>
      <p style={{ color: '#374151' }}>
        Reception can create and update tokens, patients can track position (premium reminder events), and a TV display shows live serving/next tokens.
      </p>
      <p style={{ marginTop: 18, color: '#6b7280' }}>
        Ensure you set the <strong>hospital access token</strong> in the top bar.
      </p>
    </div>
  );
}

const primaryActionStyle: React.CSSProperties = {
  padding: '24px 40px',
  borderRadius: 20,
  background: '#111827',
  color: '#fff',
  textDecoration: 'none',
  fontSize: 20,
  fontWeight: 700,
  textAlign: 'center',
  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  width: '100%',
  maxWidth: 320,
};

const linkStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #e5e7eb',
  background: '#f9fafb',
  color: '#111827',
  textDecoration: 'none',
};

