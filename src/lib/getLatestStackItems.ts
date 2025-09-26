// src/lib/getLatestStackItems.ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Returns latest stack items for the currently signed-in user.
 * Requires the caller to be authenticated so RLS (auth.uid()) works.
 */
export async function getLatestStackItems() {
  const { data, error } = await supabase.rpc("get_latest_stack_items");
  if (error) throw error;
  return data as Array<{
    stack_item_id: string;
    stack_id: string;
    name: string;
    dose: string | null;
    timing: string | null;
    rationale: string | null;
    citations: any | null;
    link_amazon: string | null;
    link_fullscript: string | null;
    created_at: string;
  }>;
}
