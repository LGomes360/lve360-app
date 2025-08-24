'use client';
import { useState } from 'react';

export default function Results() {
  const [status, setStatus] = useState<'idle'|'working'|'done'|'error'>('idle');
  const [stack, setStack] = useState<any>(null);
  const [err, setErr] = useState<string>('');

  const generate = async () => {
    setStatus('working');
    setErr('');
    setStack(null);

    const r = await fetch('/api/generate-stack', { method: 'POST' });
    const j = await r.json().catch(()=>({}));
    if (!r.ok) {
      setStatus('error');
      setErr(j?.error || 'Error');
      return;
    }

    // Fetch the newest stack to show it
    const q = new URLSearchParams({ select: '*', order: 'created_at.desc', limit: '1' });
    const s = await fetch(`/api/stacks-latest?${q.toString()}`);
    const data = await s.json();
    setStack(data?.[0]?.stack || null);
    setStatus('done');
  };

  return (
    <main style={{maxWidth:800, margin:'40px auto', padding:'0 16px'}}>
      <h1>Your Personalized Stack (MVP)</h1>
      <button onClick={generate} style={{marginTop:16, padding:'8px 12px'}}>Generate My Stack</button>
      <div style={{marginTop:12}}>Status: {status}</div>
      {err && <div style={{color:'red', marginTop:12}}>{err}</div>}
      {stack && (
        <pre style={{marginTop:16, background:'#f6f8fa', padding:12}}>
{JSON.stringify(stack, null, 2)}
        </pre>
      )}
    </main>
  );
}
