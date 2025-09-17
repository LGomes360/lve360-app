// src/lib/supabaseAdmin.ts
// Shim: re-export the canonical supabaseAdmin from src/lib/supabase
// so all code can import from either module without causing duplicate initialization.

import { supabaseAdmin } from "./supabase";

export { supabaseAdmin };
export default supabaseAdmin;
