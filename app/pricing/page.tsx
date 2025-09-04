'use client';

import { useEffect, useState } from 'react';

export default function Pricing() {
  const [email, setEmail] = useState('');

  // pre-fill email from ?email=...
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get('email');
    if (e) setEmail(e);
  }, []);

  async function subscribe() {
    if (!email) {
      alert('Please enter your email');
      return;
    }

    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, plan: 'premium' }),
    });

    const data = await res.json();
    if (!res.ok || !data?.url) {
      alert(data?.error || 'Checkout error');
      return;
    }
    // Go to Stripe Checkout
    window.location.href = data.url;
  }

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
      <br />
      <button onClick={subscribe} style={{ marginTop: 16, padding: '10px 16px' }}>
        Subscribe
      </button>
    </main>
  );
}
