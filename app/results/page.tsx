'use client';
import { useEffect, useState } from 'react';

export default function Results() {
  const [stack, setStack] = useState<any>(null);
  const [err, setErr] = useState<string>('');

  const generate = async () => {
    const r = await fetch('/api/generate-stack', { method:'POST' });
    const j = await r.json().catch(()=>({}));
    if (!r.ok) return setErr(j?.error || 'Error');
    // fetch latest stack
    const q = new URLSearchParams({ select: '*', order: 'created_at.desc', limit: '1' });
    const s = await fetch(`/api/stacks-latest?${q}`);
    const sj = await s.json();
    setStack(sj?.[0] || null);
  };

  return (
    <main style={{maxWidth:800, margin:'40px auto', padding:'0 16px'}}>
      <h1>Your Personalized Stack (MVP)</h1>
      <button onClick={generate} style={{marginTop:16, padding:'8px 12px'}}>Generate My Stack</button>
      {err && <div style={{color:'red', marginTop:12}}>{err}</div>}
      {stack && (
        <pre style={{marginTop:16, background:'#f6f8fa', padding:12}}>
{JSON.stringify(stack.stack, null, 2)}
        </pre>
      )}
    </main>
  );
}
