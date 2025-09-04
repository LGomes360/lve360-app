'use client';

import { useEffect, useState } from 'react';

type TierResp = { email: string; tier: 'free' | 'premium'; stripe_subscription_status?: string | null };

export default function Results() {
  const [email, setEmail] = useState('');
  const [tier, setTier] = useState<'free' | 'premium' | 'checking'>('checking');
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [stack, setStack] = useState<any>(null);

  // Helper: save email locally so returning users don’t need to retype
  const remember = (e: string) => {
    const v = e.trim().toLowerCase();
    setEmail(v);
    if (v) localStorage.setItem('lve-email', v);
  };

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const fromQS = (p.get('email') || '').trim().toLowerCase();
    const fromLS = (localStorage.getItem('lve-email') || '').trim().toLowerCase();
    const chosen = fromQS || fromLS;
    if (chosen) {
      remember(chosen);
    } else {
      setTier('free'); // no email → treat as free until provided
      return;
    }

    const run = async () => {
      setTier('checking');
      const r = await fetch(`/api/users/tier?email=${encodeURIComponent(chosen)}`);
      const data = (await r.json()) as TierResp;
      setTier(data.tier ?? 'free');
    };
    run();
  }, []);

  const generate = async () => {
    setStatus('working');
    const res = await fetch('/api/generate-stack', { method: 'POST' });
    if (!res.ok) return setStatus('error');

    setStatus('done');
    // pull latest stack to display
    const r2 = await fetch('/api/stacks');
    if (r2.ok) setStack(await r2.json());
  };

  const Gate = () => {
    if (tier === 'checking') return <p className="mt-4 text-sm">Checking access…</p>;
    if (tier === 'premium') return null;

    // Free state
    return (
      <div className="mt-6 rounded border p-4 bg-yellow-50">
        <p className="font-medium">You’re on the free tier.</p>
        <p className="text-sm mt-1">
          Enter the email you used at checkout (or upgrade) to access your full personalized stack.
        </p>

        <div className="mt-3 flex gap-2">
          <input
            className="border px-3 py-2 w-72"
            placeholder="Your email"
            value={email}
            onChange={(e) => remember(e.target.value)}
          />
          <button
            className="px-3 py-2 rounded bg-black text-white"
            onClick={async () => {
              if (!email) return;
              const r = await fetch(`/api/users/tier?email=${encodeURIComponent(email)}`);
              const data = (await r.json()) as TierResp;
              setTier(data.tier ?? 'free');
            }}
          >
            Refresh access
          </button>
          <a
            className="px-3 py-2 rounded border"
            href={`/pricing${email ? `?email=${encodeURIComponent(email)}` : ''}`}
          >
            Upgrade to Premium
          </a>
        </div>

        <p className="text-xs mt-2 text-gray-600">
          Tip: if you just completed checkout, click “Refresh access”.
        </p>
      </div>
    );
  };

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold">Your Personalized Stack</h1>

      <Gate />

      {tier === 'premium' && (
        <>
          <p className="mt-2 text-sm text-gray-600">Welcome, premium member{email ? ` (${email})` : ''}.</p>

          <button
            onClick={generate}
            className="mt-6 rounded bg-black text-white px-4 py-2 disabled:opacity-50"
            disabled={status === 'working'}
          >
            {status === 'working' ? 'Generating…' : 'Generate My Stack'}
          </button>
          <div className="mt-2 text-sm">Status: {status}</div>

          {stack && (
            <pre className="mt-6 bg-gray-50 p-4 rounded overflow-auto text-sm">
{JSON.stringify(stack, null, 2)}
            </pre>
          )}
        </>
      )}
    </main>
  );
}
