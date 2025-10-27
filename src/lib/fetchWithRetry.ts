// src/lib/fetchWithRetry.ts
export async function fetchWithRetry(
  url: string,
  body: unknown,
  tries = 3,
  baseDelayMs = 500,
  timeoutMs = 15000
) {
  let delay = baseDelayMs;

  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = AbortSignal.timeout(timeoutMs);
      const res = await fetch(url, {
        method: "POST",
        signal: ctrl,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
        // If you’re on Next 14 app router and want to avoid caching:
        cache: "no-store",
      });

      if (res.ok) return await res.json();

      // Retry only on transient (5xx, 429) errors
      if ((res.status >= 500 || res.status === 429) && i < tries - 1) {
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 4000);
        continue;
      }

      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (i === tries - 1) throw err;
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 4000);
    }
  }

  // Should never hit
  throw new Error("Exhausted retries");
}
