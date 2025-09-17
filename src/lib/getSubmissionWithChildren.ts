// -----------------------------------------------------------------------------
// LVE360 // getSubmissionWithChildren.ts
// Fetches a single submission plus all child rows (supplements, medications,
// hormones) in one typed object. Service‑role key is used because this runs
// server‑side only. No secrets are ever returned to the client.
// -----------------------------------------------------------------------------


import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';


const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;


// Typed admin client (no session persistence)
const admin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
auth: { persistSession: false }
});


export type SubmissionWithChildren = Database['public']['Tables']['submissions']['Row'] & {
submission_supplements: Database['public']['Tables']['submission_supplements']['Row'][];
submission_medications: Database['public']['Tables']['submission_medications']['Row'][];
submission_hormones: Database['public']['Tables']['submission_hormones']['Row'][];
};


export async function getSubmissionWithChildren(id: string): Promise<SubmissionWithChildren> {
// ── 1. Grab the parent submission row ───────────────────────────────────────
const { data: submission, error } = await admin
.from('submissions')
.select('*')
.eq('id', id)
.single();


if (error || !submission) throw error ?? new Error('Submission not found');


// ── 2. Pull child tables in parallel ────────────────────────────────────────
const [supps, meds, hormones] = await Promise.all([
admin
.from('submission_supplements')
.select('*')
.eq('submission_id', id),
admin
.from('submission_medications')
.select('*')
.eq('submission_id', id),
admin
.from('submission_hormones')
.select('*')
.eq('submission_id', id)
]);


if (supps.error || meds.error || hormones.error)
throw supps.error ?? meds.error ?? hormones.error;


return {
...submission,
submission_supplements: supps.data ?? [],
submission_medications: meds.data ?? [],
submission_hormones: hormones.data ?? []
};
}
