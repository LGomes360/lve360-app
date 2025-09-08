'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

interface StackItem {
  supplement_id: string;
  name: string;
  dose: string;
  link: string | null;
  notes: string | null;
}

export default function Results() {
  const [email, setEmail] = useState('');
  const [tier, setTier] = useState<'free' | 'premium' | null>(null);
  const [stack, setStack] = useState<StackItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Read email from query parameter or local storage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const e = params.get('email') || window.localStorage.getItem('userEmail') || '';
    setEmail(e);
  }, []);

  // Fetch user tier and the latest stack if premium
  useEffect(() => {
    async function fetchData() {
      if (!email) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        // 1) fetch user tier
        const tierResp = await fetch(`/api/users/tier?email=${encodeURIComponent(email)}`);
        const userTier = await tierResp.json() as { email: string; tier: 'free' | 'premium' };
        setTier(userTier.tier);

        // 2) if premium, load the latest stack
        if (userTier.tier === 'premium') {
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL as string,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
          );
          const { data: rows, error: supaError } = await supabase
            .from('stacks')
            .select(
              `id, created_at, items:stacks_items(
                supplement_id,
                dose,
                notes,
                supplement:supplements(ingredient, link, notes)
              )`
            )
            .eq('user_email', email)
            .order('created_at', { ascending: false })
            .limit(1);
          if (supaError) {
            throw supaError;
          }
          if (rows && rows.length > 0) {
            const latest = rows[0];
            const items: StackItem[] = latest.items.map((item: any) => ({
              supplement_id: item.supplement_id,
              name: item.supplement.ingredient,
              dose: item.dose,
              link: item.supplement.link,
              notes: item.supplement.notes ?? item.notes ?? null
            }));
            setStack(items);
          } else {
            setStack([]);
          }
        } else {
          setStack(null);
        }
      } catch (err: any) {
        setError(err.message || 'Unexpected error');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [email]);

  // Various states handling
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
          Tip: after checkout we add <code>?email=you@domain.com</code> to the link. Or{' '}
          <a href="/pricing">start at the pricing page</a>.
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

  if (tier && tier !== 'premium') {
    return (
      <main style={{ maxWidth: 700, margin: '40px auto', padding: '0 16px' }}>
        <h1>Your Personalized Stack</h1>
        <p>
          Hi <b>{email}</b>, your account is <b>Free</b>.<br />
          Upgrade to Premium to view your personalized stack.
        </p>
        <a
          href={`/pricing?email=${encodeURIComponent(email)}`}
          style={{ display: 'inline-block', marginTop: 12, padding: '10px 16px', background: '#111', color: '#fff', textDecoration: 'none' }}
        >
          Upgrade to Premium
        </a>
      </main>
    );
  }

  // Premium view
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Your Personalized Supplement Stack</h1>
      {!stack || stack.length === 0 ? (
        <p>No stack found yet.</p>
      ) : (
        <ul className="space-y-4">
          {stack.map((item) => (
            <li key={item.supplement_id} className="border rounded p-4">
              <h2 className="text-xl font-semibold">{item.name}</h2>
              <p className="mt-1">Dose: {item.dose}</p>
              {item.notes && <p className="mt-1 text-sm text-gray-600">{item.notes}</p>}
              {item.link && (
                <a
                  className="mt-2 inline-block text-blue-600 underline"
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Buy now
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
