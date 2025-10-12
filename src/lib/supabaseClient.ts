// lib/supabaseClient.ts
// Browser-only client (safe to import in client components)
// Creates a singleton so we don’t spawn multiple instances.
import { createBrowserClient } from '@supabase/ssr';

let _client:
  | ReturnType<typeof createBrowserClient>
  | null = null;

export function supabaseBrowser() {
  if (_client) return _client;
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return _client;
}
