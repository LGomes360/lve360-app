'use client';
import { useState } from 'react';

export default function Results() {
  const [status, setStatus] = useState<'idle'|'working'|'done'|'error'>('idle');

  const generate = async () => {
    setStatus('working');
    const res = await fetch('/api/generate-stack', { method: 'POST' });
    setStatus(res.ok ? 'done' : 'error');
  };

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold">Your Personalized Stack (MVP)</h1>
      <p className="mt-2 text-sm text-gray-600">Click to create a placeholder stack from your latest submission.</p>
      <button onClick={generate} className="mt-6 rounded bg-black text-white px-4 py-2">
        Generate My Stack
      </button>
      <div className="mt-2 text-sm">Status: {status}</div>
    </main>
  );
}
