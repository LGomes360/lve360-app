// lib/supabaseAdmin.ts
// Admin client with Service Role. Server-only, never import in client code.
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const MISSING_ADMIN_ENV_ERROR =
  "Missing Supabase admin environment variables: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY";

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(MISSING_ADMIN_ENV_ERROR);
  }

  adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return adminClient;
}

// Build-safe compatibility wrapper for existing server-only imports. The real
// client is created only when a route or server function first uses it.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const client = getSupabaseAdmin();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
