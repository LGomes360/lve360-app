// lib/supabase.ts
// Server-side Supabase client (SSR pages, Server Components, Route Handlers).
// Reads/writes the auth cookies via Next’s headers API.
import { cookies } from 'next/headers';
import { createServerClient, type SetAllCookies } from '@supabase/ssr';

// Re-export the lazy admin getter and compatibility client for existing callers.
export { getSupabaseAdmin, supabaseAdmin } from './supabaseAdmin';

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll: ((cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot always write cookies. The request proxy
            // is responsible for refreshing the session in that case.
          }
        }) satisfies SetAllCookies,
      },
    }
  );
}
