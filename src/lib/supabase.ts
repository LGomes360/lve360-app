// lib/supabase.ts
// Server-side Supabase client (SSR pages, Server Components, Route Handlers).
// Reads/writes the auth cookies via Next’s headers API.
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// Re-export admin client so existing imports keep working
export { supabaseAdmin } from './supabaseAdmin';

export function supabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        // We intentionally NO-OP set/remove to avoid mutations in RSC.
        set() {},
        remove() {},
      },
    }
  );
}
