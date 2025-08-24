'use client';
import { useState } from 'react';

export default function Pricing() {
  const [email, setEmail] = useState('');

  const subscribe = async () => {
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const { url } = await res.json();
    window.location.href = url;
  };

  return (
    <main style={{maxWidth:600, margin:'40px auto', padding:'0 16px'}}>
      <h1>LVE360 Premium</h1>
      <p>$9/month • Unlock exact dosing, med spacing, and weekly tweaks.</p>

      <input
        type="email"
        placeholder="Your email"
        value={email}
        onChange={e=>setEmail(e.target.value)}
        style={{width:'100%', padding:8, marginTop:12}}
      />
      <button onClick={subscribe} style={{marginTop:16, padding:'10px 16px'}}>Subscribe</button>
    </main>
  );
}
