'use client';
import { useState, useEffect } from 'react';

export default function Pricing() {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string|undefined>(undefined);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get('email') || '';
    if (e) setEmail(e);
  }, []);

  const subscribe = async () => {
    setErr(undefined);
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok || !data?.url) {
        setErr(data?.error || 'Checkout failed.');
        return;
      }
      window.location.href = data.url; // redirect to Stripe
    } catch (e: any) {
      setErr(e?.message || 'Network error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: 600, margin: '40px auto', padding: '0 16px' }}>
      <h1>LVE360 Premium</h1>
      <p>$9/month • Unlock exact dosing, med spacing, and weekly tweaks.</p>

      <input
        type="email"
        placeholder="Your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: '100%', padding: 8, marginTop: 12 }}
      />

      <button onClick={subscribe} disabled={loading}
        style={{ marginTop: 16, padding: '10px 16px' }}>
        {loading ? 'Redirecting…' : 'Subscribe'}
      </button>

      {err && <div style={{ color: 'crimson', marginTop: 12 }}>{err}</div>}
    </main>
  );
}
