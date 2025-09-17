// src/lib/supabase.ts
// Centralized Supabase client exports for LVE360
// Named exports:
//   - supabase      -> browser-safe (anon key)
//   - supabaseAdmin -> server-only (service role key)
// Default export: { supabase, supabaseAdmin } for consumers using default import.
// Uses relative type import to avoid path-alias resolution problems in CI.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/**
 * Environment checks:
 * - In production we throw if required envs are missing (fail fast).
 * - In development we warn to preserve local dev ergonomics.
 */
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
  // Dev warnings (non-blocking)
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // eslint-disable-next-line no-console
    console.warn(
      "⚠️ Missing Supabase public env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to avoid surprises."
    );
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    // eslint-disable-next-line no-console
    console.warn("⚠️ Missing SUPABASE_SERVICE_ROLE_KEY. Server-side admin operations will fail without it.");
  }
}

// Browser-safe client (typed). Safe to import on client & server.
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true }
});

// Server-only admin client (typed). Use only in server code / API routes.
export const supabaseAdmin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

// Default-export convenience (some files may import default)
const defaultExport = { supabase, supabaseAdmin };
export default defaultExport;
