'use client';

import { useEffect, useMemo, useState } from 'react';

type UserTier = { email: string; tier: 'free' | 'premium'; stripe_subscription_status: string | null };
type StackRow = {
  id: string;
  user_email: string;
  created_at: string;
  stack: any;
};

export default function Results() {
  const [email, setEmail] = useState('');
  const [tier, setTier]   = useState<UserTier | null>(null);
  const [loading, setLoading] = useState(true);
  const [stack, setStack] = useState<StackRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  // read ?email=… from the URL (fallback to empty string)
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get('email') || '';
    setEmail(e);
  }, []);

  // fetch user tier, then latest stack if premium
  useEffect(() => {
    let active = true;
    async function go() {
      if (!email) { setLoading(false); return; }

      try {
        setLoading(true);
        setError(null);

        // 1) who is this user?
        const ut = await fetch(`/api/users/tier?email=${encodeURIComponent(email)}`);
        const userTier = (await ut.json()) as UserTier;

        if (!active) return;
        setTier(userTier);

        // 2) if premium, load their latest stack
        if (userTier.tier === 'premium') {
          const resp = await fetch('/api/stacks?limit=1'); // your existing route
          const rows = (await resp.json()) as StackRow[];  // expect an array
          if (!active) return;

          setStack(rows?.[0] || null);
        }
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || 'Unexpected error');
      } finally {
        if (active) setLoading(false);
      }
    }
    go();
    return () => { active = false; };
  }, [email]);

  const pricingUrl = useMemo(
    () => `/pricing?email=${encodeURIComponent(email || '')}`,
    [email]
  );

  if (loading) {
    return (
      <main style={{ maxWidth: 700, margin: '40px auto', padding: '0 16px' }}>
        <h1>Your Personalized Stack</h1>
        <p>Loading…</p>
      </main>
    );
  }

  if (!email) {
    return (
      <main style={{ maxWidth: 700, margin: '40px auto', padding: '0 16px' }}>
        <h1>Your Personalized Stack</h1>
        <p>We couldn’t find your email in the URL.</p>
        <p>
          Tip: after checkout we add <code>?email=you@domain.com</code> to the link.  
          Or <a href="/pricing">start at the pricing page</a>.
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ maxWidth: 700, margin: '40px auto', padding: '0 16px' }}>
        <h1>Your Personalized Stack</h1>
        <p style={{ color: 'crimson' }}>{error}</p>
      </main>
    );
  }

  if (tier && tier.tier !== 'premium') {
    return (
      <main style={{ maxWidth: 700, margin: '40px auto', padding: '0 16px' }}>
        <h1>Your Personalized Stack</h1>
        <p>
          Hi <b>{email}</b> — your account is <b>Free</b>.  
          Upgrade to Premium to view and update your personalized stack.
        </p>
        <a
          href={pricingUrl}
          style={{ display: 'inline-block', marginTop: 12, padding: '10px 16px', background: '#111', color: '#fff' }}
        >
          Upgrade to Premium
        </a>
      </main>
    );
  }

  // Premium view
  return (
    <main style={{ maxWidth: 900, margin: '40px auto', padding: '0 16px' }}>
      <h1>Your Personalized Stack</h1>
      <p>Signed in as <b>{email}</b> • <span style={{ color: 'green' }}>Premium</span></p>

      {!stack ? (
        <>
          <p>No stack found yet.</p>
          <form method="post" action="/api/generate-stack">
            <button type="submit" style={{ marginTop: 8, padding: '10px 16px' }}>
              Generate a placeholder stack
            </button>
          </form>
        </>
      ) : (
        <>
          <p style={{ marginTop: 16, opacity: 0.7 }}>
            Latest generated at {new Date(stack.created_at).toLocaleString()}
          </p>
          <pre
            style={{
              background: '#f7f8fa',
              padding: 16,
              borderRadius: 8,
              overflowX: 'auto',
              marginTop: 12,
            }}
          >
{JSON.stringify(stack.stack, null, 2)}
          </pre>
          <p style={{ marginTop: 12 }}>
            <a href="/api/stacks?limit=1" target="_blank" rel="noreferrer">Open raw stack JSON</a>
          </p>
        </>
      )}
    </main>
  );
}
