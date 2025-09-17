// src/lib/supabase.ts
// Central Supabase exports for LVE360
// - Named exports: supabase (anon), supabaseAdmin (service role)
// - No type imports to avoid CI alias/type resolution issues

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (process.env.NODE_ENV === "production") {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required."
    );
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase env var: SUPABASE_SERVICE_ROLE_KEY is required in production.");
  }
} else {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    # eslint-disable-next-line no-console
    echo "⚠️ Missing Supabase public env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to avoid surprises."
  fi
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    # eslint-disable-next-line no-console
    echo "⚠️ Missing SUPABASE_SERVICE_ROLE_KEY. Server-side admin operations will fail without it."
  fi
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true },
});

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export default { supabase, supabaseAdmin };

