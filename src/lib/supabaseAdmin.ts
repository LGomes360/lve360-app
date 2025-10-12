// lib/supabaseAdmin.ts
// Admin client with Service Role. Server-only, never import in client code.
import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Create ONE singleton client so callers can do: supabaseAdmin.from('table')...
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // DO NOT expose to browser
  { auth: { persistSession: false } }
);
