'use client';
import { useState } from 'react';

type Status = 'idle' | 'working' | 'done' | 'error';

export default function Results() {
  const [status, setStatus] = useState<Status>('idle');
  const [stack, setStack] = useState<any>(null);
  const [err, setErr] = useState<string>('');

  async function readLatestStack() {
    const q = new URLSearchParams({ select: '*', order: 'created_at.desc', limit: '1' });
    const res = await fetch(`/api/stacks-latest?${q.toString()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`read failed: ${res.status}`);
    const rows = await res.json();
    return rows?.[0]?.stack || null;
  }

  const generate = async () => {
    try {
      setStatus('working');
      setErr('');
      setStack(null);

      // create (or overwrite) a stack from latest submission
      const r = await fetch('/api/generate-stack', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'generate failed');

      // fetch and show newest stack
      const latest = await readLatestStack();
      setStack(latest);
      setStatus('done');
    } catch (e: any) {
      setStatus('error');
      setErr(e?.message || 'Unknown error');
    }
  };

  const showLatest = async () => {
    try {
      setStatus('working');
      setErr('');
      const latest = await readLatestStack();
      setStack(latest);
      setStatus('done');
    } catch (e: any) {
      setStatus('error');
      setErr(e?.message || 'Unknown error');
    }
  };

  return (
    <main style={{ maxWidth: 900, margin: '40px auto', padding: '0 16px' }}>
      <h1>Your Personalized Stack (MVP)</h1>
      <p>Click to create a placeholder stack from your latest submission, then display it.</p>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={generate}>Generate My Stack</button>
        <button onClick={showLatest}>Show Latest</button>
      </div>

      <div style={{ marginTop: 12 }}>Status: {status}</div>
      {err && <div style={{ color: 'red', marginTop: 12 }}>{err}</div>}

      {stack && (
        <pre style={{ marginTop: 16, background: '#f6f8fa', padding: 12, overflowX: 'auto' }}>
{JSON.stringify(stack, null, 2)}
        </pre>
      )}

      <div style={{ marginTop: 16 }}>
        <a href="/api/stacks-latest?select=*&order=created_at.desc&limit=1" target="_blank" rel="noreferrer">
          Open raw stack JSON
        </a>
      </div>
    </main>
  );
}
