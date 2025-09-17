// -----------------------------------------------------------------------------
// LVE360 // supabaseClient
//
// Browser-safe Supabase client using the ANON key.
// Use this for client-side auth, queries, and inserts with row-level security.
// -----------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

// Required env vars
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("❌ Missing Supabase environment variables (URL or ANON_KEY).");
}

// Strongly typed, safe for browser + server
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // persist user session in localStorage
  },
});
