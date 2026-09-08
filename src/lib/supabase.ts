// lib/supabase.ts
// Server-side Supabase client (SSR pages, Server Components, Route Handlers).
// Uses the same auth-cookie format as the rest of the current application.
import { cookies } from 'next/headers';
import {
  createRouteHandlerClient,
  createServerComponentClient,
} from '@supabase/auth-helpers-nextjs';

// Re-export the lazy admin getter and compatibility client for existing callers.
export { getSupabaseAdmin, supabaseAdmin } from './supabaseAdmin';

export function supabaseServer() {
  return createServerComponentClient({ cookies });
}

export function supabaseRoute() {
  return createRouteHandlerClient({ cookies });
}
