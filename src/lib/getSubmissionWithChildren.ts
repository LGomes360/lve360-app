// src/lib/supabase.ts
// Centralized Supabase client exports for LVE360
// Exports:
//  - supabase       -> browser-safe (anon key)
//  - supabaseAdmin  -> server-only (service role key)
//
// Uses relative import for types to avoid path-alias resolution issues on CI.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Environment checks:
 * - In production we throw if required envs are missing (fail fast).
 * - In development we warn to preserve local dev ergonomics.
 */
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required."
    );
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      "⚠️ Missing Supabase public env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to avoid surprises."
    );
  }
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing Supabase env var: SUPABASE_SERVICE_ROLE_KEY is required in production.");
  } else {
    // eslint-disable-next-line no-console
    console.warn("⚠️ Missing SUPABASE_SERVICE_ROLE_KEY. Server-side admin operations will fail without it.");
  }
}

// Browser-safe client (typed)
export const supabase = createClient<Database>(
  SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY ?? "",
  {
    auth: { persistSession: true }
  }
);

// Server-only admin client (typed). Use only in server code / API routes.
export const supabaseAdmin = createClient<Database>(
  SUPABASE_URL ?? "",
  SUPABASE_SERVICE_ROLE_KEY ?? "",
  {
    auth: { persistSession: false }
  }
);

